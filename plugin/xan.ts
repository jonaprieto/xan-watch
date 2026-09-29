import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultPaths, loadConfig } from "../src/config";
import { latestLive, latestMarket, latestVesting, listErrors, marketSince, openReader } from "../src/db";
import { type Actions, render, renderFailure } from "../src/render";

const bin = join(import.meta.dir, "..", "bin");
const actions: Actions = {
  collect: join(bin, "collect-once"),
  editSettings: join(bin, "edit-settings"),
  openLog: join(bin, "open-log"),
};
const paths = defaultPaths(process.env.XAN_WATCH_HOME ?? homedir());
const now = Math.floor(Date.now() / 1000);

try {
  const cfg = await loadConfig(paths);
  const base = { hasAddress: cfg.address !== null, now, actions };
  if (!existsSync(paths.db)) {
    console.log(render({ ...base, latest: null, latestLive: null, history7d: [], vesting: null, errors: [] }));
  } else {
    const db = openReader(paths.db);
    console.log(
      render({
        ...base,
        latest: latestMarket(db),
        latestLive: latestLive(db),
        history7d: marketSince(db, now - 7 * 86_400),
        vesting: cfg.address ? latestVesting(db) : null,
        errors: listErrors(db),
      }),
    );
    db.close();
  }
} catch (e) {
  console.log(renderFailure(e instanceof Error ? e.message : String(e), actions));
}
