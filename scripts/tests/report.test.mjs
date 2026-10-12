// /vg report: the one block a player copies into the feedback form on vanguardui.com.
// Its lines are read by the site's parser (wow-vanguard-ui-site src/feedback/report.js),
// so the checks below use the same patterns that parser does.

import { expect, it } from "vitest";
import { expectErrors, loggedIn } from "./helpers.mjs";

// The 20 generated entries of the size-cap case: Module<i>: then "long message " thirty times, then <i>.
// Built from its fixed parts and two digit runs only (D-01).
const GENERATED = new RegExp("^Module\\d+: " + "long message ".repeat(30) + "\\d+$");

// The report text, as /vg report shows it in the copy box.
const report = (addon) => {
  addon.slash("report");
  return addon.eval("return Vanguard_TextEdit:GetText()");
};

// The lines between the report markers.
const body = (text) => {
  const lines = text.split("\n");
  return lines.slice(lines.indexOf("### Vanguard report v1 ###") + 1, lines.indexOf("### end ###"));
};

it("/vg report opens one block with the markers and what /vg status says", () => {
  const addon = loggedIn();
  const text = report(addon);
  expect(addon.eval("return Vanguard_TextDialog:IsShown() and Vanguard_TextDialog.title:GetText()"), "a copy box, titled with where to paste it").toBe("Vanguard report: Ctrl+C, then paste at vanguardui.com/feedback");
  const lines = text.split("\n");
  expect([lines[0], lines.at(-1)], "it opens and closes with the markers the site looks for").toEqual(["### Vanguard report v1 ###", "### end ###"]);
  const inner = body(text);
  expect(inner[0], "the version line").toMatch(/^Vanguard v?\d[\w.-]*  ·  interface \d+  ·  profile Default  ·  \d+\/\d+ modules on$/);
  expect(inner.some((l) => /^Client (WoW Forever|Retail)\b/.test(l)), "the client line").toBe(true);
  expect(inner.some((l) => /^UI scale [\d.]+  ·  text \d+%/.test(l)), "the UI scale and text size").toBe(true);
  expect(inner.some((l) => /^Screen (\d+x\d+|size unknown)$/.test(l)), "the screen size").toBe(true);
  expect(inner.some((l) => /^Modules off: /.test(l)) && inner.some((l) => /^Skins: /.test(l)), "the modules turned off and the skins").toBe(true);
  expect(inner.at(-1), "and no errors").toBe("Errors: 0 (0 in all)");
});

it("/vg report lists the caught errors, newest last, with their stacks and no color codes", () => {
  expectErrors("RaidFrames: attempt to index a nil value", "Nameplates: |cffff0000bad|r arithmetic");
  const addon = loggedIn();
  addon.eval(`ns.Report("RaidFrames", "attempt to index a nil value")
    ns.Report("RaidFrames", "attempt to index a nil value")
    ns.Report("Nameplates", "|cffff0000bad|r arithmetic")
    -- TEST-ONLY stacks (the test client records none for errors raised from a test): 12 lines, colored.
    local lines = {}
    for i = 1, 12 do lines[i] = "\\t|cff00ff00Core/Events.lua|r:" .. (100 + i) .. ": in function <eval:" .. i .. ">" end
    ns.errors[1].stack = table.concat(lines, "\\n")
    ns.errors[2].stack = "\\tCore/Events.lua:136: in metamethod '__add'"`);
  const text = report(addon);
  expect(text.includes("|c") || text.includes("|r"), "color codes are stripped").toBe(false);
  const inner = body(text);
  expect(inner.find((l) => l.startsWith("Errors:")), "the count of errors and of times they happened").toBe("Errors: 2 (3 in all)");
  const errors = inner.filter((l) => /^(?:\[\d+\]\s+)?(\S.*?)\s+\(x(\d+)\)\s*$/.test(l) && !/^\s/.test(l));
  expect(errors.length, "one line per error, in the shape the site reads").toBe(2);
  expect(errors[0], "the first error, counted").toMatch(/^\[1\] RaidFrames: .*attempt to index a nil value  \(x2\)$/);
  expect(errors[1], "the newest last, its color codes gone").toMatch(/^\[2\] Nameplates: .*bad arithmetic  \(x1\)$/);
  const stack = inner.slice(inner.indexOf(errors[0]) + 1, inner.indexOf(errors[1]));
  expect(stack.length, "the first error's 12 stack lines are cut to 8").toBe(8);
  expect(stack.every((l) => /^\s+\S/.test(l)) && stack[0].trim(), "indented under it, colors gone").toBe("Core/Events.lua:101: in function <eval:1>");
  expect(inner.at(-1).trim(), "the newest error's stack closes the list").toBe("Core/Events.lua:136: in metamethod '__add'");
});

it("/vg report stays under 8,000 characters: stacks go first, then the oldest errors", () => {
  // The case plants 20 entries and the cap keeps all 20, so the guard judges every one of them.
  expectErrors(GENERATED);
  const addon = loggedIn();
  addon.eval(`for i = 1, 20 do ns.Report("Module" .. i, string.rep("long message ", 30) .. i) end`);
  const text = addon.eval("return ns.ReportText()");
  expect(text.length, "the report fits").toBeLessThanOrEqual(8000);
  const lines = text.split("\n");
  expect([lines[0], lines.at(-1)], "with both markers").toEqual(["### Vanguard report v1 ###", "### end ###"]);
  expect(text.includes("Module20: "), "the newest error is kept").toBe(true);
  expect(lines.some((l) => /^\s+\S/.test(l)), "its stacks were trimmed to fit").toBe(false);
  expect(text.includes("Module1: "), "and the oldest went once the stacks alone weren't enough").toBe(false);
  expect(addon.eval("return #ns.errors"), "the caught errors themselves are untouched").toBe(20);
});

it("/vg status and /vg errors are unchanged by the report", () => {
  const addon = loggedIn();
  addon.clearChat();
  addon.slash("status");
  expect(addon.chat().some((l) => /Vanguard \S+  ·  profile Default  ·  \d+\/\d+ modules on/.test(l)), "/vg status still prints its first line").toBe(true);
  addon.clearChat();
  addon.slash("errors");
  expect(addon.chat().some((l) => /No errors caught this session\./.test(l)), "/vg errors still answers").toBe(true);
});

it("/vg report names the modules turned off and the skinned addons, with any that are off or failed", () => {
  // The "Broken" skin throws on purpose; only the line number of its error varies.
  expectErrors(/^skin for Broken: eval:\d+: oops$/);
  const addon = loggedIn(`Vanguard.RegisterSkin("Good", function() end)
    Vanguard.RegisterSkin("Broken", function() error("oops") end)
    Vanguard.RegisterSkin("Muted", function() end)`, {
    savedVariables: 'VanguardDB = { version = 2, setupDone = true, profiles = { Default = { modules = { RaidFrames = false }, skins = { Muted = false } } } }',
  });
  const inner = body(report(addon));
  expect(inner.find((l) => l.startsWith("Modules off:")), "the module turned off").toBe("Modules off: RaidFrames");
  expect(inner.find((l) => l.startsWith("Skins:")), "every skin, marked where it is off or failed").toBe("Skins: Good, Broken (failed), Muted (off)");
});
