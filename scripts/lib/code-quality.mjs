// Code-quality rules for this repo, checked by scripts/check-code-quality.mjs:
//   1. No function body longer than MAX_BODY_LINES lines of code. Blank lines,
//      comment-only lines, the signature line and the closing line don't
//      count; nested functions count toward the function that holds them.
//   2. Every named function has a comment directly above it. A run of
//      one-line functions (e.g. simple accessors) may share one comment.
//   3. Addon Lua (Core/, Modules/) writes no color numbers and no font
//      sizes: colors come from the theme's named tokens and text from its
//      roles, both in Core/Theme.lua.
//   4. Addon Lua (Core/, Modules/) gives hooksecurefunc, SetScript("OnClick", ...)
//      and C_Timer.After / NewTimer / NewTicker a callback that is an
//      ns.Guard(...) call, so an error in it reaches /vg errors (D-03). The one
//      exception is ns.Soon's timer in Core/Combat.lua, which runs each job
//      under ns.Try.
//   5. Addon Lua (Core/, Modules/) uses no syntax newer than Lua 5.1: no goto or
//      ::label::, no // , << , >> , & , | or ~ operator. The test harness parses
//      Lua 5.3 and accepts them; the game does not, and the addon would not load.
//   6. Addon Lua (Core/, Modules/) keeps at most MAX_TOP_LOCALS locals active at the
//      top level of the file. Lua allows 200 per function and the file is one function:
//      the next `local` past 200 stops the whole addon loading (Core/Theme.lua got
//      within 2 of it). Locals inside a do ... end block or a function don't count.
// Test cases (the callback passed to it(...)) are exempt from rule 1.
// Two more rules are report-only (#263, reportSource below): secure calls
// outside a combat guard, and OnUpdate handlers neither throttled nor cleared.
// They fail the scan only when a count rises above scripts/code-quality-baseline.json.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as acorn from "acorn";

export const MAX_BODY_LINES = 10;
// Lua's limit is 200 active locals per function (LUAI_MAXVARS); the scan fails a file at more than this, leaving room to fix it.
export const MAX_TOP_LOCALS = 185;

const LUA_BLOCK_OPEN = new Set(["function", "if", "do", "repeat"]);
const LUA_BLOCK_CLOSE = new Set(["end", "until"]);

// Lua ---------------------------------------------------------------------------

// Length of a Lua long bracket opener ("[[" or "[==[") at i, or -1.
function longBracketLevel(src, i) {
  const m = /^\[(=*)\[/.exec(src.slice(i, i + 64));
  return m ? m[1].length : -1;
}

// Index just past the long bracket closer for `level` starting at i.
function skipLongBracket(src, i, level) {
  const close = "]" + "=".repeat(level) + "]";
  const end = src.indexOf(close, i);
  return end < 0 ? src.length : end + close.length;
}

// Index just past a quoted string starting at i (handles escapes).
function skipQuoted(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
  return j + 1;
}

// Index just past a comment starting at i ("--" line or "--[[ ]]" block).
function skipComment(src, i) {
  const level = longBracketLevel(src, i + 2);
  if (level >= 0) return skipLongBracket(src, i + 2, level);
  const nl = src.indexOf("\n", i);
  return nl < 0 ? src.length : nl;
}

// Splits Lua source into tokens: { kind: "comment" | "string" | "word" | "punct", text, start, end }.
export function tokenizeLua(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const next = nextLuaToken(src, i);
    if (next.kind) tokens.push({ ...next, start: i });
    i = next.end;
  }
  return tokens;
}

// The token (or whitespace run, kind null) starting at i.
function nextLuaToken(src, i) {
  const c = src[i];
  if (/\s/.test(c)) return { kind: null, end: i + 1 };
  if (src.startsWith("--", i)) return { kind: "comment", end: skipComment(src, i) };
  if (c === '"' || c === "'") return { kind: "string", end: skipQuoted(src, i) };
  const level = c === "[" ? longBracketLevel(src, i) : -1;
  if (level >= 0) return { kind: "string", end: skipLongBracket(src, i, level) };
  const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 256));
  if (word) return { kind: "word", text: word[0], end: i + word[0].length };
  return { kind: "punct", text: c, end: i + 1 };
}

// Offsets where each line starts.
function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
}

// Maps a character offset to a 1-based line number (binary search).
function lineIndex(src) {
  const starts = lineStarts(src);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      [lo, hi] = starts[mid] <= offset ? [mid, hi] : [lo, mid - 1];
    }
    return lo + 1;
  };
}

// Name of the function whose `function` keyword is tokens[i], or null if anonymous.
function luaFunctionName(tokens, i) {
  if (tokens[i + 1]?.kind === "word") {
    let name = "";
    for (let j = i + 1; tokens[j] && tokens[j].text !== "("; j++) name += tokens[j].text;
    return name;
  }
  const eq = tokens[i - 1];
  const lhs = tokens[i - 2];
  return eq?.text === "=" && lhs?.kind === "word" && tokens[i - 3]?.text !== "," ? lhs.text : null;
}

// Updates the open-block stack for one keyword; returns a closed function or null.
function trackLuaBlock(stack, tokens, i, line) {
  const t = tokens[i];
  if (LUA_BLOCK_OPEN.has(t.text)) {
    stack.push(t.text === "function" ? { name: luaFunctionName(tokens, i), start: line(t.start) } : null);
    return null;
  }
  if (!LUA_BLOCK_CLOSE.has(t.text)) return null;
  const fn = stack.pop();
  return fn ? { ...fn, end: line(t.start) } : null;
}

// The names a `local` statement declares, given the index of its `local` token in the code tokens.
function localNames(tokens, i) {
  if (tokens[i + 1]?.text === "function") return [tokens[i + 2]];
  const names = [tokens[i + 1]];
  for (let j = i + 1; tokens[j + 1]?.text === ","; j += 2) names.push(tokens[j + 2]);
  return names;
}

// The `local` names declared at the top level of Lua source (not in a function, do, if, for, while or repeat),
// each { name, start }: these are the locals still active at the end of the file's main chunk.
export function topLevelLocals(src) {
  const tokens = codeTokens(src);
  const found = [];
  let depth = 0;
  tokens.forEach((t, i) => {
    if (t.kind !== "word") return;
    depth += LUA_BLOCK_OPEN.has(t.text) ? 1 : LUA_BLOCK_CLOSE.has(t.text) ? -1 : 0;
    if (t.text === "local" && depth === 0) found.push(...localNames(tokens, i).map((n) => ({ name: n.text, start: n.start })));
  });
  return found;
}

// Files near Lua's 200-local limit: [{ line, message }] once the top-level locals pass MAX_TOP_LOCALS.
function topLocalProblems(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const found = topLevelLocals(src);
  if (found.length <= MAX_TOP_LOCALS) return [];
  const message = `${found.length} top-level locals (limit ${MAX_TOP_LOCALS}; Lua stops at 200 and then the addon does not load): move a group into a do ... end block or onto a table`;
  return [{ line: lineIndex(src)(found[MAX_TOP_LOCALS].start), message }];
}

// Every function in Lua source: { name, start, end } (1-based lines).
export function luaFunctions(src) {
  const line = lineIndex(src);
  const tokens = tokenizeLua(src).filter((t) => t.kind !== "comment");
  const stack = [];
  const found = [];
  tokens.forEach((t, i) => {
    const fn = t.kind === "word" ? trackLuaBlock(stack, tokens, i, line) : null;
    if (fn) found.push(fn);
  });
  return found;
}

// Adds every line from `from` to `to` (inclusive) to a set.
function addLines(set, from, to) {
  for (let l = from; l <= to; l++) set.add(l);
}

// Line sets for Lua source: lines holding code, and lines holding comments.
function luaLineKinds(src) {
  const line = lineIndex(src);
  const kinds = { code: new Set(), comment: new Set() };
  for (const t of tokenizeLua(src)) {
    addLines(t.kind === "comment" ? kinds.comment : kinds.code, line(t.start), line(Math.max(t.start, t.end - 1)));
  }
  return kinds;
}

// JavaScript ------------------------------------------------------------------------

// Parses JS (ES modules) with line locations.
function parseJs(src) {
  return acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
}

// Line sets for JS source: lines holding code, and lines holding comments.
function jsLineKinds(src) {
  const kinds = { code: new Set(), comment: new Set() };
  const opts = { ecmaVersion: "latest", sourceType: "module", locations: true, onComment: [] };
  for (const t of acorn.tokenizer(src, opts)) addLines(kinds.code, t.loc.start.line, t.loc.end.line);
  for (const c of opts.onComment) addLines(kinds.comment, c.loc.start.line, c.loc.end.line);
  return kinds;
}

// Visits every AST node, passing its parent.
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else if (value && typeof value === "object" && value.type) walk(value, visit, node);
  }
}

const JS_FUNCTION = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

// Name of a JS function node from its declaration or the binding it is assigned to.
function jsFunctionName(node, parent) {
  if (node.id) return node.id.name;
  if (parent?.type === "VariableDeclarator") return parent.id.name;
  if (parent?.type === "Property" || parent?.type === "MethodDefinition") return parent.key.name ?? parent.key.value;
  return null;
}

// True for the callback of it(...). describe() and attempt() are not exempt.
function isTestCase(parent) {
  return parent?.type === "CallExpression" && parent.callee.name === "it";
}

const NAMED_HOLDER = new Set(["VariableDeclarator", "Property", "MethodDefinition"]);

// One JS function node as { name, start, end, docLine, exempt }.
function describeJsFunction(node, parent) {
  const holder = NAMED_HOLDER.has(parent?.type) ? parent : node;
  return {
    name: jsFunctionName(node, parent),
    start: node.loc.start.line,
    end: node.loc.end.line,
    docLine: holder.loc.start.line,
    exempt: isTestCase(parent),
  };
}

// Every function in JS source.
export function jsFunctions(src) {
  const found = [];
  walk(parseJs(src), (node, parent) => {
    if (JS_FUNCTION.has(node.type)) found.push(describeJsFunction(node, parent));
  });
  return found;
}

// Rules --------------------------------------------------------------------------------

// Lines of code strictly between a function's first and last line.
function bodyLines(fn, kinds) {
  let n = 0;
  for (let l = fn.start + 1; l < fn.end; l++) if (kinds.code.has(l)) n++;
  return n;
}

// Named functions with a comment above them, or in a run of one-line
// functions whose first member has one.
function documentedSet(fns, kinds) {
  const ok = new Set();
  const byLine = new Map(fns.filter((f) => f.name).map((f) => [f.docLine ?? f.start, f]));
  for (const [line, fn] of [...byLine].sort((a, b) => a[0] - b[0])) {
    const commented = kinds.comment.has(line - 1) && !kinds.code.has(line - 1);
    const prev = byLine.get(line - 1);
    const grouped = fn.start === fn.end && prev && prev.start === prev.end && ok.has(prev);
    if (commented || grouped) ok.add(fn);
  }
  return ok;
}

// Problems for one function: [{ line, message }].
function functionProblems(fn, kinds, documented) {
  const label = fn.name ? `${fn.name}()` : "anonymous function";
  const n = bodyLines(fn, kinds);
  const out = [];
  if (!fn.exempt && n > MAX_BODY_LINES) out.push({ line: fn.start, message: `${label} is ${n} lines (max ${MAX_BODY_LINES})` });
  if (fn.name && !documented.has(fn)) out.push({ line: fn.docLine ?? fn.start, message: `${label} has no comment above it` });
  return out;
}

// Colors -------------------------------------------------------------------------------

// Addon Lua that must take its colors from the theme, and the theme itself.
const COLOR_SCOPE = /^(Core|Modules)\/.+\.lua$/;
const COLOR_HOME = "Core/Theme.lua";
// A color setter called with a number as its first argument.
const COLOR_SETTER = /\b(SetTextColor|SetVertexColor|SetStatusBarColor|SetColorTexture|SetBackdropColor|SetBackdropBorderColor|SetShadowColor)\s*\(\s*[-\d.]/g;
// A table of three or four numbers (checked below to be 0-1: a color).
const NUM = String.raw`\s*(\d*\.?\d+)\s*`;
const COLOR_TABLE = new RegExp(String.raw`\{${NUM},${NUM},${NUM}(?:,${NUM})?\}`, "g");
const COLOR_MESSAGE = "color numbers outside Core/Theme.lua: use a theme color (T.RGB, T.Color, T.Tint, T.BarColor, T.Paint)";

// Lua source with comments and strings blanked out (newlines kept), so rules see only code.
function luaCodeOnly(src) {
  let out = "";
  let last = 0;
  for (const t of tokenizeLua(src)) {
    if (t.kind !== "comment" && t.kind !== "string") continue;
    out += src.slice(last, t.start) + src.slice(t.start, t.end).replace(/[^\n]/g, " ");
    last = t.end;
  }
  return out + src.slice(last);
}

// Offsets of color tables: three or four numbers, all between 0 and 1.
function colorTables(code) {
  const hits = [];
  for (const m of code.matchAll(COLOR_TABLE)) {
    if (m.slice(1).filter(Boolean).every((v) => Number(v) <= 1)) hits.push(m.index);
  }
  return hits;
}

// A |c color escape with its color written out ("|cff3d9eff").
const COLOR_ESCAPE = /\|c[0-9a-fA-F]{8}/g;

// Color numbers written outside the theme: [{ line, message }].
function colorProblems(file, src) {
  if (!COLOR_SCOPE.test(file) || file === COLOR_HOME) return [];
  const code = luaCodeOnly(src);
  const line = lineIndex(src);
  const hits = [...code.matchAll(COLOR_SETTER)].map((m) => m.index).concat(colorTables(code));
  hits.push(...[...src.matchAll(COLOR_ESCAPE)].map((m) => m.index));
  return hits.map((i) => ({ line: line(i), message: COLOR_MESSAGE }));
}

// A font set with a written size: T.SetFont(...) or :SetFont(path, 12, ...).
const FONT_SIZE = /\bT\.SetFont\s*\(|:SetFont\s*\([^,()]*,\s*\d/g;
const FONT_MESSAGE = "font size outside Core/Theme.lua: use a text role (T.Text(fs, role))";

// Fonts sized outside the theme's text roles: [{ line, message }].
function fontProblems(file, src) {
  if (!COLOR_SCOPE.test(file) || file === COLOR_HOME) return [];
  const code = luaCodeOnly(src);
  const line = lineIndex(code);
  return [...code.matchAll(FONT_SIZE)].map((m) => ({ line: line(m.index), message: FONT_MESSAGE }));
}

// Spacing constants ---------------------------------------------------------------------

// A padding, gap, margin or inset constant set to one written number.
const SPACING_CONST = /\b[\w.]*(?:PAD|GAP|MARGIN|INSET)\s*=\s*(\d+)\s*$/gm;
const SPACING_SCALE = new Set([0, 1, 2, 4, 8, 12, 16, 24]);
// HUD placement constants that keep their numbers: default spots, slot gaps, hit boxes and the game menu's own section gap, not window padding.
const SPACING_HOME = new Set(["Core/Layout.lua", "Modules/BagSections.lua", "Modules/Minimap.lua", "Modules/Nameplates.lua", "Core/GameMenu.lua"]);
const SPACING_MESSAGE = "spacing constant off the scale: use T.SPACE (tight 4, gap 8, col 12, pad 16, section 24)";

// Padding constants that are not on T.SPACE's scale: [{ line, message }].
function spacingProblems(file, src) {
  if (!COLOR_SCOPE.test(file) || SPACING_HOME.has(file)) return [];
  const code = luaCodeOnly(src);
  const line = lineIndex(code);
  const off = [...code.matchAll(SPACING_CONST)].filter((m) => !SPACING_SCALE.has(Number(m[1])));
  return off.map((m) => ({ line: line(m.index), message: SPACING_MESSAGE }));
}

// Bare hooks, clicks and timers --------------------------------------------------------

const TIMER_CALLS = new Set(["After", "NewTimer", "NewTicker"]);
// The one file whose bare timer is allowed: ns.Soon runs each job under ns.Try.
const SOON_HOME = "Core/Combat.lua";

// Code tokens of Lua source (comments dropped), each carrying its source text.
function codeTokens(src) {
  return tokenizeLua(src)
    .filter((t) => t.kind !== "comment")
    .map((t) => ({ ...t, text: t.text ?? src.slice(t.start, t.end) }));
}

// The call whose name starts at tokens[i], as { kind, open } (open is the index of its "("), or null.
function callbackCall(tokens, i) {
  // Text of the token at k, if there is one.
  const at = (k) => tokens[k]?.text;
  if (at(i) === "hooksecurefunc" && at(i + 1) === "(") return { kind: "hooksecurefunc", open: i + 1 };
  if (at(i) === "SetScript" && at(i + 1) === "(" && /^["']OnClick["']$/.test(at(i + 2))) return { kind: "OnClick", open: i + 1 };
  if (at(i) === "C_Timer" && at(i + 1) === "." && TIMER_CALLS.has(at(i + 2)) && at(i + 3) === "(") return { kind: `C_Timer.${at(i + 2)}`, open: i + 3 };
  return null;
}

// +1 for a token that opens a bracket or block, -1 for one that closes it, else 0.
function nesting(t) {
  if (t.kind === "punct") return "([{".includes(t.text) ? 1 : "}])".includes(t.text) ? -1 : 0;
  if (t.kind !== "word") return 0;
  return LUA_BLOCK_OPEN.has(t.text) ? 1 : LUA_BLOCK_CLOSE.has(t.text) ? -1 : 0;
}

// The top-level arguments, as token lists, of the call whose "(" is tokens[open].
function callArgs(tokens, open) {
  const args = [[]];
  let depth = 1;
  for (let k = open + 1; depth > 0 && k < tokens.length; k++) {
    depth += nesting(tokens[k]);
    if (depth === 1 && tokens[k].text === ",") args.push([]);
    else if (depth > 0) args[args.length - 1].push(tokens[k]);
  }
  return args;
}

// True when the callback begins ns.Guard( , or is a literal nil clearing a click script.
function isGuarded(call, callback) {
  const head = callback.slice(0, 4).map((t) => t.text).join("");
  return head === "ns.Guard(" || (call.kind === "OnClick" && callback.length === 1 && callback[0].text === "nil");
}

// True for ns.Soon's next-frame timer: a C_Timer.After in SOON_HOME whose callback calls runSoon.
function isSoonTimer(file, call, callback) {
  return file === SOON_HOME && call.kind === "C_Timer.After" && callback.some((t) => t.text === "runSoon");
}

// True when the call at tokens[i] hands a bare function to a hook, click or timer.
function isBareCallback(file, tokens, i) {
  const call = callbackCall(tokens, i);
  if (!call) return false;
  const args = callArgs(tokens, call.open);
  const callback = (call.kind === "OnClick" ? args[1] : args[args.length - 1]) ?? [];
  return !isGuarded(call, callback) && !isSoonTimer(file, call, callback);
}

// Hooks, clicks and timers whose callback is not an ns.Guard(...) call: [{ line, message }].
function bareCallbackProblems(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = codeTokens(src);
  const line = lineIndex(src);
  return tokens.flatMap((t, i) => {
    if (!isBareCallback(file, tokens, i)) return [];
    const kind = callbackCall(tokens, i).kind;
    return [{ line: line(t.start), message: `bare ${kind} callback: wrap it in ns.Guard(where, fn) so its errors reach /vg errors` }];
  });
}

// Lua 5.1 only ---------------------------------------------------------------------------

// The operators Lua 5.3 added (integer division, bit operations, labels), by their characters.
const LUA53_OPERATORS = new Set(["//", "<<", ">>", "::", "&", "|", "~"]);

// The Lua 5.3 operator that starts at tokens[i] ("//", "&", ...), or null; "~=" is Lua 5.1's own.
function lua53Operator(tokens, i) {
  const t = tokens[i];
  if (t.kind !== "punct") return null;
  const next = tokens[i + 1];
  const pair = next?.kind === "punct" && next.start === t.start + 1 ? t.text + next.text : null;
  if (LUA53_OPERATORS.has(pair)) return pair;
  return LUA53_OPERATORS.has(t.text) && pair !== "~=" ? t.text : null;
}

// True when tokens[i] is a goto statement (the word, then a label), not a field or method named goto.
function isGoto(tokens, i) {
  return tokens[i].text === "goto" && tokens[i + 1]?.kind === "word" && ![".", ":"].includes(tokens[i - 1]?.text);
}

// Lua 5.3 syntax in addon Lua: [{ line, message }]. Only the game's Lua 5.1 loads the addon.
function lua51Problems(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = tokenizeLua(src).filter((t) => t.kind !== "comment");
  const line = lineIndex(src);
  return tokens.flatMap((t, i) => {
    const what = isGoto(tokens, i) ? "goto" : lua53Operator(tokens, i);
    return what ? [{ line: line(t.start), message: `Lua 5.3 syntax (${what}): the game runs Lua 5.1 and would not load this file` }] : [];
  });
}

// The Lua and JS files in the repo at root: tracked ones and new ones git
// would add (ignored files and deleted ones left out), each once, in order.
export function sourceFiles(root) {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.lua", "*.mjs", "*.js"], { cwd: root, encoding: "utf8" });
  return [...new Set(out.split("\n"))].filter((f) => f && fs.existsSync(path.join(root, f)));
}

// Problems in one file: [{ line, message }].
export function checkSource(file, src) {
  const lua = file.endsWith(".lua");
  const kinds = lua ? luaLineKinds(src) : jsLineKinds(src);
  const fns = lua ? luaFunctions(src) : jsFunctions(src);
  const documented = documentedSet(fns, kinds);
  const out = fns.flatMap((fn) => functionProblems(fn, kinds, documented));
  return lua ? out.concat(colorProblems(file, src), fontProblems(file, src), spacingProblems(file, src), bareCallbackProblems(file, src), lua51Problems(file, src), topLocalProblems(file, src)) : out;
}

// Report-only rules (#263) -------------------------------------------------------------
// Two heuristics for the game rules that cause the subtlest bugs. They count, they don't
// block: scripts/check-code-quality.mjs fails only when a count rises above its baseline in
// scripts/code-quality-baseline.json (a ratchet, like scripts/lua-coverage-floor.json). A
// rule becomes blocking once it is quiet on main. Both have false positives by design.
//   secure-outside-combat-guard: a call that changes a secure frame or a binding (refused in
//     combat) sits in no function that runs under ns.OutOfCombat or checks InCombatLockdown()
//     / ns.InCombat() before it. Code at a file's top level runs at load and counts as safe.
//   unbounded-onupdate: an OnUpdate handler that neither waits on the elapsed time it adds up
//     (or on GetTime()) nor is cleared anywhere in its file with SetScript("OnUpdate", nil).
//   unguarded-script-handler: a SetScript or HookScript handler (OnEnter, OnShow, OnKeyDown...)
//     that is not an ns.Guard(...) call, so its error reaches the game's popup but never
//     /vg errors. OnClick on SetScript is the blocking rule above; OnUpdate has its own rule.

export const REPORT_RULES = ["secure-outside-combat-guard", "unbounded-onupdate", "unguarded-script-handler", "unwrapped-text"];

// Calls the client refuses on protected frames, or for bindings, while in combat.
const SECURE_CALLS = new Set([
  "SetAttribute", "RegisterStateDriver", "UnregisterStateDriver", "RegisterAttributeDriver", "UnregisterAttributeDriver",
  "SecureHandlerExecute", "SecureHandlerWrapScript", "SecureHandlerUnwrapScript", "SecureHandlerSetFrameRef",
  "RegisterUnitWatch", "UnregisterUnitWatch", "ClearOverrideBindings",
  "SetOverrideBinding", "SetOverrideBindingClick", "SetOverrideBindingSpell", "SetOverrideBindingMacro", "SetOverrideBindingItem",
]);
// Files whose secure calls all run where the frame is made and set up, in the same safe
// window. Add a file only after reading every call in it; empty means none is excused.
export const SECURE_ALLOW = new Set([]);
// Words that, before a secure call in the same function, mean it checks for combat first.
const COMBAT_CHECKS = new Set(["InCombatLockdown", "InCombat"]);

// The last part of a dotted or method name ("ns.Bars:Apply" gives "Apply").
const lastPart = (name) => name.split(/[.:]/).pop();

// Every function in code tokens as { open, close, name }: token indexes of `function` and its `end`.
function functionSpans(tokens) {
  const stack = [];
  const spans = [];
  tokens.forEach((t, i) => {
    if (t.kind !== "word" || !(LUA_BLOCK_OPEN.has(t.text) || LUA_BLOCK_CLOSE.has(t.text))) return;
    if (LUA_BLOCK_OPEN.has(t.text)) stack.push(t.text === "function" ? { open: i, name: luaFunctionName(tokens, i) } : null);
    else spans.push({ ...stack.pop(), close: i });
  });
  return spans.filter((s) => s.open !== undefined);
}

// The index of the token that closes the "(" at tokens[open] (the last token if none does).
function closeParen(tokens, open) {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    depth += nesting(tokens[k]);
    if (depth === 0) return k;
  }
  return tokens.length - 1;
}

// [open, close] token ranges of each ns.OutOfCombat( ... ) call's arguments.
function deferRanges(tokens) {
  return tokens.flatMap((t, i) => {
    const call = t.text === "ns" && tokens[i + 1]?.text === "." && tokens[i + 2]?.text === "OutOfCombat" && tokens[i + 3]?.text === "(";
    return call ? [[i + 3, closeParen(tokens, i + 3)]] : [];
  });
}

// True when the call at tokens[i] is one of SECURE_CALLS (not its definition or a mention).
function isSecureCall(tokens, i) {
  return SECURE_CALLS.has(tokens[i].text) && tokens[i + 1]?.text === "(" && tokens[i - 1]?.text !== "function";
}

// The words of tokens[a..b].
const wordsIn = (tokens, a, b) => tokens.slice(a, b + 1).filter((t) => t.kind === "word").map((t) => t.text);

// Functions that run out of combat: passed to ns.OutOfCombat, or named by a function that
// does (inside its arguments, or in a function already known to run there; same file only).
function deferredSpans(tokens, spans, ranges) {
  const names = new Set(ranges.flatMap(([a, b]) => wordsIn(tokens, a, b)));
  const safe = new Set();
  for (let grew = true; grew; ) {
    const more = spans.filter((s) => !safe.has(s) && (ranges.some(([a, b]) => a < s.open && s.close <= b) || (s.name && names.has(lastPart(s.name)))));
    more.forEach((s) => safe.add(s) && wordsIn(tokens, s.open, s.close).forEach((w) => names.add(w)));
    grew = more.length > 0;
  }
  return safe;
}

// True when the secure call at tokens[i] is at the top level (load time), or a function holding it
// runs out of combat (deferredSpans) or checks for combat before it.
function isCombatSafeAt(ctx, i) {
  const enclosing = ctx.spans.filter((s) => s.open < i && i < s.close);
  // True when function s checks for combat before tokens[i].
  const checks = (s) => ctx.tokens.slice(s.open, i).some((t) => COMBAT_CHECKS.has(t.text));
  return !enclosing.length || enclosing.some((s) => ctx.safe.has(s) || checks(s));
}

// Secure calls outside a combat guard: [{ rule, line, message }].
function unguardedSecureCalls(file, src) {
  if (!COLOR_SCOPE.test(file) || SECURE_ALLOW.has(file)) return [];
  const tokens = codeTokens(src);
  const spans = functionSpans(tokens);
  const ctx = { tokens, spans, safe: deferredSpans(tokens, spans, deferRanges(tokens)) };
  const line = lineIndex(src);
  const hits = tokens.flatMap((t, i) => (isSecureCall(tokens, i) && !isCombatSafeAt(ctx, i) ? [t] : []));
  const message = `outside a combat guard: run it through ns.OutOfCombat, or check InCombatLockdown() first`;
  return hits.map((t) => ({ rule: REPORT_RULES[0], line: line(t.start), message: `${t.text}() ${message}` }));
}

// The OnUpdate scripts set in code tokens, as { at, handler } (handler: the argument's tokens).
function onUpdateCalls(tokens) {
  return tokens.flatMap((t, i) => {
    const hit = (t.text === "SetScript" || t.text === "HookScript") && tokens[i + 1]?.text === "(" && /^["']OnUpdate["']$/.test(tokens[i + 2]?.text);
    return hit ? [{ at: i, handler: callArgs(tokens, i + 1)[1] ?? [] }] : [];
  });
}

// The tokens of a handler's function: the literal itself, or the function its name points to in the file.
function handlerBody(tokens, spans, handler) {
  if (handler.some((t) => t.text === "function")) return handler;
  const names = new Set(handler.filter((t) => t.kind === "word").map((t) => t.text));
  const span = spans.find((s) => s.name && names.has(lastPart(s.name)));
  return span ? tokens.slice(span.open, span.close + 1) : [];
}

const SIGNS = new Set(["+", "-"]);

// True when a handler adds up (or counts down) its elapsed time, its second parameter, and
// acts only past a threshold, or returns early on GetTime().
function isThrottled(body) {
  const words = body.map((t) => t.text);
  const open = words.indexOf("(", words.indexOf("function"));
  const params = words.slice(open + 1, words.indexOf(")", open)).filter((w) => w !== ",");
  const elapsed = params[1];
  const adds = elapsed !== undefined && words.some((w, k) => w === elapsed && (SIGNS.has(words[k - 1]) || SIGNS.has(words[k + 1])));
  const gates = words.includes("return") || words.includes("if");
  return (adds && gates) || (words.includes("GetTime") && words.includes("return"));
}

const ONUPDATE_MESSAGE = 'OnUpdate handler neither throttled nor cleared: return early until enough elapsed time adds up, or SetScript("OnUpdate", nil) when done';

// OnUpdate handlers neither throttled nor cleared in their file: [{ rule, line, message }].
function unboundedOnUpdates(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = codeTokens(src);
  const calls = onUpdateCalls(tokens);
  if (calls.some((c) => c.handler.some((t) => t.text === "nil"))) return [];
  const spans = functionSpans(tokens);
  const line = lineIndex(src);
  const loose = calls.filter((c) => !isThrottled(handlerBody(tokens, spans, c.handler)));
  return loose.map((c) => ({ rule: REPORT_RULES[1], line: line(tokens[c.at].start), message: ONUPDATE_MESSAGE }));
}

// The script handlers set in code tokens, as { at, script, handler }, except OnClick on
// SetScript (the blocking rule) and OnUpdate (its own rule).
function scriptHandlerCalls(tokens) {
  return tokens.flatMap((t, i) => {
    const method = t.text === "SetScript" || t.text === "HookScript";
    const script = method && tokens[i + 1]?.text === "(" ? /^["'](On\w+)["']$/.exec(tokens[i + 2]?.text ?? "")?.[1] : null;
    if (!script || script === "OnUpdate" || (script === "OnClick" && t.text === "SetScript")) return [];
    return [{ at: i, script, handler: callArgs(tokens, i + 1)[1] ?? [] }];
  });
}

// True when a handler argument clears the script (nil, or an expression ending in nil).
const clearsScript = (handler) => handler.length === 0 || handler[handler.length - 1].text === "nil";

// Script handlers that are not an ns.Guard(...) call in their file: [{ rule, line, message }].
function unguardedScriptHandlers(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = codeTokens(src);
  const line = lineIndex(src);
  const loose = scriptHandlerCalls(tokens).filter((c) => !clearsScript(c.handler) && c.handler.slice(0, 4).map((t) => t.text).join("") !== "ns.Guard(");
  return loose.map((c) => ({ rule: REPORT_RULES[2], line: line(tokens[c.at].start), message: `${c.script} handler is not an ns.Guard(where, fn) call, so its errors never reach /vg errors` }));
}

// The calls whose first argument is text a player reads: widget text, tooltip lines, chat,
// option rows and dialogs. A literal there is English the string table can't translate.
const TEXT_SINKS = new Set(["SetText", "AddLine", "AddDoubleLine", "Chat", "check", "header", "cycle", "slider", "OfferReload", "ShowText"]);

// True when a string token is words a player reads: it has a letter, and no backslash (a path).
const isWords = (text) => /[A-Za-z]/.test(text) && !text.includes("\\") && !text.startsWith('"|T');

// English literals handed straight to a text sink, not through L["…"]: [{ rule, line, message }].
function unwrappedText(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = codeTokens(src);
  const line = lineIndex(src);
  const hits = tokens.filter((t, i) => t.kind === "string" && tokens[i - 1]?.text === "(" && TEXT_SINKS.has(tokens[i - 2]?.text) && isWords(t.text));
  return hits.map((t) => ({ rule: REPORT_RULES[3], line: line(t.start), message: `English text not in L[…]: ${t.text.slice(0, 48)}` }));
}

// Report-only findings in one file: [{ rule, line, message }]. They never fail on their own.
export function reportSource(file, src) {
  if (!file.endsWith(".lua")) return [];
  return unguardedSecureCalls(file, src).concat(unboundedOnUpdates(file, src), unguardedScriptHandlers(file, src), unwrappedText(file, src));
}

// Each report-only rule's count against its baseline (a missing baseline is 0):
// [{ rule, count, baseline, status }], status "above" (fails), "below" (lower the baseline) or "at".
export function compareToBaseline(counts, baseline) {
  return REPORT_RULES.map((rule) => {
    const [count, base] = [counts[rule] ?? 0, baseline[rule] ?? 0];
    return { rule, count, baseline: base, status: count > base ? "above" : count < base ? "below" : "at" };
  });
}
