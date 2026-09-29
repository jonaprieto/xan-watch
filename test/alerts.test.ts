import { expect, test } from "bun:test";
import { type AlertInput, evaluateAlerts } from "../src/alerts";
import type { MarketRow, VestingRow } from "../src/db";
import { WEI } from "../src/format";

const H = 3600,
  D = 86400;
const cfg = {
  priceMovePct: 5,
  volumeSpikeX: 3,
  unlockReadyXan: 50_000,
  dailySummaryHour: 9,
};
// 2026-09-30 14:10 local time: not the summary hour.
const NOW = new Date(2026, 8, 30, 14, 10).getTime() / 1000;

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
const vest = (unlockableXan: bigint): VestingRow => ({
  ts: NOW,
  principal: 16_000_000n * WEI,
  locked: 15_000_000n * WEI,
  unlockable: unlockableXan * WEI,
  unlocked: 0n,
  balance: 16_000_000n * WEI,
});
const run = (over: Partial<AlertInput>) =>
  evaluateAlerts({
    history: [],
    vesting: null,
    cfg,
    lastSent: {},
    now: NOW,
    ...over,
  }).map((a) => a.kind);
const alert = (over: Partial<AlertInput>) =>
  evaluateAlerts({
    history: [],
    vesting: null,
    cfg,
    lastSent: {},
    now: NOW,
    ...over,
  });

test("price_move fires at or above the threshold, both directions", () => {
  expect(run({ history: [row(NOW - H, 1), row(NOW, 1.06)] })).toEqual([
    "price_move",
  ]);
  expect(run({ history: [row(NOW - H, 1), row(NOW, 0.94)] })).toEqual([
    "price_move",
  ]);
  expect(run({ history: [row(NOW - H, 1), row(NOW, 1.04)] })).toEqual([]);
  expect(alert({ history: [row(NOW - H, 1), row(NOW, 0.94)] })[0]!.title).toBe(
    "XAN down 6.0% in 1h",
  );
});

test("price_move needs an hour of history and respects its cooldown", () => {
  expect(run({ history: [row(NOW - 30 * 60, 1), row(NOW, 2)] })).toEqual([]);
  const history = [row(NOW - H, 1), row(NOW, 1.1)];
  expect(run({ history, lastSent: { price_move: NOW - 30 * 60 } })).toEqual([]);
  expect(run({ history, lastSent: { price_move: NOW - H } })).toEqual([
    "price_move",
  ]);
});

test("price_move compares with the newest row at least an hour old", () => {
  const history = [
    row(NOW - 2 * H, 2),
    row(NOW - H, 1),
    row(NOW - 30 * 60, 1.5),
    row(NOW, 1.04),
  ];
  expect(run({ history })).toEqual([]);
});

test("price_move ignores a reference older than 2 hours (data gap)", () => {
  expect(run({ history: [row(NOW - 8 * H, 1), row(NOW, 1.1)] })).toEqual([]);
  expect(run({ history: [row(NOW - 2 * H, 1), row(NOW, 1.1)] })).toEqual([
    "price_move",
  ]);
});

function weekOfVolume(latest: number): MarketRow[] {
  const rows: MarketRow[] = [];
  for (let t = NOW - 8 * D; t < NOW; t += H)
    rows.push(row(t, 1, { volume24h: 1_000_000 }));
  rows.push(row(NOW, 1, { volume24h: latest }));
  return rows;
}

test("volume_spike fires at 3x the prior week's mean", () => {
  expect(run({ history: weekOfVolume(3_000_000) })).toEqual(["volume_spike"]);
  expect(run({ history: weekOfVolume(2_900_000) })).toEqual([]);
  expect(
    run({
      history: weekOfVolume(3_000_000),
      lastSent: { volume_spike: NOW - 6 * H },
    }),
  ).toEqual([]);
  expect(alert({ history: weekOfVolume(3_000_000) })[0]!.title).toBe(
    "XAN volume 3.0x its 7-day average",
  );
});

test("volume_spike needs a week of history", () => {
  const short = weekOfVolume(9_000_000).filter((r) => r.ts >= NOW - 3 * D);
  expect(run({ history: short })).toEqual([]);
});

test("unlock_ready fires at the threshold with a 24h cooldown", () => {
  expect(run({ vesting: vest(50_000n) })).toEqual(["unlock_ready"]);
  expect(run({ vesting: vest(49_999n) })).toEqual([]);
  expect(
    run({ vesting: vest(60_000n), lastSent: { unlock_ready: NOW - 12 * H } }),
  ).toEqual([]);
  expect(alert({ vesting: vest(60_000n) })[0]!.title).toBe(
    "60,000 XAN ready to unlock",
  );
});

test("daily_summary fires once in the configured local hour", () => {
  const at9 = new Date(2026, 8, 30, 9, 10).getTime() / 1000;
  const history = [
    row(at9 - H, 0.012, { change24h: 1.23, circulating: 2_500_000_000 }),
  ];
  expect(run({ now: at9, history })).toEqual(["daily_summary"]);
  expect(
    run({ now: at9, history, lastSent: { daily_summary: at9 - 5 * 60 } }),
  ).toEqual([]);
  expect(
    run({ now: at9, history, lastSent: { daily_summary: at9 - D } }),
  ).toEqual(["daily_summary"]);
  expect(run({ now: at9 + H, history })).toEqual([]);
  const [a] = alert({ now: at9, history, vesting: vest(10_000n) });
  expect(a!.message).toBe(
    "$0.01200 (+1.2% 24h), your vested 10,000 XAN = $120, unlock supply ~6.85M XAN/day",
  );
});

test("no data, no alerts", () => {
  expect(run({})).toEqual([]);
});
