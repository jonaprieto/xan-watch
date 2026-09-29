export type Spawn = (cmd: string[]) => { exited: Promise<number> };

// Text is passed as argv, so quotes in a title cannot break or inject into the script.
const SCRIPT = [
  "-e",
  "on run argv",
  "-e",
  "display notification (item 2 of argv) with title (item 1 of argv)",
  "-e",
  "end run",
];

export function notifyCommand(title: string, message: string): string[] {
  return ["osascript", ...SCRIPT, title, message];
}

const bunSpawn: Spawn = (cmd) =>
  Bun.spawn(cmd, { stdout: "ignore", stderr: "inherit" });

export async function notify(
  title: string,
  message: string,
  spawn: Spawn = bunSpawn,
): Promise<void> {
  const code = await spawn(notifyCommand(title, message)).exited;
  if (code !== 0) throw new Error(`osascript exited ${code}`);
}
