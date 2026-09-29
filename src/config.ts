import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AlertConfig = {
  priceMovePct: number;
  volumeSpikeX: number;
  unlockReadyXan: number;
  dailySummaryHour: number;
};
export type Config = {
  address: `0x${string}` | null;
  rpcUrl: string;
  dbPath: string;
  alerts: AlertConfig;
};

/** What the config file holds; `dbPath` comes from the install layout, not the file. */
export type Settings = Omit<Config, "dbPath">;

export const DEFAULT_RPC = "https://ethereum-rpc.publicnode.com";
export const DEFAULT_ALERTS: AlertConfig = {
  priceMovePct: 5,
  volumeSpikeX: 3,
  unlockReadyXan: 50_000,
  dailySummaryHour: 9,
};

export function defaultPaths(home = homedir()) {
  return {
    config: join(home, ".config", "xan-watch", "config.toml"),
    db: join(home, "Library", "Application Support", "xan-watch", "xan.db"),
    log: join(home, "Library", "Logs", "xan-watch.log"),
  };
}

function str(v: unknown, key: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || v === "")
    throw new Error(`config: ${key} must be a non-empty string`);
  return v;
}

function positive(v: unknown, key: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !(v > 0))
    throw new Error(`config: ${key} must be a number above 0`);
  return v;
}

function hour(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 23)
    throw new Error(
      "config: alerts.daily_summary_hour must be a whole hour from 0 to 23",
    );
  return v;
}

export function parseConfig(text: string, dbPath: string): Config {
  const raw = Bun.TOML.parse(text) as Record<string, unknown>;
  const a = (raw.alerts ?? {}) as Record<string, unknown>;
  const address = raw.address;
  if (
    address !== undefined &&
    (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address))
  )
    throw new Error("config: address must be a 0x address (40 hex characters)");
  return {
    address: (address as `0x${string}` | undefined) ?? null,
    rpcUrl: str(raw.rpc_url, "rpc_url") ?? DEFAULT_RPC,
    dbPath,
    alerts: {
      priceMovePct:
        positive(a.price_move_pct, "alerts.price_move_pct") ??
        DEFAULT_ALERTS.priceMovePct,
      volumeSpikeX:
        positive(a.volume_spike_x, "alerts.volume_spike_x") ??
        DEFAULT_ALERTS.volumeSpikeX,
      unlockReadyXan:
        positive(a.unlock_ready_xan, "alerts.unlock_ready_xan") ??
        DEFAULT_ALERTS.unlockReadyXan,
      dailySummaryHour:
        hour(a.daily_summary_hour) ?? DEFAULT_ALERTS.dailySummaryHour,
    },
  };
}

export async function loadConfig(
  paths: { config: string; db: string } = defaultPaths(),
): Promise<Config> {
  const file = Bun.file(paths.config);
  const text = (await file.exists()) ? await file.text() : "";
  return parseConfig(text, paths.db);
}

export function renderConfig(s: Settings): string {
  const a = s.alerts;
  return `# xan-watch settings. Change them from the XAN menu (Settings); edits here also apply
# within 5 minutes.

# Your vesting address. Leave commented out to hide the vesting block.
${s.address ? `address = "${s.address}"` : `# address = "0x..."`}

# Ethereum RPC used to read vesting balances.
${s.rpcUrl === DEFAULT_RPC ? `# rpc_url = "${DEFAULT_RPC}"` : `rpc_url = "${s.rpcUrl}"`}

[alerts]
price_move_pct = ${a.priceMovePct}        # notify when price moves this % within 1 hour
volume_spike_x = ${a.volumeSpikeX}        # notify when 24h volume is this many times its 7-day average
unlock_ready_xan = ${a.unlockReadyXan}  # notify when this much XAN is ready to unlock
daily_summary_hour = ${a.dailySummaryHour}    # local hour for the daily summary (0-23)
`;
}

export function configTemplate(address?: string): string {
  return renderConfig({
    address: (address as `0x${string}` | undefined) ?? null,
    rpcUrl: DEFAULT_RPC,
    alerts: DEFAULT_ALERTS,
  });
}

const NUMERIC: Record<string, keyof AlertConfig> = {
  price_move_pct: "priceMovePct",
  volume_spike_x: "volumeSpikeX",
  unlock_ready_xan: "unlockReadyXan",
  daily_summary_hour: "dailySummaryHour",
};

/** Returns `s` with one setting changed; throws a `config:` error if the result would be invalid. */
export function setSetting(s: Settings, key: string, value: string): Settings {
  let next: Settings;
  if (key === "address") {
    const v = value.trim();
    next = { ...s, address: v === "none" ? null : (v as `0x${string}`) };
  } else if (key in NUMERIC) {
    const n = Number(value.trim());
    if (value.trim() === "" || !Number.isFinite(n))
      throw new Error(`config: alerts.${key} must be a number`);
    next = { ...s, alerts: { ...s.alerts, [NUMERIC[key]!]: n } };
  } else {
    throw new Error(`config: unknown setting "${key}"`);
  }
  const { dbPath: _, ...checked } = parseConfig(renderConfig(next), "");
  return checked;
}

/** Applies one setting to the config file (or `reset` to defaults) and writes it atomically. */
export async function saveSetting(path: string, key: string, value: string): Promise<void> {
  let next: Settings;
  if (key === "reset") {
    next = { address: null, rpcUrl: DEFAULT_RPC, alerts: DEFAULT_ALERTS };
  } else {
    const file = Bun.file(path);
    const { dbPath: _, ...current } = parseConfig((await file.exists()) ? await file.text() : "", "");
    next = setSetting(current, key, value);
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, renderConfig(next));
  renameSync(tmp, path);
}

if (import.meta.main && process.argv.includes("--template")) {
  const i = process.argv.indexOf("--address");
  process.stdout.write(configTemplate(i > 0 ? process.argv[i + 1] : undefined));
} else if (import.meta.main && process.argv[2] === "--set") {
  const paths = defaultPaths(process.env.XAN_WATCH_HOME ?? homedir());
  try {
    await saveSetting(paths.config, process.argv[3] ?? "", process.argv[4] ?? "");
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
