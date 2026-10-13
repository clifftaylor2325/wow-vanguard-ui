// Core reaches into Modules by name string (ns.GetModule("X")), and three
// files call it at load time, which only works because Vanguard.toc lists
// the module they name first. Nothing in the game or the harness declares
// either, so this reads the Lua as text: every literal ns.GetModule name is a
// registered ns.Module name, and a load-time lookup (top-level, not inside a
// function) names a module listed earlier in the TOC.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { parseToc, root } from "./check-toc.mjs";

// The addon's own Lua files, in TOC order (the libraries are not modules).
const files = parseToc(fs.readFileSync(path.join(root, "Vanguard.toc"), "utf8")).files.map((f) => f.path).filter((f) => f.endsWith(".lua") && !f.startsWith("Libs/"));
const sources = new Map(files.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));

// Module names registered with ns.Module("Name", ...) in a file.
const registered = (src) => [...src.matchAll(/\bns\.Module\(\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);

// Module names looked up with ns.GetModule("Name") in a file, with the line.
const lookups = (src) => [...src.matchAll(/\bns\.GetModule\(\s*"([A-Za-z0-9_]+)"\s*\)/g)].map((m) => ({ name: m[1], line: src.slice(0, m.index).split("\n").length }));

// The lookups that run as the file loads: on a line with no indentation (not inside a function or block).
function loadTimeLookups(src) {
  const lines = src.split("\n");
  return lookups(src).filter((l) => /^\S/.test(lines[l.line - 1]));
}

const names = new Map();
for (const [file, src] of sources) for (const name of registered(src)) names.set(name, file);

it("every module name is registered once", () => {
  const all = files.flatMap((f) => registered(sources.get(f)));
  expect(new Set(all).size, "duplicate ns.Module names").toBe(all.length);
  expect(all.length).toBeGreaterThan(40);
});

it('every ns.GetModule("literal") names a registered module', () => {
  const unknown = [];
  for (const [file, src] of sources) for (const l of lookups(src)) if (!names.has(l.name)) unknown.push(`${file}:${l.line} ${l.name}`);
  expect(unknown).toEqual([]);
});

it("a load-time ns.GetModule names a module listed earlier in Vanguard.toc", () => {
  const late = [];
  files.forEach((file, i) => {
    for (const l of loadTimeLookups(sources.get(file))) {
      const at = files.indexOf(names.get(l.name));
      if (at < 0 || at >= i) late.push(`${file}:${l.line} needs ${l.name} (${names.get(l.name) ?? "unregistered"}) listed before it`);
    }
  });
  expect(late).toEqual([]);
});

it("the reader finds the known load-time lookups", () => {
  const found = files.flatMap((f) => loadTimeLookups(sources.get(f)).map((l) => `${f}:${l.name}`));
  expect(found).toContain("Modules/PowerTicks.lua:UnitFrames");
  expect(found.length).toBeGreaterThanOrEqual(3);
});
