#!/usr/bin/env node
// Writes scripts/lib/forever-only-api.json: the WoW Forever API that Retail lacks and the addon
// uses. The harness's Retail client (RETAIL_CLIENT in scripts/lib/lua-harness.mjs) removes those
// functions and marks those events invalid, so the list is never typed by hand. The source is
// Blizzard's generated API docs diffed between the two clients (wow-ui-source, forever 1.60.1.70755
// against live 12.1.5.70783), kept to the names the addon's own Lua (Core/ and Modules/) mentions.
// scripts/forever-only-api.test.mjs fails when the addon starts or stops using one; run this again:
//
//   node scripts/forever-only-api.mjs [<api-diff.json>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readToc, tocPaths } from "./lib/toc.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIFF = "scripts/fixtures/api-diff-forever-70755-vs-live-70783.json";
export const OUT = "scripts/lib/forever-only-api.json";

// An event's name as the client fires it, from its documented name: GameRulesChanged -> GAME_RULES_CHANGED.
export const eventName = (documented) => documented.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

// A pattern that finds a function's whole name, not a field or method of that name (`x.Name`, `x:Name`).
const wholeName = (text) => new RegExp(`(?<![\\w.:])${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`);

// The Forever-only { functions, events } of a diff that the source mentions: a function by its
// whole name, an event as a quoted string. Both sorted.
export function foreverOnlyApi(diff, source) {
  const functions = diff.funcs_forever_only.filter((name) => wholeName(name).test(source));
  const events = diff.events_forever_only.map(eventName).filter((name) => source.includes(`"${name}"`) || source.includes(`'${name}'`));
  return { functions: functions.sort(), events: events.sort() };
}

// The text of every file under Core/ and Modules/ the TOC lists, joined.
export function addonSource(dir) {
  const files = tocPaths(readToc(dir)).filter((f) => /^(Core|Modules)\//.test(f));
  return files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
}

// The data file's text for a diff, as the checkout at `dir` stands.
export function dataFile(diff, dir = root) {
  const api = foreverOnlyApi(diff, addonSource(dir));
  return `${JSON.stringify({ source: `${DIFF} (node scripts/forever-only-api.mjs)`, ...api }, null, 2)}\n`;
}

// Writes the data file from the diff named on the command line (DIFF when none).
function main() {
  const diff = JSON.parse(fs.readFileSync(path.resolve(process.argv[2] ?? path.join(root, DIFF)), "utf8"));
  fs.writeFileSync(path.join(root, OUT), dataFile(diff));
  console.log(`wrote ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
