import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// A repo file's text.
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// The command words after "/vg " in a Markdown text.
const commandWords = (text) => new Set([...text.matchAll(/\/vg ([a-z]+)/g)].map((m) => m[1]));
// Those, plus the second words the reference writes as alternatives ("unlock | lock", "enable|disable").
const documentedWords = (text) => new Set([...commandWords(text), ...[...text.matchAll(/\| ?([a-z]+)/g)].map((m) => m[1])]);

// docs/COMMANDS.md split into its grouped tables and its word-for-word reference.
const commandsPage = () => read("docs/COMMANDS.md").split("\n## Every command, word for word\n");
// The behaviour spec's feature pages, as one text.
const featurePages = () => fs.readdirSync(path.join(root, "docs/features")).map((f) => read(`docs/features/${f}`)).join("\n");

it("docs/COMMANDS.md's tables only list commands its reference or the feature pages document", () => {
  const [tables, reference] = commandsPage();
  const known = documentedWords(`${reference}\n${featurePages()}`);
  const unknown = [...commandWords(tables)].filter((w) => !known.has(w));
  expect(unknown, "commands missing from the reference and the feature pages").toEqual([]);
});

// The command words /vg help lists (the first word of each HELP line in Core/Slash.lua).
const helpWords = () => {
  const block = read("Core/Slash.lua").split(/\nlocal HELP = \{\n/)[1].split(/\n\}\n/)[0];
  return [...block.matchAll(/^ {2}"([a-z]+)[ ",]/gm)].map((m) => m[1]);
};

it("docs/COMMANDS.md lists every command /vg help lists", () => {
  const listed = commandWords(read("docs/COMMANDS.md"));
  const missing = helpWords().filter((w) => !listed.has(w));
  expect(missing, "commands missing from docs/COMMANDS.md").toEqual([]);
});
