import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { insertMarket, openDb } from "../src/db";

const plugin = join(import.meta.dir, "..", "plugin", "xan.ts");
const run = (home: string) => {
  const p = Bun.spawnSync(["bun", plugin], { env: { ...process.env, XAN_WATCH_HOME: home } });
  return { code: p.exitCode, out: p.stdout.toString() };
};

test("no DB yet shows the waiting menu", () => {
  const home = mkdtempSync(join(tmpdir(), "xw-"));
  const r = run(home);
  expect(r.code).toBe(0);
  expect(r.out.split("\n")[0]).toBe("XAN … | color=gray");
  const env = readFileSync(join(home, "Library", "Application Support", "xan-watch", "env.sh"), "utf8");
  expect(env).toBe(`BUN='${process.execPath}'\n`);
});

test("renders from the DB", () => {
  const home = mkdtempSync(join(tmpdir(), "xw-"));
  const db = openDb(join(home, "Library", "Application Support", "xan-watch", "xan.db"));
  insertMarket(db, [{ ts: Math.floor(Date.now() / 1000), price: 0.01222, marketCap: 1, fdv: 1, volume24h: 1, change24h: 0.7, change7d: 0, circulating: null, sentimentUp: null, watchlist: null, source: "live" }]);
  db.close();
  expect(run(home).out.split("\n")[0]).toBe("XAN $0.01222 ▲0.7% | font=.AppleSystemUIFontBold size=13 color=#2e9e44");
});

const dbPath = (home: string) => join(home, "Library", "Application Support", "xan-watch", "xan.db");
const liveRow = { ts: Math.floor(Date.now() / 1000), price: 0.01222, marketCap: 1, fdv: 1, volume24h: 1, change24h: 0.7, change7d: 0, circulating: null, sentimentUp: null, watchlist: null, source: "live" as const };

test("a broken config keeps market data and shows the settings error", () => {
  const home = mkdtempSync(join(tmpdir(), "xw-"));
  const db = openDb(dbPath(home));
  insertMarket(db, [liveRow]);
  db.close();
  mkdirSync(join(home, ".config", "xan-watch"), { recursive: true });
  writeFileSync(join(home, ".config", "xan-watch", "config.toml"), `address = "0x123"`);
  const r = run(home);
  expect(r.code).toBe(0);
  expect(r.out.split("\n")[0]).toBe("XAN $0.01222 ▲0.7% | font=.AppleSystemUIFontBold size=13 color=#2e9e44");
  expect(r.out).toContain("⚠ Settings:");
  expect(r.out).toContain("address must be a 0x address");
});

test("a corrupt DB shows the failure menu instead of crashing", () => {
  const home = mkdtempSync(join(tmpdir(), "xw-"));
  mkdirSync(dirname(dbPath(home)), { recursive: true });
  writeFileSync(dbPath(home), "this is not a sqlite database, just garbage bytes".repeat(50));
  const r = run(home);
  expect(r.code).toBe(0);
  expect(r.out.split("\n")[0]).toBe("XAN ⚠ | color=#d0413e");
});
