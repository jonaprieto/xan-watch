import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_RPC,
  configTemplate,
  defaultPaths,
  loadConfig,
  parseConfig,
} from "../src/config";

const ADDR = "0x1111111111111111111111111111111111111111";

test("empty config gives defaults", () => {
  const c = parseConfig("", "/db");
  expect(c).toEqual({
    address: null,
    rpcUrl: DEFAULT_RPC,
    dbPath: "/db",
    alerts: {
      priceMovePct: 5,
      volumeSpikeX: 3,
      unlockReadyXan: 50_000,
      dailySummaryHour: 9,
    },
  });
});

test("full config is read", () => {
  const c = parseConfig(
    `address = "${ADDR}"\nrpc_url = "https://rpc.example"\n[alerts]\nprice_move_pct = 3\nvolume_spike_x = 2.5\nunlock_ready_xan = 1000\ndaily_summary_hour = 20\n`,
    "/db",
  );
  expect(c.address).toBe(ADDR);
  expect(c.rpcUrl).toBe("https://rpc.example");
  expect(c.alerts).toEqual({
    priceMovePct: 3,
    volumeSpikeX: 2.5,
    unlockReadyXan: 1000,
    dailySummaryHour: 20,
  });
});

test("invalid values throw readable errors", () => {
  expect(() => parseConfig(`address = "0x123"`, "/db")).toThrow(/address/);
  expect(() => parseConfig(`[alerts]\nprice_move_pct = -1`, "/db")).toThrow(
    /price_move_pct/,
  );
  expect(() => parseConfig(`[alerts]\ndaily_summary_hour = 24`, "/db")).toThrow(
    /daily_summary_hour/,
  );
  expect(() => parseConfig(`rpc_url = 5`, "/db")).toThrow(/rpc_url/);
});

test("the template parses, with and without an address", () => {
  expect(parseConfig(configTemplate(), "/db").address).toBeNull();
  expect(parseConfig(configTemplate(ADDR), "/db").address).toBe(ADDR);
});

test("loadConfig falls back to defaults when the file is missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xw-"));
  const c = await loadConfig({
    config: join(dir, "nope.toml"),
    db: join(dir, "x.db"),
  });
  expect(c.address).toBeNull();
  expect(c.dbPath).toBe(join(dir, "x.db"));
  writeFileSync(join(dir, "c.toml"), `address = "${ADDR}"`);
  expect(
    (await loadConfig({ config: join(dir, "c.toml"), db: "x" })).address,
  ).toBe(ADDR);
});

test("default paths", () => {
  expect(defaultPaths("/h")).toEqual({
    config: "/h/.config/xan-watch/config.toml",
    db: "/h/Library/Application Support/xan-watch/xan.db",
    log: "/h/Library/Logs/xan-watch.log",
  });
});
