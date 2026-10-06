// .pkgmeta (CurseForge's and Wago's packager) must package exactly what the
// release zip holds (scripts/package.mjs, checked by scripts/check-zip.mjs),
// so a player gets the same files from CurseForge as from a GitHub release.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { addonName, expectedEntries, root } from "./check-zip.mjs";

// .pkgmeta's package-as and its ignore list (a small reader for this file's own layout).
function readPkgmeta() {
  const text = fs.readFileSync(path.join(root, ".pkgmeta"), "utf8");
  const packageAs = text.match(/^package-as:\s*(\S+)/m)?.[1];
  const block = text.split(/^ignore:\s*$/m)[1] || "";
  const ignore = [...block.matchAll(/^\s+-\s+(\S+)\s*$/gm)].map((m) => m[1]);
  return { packageAs, ignore };
}

// Whether a repo path is left out by an ignore entry (the file itself, or anything under that folder).
const ignored = (file, ignore) => ignore.some((i) => file === i || file.startsWith(`${i}/`));

// The files the packager would ship: every tracked file not ignored, in the package-as folder.
function packaged({ packageAs, ignore }) {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root }).toString("utf8").split("\n").filter(Boolean);
  return tracked.filter((f) => !ignored(f, ignore)).map((f) => `${packageAs}/${f}`);
}

it(".pkgmeta packages the addon under its own folder name", () => {
  expect(readPkgmeta().packageAs).toBe(addonName());
});

it(".pkgmeta ships exactly the release zip's files", () => {
  const pkg = new Set(packaged(readPkgmeta()));
  const zip = new Set(expectedEntries("HEAD"));
  expect([...pkg].filter((f) => !zip.has(f)).sort(), "shipped by CurseForge but not in the release zip").toEqual([]);
  expect([...zip].filter((f) => !pkg.has(f)).sort(), "in the release zip but left out by .pkgmeta").toEqual([]);
});
