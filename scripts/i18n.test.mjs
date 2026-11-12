// The string table's tooling (scripts/lib/i18n.mjs) and the locale files it writes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { LOCALES, commandWords, commandsIn, csvKeys, exportCsv, extractKeys, importCsv, localeProblems, localeStatus, lookups, luaQuote, missingRows, slashWords, luaUnquote, parseCsv, parseLocale, writeLocale } from "./lib/i18n.mjs";
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

it("i18n: the /vg commands in a text are read with the words their help line gives them, and nothing after", () => {
  const words = commandWords('local HELP = {\n  { "graphics apply", L["x"] },\n  { "reset <frame|all>", L["y"] },\n}\nlocal COMMANDS = {\n  move = unlock,\n}');
  expect([...words.keys()]).toEqual(["move", "graphics", "reset"]);
  expect(commandsIn("/vg graphics apply sets it; /vg reset <frame|all> puts it back", words)).toEqual(["/vg graphics apply", "/vg reset <frame|all>"]);
  expect(commandsIn("/vg graphics apply로 설정; /vg move", words)).toEqual(["/vg graphics apply", "/vg move"]);
  expect(commandsIn("/vg opens the options; /vg <command>", words)).toEqual(["/vg", "/vg <command>"]);
});

it("i18n: a translation that types a /vg command differently from the English is a problem", () => {
  const words = commandWords('local HELP = {\n  { "reset <frame|all>", L["y"] },\n}');
  const keys = new Map([["/vg reset <frame|all> puts it back", "a:1"]]);
  expect(localeProblems(new Map([["/vg reset <frame|all> puts it back", "/vg zurücksetzen <Rahmen|jeden>"]]), keys, words)).toEqual(["commands differ from the English: /vg reset <frame|all> puts it back"]);
  expect(localeProblems(new Map([["/vg reset <frame|all> puts it back", "/vg reset <frame|all> setzt ihn zurück"]]), keys, words)).toEqual([]);
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

it("i18n: each locale file is as the import writes it, with no orphaned, empty or mismatched translation, and every /vg command as typed in English", () => {
  const keys = extractKeys(root, tocFiles());
  const words = commandWords(fs.readFileSync(path.join(root, "Core/Slash.lua"), "utf8"));
  for (const locale of Object.keys(LOCALES)) {
    const text = fs.readFileSync(path.join(root, "Locales", `${locale}.lua`), "utf8");
    expect(text, `Locales/${locale}.lua is written by scripts/i18n.mjs import, never by hand`).toBe(writeLocale(locale, parseLocale(text)));
    expect(localeProblems(parseLocale(text), keys, words), locale).toEqual([]);
  }
});

it("i18n: the command line reports status and exports a CSV", () => {
  // Runs the command line with args and returns what it printed.
  const run = (...args) => execFileSync("node", ["scripts/i18n.mjs", ...args], { cwd: root }).toString();
  expect(run("status")).toMatch(/^ {2}deDE {2}\d+ translated, \d+ missing, 0 orphaned$/m);
  expect(run("export", "frFR").split("\n")[0]).toBe("key,english,translation,context,note");
  expect(run("extract")).toMatch(/^\d+ keys$/m);
});

it("i18n: no locale gives another text the translation of a caption the options search keys its keywords by (ns.English would pick either)", () => {
  const search = fs.readFileSync(path.join(root, "Core", "OptionsSearch.lua"), "utf8");
  const captions = [...search.matchAll(/^\s*\["([^"]+)"\] = L\[/gm)].map((m) => m[1]);
  expect(captions.length, "the keyword captions were found").toBeGreaterThan(10);
  for (const locale of Object.keys(LOCALES)) {
    const entries = parseLocale(fs.readFileSync(path.join(root, "Locales", `${locale}.lua`), "utf8"));
    for (const [key, text] of entries) {
      if (!captions.includes(key.toLowerCase())) continue;
      const clash = [...entries].filter(([other, same]) => same === text && other.toLowerCase() !== key.toLowerCase()).map(([other]) => other);
      expect(clash, `${locale}: "${key}" and ${clash} share the translation "${text}"`).toEqual([]);
    }
  }
});

it("a translation holding a carriage return is a problem", () => {
  const keys = new Map([["Bags", "x"]]);
  expect(localeProblems(new Map([["Bags", "Ta\rschen"]]), keys)).toEqual(["control character in translation: Bags"]);
});

it("a CRLF line break inside a quoted CSV cell imports as a line feed", () => {
  const csv = 'key,english,translation,context,note\n"two\r\nlines",x,"zwei\r\nZeilen",,\n';
  expect(importCsv(csv)).toEqual(new Map([["two\nlines", "zwei\nZeilen"]]));
});

it("a CSV that lacks a row for a translation the locale has is a partial import and is listed as missing", () => {
  const keys = new Map([["Bags", "a:1"], ["Zone", "a:2"], ["two\nlines", "a:3"]]);
  const entries = new Map([["Bags", "Taschen"], ["Zone", "Zone"], ["Gone", "Weg"]]);
  const partial = "key,english,translation,context,note\nBags,Bags,Taschen,,\n";
  expect(missingRows(entries, keys, csvKeys(partial))).toEqual(["Zone"]);
});

it("a full export with one cell emptied is not partial: the emptied row is still a row and its translation is removed", () => {
  const keys = new Map([["Bags", "a:1"], ["Zone", "a:2"], ["two\nlines", "a:3"]]);
  const entries = new Map([["Bags", "Taschen"], ["Zone", "Zone"], ["two\nlines", "zwei\nZeilen"]]);
  const emptied = exportCsv(entries, keys).replace("Zone,Zone,Zone,a:2", "Zone,Zone,,a:2").replace(/\n/g, "\r\n");
  expect(missingRows(entries, keys, csvKeys(emptied))).toEqual([]);
  expect([...importCsv(emptied).keys()].sort()).toEqual(["Bags", "two\nlines"]);
});

it("the command line refuses to import a one-row CSV over a locale that has translations, and writes nothing", () => {
  const before = fs.readFileSync(path.join(root, "Locales", "deDE.lua"), "utf8");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vg-i18n-")), "partial.csv");
  fs.writeFileSync(file, "key,english,translation,context,note\nBags,Bags,Taschen,,\n");
  // Runs the import of the one-row CSV.
  const run = () => execFileSync("node", ["scripts/i18n.mjs", "import", "deDE", file], { cwd: root, stdio: "pipe" });
  expect(run).toThrow(/import a full export/);
  expect(fs.readFileSync(path.join(root, "Locales", "deDE.lua"), "utf8")).toBe(before);
});

// The short labels the addon puts on the yes button of an ns.Ask or ns.Irreversible confirm (a danger one sits beside No).
function yesLabels() {
  const labels = new Set();
  for (const file of tocFiles().filter((f) => /^(Core|Modules)\//.test(f))) {
    for (const line of fs.readFileSync(path.join(root, file), "utf8").split("\n")) {
      if (!/ns\.Ask\(|ns\.Irreversible\(|\byes = /.test(line)) continue;
      for (const { key } of lookups(line)) if (key.length < 30 && !/[?.]$/.test(key)) labels.add(key);
    }
  }
  return labels;
}

it("i18n: no confirm's yes label (ns.Ask, ns.Irreversible) is the language's Cancel, No or Close word", () => {
  const labels = yesLabels();
  expect([...labels], "the scan finds the known labels").toEqual(expect.arrayContaining(["Undo", "Abandon", "Cancel auction", "Delete"]));
  for (const locale of Object.keys(LOCALES)) {
    const entries = parseLocale(fs.readFileSync(path.join(root, "Locales", `${locale}.lua`), "utf8"));
    const refusals = ["Cancel", "No", "Close"].map((key) => entries.get(key));
    for (const yes of labels) expect(refusals, `${locale}: "${yes}" is "${entries.get(yes)}"`).not.toContain(entries.get(yes));
  }
});

it("a CSV with a byte-order mark imports, and one whose head lacks the key or translation column is refused naming it", () => {
  expect(importCsv("\ufeffkey,english,translation,context,note\nBags,Bags,Taschen,,\n")).toEqual(new Map([["Bags", "Taschen"]]));
  expect(() => importCsv("key,english,Translation,context,note\nBags,Bags,Taschen,,\n")).toThrow(/no "translation" column/);
  expect(() => importCsv("id,english,translation\n")).toThrow(/no "key" column/);
});

it("the command line exits 1 on a CSV with no translation column, writing nothing", () => {
  const before = fs.readFileSync(path.join(root, "Locales", "deDE.lua"), "utf8");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vg-i18n-")), "head.csv");
  fs.writeFileSync(file, "key,english,Translation,context,note\nBags,Bags,Taschen,,\n");
  expect(() => execFileSync("node", ["scripts/i18n.mjs", "import", "deDE", file], { cwd: root, stdio: "pipe" })).toThrow(/no "translation" column/);
  expect(fs.readFileSync(path.join(root, "Locales", "deDE.lua"), "utf8")).toBe(before);
});

it("a CSV field with a quote that does not open and close the whole field, or never closes, is refused, not guessed at", () => {
  expect(() => parseCsv('key,english,translation\nBags,Bags,"Hallo" sagen\n')).toThrow(/bad CSV near row 2/);
  expect(() => parseCsv('key,english,translation\nBags,Bags,"Hallo\n')).toThrow(/bad CSV near row 2/);
  expect(parseCsv('a,"b ""c"""\n'), "doubled quotes inside a whole quoted field are fine").toEqual([["a", 'b "c"']]);
});

it("a lone carriage return is a line break in a CSV, not part of a field", () => {
  expect(parseCsv("a,b\rc,d")).toEqual([["a", "b"], ["c", "d"]]);
});

it("a help line's further forms after a comma are one command, so a translated word among them is caught", () => {
  const words = commandWords('local HELP = {\n  { "loot [add|remove|list|clear]", L["x"] },\n}');
  const key = "/vg loot add <player> <item>, remove <player> <item>, list, clear";
  expect(commandsIn(key, words)).toEqual(["/vg loot add <player> <item>, remove <player> <item>, list, clear"]);
  expect(commandsIn("/vg loot add <player> <item>, retirer <player> <item>, liste, vider", words)).not.toEqual(commandsIn(key, words));
  const keys = new Map([[key, "a:1"]]);
  expect(localeProblems(new Map([[key, "/vg loot add <player> <item>, retirer <player> <item>, liste, vider"]]), keys, words)).toEqual([`commands differ from the English: ${key}`]);
  expect(localeProblems(new Map([[key, `${key} dazu`]]), keys, words)).toEqual([]);
});

it("every /word of a key, /reload and /way as well as /vg, must come back in its translation", () => {
  const keys = new Map([["Type /reload in chat", "a:1"]]);
  expect(slashWords("Gib /reload ein, /vg는 und /way命令; {money}/h and/or 5/min")).toBe("/reload /vg /way");
  expect(localeProblems(new Map([["Type /reload in chat", "Tippe /neuladen im Chat"]]), keys, new Map())).toEqual(["commands differ from the English: Type /reload in chat"]);
  expect(localeProblems(new Map([["Type /reload in chat", "Gib /reload im Chat ein"]]), keys, new Map())).toEqual([]);
});

it("a translation keeps its key's line breaks, its end whitespace and the bracket of a (reload) caption", () => {
  const keys = new Map([["Ask?\n{list}", "a:1"], ["Name: ", "a:2"], ["Frames (reload)", "a:3"]]);
  expect(localeProblems(new Map([["Ask?\n{list}", "Frage? {list}"]]), keys)).toEqual(["line breaks differ from the English: Ask?\n{list}"]);
  expect(localeProblems(new Map([["Name: ", "Name:"]]), keys)).toEqual(["leading or trailing whitespace differs from the English: Name: "]);
  expect(localeProblems(new Map([["Name: ", "名称："]]), keys), "a full-width colon needs no space").toEqual([]);
  expect(localeProblems(new Map([["Frames (reload)", "Fenster (Neu laden"]]), keys)).toEqual(["a (reload) caption must end in its bracket: Frames (reload)"]);
  expect(localeProblems(new Map([["Frames (reload)", "框体（重载）"]]), keys)).toEqual([]);
});
