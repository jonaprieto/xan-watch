import { homedir } from "node:os";
import { join } from "node:path";

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

export const DEFAULT_RPC = "https://ethereum-rpc.publicnode.com";

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
      priceMovePct: positive(a.price_move_pct, "alerts.price_move_pct") ?? 5,
      volumeSpikeX: positive(a.volume_spike_x, "alerts.volume_spike_x") ?? 3,
      unlockReadyXan:
        positive(a.unlock_ready_xan, "alerts.unlock_ready_xan") ?? 50_000,
      dailySummaryHour: hour(a.daily_summary_hour) ?? 9,
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

export function configTemplate(address?: string): string {
  return `# xan-watch settings. Changes apply within 5 minutes, no restart needed.

# Your vesting address. Leave commented out to hide the vesting block.
${address ? `address = "${address}"` : `# address = "0x..."`}

# Ethereum RPC used to read vesting balances.
# rpc_url = "${DEFAULT_RPC}"

[alerts]
price_move_pct = 5        # notify when price moves this % within 1 hour
volume_spike_x = 3        # notify when 24h volume is this many times its 7-day average
unlock_ready_xan = 50000  # notify when this much XAN is ready to unlock
daily_summary_hour = 9    # local hour for the daily summary (0-23)
`;
}

if (import.meta.main && process.argv.includes("--template")) {
  const i = process.argv.indexOf("--address");
  process.stdout.write(configTemplate(i > 0 ? process.argv[i + 1] : undefined));
}
