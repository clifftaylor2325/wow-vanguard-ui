// Tests for scripts/lib/toc.mjs: reading the TOC's file lines and their game-type tags, and which
// client loads each file. TEST-ONLY TOC text throughout.

import { expect, it } from "vitest";
import { CLIENT_GAME_TYPES, anyClientPaths, clientPaths, loadsOn, readToc, tocEntries, tocLine, tocPaths } from "./lib/toc.mjs";
import { root } from "./lib/lua-harness.mjs";

const TOC = [
  "## Interface: 16001, 120105",
  "# a comment",
  "",
  "Core\\Events.lua",
  "Modules/Forever.lua\t\t[AllowLoadGameType camelot] [ExcludeLoadGameType standard]",
  "Modules/Retail.lua [AllowLoadGameType Standard] [ExcludeLoadGameType camelot]\r",
  "Modules/Mainline.lua [AllowLoadGameType vanilla, mainline]",
  "Modules/Classic.lua [AllowLoadGameType classic]",
].join("\n");

it("WoW Forever is camelot and Retail standard, both of the mainline family", () => {
  expect(CLIENT_GAME_TYPES).toEqual({ forever: ["camelot", "mainline"], retail: ["standard", "mainline"] });
});

it("a file line splits into its path and its tags, values lower-cased and comma-separated", () => {
  expect(tocLine("Modules\\X.lua  [AllowLoadGameType Wrath, cata] [ExcludeLoadGameType camelot] [LoadIntoEnvironment secure]"))
    .toEqual({ path: "Modules/X.lua", allow: ["wrath", "cata"], exclude: ["camelot"], unknown: ["LoadIntoEnvironment"] });
  expect(tocLine("  Core/A.lua  ")).toEqual({ path: "Core/A.lua", allow: null, exclude: [], unknown: [] });
});

it("only file lines are entries, each with its line number", () => {
  expect(tocEntries(TOC).map((e) => [e.path, e.line])).toEqual([
    ["Core/Events.lua", 4], ["Modules/Forever.lua", 5], ["Modules/Retail.lua", 6], ["Modules/Mainline.lua", 7], ["Modules/Classic.lua", 8],
  ]);
});

it("an allow tag needs one of the client's game types and an exclude tag rules any of them out", () => {
  const [plain, forever, retail, mainline, classic] = tocEntries(TOC);
  expect([plain, forever, retail, mainline, classic].map((e) => loadsOn(e, "forever"))).toEqual([true, true, false, true, false]);
  expect([plain, forever, retail, mainline, classic].map((e) => loadsOn(e, "retail"))).toEqual([true, false, true, true, false]);
});

it("each client's files, every listed file, and the files some client loads", () => {
  expect(clientPaths(TOC, "forever")).toEqual(["Core/Events.lua", "Modules/Forever.lua", "Modules/Mainline.lua"]);
  expect(clientPaths(TOC, "retail")).toEqual(["Core/Events.lua", "Modules/Retail.lua", "Modules/Mainline.lua"]);
  expect(tocPaths(TOC)).toHaveLength(5);
  expect(anyClientPaths(TOC)).toEqual(["Core/Events.lua", "Modules/Forever.lua", "Modules/Retail.lua", "Modules/Mainline.lua"]);
});

it("the repo's TOC reads with its interface line first", () => {
  expect(readToc(root).split("\n")[0]).toBe("## Interface: 16001, 120105");
});
