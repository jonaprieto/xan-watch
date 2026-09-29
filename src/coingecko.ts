import type { MarketRow } from "./db";

export type FetchFn = (url: string) => Promise<Response>;

const BASE = "https://api.coingecko.com/api/v3";
export const SNAPSHOT_URL = `${BASE}/coins/anoma?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
export const BACKFILL_URL = `${BASE}/coins/anoma/market_chart?vs_currency=usd&days=30`;

export const httpFetch: FetchFn = (url) =>
  fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });

type Usd = { usd?: number | null } | undefined;
type CoinJson = {
  sentiment_votes_up_percentage?: number | null;
  watchlist_portfolio_users?: number | null;
  market_data?: {
    current_price?: Usd;
    market_cap?: Usd;
    fully_diluted_valuation?: Usd;
    total_volume?: Usd;
    price_change_percentage_24h?: number | null;
    price_change_percentage_7d?: number | null;
    circulating_supply?: number | null;
  };
};
type Series = [number, number][];
type ChartJson = {
  prices?: Series;
  market_caps?: Series;
  total_volumes?: Series;
};

export function parseSnapshot(json: unknown, ts: number): MarketRow {
  const c = (json ?? {}) as CoinJson;
  const md = c.market_data ?? {};
  const price = md.current_price?.usd;
  if (typeof price !== "number" || !(price > 0))
    throw new Error("coingecko: snapshot has no usd price");
  return {
    ts,
    price,
    marketCap: md.market_cap?.usd ?? null,
    fdv: md.fully_diluted_valuation?.usd ?? null,
    volume24h: md.total_volume?.usd ?? null,
    change24h: md.price_change_percentage_24h ?? null,
    change7d: md.price_change_percentage_7d ?? null,
    circulating: md.circulating_supply ?? null,
    sentimentUp: c.sentiment_votes_up_percentage ?? null,
    watchlist: c.watchlist_portfolio_users ?? null,
    source: "live",
  };
}

export function parseBackfill(json: unknown): MarketRow[] {
  const j = (json ?? {}) as ChartJson;
  if (!Array.isArray(j.prices))
    throw new Error("coingecko: market_chart has no prices");
  return j.prices.map(([ms, price], i) => ({
    ts: Math.floor(ms / 1000),
    price,
    marketCap: j.market_caps?.[i]?.[1] ?? null,
    fdv: null,
    volume24h: j.total_volumes?.[i]?.[1] ?? null,
    change24h: null,
    change7d: null,
    circulating: null,
    sentimentUp: null,
    watchlist: null,
    source: "backfill" as const,
  }));
}

async function getJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`coingecko: HTTP ${res.status}`);
  return res.json();
}

export async function fetchSnapshot(
  fetchFn: FetchFn,
  ts: number,
): Promise<MarketRow> {
  return parseSnapshot(await getJson(fetchFn, SNAPSHOT_URL), ts);
}

export async function fetchBackfill(fetchFn: FetchFn): Promise<MarketRow[]> {
  return parseBackfill(await getJson(fetchFn, BACKFILL_URL));
}
