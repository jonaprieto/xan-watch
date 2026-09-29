import {
  COINGECKO_URL,
  TOTAL_SUPPLY,
  VEST_DAYS,
  VEST_DURATION,
  VEST_START,
} from "./constants";
import type { MarketRow, Step, StepError, VestingRow } from "./db";
import { fromWei, num, pct, price, usd } from "./format";

export type Actions = {
  collect: string;
  editSettings: string;
  openLog: string;
  copy: string;
};
export type RenderInput = {
  latest: MarketRow | null;
  latestLive: MarketRow | null;
  history7d: MarketRow[];
  vesting: VestingRow | null;
  hasAddress: boolean;
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
function copyable(text: string, raw: number, a: Actions): string {
  return `${text} | ${MONO} bash=${a.copy} param1=${raw} terminal=false tooltip="Click to copy"`;
}

function footer(a: Actions): string[] {
  return [
    `Run collector now | bash=${a.collect} terminal=false refresh=true`,
    `Edit settings… | bash=${a.editSettings} terminal=false`,
    `Open log | bash=${a.openLog} terminal=false`,
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
      ...footer(i.actions),
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

  if (i.hasAddress) {
    out.push("---");
    if (!i.vesting) {
      out.push(`My vesting  waiting for first read | ${MUTED}`);
    } else {
      const v = i.vesting;
      const p = i.latest.price;
      const line = (label: string, wei: bigint) => {
        const x = fromWei(wei);
        return copyable(`  ${label.padEnd(10)}${num(x).padStart(12)}  ${usd(x * p).padStart(7)}`, x, a);
      };
      const elapsed = Math.min(Math.max(i.now - VEST_START, 0), VEST_DURATION);
      const day =
        i.now < VEST_START
          ? 0
          : Math.min(Math.floor(elapsed / 86_400) + 1, VEST_DAYS);
      out.push(
        copyable(`My vesting  ${num(fromWei(v.principal))} XAN`, fromWei(v.principal), a),
        line("locked", v.locked),
        line("ready", v.unlockable),
        line("spendable", v.unlocked),
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
    out.push(`Sentiment  ${parts.join(", ")} | ${MUTED}`);
  }
  if (live?.circulating != null)
    out.push(
      `Unlock supply today ~${num((TOTAL_SUPPLY - live.circulating) / VEST_DAYS / 1e6, 2)}M XAN (network estimate) | ${MUTED}`,
    );
  out.push(
    `Updated ${ago(i.now - i.latest.ts)} | ${MUTED}`,
    `Open CoinGecko ↗ | href=${COINGECKO_URL}`,
    "---",
    ...footer(i.actions),
  );
  return out.join("\n");
}
