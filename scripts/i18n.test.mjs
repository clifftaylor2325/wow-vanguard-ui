// The string table's tooling (scripts/lib/i18n.mjs) and the locale files it writes.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { LOCALES, exportCsv, extractKeys, importCsv, localeProblems, localeStatus, lookups, luaQuote, luaUnquote, parseCsv, parseLocale, writeLocale } from "./lib/i18n.mjs";
import { root, tocFiles } from "./lib/lua-harness.mjs";

it("i18n: a Lua string round-trips through quoting, escapes and all", () => {
  for (const text of ['Plain', 'A "quoted" word', "back\\slash", "two\nlines", "tab\there"]) expect(luaUnquote(luaQuote(text))).toBe(text);
  expect(luaUnquote("'It\\'s'")).toBe("It's");
});

it("i18n: lookups find L[…] and ns.L[…] with their lines, and skip comments, variables and other tables", () => {
  const src = '-- L["In a comment"]\ncheck(L["Bags"], x)\nns.Chat(ns.L[\'Hi\'])\nt.L["No"] L[key] FALL["No"]';
  expect(lookups(src)).toEqual([{ key: "Bags", line: 2 }, { key: "Hi", line: 3 }]);
});

it("i18n: a locale file written from entries reads back the same, keys sorted; an empty one holds no table", () => {
  const entries = new Map([["Zone", "Zone"], ["Bags", "Taschen"], ['Say "hi"', '„Hallo“ sagen']]);
  const text = writeLocale("deDE", entries);
  expect(parseLocale(text)).toEqual(entries);
  expect(text.indexOf('L["Bags"]') < text.indexOf('L["Zone"]')).toBe(true);
  expect(text).toMatch(/^local L = ns\.NewLocale\("deDE"\)\nif not L then return end$/m);
  expect(writeLocale("ruRU", new Map())).toMatch(/^ns\.NewLocale\("ruRU"\)$/m);
});

it("i18n: problems are orphaned keys, empty texts and placeholders that differ from the English", () => {
  const keys = new Map([["{n} sold", "a:1"], ["Bags", "a:2"]]);
  const entries = new Map([["{n} sold", "{count} verkauft"], ["Bags", " "], ["Gone", "Weg"]]);
  expect(localeProblems(entries, keys)).toEqual(["placeholders differ from the English: {n} sold", "empty translation: Bags", "orphaned (no longer in the code): Gone"]);
  expect(localeProblems(new Map([["{n} sold", "{n} verkauft"]]), keys)).toEqual([]);
  expect(localeStatus(entries, keys)).toEqual({ translated: 2, missing: 0, orphaned: 1 });
});

it("i18n: the CSV round-trips commas, quotes and line breaks; every translated row is imported, machine drafts too, and blank rows are not", () => {
  const keys = new Map([["a, b", "x.lua:1"], ['say "hi"', "x.lua:2"], ["two\nlines", "x.lua:3"]]);
  const csv = exportCsv(new Map([["a, b", "c, d"]]), keys);
  expect(parseCsv(csv)[0]).toEqual(["key", "english", "translation", "context", "note"]);
  expect(parseCsv(csv).length, "a header and three rows, no empty row after the last line break").toBe(4);
  const filled = csv.replace('"say ""hi""",,x.lua:2,', '"say ""hi""","""hallo""",x.lua:2,machine').replace('"two\nlines",,', '"two\nlines","zwei\nZeilen",');
  expect(importCsv(filled)).toEqual(new Map([["a, b", "c, d"], ['say "hi"', '"hallo"'], ["two\nlines", "zwei\nZeilen"]]));
});

it("i18n: every locale has its file, listed in the TOC after Core/Locale.lua and before the rest of Core", () => {
  const toc = tocFiles();
  for (const locale of Object.keys(LOCALES)) {
    expect(fs.existsSync(path.join(root, "Locales", `${locale}.lua`)), `${locale} has a file`).toBe(true);
    expect(toc.indexOf(`Locales/${locale}.lua`) > toc.indexOf("Core/Locale.lua"), `${locale} loads after Core/Locale.lua`).toBe(true);
    expect(toc.indexOf(`Locales/${locale}.lua`) < toc.indexOf("Core/Events.lua"), `${locale} loads before the rest of Core`).toBe(true);
  }
});

it("i18n: each locale file is as the import writes it, with no orphaned, empty or mismatched translation", () => {
  const keys = extractKeys(root, tocFiles());
  for (const locale of Object.keys(LOCALES)) {
    const text = fs.readFileSync(path.join(root, "Locales", `${locale}.lua`), "utf8");
    expect(text, `Locales/${locale}.lua is written by scripts/i18n.mjs import, never by hand`).toBe(writeLocale(locale, parseLocale(text)));
    expect(localeProblems(parseLocale(text), keys), locale).toEqual([]);
  }
});

it("i18n: the command line reports status and exports a CSV", () => {
  // Runs the command line with args and returns what it printed.
  const run = (...args) => execFileSync("node", ["scripts/i18n.mjs", ...args], { cwd: root }).toString();
  expect(run("status")).toMatch(/^ {2}deDE {2}\d+ translated, \d+ missing, 0 orphaned$/m);
  expect(run("export", "frFR").split("\n")[0]).toBe("key,english,translation,context,note");
  expect(run("extract")).toMatch(/^\d+ keys$/m);
});
