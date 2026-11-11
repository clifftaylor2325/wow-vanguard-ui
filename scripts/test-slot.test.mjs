// Checks the machine-wide test slot (scripts/lib/test-slot.mjs): how many slots a machine
// gets, the slot file's text, taking, waiting for, taking over and giving back a slot, and
// the one line a waiting run prints. Slots live in a scratch folder; no Vitest run starts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { acquireSlot, createLock, lockText, parseLock, pidAlive, readLock, releaseLock, runInfo, slotCount, slotDir, slotFile, takeFreeSlot, tryTake, waitingLine } from "./lib/test-slot.mjs";

const GB = 1024 ** 3;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-slots-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// A fresh folder for one case's slot files.
function folder(name) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  return dir;
}

// A run's record, started at `started`.
function run(pid, started = 1000) {
  return { pid, started, cwd: "/work/clone", command: "vitest run --project lua" };
}

// A liveness check that counts only the listed pids as running.
function running(...pids) {
  // True for a listed pid.
  return (pid) => pids.includes(pid);
}

it("a machine under 12 GB gets one slot, a larger one two, and VG_TEST_SLOTS overrides both", () => {
  expect(slotCount({}, 8 * GB)).toBe(1);
  expect(slotCount({}, 11.9 * GB)).toBe(1);
  expect(slotCount({}, 12 * GB)).toBe(2);
  expect(slotCount({}, 64 * GB)).toBe(2);
  expect(slotCount({ VG_TEST_SLOTS: "3" }, 8 * GB)).toBe(3);
  expect(slotCount({ VG_TEST_SLOTS: "1" }, 64 * GB)).toBe(1);
});

it("VG_TEST_SLOTS that is not a whole number of 1 or more is ignored", () => {
  for (const bad of ["0", "-2", "1.5", "many", ""]) expect(slotCount({ VG_TEST_SLOTS: bad }, 8 * GB), bad).toBe(1);
});

it("the slot folder is VG_TEST_SLOT_DIR, else one in the temp folder; slots are numbered from 1", () => {
  expect(slotDir({ VG_TEST_SLOT_DIR: "/x/slots" }, "/tmp")).toBe("/x/slots");
  expect(slotDir({}, "/tmp")).toBe(path.join("/tmp", "vanguard-test-slots"));
  expect(slotFile("/x", 2)).toBe(path.join("/x", "slot2.lock"));
});

it("a slot file's text reads back, and text that is not a lock reads as none", () => {
  expect(parseLock(lockText(run(42)))).toEqual(run(42));
  for (const bad of ["", "{", "[]", '{"pid":"7"}', '{"pid":0}', "null"]) expect(parseLock(bad), bad).toBeNull();
});

it("the record of this run names its pid, folder and command", () => {
  const info = runInfo(["--project", "lua"], "/work/clone", 5);
  expect(info).toEqual({ pid: process.pid, started: 5, cwd: "/work/clone", command: "vitest run --project lua" });
  expect(runInfo([], "/c", 5).command).toBe("vitest run");
});

it("this process is running, and a pid nothing holds is not", () => {
  expect(pidAlive(process.pid)).toBe(true);
  expect(pidAlive(2 ** 22 + 12345)).toBe(false);
});

it("a lock is created once; a second create finds it taken and leaves it alone, with no scratch file behind", () => {
  const file = path.join(folder("create"), "slot1.lock");
  expect(createLock(file, run(1))).toBe(true);
  expect(createLock(file, run(2))).toBe(false);
  expect(readLock(file).info.pid).toBe(1);
  expect(fs.readdirSync(path.dirname(file))).toEqual(["slot1.lock"]);
});

it("a lock that cannot be created for another reason throws", () => {
  expect(() => createLock(path.join(scratch, "no-such-folder", "slot1.lock"), run(1))).toThrow(/ENOENT/);
});

it("a free slot is taken, and a slot whose run is alive is busy and names its holder", () => {
  const file = path.join(folder("busy"), "slot1.lock");
  expect(tryTake(file, run(10), running(10))).toBeNull();
  expect(tryTake(file, run(11), running(10))).toEqual(run(10));
  expect(readLock(file).info.pid).toBe(10);
});

it("a slot whose run is gone, or whose file is not a lock, is taken over", () => {
  const dir = folder("stale");
  const dead = path.join(dir, "slot1.lock");
  fs.writeFileSync(dead, lockText(run(10)));
  expect(tryTake(dead, run(11), running())).toBeNull();
  expect(readLock(dead).info.pid).toBe(11);
  const garbage = path.join(dir, "slot2.lock");
  fs.writeFileSync(garbage, "not json");
  expect(tryTake(garbage, run(12), running(11))).toBeNull();
  expect(readLock(garbage).info.pid).toBe(12);
});

it("a lock that was taken between the check and the takeover is reported busy, not stolen", () => {
  const file = path.join(folder("race"), "slot1.lock");
  fs.writeFileSync(file, lockText(run(10)));
  let calls = 0;
  // Reports pid 10 gone, and meanwhile another run takes the slot.
  const alive = (pid) => {
    calls += 1;
    fs.writeFileSync(file, lockText(run(99)));
    return pid !== 10;
  };
  expect(tryTake(file, run(11), alive)).toEqual(run(99));
  expect(calls).toBe(1);
  expect(readLock(file).info.pid).toBe(99);
});

it("only the owner gives a slot back", () => {
  const file = path.join(folder("release"), "slot1.lock");
  createLock(file, run(10));
  releaseLock(file, 11);
  expect(fs.existsSync(file)).toBe(true);
  releaseLock(file, 10);
  expect(fs.existsSync(file)).toBe(false);
  expect(() => releaseLock(file, 10)).not.toThrow();
});

it("with two slots the second run takes the free one, and a third finds both busy in order", () => {
  const dir = folder("two");
  const alive = running(1, 2);
  expect(takeFreeSlot(dir, 2, run(1), alive)).toEqual({ file: slotFile(dir, 1) });
  expect(takeFreeSlot(dir, 2, run(2), alive)).toEqual({ file: slotFile(dir, 2) });
  const third = takeFreeSlot(dir, 2, run(3), alive);
  expect(third.holders.map((h) => [h.file, h.info.pid])).toEqual([[slotFile(dir, 1), 1], [slotFile(dir, 2), 2]]);
});

it("the waiting line is one line naming each holder's pid, time, folder and command, and the files to delete", () => {
  const holders = [{ file: "/s/slot1.lock", info: run(10, 0) }, { file: "/s/slot2.lock", info: run(11, 60_000) }];
  const line = waitingLine(holders, 724_000);
  expect(line).not.toContain("\n");
  expect(line).toContain("waiting for a free slot, 2 of 2 busy");
  expect(line).toContain("pid 10 for 12m04s in /work/clone (vitest run --project lua)");
  expect(line).toContain("pid 11 for 11m04s");
  expect(line).toContain("delete /s/slot1.lock or /s/slot2.lock");
});

it("a run waits while the slot is busy, prints one line, and takes the slot when its holder gives it back", async () => {
  const dir = folder("wait");
  const first = slotFile(dir, 1);
  createLock(first, run(10));
  const lines = [];
  // Collects what the run prints.
  const log = (line) => lines.push(line);
  let sleeps = 0;
  // Gives the slot back after the third wait.
  const sleep = async () => {
    sleeps += 1;
    if (sleeps === 3) releaseLock(first, 10);
  };
  const file = await acquireSlot({ dir, count: 1, info: run(20), log, sleep, alive: running(10, 20) });
  expect(file).toBe(first);
  expect(sleeps).toBe(3);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^test-slot: waiting for a free slot, 1 of 1 busy: pid 10 /);
  expect(lines[1]).toMatch(/^test-slot: got a slot after \d+s$/);
  expect(readLock(first).info.pid).toBe(20);
});

it("a run that finds a free slot prints nothing and never waits", async () => {
  const dir = path.join(folder("free"), "made-on-demand");
  const lines = [];
  // Collects what the run prints.
  const log = (line) => lines.push(line);
  // Fails the case: a free slot never waits.
  const sleep = () => expect.unreachable();
  const file = await acquireSlot({ dir, count: 2, info: run(20), log, sleep });
  expect(file).toBe(slotFile(dir, 1));
  expect(lines).toEqual([]);
});
