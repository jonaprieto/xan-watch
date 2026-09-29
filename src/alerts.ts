import type { AlertConfig } from "./config";
import { TOTAL_SUPPLY, VEST_DAYS } from "./constants";
import type { AlertKind, MarketRow, VestingRow } from "./db";
import { WEI, fromWei, num, pct, price, usd } from "./format";

export type Alert = { kind: AlertKind; title: string; message: string };
export type AlertInput = {
  history: MarketRow[];
  vesting: VestingRow | null;
  cfg: AlertConfig;
  lastSent: Partial<Record<AlertKind, number>>;
  now: number;
};

const HOUR = 3600;
const DAY = 86_400;
export const HISTORY_WINDOW = 8 * DAY + HOUR;
const COOLDOWN = {
  price_move: HOUR,
  volume_spike: 12 * HOUR,
  unlock_ready: DAY,
} as const;

function cooling(i: AlertInput, kind: keyof typeof COOLDOWN): boolean {
  const last = i.lastSent[kind];
  return last !== undefined && i.now - last < COOLDOWN[kind];
}

export function localDay(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function priceMove(i: AlertInput): Alert | null {
  const latest = i.history.at(-1);
  if (!latest || cooling(i, "price_move")) return null;
  const ref = i.history.findLast(
    (r) => r.ts <= latest.ts - HOUR && r.ts >= latest.ts - 2 * HOUR,
  );
  if (!ref) return null;
  const change = ((latest.price - ref.price) / ref.price) * 100;
  if (Math.abs(change) < i.cfg.priceMovePct) return null;
  return {
    kind: "price_move",
    title: `XAN ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% in 1h`,
    message: `${price(ref.price)} to ${price(latest.price)}`,
  };
}

function volumeSpike(i: AlertInput): Alert | null {
  const latest = i.history.at(-1);
  if (!latest || latest.volume24h === null || cooling(i, "volume_spike"))
    return null;
  const prior = i.history.filter(
    (r) =>
      r.volume24h !== null &&
      r.ts >= latest.ts - 8 * DAY &&
      r.ts < latest.ts - DAY,
  );
  // Need rows reaching back at least 7 days, or the "average" is not a week's average.
  if (prior.length === 0 || prior[0]!.ts > latest.ts - 7 * DAY) return null;
  const mean = prior.reduce((s, r) => s + r.volume24h!, 0) / prior.length;
  const x = latest.volume24h / mean;
  if (x < i.cfg.volumeSpikeX) return null;
  return {
    kind: "volume_spike",
    title: `XAN volume ${x.toFixed(1)}x its 7-day average`,
    message: `24h volume ${usd(latest.volume24h)}, average ${usd(mean)}`,
  };
}

function unlockReady(i: AlertInput): Alert | null {
  if (!i.vesting || cooling(i, "unlock_ready")) return null;
  if (i.vesting.unlockable < BigInt(Math.round(i.cfg.unlockReadyXan)) * WEI)
    return null;
  return {
    kind: "unlock_ready",
    title: `${num(fromWei(i.vesting.unlockable))} XAN ready to unlock`,
    message: "Run xan.sh unlock to make it spendable",
  };
}

function dailySummary(i: AlertInput): Alert | null {
  if (new Date(i.now * 1000).getHours() !== i.cfg.dailySummaryHour) return null;
  const last = i.lastSent.daily_summary;
  if (last !== undefined && localDay(last) === localDay(i.now)) return null;
  const latest = i.history.at(-1);
  if (!latest) return null;
  const live = i.history.findLast((r) => r.source === "live");
  const parts = [
    `${price(latest.price)}${live?.change24h != null ? ` (${pct(live.change24h)} 24h)` : ""}`,
  ];
  if (i.vesting) {
    const vested = fromWei(i.vesting.unlocked + i.vesting.unlockable);
    parts.push(
      `your vested ${num(vested)} XAN = ${usd(vested * latest.price)}`,
    );
  }
  if (live?.circulating != null)
    parts.push(
      `unlock supply ~${num((TOTAL_SUPPLY - live.circulating) / VEST_DAYS / 1e6, 2)}M XAN/day`,
    );
  return {
    kind: "daily_summary",
    title: "XAN daily summary",
    message: parts.join(", "),
  };
}

export function evaluateAlerts(i: AlertInput): Alert[] {
  return [priceMove(i), volumeSpike(i), unlockReady(i), dailySummary(i)].filter(
    (a): a is Alert => a !== null,
  );
}
