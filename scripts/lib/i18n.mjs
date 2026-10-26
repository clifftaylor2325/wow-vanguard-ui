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

// What is wrong with one locale's entries against the extracted keys: [message].
export function localeProblems(entries, keys) {
  const out = [];
  for (const [key, text] of entries) {
    if (!keys.has(key)) out.push(`orphaned (no longer in the code): ${key}`);
    else if (text.trim() === "") out.push(`empty translation: ${key}`);
    else if (placeholders(text) !== placeholders(key)) out.push(`placeholders differ from the English: ${key}`);
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

// The rows of a CSV text, as arrays of fields (RFC 4180: quoted fields may hold commas, quotes and line breaks).
export function parseCsv(text) {
  const rows = [[]];
  const re = /("(?:[^"]|"")*"|[^,\r\n]*)(,|\r?\n|$)/g;
  for (const m of text.matchAll(re)) {
    rows[rows.length - 1].push(m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]);
    if (m[2] !== ",") rows.push([]);
    if (m[2] === "") break;
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "") !== "");
}

// The translations in a CSV: Map key -> translation, every row that has one. The note
// column is for translators and reviewers; machine drafts ship too (Cliff, 2026-10-26:
// translations ship as drafted and players' feedback corrects them).
export function importCsv(text) {
  const [head, ...rows] = parseCsv(text);
  const col = Object.fromEntries(CSV_HEAD.map((name) => [name, head.indexOf(name)]));
  const filled = rows.filter((r) => (r[col.translation] ?? "").trim() !== "");
  return new Map(filled.map((r) => [r[col.key], r[col.translation]]));
}
