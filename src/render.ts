import {
  COINGECKO_URL,
  EXPLORER_URL,
  VESTING_SPEC_URL,
  TOTAL_SUPPLY,
  VEST_DAYS,
  VEST_DURATION,
  VEST_START,
} from "./constants";
import type { Settings } from "./config";
import type { MarketRow, Step, StepError, VestingRow } from "./db";
import { fromWei, num, pct, price, usd } from "./format";

export type Actions = {
  collect: string;
  set: string;
  openLog: string;
  copy: string;
};
export type RenderInput = {
  latest: MarketRow | null;
  latestLive: MarketRow | null;
  history7d: MarketRow[];
  vesting: VestingRow | null;
  /** Parsed settings, or null when the settings file is invalid. */
  settings: Settings | null;
  errors: StepError[];
  now: number;
  actions: Actions;
};

export const STALE_S = 900;

/** SwiftBar treats `|` as the parameter separator and newlines as new items: keep messages on one safe line. */
export function oneLine(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
const MONO = "font=Menlo size=12";
const GREEN = "#2e9e44";
const RED = "#d0413e";
const AMBER = "#d4a017";
// SwiftBar draws items with no action and no color as disabled (grey). Secondary lines get an explicit
// readable muted color (light, dark) so they stay enabled but quieter than values.
const MUTED = "color=#6e6e73,#98989d";
const BLOCKS = "▁▂▃▄▅▆▇█";
const STEP_LABEL: Record<Step, string> = {
  config: "Settings",
  backfill: "CoinGecko history",
  snapshot: "CoinGecko",
  vesting: "Ethereum RPC",
  alerts: "Alerts",
};

export function sparkline(
  points: { ts: number; price: number }[],
  from: number,
  to: number,
  width = 16,
): string {
  const inWindow = points.filter((p) => p.ts >= from && p.ts <= to);
  if (inWindow.length === 0) return "";
  const sums = new Array<number>(width).fill(0);
  const counts = new Array<number>(width).fill(0);
  for (const p of inWindow) {
    const b = Math.min(
      width - 1,
      Math.floor(((p.ts - from) * width) / (to - from)),
    );
    sums[b]! += p.price;
    counts[b]! += 1;
  }
  const firstFilled = counts.findIndex((c) => c > 0);
  let prev = sums[firstFilled]! / counts[firstFilled]!;
  const buckets = sums.map((sum, b) => {
    if (counts[b]! > 0) prev = sum / counts[b]!;
    return prev;
  });
  const lo = Math.min(...buckets);
  const hi = Math.max(...buckets);
  return buckets
    .map((v) => BLOCKS[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)])
    .join("");
}

function ago(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

/** A value line: monospace, and clicking copies `raw` (a plain number) to the clipboard. */
function copyable(text: string, raw: number | string, a: Actions): string {
  return `${text} | ${MONO} bash=${a.copy} param1=${raw} terminal=false tooltip="Click to copy"`;
}

function setAction(a: Actions, key: string, value: string | number): string {
  return `bash=${a.set} param1=${key} param2=${value} terminal=false refresh=true`;
}

/** One submenu of preset choices; the current value is checked and kept even if it is not a preset. */
function choices(
  title: string,
  key: string,
  current: number,
  presets: number[],
  label: (v: number) => string,
  a: Actions,
): string[] {
  const values = [...new Set([...presets, current])].sort((x, y) => x - y);
  return [
    `--${title}  ${label(current)}`,
    ...values.map((v) => `----${label(v)} | ${setAction(a, key, v)}${v === current ? " checked=true" : ""}`),
  ];
}

function settingsMenu(s: Settings | null, a: Actions): string[] {
  if (!s)
    return [
      "Settings",
      `--Settings file is invalid | color=${AMBER}`,
      `--Reset settings to defaults | ${setAction(a, "reset", "all")}`,
    ];
  const addr = s.address;
  return [
    "Settings",
    addr
      ? copyable(`--Address  ${addr.slice(0, 6)}…${addr.slice(-4)}`, addr, a)
      : `--Address  not set | ${MUTED}`,
    `--Set address from clipboard | ${setAction(a, "address", "clipboard")}`,
    ...(addr ? [`--Remove address | ${setAction(a, "address", "none")}`] : []),
    "-----",
    ...choices("Price move alert", "price_move_pct", s.alerts.priceMovePct, [3, 5, 10, 15], (v) => `${v}%`, a),
    ...choices("Volume spike alert", "volume_spike_x", s.alerts.volumeSpikeX, [2, 3, 5], (v) => `${v}x`, a),
    ...choices("Unlock ready alert", "unlock_ready_xan", s.alerts.unlockReadyXan, [10_000, 50_000, 100_000, 500_000], (v) => `${num(v)} XAN`, a),
    ...choices("Daily summary", "daily_summary_hour", s.alerts.dailySummaryHour, [7, 8, 9, 12, 18, 21], (v) => `${String(v).padStart(2, "0")}:00`, a),
    "-----",
    `--Reset settings to defaults | ${setAction(a, "reset", "all")}`,
  ];
}

function footer(a: Actions, settings?: Settings | null): string[] {
  return [
    `Refresh now | bash=${a.collect} terminal=false refresh=true`,
    `Anoma Explorer ↗ | href=${EXPLORER_URL}`,
    ...(settings === undefined ? [] : settingsMenu(settings, a)),
    `Open log | bash=${a.openLog} terminal=false`,
    "---",
    // ponytail: quits SwiftBar itself (and any other plugins); the collector keeps running for alerts.
    "Quit | bash=/usr/bin/killall param1=SwiftBar terminal=false",
  ];
}

export function renderFailure(message: string, actions: Actions): string {
  return [
    `XAN ⚠ | color=${RED}`,
    "---",
    oneLine(message),
    "---",
    ...footer(actions),
  ].join("\n");
}

export function render(i: RenderInput): string {
  const errors = i.errors.map(
    (e) =>
      `⚠ ${STEP_LABEL[e.step]}: ${oneLine(e.message.replace(/^(coingecko|config): /, ""))} (${ago(i.now - e.ts)}) | color=${AMBER}`,
  );
  if (!i.latest) {
    return [
      "XAN … | color=gray",
      "---",
      ...errors,
      `No data yet. The first collection takes a few seconds. | ${MUTED}`,
      "---",
      ...footer(i.actions, i.settings),
    ].join("\n");
  }

  const live = i.latestLive;
  const stale = i.now - i.latest.ts > STALE_S;
  const change = live?.change24h ?? null;
  const arrow =
    change === null
      ? ""
      : ` ${change >= 0 ? "▲" : "▼"}${Math.abs(change).toFixed(1)}%`;
  const color = stale
    ? AMBER
    : change === null
      ? null
      : change >= 0
        ? GREEN
        : RED;
  const out = [
    `XAN ${price(i.latest.price)}${arrow}${stale ? " stale" : ""}${color ? ` | color=${color}` : ""}`,
    "---",
  ];

  out.push(...errors);
  const a = i.actions;
  out.push(copyable(`Price     ${price(i.latest.price)}`, i.latest.price, a));
  if (live?.marketCap != null)
    out.push(
      copyable(
        `Mkt cap   ${usd(live.marketCap)}${live.fdv != null ? `   FDV ${usd(live.fdv)}` : ""}`,
        live.marketCap,
        a,
      ),
    );
  if (live?.volume24h != null)
    out.push(copyable(`Vol 24h   ${usd(live.volume24h)}`, live.volume24h, a));
  const spark = sparkline(
    i.history7d.map((r) => ({ ts: r.ts, price: r.price })),
    i.now - 7 * 86_400,
    i.now,
  );
  if (spark) {
    const c7 = live?.change7d ?? null;
    const trend = c7 === null ? MUTED : `color=${c7 >= 0 ? GREEN : RED}`;
    out.push(`7d  ${spark}${c7 !== null ? `  ${pct(c7)}` : ""} | ${MONO} ${trend} href=${COINGECKO_URL}`);
  }

  if (i.settings?.address) {
    out.push("---");
    if (!i.vesting) {
      out.push(`My vesting  waiting for first read | ${MUTED}`);
    } else {
      const v = i.vesting;
      const p = i.latest.price;
      const line = (label: string, wei: bigint) => {
        const x = fromWei(wei);
        return copyable(`  ${label.padEnd(16)}${num(x).padStart(12)}  ${usd(x * p).padStart(7)}`, x, a);
      };
      const elapsed = Math.min(Math.max(i.now - VEST_START, 0), VEST_DURATION);
      const day =
        i.now < VEST_START
          ? 0
          : Math.min(Math.floor(elapsed / 86_400) + 1, VEST_DAYS);
      out.push(
        `My vesting | ${MUTED}`,
        line("allocation", v.principal),
        line("still locked", v.locked),
        line("ready to unlock", v.unlockable),
        line("spendable", v.unlocked),
        line("total balance", v.balance),
        `  vested ${((elapsed / VEST_DURATION) * 100).toFixed(1)}%, day ${day} of ${VEST_DAYS} | ${MONO} ${MUTED}`,
      );
    }
  }

  out.push("---");
  if (live && (live.sentimentUp !== null || live.watchlist !== null)) {
    const parts = [];
    if (live.sentimentUp !== null)
      parts.push(`${num(live.sentimentUp)}% up votes`);
    if (live.watchlist !== null)
      parts.push(`${num(live.watchlist)} watchlists`);
    out.push(`Sentiment  ${parts.join(", ")} | ${MUTED} href=${COINGECKO_URL}`);
  }
  if (live?.circulating != null)
    out.push(
      `Unlock supply today ~${num((TOTAL_SUPPLY - live.circulating) / VEST_DAYS / 1e6, 2)}M XAN (network estimate) | ${MUTED} href=${VESTING_SPEC_URL}`,
    );
  out.push(
    `Updated ${ago(i.now - i.latest.ts)} | ${MUTED}`,
    "---",
    ...footer(i.actions, i.settings),
  );
  return out.join("\n");
}
