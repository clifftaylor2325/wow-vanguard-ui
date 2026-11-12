// A machine-wide slot for test runs. A whole suite run holds one to three gigabytes of
// memory and every core it can get, so two runs at once (two clones, two agents, a hook
// and a hand-started run) each take twice as long and can exhaust a small machine. Before
// Vitest starts, scripts/test-slot.mjs takes a slot here and waits when none is free.
//
// A slot is a lock file in a folder of the OS temp directory, shared by every clone on
// the machine. The file holds the pid, the start time, the folder and the command of the
// run that owns it, and once Vitest is spawned the child's pid too (`child`, optional, so a
// clone at an older commit still reads the file). A slot is busy while either pid runs, so
// killing the owner alone does not free it under a live Vitest. It is created whole and in one step (written beside it, then hard
// linked), so a reader never sees half a file. A file whose pid is no longer running
// belongs to a run that died (owner and child both), and the next run takes it over in
// place: one claim per dead lock (a hard link named after its text) lets only one of two
// racing runs in, and the winner renames its own lock over the dead one, so the slot file
// is never missing and a live lock is never moved. The waiting line names the file to
// delete when a pid was reused by something else.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clock } from "./progress-reporter.mjs";

export const SMALL_MACHINE_BYTES = 12 * 1024 ** 3;
export const POLL_MS = 2000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// How many runs one machine holds at once: VG_TEST_SLOTS when it is a whole number of 1 or more,
// else one on a machine under 12 GB of memory and two above.
export function slotCount(env, totalBytes) {
  const asked = Number(env.VG_TEST_SLOTS);
  if (Number.isInteger(asked) && asked >= 1) return asked;
  return totalBytes < SMALL_MACHINE_BYTES ? 1 : 2;
}

// The folder holding the slot files: VG_TEST_SLOT_DIR, else one in the temp directory.
export function slotDir(env, tmp) {
  return env.VG_TEST_SLOT_DIR || path.join(tmp, "vanguard-test-slots");
}

// The path of slot number `n` (counting from 1).
export function slotFile(dir, n) {
  return path.join(dir, `slot${n}.lock`);
}

// The text a slot file holds for one run.
export function lockText(info) {
  return `${JSON.stringify(info)}\n`;
}

// What a slot file's text says, or null when it is empty or not a lock.
export function parseLock(text) {
  try {
    const info = JSON.parse(text);
    return Number.isInteger(info?.pid) && info.pid > 0 ? info : null;
  } catch {
    return null;
  }
}

// True when a process with this pid is running (a permission error means it is, owned by someone else).
export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// The facts a slot file records about this run.
export function runInfo(args, cwd = process.cwd(), now = Date.now()) {
  return { pid: process.pid, started: now, cwd, command: `vitest run ${args.join(" ")}`.trim() };
}

// One line saying what a run waits for: every slot, who holds it and for how long.
export function waitingLine(holders, now) {
  const who = holders.map(({ info }) => `pid ${info.pid} for ${clock((now - info.started) / 1000)} in ${info.cwd} (${info.command})`);
  const files = holders.map(({ file }) => file).join(" or ");
  return `test-slot: waiting for a free slot, ${holders.length} of ${holders.length} busy: ${who.join("; ")}. If a pid is not a test run any more, delete ${files}.`;
}

// Writes a scratch lock readable and writable by every user: the umask would cut a mode passed to
// writeFileSync, and a run of another user cannot hard link a dead holder's 0644 file
// (fs.protected_hardlinks), so it could never take the slot over.
function writeScratch(scratch, text) {
  fs.writeFileSync(scratch, text);
  fs.chmodSync(scratch, 0o666);
}

// Writes the file whole, or not at all: false when it already exists.
export function createLock(file, info) {
  const scratch = `${file}.${process.pid}.tmp`;
  writeScratch(scratch, lockText(info));
  try {
    fs.linkSync(scratch, file);
    return true;
  } catch (err) {
    return err.code === "EEXIST" ? false : fail(err);
  } finally {
    fs.rmSync(scratch, { force: true });
  }
}

// Throws the error it is given (an expression, so a catch clause can end on it).
function fail(err) {
  throw err;
}

// The lock in a slot file: { text, info }, text null when there is no file.
export function readLock(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return { text, info: parseLock(text) };
  } catch {
    return { text: null, info: null };
  }
}

// True while the run a lock records is alive: its owner, or the Vitest child it spawned.
export function holderAlive(info, alive = pidAlive) {
  return alive(info.pid) || (Number.isInteger(info.child) && alive(info.child));
}

// The claim file for one dead lock's text: the same name for every run that read that text.
function claimFile(file, deadText) {
  return `${file}.${createHash("sha1").update(deadText).digest("hex").slice(0, 16)}.claim`;
}

// Writes this run's lock over the slot file in one step (written beside it, then renamed over it).
function replaceLock(file, info) {
  const scratch = `${file}.${process.pid}.tmp`;
  writeScratch(scratch, lockText(info));
  fs.renameSync(scratch, file);
  return true;
}

// Hard links `to` to `from`: false when `to` already exists or `from` is gone.
function linked(from, to) {
  try {
    fs.linkSync(from, to);
    return true;
  } catch {
    return false;
  }
}

// Takes over the dead lock whose text was read, in place; false when another run got there first. The claim is a
// hard link to the slot file, which only one run can make: the winner checks the claim still holds the dead text
// (a run that took the slot a moment ago has replaced it), then renames its own lock over the slot file. The claim
// goes only after that, so a run that read the same dead text later finds the new lock, not the dead one.
function claimDead(file, deadText, info) {
  const claim = claimFile(file, deadText);
  if (!linked(file, claim)) return false;
  try {
    return fs.readFileSync(claim, "utf8") === deadText && replaceLock(file, info);
  } finally {
    fs.rmSync(claim, { force: true });
  }
}

// Takes the slot at `file` when it is free or its run is gone; the holder's info when it is busy, else null.
export function tryTake(file, info, alive = pidAlive) {
  if (createLock(file, info)) return null;
  const held = readLock(file);
  if (held.info && holderAlive(held.info, alive)) return held.info;
  if (held.text !== null && claimDead(file, held.text, info)) return null;
  return readLock(file).info ?? { pid: 0, started: info.started, cwd: "?", command: "?" };
}

// Gives a slot back, only when this run still owns it.
export function releaseLock(file, pid = process.pid) {
  if (readLock(file).info?.pid === pid) fs.rmSync(file, { force: true });
}

// The stand-in holder for a slot this user may not write (another user's folder): busy, so the next slot is tried.
function unwritable(file, info) {
  return { pid: 0, started: info.started, cwd: path.dirname(file), command: "a slot folder this user cannot write (delete or chmod it)" };
}

// tryTake, with a permission error (a slot folder another user made) read as a busy slot.
function tryTakeOrSkip(file, info, alive) {
  try {
    return tryTake(file, info, alive);
  } catch (err) {
    if (err.code === "EACCES" || err.code === "EPERM") return unwritable(file, info);
    throw err;
  }
}

// Tries each slot in turn: { file } for the one taken, or { holders } naming everyone in the way.
export function takeFreeSlot(dir, count, info, alive = pidAlive) {
  const holders = [];
  for (let n = 1; n <= count; n += 1) {
    const file = slotFile(dir, n);
    const holder = tryTakeOrSkip(file, info, alive);
    if (!holder) return { file };
    holders.push({ file, info: holder });
  }
  return { holders };
}

// The slot file, after a line saying how long the wait was when there was one.
function gotSlot(file, waited, log) {
  if (waited) log(`test-slot: got a slot after ${waited}`);
  return file;
}

// Waits (printing one line, once) until a slot is free and takes it; resolves with the slot file.
export async function acquireSlot({ dir, count, info, log = console.log, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), alive = pidAlive }) {
  if (fs.mkdirSync(dir, { recursive: true, mode: 0o777 })) fs.chmodSync(dir, 0o777);
  const started = Date.now();
  for (let said = false; ; said = true) {
    const taken = takeFreeSlot(dir, count, { ...info, started: Date.now() }, alive);
    if (taken.file) return gotSlot(taken.file, said && `${clock((Date.now() - started) / 1000)}`, log);
    if (!said) log(waitingLine(taken.holders, Date.now()));
    await sleep(POLL_MS);
  }
}

// Runs Vitest in a child process with the slot's lock set in its environment; resolves with its exit status.
// `onSpawn` gets the child's pid at once.
function runVitest(args, env, onSpawn = () => {}) {
  const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
  const child = spawn(process.execPath, [bin, "run", ...args], { cwd: root, stdio: "inherit", env });
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  onSpawn(child.pid);
  return new Promise((done) => child.on("exit", (code, signal) => done(code ?? (signal ? 1 : 0))));
}

// Rewrites this run's lock with the child's pid (written beside it, then renamed over it, so a reader never
// sees half a file), when the lock is still this run's.
export function recordChild(file, child) {
  const held = readLock(file);
  if (held.info?.pid !== process.pid) return;
  const scratch = `${file}.${process.pid}.tmp`;
  writeScratch(scratch, lockText({ ...held.info, child }));
  fs.renameSync(scratch, file);
}

// `vitest run <args>` once a slot is free, and the slot back after. A run already inside a slot (its
// environment names the lock) starts directly, so a script that runs a suite from inside one cannot wait on itself.
// `ready` runs once the slot is taken and before Vitest starts (a script clears its own output there).
export async function runInSlot(args, env = process.env, ready = () => {}) {
  if (env.VG_TEST_SLOT_HELD) return runVitest(args, env);
  const file = await acquireSlot({ dir: slotDir(env, os.tmpdir()), count: slotCount(env, os.totalmem()), info: runInfo(args) });
  // Gives the slot back; also on a normal exit, for a run that ends without reaching the line below.
  const release = () => releaseLock(file);
  process.once("exit", release);
  ready();
  const status = await runVitest(args, { ...env, VG_TEST_SLOT_HELD: file }, (child) => recordChild(file, child));
  release();
  return status;
}
