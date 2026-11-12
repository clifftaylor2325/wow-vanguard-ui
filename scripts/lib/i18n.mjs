// The string table's tooling: the English keys the addon looks up (L["…"]), the
// translations in Locales/<locale>.lua, and the CSV translators work in.
// scripts/i18n.mjs is the command line; scripts/i18n.test.mjs checks the locale files.

import fs from "node:fs";
import path from "node:path";
import { tokenizeLua } from "./code-quality.mjs";

// Every client locale Vanguard translates into (Cliff, D1 2026-10-25), with its name.
// enGB clients report enUS, and English needs no file: the key is the text.
export const LOCALES = {
  deDE: "German", frFR: "French", esES: "Spanish (Spain)", esMX: "Spanish (Latin America)", itIT: "Italian",
  ptBR: "Portuguese (Brazil)", ruRU: "Russian", koKR: "Korean", zhCN: "Chinese (Simplified)", zhTW: "Chinese (Traditional)",
};

// A string table lookup, L["…"] or ns.L["…"] (either quote), capturing the quoted key.
const LOOKUP = /(?<![\w.])(?:ns\.)?L\[\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')\s*\]/g;

// One translation line of a locale file: L["key"] = "value".
const ENTRY = /^L\[("(?:[^"\\\n]|\\.)*")\]\s*=\s*("(?:[^"\\\n]|\\.)*")\s*$/;

const LUA_ESCAPES = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" };

// The text of a quoted Lua string literal (the escapes the addon uses: \n \t \\ \" \').
export function luaUnquote(quoted) {
  return quoted.slice(1, -1).replace(/\\(.)/g, (_, c) => LUA_ESCAPES[c] ?? c);
}

// text as a double-quoted Lua string literal.
export function luaQuote(text) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}

// Lua source with its comments blanked (line breaks kept), so a comment's example isn't a key.
function codeOnly(src) {
  const comments = tokenizeLua(src).filter((t) => t.kind === "comment");
  let out = src;
  for (const t of comments) out = out.slice(0, t.start) + src.slice(t.start, t.end).replace(/[^\n]/g, " ") + out.slice(t.end);
  return out;
}

// The keys one Lua source looks up, as [{ key, line }] in source order (comments skipped).
export function lookups(lua) {
  const src = codeOnly(lua);
  return [...src.matchAll(LOOKUP)].map((m) => ({ key: luaUnquote(m[1]), line: src.slice(0, m.index).split("\n").length }));
}

// Every key the addon's files look up: Map key -> first "file:line" it appears at.
export function extractKeys(root, files) {
  const keys = new Map();
  for (const file of files.filter((f) => f.endsWith(".lua") && !f.startsWith("Libs/") && !f.startsWith("Locales/"))) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    for (const { key, line } of lookups(src)) if (!keys.has(key)) keys.set(key, `${file}:${line}`);
  }
  return keys;
}

// The translations in one locale file's text: Map key -> translation.
export function parseLocale(src) {
  const entries = new Map();
  for (const line of src.split("\n")) {
    const m = ENTRY.exec(line.trim());
    if (m) entries.set(luaUnquote(m[1]), luaUnquote(m[2]));
  }
  return entries;
}

// The {name} placeholders in a text, sorted, so two texts can be compared.
export const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

// A locale file's Lua text holding entries (Map key -> translation), keys sorted so diffs stay small.
export function writeLocale(locale, entries) {
  const head = [`-- ${LOCALES[locale]} (${locale}) translations, written by \`node scripts/i18n.mjs import ${locale} <file.csv>\`:`,
    "-- never edit by hand. A text missing here shows in English.", "", "local ADDON, ns = ..."];
  const keys = [...entries.keys()].sort();
  if (keys.length === 0) return [...head, `ns.NewLocale("${locale}")`, ""].join("\n");
  const lines = keys.map((k) => `L[${luaQuote(k)}] = ${luaQuote(entries.get(k))}`);
  return [...head, `local L = ns.NewLocale("${locale}")`, "if not L then return end", "", ...lines, ""].join("\n");
}

// The words each /vg command takes after its name, from the help table in Core/Slash.lua
// ({ "profile new|copy|delete <name>, profile reset", L[...] }), and every name its COMMANDS
// table answers to (move, options, ...): Map command -> Set of words.
export function commandWords(slashLua) {
  const table = (/^local COMMANDS = \{\n([\s\S]*?)\n\}/m.exec(slashLua) || [])[1] || "";
  const words = new Map([...table.matchAll(/^\s*(\w+) =/gm)].map((m) => [m[1], new Set()]));
  for (const [, syntax] of slashLua.matchAll(/^\s*\{ "([^"]+)", L\[/gm)) {
    for (const part of syntax.split(/,\s*|\s+\|\s+/)) {
      const [name, ...rest] = part.replace(/<[^>]*>/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
      if (!words.has(name)) words.set(name, new Set());
      for (const w of rest) words.get(name).add(w);
    }
  }
  return words;
}

// The [bracketed group] at text[i] (brackets may nest), or null when it never closes.
function groupAt(text, i) {
  for (let depth = 0, j = i; j < text.length; j++) {
    depth += text[j] === "[" ? 1 : text[j] === "]" ? -1 : 0;
    if (depth === 0) return text.slice(i, j + 1);
  }
  return null;
}

// The argument at text[i]: a <placeholder>, a [bracketed group] or a word with |-alternatives;
// null when none starts there.
function argumentAt(text, i) {
  if (text[i] === "[") return groupAt(text, i);
  if (text[i] === "<") return (/^<[^>\n]*>/.exec(text.slice(i)) || [])[0] || null;
  return (/^[a-z0-9][a-z0-9_-]*(?:\|(?:<[^>\s]*>|[a-z0-9_-]+))*/.exec(text.slice(i)) || [])[0] || null;
}

// Whether an argument belongs to the command: a placeholder or group, or words the help table gives it.
function takes(arg, known) {
  return /^[<[]/.test(arg) || arg.split("|").every((w) => w.startsWith("<") || /^\d+$/.test(w) || known.has(w));
}

// The /vg commands a text holds, as typed: "/vg graphics apply", "/vg reset <frame|all>"; sorted.
// A command's name is one /vg answers to (or a <placeholder>); after it only words its help line
// has, placeholders and groups.
export function commandsIn(text, words) {
  return [...text.matchAll(/\/(?:vg|vanguard)(?![a-z])/g)].map((m) => commandAt(text, m.index + m[0].length, m[0], words)).sort();
}

// How far the next argument sits from text[i]: 1 after a space, 2 after a comma and a space (a help line lists
// further forms of one command that way: "/vg loot add <player>, remove <player>, list"); 0 when none.
function gapAt(text, i) {
  return text[i] === " " ? 1 : text.startsWith(", ", i) ? 2 : 0;
}

// Whether arg may follow this gap: after a comma only a word the command takes (prose says ", then" too).
function followsGap(arg, gap, known) {
  return gap === 1 ? takes(arg, known) : known.has(arg);
}

// The command typed from text[i] on, after its slash word: the slash word, the name and its arguments.
function commandAt(text, i, slash, words) {
  let span = slash, name = null;
  for (let gap, arg; (gap = gapAt(text, i)) && (arg = argumentAt(text, i + gap)); i += gap + arg.length) {
    if (name === null ? !words.has(arg) && !arg.startsWith("<") : !followsGap(arg, gap, words.get(name) || new Set())) break;
    name ??= arg;
    span += `${gap === 2 ? "," : ""} ${arg}`;
  }
  return span;
}

// Every /word a text holds (/reload, /way, /roll as well as /vg), sorted. No word boundary after it: Korean and
// Chinese glue their text to a command ("/vg는", "/way命令").
export const slashWords = (text) => [...text.matchAll(/(?<![A-Za-z0-9}])\/[a-z]+/g)].map((m) => m[0]).sort().join(" ");

// A text's leading whitespace and trailing whitespace, joined; a full-width mark at the end (the Chinese colon)
// needs no space after it, so it counts no trailing whitespace.
function edges(text) {
  const trailing = /[\u3000-\u303f\uff00-\uffef]$/.test(text) ? "" : text.match(/\s*$/)[0];
  return `${text.match(/^\s*/)[0]}|${trailing}`;
}

// The shape a translation must keep from its key: line breaks, the whitespace at either end, and the closing
// bracket of a " (reload)" caption, which the options window reads. "" when it matches.
function shapeProblem(key, text) {
  const fullWidthEnd = /[\u3000-\u303f\uff00-\uffef]$/.test(text);
  if (key.split("\n").length !== text.split("\n").length) return "line breaks differ from the English";
  if (edges(fullWidthEnd ? key.replace(/\s+$/, "") : key) !== edges(text)) return "leading or trailing whitespace differs from the English";
  if (key.endsWith(" (reload)") && !/[)）]$/.test(text)) return "a (reload) caption must end in its bracket";
  return "";
}

// What is wrong with one translation of a key the code uses ("" when nothing): empty, a control character,
// other placeholders, another shape, and with the commands' words other /vg commands or /words.
function textProblem(key, text, words) {
  if (text.trim() === "") return "empty translation";
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return "control character in translation";
  if (placeholders(text) !== placeholders(key)) return "placeholders differ from the English";
  const shape = shapeProblem(key, text);
  if (shape) return shape;
  // The /vg commands and every /word of a text, to compare with the key's.
  const commands = (t) => `${commandsIn(t, words).join("\n")}|${slashWords(t)}`;
  return words && commands(text) !== commands(key) ? "commands differ from the English" : "";
}

// What is wrong with one locale's entries against the extracted keys: [message]. With the
// commands' words (commandWords), a translation must keep every /vg command as the English types it.
export function localeProblems(entries, keys, words = null) {
  const out = [];
  for (const [key, text] of entries) {
    const problem = keys.has(key) ? textProblem(key, text, words) : "orphaned (no longer in the code)";
    if (problem) out.push(`${problem}: ${key}`);
  }
  return out;
}

// One locale's counts against the keys: { translated, missing, orphaned }.
export function localeStatus(entries, keys) {
  const translated = [...keys.keys()].filter((k) => entries.has(k)).length;
  const orphaned = [...entries.keys()].filter((k) => !keys.has(k)).length;
  return { translated, missing: keys.size - translated, orphaned };
}

// One CSV field, quoted when it holds a comma, quote or line break.
const csvField = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export const CSV_HEAD = ["key", "english", "translation", "context", "note"];

// The CSV for one locale: every key with its English, the current translation and where it's used.
export function exportCsv(entries, keys) {
  const rows = [...keys.keys()].sort().map((k) => [k, k, entries.get(k) ?? "", keys.get(k), entries.has(k) ? "reviewed" : ""]);
  return [CSV_HEAD, ...rows].map((r) => r.map(csvField).join(",")).join("\n") + "\n";
}

// One CSV field's text: a whole quoted field loses its quotes and doubled quotes.
const csvCell = (raw) => (raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw);

// The field of a CSV text starting at index at, with the delimiter after it; throws bad CSV near row N when
// none starts there (a quote inside an unquoted field, a quote never closed).
function csvFieldAt(text, at, row) {
  const field = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\n|\r|$)/y;
  field.lastIndex = at;
  const m = field.exec(text);
  if (!m) throw new Error(`bad CSV near row ${row}`);
  return { cell: csvCell(m[1]), delimiter: m[2], next: field.lastIndex };
}

// The rows of a CSV text, as arrays of fields (RFC 4180: quoted fields may hold commas, quotes and line breaks;
// a lone CR is a line break too). Strict: it throws rather than guess at a changed translation.
export function parseCsv(text) {
  const rows = [[]];
  for (let at = 0; at <= text.length;) {
    const { cell, delimiter, next } = csvFieldAt(text, at, rows.length);
    rows[rows.length - 1].push(cell);
    if (delimiter !== ",") rows.push([]);
    if (delimiter === "") break;
    at = next;
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "") !== "");
}

// A CSV text's head and rows: a leading byte-order mark (Excel writes one) is dropped, and a head without the
// key or translation column throws, naming it, rather than importing nothing.
function csvTable(text) {
  const [head = [], ...rows] = parseCsv(text.replace(/^\ufeff/, ""));
  for (const name of ["key", "translation"]) if (!head.includes(name)) throw new Error(`the CSV has no "${name}" column`);
  return { head, rows };
}

// The keys a CSV has a row for, translated or not: an emptied cell is still a row.
export function csvKeys(text) {
  const { head, rows } = csvTable(text);
  const keyColumn = head.indexOf("key");
  return new Set(rows.map((r) => (r[keyColumn] ?? "").replace(/\r\n/g, "\n")));
}

// The keys a locale translates and the code still uses that a CSV has no row for. Importing that CSV
// would silently drop them, so the import refuses it.
export function missingRows(entries, keys, rowKeys) {
  return [...entries.keys()].filter((k) => keys.has(k) && !rowKeys.has(k));
}

// The translations in a CSV: Map key -> translation, every row that has one. The note
// column is for translators and reviewers; machine drafts ship too (Cliff, 2026-10-26:
// translations ship as drafted and players' feedback corrects them).
export function importCsv(text) {
  const { head, rows } = csvTable(text);
  const col = Object.fromEntries(CSV_HEAD.map((name) => [name, head.indexOf(name)]));
  const filled = rows.filter((r) => (r[col.translation] ?? "").trim() !== "");
  // CRLF from a Windows editor becomes the LF the keys use.
  const lf = (s) => s.replace(/\r\n/g, "\n");
  return new Map(filled.map((r) => [lf(r[col.key]), lf(r[col.translation])]));
}
