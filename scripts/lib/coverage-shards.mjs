// The sharded coverage run (npm run coverage -- --shard i/n, then --merge <dir>).
// CI splits the suite over several jobs with Vitest's --shard; each job dumps one hits
// file per test file (scripts/tests/setup.mjs) and uploads them. The merge job downloads
// every job's hits into one folder (one subfolder per job) and judges the 100% floor once,
// over all of them. These helpers read the command line, find the hits files and check
// that nothing is missing: a shard that never ran, or a test file that dumped no hits,
// must fail the merge rather than lower the total unseen.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// The value of `--name v` or `--name=v` in an argument list, or null when it is not there.
function optionValue(args, name) {
  const at = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (at < 0) return null;
  const value = args[at].includes("=") ? args[at].slice(name.length + 3) : args[at + 1];
  if (!value) throw new Error(`--${name} needs a value`);
  return value;
}

// The `--shard i/n` of a Vitest argument list as { index, count }, or null; i and n are whole numbers, 1 <= i <= n.
export function shardOption(args) {
  const value = optionValue(args, "shard");
  if (value === null) return null;
  const [index, count] = value.split("/").map(Number);
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 1 || index > count) throw new Error(`--shard must be i/n with 1 <= i <= n, not "${value}"`);
  return { index, count };
}

// The folder after `--merge`, or null; `--shards n` (how many jobs must be there) comes with it as { dir, shards }.
export function mergeOption(args) {
  const dir = optionValue(args, "merge");
  if (dir === null) return null;
  const shards = optionValue(args, "shards");
  return { dir, shards: shards === null ? null : Number(shards) };
}

// Every .json file under a folder, at any depth, sorted.
export function hitsFilesUnder(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...hitsFilesUnder(full));
    else if (entry.name.endsWith(".json")) found.push(full);
  }
  return found.sort();
}

// The test file a hits file came from: "chat.test.mjs-1234.json" is "chat.test.mjs".
export function testFileOf(hitsFile) {
  return path.basename(hitsFile).replace(/-\d+\.json$/, "");
}

// The base names of the test files Vitest lists ("[lua] scripts/tests/chat.test.mjs" lines).
export function listedTestFiles(listOutput) {
  const files = listOutput.split("\n").map((l) => l.replace(/^\[[^\]]*\]\s*/, "").trim()).filter((l) => /\.test\.mjs$/.test(l));
  return new Set(files.map((f) => path.basename(f)));
}

// The test files Vitest would run in this clone, asked with `vitest list --filesOnly` (it runs nothing).
export function expectedTestFiles(root) {
  const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
  const out = spawnSync(process.execPath, [bin, "list", "--filesOnly"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
  if (out.status !== 0) throw new Error(`vitest list failed:\n${out.stdout}${out.stderr}`);
  return listedTestFiles(out.stdout);
}

// The subfolders of the merge folder, one per shard.
function shardFolders(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

// What is wrong with a merge folder, as a list of sentences: a wrong number of shard
// folders, a shard folder with no hits, and test files with no hits file (or hits for a file
// that no longer exists). `expected` is the set of test file names; `shards` may be null.
export function mergeProblems(dir, shards, expected) {
  const folders = shardFolders(dir);
  const problems = [];
  if (shards !== null && folders.length !== shards) problems.push(`expected the hits of ${shards} shards, found ${folders.length} folder(s): ${folders.join(", ") || "none"}`);
  for (const name of folders) if (hitsFilesUnder(path.join(dir, name)).length === 0) problems.push(`shard folder ${name} holds no hits file`);
  const seen = new Set(hitsFilesUnder(dir).map(testFileOf));
  for (const file of expected) if (!seen.has(file)) problems.push(`no hits file for test file ${file}`);
  for (const file of seen) if (!expected.has(file)) problems.push(`hits file for ${file}, which Vitest does not list`);
  return problems;
}

// The tests and failures a folder's JUnit files add up to ({ files, tests, failures }); a file without the totals counts as none.
export function junitTotals(dir) {
  const totals = { files: 0, tests: 0, failures: 0 };
  const listed = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith("junit.xml"));
  for (const file of listed) {
    const head = fs.readFileSync(path.join(dir, String(file)), "utf8").match(/<testsuites\b[^>]*>/)?.[0] ?? "";
    totals.files += 1;
    totals.tests += Number(head.match(/\btests="(\d+)"/)?.[1] ?? 0);
    totals.failures += Number(head.match(/\bfailures="(\d+)"/)?.[1] ?? 0);
  }
  return totals;
}
