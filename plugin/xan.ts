import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Settings, defaultPaths, loadConfig } from "../src/config";
import { type StepError, latestLive, latestMarket, latestVesting, listErrors, marketSince, openReader } from "../src/db";
import { type Actions, render, renderFailure } from "../src/render";

const bin = join(import.meta.dir, "..", "bin");
const actions: Actions = {
  collect: join(bin, "collect-once"),
  set: join(bin, "set"),
  openLog: join(bin, "open-log"),
  copy: join(bin, "copy"),
};
const paths = defaultPaths(process.env.XAN_WATCH_HOME ?? homedir());
const now = Math.floor(Date.now() / 1000);

// The menu actions in bin/ source this for the bun path. Recreate it if missing (e.g. an install
// from before it moved here) so the actions never exit silently.
const envSh = join(dirname(paths.db), "env.sh");
try {
  if (!existsSync(envSh)) {
    mkdirSync(dirname(envSh), { recursive: true });
    writeFileSync(envSh, `BUN='${process.execPath}'\n`);
  }
} catch {
  // Rendering the menu matters more than repairing the actions.
}

let settings: Settings | null = null;
let configError: StepError | null = null;
try {
  const { dbPath: _, ...s } = await loadConfig(paths);
  settings = s;
} catch (e) {
  configError = { step: "config", ts: now, message: e instanceof Error ? e.message : String(e) };
}

try {
  const base = { settings, now, actions };
  if (!existsSync(paths.db)) {
    console.log(
      render({ ...base, latest: null, latestLive: null, history7d: [], vesting: null, errors: configError ? [configError] : [] }),
    );
  } else {
    const db = openReader(paths.db);
    try {
      const dbErrors = listErrors(db);
      console.log(
        render({
          ...base,
          latest: latestMarket(db),
          latestLive: latestLive(db),
          history7d: marketSince(db, now - 7 * 86_400),
          vesting: settings?.address ? latestVesting(db) : null,
          errors: configError ? [...dbErrors.filter((x) => x.step !== "config"), configError] : dbErrors,
        }),
      );
    } finally {
      db.close();
    }
  }
} catch (e) {
  console.log(renderFailure(e instanceof Error ? e.message : String(e), actions));
}
