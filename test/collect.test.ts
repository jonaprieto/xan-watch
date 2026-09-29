import { expect, test } from "bun:test";
import { type Deps, tick } from "../src/collect";
import { type Config, parseConfig } from "../src/config";
import { hasBackfill, lastAlertTs, latestVesting, listErrors, marketSince, openDb } from "../src/db";
import { BACKFILL_URL, SNAPSHOT_URL } from "../src/coingecko";
import { WEI } from "../src/format";
import coin from "./fixtures/coin.json";
import chart from "./fixtures/chart.json";

const ADDR = "0x1111111111111111111111111111111111111111";
// Only unlock_ready can fire here: the fixture history drops ~6% (price_move threshold raised to 50%)
// and summary hour -1 never matches.
const cfg: Config = { ...parseConfig(`address = "${ADDR}"`, ":memory:"), alerts: { priceMovePct: 50, volumeSpikeX: 3, unlockReadyXan: 50_000, dailySummaryHour: -1 } };

function deps(over: Partial<Deps> = {}) {
  const sent: string[] = [];
  const logs: string[] = [];
  let t = 1_790_700_600;
  const d: Deps = {
    db: openDb(":memory:"),
    loadCfg: async () => cfg,
    fetchFn: async (url) => Response.json(url === SNAPSHOT_URL ? coin : chart),
    makeReader: () => async () => ({ principal: 16_000_000n * WEI, locked: 15_900_000n * WEI, unlockable: 60_000n * WEI, unlocked: 40_000n * WEI, balance: 16_000_000n * WEI }),
    notify: async (title) => { sent.push(title); },
    now: () => (t += 300),
    log: (l) => logs.push(l),
    ...over,
  };
  return { d, sent, logs };
}

test("first tick backfills, snapshots, reads vesting and alerts; second tick does not backfill again", async () => {
  const { d, sent } = deps();
  await tick(d);
  expect(hasBackfill(d.db)).toBe(true);
  const after1 = marketSince(d.db, 0);
  expect(after1.filter((r) => r.source === "backfill").length).toBe(3);
  expect(after1.filter((r) => r.source === "live").length).toBe(1);
  expect(latestVesting(d.db)?.unlockable).toBe(60_000n * WEI);
  expect(sent).toEqual(["60,000 XAN ready to unlock"]);
  expect(lastAlertTs(d.db, "unlock_ready")).not.toBeNull();

  await tick(d);
  const after2 = marketSince(d.db, 0);
  expect(after2.filter((r) => r.source === "backfill").length).toBe(3);
  expect(after2.filter((r) => r.source === "live").length).toBe(2);
  expect(sent).toEqual(["60,000 XAN ready to unlock"]); // cooldown
});

test("a CoinGecko outage still records vesting, reports the error, and never throws", async () => {
  const { d, logs } = deps({ fetchFn: async () => new Response("down", { status: 503 }) });
  await tick(d);
  expect(latestVesting(d.db)).not.toBeNull();
  expect(marketSince(d.db, 0)).toEqual([]);
  expect(listErrors(d.db).map((e) => [e.step, e.message])).toEqual([
    ["backfill", "coingecko: HTTP 503"],
    ["snapshot", "coingecko: HTTP 503"],
  ]);
  expect(logs.some((l) => l.includes("snapshot failed: coingecko: HTTP 503"))).toBe(true);
});

test("a failed backfill is retried and its error cleared on success", async () => {
  let fail = true;
  const { d } = deps({
    fetchFn: async (url) => (url === BACKFILL_URL && fail ? new Response("x", { status: 500 }) : Response.json(url === SNAPSHOT_URL ? coin : chart)),
  });
  await tick(d);
  expect(hasBackfill(d.db)).toBe(false);
  fail = false;
  await tick(d);
  expect(hasBackfill(d.db)).toBe(true);
  expect(listErrors(d.db)).toEqual([]);
});

test("a broken config is reported and the tick runs on defaults without vesting", async () => {
  const { d } = deps({ loadCfg: async () => { throw new Error("config: address must be a 0x address (40 hex characters)"); } });
  await tick(d);
  expect(marketSince(d.db, 0).length).toBe(4);
  expect(latestVesting(d.db)).toBeNull();
  expect(listErrors(d.db).map((e) => e.step)).toEqual(["config"]);
});

test("a failing RPC is reported and does not block market data", async () => {
  const { d } = deps({ makeReader: () => async () => { throw new Error("rpc timeout"); } });
  await tick(d);
  expect(marketSince(d.db, 0).length).toBe(4);
  expect(listErrors(d.db).map((e) => [e.step, e.message])).toEqual([["vesting", "rpc timeout"]]);
});
