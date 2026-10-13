// JS value -> Lua source literal. Used by generated cache files and the
// Lua test harness. Output must load in WoW's Lua 5.1: no \u escapes.

const ESCAPES = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };

// One character as it appears inside a Lua string literal.
function luaChar(ch) {
  if (ESCAPES[ch]) return ESCAPES[ch];
  const code = ch.codePointAt(0);
  return code < 0x20 || code === 0x7f ? "\\" + String(code).padStart(3, "0") : ch;
}

// A double-quoted Lua string literal.
export function luaString(value) {
  return '"' + Array.from(String(value), luaChar).join("") + '"';
}

// A multi-line Lua table from entry strings; {} when empty.
function luaTableOf(entries, pad) {
  if (entries.length === 0) return "{}";
  return `{\n${entries.join(",\n")}\n${pad}}`;
}

// An array or object as a Lua table literal.
function luaTableValue(value, indent) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    return luaTableOf(value.map((item) => `${pad}  ${luaValue(item, indent + 1)}`), pad);
  }
  const entries = Object.keys(value).map((k) => `${pad}  [${luaString(k)}] = ${luaValue(value[k], indent + 1)}`);
  return luaTableOf(entries, pad);
}

// A piece of Lua source to emit as it is, where a value is expected (a call
// that makes what no literal can, such as the harness's secrets).
export class LuaSource {
  // `src` is the Lua expression.
  constructor(src) {
    this.src = src;
  }
}

// Any JS value as a Lua literal; null, undefined, NaN and functions become nil.
export function luaValue(value, indent = 0) {
  if (value instanceof LuaSource) return value.src;
  if (typeof value === "string") return luaString(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value !== null && typeof value === "object") return luaTableValue(value, indent);
  return "nil";
}
