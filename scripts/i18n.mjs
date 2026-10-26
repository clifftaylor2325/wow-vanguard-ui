#!/usr/bin/env node
// The string table on the command line (rules in scripts/lib/i18n.mjs).
//
//   node scripts/i18n.mjs extract                 every key the code looks up, with where
//   node scripts/i18n.mjs status                  per locale: translated, missing, orphaned
//   node scripts/i18n.mjs export <locale> [file]  the CSV a translator fills in (stdout without file)
//   node scripts/i18n.mjs import <locale> <file>  writes Locales/<locale>.lua from the CSV's translated rows
//
// The CSV columns are key, english, translation, context, note. Every row with a
// translation is imported; the note (such as "machine" for a draft) is for reviewers.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, commandWords, exportCsv, extractKeys, importCsv, localeProblems, localeStatus, parseLocale, writeLocale } from "./lib/i18n.mjs";
import { tocFiles } from "./lib/lua-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The path of one locale's file.
const localeFile = (locale) => path.join(root, "Locales", `${locale}.lua`);

// One locale's translations on disk (empty when it has no file yet).
const entriesOf = (locale) => (fs.existsSync(localeFile(locale)) ? parseLocale(fs.readFileSync(localeFile(locale), "utf8")) : new Map());

// The locale named on the command line; exits when it isn't one of LOCALES.
function localeArg(locale) {
  if (LOCALES[locale]) return locale;
  console.error(`unknown locale ${locale}: one of ${Object.keys(LOCALES).join(", ")}`);
  process.exit(1);
}

// Prints every key and where it is first used.
function extract(keys) {
  for (const [key, where] of [...keys].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${where}\t${key}`);
  console.log(`${keys.size} keys`);
}

// Prints each locale's counts.
function status(keys) {
  console.log(`${keys.size} keys in the code`);
  for (const locale of Object.keys(LOCALES)) {
    const s = localeStatus(entriesOf(locale), keys);
    console.log(`  ${locale}  ${s.translated} translated, ${s.missing} missing, ${s.orphaned} orphaned`);
  }
}

// Writes (or prints) one locale's CSV.
function exportLocale(keys, locale, file) {
  const csv = exportCsv(entriesOf(localeArg(locale)), keys);
  if (file) fs.writeFileSync(file, csv);
  else process.stdout.write(csv);
}

// Writes one locale's file from a CSV's translated rows, keeping only rows the code still uses; exits 1 on a
// bad row (a /vg command typed differently from the English is one).
function importLocale(keys, locale, file) {
  const entries = importCsv(fs.readFileSync(file, "utf8"));
  const words = commandWords(fs.readFileSync(path.join(root, "Core/Slash.lua"), "utf8"));
  const problems = localeProblems(entries, keys, words).filter((p) => !p.startsWith("orphaned"));
  if (problems.length) (console.error(problems.join("\n")), process.exit(1));
  const kept = new Map([...entries].filter(([k]) => keys.has(k)));
  fs.writeFileSync(localeFile(localeArg(locale)), writeLocale(locale, kept));
  console.log(`Locales/${locale}.lua: ${kept.size} translations (${entries.size - kept.size} rows no longer in the code)`);
}

const COMMANDS = { extract, status, export: exportLocale, import: importLocale };

// Runs the command named on the command line.
function main([command, ...args]) {
  const run = COMMANDS[command];
  if (!run) (console.error("usage: node scripts/i18n.mjs extract | status | export <locale> [file] | import <locale> <file>"), process.exit(1));
  run(extractKeys(root, tocFiles()), ...args);
}

main(process.argv.slice(2));
