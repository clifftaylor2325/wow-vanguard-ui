// The skills under .claude/skills/ (CLAUDE.md, Agent tooling): the agent picks one from the name and description in
// its frontmatter, so the frontmatter must parse as YAML and lose no text. An unquoted " #" starts a YAML comment
// and cuts the description there; an unquoted ": " is a parse error in a strict parser (H44-28-R10).

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { root } from "./check-zip.mjs";

const SKILLS = path.join(root, ".claude/skills");

// What is wrong with a double-quoted frontmatter value: strings, empty when it parses and says something.
function quotedProblems(key, raw) {
  try {
    return JSON.parse(raw) === "" ? [`${key} is empty`] : [];
  } catch {
    return [`${key} is a double-quoted string that does not parse (a stray quote or a bad escape)`];
  }
}

// What is wrong with a plain (unquoted) frontmatter value as YAML would read it.
function plainProblems(key, raw) {
  const out = [];
  if (raw === "") out.push(`${key} is empty`);
  if (/\s#/.test(raw)) out.push(`${key} holds " #", which starts a YAML comment and cuts the text there: quote the value`);
  if (/:\s|:$/.test(raw)) out.push(`${key} holds ": ", which a strict YAML parser rejects: quote the value`);
  return out;
}

// What is wrong with one frontmatter value as YAML would read it: strings, empty when it is read whole.
function valueProblems(key, raw) {
  if (raw.startsWith('"')) return quotedProblems(key, raw);
  if (/^['|>]/.test(raw)) return [`${key} uses a quoting style this check does not read: use a plain or double-quoted line`];
  return plainProblems(key, raw);
}

// The "key: value" lines of a frontmatter block, as { key: raw value }.
function frontmatterFields(block) {
  const lines = block.split("\n").map((l) => /^(\w+): ?(.*)$/.exec(l)).filter(Boolean);
  return Object.fromEntries(lines.map((m) => [m[1], m[2]]));
}

// The problems in a SKILL.md: the --- block at the top with a name equal to its folder and a whole description.
export function skillProblems(folder, src) {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(src);
  if (!block) return ["no --- frontmatter block at the top"];
  const fields = frontmatterFields(block[1]);
  const out = ["name", "description"].flatMap((key) => (key in fields ? valueProblems(key, fields[key]) : [`no ${key} line`]));
  if (fields.name && fields.name !== folder) out.push(`name ${fields.name} is not its folder ${folder}`);
  return out;
}

it("every skill's frontmatter parses, names its folder and keeps its whole description", () => {
  const folders = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  expect(folders.length, "the repo's skills").toBeGreaterThanOrEqual(13);
  const problems = folders.flatMap((f) => skillProblems(f, fs.readFileSync(path.join(SKILLS, f, "SKILL.md"), "utf8")).map((p) => `${f}: ${p}`));
  expect(problems).toEqual([]);
});

it("the check names each way a frontmatter loses text or fails to parse", () => {
  // A SKILL.md for folder x with this description line.
  const wrap = (desc) => `---\nname: x\ndescription: ${desc}\n---\nbody\n`;
  expect(skillProblems("x", wrap("Use for issues like #187 and more"))[0]).toContain("YAML comment");
  expect(skillProblems("x", wrap("for Vanguard: what is green"))[0]).toContain('": "');
  expect(skillProblems("x", wrap('"for Vanguard: what is green, issue #284"'))).toEqual([]);
  expect(skillProblems("x", wrap('"cut'))[0]).toContain("does not parse");
  expect(skillProblems("y", wrap("fine"))).toEqual(["name x is not its folder y"]);
  expect(skillProblems("x", "name: x\n")).toEqual(["no --- frontmatter block at the top"]);
  expect(skillProblems("x", "---\nname: x\n---\n")).toEqual(["no description line"]);
});
