import { expect, test } from "bun:test";
import type { MarketRow, VestingRow } from "../src/db";
import { WEI } from "../src/format";
import {
  type RenderInput,
  oneLine,
  render,
  renderFailure,
  sparkline,
} from "../src/render";

const NOW = 1_790_760_000; // 21.3 h after vesting start: day 1, 0.1% vested
const actions = {
  collect: "/r/bin/collect-once",
  editSettings: "/r/bin/edit-settings",
  openLog: "/r/bin/open-log",
  copy: "/r/bin/copy",
};
const MONO = "font=Menlo size=12";
const copy = (raw: string) => `bash=/r/bin/copy param1=${raw} terminal=false tooltip="Click to copy"`;
const MUTED = "color=#6e6e73,#98989d";
const live = (extra: Partial<MarketRow> = {}): MarketRow => ({
  ts: NOW - 120,
  price: 0.01222,
  marketCap: 30_237_691,
  fdv: 120_950_765,
  volume24h: 2_139_257,
  change24h: 0.69,
  change7d: -1.4,
  circulating: 2_500_000_000,
  sentimentUp: 100,
  watchlist: 2409,
  source: "live",
  ...extra,
});
const vesting: VestingRow = {
  ts: NOW,
  principal: 16_000_000n * WEI,
  locked: 15_985_388n * WEI,
  unlockable: 14_612n * WEI,
  unlocked: 0n,
  balance: 16_000_000n * WEI,
};
const input = (over: Partial<RenderInput> = {}): RenderInput => {
  const l = over.latestLive === undefined ? live() : over.latestLive;
  return {
    latest: l,
    latestLive: l,
    history7d: [],
    vesting: null,
    hasAddress: false,
    errors: [],
    now: NOW,
    actions,
    ...over,
  };
};
const lines = (s: string) => s.split("\n");

test("title shows price and a green up arrow", () => {
  expect(lines(render(input()))[0]).toBe("XAN $0.01222 ▲0.7% | color=#2e9e44");
  expect(lines(render(input()))[1]).toBe("---");
});

test("title shows a red down arrow", () => {
  expect(
    lines(render(input({ latestLive: live({ change24h: -1.4 }) })))[0],
  ).toBe("XAN $0.01222 ▼1.4% | color=#d0413e");
});

test("stale data is marked after 15 minutes", () => {
  expect(
    lines(render(input({ latestLive: live({ ts: NOW - 16 * 60 }) })))[0],
  ).toBe("XAN $0.01222 ▲0.7% stale | color=#d4a017");
  expect(
    lines(render(input({ latestLive: live({ ts: NOW - 14 * 60 }) })))[0],
  ).not.toContain("stale");
});

test("market lines are formatted", () => {
  const out = render(input());
  expect(out).toContain(`Price     $0.01222 | ${MONO} ${copy("0.01222")}`);
  expect(out).toContain(`Mkt cap   $30.24M   FDV $121.0M | ${MONO} ${copy("30237691")}`);
  expect(out).toContain(`Vol 24h   $2.139M | ${MONO} ${copy("2139257")}`);
  expect(out).toContain(`Sentiment  100% up votes, 2,409 watchlists | ${MUTED} href=https://www.coingecko.com/en/coins/anoma`);
  expect(out).toContain(`Unlock supply today ~6.85M XAN (network estimate) | ${MUTED} href=https://github.com/anoma/token/blob/main/docs/01-XanV2-upgrade.md`);
  expect(out).toContain(`Updated 2 min ago | ${MUTED}`);
  expect(out).not.toContain("Open CoinGecko");
  expect(out).toContain("Anoma Explorer ↗ | href=https://explorer.anoma.net");
  expect(out).toContain(
    "Refresh now | bash=/r/bin/collect-once terminal=false refresh=true",
  );
  expect(out).toContain(
    "Edit settings… | bash=/r/bin/edit-settings terminal=false",
  );
  expect(out).toContain("Open log | bash=/r/bin/open-log terminal=false");
});

test("vesting block only with an address", () => {
  expect(render(input({ vesting }))).not.toContain("My vesting");
  const out = render(input({ vesting, hasAddress: true }));
  expect(out).toContain(`My vesting  16,000,000 XAN | ${MONO} ${copy("16000000")}`);
  expect(out).toContain(`  locked      15,985,388  $195.3k | ${MONO} ${copy("15985388")}`);
  expect(out).toContain(`  ready           14,612     $179 | ${MONO} ${copy("14612")}`);
  expect(out).toContain(`  vested 0.1%, day 1 of 1095 | ${MONO} ${MUTED}`);
});

test("address set but no vesting row yet says so", () => {
  expect(render(input({ hasAddress: true }))).toContain(
    `My vesting  waiting for first read | ${MUTED}`,
  );
});

test("errors are shown in plain words", () => {
  const out = render(
    input({
      errors: [
        { step: "snapshot", ts: NOW - 12 * 60, message: "coingecko: HTTP 429" },
        { step: "vesting", ts: NOW - 60, message: "rpc timeout" },
      ],
    }),
  );
  expect(out).toContain(
    "⚠ CoinGecko: HTTP 429 (12 min ago) | color=#d4a017",
  );
  expect(out).toContain(
    "⚠ Ethereum RPC: rpc timeout (1 min ago) | color=#d4a017",
  );
});

test("config errors lose their redundant prefix", () => {
  const out = render(
    input({
      errors: [{ step: "config", ts: NOW - 60, message: "config: bad address" }],
    }),
  );
  expect(out).toContain("⚠ Settings: bad address (1 min ago) | color=#d4a017");
});

test("no data yet", () => {
  const out = render(input({ latestLive: null }));
  expect(lines(out)[0]).toBe("XAN … | color=gray");
  expect(out).toContain(
    `No data yet. The first collection takes a few seconds. | ${MUTED}`,
  );
  expect(out).toContain(
    "Refresh now | bash=/r/bin/collect-once terminal=false refresh=true",
  );
});

test("failure screen", () => {
  const out = renderFailure(
    "config: address must be a 0x address (40 hex characters)",
    actions,
  );
  expect(lines(out)[0]).toBe("XAN ⚠ | color=#d0413e");
  expect(out).toContain(
    "config: address must be a 0x address (40 hex characters)",
  );
  expect(out).toContain(
    "Edit settings… | bash=/r/bin/edit-settings terminal=false",
  );
});

const W = 7 * 86_400;
const pts = (n: number, f: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ ts: (i * W) / n, price: f(i) }));

test("sparkline", () => {
  const s = sparkline(pts(168, (i) => i), 0, W);
  expect([...s].length).toBe(16);
  expect(s.startsWith("▁")).toBe(true);
  expect(s.endsWith("█")).toBe(true);
  expect(sparkline(pts(3, () => 2), 0, W)).toBe("▄".repeat(16));
  expect(sparkline([], 0, W)).toBe("");
});

test("sparkline buckets by time, so dense recent rows do not dominate", () => {
  const hourly = Array.from({ length: 144 }, (_, i) => ({
    ts: i * 3600,
    price: 1 + i / 143,
  }));
  const recent = Array.from({ length: 288 }, (_, i) => ({
    ts: 6 * 86_400 + i * 300,
    price: 2,
  }));
  const s = [...sparkline([...hourly, ...recent], 0, W)];
  expect(s[0]).toBe("▁");
  expect(s[8]).not.toBe("█");
});

test("sparkline carries values across empty buckets", () => {
  const s = [...sparkline([{ ts: W / 2, price: 1 }, { ts: W - 1, price: 2 }], 0, W)];
  expect(s.length).toBe(16);
  expect(s[0]).toBe(s[8]);
  expect(s[0]).toBe("▁");
  expect(s[15]).toBe("█");
});

test("7d line uses history and the live 7d change", () => {
  const history7d = Array.from({ length: 168 }, (_, i) =>
    live({ ts: NOW - (168 - i) * 3600, price: 0.01 + i / 1e5 }),
  );
  expect(render(input({ history7d }))).toMatch(
    /^7d  [▁-█]{16}  -1\.4% \| font=Menlo size=12 color=#d0413e href=https:\/\/www\.coingecko\.com\/en\/coins\/anoma$/m,
  );
  expect(render(input({ history7d, latestLive: live({ change7d: 2.1 }) }))).toMatch(
    /^7d  [▁-█]{16}  \+2\.1% \| font=Menlo size=12 color=#2e9e44 href=https:\/\/www\.coingecko\.com\/en\/coins\/anoma$/m,
  );
  expect(render(input({ history7d, latestLive: live({ change7d: null }) }))).toMatch(
    /^7d  [▁-█]{16} \| font=Menlo size=12 color=#6e6e73,#98989d href=https:\/\/www\.coingecko\.com\/en\/coins\/anoma$/m,
  );
});

test("every informational line is enabled: it has a click action or a color", () => {
  const out = render(input({ vesting, hasAddress: true, history7d: [live({ ts: NOW - 3600 })] }));
  for (const l of lines(out)) {
    if (l === "---") continue;
    expect(l).toMatch(/\| .*(bash=|href=|color=)/);
  }
});

test("error text is kept on one line and cannot inject SwiftBar parameters", () => {
  const msg =
    "HTTP request failed.\n\nURL: https://rpc.example | x\nDetails: timeout";
  const out = render(
    input({ errors: [{ step: "vesting", ts: NOW - 60, message: msg }] }),
  );
  expect(out).toContain(
    "⚠ Ethereum RPC: HTTP request failed. URL: https://rpc.example / x Details: timeout (1 min ago) | color=#d4a017",
  );
  expect(lines(renderFailure("bad\nconfig | x", actions))[2]).toBe(
    "bad config / x",
  );
});

test("oneLine truncates long messages", () => {
  const s = oneLine("x".repeat(300));
  expect(s.length).toBe(120);
  expect(s.endsWith("…")).toBe(true);
});
