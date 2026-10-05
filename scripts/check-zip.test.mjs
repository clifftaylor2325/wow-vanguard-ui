// Tests for scripts/check-zip.mjs: the release zip's entries are read back
// and checked against their CRCs, and compared with what the zip must hold.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { addonName, compareEntries, expectedEntries, root, zipEntries } from "./check-zip.mjs";

const out = fs.mkdtempSync(path.join(os.tmpdir(), "check-zip-test-"));
afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

// Builds the release zip from HEAD into the temp folder and returns its bytes.
function buildZip() {
  execFileSync(process.execPath, [path.join(root, "scripts/package.mjs"), "--out", out], { cwd: root });
  const name = fs.readdirSync(out).find((f) => f.endsWith(".zip"));
  return fs.readFileSync(path.join(out, name));
}

it("the built zip holds exactly the expected entries, each matching its CRC", () => {
  const zip = buildZip();
  const names = zipEntries(zip);
  expect(names[0]).toBe(`${addonName()}/${addonName()}.toc`);
  expect(names.at(-1)).toBe(`${addonName()}/LICENSE`);
  expect(compareEntries(names, expectedEntries("HEAD"))).toEqual({ missing: [], extra: [] });
});

it("a difference in the list is reported both ways", () => {
  const result = compareEntries(["A/x.lua", "A/y.lua"], ["A/x.lua", "A/z.lua"]);
  expect(result).toEqual({ missing: ["A/z.lua"], extra: ["A/y.lua"] });
});

it("a wrong CRC, damaged data and a file that is not a zip are each refused", () => {
  const zip = buildZip();
  // The central directory starts where the end record says; an entry's CRC sits 16 bytes in.
  const central = zip.readUInt32LE(zip.length - 22 + 16);
  const wrongCrc = Buffer.from(zip);
  wrongCrc[central + 16] ^= 0xff;
  expect(() => zipEntries(wrongCrc)).toThrow(/does not match its CRC/);
  // The first entry's data starts after its local header and name; flip a byte in it.
  const damaged = Buffer.from(zip);
  damaged[30 + zip.readUInt16LE(26) + 3] ^= 0xff;
  expect(() => zipEntries(damaged)).toThrow(/damaged|does not match its CRC/);
  expect(() => zipEntries(Buffer.from("TEST-ONLY not a zip"))).toThrow(/no end record/);
});
