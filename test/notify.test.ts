import { expect, test } from "bun:test";
import { notify, notifyCommand } from "../src/notify";

test("title and message travel as argv, never inside the AppleScript source", () => {
  const cmd = notifyCommand(`XAN "up"`, `it's 5%`);
  expect(cmd[0]).toBe("osascript");
  expect(cmd.slice(-2)).toEqual([`XAN "up"`, `it's 5%`]);
  expect(cmd.slice(0, -2).join(" ")).not.toContain("XAN");
});

test("notify spawns the command and fails on a non-zero exit", async () => {
  const calls: string[][] = [];
  await notify("t", "m", (cmd) => {
    calls.push(cmd);
    return { exited: Promise.resolve(0) };
  });
  expect(calls).toEqual([notifyCommand("t", "m")]);
  await expect(
    notify("t", "m", () => ({ exited: Promise.resolve(1) })),
  ).rejects.toThrow("osascript exited 1");
});
