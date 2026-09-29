import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type MarketRow,
  clearError,
  hasBackfill,
  insertAlert,
  insertMarket,
  insertVesting,
  lastAlertTs,
  latestLive,
  latestMarket,
  latestVesting,
  listErrors,
  marketSince,
  openDb,
  openReader,
  setError,
} from "../src/db";

const row = (
  ts: number,
  price: number,
  extra: Partial<MarketRow> = {},
): MarketRow => ({
  ts,
  price,
  marketCap: null,
  fdv: null,
  volume24h: null,
  change24h: null,
  change7d: null,
  circulating: null,
  sentimentUp: null,
  watchlist: null,
  source: "live",
  ...extra,
});

test("market rows round-trip, ascending, replace on same ts", () => {
  const db = openDb(":memory:");
  insertMarket(db, [row(200, 2, { fdv: 5, source: "backfill" }), row(100, 1)]);
  insertMarket(db, [row(200, 2.5, { source: "backfill" })]);
  expect(marketSince(db, 0).map((r) => [r.ts, r.price])).toEqual([
    [100, 1],
    [200, 2.5],
  ]);
  expect(marketSince(db, 150).length).toBe(1);
  expect(latestMarket(db)?.ts).toBe(200);
  expect(latestLive(db)?.ts).toBe(100);
  expect(hasBackfill(db)).toBe(true);
});

test("empty db", () => {
  const db = openDb(":memory:");
  expect(latestMarket(db)).toBeNull();
  expect(latestVesting(db)).toBeNull();
  expect(hasBackfill(db)).toBe(false);
  expect(lastAlertTs(db, "price_move")).toBeNull();
  expect(listErrors(db)).toEqual([]);
});

test("vesting keeps exact wei", () => {
  const db = openDb(":memory:");
  const big = 16_000_000_123_456_789_012_345_678n;
  insertVesting(db, {
    ts: 1,
    principal: big,
    locked: big - 1n,
    unlockable: 1n,
    unlocked: 0n,
    balance: big,
  });
  insertVesting(db, {
    ts: 2,
    principal: big,
    locked: big - 2n,
    unlockable: 2n,
    unlocked: 0n,
    balance: big,
  });
  expect(latestVesting(db)).toEqual({
    ts: 2,
    principal: big,
    locked: big - 2n,
    unlockable: 2n,
    unlocked: 0n,
    balance: big,
  });
});

test("alerts: last ts per kind", () => {
  const db = openDb(":memory:");
  insertAlert(db, { kind: "price_move", ts: 10, message: "a" });
  insertAlert(db, { kind: "price_move", ts: 30, message: "b" });
  insertAlert(db, { kind: "unlock_ready", ts: 20, message: "c" });
  expect(lastAlertTs(db, "price_move")).toBe(30);
  expect(lastAlertTs(db, "volume_spike")).toBeNull();
});

test("errors are set, replaced and cleared per step", () => {
  const db = openDb(":memory:");
  setError(db, { step: "snapshot", ts: 1, message: "HTTP 429" });
  setError(db, { step: "snapshot", ts: 2, message: "HTTP 500" });
  setError(db, { step: "vesting", ts: 3, message: "timeout" });
  expect(listErrors(db)).toEqual([
    { step: "snapshot", ts: 2, message: "HTTP 500" },
    { step: "vesting", ts: 3, message: "timeout" },
  ]);
  clearError(db, "snapshot");
  expect(listErrors(db).map((e) => e.step)).toEqual(["vesting"]);
});

test("a reader sees the writer's data on disk", () => {
  const path = join(mkdtempSync(join(tmpdir(), "xw-")), "sub", "x.db");
  const w = openDb(path);
  insertMarket(w, [row(1, 0.012)]);
  const r = openReader(path);
  expect(latestMarket(r)?.price).toBe(0.012);
  r.close();
  w.close();
});
