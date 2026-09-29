import { expect, test } from "bun:test";
import {
  BACKFILL_URL,
  SNAPSHOT_URL,
  fetchBackfill,
  fetchSnapshot,
  parseBackfill,
  parseSnapshot,
} from "../src/coingecko";
import coin from "./fixtures/coin.json";
import chart from "./fixtures/chart.json";

test("snapshot parses into a live row", () => {
  expect(parseSnapshot(coin, 1790700600)).toEqual({
    ts: 1790700600,
    price: 0.01209504,
    marketCap: 30237691,
    fdv: 120950765,
    volume24h: 2139257,
    change24h: -0.28982,
    change7d: -2.5442,
    circulating: 2_500_000_000,
    sentimentUp: 100,
    watchlist: 2409,
    source: "live",
  });
});

test("snapshot without a price is rejected", () => {
  expect(() => parseSnapshot({ market_data: {} }, 1)).toThrow(/price/);
  expect(() => parseSnapshot(null, 1)).toThrow(/price/);
});

test("backfill zips prices, caps and volumes by index", () => {
  const rows = parseBackfill(chart);
  expect(rows.length).toBe(3);
  expect(rows[0]).toEqual({
    ts: 1788109200,
    price: 0.012966530993789251,
    marketCap: 32416327.484473128,
    fdv: null,
    volume24h: 3547583.912140719,
    change24h: null,
    change7d: null,
    circulating: null,
    sentimentUp: null,
    watchlist: null,
    source: "backfill",
  });
  expect(rows[2]!.ts).toBe(1790700560);
  expect(() => parseBackfill({})).toThrow(/prices/);
});

test("fetchers call the right URLs and surface HTTP errors", async () => {
  const seen: string[] = [];
  const ok = async (url: string) => {
    seen.push(url);
    return Response.json(url === SNAPSHOT_URL ? coin : chart);
  };
  expect((await fetchSnapshot(ok, 5)).price).toBe(0.01209504);
  expect((await fetchBackfill(ok)).length).toBe(3);
  expect(seen).toEqual([SNAPSHOT_URL, BACKFILL_URL]);
  const limited = async () => new Response("slow down", { status: 429 });
  await expect(fetchSnapshot(limited, 5)).rejects.toThrow(
    "coingecko: HTTP 429",
  );
});
