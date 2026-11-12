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
//      Quoted strings use no \x, \z or \u{...} escape: luac5.1 accepts them, but the
//      game reads them as plain letters while the harness decodes them.
//   6. Addon Lua (Core/, Modules/) keeps at most MAX_TOP_LOCALS locals of the main chunk alive at
//      once. Lua allows 200 per function and the file is one function: the next `local` past 200
//      stops the whole addon loading (Core/Theme.lua got within 2 of it). The count is the peak:
//      the locals of a do, if, for, while or repeat block count while it is open (it frees them at
//      its end), and a for loop holds three hidden ones. Locals inside a function don't count.
//   7. Addon Lua (Core/, Modules/) makes no secure call (SetAttribute, a state driver, an
//      override binding, the panel manager's ShowUIPanel or HideUIPanel, the SecureHandler method forms
//      WrapScript, UnwrapScript, Execute and SetFrameRef on a frame) outside a combat guard (report-only under
//      #263 until it was quiet on main). A guard is a function run through ns.OutOfCombat (matched by its whole
//      name), an `if` on ns.InCombat() or the bare InCombatLockdown(), called (un-negated, not joined by `and`, not
//      compared, not in a negated bracket) whose branch ends in return and comes before the call in the same blocks (the same
//      branch of an enclosing if) of the same function, or a call inside `if not ns.InCombat() then`. Known limit: a function deferred once is trusted for every call of its name.
// Test cases (the callback passed to it(...)) are exempt from rule 1.
// More rules are report-only (reportSource below): OnUpdate handlers neither throttled nor
// cleared, unguarded script handlers, unwrapped text, secret truth tests, pcall results tested
// for truth and long lines. They fail the scan only when a count rises above
// scripts/code-quality-baseline.json.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as acorn from "acorn";

export const MAX_BODY_LINES = 10;
// Lua's limit is 200 active locals per function (LUAI_MAXVARS); the scan fails a file at more than this, leaving
// room to fix it (30 under the limit: a feature's locals arrive in a batch).
export const MAX_TOP_LOCALS = 170;
// The longest line of addon Lua the line-length ratchet lets through (report-only rule long-line).
export const MAX_LINE = 160;

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

// The index of the "[" that opens the bracketed key ending at tokens[close] (a "]"), or -1.
function openBracket(tokens, close) {
  let depth = 0;
  for (let k = close; k >= 0; k--) {
    depth += tokens[k].text === "]" ? 1 : tokens[k].text === "[" ? -1 : 0;
    if (depth === 0) return k;
  }
  return -1;
}

// A function the comment rule leaves unnamed because it is a table field: `, key = function` (after a comma) or
// `X[key] = function` / `[key] = function` (a bracketed key). { label, at }: its key as written, and the token its
// statement starts at (where a comment above it counts). null for any other function.
function fieldFunction(tokens, i) {
  if (tokens[i - 1]?.text !== "=" || tokens[i + 1]?.kind === "word") return null;
  const lhs = tokens[i - 2];
  if (lhs?.kind === "word" && tokens[i - 3]?.text === ",") return { label: lhs.text, at: lhs };
  const open = lhs?.text === "]" ? openBracket(tokens, i - 2) : -1;
  if (open < 0) return null;
  const owner = ["word", "string"].includes(tokens[open - 1]?.kind) || [")", "]"].includes(tokens[open - 1]?.text) ? tokens[open - 1] : tokens[open];
  return { label: tokens.slice(open, i - 1).map((t) => t.text).join(""), at: owner };
}

// Updates the open-block stack for one keyword; returns a closed function or null.
function trackLuaBlock(stack, tokens, i, line) {
  const t = tokens[i];
  if (LUA_BLOCK_OPEN.has(t.text)) {
    const field = t.text === "function" ? fieldFunction(tokens, i) : null;
    stack.push(t.text === "function" ? { name: luaFunctionName(tokens, i), field: field && { label: field.label, line: line(field.at.start) }, start: line(t.start) } : null);
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

// The locals a `for` loop starts, from the `for` at tokens[i]: its names after the word, and the three hidden
// state locals the Lua 5.1 compiler adds (the loop index, limit and step, or the generator, state and control).
function forLocals(tokens, i) {
  let names = 1;
  for (let k = i + 1; tokens[k] && ![":", "="].includes(tokens[k].text) && tokens[k].text !== "in"; k++) names += tokens[k].text === "," ? 1 : 0;
  return names + 3;
}

// Moves the scope stack of the main chunk's blocks on by the token at tokens[i]. Each entry is { fn, count }: a function
// body (its locals are its own) or a block with the locals it declared so far. A loop's hidden locals arrive with its `do`.
function stepScopes(state, tokens, i) {
  const [t, top] = [tokens[i], state.stack[state.stack.length - 1]];
  if (t.kind !== "word") return;
  if (t.text === "for") state.pendingFor = forLocals(tokens, i);
  else if (t.text === "function") state.stack.push({ fn: true, count: 0 });
  else if (LUA_BLOCK_OPEN.has(t.text)) state.stack.push({ fn: false, count: t.text === "do" ? state.pendingFor : 0 });
  else if (LUA_BLOCK_CLOSE.has(t.text)) state.stack.pop();
  else if (t.text === "else" || t.text === "elseif") top.count = 0;
  if (t.text === "do") state.pendingFor = 0;
}

// How many main-chunk locals are alive now: those of the open blocks, or 0 inside a function (its locals are its own).
function aliveLocals(state) {
  return state.stack.some((e) => e.fn) ? 0 : state.stack.reduce((n, e) => n + e.count, 0);
}

// Moves the scope walk on by tokens[i] and notes the locals alive now in seen: { peak, over }.
function noteLocals(state, seen, tokens, i) {
  stepScopes(state, tokens, i);
  const names = tokens[i].text === "local" && tokens[i].kind === "word" ? localNames(tokens, i) : [];
  state.stack[state.stack.length - 1].count += names.length;
  const alive = aliveLocals(state);
  if (alive > MAX_TOP_LOCALS && seen.over < 0) seen.over = (names.at(-1) ?? tokens[i]).start;
  seen.peak = Math.max(seen.peak, alive);
}

// The most `local`s the main chunk has alive at once, counting those in open do, if, for, while and repeat blocks
// (a block frees its locals only after its end, and a for loop holds three hidden ones): { peak, over }, where over is
// the offset of the local that took the count past MAX_TOP_LOCALS, or -1.
export function topLocalPeak(src) {
  const tokens = codeTokens(src);
  const state = { stack: [{ fn: false, count: 0 }], pendingFor: 0 };
  const seen = { peak: 0, over: -1 };
  tokens.forEach((t, i) => noteLocals(state, seen, tokens, i));
  return seen;
}

// Files near Lua's 200-local limit: [{ line, message }] once the main chunk's locals alive at once pass MAX_TOP_LOCALS.
function topLocalProblems(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const { peak, over } = topLocalPeak(src);
  if (peak <= MAX_TOP_LOCALS) return [];
  const message = `${peak} top-level locals at once (limit ${MAX_TOP_LOCALS}; Lua stops at 200 and then the addon does not load): move a group onto a table (a do ... end block frees its locals only at its end, and a for loop holds three hidden ones)`;
  return [{ line: lineIndex(src)(over), message }];
}

// Every function in Lua source: { name, start, end } (1-based lines).
export function luaFunctions(src) {
  const line = lineIndex(src);
  const tokens = codeTokens(src);
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
const COLOR_SETTER = /\b(SetTextColor|SetVertexColor|SetStatusBarColor|SetColorTexture|SetBackdropColor|SetBackdropBorderColor|SetShadowColor|SetSwipeColor|CreateColor)\s*\(\s*[-\d.]/g;

// A table of three or four numbers (checked below to be 0-1: a color).
const NUM = String.raw`\s*(\d*\.?\d+)\s*`;
const COLOR_TABLE = new RegExp(String.raw`\{${NUM},${NUM},${NUM}(?:,${NUM})?\}`, "g");
// The fields that make a table a color when each is one written number from 0 to 1 (rgbFieldTables).
const RGB_NAMES = ["r", "g", "b"];
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

// The value of the table field named by tokens[k] (`r = 0.82` after a "{", "," or ";") when it is one written
// number, else NaN.
function fieldNumber(tokens, k) {
  if (![",", ";", "{"].includes(tokens[k - 1]?.text) || tokens[k + 1]?.text !== "=" || tokens[k + 2]?.text === "=") return NaN;
  let end = k + 2;
  while (/^[\d.]$/.test(tokens[end]?.text ?? "")) end++;
  const text = tokens.slice(k + 2, end).map((t) => t.text).join("");
  return [",", ";", "}"].includes(tokens[end]?.text) && /\d/.test(text) ? Number(text) : NaN;
}

// Adds to hits the offset of a closed table's first r, g or b field when all three are written numbers from 0 to 1.
function rgbHit(fields, hits) {
  const found = RGB_NAMES.map((name) => fields?.[name]);
  if (found.every((f) => f && f.value >= 0 && f.value <= 1)) hits.push(Math.min(...found.map((f) => f.at)));
}

// Offsets of tables whose r, g and b fields, in any order and with any other fields among them, are each one
// written number from 0 to 1 ({ b = 0, g = 0.82, r = 1 }): a color written out. Only a table's own fields count.
function rgbFieldTables(tokens) {
  const hits = [];
  const open = [];
  tokens.forEach((t, k) => {
    const table = open.at(-1);
    if (t.kind === "punct" && "{([".includes(t.text)) open.push(t.text === "{" ? {} : null);
    else if (t.kind === "punct" && "})]".includes(t.text)) rgbHit(open.pop(), hits);
    else if (t.kind === "word" && table && RGB_NAMES.includes(t.text)) table[t.text] ??= { at: t.start, value: fieldNumber(tokens, k) };
  });
  return hits;
}

// Offsets of CreateColorFromHexString calls given a written string ("ff8800"): a color the theme does not own.
function hexStringColors(src) {
  const tokens = codeTokens(src);
  return tokens.flatMap((t, i) => (t.text === "CreateColorFromHexString" && tokens[i + 1]?.text === "(" && tokens[i + 2]?.kind === "string" ? [t.start] : []));
}

// A |c color escape with its color written out ("|cff3d9eff").
const COLOR_ESCAPE = /\|c[0-9a-fA-F]{8}/g;

// Color numbers written outside the theme: [{ line, message }].
function colorProblems(file, src) {
  if (!COLOR_SCOPE.test(file) || file === COLOR_HOME) return [];
  const code = luaCodeOnly(src);
  const line = lineIndex(src);
  const hits = [...code.matchAll(COLOR_SETTER)].map((m) => m.index).concat(colorTables(code), rgbFieldTables(codeTokens(src)));
  hits.push(...[...src.matchAll(COLOR_ESCAPE)].map((m) => m.index), ...hexStringColors(src));
  return hits.map((i) => ({ line: line(i), message: COLOR_MESSAGE }));
}

// A font sized with T.SetFont(...); fs:SetFont(path, 12) and fs:SetTextHeight(14) are read by writtenFontSize.
const FONT_SIZE = /\bT\.SetFont\s*\(/g;
const FONT_MESSAGE = "font size outside Core/Theme.lua: use a text role (T.Text(fs, role))";
// The argument that holds the size, by font method: fs:SetFont(path, size, flags), fs:SetTextHeight(size).
const FONT_SIZE_ARG = new Map([["SetFont", 1], ["SetTextHeight", 0]]);

// True when the token at tokens[i] is the method :SetFont or :SetTextHeight whose size argument is a written size:
// one that starts with a number (12, 12 * scale), or `x or 12`. A number inside brackets (was[2]), a size worked out
// from a name (size + 2) or a vararg (...) is not, and a dotted call is a module's own.
function writtenFontSize(tokens, i) {
  const arg = FONT_SIZE_ARG.get(tokens[i].text);
  if (arg === undefined || tokens[i - 1]?.text !== ":" || tokens[i + 1]?.text !== "(") return false;
  const size = callArgs(tokens, i + 1)[arg] ?? [];
  if (/^\d$/.test(size[0]?.text ?? "")) return true;
  let head = size.length;
  while (head > 0 && /^[\d.]$/.test(size[head - 1].text)) head--;
  const number = size.slice(head).some((t) => /^\d$/.test(t.text));
  return number && (head === 0 || size[head - 1].text === "or");
}

// Fonts sized outside the theme's text roles: [{ line, message }].
function fontProblems(file, src) {
  if (!COLOR_SCOPE.test(file) || file === COLOR_HOME) return [];
  const code = luaCodeOnly(src);
  const tokens = codeTokens(src);
  const found = [...code.matchAll(FONT_SIZE)].map((m) => m.index).concat(tokens.flatMap((t, i) => (writtenFontSize(tokens, i) ? [t.start] : [])));
  const line = lineIndex(code);
  return found.map((at) => ({ line: line(at), message: FONT_MESSAGE }));
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

// An unescaped backslash before x, z or u{ : the escapes Lua 5.2 and 5.3 added.
const LUA52_ESCAPE = /(?:^|[^\\])(?:\\\\)*(\\(?:x|z|u\{))/;

// The Lua 5.2+ escape ("\x", "\z", "\u{") in a quoted string token, or null. Lua 5.1 reads it as the letter alone.
function lua52Escape(src, t) {
  const text = src.slice(t.start, t.end);
  if (t.kind !== "string" || !/^["']/.test(text)) return null;
  return LUA52_ESCAPE.exec(text)?.[1] ?? null;
}

// Lua 5.3 syntax in addon Lua: [{ line, message }]. Only the game's Lua 5.1 loads the addon.
function lua51Problems(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = tokenizeLua(src).filter((t) => t.kind !== "comment");
  const line = lineIndex(src);
  return tokens.flatMap((t, i) => {
    const what = isGoto(tokens, i) ? "goto" : lua53Operator(tokens, i);
    if (what) return [{ line: line(t.start), message: `Lua 5.3 syntax (${what}): the game runs Lua 5.1 and would not load this file` }];
    const escape = lua52Escape(src, t);
    return escape ? [{ line: line(t.start), message: `Lua 5.2 string escape (${escape}): the game's Lua 5.1 reads it as plain letters; use a decimal escape` }] : [];
  });
}

// The Lua and JS files in the repo at root: tracked ones and new ones git
// would add (ignored files and deleted ones left out), each once, in order.
export function sourceFiles(root) {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.lua", "*.mjs", "*.js"], { cwd: root, encoding: "utf8" });
  return [...new Set(out.split("\n"))].filter((f) => f && fs.existsSync(path.join(root, f)));
}

// File-scope subscriptions (A4-3, docs/design/MODULE-LIFECYCLE.md 4.2) --------------------------------------
// An ns.On, ns.OnUnit or ns.Every outside every function in an addon file outside Core/ runs whether or not its
// feature is switched on, and the module lifecycle can't take it down. It fails unless FILE_SCOPE_ALLOWED names the
// file with how many it has and why; a count only goes down (scripts/code-quality.test.mjs holds it exact).
const SUBSCRIBE_CALLS = new Set(["On", "OnUnit", "Every"]);
const SUBSCRIBE_SCOPE = /^(Modules|Locales)\/.+\.lua$/;
const SUBSCRIBE_MESSAGE = "at file scope: register it in the module's Enable (through its scope), or list the file in FILE_SCOPE_ALLOWED (scripts/lib/code-quality.mjs) with its count and reason";

// The allowlist: file -> { calls, reason }. Module files the lifecycle sweep (A4-3) moves into Enable, and files that
// belong to no module.
export const FILE_SCOPE_ALLOWED = {
  "Modules/ActionBarKeybinds.lua": { calls: 1, reason: "keybind mode leaves at combat start; part of ActionBars, which stays reload-only (A4-3 moves it into its Enable)" },
  "Modules/AuctionCrafting.lua": { calls: 3, reason: "the crafting cost panel follows the game's profession window; each handler checks the auction helper is built (A4-3 moves them into its Enable)" },
  "Modules/ClickCastOptions.lua": { calls: 4, reason: "the click-casting page re-reads itself at a fight's start and end and on talent changes, only while the options window is shown (L16; A4-3 moves them behind ClickCast)" },
  "Modules/ClickCastPresets.lua": { calls: 2, reason: "the starter layouts' blocker cache, cleared when an addon loads, and the better-spell offer on new spells (A4-3 moves them behind ClickCast)" },
  "Modules/ClickCastSpells.lua": { calls: 1, reason: "the spellbook catalog's cache, cleared when spells change; read by the click-casting page whether or not ClickCast runs" },
  "Modules/KeybindsApply.lua": { calls: 5, reason: "key setup belongs to no module: blocked-action watch, refused updates retried, the key backup at logout and its restore at login (the backup only while key setup has a record)" },
  "Modules/KeybindsLearn.lua": { calls: 3, reason: "key setup's new spells belong to no module; the handlers do nothing unless keys were set up from a preset or the one question is still to ask" },
  "Modules/KeybindsWizard.lua": { calls: 2, reason: "key setup's wizard belongs to no module: it steps aside at combat start and offers itself once after login" },
  "Modules/KeysViewCard.lua": { calls: 3, reason: "the Your keys card belongs to no module: it redraws on modifier and binding changes while it is shown" },
  "Modules/Probe.lua": { calls: 2, reason: "the /vg probe diagnostic belongs to no module: a flight-map answer and a run stopped at combat start" },
  "Modules/RaidPreview.lua": { calls: 2, reason: "the raid frames preview stops when you join a group or a fight starts; it runs only while the preview is up" },
  "Modules/RetailDelves.lua": { calls: 1, reason: "Retail only (frozen): the delve widgets follow UPDATE_UI_WIDGET" },
  "Modules/WindowsMenus.lua": { calls: 1, reason: "game window skins: watches the dropdown rows from login (Windows stays reload-only)" },
  "Modules/WindowsSocial.lua": { calls: 1, reason: "game window skins: the raid tab when the game loads its raid window (Windows stays reload-only)" },
  "Modules/WindowsTabs.lua": { calls: 1, reason: "game window skins: the tab buttons from login (Windows stays reload-only)" },
  "Modules/WindowsTown.lua": { calls: 1, reason: "game window skins: the merchant window from login (Windows stays reload-only)" },
};

// How a token changes the block stack: a function opens an "f" level, if/do/repeat a plain one, end/until closes one.
function stepBlocks(stack, t) {
  if (t.kind !== "word") return;
  if (t.text === "function") stack.push("f");
  else if (LUA_BLOCK_OPEN.has(t.text)) stack.push("b");
  else if (LUA_BLOCK_CLOSE.has(t.text)) stack.pop();
}

// The ns.On, ns.OnUnit and ns.Every calls outside every function in Lua source: [{ call, start }] (loops and do
// blocks at the top of the file count as file scope too).
export function fileScopeSubscriptions(src) {
  const tokens = codeTokens(src);
  const stack = [];
  const found = [];
  tokens.forEach((t, i) => {
    stepBlocks(stack, t);
    const call = t.text === "ns" && tokens[i + 1]?.text === "." && SUBSCRIBE_CALLS.has(tokens[i + 2]?.text) && tokens[i + 3]?.text === "(";
    if (call && !stack.includes("f")) found.push({ call: `ns.${tokens[i + 2].text}`, start: t.start });
  });
  return found;
}

// Problems for a file with more file-scope subscriptions than FILE_SCOPE_ALLOWED lets it have: each one is listed.
function fileScopeProblems(file, src) {
  if (!SUBSCRIBE_SCOPE.test(file)) return [];
  const found = fileScopeSubscriptions(src);
  if (found.length <= (FILE_SCOPE_ALLOWED[file]?.calls ?? 0)) return [];
  const line = lineIndex(src);
  return found.map((f) => ({ line: line(f.start), message: `${f.call}() ${SUBSCRIBE_MESSAGE}` }));
}

// Bare subscriptions in a live module's files (docs/design/MODULE-LIFECYCLE.md 4.2) ---------------------------------
// A module that declares live = true goes on and off mid-session, so everything it registers goes through the scope
// its Enable gets: an ns.On, ns.OnUnit, ns.Every, T.OnChanged, ns.OnMoverPlaced, hooksecurefunc or :HookScript of its
// own fails, except inside a scope:Gate(...) call (the gate's install is where a hook belongs). The rule keys on the
// module the file itself defines (ns.Module("X", { ... live = true ... })), never on one it only reads with
// ns.GetModule (Nameplates reads RaidStatus and stays reload-only). Core/ is exempt.
const BARE_SCOPE = /^Modules\/.+\.lua$/;
const BARE_MESSAGE = "in a live module's file: register it through the module's scope (scope:On, scope:OnUnit, scope:Every, scope:Gate)";

// The text of the call whose "(" is at `open`, to its matching ")" (or the end of the source).
function callText(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    depth += src[i] === "(" ? 1 : src[i] === ")" ? -1 : 0;
    if (depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

// The names of the modules a Lua source registers as live (live = true in the ns.Module call's definition).
export function liveModulesIn(src) {
  const calls = [...src.matchAll(/\bns\.Module(\()\s*"([A-Za-z0-9_]+)"/g)];
  return calls.filter((m) => /\blive\s*=\s*true\b/.test(callText(src, m.index + m[0].indexOf("(")))).map((m) => m[2]);
}

// The subscription a token starts, or null: "ns.On" and the rest, "T.OnChanged", "hooksecurefunc" or ":HookScript".
function bareCall(tokens, i) {
  // Text of the token at k, if there is one.
  const at = (k) => tokens[k]?.text;
  if (at(i) === "hooksecurefunc" && at(i + 1) === "(") return "hooksecurefunc";
  if (at(i) === ":" && at(i + 1) === "HookScript" && at(i + 2) === "(") return ":HookScript";
  if (at(i) === "T" && at(i + 1) === "." && at(i + 2) === "OnChanged" && at(i + 3) === "(") return "T.OnChanged";
  const nsCall = at(i) === "ns" && at(i + 1) === "." && at(i + 3) === "(";
  return nsCall && (SUBSCRIBE_CALLS.has(at(i + 2)) || at(i + 2) === "OnMoverPlaced") ? `ns.${at(i + 2)}` : null;
}

// Moves the depth of the Gate(...) argument lists the walk is inside on by one token.
function stepGate(state, tokens, i) {
  if (tokens[i].text === "Gate" && tokens[i + 1]?.text === "(") state.opens.push(state.depth);
  if (tokens[i].text === "(") state.depth += 1;
  if (tokens[i].text === ")") state.depth -= 1;
  if (tokens[i].text === ")" && state.opens[state.opens.length - 1] === state.depth) state.opens.pop();
}

// The bare subscriptions in Lua source, outside every scope:Gate(...) call: [{ call, start }].
export function bareSubscriptions(src) {
  const tokens = codeTokens(src);
  const state = { depth: 0, opens: [] };
  const found = [];
  tokens.forEach((t, i) => {
    const call = state.opens.length === 0 && bareCall(tokens, i);
    if (call) found.push({ call, start: t.start });
    stepGate(state, tokens, i);
  });
  return found;
}

// Problems for each bare subscription in a live module's file.
function bareSubscriptionProblems(file, src) {
  if (!BARE_SCOPE.test(file) || liveModulesIn(src).length === 0) return [];
  const line = lineIndex(src);
  return bareSubscriptions(src).map((f) => ({ line: line(f.start), message: `${f.call}() ${BARE_MESSAGE}` }));
}

// Problems in one file: [{ line, message }].
export function checkSource(file, src) {
  const lua = file.endsWith(".lua");
  const kinds = lua ? luaLineKinds(src) : jsLineKinds(src);
  const fns = lua ? luaFunctions(src) : jsFunctions(src);
  const documented = documentedSet(fns, kinds);
  const out = fns.flatMap((fn) => functionProblems(fn, kinds, documented));
  if (!lua) return out;
  return out.concat(colorProblems(file, src), fontProblems(file, src), spacingProblems(file, src), bareCallbackProblems(file, src), lua51Problems(file, src), topLocalProblems(file, src), unguardedSecureCalls(file, src), fileScopeProblems(file, src), bareSubscriptionProblems(file, src));
}

// Report-only rules (#263) -------------------------------------------------------------
// Heuristics for the game rules that cause the subtlest bugs. They count, they don't
// block: scripts/check-code-quality.mjs fails only when a count rises above its baseline in
// scripts/code-quality-baseline.json (a ratchet, like scripts/lua-coverage-floor.json). A
// rule becomes blocking once it is quiet on main, as the first did. All have false positives
// by design.
//   secure-outside-combat-guard (blocking now, rule 7 above): a call that changes a secure frame
//     or a binding, or asks the panel manager to show or hide a window (all refused in combat), sits in no function that runs under ns.OutOfCombat or
//     checks InCombatLockdown() / ns.InCombat() before it. Code at a file's top level runs at
//     load and counts as safe.
//   unbounded-onupdate: an OnUpdate handler that neither waits on the elapsed time it adds up
//     (or on GetTime()) nor is cleared anywhere in its file with SetScript("OnUpdate", nil).
//   unguarded-script-handler: a SetScript or HookScript handler (OnEnter, OnShow, OnKeyDown...)
//     that is not an ns.Guard(...) call, so its error reaches the game's popup but never
//     /vg errors. OnClick on SetScript is the blocking rule above; OnUpdate has its own rule.
//   unwrapped-text: English text handed to a widget, tooltip or chat line outside L[...].
//   secret-truth-test: a Unit*, C_UnitAuras.* or GetAction* call tested for truth (if, not,
//     and, or), which errors in game when the answer is a secret (docs/PATTERNS.md).
//   pcall-result-or: `ok and value or fallback` just after a pcall, which tests value for truth.
//   long-line: addon Lua lines longer than MAX_LINE characters; the count only goes down.
//   unwrapped-text-shapes: English in a sink's text argument that the narrow unwrapped-text rule does not read: joined to a
//     value, chosen by and/or, or the pattern of a format call (H44-25-3). The /vg diagnostics stay English (DIAGNOSTIC_FILES).
//   undocumented-field-function: a function written as a table field after a comma, or under a bracketed key, with no
//     comment line above it (H44-25-6 and H44-25-R2): the comment rule reads only the first field and `name = function`.

export const REPORT_RULES = ["unbounded-onupdate", "unguarded-script-handler", "unwrapped-text", "secret-truth-test", "pcall-result-or", "long-line", "unwrapped-text-shapes", "undocumented-field-function"];
// The blocking rule that grew out of the report-only list once it was quiet on main.
export const SECURE_RULE = "secure-outside-combat-guard";

// Calls the client refuses on protected frames, or for bindings, while in combat.
const SECURE_CALLS = new Set([
  "SetAttribute", "RegisterStateDriver", "UnregisterStateDriver", "RegisterAttributeDriver", "UnregisterAttributeDriver",
  "SecureHandlerExecute", "SecureHandlerWrapScript", "SecureHandlerUnwrapScript", "SecureHandlerSetFrameRef",
  "RegisterUnitWatch", "UnregisterUnitWatch", "ClearOverrideBindings",
  "SetOverrideBinding", "SetOverrideBindingClick", "SetOverrideBindingSpell", "SetOverrideBindingMacro", "SetOverrideBindingItem",
  // The game's panel manager: it refuses any run with addon code in it while in combat, whatever the window.
  "ShowUIPanel", "HideUIPanel",
]);
// Files whose secure calls all run where the frame is made and set up, in the same safe
// window. Add a file only after reading every call in it; empty means none is excused.
export const SECURE_ALLOW = new Set([]);
// Calls that are secure only as a method on a frame (fs:WrapScript(...)): their bare names are common words.
const SECURE_METHODS = new Set(["WrapScript", "UnwrapScript", "Execute", "SetFrameRef"]);

// The last part of a dotted or method name ("ns.Bars:Apply" gives "Apply").
const lastPart = (name) => name.split(/[.:]/).pop();

// A function's whole name with ":" read as "." ("function V:Apply" and "V.Apply = function" both give "V.Apply").
function fullName(tokens, i) {
  if (tokens[i + 1]?.kind === "word") return luaFunctionName(tokens, i)?.replace(":", ".") ?? null;
  const parts = [];
  for (let k = i - 2; tokens[k]?.kind === "word" && tokens[i - 1]?.text === "="; k -= 2) {
    parts.unshift(tokens[k].text);
    if (![".", ":"].includes(tokens[k - 1]?.text)) break;
  }
  return parts.length ? parts.join(".") : null;
}

// Every function in code tokens as { open, close, name, full }: token indexes of `function` and its `end`.
function functionSpans(tokens) {
  const stack = [];
  const spans = [];
  tokens.forEach((t, i) => {
    if (t.kind !== "word" || !(LUA_BLOCK_OPEN.has(t.text) || LUA_BLOCK_CLOSE.has(t.text))) return;
    if (LUA_BLOCK_OPEN.has(t.text)) stack.push(t.text === "function" ? { open: i, name: luaFunctionName(tokens, i), full: fullName(tokens, i) } : null);
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

// True when the call at tokens[i] is a secure call (not its definition or a mention): one of SECURE_CALLS, or a
// SECURE_METHODS name called on a frame with ":".
function isSecureCall(tokens, i) {
  if (tokens[i].kind !== "word" || tokens[i + 1]?.text !== "(" || tokens[i - 1]?.text === "function") return false;
  return SECURE_CALLS.has(tokens[i].text) || (SECURE_METHODS.has(tokens[i].text) && tokens[i - 1]?.text === ":");
}

// The whole dotted names written in tokens[a..b] ("set", "M.Apply"; ":" read as "."), as a Set. A name after a "."
// or ":" belongs to the run before it, so `self.set` is "self.set", never "set".
function namesIn(tokens, a, b) {
  const names = new Set();
  for (let k = a; k <= b; k++) {
    if (tokens[k].kind !== "word" || [".", ":"].includes(tokens[k - 1]?.text)) continue;
    let end = k;
    while ([".", ":"].includes(tokens[end + 1]?.text) && tokens[end + 2]?.kind === "word") end += 2;
    names.add(tokens.slice(k, end + 1).filter((t) => t.kind === "word").map((t) => t.text).join("."));
  }
  return names;
}

// Functions that run out of combat: passed to ns.OutOfCombat, or named by their whole name inside the arguments of
// one that does (or of a function already known to run there; same file only). Known limit: a function trusted
// because one deferred call names it is trusted for every call of that name, also a straight call from a combat
// handler (a blocking "every caller is deferred" rule flagged 18 of 123 calls falsely: one name means two things in
// two files, and public functions have callers in other files).
function deferredSpans(tokens, spans, ranges) {
  const names = new Set(ranges.flatMap(([a, b]) => [...namesIn(tokens, a, b)]));
  const safe = new Set();
  for (let grew = true; grew; ) {
    const more = spans.filter((s) => !safe.has(s) && (ranges.some(([a, b]) => a < s.open && s.close <= b) || (s.full && names.has(s.full))));
    more.forEach((s) => safe.add(s) && namesIn(tokens, s.open, s.close).forEach((w) => names.add(w)));
    grew = more.length > 0;
  }
  return safe;
}

// The innermost function span holding tokens[i], or null at the top level (load time).
function innermost(spans, i) {
  const holding = spans.filter((s) => s.open < i && i < s.close);
  return holding.reduce((best, s) => (best && best.open > s.open ? best : s), null);
}

// The index of the `then` that ends the condition of the `if` at tokens[p].
function thenOf(tokens, p) {
  let k = p + 1;
  for (let depth = 0; k < tokens.length && !(depth === 0 && tokens[k].text === "then"); k++) depth += nesting(tokens[k]);
  return k;
}

// The first branch of the `if` whose `then` is tokens[t]: { end, returns }. end is the index of its else, elseif or
// end; returns is true when a `return` stands at the branch's own level (it leaves the function).
function firstBranch(tokens, t) {
  let depth = 0;
  let returns = false;
  for (let k = t + 1; k < tokens.length; k++) {
    const word = tokens[k].kind === "word" ? tokens[k].text : "";
    if (depth === 0 && ["end", "else", "elseif"].includes(word)) return { end: k, returns };
    depth += nesting(tokens[k]);
    returns = returns || (depth === 0 && word === "return");
  }
  return { end: tokens.length, returns };
}

// The index of the ")" that closes the call of the combat check at words[at] (at itself when it is not called).
function checkClose(words, at) {
  if (words[at + 1] !== "(") return at;
  let depth = 0;
  for (let k = at + 1; k < words.length; k++) {
    depth += words[k] === "(" ? 1 : words[k] === ")" ? -1 : 0;
    if (depth === 0) return k;
  }
  return words.length;
}

// True when a bracket still open at words[head] has `not` in front of it, as in `not (InCombatLockdown())` or
// `not (a or ns.InCombat())`, though the word right before the check is not `not`.
function insideNot(words, head) {
  let open = 0;
  for (let k = head - 1; k >= 0; k--) {
    if (words[k] === ")") open++;
    else if (words[k] === "(" && open > 0) open--;
    else if (words[k] === "(" && words[k - 1] === "not") return true;
  }
  return false;
}

// True when the word before the check does not give the condition's sense: the check's answer is compared
// (`InCombatLockdown() == false`; the tokenizer gives `==` and `~=` as single characters) or it stands in a negated
// bracket (H45-2-51).
function senseUnclear(words, head, at) {
  return ["=", "~"].includes(words[checkClose(words, at) + 1]) || insideNot(words, head);
}

// True when words[k] is a combat lockdown check, called: the game's global InCombatLockdown(), or ns.InCombat() with a
// "." or ":" (H46-35-1). Another name's InCombat (UF.InCombat(unit), a unit's flag; ns.Combat.InCombat), a field read
// without a call and C_X.InCombatLockdown() are not.
function isCombatCheck(words, k) {
  const owned = [".", ":"].includes(words[k - 1]);
  const lockdown = words[k] === "InCombatLockdown" && !owned;
  const addon = words[k] === "InCombat" && owned && words[k - 2] === "ns" && ![".", ":"].includes(words[k - 3]);
  return words[k + 1] === "(" && (lockdown || addon);
}

// How an if-condition (tokens[a..b]) tests for combat: "in" when it is true in combat (an un-negated check, not
// joined by `and`; `or` chains are fine), "out" when it is true out of combat (a negated check, not joined by
// `or`), else null (also when it holds no check, or its sense is unclear: compared, or in a negated bracket).
function combatSense(tokens, a, b) {
  const words = tokens.slice(a, b).map((t) => t.text);
  const at = words.findIndex((w, k) => isCombatCheck(words, k));
  if (at < 0) return null;
  const head = [".", ":"].includes(words[at - 1]) ? at - 2 : at;
  if (senseUnclear(words, head, at)) return null;
  if (words[head - 1] === "not") return words.includes("or") ? null : "out";
  return words.includes("and") ? null : "in";
}

// The block openers still open at tokens[i], counted from tokens[from]: their indexes, outermost first. An else or
// elseif ends one branch and opens the next, so it takes the place of its `if` (a guard in one branch does not count
// for a call in another).
function openersAt(tokens, from, i) {
  const open = [];
  for (let k = from; k < i; k++) {
    if (tokens[k].kind !== "word") continue;
    if (LUA_BLOCK_OPEN.has(tokens[k].text)) open.push(k);
    else if (LUA_BLOCK_CLOSE.has(tokens[k].text)) open.pop();
    else if (tokens[k].text === "else" || tokens[k].text === "elseif") open.splice(-1, 1, k);
  }
  return open;
}

// True when the `if` at tokens[p] guards the secure call at tokens[i] in function s: its condition is a combat
// check whose then-branch returns, and the call comes after that branch in the same blocks of the same function;
// or the call stands in the then-branch of a condition that holds only out of combat.
function ifGuards(ctx, s, p, i) {
  const then = thenOf(ctx.tokens, p);
  const sense = combatSense(ctx.tokens, p + 1, then);
  const branch = firstBranch(ctx.tokens, then);
  if (sense === "out") return then < i && i < branch.end;
  if (sense !== "in" || !branch.returns || i < branch.end) return false;
  const [mine, theirs] = [openersAt(ctx.tokens, s.open, p), openersAt(ctx.tokens, s.open, i)];
  return mine.every((k, n) => theirs[n] === k);
}

// True when function s holds a combat guard (ifGuards) for the secure call at tokens[i] in an `if` of its own,
// not one in a function nested inside it.
function guardedIn(ctx, s, i) {
  const ifs = ctx.tokens.map((t, p) => (p > s.open && p < s.close && t.text === "if" && t.kind === "word" ? p : -1)).filter((p) => p >= 0);
  return ifs.some((p) => innermost(ctx.spans, p) === s && ifGuards(ctx, s, p, i));
}

// True when the secure call at tokens[i] is at the top level (load time), or a function holding it runs out of
// combat (deferredSpans), or the function it is in has a combat guard (guardedIn). A combat word read anywhere
// earlier does not count.
function isCombatSafeAt(ctx, i) {
  const s = innermost(ctx.spans, i);
  return !s || ctx.spans.some((h) => h.open < i && i < h.close && ctx.safe.has(h)) || guardedIn(ctx, s, i);
}

// Secure calls outside a combat guard: [{ rule, line, message }].
function unguardedSecureCalls(file, src) {
  if (!COLOR_SCOPE.test(file) || SECURE_ALLOW.has(file)) return [];
  const tokens = codeTokens(src);
  const spans = functionSpans(tokens);
  const ctx = { tokens, spans, safe: deferredSpans(tokens, spans, deferRanges(tokens)) };
  const line = lineIndex(src);
  const hits = tokens.flatMap((t, i) => (isSecureCall(tokens, i) && !isCombatSafeAt(ctx, i) ? [t] : []));
  const message = `outside a combat guard: run it through ns.OutOfCombat, or return first when InCombatLockdown() / ns.InCombat()`;
  return hits.map((t) => ({ rule: SECURE_RULE, line: line(t.start), message: `${t.text}() ${message}` }));
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
  return loose.map((c) => ({ rule: REPORT_RULES[0], line: line(tokens[c.at].start), message: ONUPDATE_MESSAGE }));
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
  return loose.map((c) => ({ rule: REPORT_RULES[1], line: line(tokens[c.at].start), message: `${c.script} handler is not an ns.Guard(where, fn) call, so its errors never reach /vg errors` }));
}

// The calls whose first argument is text a player reads: widget text, tooltip lines, chat,
// option rows and dialogs. A literal there is English the string table can't translate.
const TEXT_SINKS = new Set(["SetText", "AddLine", "AddDoubleLine", "Chat", "check", "header", "cycle", "slider", "OfferReload", "ShowText"]);

// True when a string token is words a player reads: it has a letter, and no backslash (a path).
const isWords = (text) => /[A-Za-z]/.test(text) && !text.includes("\\") && !text.startsWith('"|T');

// The sink a `local <name> = <a>.<b>.<Sink>` statement at tokens[i] names (`local chat = ns.Chat`), or null: the value
// must be the sink itself, not its answer or a field of it.
function aliasedSink(tokens, i) {
  if (tokens[i].text !== "local" || tokens[i + 1]?.kind !== "word" || tokens[i + 2]?.text !== "=") return null;
  let k = i + 3;
  while ([".", ":"].includes(tokens[k + 1]?.text) && tokens[k + 2]?.kind === "word") k += 2;
  const next = tokens[k + 1];
  const value = tokens[k]?.kind === "word" && next?.kind !== "string" && !["(", ".", ":", "[", "{"].includes(next?.text);
  return value && SHAPE_SINKS.has(tokens[k].text) ? tokens[k].text : null;
}

// The local names a file gives a sink anywhere in it (Core/Slash.lua's `local chat = ns.Chat`), as a Map from name
// to sink, so a call through the name is read like the sink's own (H46-35-R1).
function sinkAliases(tokens) {
  const aliases = new Map();
  tokens.forEach((t, i) => aliasedSink(tokens, i) && aliases.set(tokens[i + 1].text, aliasedSink(tokens, i)));
  return aliases;
}

// The sink the word at tokens[i] calls: the sink a local name stands for (not when it is another table's field of
// that name), else the word itself; undefined for a token that is not a word.
function sinkName(tokens, i, aliases) {
  if (tokens[i]?.kind !== "word") return undefined;
  const owned = [".", ":"].includes(tokens[i - 1]?.text);
  return (!owned && aliases.get(tokens[i].text)) || tokens[i].text;
}

// English literals handed straight to a text sink, not through L["…"]: [{ rule, line, message }].
function unwrappedText(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = codeTokens(src);
  const line = lineIndex(src);
  const aliases = sinkAliases(tokens);
  const hits = tokens.filter((t, i) => t.kind === "string" && tokens[i - 1]?.text === "(" && TEXT_SINKS.has(sinkName(tokens, i - 2, aliases)) && isWords(t.text));
  return hits.map((t) => ({ rule: REPORT_RULES[2], line: line(t.start), message: `English text not in L[…]: ${t.text.slice(0, 48)}` }));
}

// The wider unwrapped-text rule (report-only, with a baseline of its own; unwrapped-text stays the narrow one). It reads
// the whole text argument of a sink, not only a literal that comes first: `"a" .. x`, `cond and "a" or "b"`, `x or "a"`,
// and the pattern handed to string.format, ns.Format or ("..."):format inside it. SHAPE_SINKS gives each sink's text
// argument, counted from 0, or a list of them (AddDoubleLine's left and right text, H46-35-R2). A literal in a deeper call, a table or an index (L["a"], t["key"]) or compared (mode == "tab")
// is not text, and only words count: format codes, {slots}, color and link escapes and the brand name are stripped first.
const SHAPE_SINKS = new Map(Object.entries({
  SetText: 0, SetFormattedText: 0, AddLine: 0, AddDoubleLine: [0, 1], AddMessage: 0, Chat: 0, check: 0, header: 0, cycle: 0, slider: 0,
  OfferReload: 0, ShowText: 0, Ask: 0, AskText: 0, DialogButton: 1,
}));
const FORMATTERS = new Set(["format", "Format"]);
// The /vg diagnostics docs/PATTERNS.md lists as staying English (pasted into a bug report), each with the files that print
// it: a file that prints one is not read by the wider rule. In a file that prints other text too, `file:function` names
// the one function that prints it, and only that function is not read. A test holds this table to that sentence of the doc.
export const DIAGNOSTIC_FILES = {
  probe: ["Modules/Probe.lua"], perf: ["Core/Perf.lua"], mem: ["Core/Perf.lua", "Core/SettingsGuard.lua"], status: ["Core/Slash.lua:statusCommand"],
  report: [], errors: [], frame: [], realm: ["Core/Home.lua"], factionart: ["Core/FactionArt.lua"],
};
const DIAGNOSTIC_SET = new Set(Object.values(DIAGNOSTIC_FILES).flat());
// What a literal carries that is not words: format codes, {slots}, |c and |r, |H...|h link markup and the brand.
const NOT_WORDS = /%[-+ #0-9.]*[a-zA-Z%]|\{\w+\}|\|c[0-9a-fA-F]{8}|\|[rh]|\|H[^|]*|Vanguard|\/vg/g;

// True when a string token reads as English: two letters in a row once the non-words are stripped (a path is not text).
const isShapeText = (text) => isWords(text) && /[A-Za-z]{2}/.test(text.replace(NOT_WORDS, " "));

// True when the string at arg[k], at bracket depth `depth` of the argument, is text the sink prints: at the argument's own level
// and not compared, or the pattern of string.format, ns.Format or ("..."):format.
function printsText(arg, k, depth) {
  const own = depth === 0 && !(arg[k - 1]?.text === "=" && ["=", "~"].includes(arg[k - 2]?.text)) && arg[k + 1]?.text !== "=";
  const pattern = depth === 1 && arg[k - 1]?.text === "(" && FORMATTERS.has(arg[k - 2]?.text);
  const method = depth === 1 && arg[k + 1]?.text === ")" && arg[k + 2]?.text === ":" && arg[k + 3]?.text === "format";
  return own || pattern || method;
}

// True when the "(" at arg[k] only groups an expression: nothing before it, or an operator or keyword, not a name, a
// string or a closing bracket (those make it a call or an index).
function isGroupingParen(arg, k) {
  const before = arg[k - 1];
  if (!before) return true;
  if (before.kind === "string") return false;
  if (before.kind === "word") return ["and", "or", "not", "return"].includes(before.text);
  return !")]}".includes(before.text);
}

// The depth change of arg[k] for shapeLiterals; `open` is the stack of brackets still open, true for a grouping one,
// which adds no depth (so `n .. (on and "On" or "Off")` is still the argument's own level).
function depthStep(arg, k, open) {
  const t = arg[k];
  if (t.kind === "punct" && t.text === "(") open.push(isGroupingParen(arg, k));
  else if (t.kind === "punct" && "[{".includes(t.text)) open.push(false);
  else if (t.kind === "punct" && "])}".includes(t.text)) return open.pop() ? 0 : -1;
  else return nesting(t);
  return open[open.length - 1] ? 0 : 1;
}

// The text literals in a sink's text argument (tokens): the string tokens printsText accepts that read as English. A
// literal that is the whole start of the argument of a sink the narrow rule reads (`narrow`) is its finding, not this one's.
// A value passed through ns.Format's table or returned by a helper is not read.
function shapeLiterals(arg, narrow) {
  let depth = 0;
  const open = [];
  return arg.filter((t, k) => {
    const hit = t.kind === "string" && printsText(arg, k, depth) && isShapeText(t.text) && !(narrow && k === 0 && isWords(t.text));
    depth += depthStep(arg, k, open);
    return hit;
  });
}

// The text arguments of the sink call at tokens[i] (aliases: sinkAliases), each as { arg, index }: its tokens and its
// place, counted from 0. An empty list when tokens[i] is not a sink call.
function sinkArguments(tokens, i, aliases) {
  const indexes = SHAPE_SINKS.get(sinkName(tokens, i, aliases));
  const call = indexes !== undefined && tokens[i + 1]?.text === "(" && tokens[i - 1]?.text !== "function";
  const args = call ? callArgs(tokens, i + 1) : [];
  return call ? [indexes].flat().map((index) => ({ arg: args[index] ?? [], index })) : [];
}

// The English literals in the text arguments of the sink call at tokens[i] (shapeLiterals). The narrow rule reads only
// the first argument of a TEXT_SINKS sink, so a later one (AddDoubleLine's right text) is read whole here.
function sinkLiterals(tokens, i, aliases) {
  const narrow = TEXT_SINKS.has(sinkName(tokens, i, aliases));
  return sinkArguments(tokens, i, aliases).flatMap(({ arg, index }) => shapeLiterals(arg, narrow && index === 0));
}

// The files DIAGNOSTIC_FILES names a function of (`file:function`).
const DIAGNOSTIC_FUNCTION_FILES = new Set([...DIAGNOSTIC_SET].filter((entry) => entry.includes(":")).map((entry) => entry.split(":")[0]));

// The functions of a file that DIAGNOSTIC_FILES names as `file:function`, as function spans (functionSpans); the
// spans are found only in a file that has one.
function diagnosticSpans(file, tokens) {
  if (!DIAGNOSTIC_FUNCTION_FILES.has(file)) return [];
  return functionSpans(tokens).filter((s) => DIAGNOSTIC_SET.has(`${file}:${s.name}`));
}

// English in a sink's text argument in a shape the narrow rule does not read (rule unwrapped-text-shapes).
function unwrappedShapes(file, src) {
  if (!COLOR_SCOPE.test(file) || DIAGNOSTIC_SET.has(file)) return [];
  const tokens = codeTokens(src);
  const line = lineIndex(src);
  const [aliases, diagnostic] = [sinkAliases(tokens), diagnosticSpans(file, tokens)];
  // True when the token at i stands outside every diagnostic function.
  const read = (i) => !diagnostic.some((s) => s.open < i && i < s.close);
  const hits = tokens.flatMap((t, i) => (read(i) ? sinkLiterals(tokens, i, aliases) : []));
  return hits.map((t) => ({ rule: REPORT_RULES[6], line: line(t.start), message: `English text joined, chosen or formatted outside L[…]: ${t.text.slice(0, 48)}` }));
}

// Table-field functions with no comment above them (rule undocumented-field-function): a function after a comma or under a
// bracketed key is anonymous to the comment rule. The same comment test applies: a comment line directly above the field, or
// above the first of a run of one-line functions (two fields on one line share the line's comment); [{ rule, line, message }].
function undocumentedFields(file, src) {
  const fns = luaFunctions(src).map((f) => (f.name || !f.field ? f : { ...f, name: f.field.label, docLine: f.field.line, isField: true }));
  const documented = documentedSet(fns, luaLineKinds(src));
  const documentedLines = new Set(fns.filter((f) => documented.has(f)).map((f) => f.docLine ?? f.start));
  const loose = fns.filter((f) => f.isField && !documentedLines.has(f.docLine));
  return loose.map((f) => ({ rule: REPORT_RULES[7], line: f.docLine, message: `${f.name} = function has no comment above it (a table field the comment rule does not name)` }));
}

// Truth tests on client reads that can answer with a secret (the client errors on `if secret then`; the
// harness raises too, but only on a path a test drives with a secret boolean). Narrow on purpose: a call to a Unit*, C_UnitAuras.*
// or GetAction* function tested for truth by if, elseif, while, not, and or or.
const SECRET_READ = /^(Unit\w+|GetAction\w+)$/;
const TRUTH_BEFORE = new Set(["if", "elseif", "while", "not", "and", "or"]);
const TRUTH_AFTER = new Set(["then", "and", "or", "do"]);

// The index of the "(" of a client read named at tokens[i] (UnitIsDead, C_UnitAuras.GetAuraDataByIndex), or -1.
function secretReadOpen(tokens, i) {
  if (tokens[i]?.text === "C_UnitAuras" && tokens[i + 1]?.text === "." && tokens[i + 3]?.text === "(") return i + 3;
  return tokens[i]?.kind === "word" && SECRET_READ.test(tokens[i].text) && tokens[i + 1]?.text === "(" ? i + 1 : -1;
}

// True when the client read named at tokens[i] is tested for truth: after `not`, or between two truth words.
function isTruthTested(tokens, i) {
  const open = secretReadOpen(tokens, i);
  if (open < 0 || !TRUTH_BEFORE.has(tokens[i - 1]?.text) || tokens[i - 2]?.text === ".") return false;
  return tokens[i - 1].text === "not" || TRUTH_AFTER.has(tokens[closeParen(tokens, open) + 1]?.text);
}

// Client reads tested for truth (rule secret-truth-test): [{ rule, line, message }].
function secretTruthTests(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const tokens = codeTokens(src);
  const line = lineIndex(src);
  const hits = tokens.filter((t, i) => isTruthTested(tokens, i));
  return hits.map((t) => ({ rule: REPORT_RULES[3], line: line(t.start), message: `${t.text}() tested for truth: a secret answer errors in game; compare through ns.IsSecret / ns.IsTrue first` }));
}

// How many lines after a pcall its result is looked for (a helper is at most 10 lines).
const PCALL_REACH = 10;

// `ok and value or fallback` after `local ok, value = pcall(...)` (rule pcall-result-or): value is tested for
// truth, so a secret (or a false) answer errors or falls through to the fallback.
function pcallResultOr(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  const code = luaCodeOnly(src);
  const line = lineIndex(src);
  return [...code.matchAll(/local\s+(\w+)\s*,\s*(\w+)[^=\n]*=\s*pcall\s*\(/g)].flatMap((m) => {
    const near = code.slice(m.index).split("\n").slice(0, PCALL_REACH).join("\n");
    const use = new RegExp(String.raw`\b${m[1]}\s+and\s+${m[2]}\s+or\b`).exec(near);
    return use ? [{ rule: REPORT_RULES[4], line: line(m.index + use.index), message: `${m[1]} and ${m[2]} or …: the pcall result is tested for truth; test ${m[1]} alone, then read ${m[2]} as a plain value` }] : [];
  });
}

// Lines of addon Lua longer than MAX_LINE characters (rule long-line).
function longLines(file, src) {
  if (!COLOR_SCOPE.test(file)) return [];
  return src.split("\n").flatMap((text, i) => (text.length > MAX_LINE ? [{ rule: REPORT_RULES[5], line: i + 1, message: `${text.length} characters (keep new lines to ${MAX_LINE})` }] : []));
}

// Report-only findings in one file: [{ rule, line, message }]. They never fail on their own.
export function reportSource(file, src) {
  if (!file.endsWith(".lua")) return [];
  const rules = [unboundedOnUpdates, unguardedScriptHandlers, unwrappedText, secretTruthTests, pcallResultOr, longLines, unwrappedShapes, undocumentedFields];
  return rules.flatMap((rule) => rule(file, src));
}

// Each report-only rule's count against its baseline (a missing baseline is 0):
// [{ rule, count, baseline, status }], status "above" (fails), "below" (lower the baseline) or "at".
export function compareToBaseline(counts, baseline) {
  return REPORT_RULES.map((rule) => {
    const [count, base] = [counts[rule] ?? 0, baseline[rule] ?? 0];
    return { rule, count, baseline: base, status: count > base ? "above" : count < base ? "below" : "at" };
  });
}

// The rows of compareToBaseline that fail the run: above the baseline (a new finding) or below it (a stale baseline,
// which must be lowered in the same commit, so it can never be spare room for a later finding).
export function ratchetFailures(rows) {
  return rows.filter((r) => r.status !== "at");
}
