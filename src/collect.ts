import type { Database } from "bun:sqlite";
import { HISTORY_WINDOW, evaluateAlerts } from "./alerts";
import { type VestingReader, makeVestingReader } from "./chain";
import { type FetchFn, fetchBackfill, fetchSnapshot, httpFetch } from "./coingecko";
import { type Config, defaultPaths, loadConfig, parseConfig } from "./config";
import {
  type AlertKind, type Step, clearError, hasBackfill, insertAlert, insertMarket, insertVesting, lastAlertTs,
  latestVesting, marketSince, openDb, setError,
} from "./db";
import { notify } from "./notify";

export type Deps = {
  db: Database;
  loadCfg: () => Promise<Config>;
  fetchFn: FetchFn;
  makeReader: (rpcUrl: string) => VestingReader;
  notify: (title: string, message: string) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
};

export const INTERVAL_MS = 300_000;
const KINDS: AlertKind[] = ["price_move", "volume_spike", "unlock_ready", "daily_summary"];

export async function tick(d: Deps): Promise<void> {
  const step = async (name: Step, fn: () => Promise<void>) => {
    try {
      await fn();
      clearError(d.db, name);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      d.log(`${name} failed: ${message}`);
      try {
        setError(d.db, { step: name, ts: d.now(), message });
      } catch {
        // The DB itself is failing; the log line above is all we can do.
      }
    }
  };

  let cfg = parseConfig("", "");
  await step("config", async () => {
    cfg = await d.loadCfg();
  });

  await step("backfill", async () => {
    if (hasBackfill(d.db)) return;
    const rows = await fetchBackfill(d.fetchFn);
    insertMarket(d.db, rows);
    d.log(`backfilled ${rows.length} rows`);
  });

  await step("snapshot", async () => {
    insertMarket(d.db, [await fetchSnapshot(d.fetchFn, d.now())]);
  });

  if (cfg.address) {
    const address = cfg.address;
    await step("vesting", async () => {
      insertVesting(d.db, { ts: d.now(), ...(await d.makeReader(cfg.rpcUrl)(address)) });
    });
  } else {
    clearError(d.db, "vesting");
  }

  await step("alerts", async () => {
    const now = d.now();
    const lastSent: Partial<Record<AlertKind, number>> = {};
    for (const k of KINDS) {
      const t = lastAlertTs(d.db, k);
      if (t !== null) lastSent[k] = t;
    }
    const alerts = evaluateAlerts({
      history: marketSince(d.db, now - HISTORY_WINDOW),
      vesting: cfg.address ? latestVesting(d.db) : null,
      cfg: cfg.alerts,
      lastSent,
      now,
    });
    for (const a of alerts) {
      await d.notify(a.title, a.message);
      insertAlert(d.db, { kind: a.kind, ts: now, message: `${a.title}: ${a.message}` });
      d.log(`alert ${a.kind}: ${a.title}`);
    }
  });
}

if (import.meta.main) {
  const paths = defaultPaths();
  const db = openDb(paths.db);
  const d: Deps = {
    db,
    loadCfg: () => loadConfig(paths),
    fetchFn: httpFetch,
    makeReader: makeVestingReader,
    notify: (title, message) => notify(title, message),
    now: () => Math.floor(Date.now() / 1000),
    log: (line) => console.log(`${new Date().toISOString()} ${line}`),
  };
  if (process.argv.includes("--once")) {
    await tick(d);
    db.close();
  } else {
    d.log("collector started");
    for (;;) {
      await tick(d);
      await Bun.sleep(INTERVAL_MS);
    }
  }
}
