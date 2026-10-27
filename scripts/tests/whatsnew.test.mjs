// whatsnew: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { SETUP_DONE, chatHas, isTok, loggedIn, setCombat, tok } from "./helpers.mjs";

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

// The options row whose caption is this text, its tab shown, as Lua.
const rowNamed = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.caption == "${text}" and ns.Options.RevealRow(w) then return w end end end)()`;

it("after an update the first login shows what's new once, grouped by module", () => {
  const addon = loggedIn(ENV);
  expect(state(addon), "the notes for the running version show and count as seen").toEqual({ shown: true, title: "What's new in Vanguard 9.9.9", seen: "9.9.9" });
  expect([addon.texts("TEST-ONLY RAID").length, addon.texts("TEST-ONLY OTHER").length], "each group is a section header (in capitals)").toEqual([1, 1]);
  expect(addon.find("TEST%-ONLY a new switch").text, "a thing that starts off says so").toMatch(/^TEST-ONLY a new switch {2}\|c[0-9a-f]{8}\(off by default\)\|r$/);
  expect(addon.frame("Vanguard_WhatsNew.lines[3]").kind, "a line with no setting is plain text, not a button").toBe("Frame");
  expect(addon.eval("return UISpecialFrames[#UISpecialFrames]"), "Escape closes it").toBe("Vanguard_WhatsNew");
  addon.click("Vanguard_WhatsNew.close");
  expect(state(addon).shown, "the close button closes it").toBe(false);
  const again = loggedIn(ENV, { savedVariables: 'VanguardDB.whatsNewSeen = "9.9.9"' });
  expect(again.eval("return Vanguard_WhatsNew == nil"), "the next login doesn't show it again").toBe(true);
});

it("what's new: the title is centred at the window offset with the X, the hint sits under it, and the window is at the dialog alpha", () => {
  const addon = loggedIn(ENV);
  const [inset, tight, small, title] = addon.eval("local T = ns.Theme return { T.CONTROL.inset, T.SPACE.tight, T.RoleSize('small'), T.RoleSize('title') }");
  const block = addon.eval(`local f = Vanguard_WhatsNew local t, h = f.title.__points.CENTER, f.hint.__points.TOP
    return { t.rel == f, t.relPoint, t.x, t.y, (select(2, f.title:GetFont())), h.rel == f.title, h.relPoint, h.y, (select(2, f.hint:GetFont())), f.hint:GetText() }`);
  expect(block, "the title's middle is T.CONTROL.inset down the window's top centre (the X's line) in the title role; the hint a tight gap under it in the small role").toEqual([true, "TOP", 0, -inset, title, true, "BOTTOM", -tight, small, "Click a line to open its setting."]);
  expect([addon.eval("return Vanguard_WhatsNew.title.__textColor"), addon.eval("return Vanguard_WhatsNew.hint.__textColor")], "the title in the text colour, the hint in text2").toEqual([tok(addon, "text").slice(0, 3).concat(1), tok(addon, "text2").slice(0, 3).concat(1)]);
  const close = addon.eval(`local b = CreateFrame("Button", nil, UIParent) ns.Theme.PlaceClose(b, Vanguard_WhatsNew) local p, c = b.__points.CENTER, Vanguard_WhatsNew.close.__points.CENTER return { p.x == c.x and p.y == c.y, c.relPoint }`);
  expect(close, "the X is where T.PlaceClose puts every window's").toEqual([true, "TOPRIGHT"]);
  const alpha = addon.eval(`for _, t in ipairs(__wfgStub.frames) do if t.__kind == "Texture" and t.__parent == Vanguard_WhatsNew and t.__layer == "BACKGROUND" and t.__vertexColor then return t.__vertexColor[4] end end`);
  expect(alpha, "T.ALPHA.dialog").toBe(addon.eval("return ns.Theme.ALPHA.dialog"));
});

it("what's new: a group's name is a section header (small muted capitals, 18 tall, the list's width) and a line with a setting is a list row (hover wash, accent text); a plain line is text", () => {
  const addon = loggedIn(ENV);
  const [width, small] = addon.eval("return { Vanguard_WhatsNew.view.child:GetWidth(), ns.Theme.RoleSize('small') }");
  const head = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.text and w.text.__text == "TEST-ONLY RAID" then
    return { w.__kind, w:GetHeight(), w:GetWidth(), w.__points.TOPLEFT.x, (select(2, w.text:GetFont())), w.text.__textColor } end end`);
  expect([head.slice(0, 5), isTok(addon, head[5], "muted")], "a Button 18 tall as wide as the list, at its left edge, in small muted capitals").toEqual([["Button", 18, width, 0, small], true]);
  const lines = addon.eval("local out = {} for i, l in ipairs(Vanguard_WhatsNew.lines) do out[i] = { l.__kind, l.SetSelected ~= nil, l.wash ~= nil, l.text.__textColor, l:GetWidth() } end return out");
  expect(lines.map((l) => l.slice(0, 3)), "the two lines with settings are rows with the selected look; the plain line is a Frame without it").toEqual([["Button", true, true], ["Button", true, true], ["Frame", false, false]]);
  expect([isTok(addon, lines[0][3], "accent"), isTok(addon, lines[2][3], "text"), lines[0][4]], "a link line's words are in the accent, a plain one's in the text colour, and rows span the list").toEqual([true, true, width]);
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

it("what's new: a long list scrolls with the wheel, with the soft bottom edge while more is below", () => {
  const long = `local items = {} for i = 1, 40 do items[i] = { text = "TEST-ONLY line " .. i } end
    ns.WHATS_NEW = { { version = "9.9.9", groups = { { label = "TEST-ONLY Long", items = items } } } }`;
  const addon = loggedIn(long + running("9.9.9"));
  // The list's scroll (whole units) and whether its bottom edge shows.
  const view = () => addon.eval("local v = Vanguard_WhatsNew.view return { math.floor(v:GetVerticalScroll()), v.fadeBottom:IsShown() }");
  expect(view(), "it starts at the top, with the edge showing more below").toEqual([0, true]);
  addon.wheel("Vanguard_WhatsNew.view", -1);
  expect(view(), "a notch down scrolls 40").toEqual([40, true]);
  for (let i = 0; i < 40; i++) addon.wheel("Vanguard_WhatsNew.view", -1);
  expect(addon.eval("local v = Vanguard_WhatsNew.view return { v.thumb:IsShown(), v.thumb:GetWidth(), v.thumb:GetAlpha() }"), "the thumb is the shared one: T.SCROLL.thumb wide at the rest alpha").toEqual([true, addon.eval("return ns.Theme.SCROLL.thumb"), addon.eval("return ns.Theme.SCROLL.rest")]);
  const bottom = addon.eval("local v = Vanguard_WhatsNew.view return math.floor(v.child:GetHeight() - v:GetHeight())");
  expect(view(), "at the bottom the edge goes").toEqual([bottom, false]);
  addon.wheel("Vanguard_WhatsNew.view", 100);
  expect(view()[0], "it never scrolls above the top").toBe(0);
});

it("what's new: a short list fits its window, so it shows no thumb and no soft edge", () => {
  const addon = loggedIn(ENV);
  expect(addon.eval("local v = Vanguard_WhatsNew.view return { v.thumb:IsShown(), v.fadeTop:IsShown(), v.fadeBottom:IsShown() }"), "nothing to scroll").toEqual([false, false, false]);
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
it("what's new: the hint to click a line shows only for notes that have a line with a setting", () => {
  const addon = loggedIn(ENV);
  addon.eval("ns.WhatsNew.Show(ns.WHATS_NEW[1])");
  expect(addon.eval("return Vanguard_WhatsNew.hint:IsShown()"), "9.9.9 has setting lines").toBe(true);
  addon.eval("ns.WhatsNew.Show(ns.WHATS_NEW[2])");
  expect(addon.eval("return Vanguard_WhatsNew.hint:IsShown()"), "9.8.0 has only plain lines").toBe(false);
});

it("what's new: a Text size change after the first fill lays the lines out again, so wrapped lines never overlap", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true });
  addon.login();
  addon.eval(ENV);
  addon.eval("ns.WhatsNew.Show(ns.WHATS_NEW[1])");
  addon.eval("__firstLine = Vanguard_WhatsNew.lines[1]");
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh() ns.WhatsNew.Show(ns.WHATS_NEW[1])");
  expect(addon.eval("return Vanguard_WhatsNew.lines[1] ~= __firstLine"), "the lines were built again").toBe(true);
  expect(addon.eval("local f = Vanguard_WhatsNew return f.textScale"), "the fill is stamped with the Text size it was laid out at").toBe(1.3);
  const heights = addon.eval(`local out = {} for _, l in ipairs(Vanguard_WhatsNew.lines) do out[#out + 1] = l:GetHeight() == l.text:GetStringHeight() end return out`);
  expect(heights.length > 0 && heights.every(Boolean), "each line is as tall as its text at the new size").toBe(true);
});
