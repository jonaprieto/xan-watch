import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Source = "live" | "backfill";
export type MarketRow = {
  ts: number;
  price: number;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  change24h: number | null;
  change7d: number | null;
  circulating: number | null;
  sentimentUp: number | null;
  watchlist: number | null;
  source: Source;
};
export type VestingRow = {
  ts: number;
  principal: bigint;
  locked: bigint;
  unlockable: bigint;
  unlocked: bigint;
  balance: bigint;
};
export type AlertKind =
  | "price_move"
  | "volume_spike"
  | "unlock_ready"
  | "daily_summary";
export type Step = "config" | "backfill" | "snapshot" | "vesting" | "alerts";
export type StepError = { step: Step; ts: number; message: string };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS market (
     ts INTEGER PRIMARY KEY, price REAL NOT NULL, market_cap REAL, fdv REAL, volume_24h REAL,
     change_24h REAL, change_7d REAL, circulating REAL, sentiment_up REAL, watchlist INTEGER,
     source TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS vesting (
     ts INTEGER PRIMARY KEY, principal TEXT NOT NULL, locked TEXT NOT NULL, unlockable TEXT NOT NULL,
     unlocked TEXT NOT NULL, balance TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ts INTEGER NOT NULL, message TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS alerts_kind_ts ON alerts (kind, ts)`,
  `CREATE TABLE IF NOT EXISTS errors (step TEXT PRIMARY KEY, ts INTEGER NOT NULL, message TEXT NOT NULL)`,
];

export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  for (const stmt of SCHEMA) db.exec(stmt);
  return db;
}

/** Opens an existing DB for reading. Never creates tables, so it cannot clash with the writer. */
export function openReader(path: string): Database {
  const db = new Database(path, { create: false, readonly: true });
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

const MARKET_COLS = `ts, price, market_cap AS marketCap, fdv, volume_24h AS volume24h, change_24h AS change24h,
  change_7d AS change7d, circulating, sentiment_up AS sentimentUp, watchlist, source`;

export function insertMarket(db: Database, rows: MarketRow[]): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO market VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const r of rows)
      stmt.run(
        r.ts,
        r.price,
        r.marketCap,
        r.fdv,
        r.volume24h,
        r.change24h,
        r.change7d,
        r.circulating,
        r.sentimentUp,
        r.watchlist,
        r.source,
      );
  })();
}

export function hasBackfill(db: Database): boolean {
  return (
    db.query(`SELECT 1 FROM market WHERE source = 'backfill' LIMIT 1`).get() !==
    null
  );
}

export function marketSince(db: Database, sinceTs: number): MarketRow[] {
  return db
    .query(`SELECT ${MARKET_COLS} FROM market WHERE ts >= ? ORDER BY ts`)
    .all(sinceTs) as MarketRow[];
}

export function latestMarket(db: Database): MarketRow | null {
  return db
    .query(`SELECT ${MARKET_COLS} FROM market ORDER BY ts DESC LIMIT 1`)
    .get() as MarketRow | null;
}

export function latestLive(db: Database): MarketRow | null {
  return db
    .query(
      `SELECT ${MARKET_COLS} FROM market WHERE source = 'live' ORDER BY ts DESC LIMIT 1`,
    )
    .get() as MarketRow | null;
}

export function insertVesting(db: Database, v: VestingRow): void {
  db.query(`INSERT OR REPLACE INTO vesting VALUES (?, ?, ?, ?, ?, ?)`).run(
    v.ts,
    String(v.principal),
    String(v.locked),
    String(v.unlockable),
    String(v.unlocked),
    String(v.balance),
  );
}

export function latestVesting(db: Database): VestingRow | null {
  const r = db
    .query(`SELECT * FROM vesting ORDER BY ts DESC LIMIT 1`)
    .get() as Record<string, string | number> | null;
  if (!r) return null;
  return {
    ts: Number(r.ts),
    principal: BigInt(r.principal!),
    locked: BigInt(r.locked!),
    unlockable: BigInt(r.unlockable!),
    unlocked: BigInt(r.unlocked!),
    balance: BigInt(r.balance!),
  };
}

export function insertAlert(
  db: Database,
  a: { kind: AlertKind; ts: number; message: string },
): void {
  db.query(`INSERT INTO alerts (kind, ts, message) VALUES (?, ?, ?)`).run(
    a.kind,
    a.ts,
    a.message,
  );
}

export function lastAlertTs(db: Database, kind: AlertKind): number | null {
  const r = db
    .query(`SELECT max(ts) AS ts FROM alerts WHERE kind = ?`)
    .get(kind) as { ts: number | null };
  return r.ts;
}

export function setError(db: Database, e: StepError): void {
  db.query(`INSERT OR REPLACE INTO errors VALUES (?, ?, ?)`).run(
    e.step,
    e.ts,
    e.message,
  );
}

export function clearError(db: Database, step: Step): void {
  db.query(`DELETE FROM errors WHERE step = ?`).run(step);
}

export function listErrors(db: Database): StepError[] {
  return db
    .query(`SELECT step, ts, message FROM errors ORDER BY ts`)
    .all() as StepError[];
}
