// Code-quality rules for this repo, checked by scripts/check-code-quality.mjs:
//   1. No function body longer than MAX_BODY_LINES lines of code. Blank lines,
//      comment-only lines, the signature line and the closing line don't
//      count; nested functions count toward the function that holds them.
//   2. Every named function has a comment directly above it. A run of
//      one-line functions (e.g. simple accessors) may share one comment.
//   3. Addon Lua (Core/, Modules/) writes no color numbers: colors come from
//      the theme's named tokens in Core/Theme.lua.
// Test cases (the callback passed to attempt(...)) are exempt from rule 1.

import * as acorn from "acorn";

export const MAX_BODY_LINES = 10;

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

// True for the test-case callback in attempt("label", () => { ... }).
function isTestCase(parent) {
  return parent?.type === "CallExpression" && parent.callee.name === "attempt";
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

// Problems in one file: [{ line, message }].
export function checkSource(file, src) {
  const lua = file.endsWith(".lua");
  const kinds = lua ? luaLineKinds(src) : jsLineKinds(src);
  const fns = lua ? luaFunctions(src) : jsFunctions(src);
  const documented = documentedSet(fns, kinds);
  const out = fns.flatMap((fn) => functionProblems(fn, kinds, documented));
  return lua ? out.concat(colorProblems(file, src)) : out;
}
