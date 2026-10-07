// core-slash: /vg and its commands (stock, perf, frame), and the smoke-test checklist, in the
// TEST-ONLY headless client.

import { expect, it } from "vitest";
import { default as fs } from "node:fs";
import { default as path } from "node:path";
import { root } from "../lib/lua-harness.mjs";
import { chatHas, loggedIn } from "./helpers.mjs";

it("slash", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /unlock \| lock/), "/vg help lists commands").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /profile Default/), "/vg status shows the profile").toBeTruthy();
  addon.slash("profile Raid");
  expect(addon.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile }"), "/vg profile stages this character's switch until the reload").toEqual(["Default", "Raid"]);
  addon.clearChat();
  addon.slash("bogus");
  expect(chatHas(addon, /Unknown command/), "unknown commands say so").toBeTruthy();
});

it("/vg stock with the Errands module off says so instead of failing", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { Errands = false } } }" });
  for (const command of ["stock", "stock item:90011 5", "stock clear"]) {
    addon.clearChat();
    addon.slash(command);
    expect(Array.from(addon.chat()), "/vg " + command).toEqual([expect.stringMatching(/Errands are off \(\/vg > Modules\)\.$/)]);
  }
});

// The chat lines printed by one /vg command, without the colored "Vanguard:" prefix.
const said = (addon, command) => {
  addon.clearChat();
  addon.slash(command);
  return Array.from(addon.chat()).map((line) => line.replace(/^.*Vanguard:\S*\s/, ""));
};

it("/vg perf: says what it can without the game's counters", () => {
  const addon = loggedIn("GetCVar = nil C_CVar = nil SetCVar = nil C_Timer = nil");
  expect(said(addon, "perf"), "no profiling setting and no memory counter: it says so, and lists nothing").toEqual(["CPU off (/vg perf cpu turns the game's profiling on)  ·  memory: the client can't say"]);
  expect(said(addon, "perf cpu"), "no way to switch profiling").toEqual(["This client can't switch script profiling."]);
  expect(said(addon, "perf watch"), "no timers to print with").toEqual(["This client has no timers to print with."]);
  expect(said(addon, "perf bogus"), "anything else: the usage").toEqual(["Usage: /vg perf [cpu | watch]"]);
});

it("/vg frame: a frame's state, anchors and parents, and with deep its textures and child frames", () => {
  const addon = loggedIn();
  addon.eval(`local f = CreateFrame("Frame", "ProbeFrame", UIParent) f:SetSize(30, 20) f:SetPoint("CENTER", UIParent, "CENTER", 1, -2.5) f:SetAlpha(0.5) f:SetScale(2)
    local t = f:CreateTexture(nil, "ARTWORK") t:SetTexture("Probe/Art") t:SetAlpha(0) t:SetSize(10, 10) t:SetPoint("CENTER")
    local c = CreateFrame("Frame", "ProbeChild", f) c:Hide() f.Child = c`);
  const lines = said(addon, "frame ProbeFrame deep");
  expect(lines[0], "the first line: the frame's own state, where its rect is, and its parent").toMatch(/^ProbeFrame \(Frame\): shown yes, visible yes, alpha 0\.5 \(effective .*\), scale 2 \(effective 2\), 30 x 20 at 466, 257\.5, strata .* level \d+, under UIParent$/);
  expect(lines[1], "then each anchor").toBe("  CENTER to UIParent CENTER 1, -2.5");
  expect(lines[2], "then every ancestor's shown state").toBe("  under UIParent: shown yes, alpha 1, scale 1");
  expect(lines.slice(3), "deep: the regions and child frames, counted, one line each").toEqual([
    "  1 region(s):",
    expect.stringMatching(/^  \(unnamed Texture\) \(Texture\): shown yes, alpha 0, 10 x 10 at 476, 262\.5, layer ARTWORK, file Probe\/Art$/),
    "  1 child frame(s):",
    expect.stringMatching(/^  ProbeChild \(Frame\): shown no, alpha 1, 0 x 0 no rect, level \d+$/),
  ]);
  expect(said(addon, "frame ProbeFrame.Child"), "a dotted name follows keys from the global; an unanchored frame has no rect; without deep, no parts").toEqual([
    expect.stringMatching(/^ProbeChild \(Frame\): shown no, visible no, .*, 0 x 0 no rect, .*, under ProbeFrame$/), "  no anchors",
    "  under ProbeFrame: shown yes, alpha 0.5, scale 2", "  under UIParent: shown yes, alpha 1, scale 1"]);
  expect(said(addon, "frame Nope"), "a name that leads nowhere says so").toEqual(["No frame called Nope (a global name; dots follow keys: MinimapCluster.Tracking)."]);
  expect(said(addon, "frame"), "no name: the usage").toEqual(["Usage: /vg frame <name> [deep]   (a global frame name; dots follow keys: MinimapCluster.Tracking)"]);
});

// TEST-ONLY counters: Vanguard's CPU total (__cpu ms) and memory (2048 KB), each refreshed by its Update call (counted).
const PERF_ENV = `
  __cpu, __updates = 0, { cpu = 0, mem = 0 }
  UpdateAddOnCPUUsage = function() __updates.cpu = __updates.cpu + 1 end
  GetAddOnCPUUsage = function(name) return name == "Vanguard" and __cpu or 0 end
  UpdateAddOnMemoryUsage = function() __updates.mem = __updates.mem + 1 end
  GetAddOnMemoryUsage = function(name) return name == "Vanguard" and 2048 or 0 end
`;

it("/vg perf: CPU and memory with the change since the last report, the busiest functions, profiling and the watch", () => {
  const addon = loggedIn(PERF_ENV);
  expect(said(addon, "perf"), "profiling off: memory only").toEqual(["CPU off (/vg perf cpu turns the game's profiling on)  ·  memory 2.0 MB"]);
  addon.eval("ns.OfferReload = function(why) __reload = why end");
  said(addon, "perf cpu");
  expect(addon.eval("return { GetCVar('scriptProfile'), __reload:find('starts after a reload') ~= nil }"), "perf cpu turns profiling on, with a reload offered").toEqual(["1", true]);
  expect(said(addon, "perf")[0], "on, but not yet reloaded: the counter is still 0").toBe("CPU: profiling starts after a reload  ·  memory 2.0 MB");
  // Every named function costs 1 ms, two of them more (callees included).
  addon.eval(`__busy = { [ns.Theme.Panel] = 50, [ns.GetModule("Bags").SkinWindow] = 20 }
    GetFunctionCPUUsage = function(fn, callees) __callees = callees return __busy[fn] or 1, 1 end
    __cpu = 120`);
  const report = said(addon, "perf");
  expect(report.slice(0, 3), "the total, then the busiest functions, most first").toEqual(["CPU 120.0 ms in all  ·  memory 2.0 MB", "  1. Theme.Panel  50.0 ms", "  2. Bags.SkinWindow  20.0 ms"]);
  expect([report.length, addon.eval("return __callees"), addon.eval("return { __updates.cpu, __updates.mem }")], "ten of them at most, with what they call, after refreshing both counters").toEqual([11, true, [2, 3]]);
  addon.eval("__cpu = 150");
  addon.advance(60, 5);
  expect(said(addon, "perf")[0], "the change since the last report, and its rate").toBe("CPU 150.0 ms in all, +30.0 ms in the last 60 s (0.50 ms/s)  ·  memory 2.0 MB");
  expect(said(addon, "perf watch"), "watch says how often it prints").toEqual(["Printing Vanguard's CPU and memory every 60 s; /vg perf watch again stops."]);
  addon.clearChat();
  addon.eval("__cpu = 156");
  addon.advance(60, 5);
  expect(Array.from(addon.chat()).length, "a minute later: one line, no function list").toBe(1);
  expect(said(addon, "perf watch"), "asked again, it stops").toEqual(["Stopped printing Vanguard's CPU and memory."]);
  addon.advance(120, 5);
  expect(Array.from(addon.chat()).length, "and prints nothing more").toBe(1);
  addon.eval("GetAddOnCPUUsage = nil");
  expect(said(addon, "perf")[0], "profiling on with no counter").toBe("CPU: the client has no counter  ·  memory 2.0 MB");
  said(addon, "perf cpu");
  expect(addon.eval("return { GetCVar('scriptProfile'), __reload }"), "perf cpu again turns it off").toEqual(["0", "CPU profiling stops after a reload."]);
});

// Every distinct command word that follows "/vg " in the text, in order of first use.
const vgWords = (text) => [...new Set([...text.matchAll(/\/vg ([a-z]+)/g)].map((m) => m[1]))];

// The owner's checklist, as text.
const smokeText = () => fs.readFileSync(path.join(root, "docs", "SMOKE-TEST.md"), "utf8");

it("smoke-test checklist: every /vg command it names is real", () => {
  const words = vgWords(smokeText());
  expect(words).toEqual(expect.arrayContaining(["status", "errors", "setup", "unlock", "lock", "profile", "import", "export", "binds", "reset", "frames", "quests"]));
  const addon = loggedIn();
  const unknown = words.filter((word) => {
    addon.clearChat();
    addon.slash(word);
    return chatHas(addon, /Unknown command/);
  });
  expect(unknown).toEqual([]);
});

// How many lines of the text start with this label (the checklist's "- Do:" lines and so on).
const lineCount = (text, label) => text.split("\n").filter((l) => l.startsWith(label)).length;

it("smoke-test checklist: every step has its Do, Expect and paste lines", () => {
  const text = smokeText();
  const steps = lineCount(text, "### ");
  expect(lineCount(text, "- Do:")).toBe(steps);
  expect(lineCount(text, "- Expect:")).toBe(steps);
  expect(lineCount(text, "- If it fails, paste:")).toBe(steps);
  expect(steps).toBeGreaterThanOrEqual(30);
});
