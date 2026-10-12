// Tests for scripts/check-toc.mjs: the TOC against the files on disk and
// .luacheckrc. Most cases run the pure check over small TEST-ONLY inputs; one
// copies a minimal checkout to a temp folder, so no stray file is ever left
// in the repo.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { EXPECTED_INTERFACE, checkCheckout, luaFilesOnDisk, luacheckGlobals, parseToc, root, tocProblems } from "./check-toc.mjs";

const HEAD = ["## Interface: 16001, 120007", "## Title: Vanguard", "## Version: 1.0.0", "## SavedVariables: VanguardDB", "## SavedVariablesPerCharacter: VanguardCharDB"];
const FILES = ["Libs/LibStub/LibStub.lua", "Core/Events.lua", "Modules/Bars.lua"];
const RC = 'globals = {\n  -- saved\n  "VanguardDB",\n  "VanguardCharDB",\n  SlashCmdList = { other_fields = true },\n}\nread_globals = { "GetTime" }\n';

// The problems for a TOC made of `head` and `files`, with .luacheckrc `rc` and `disk` on disk.
function check({ head = HEAD, files = FILES, rc = RC, disk = ["Core/Events.lua", "Modules/Bars.lua"] } = {}) {
  return tocProblems({ toc: [...head, "", "# a comment", ...files].join("\r\n"), luacheckrc: rc, disk });
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-check-toc-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

it("the repo's own TOC passes", () => {
  expect(checkCheckout(root)).toEqual([]);
});

it("the command exits 0 with an OK line on the repo", () => {
  const out = execFileSync(process.execPath, [path.join(root, "scripts/check-toc.mjs")], { encoding: "utf8" });
  expect(out).toMatch(/^OK /);
});

it("a well-formed TOC passes, with CRLF endings and comment lines", () => {
  expect(check()).toEqual([]);
});

it("the expected Interface values are 16001 and 120007, kept in one constant", () => {
  expect(EXPECTED_INTERFACE).toEqual(["16001", "120007"]);
  expect(parseToc("## Interface: 16001, 120007\n").meta.Interface).toBe("16001, 120007");
});

it("an unlisted Modules/X.lua fails and names the fix", () => {
  const problems = check({ disk: ["Core/Events.lua", "Modules/Bars.lua", "Modules/X.lua"] });
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/^Modules\/X\.lua is not listed in Vanguard\.toc.*list it in load order, or delete it$/);
});

it("an unlisted Modules/X.lua in a copied checkout fails the command", () => {
  const dir = path.join(scratch, "checkout");
  fs.mkdirSync(path.join(dir, "Core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "Modules", "Sub"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Vanguard.toc"), [...HEAD, "Core/Events.lua", "Modules/Sub/Bars.lua"].join("\n"));
  fs.writeFileSync(path.join(dir, ".luacheckrc"), RC);
  for (const f of ["Core/Events.lua", "Modules/Sub/Bars.lua", "Modules/notes.txt"]) fs.writeFileSync(path.join(dir, f), "-- x\n");
  expect(luaFilesOnDisk(dir)).toEqual(["Core/Events.lua", "Modules/Sub/Bars.lua"]);
  expect(checkCheckout(dir)).toEqual([]);
  fs.writeFileSync(path.join(dir, "Modules", "X.lua"), "-- x\n");
  expect(checkCheckout(dir)).toEqual([expect.stringMatching(/^Modules\/X\.lua is not listed/)]);
  // Runs the command on the copied checkout.
  const run = () => execFileSync(process.execPath, [path.join(root, "scripts/check-toc.mjs"), "--root", dir], { stdio: "pipe" });
  expect(run).toThrow(/Modules\/X\.lua is not listed/);
});

it("a checkout without a .toc file is reported", () => {
  const dir = path.join(scratch, "empty");
  fs.mkdirSync(dir);
  expect(checkCheckout(dir)).toEqual([`${dir}: no .toc file in the root`]);
  expect(luaFilesOnDisk(dir)).toEqual([]);
});

it("a file listed twice fails, even in another case or with backslashes", () => {
  const problems = check({ files: [...FILES, "core\\events.lua"] });
  expect(problems).toEqual([expect.stringMatching(/^Vanguard\.toc:\d+: core\/events\.lua is listed twice \(first on line \d+\); remove one$/)]);
});

it("a SavedVariables name missing from .luacheckrc globals fails, for both kinds", () => {
  const rc = 'globals = {\n  "Other",\n}\nread_globals = { "VanguardDB", "VanguardCharDB" }\n';
  const problems = check({ rc });
  expect(problems).toHaveLength(2);
  expect(problems[0]).toMatch(/## SavedVariables names VanguardDB, which is not in globals in \.luacheckrc; add "VanguardDB" there/);
  expect(problems[1]).toMatch(/## SavedVariablesPerCharacter names VanguardCharDB/);
});

it("a commented-out global does not count, and keyed tables do", () => {
  const names = luacheckGlobals('globals = {\n  -- "VanguardDB",\n  "A", \'B\',\n  SlashCmdList = { other_fields = true },\n}\n');
  expect([...names].sort()).toEqual(["A", "B", "SlashCmdList", "other_fields"]);
  expect(luacheckGlobals("read_globals = { \"A\" }\n").size).toBe(0);
  expect(luacheckGlobals("globals = {\n  \"A\",\n").has("A")).toBe(true);
});

it("a missing Interface value, Title or Version fails", () => {
  const head = ["## Interface: 16001", "## SavedVariables: VanguardDB"];
  const problems = check({ head });
  expect(problems[0]).toMatch(/## Interface does not list 120007; it must list 16001, 120007/);
  expect(problems).toContain('Vanguard.toc: ## Title is missing; add a "## Title: ..." line');
  expect(problems).toContain('Vanguard.toc: ## Version is missing; add a "## Version: ..." line');
  expect(check({ head: [] }).filter((p) => p.includes("Interface"))).toHaveLength(2);
});

it("a shared library listed after the addon's own files fails", () => {
  const problems = check({ files: ["Core/Events.lua", "Libs/LibStub/LibStub.lua", "Modules/Bars.lua"] });
  expect(problems).toEqual([expect.stringMatching(/:\d+: Libs\/LibStub\/LibStub\.lua loads after Core\/Events\.lua \(line \d+\); move the shared libraries above/)]);
  expect(check({ files: ["Libs/LibStub/LibStub.lua"], disk: [] })).toEqual([]);
});
