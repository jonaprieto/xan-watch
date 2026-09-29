import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

import {
  DEFAULT_ALERTS,
  renderConfig,
  saveSetting,
  setSetting,
} from "../src/config";

const base = { address: null, rpcUrl: DEFAULT_RPC, alerts: DEFAULT_ALERTS };

test("renderConfig round-trips through parseConfig", () => {
  const s = {
    address: ADDR as `0x${string}`,
    rpcUrl: "https://rpc.example",
    alerts: {
      priceMovePct: 3,
      volumeSpikeX: 2,
      unlockReadyXan: 10_000,
      dailySummaryHour: 21,
    },
  };
  const { dbPath, ...back } = parseConfig(renderConfig(s), "/db");
  expect(back).toEqual(s);
  expect(parseConfig(renderConfig(base), "/db").address).toBeNull();
});

test("setSetting changes one value and validates it", () => {
  expect(setSetting(base, "price_move_pct", "10").alerts.priceMovePct).toBe(10);
  expect(
    setSetting(base, "daily_summary_hour", "18").alerts.dailySummaryHour,
  ).toBe(18);
  expect(setSetting(base, "address", ` ${ADDR}\n`).address).toBe(ADDR);
  expect(
    setSetting({ ...base, address: ADDR }, "address", "none").address,
  ).toBeNull();
  expect(() => setSetting(base, "address", "hello")).toThrow(/address/);
  expect(() => setSetting(base, "price_move_pct", "abc")).toThrow(
    /price_move_pct/,
  );
  expect(() => setSetting(base, "daily_summary_hour", "25")).toThrow(
    /daily_summary_hour/,
  );
  expect(() => setSetting(base, "nope", "1")).toThrow(/unknown setting/);
});

test("saveSetting writes the file, keeps other values, and can reset a broken file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xw-"));
  const path = join(dir, "sub", "config.toml");
  await saveSetting(path, "address", ADDR);
  await saveSetting(path, "volume_spike_x", "5");
  const c = parseConfig(await Bun.file(path).text(), "/db");
  expect(c.address).toBe(ADDR);
  expect(c.alerts.volumeSpikeX).toBe(5);
  writeFileSync(path, `address = "0x123"`);
  await expect(saveSetting(path, "price_move_pct", "3")).rejects.toThrow(
    /address/,
  );
  await saveSetting(path, "reset", "");
  expect(parseConfig(await Bun.file(path).text(), "/db")).toEqual(
    parseConfig("", "/db"),
  );
});

test("the --set command line updates the file and reports invalid input", () => {
  const home = mkdtempSync(join(tmpdir(), "xw-"));
  const cli = (...args: string[]) =>
    Bun.spawnSync(
      [
        "bun",
        join(import.meta.dir, "..", "src", "config.ts"),
        "--set",
        ...args,
      ],
      {
        env: { ...process.env, XAN_WATCH_HOME: home },
      },
    );
  expect(cli("price_move_pct", "10").exitCode).toBe(0);
  const bad = cli("address", "not-an-address");
  expect(bad.exitCode).toBe(1);
  expect(bad.stderr.toString()).toContain("address must be a 0x address");
  const text = readFileSync(
    join(home, ".config", "xan-watch", "config.toml"),
    "utf8",
  );
  expect(parseConfig(text, "/db").alerts.priceMovePct).toBe(10);
});
