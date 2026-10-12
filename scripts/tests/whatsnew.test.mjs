// whatsnew: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY notes for two versions, and the running version set to the newer one.
const NOTES = `
ns.WHATS_NEW = {
  { version = "9.9.9", groups = {
    { module = "RaidFrames", label = "TEST-ONLY Raid", items = {
      { text = "TEST-ONLY wider tiles", page = "raid", row = "Width" },
      { text = "TEST-ONLY a new switch", page = "general", row = "Run setup", off = true },
    } },
    { label = "TEST-ONLY Other", items = { { text = "TEST-ONLY plain line" } } },
  } },
  { version = "9.8.0", groups = { { label = "TEST-ONLY Old", items = { { text = "TEST-ONLY old line" } } } } },
}
UISpecialFrames = {}
`;
// The running version (the TOC's ## Version), as Lua.
const running = (v) => `__wfgWorld.addons.Vanguard.Version = "${v}"\n`;
const ENV = NOTES + running("9.9.9");

// The What's new window as the player sees it: shown, its title, and the version marked seen.
const state = (addon) => addon.eval(`local f = Vanguard_WhatsNew
  return { shown = f ~= nil and f:IsVisible(), title = f and f.title:GetText() or "", seen = VanguardDB.whatsNewSeen or "" }`);

// The options window's page and the row its jump marked (caption, mark shown).
const found = (addon) => addon.eval(`local f = Vanguard_Options.found local w for _, x in ipairs(__wfgStub.frames) do if x.found == f and f then w = x end end
  return { ns.Options.current, w and w.caption, f ~= nil and f:IsShown() }`);

// The visible options row whose caption is this text, as Lua.
const rowNamed = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.caption == "${text}" and w:IsVisible() then return w end end end)()`;

it("after an update the first login shows what's new once, grouped by module", () => {
  const addon = loggedIn(ENV);
  expect(state(addon), "the notes for the running version show and count as seen").toEqual({ shown: true, title: "What's new in Vanguard 9.9.9", seen: "9.9.9" });
  expect([addon.texts("TEST-ONLY Raid").length, addon.texts("TEST-ONLY Other").length], "each group is a heading").toEqual([1, 1]);
  expect(addon.find("TEST%-ONLY a new switch").text, "a thing that starts off says so").toMatch(/^TEST-ONLY a new switch {2}\|c[0-9a-f]{8}\(off by default\)\|r$/);
  expect(addon.frame("Vanguard_WhatsNew.lines[3]").kind, "a line with no setting is plain text, not a button").toBe("Frame");
  expect(addon.eval("return UISpecialFrames[#UISpecialFrames]"), "Escape closes it").toBe("Vanguard_WhatsNew");
  addon.click("Vanguard_WhatsNew.close");
  expect(state(addon).shown, "the close button closes it").toBe(false);
  const again = loggedIn(ENV, { savedVariables: 'VanguardDB.whatsNewSeen = "9.9.9"' });
  expect(again.eval("return Vanguard_WhatsNew == nil"), "the next login doesn't show it again").toBe(true);
});

it("what's new: a version without notes of its own shows nothing at login; /vg whatsnew shows the newest older notes", () => {
  const addon = loggedIn(NOTES + running("9.9.10"));
  expect(addon.eval("return Vanguard_WhatsNew == nil"), "no notes for 9.9.10: nothing at login").toBe(true);
  addon.slash("whatsnew");
  expect(state(addon), "9.9.9 is the newest not after 9.9.10; older notes don't count as this version's").toEqual({ shown: true, title: "What's new in Vanguard 9.9.9", seen: "" });
  addon.eval(running("9.8.5"));
  addon.slash("whatsnew");
  expect([state(addon).title, addon.texts("TEST-ONLY old line").length, addon.texts("TEST-ONLY wider tiles").length], "on 9.8.5 it shows 9.8.0's notes in place of the others").toEqual(["What's new in Vanguard 9.8.0", 1, 0]);
});

it("what's new: clicking a line opens its setting, on its options page, scrolled to the row and marked", () => {
  const addon = loggedIn(ENV);
  expect(addon.frame("Vanguard_WhatsNew.lines[1]").kind, "a line with a setting is a button").toBe("Button");
  addon.click("Vanguard_WhatsNew.lines[1]");
  expect(state(addon).shown, "the window steps aside").toBe(false);
  expect(addon.eval("return Vanguard_Options:IsVisible()"), "the options window opens").toBe(true);
  expect(found(addon), "on the Raid frames page, at the Width row").toEqual(["raid", "Width", true]);
});

it("what's new: a new account gets setup first, and this version's notes are marked seen without showing", () => {
  const addon = loggedIn(ENV, { firstRun: true });
  expect([addon.eval("return ns.Setup.Step()"), state(addon)], "setup opens; what's new doesn't").toEqual([1, { shown: false, title: "", seen: "9.9.9" }]);
  for (let i = 0; i < 4; i++) addon.eval("local b = Vanguard_Setup.next b:GetScript('OnClick')(b, 'LeftButton')");
  expect([addon.eval("return ns.Setup.Step() == nil and VanguardDB.setupDone"), state(addon).shown], "after setup it still doesn't show").toEqual([true, false]);
});

it("what's new: a new character on a set-up account sees it once its setup ends, never on top of it", () => {
  const addon = loggedIn(ENV, { firstRun: true, savedVariables: "VanguardDB = { version = 2, profiles = {}, setupDone = true }" });
  expect([addon.eval("return ns.Setup.Step()"), state(addon).shown], "setup opens first").toEqual([1, false]);
  addon.click("Vanguard_Setup.close");
  expect(state(addon), "closing setup brings what's new").toEqual({ shown: true, title: "What's new in Vanguard 9.9.9", seen: "9.9.9" });
});

it("what's new: a login in combat waits for combat to end", () => {
  const addon = loggedIn("__wfgStub.inCombat = true\n" + ENV);
  expect(state(addon).shown, "not in a fight").toBe(false);
  setCombat(addon, false);
  expect(state(addon).shown, "it shows when the fight ends").toBe(true);
});

it("/vg whatsnew and the General page's What's new button open it again; with no notes, chat says so", () => {
  const addon = loggedIn(ENV, { savedVariables: 'VanguardDB.whatsNewSeen = "9.9.9"' });
  addon.slash("help");
  expect(chatHas(addon, /whatsnew\s+what's new in this version/), "/vg help lists whatsnew").toBe(true);
  addon.slash("whatsnew");
  expect(state(addon).shown, "/vg whatsnew opens it").toBe(true);
  addon.click("Vanguard_WhatsNew.close");
  addon.eval('ns.Options.Show("general")');
  addon.eval(`local r = ${rowNamed("What's new")} r:GetScript("OnClick")(r, "LeftButton")`);
  expect(state(addon).shown, "the General page's button opens it").toBe(true);
  const none = loggedIn();
  none.slash("whatsnew");
  expect([chatHas(none, /This version of Vanguard has no release notes\.$/), none.eval("return Vanguard_WhatsNew == nil")], "no notes up to this version: a chat line, no window").toEqual([true, true]);
});

it("what's new: a long list scrolls with the wheel, with a soft edge while more is below", () => {
  const long = `local items = {} for i = 1, 40 do items[i] = { text = "TEST-ONLY line " .. i } end
    ns.WHATS_NEW = { { version = "9.9.9", groups = { { label = "TEST-ONLY Long", items = items } } } }`;
  const addon = loggedIn(long + running("9.9.9"));
  // The list's scroll (whole units) and whether its bottom edge shows.
  const view = () => addon.eval("local v = Vanguard_WhatsNew.view return { math.floor(v:GetVerticalScroll()), v.more:IsShown() }");
  expect(view(), "it starts at the top, with the edge showing more below").toEqual([0, true]);
  addon.wheel("Vanguard_WhatsNew.view", -1);
  expect(view(), "a notch down scrolls 40").toEqual([40, true]);
  for (let i = 0; i < 40; i++) addon.wheel("Vanguard_WhatsNew.view", -1);
  const bottom = addon.eval("local v = Vanguard_WhatsNew.view return math.floor(v.child:GetHeight() - v:GetHeight())");
  expect(view(), "at the bottom the edge goes").toEqual([bottom, false]);
  addon.wheel("Vanguard_WhatsNew.view", 100);
  expect(view()[0], "it never scrolls above the top").toBe(0);
});

it("what's new notes: every version has groups of lines, and every line's setting is a real row on a real page", () => {
  const addon = loggedIn();
  const problems = addon.eval(`local out = {}
    for _, e in ipairs(ns.WHATS_NEW) do
      if type(e.version) ~= "string" or #e.groups == 0 then out[#out + 1] = tostring(e.version) .. ": no version or groups" end
      for _, g in ipairs(e.groups) do
        if type(g.label) ~= "string" or #g.items == 0 then out[#out + 1] = e.version .. ": a group without a label or lines" end
        for _, item in ipairs(g.items) do
          if type(item.text) ~= "string" then out[#out + 1] = e.version .. ": a line without text" end
          if item.page then
            ns.Options.Show(item.page) ns.Options.JumpTo(item.row)
            local f = Vanguard_Options.found local w
            for _, x in ipairs(__wfgStub.frames) do if x.found == f and f and f:IsShown() then w = x end end
            if ns.Options.current ~= item.page or not w or not w.caption:lower():find(item.row:lower(), 1, true) then out[#out + 1] = item.text end
          end
        end
      end
    end
    return out`);
  expect(problems).toEqual({});
});
