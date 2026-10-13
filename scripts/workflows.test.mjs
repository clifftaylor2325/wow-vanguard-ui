// The weekly shuffled run (D-05) is wired through three workflow files:
// lua-suite.yml takes a shuffle input and picks and prints the seed,
// full-suite.yml turns it on for the schedule event only, and release.yml
// never shuffles. The files are read as text with small readers (no YAML
// parser is installed), the way scripts/pkgmeta.test.mjs reads .pkgmeta.
// The full suite's pull-request trigger (D-04) is checked by evaluating the
// suite job's `if` and the concurrency group of full-suite.yml for each
// event, with a small evaluator for the part of the expression syntax those
// two places use (anything else throws). The hosted run itself cannot be
// checked here. The file also checks the toolchain pins (D-05): the luacheck
// release binary's digest, Node's version in .nvmrc and what reads it, and the
// exact fengari version.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { root } from "./check-zip.mjs";

// The text of one workflow file.
function workflow(name) {
  return fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8");
}

// The lines after `start` that are indented deeper than `indent` (blank lines included).
function deeperLines(lines, start, indent) {
  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trim() && lines[i].search(/\S/) <= indent) break;
    out.push(lines[i]);
  }
  return out;
}

// The text of every `run:` in a workflow: a block script or an inline command.
function runBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*(?:-\s+)?)run:\s*(.*)$/);
    if (!m) return;
    blocks.push(/^[|>][+-]?$/.test(m[2]) ? deeperLines(lines, i + 1, m[1].length).join("\n") : m[2]);
  });
  return blocks;
}

// The text of the step with this name (from its `- name:` line to the next step).
function stepNamed(text, name) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (at < 0) return "";
  return [lines[at], ...deeperLines(lines, at + 1, lines[at].indexOf("-"))].join("\n");
}

it("lua-suite takes a boolean shuffle input that defaults to off", () => {
  const input = workflow("lua-suite.yml").match(/^ {6}shuffle:\n((?: {8}.*\n)+)/m)?.[1] ?? "";
  expect(input).toMatch(/^ {8}type: boolean$/m);
  expect(input).toMatch(/^ {8}default: false$/m);
});

it("the seed step is conditional, exports the seed and prints both replay forms", () => {
  const step = stepNamed(workflow("lua-suite.yml"), "Pick and print the shuffle seed");
  expect(step).toMatch(/^\s+if: inputs\.shuffle$/m);
  expect(step).toMatch(/VG_SHUFFLE_SEED=.*>> "\$GITHUB_ENV"/);
  expect(step).toContain("Replay: VG_SHUFFLE_SEED=");
  expect(step).toContain("$env:VG_SHUFFLE_SEED=");
  expect(step).toContain('tee -a "$GITHUB_STEP_SUMMARY"');
});

it("the seed step comes before the coverage run", () => {
  const text = workflow("lua-suite.yml");
  const seed = text.indexOf("- name: Pick and print the shuffle seed");
  expect(seed).toBeGreaterThan(-1);
  expect(text.indexOf("- run: npm run coverage")).toBeGreaterThan(seed);
});

it("the raid bench runs after the coverage run, appends to the job summary, has no budget and keeps its JSON", () => {
  const text = workflow("lua-suite.yml");
  const step = stepNamed(text, "Raid benchmark (harness measurement)");
  expect(runBlocks(step)).toEqual(['npm run bench -- --summary "$GITHUB_STEP_SUMMARY"']);
  expect(text.indexOf("- name: Raid benchmark (harness measurement)")).toBeGreaterThan(text.indexOf("- run: npm run coverage"));
  expect(step, "a slowdown never fails the run").not.toContain("--budget");
  expect(text).toMatch(/^ {12}coverage\/bench\/\*\.json$/m);
});

it("full-suite shuffles only for the schedule event", () => {
  expect(workflow("full-suite.yml")).toContain("shuffle: ${{ github.event_name == 'schedule' }}");
});

it("release never shuffles", () => {
  expect(workflow("release.yml")).not.toMatch(/shuffle/i);
});

it("no run script holds an input expression", () => {
  const all = ["lua-suite.yml", "full-suite.yml", "release.yml"].map((f) => runBlocks(workflow(f)));
  expect(all[0].some((b) => b.includes("GITHUB_ENV")), "the reader finds the seed script").toBe(true);
  for (const blocks of all) for (const b of blocks) expect(b).not.toContain("${{ inputs.");
});

// The lua-suite steps that only repeat verify.yml on a pull request (#292 F2).
const CHECK_STEPS = [
  "luacheck 1.2.0 and Lua 5.1",
  "Code quality",
  "The TOC against the files on disk",
  "luacheck",
  "Lua 5.1 syntax of every file the TOC loads",
  "Release zip builds and holds every file it should",
];

it("lua-suite takes a boolean checks input that defaults to on", () => {
  const input = workflow("lua-suite.yml").match(/^ {6}checks:\n((?: {8}.*\n)+)/m)?.[1] ?? "";
  expect(input).toMatch(/^ {8}type: boolean$/m);
  expect(input).toMatch(/^ {8}default: true$/m);
});

it("every check step is gated on the checks input, and the tests, bench and upload are not", () => {
  const text = workflow("lua-suite.yml");
  for (const name of CHECK_STEPS) {
    const step = stepNamed(text, name);
    expect(step, `lua-suite has a step named "${name}"`).not.toBe("");
    expect(step, name).toMatch(/^ {8}if: inputs\.checks$/m);
  }
  expect(text).toContain("- run: npm run coverage\n");
  expect(stepNamed(text, "Raid benchmark (harness measurement)")).not.toContain("if:");
  expect(text.match(/^ {8}if: inputs\.checks$/gm)).toHaveLength(CHECK_STEPS.length);
});

it("full-suite runs the checks on every event but a pull request", () => {
  expect(workflow("full-suite.yml")).toContain("checks: ${{ github.event_name != 'pull_request' }}");
});

it("release keeps the checks and skips the preview", () => {
  const text = workflow("release.yml");
  expect(text).toContain("preview: false");
  expect(text).not.toMatch(/^\s+checks:/m);
});

it("lua-suite keeps read-only permissions", () => {
  expect(workflow("lua-suite.yml")).toMatch(/^permissions:\n {2}contents: read\n/m);
});

// Expression evaluator ------------------------------------------------------------------

// The token that starts at `pos` (after any spaces) and the position after it.
function nextToken(src, pos) {
  const re = /\s*(?:('[^']*')|(==|!=|&&|\|\||[!(),])|([A-Za-z_][\w.*-]*))/y;
  re.lastIndex = pos;
  const m = re.exec(src);
  if (!m) throw new Error(`unsupported expression syntax at ${pos}: ${src}`);
  return [m[1] ?? m[2] ?? m[3], re.lastIndex];
}

// The tokens of an expression: strings, operators, parentheses and names.
function tokens(src) {
  const out = [];
  let pos = 0;
  while (src.slice(pos).trim()) {
    const [tok, next] = nextToken(src, pos);
    out.push(tok);
    pos = next;
  }
  return out;
}

// One token as JavaScript: strict comparisons, `github.` names as context lookups.
function jsToken(tok) {
  if (tok === "==") return "===";
  if (tok === "!=") return "!==";
  if (/^(&&|\|\||[!(),]|'[^']*'|contains)$/.test(tok)) return tok;
  if (tok.startsWith("github.")) return `lookup(${JSON.stringify(tok.split(".").slice(1))})`;
  throw new Error(`unsupported name in expression: ${tok}`);
}

// The value at a property path; "*" maps over a list; a missing property reads as undefined.
function walkPath(value, parts) {
  if (!parts.length) return value;
  const [head, ...rest] = parts;
  if (head === "*") return (Array.isArray(value) ? value : []).map((item) => walkPath(item, rest));
  return value == null ? undefined : walkPath(value[head], rest);
}

// contains(list-or-text, x), the one function the workflows call.
function contains(haystack, needle) {
  return (Array.isArray(haystack) || typeof haystack === "string") && haystack.includes(needle);
}

// An expression's value over a github context. && and || return their operands, as in JS.
function evaluate(src, github) {
  const js = tokens(src).map(jsToken).join(" ");
  // The value of a `github.` name, given as its path below `github`.
  const lookup = (parts) => walkPath(github, parts);
  return new Function("lookup", "contains", `return (${js});`)(lookup, contains);
}

// Text with each ${{ }} segment replaced by its value (null reads as empty text).
function expandText(text, github) {
  return text.replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, expr) => String(evaluate(expr, github) ?? ""));
}

// The `if` of a job, from a folded block or a single line, as one line of text.
function jobCondition(text, job) {
  const lines = text.split("\n");
  const body = deeperLines(lines, lines.indexOf(`  ${job}:`) + 1, 2);
  const at = body.findIndex((l) => /^ {4}if:/.test(l));
  if (at < 0) return "";
  const first = body[at].replace(/^ {4}if:\s*/, "");
  if (!/^>-?$/.test(first)) return first.trim();
  return deeperLines(body, at + 1, 4).map((l) => l.trim()).join(" ");
}

// The text after `group:` in a workflow's concurrency block.
function concurrencyGroup(text) {
  return text.match(/^concurrency:\n\s+group: (.*)$/m)?.[1] ?? "";
}

// A github context for a pull request event (or, with `name`, another event).
function ghContext(action, opts = {}) {
  const { name = "pull_request", number = 7, draft = false, labels = [], label } = opts;
  const pr = name === "pull_request" ? { number, draft, labels: labels.map((n) => ({ name: n })) } : undefined;
  return { event_name: name, ref: "refs/heads/main", event: { action, label: label && { name: label }, pull_request: pr } };
}

// The concurrency group full-suite.yml puts a run in.
function groupFor(action, opts) {
  return expandText(concurrencyGroup(workflow("full-suite.yml")), ghContext(action, opts));
}

// Every workflow file in .github/workflows, as { name, text }.
function allWorkflows() {
  const dir = path.join(root, ".github", "workflows");
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((name) => ({ name, text: workflow(name) }));
}

const FULL = "full-tests";
const SUITE_IF_CASES = [
  ["opened, ready for review, no label", "opened", {}, true],
  ["opened as a draft", "opened", { draft: true }, false],
  ["marked ready for review", "ready_for_review", {}, true],
  ["reopened, not a draft", "reopened", {}, true],
  ["reopened as a draft", "reopened", { draft: true }, false],
  ["a push without the label", "synchronize", {}, false],
  ["a push with the label", "synchronize", { labels: [FULL] }, true],
  ["a push to a draft with the label", "synchronize", { draft: true, labels: [FULL] }, false],
  ["the label added", "labeled", { label: FULL, labels: [FULL] }, true],
  ["another label added, no full-tests", "labeled", { label: "bug", labels: ["bug"] }, false],
  ["another label added, full-tests already on", "labeled", { label: "bug", labels: [FULL, "bug"] }, false],
  ["the label added to a draft", "labeled", { draft: true, label: FULL, labels: [FULL] }, false],
  ["the weekly schedule", undefined, { name: "schedule" }, true],
  ["a hand-started run", undefined, { name: "workflow_dispatch" }, true],
];

for (const [title, action, opts, runs] of SUITE_IF_CASES) {
  it(`suite job if: ${title} ${runs ? "runs" : "is skipped"}`, () => {
    const condition = jobCondition(workflow("full-suite.yml"), "suite");
    expect(condition, "the reader finds the suite job's if").toContain("github.event_name");
    expect(evaluate(condition, ghContext(action, opts))).toBe(runs);
  });
}

it("concurrency: ready for review, a push and the label share the pull request's group", () => {
  expect(groupFor("ready_for_review")).toBe("full-suite-pull_request-7");
  expect(groupFor("synchronize")).toBe(groupFor("ready_for_review"));
  expect(groupFor("labeled", { label: FULL, labels: [FULL] })).toBe(groupFor("ready_for_review"));
});

it("concurrency: another label lands in its own group, so it cannot cancel a run", () => {
  const other = groupFor("labeled", { label: "bug", labels: [FULL, "bug"] });
  expect(other).toBe("full-suite-pull_request-7-other-label");
  expect(other).not.toBe(groupFor("ready_for_review"));
  expect(other).not.toBe(groupFor("synchronize", { labels: [FULL] }));
});

it("concurrency: other pull requests and other events get their own groups", () => {
  expect(groupFor("opened", { number: 8 })).not.toBe(groupFor("opened"));
  expect(groupFor(undefined, { name: "schedule" })).toBe("full-suite-schedule-refs/heads/main");
});

it("full-suite types: opened, ready for review, labeled, push and reopened", () => {
  const types = workflow("full-suite.yml").match(/^ {4}types: \[(.*)\]$/m)?.[1] ?? "";
  expect(types.split(", ").sort()).toEqual(["labeled", "opened", "ready_for_review", "reopened", "synchronize"]);
});

it("full-suite keeps its schedule, hand start, inputs, report job and cancel setting", () => {
  const text = workflow("full-suite.yml");
  expect(text).toContain('- cron: "23 10 * * 0"');
  expect(text).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:\n {6}preview:/m);
  expect(text).toContain("preview: ${{ github.event_name == 'schedule' || inputs.preview == true || contains(github.event.pull_request.labels.*.name, 'preview') }}");
  expect(text).toContain("if: always() && github.event_name != 'pull_request' && needs.suite.result != 'cancelled'");
  expect(text).toMatch(/^ {2}cancel-in-progress: true$/m);
});

it("full-suite keeps its permissions and no workflow uses the privileged pull request event", () => {
  expect(workflow("full-suite.yml")).toMatch(/^permissions:\n {2}contents: read\n {2}issues: write\n/m);
  for (const { name, text } of allWorkflows()) expect(text, name).not.toContain("pull_request_target");
});

it("verify keeps its types and draft check and does not depend on the label", () => {
  const text = workflow("verify.yml");
  expect(text).toContain("types: [opened, synchronize, reopened, ready_for_review]");
  expect(text).toContain("if: ${{ !github.event.pull_request.draft }}");
  const code = text.split("\n").filter((l) => !l.trim().startsWith("#"));
  expect(code.join("\n")).not.toContain(FULL);
});

// Docs-only pull requests (#262) -------------------------------------------------------

const DOCS_ONLY_IF = "if: steps.changes.outputs.docs_only != 'true'";

// The steps of verify.yml's quick job, each as its text (from its `- ` line to the next step).
function verifySteps() {
  const lines = workflow("verify.yml").split("\n");
  const starts = lines.flatMap((l, i) => (/^ {6}- /.test(l) ? [i] : []));
  return starts.map((at) => [lines[at], ...deeperLines(lines, at + 1, 6)].join("\n"));
}

it("verify has no path filter, so the required check reports on every pull request", () => {
  const on = workflow("verify.yml").split(/^permissions:/m)[0];
  expect(on).toMatch(/^on:\n {2}pull_request:\n/m);
  expect(on).not.toMatch(/^\s+paths(-ignore)?:/m);
});

it("verify fetches two deep, then its first check works out whether only docs changed", () => {
  const [checkout, changes] = verifySteps();
  expect(checkout).toMatch(/^ {6}- uses: actions\/checkout@/);
  expect(checkout).toMatch(/^ {10}fetch-depth: 2$/m);
  expect(changes).toMatch(/^ {6}- name: Docs-only change$/m);
  expect(changes).toMatch(/^ {8}id: changes$/m);
  expect(runBlocks(changes)).toEqual(["node scripts/docs-only.mjs"]);
  expect(changes).not.toContain("if:");
});

it("every verify step after the spelling check is skipped for a docs-only change, and the job still reports", () => {
  const [spelling, ...later] = verifySteps().slice(2);
  expect(spelling).toMatch(/^ {6}- name: Spelling$/m);
  expect(spelling, "spelling also reads docs-only changes").not.toContain("if:");
  expect(later.length).toBeGreaterThanOrEqual(8);
  for (const step of later) expect(step.split("\n").map((l) => l.trim()), step.split("\n")[0]).toContain(DOCS_ONLY_IF);
  expect(jobCondition(workflow("verify.yml"), "quick")).toBe("${{ !github.event.pull_request.draft }}");
});

it("verify's header says why there is no path filter", () => {
  const header = workflow("verify.yml").split(/^on:/m)[0];
  expect(header).toContain("#262");
  expect(header).toContain("scripts/docs-only.mjs");
});

it("no workflow sets the local login scope override, so CI runs the committed scope data", () => {
  const all = allWorkflows();
  expect(all.length).toBeGreaterThanOrEqual(4);
  for (const { name, text } of all) expect(text, name).not.toContain("VG_LOGIN_SCOPE");
});

it("no run script in any workflow holds an event or input expression", () => {
  const all = allWorkflows().map(({ text }) => runBlocks(text));
  expect(all.flat().length, "the reader finds run scripts").toBeGreaterThan(8);
  for (const b of all.flat()) expect(b).not.toMatch(/\$\{\{\s*(github\.event|inputs\.)/);
});

it("the evaluator reads a missing property as undefined and rejects syntax it does not know", () => {
  const github = ghContext("opened");
  expect(evaluate("github.event.nothing.deeper == 'x'", github)).toBe(false);
  expect(evaluate("github.event.pull_request.labels.*.name", github)).toEqual([]);
  expect(() => evaluate("github.event.action > 1", github)).toThrow(/unsupported expression syntax/);
  expect(() => evaluate("fromJSON('1')", github)).toThrow(/unsupported name/);
});

// Toolchain pins (D-05) ------------------------------------------------------------------

// The SHA-256 of the luacheck 1.2.0 release binary (the Linux x86-64 build) that verify.yml and
// lua-suite.yml install. Confirmed in commit 3-05-01 on 2026-10-10: a fresh download matched
// research's digest under `sha256sum -c`, the release is 835048 bytes, and the release's .asc
// signature verified (Good signature, primary key 9F377DDB6D3153A48EB3EB1E63CC496475267693,
// fetched from keys.openpgp.org and from github.com/alerque.gpg). The release API publishes no
// digest field. Both workflows must hold exactly this value: to change it, verify the new
// digest a second way first, then change this constant and both workflows together.
const LUACHECK_SHA256 = "d68da17fca0697d9e2fb04201f3884abd259fa558b3a449bccaed47f1390defc";
const LUACHECK_URL = "https://github.com/lunarmodules/luacheck/releases/download/v1.2.0/luacheck";
const LUACHECK_STEPS = [
  ["verify.yml", "npm ci, with luacheck 1.2.0 and Lua 5.1 installing alongside"],
  ["lua-suite.yml", "luacheck 1.2.0 and Lua 5.1"],
];

// The run script of the named step in a workflow (the step must exist).
function stepScript(file, name) {
  const step = stepNamed(workflow(file), name);
  expect(step, `${file} has a step named "${name}"`).not.toBe("");
  return runBlocks(step).join("\n");
}

it("both workflows pin the verified luacheck digest and the v1.2.0 release URL in a step env", () => {
  expect(LUACHECK_SHA256).toMatch(/^[0-9a-f]{64}$/);
  for (const [file, name] of LUACHECK_STEPS) {
    const lines = stepNamed(workflow(file), name).split("\n").map((l) => l.trim());
    expect(lines, file).toContain(`LUACHECK_SHA256: ${LUACHECK_SHA256}`);
    expect(lines, file).toContain(`LUACHECK_URL: ${LUACHECK_URL}`);
  }
});

it("each luacheck step installs the binary only after sha256sum -c accepts it", () => {
  for (const [file, name] of LUACHECK_STEPS) {
    const script = stepScript(file, name);
    expect(script, file).toMatch(/"\$LUACHECK_URL"\s*&&\s*echo "\$LUACHECK_SHA256 {2}\$RUNNER_TEMP\/luacheck" \| sha256sum -c -\s*&&/);
    expect(script, file).toMatch(/sha256sum -c -\s*&&\s*sudo install -m 0755 "\$RUNNER_TEMP\/luacheck" \/usr\/local\/bin\/luacheck/);
    expect(script, file).not.toContain("${{");
  }
});

it("the foreground luacheck step ends on the install, so a failed check fails the step", () => {
  const script = stepScript("lua-suite.yml", LUACHECK_STEPS[1][1]).trim();
  expect(script.endsWith("sudo install -m 0755 \"$RUNNER_TEMP/luacheck\" /usr/local/bin/luacheck")).toBe(true);
});

it("verify runs the check in the background tools group, and its wait fails the step", () => {
  const script = stepScript("verify.yml", LUACHECK_STEPS[0][1]);
  expect(script).toMatch(/\) > tools\.log 2>&1 &\n\s*tools_pid=\$!\n\s*npm ci\n/);
  expect(script).toMatch(/wait "\$tools_pid" \|\| \{ cat tools\.log; exit 1; \}/);
  expect(script.indexOf("sha256sum -c")).toBeLessThan(script.indexOf("tools_pid=$!"));
});

// The text of a file in the repository, by its path from the root.
function repoText(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

it(".nvmrc is one plain major version of at least 24 and .pkgmeta leaves it out of the zip", () => {
  const nvmrc = repoText(".nvmrc");
  expect(nvmrc).toMatch(/^\d+\r?\n?$/);
  expect(Number(nvmrc.trim())).toBeGreaterThanOrEqual(24);
  const ignore = repoText(".pkgmeta").split(/^ignore:\s*$/m)[1] ?? "";
  expect([...ignore.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((m) => m[1])).toContain(".nvmrc");
});

it("fengari is exactly 0.1.5 in package.json, the lock's root entry and the lock's resolved entry", () => {
  const pkg = JSON.parse(repoText("package.json")).devDependencies;
  const lock = JSON.parse(repoText("package-lock.json")).packages;
  expect(pkg.fengari).toBe("0.1.5");
  expect(lock[""].devDependencies.fengari).toBe("0.1.5");
  expect(lock["node_modules/fengari"].version).toBe("0.1.5");
  expect(pkg.vitest, "vitest stays exact").toMatch(/^\d+\.\d+\.\d+$/);
  expect(lock[""].devDependencies.vitest).toBe(pkg.vitest);
});

// The text of each `- uses: actions/setup-node` step in a workflow (the step line and what is under it).
function setupNodeSteps(text) {
  const lines = text.split("\n");
  const found = [];
  lines.forEach((line, i) => {
    if (/^\s*-\s+uses:\s+actions\/setup-node@/.test(line)) found.push([line, ...deeperLines(lines, i + 1, line.indexOf("-"))].join("\n"));
  });
  return found;
}

it("every setup-node step reads .nvmrc and keeps the npm cache", () => {
  const counts = { "verify.yml": 1, "lua-suite.yml": 2, "release.yml": 1, "full-suite.yml": 0 };
  for (const [file, count] of Object.entries(counts)) {
    const steps = setupNodeSteps(workflow(file));
    expect(steps.length, `${file} setup-node steps`).toBe(count);
    for (const step of steps) {
      expect(step, file).toMatch(/^\s+node-version-file: \.nvmrc$/m);
      expect(step, file).toMatch(/^\s+cache: npm$/m);
    }
  }
});

it("no workflow names a Node version of its own", () => {
  for (const { name, text } of allWorkflows()) {
    const code = text.split("\n").filter((l) => !l.trim().startsWith("#"));
    expect(code.join("\n"), name).not.toMatch(/^\s*node-version:/m);
  }
});

it("verify and lua-suite both run the TOC check right after the code-quality scan", () => {
  for (const file of ["verify.yml", "lua-suite.yml"]) {
    const text = workflow(file);
    expect(stepScript(file, "The TOC against the files on disk").trim(), file).toBe("node scripts/check-toc.mjs");
    expect(text.indexOf("- name: The TOC against the files on disk"), file).toBeGreaterThan(text.indexOf("run: npm run quality"));
  }
});

it("neither workflow installs luacheck from apt; lua5.1 stays; luacheck prints its version first", () => {
  for (const [file] of LUACHECK_STEPS) {
    const text = workflow(file);
    expect(text, file).not.toContain("lua-check");
    expect(text, file).toContain("sudo apt-get install -y -qq lua5.1");
    const scripts = runBlocks(text).map((b) => b.split("\n").map((l) => l.trim()).join("\n").trim());
    expect(scripts, file).toContain("luacheck --version\nluacheck --no-color .");
  }
});

// Hygiene (#265) -------------------------------------------------------------------------

// Every `uses:` line in the workflows, as { file, ref, comment } (ref is what follows `uses:`).
function usesLines() {
  return allWorkflows().flatMap(({ name, text }) =>
    [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(?:\s+#\s*(.*))?$/gm)].map((m) => ({ file: name, ref: m[1], comment: m[2] ?? "" })),
  );
}

it("every action is pinned to a full commit SHA with its version in a comment; local workflows are exempt", () => {
  const all = usesLines();
  const remote = all.filter((u) => !u.ref.startsWith("./"));
  expect(remote.length, "the reader finds the actions").toBeGreaterThanOrEqual(14);
  expect(all.some((u) => u.ref === "./.github/workflows/lua-suite.yml"), "local workflows are read too").toBe(true);
  for (const u of remote) {
    expect(u.ref, `${u.file}: ${u.ref}`).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
    expect(u.comment, `${u.file}: ${u.ref}`).toMatch(/^v\d+\.\d+\.\d+$/);
  }
});

it("one action is pinned to one SHA and one version everywhere it is used", () => {
  const seen = new Map();
  for (const u of usesLines().filter((x) => !x.ref.startsWith("./"))) {
    const [name, sha] = u.ref.split("@");
    const pin = `${sha} ${u.comment}`;
    expect(seen.get(name) ?? pin, `${u.file}: ${name}`).toBe(pin);
    seen.set(name, pin);
  }
});

it("verify spell-checks with the pinned typos action, configured to skip vendored and generated files", () => {
  expect(verifySteps()[2]).toMatch(/^ {8}uses: crate-ci\/typos@[0-9a-f]{40} # v\d+\.\d+\.\d+$/m);
  const typos = repoText("_typos.toml");
  const exclude = typos.match(/^extend-exclude = \[(.*)\]$/m)?.[1] ?? "";
  for (const dir of ["Libs/", "Media/", "art/"]) expect(exclude).toContain(`"${dir}"`);
  for (const word of ["defensives", "hander", "varian"]) expect(typos).toMatch(new RegExp(`^${word} = "${word}" # `, "m"));
});

it("markdown lint is its own non-required workflow, filtered to Markdown, drafts skipped", () => {
  const text = workflow("markdown.yml");
  const paths = text.match(/^ {4}paths:\n((?: {6}- .*\n)+)/m)?.[1] ?? "";
  expect(paths).toContain('- "docs/**"');
  expect(paths).toContain('- "**.md"');
  expect(text).toMatch(/^ {4}name: Markdown lint$/m);
  expect(text).not.toContain("name: Quick checks");
  expect(jobCondition(text, "lint")).toBe("${{ !github.event.pull_request.draft }}");
  expect(text).toMatch(/uses: DavidAnson\/markdownlint-cli2-action@[0-9a-f]{40} # v/);
  expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
});

it("the markdownlint settings keep the defaults on and say why each rule is off", () => {
  const text = repoText(".markdownlint-cli2.jsonc");
  expect(text).toContain('"default": true');
  const lines = text.split("\n");
  // True for a line that turns one rule off.
  const isOff = (l) => /^\s+"MD\d+": false,?$/.test(l);
  const off = lines.flatMap((l, i) => (isOff(l) ? [i] : []));
  expect(off.length).toBeGreaterThan(0);
  for (const i of off) expect(lines.slice(0, i).reverse().find((l) => !isOff(l)), lines[i]).toMatch(/^\s+\/\/ /);
  expect(text).toContain('".planning/**"');
});

it("the pull request template has the sections CLAUDE.md asks a pull request for", () => {
  const headings = repoText(".github/PULL_REQUEST_TEMPLATE.md").split("\n").filter((l) => l.startsWith("## "));
  expect(headings).toEqual(["## Tasks", "## Tests added", "## Skipped", "## Needs in-game check"]);
});
