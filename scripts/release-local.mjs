#!/usr/bin/env node
// Local release route, for when GitHub Actions cannot run release.yml (billing block, outage) or
// a fix has to ship in minutes. It does the same job as the workflow: the checks, the release zip,
// CurseForge and Wago (through the pinned BigWigs packager, which reads the project IDs from
// Vanguard.toc) and the GitHub release.
//
//   node scripts/release-local.mjs                      rehearsal: every check and build, nothing uploaded
//   node scripts/release-local.mjs --publish=v0.6.1     publish; the value must be v<## Version in the TOC>
//
//   --fast          skip `npm run coverage` (about 7 minutes); the output says it was skipped
//   --no-listings   leave out CurseForge and Wago
//   --no-github     leave out the GitHub release
//
// CF_API_KEY and WAGO_API_TOKEN are read from the environment by the packager. They are never
// printed, written to a file or passed on a command line. The script never creates or pushes a
// tag: you tag HEAD yourself (`git tag v<version>`), which is the decision to release. Runbook:
// docs/RELEASING.md.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The packager release.yml pins (BigWigsMods/packager v2.6.1), fetched at run time, never committed.
export const PACKAGER = {
  url: "https://raw.githubusercontent.com/BigWigsMods/packager/e50a250f8705041e40f2fa1ddcb280a686d65aa0/release.sh",
  sha256: "59b15a8d851b09e6d0fdec702aec91331b9b49d84dbe778da6c621b48f268703",
};
const KNOWN = ["--fast", "--no-listings", "--no-github", "--help"];

// The command line as options: publish is the tag typed after --publish= (or null).
export function parseArgs(argv) {
  const publish = argv.find((a) => a.startsWith("--publish="))?.slice("--publish=".length) ?? null;
  const rest = argv.filter((a) => !a.startsWith("--publish="));
  // Whether a flag is among the arguments.
  const has = (f) => rest.includes(f);
  return { publish, fast: has("--fast"), listings: !has("--no-listings"), github: !has("--no-github"), help: has("--help"), unknown: rest.filter((a) => !KNOWN.includes(a)) };
}

// The ## Version value of a TOC, or null.
export const tocVersion = (toc) => toc.match(/^## Version:\s*(\S+)/m)?.[1] ?? null;

// The newest changelog heading as { version, rest } ("## 0.6.0 (not released yet)"), or null.
export function changelogHeading(md) {
  const m = md.match(/^## (\S+)(.*)$/m);
  return m ? { version: m[1], rest: m[2].trim() } : null;
}

// The body of the changelog section for a version, up to the next "## " heading.
export function changelogSection(md, version) {
  const start = md.split("\n").findIndex((l) => l.startsWith(`## ${version}`));
  if (start < 0) return "";
  const lines = md.split("\n").slice(start + 1);
  const end = lines.findIndex((l) => l.startsWith("## "));
  return lines.slice(0, end < 0 ? lines.length : end).join("\n").trim();
}

// Whether Core/WhatsNewNotes.lua has an entry for the version.
export const hasWhatsNew = (lua, version) => lua.includes(`version = "${version}"`);

// Problems that stop a publish: strings, empty when the release is ready. A rehearsal prints them
// as "would block a publish". `s` is the state main() collects.
export function preflightProblems(s) {
  const tag = `v${s.tocVersion}`;
  const out = [];
  if (s.dirty) out.push("the working tree has uncommitted changes");
  if (s.branch !== "main") out.push(`on ${s.branch || "a detached HEAD"}, not main`);
  if (s.head !== s.originMain) out.push("HEAD is not origin/main (run git fetch origin main and update main)");
  if (!s.tagCommit) out.push(`tag ${tag} does not exist here: create it with git tag ${tag} on the release commit`);
  else if (s.tagCommit !== s.head) out.push(`tag ${tag} points at ${s.tagCommit.slice(0, 7)}, not at HEAD`);
  return out.concat(contentProblems(s, tag));
}

// The release-content half of preflightProblems: remote tag, changelog, notes, tokens.
function contentProblems(s, tag) {
  const out = [];
  if (s.remoteTag) out.push(`tag ${tag} is already on origin; a published version is never replaced, bump ## Version`);
  if (s.changelog?.version !== s.tocVersion || /not released yet/i.test(s.changelog?.rest ?? "")) out.push(`docs/CHANGELOG.md does not start with a released ${s.tocVersion} section`);
  if (!s.whatsNew) out.push(`Core/WhatsNewNotes.lua has no ${s.tocVersion} entry`);
  if (s.listings && !(s.tokens.cf && s.tokens.wago)) out.push("CF_API_KEY and WAGO_API_TOKEN must both be set in the environment");
  return out;
}

// The checks and builds, in order. Each step: { name, cmd, args }.
export function buildSteps(opts, ctx) {
  // An `npm run` step.
  const npm = (script) => ({ name: `npm run ${script}`, cmd: "npm", args: ["run", script] });
  const gates = [npm("quality"), npm("test:quick"), ...(opts.fast ? [] : [npm("coverage")])];
  const zip = path.join("dist", `Vanguard-${ctx.version}.zip`);
  const build = [
    { name: "build the zip", cmd: "node", args: ["scripts/package.mjs", "--ref", "HEAD"] },
    { name: "check the zip", cmd: "node", args: ["scripts/check-zip.mjs", "--zip", zip] },
  ];
  return [...(ctx.luac ? [luacStep(ctx.tocFiles)] : []), ...gates, ...build];
}

// The Lua 5.1 syntax check over every file the TOC loads.
function luacStep(files) {
  return { name: "luac5.1 -p (Lua 5.1 syntax)", cmd: "luac5.1", args: ["-p", ...files] };
}

// The packager command: a rehearsal adds -d, which builds the package and skips the upload.
export function packagerStep(opts, ctx) {
  const args = [ctx.script, "-t", root, "-r", path.join(root, "dist", "release"), "-m", path.join(root, "dist", "pkgmeta.yaml")];
  return { name: `packager: CurseForge and Wago${opts.publish ? "" : " (rehearsal, no upload)"}`, cmd: "bash", args: opts.publish ? args : [...args, "-d"] };
}

// The GitHub release command (publish only).
export function githubStep(ctx) {
  const tag = `v${ctx.version}`;
  const args = ["release", "create", tag, path.join("dist", `Vanguard-${ctx.version}.zip`), "--title", tag, "--target", ctx.head, "--notes-file", path.join("dist", "release-notes.md")];
  return { name: "GitHub release", cmd: "gh", args };
}

// The .pkgmeta text with the release notes as the CurseForge and Wago changelog.
export function pkgmetaWithNotes(pkgmeta) {
  return `${pkgmeta.trimEnd()}\n\nmanual-changelog:\n  filename: dist/release-notes.md\n  markup-type: markdown\n`;
}

// Runs a command, output straight to the terminal; true when it exits 0.
function exec(step) {
  console.log(`\n==> ${step.name}\n    $ ${step.cmd} ${step.args.join(" ")}`);
  return spawnSync(step.cmd, step.args, { cwd: root, stdio: "inherit" }).status === 0;
}

// Runs a command quietly for its output: { status, out }.
function sh(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  return { status: r.status, out: (r.stdout ?? "").trim() };
}

// Whether a program is installed.
const has = (cmd) => sh("sh", ["-c", `command -v ${cmd}`]).status === 0;

// Downloads the pinned packager into dist/ and checks its SHA-256; returns the script path.
export async function fetchPackager(fetchFn = fetch, dir = path.join(root, "dist")) {
  const body = Buffer.from(await (await fetchFn(PACKAGER.url)).arrayBuffer());
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  if (digest !== PACKAGER.sha256) throw new Error(`packager download has SHA-256 ${digest}, expected ${PACKAGER.sha256}; not running it`);
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, "packager-release.sh");
  fs.writeFileSync(script, body);
  return script;
}

// A repo file's text.
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// The git half of the preflight state: branch, HEAD, origin/main, dirty tree, the tag here and on origin.
function gitState(tag) {
  const tagCommit = sh("git", ["rev-list", "-n1", `refs/tags/${tag}`]);
  return {
    dirty: sh("git", ["status", "--porcelain"]).out !== "",
    branch: sh("git", ["branch", "--show-current"]).out,
    head: sh("git", ["rev-parse", "HEAD"]).out,
    originMain: sh("git", ["rev-parse", "origin/main"]).out,
    tagCommit: tagCommit.status === 0 ? tagCommit.out : null,
    remoteTag: sh("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]).out !== "",
  };
}

// Everything the preflight needs, read from git, the files and the environment.
function collectState(opts) {
  const toc = read("Vanguard.toc");
  const version = tocVersion(toc);
  return {
    ...gitState(`v${version}`), tocVersion: version, listings: opts.listings, toc,
    changelog: changelogHeading(read("docs/CHANGELOG.md")),
    whatsNew: hasWhatsNew(read("Core/WhatsNewNotes.lua"), version),
    tokens: { cf: Boolean(process.env.CF_API_KEY), wago: Boolean(process.env.WAGO_API_TOKEN) },
  };
}

// The files the TOC loads, in order.
export const tocFiles = (toc) => toc.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// Writes dist/release-notes.md and dist/pkgmeta.yaml for the packager and the GitHub release.
function writeNotes(version) {
  const md = read("docs/CHANGELOG.md");
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/release-notes.md"), `${changelogSection(md, version) || `Vanguard ${version}`}\n`);
  fs.writeFileSync(path.join(root, "dist/pkgmeta.yaml"), pkgmetaWithNotes(read(".pkgmeta")));
}

// Prints the problems; true when there are none.
function report(problems, publish) {
  const head = publish ? "BLOCKED, fix these and run again:" : "Would block a publish (fine for a rehearsal):";
  if (problems.length) console.log(`\n${head}\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  return problems.length === 0;
}

// Runs one step list, stopping at the first failure; true when all passed.
const runAll = (steps) => steps.every(exec);

// Publishing steps (listings, GitHub); each runs even if the other failed. Names of failures.
function publishAll(opts, ctx) {
  const jobs = [];
  if (opts.listings) jobs.push(packagerStep(opts, ctx));
  if (opts.github && opts.publish) jobs.push(githubStep(ctx));
  return jobs.filter((j) => !exec(j)).map((j) => j.name);
}

// The whole run: preflight, checks, build, listings, GitHub. Returns the exit code.
export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || opts.unknown.length) return usage(opts.unknown);
  if (sh("git", ["fetch", "origin", "main"]).status !== 0) console.log("git fetch origin main failed; origin/main may be stale");
  const state = collectState(opts);
  if (opts.publish && opts.publish !== `v${state.tocVersion}`) return fail(`--publish=${opts.publish} does not match v${state.tocVersion} (## Version in Vanguard.toc)`);
  const ok = report(preflightProblems(state), Boolean(opts.publish));
  if (opts.publish && !ok) return 1;
  return finish(opts, state);
}

// The checks, build and uploads once the preflight allows it.
async function finish(opts, state) {
  const ctx = { version: state.tocVersion, head: state.head, luac: has("luac5.1"), tocFiles: tocFiles(state.toc) };
  if (!ctx.luac) console.log("\nluac5.1 is not installed: Lua 5.1 syntax NOT checked (apt-get install lua5.1)");
  if (opts.fast) console.log("\n--fast: npm run coverage skipped");
  if (!runAll(buildSteps(opts, ctx))) return fail("a check failed; nothing was uploaded");
  writeNotes(ctx.version);
  if (opts.listings) ctx.script = await fetchPackager();
  const failed = publishAll(opts, ctx);
  console.log(summary(opts, failed));
  return failed.length ? 1 : 0;
}

// The closing line of a run.
function summary(opts, failed) {
  if (failed.length) return `\nFAILED: ${failed.join(", ")}`;
  return opts.publish ? "\nPublished." : "\nRehearsal done: nothing was uploaded.";
}

// Prints a failure line; the exit code 1.
function fail(msg) {
  console.error(`\n${msg}`);
  return 1;
}

// Prints the usage; 0 for --help, 2 for an unknown option.
function usage(unknown) {
  if (unknown.length) console.error(`unknown option: ${unknown.join(" ")}`);
  console.log("usage: node scripts/release-local.mjs [--publish=v<version>] [--fast] [--no-listings] [--no-github]\nRehearsal by default. See docs/RELEASING.md.");
  return unknown.length ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
