import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// A repo file's text.
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// The command words after "/vg " in a Markdown text.
const commandWords = (text) => new Set([...text.matchAll(/\/vg ([a-z]+)/g)].map((m) => m[1]));
// Those, plus the second words the README writes as alternatives ("unlock | lock", "enable|disable").
const documentedWords = (text) => new Set([...commandWords(text), ...[...text.matchAll(/\| ?([a-z]+)/g)].map((m) => m[1])]);

it("docs/COMMANDS.md only lists commands the README documents", () => {
  const known = documentedWords(read("README.md"));
  const unknown = [...commandWords(read("docs/COMMANDS.md"))].filter((w) => !known.has(w));
  expect(unknown, "commands missing from the README").toEqual([]);
});
