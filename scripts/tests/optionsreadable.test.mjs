// optionsreadable: the options window's reload tags, page reset, grouped Modules page and settings search (real Lua in the TEST-ONLY headless client).

import { expect, it } from "vitest";
import { CLICK_LUA, loggedIn } from "./helpers.mjs";

// The row widget (a shown one) with this caption, as Lua source: `w`.
const FIND = (caption) => `local w for _, x in ipairs(__wfgStub.frames) do if x.label and x.label.__text == "${caption}" and x:IsVisible() then w = x end end`;

it("options: a setting that applies on reload wears a tag, not (reload) in its caption", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const tagged = addon.eval(`${FIND("Color assist")} return { w ~= nil, w.tag and w.tag.__text, w.tag and w.tag:IsShown() }`);
  expect(tagged, "Color assist has its tag and no suffix").toEqual([true, "reload", true]);
  const plain = addon.eval(`${FIND("Pixel-perfect scale")} return { w ~= nil, w.tag ~= nil }`);
  expect(plain, "a setting that applies at once has no tag").toEqual([true, false]);
  const tip = addon.eval(`${FIND("Color assist")} w.__scripts.OnEnter(w) local t = GameTooltip.__lines[1] and GameTooltip.__lines[1].text w.__scripts.OnLeave(w) return t`);
  expect(tip, "hovering the row says when it takes effect").toMatch(/Takes effect after \/reload\./);
  addon.eval('ns.Options.JumpTo("Color assist (reload)")');
  expect(addon.eval("return Vanguard_Options.found:IsShown()"), "a link written with the old caption still finds the row").toBe(true);
});

it("options: Reset this page asks, then puts back what changed on that page only", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  // Whether the Reset this page button is on.
  const enabled = () => addon.eval(`local on for _, x in ipairs(__wfgStub.frames) do if x.caption == "Reset this page" and x:IsVisible() then on = x:IsEnabled() end end return on`);
  expect(enabled(), "nothing changed: the button is off").toBe(false);
  addon.eval('__click("Copy button over the chat")');
  expect(enabled(), "a changed setting turns it on").toBe(true);
  addon.eval('__click("Reset this page")');
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "it names the page").toMatch(/Chat page/);
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(enabled(), "No leaves the change and the button on").toBe(true);
  addon.eval('__click("Reset this page") Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(enabled(), "Reset puts the default back and the button goes off again").toBe(false);
  addon.eval('ns.Options.Show("feedback")');
  expect(addon.eval(`for _, x in ipairs(__wfgStub.frames) do if x.caption == "Reset this page" and x:IsVisible() then return true end end return false`), "a page with no settings has none").toBe(false);
});

it("options: the Modules page is grouped like the nav, and a filter shows the ones on or off", () => {
  const addon = loggedIn(CLICK_LUA);
  // The Modules page's rows as "kind|caption".
  const rows = () => addon.eval(`local out = {} for _, r in ipairs(ns.Options.PAGES[2].rows()) do out[#out + 1] = r[1] .. "|" .. tostring(r[2]) end return out`);
  const all = rows();
  expect(all.filter((r) => r.startsWith("header|")).slice(0, 4), "headers follow the nav").toEqual(["header|Modules", "header|Unit frames", "header|Raid frames", "header|Action bars"]);
  const names = addon.eval("return ns.ModuleNames()");
  expect(all.filter((r) => r.startsWith("module|")).length, "every module has exactly one switch").toBe(names.length);
  const missing = addon.eval(`local listed = {} for _, g in ipairs(ns.Options.MODULE_GROUPS) do for _, n in ipairs(g[2]) do listed[n] = true end end
    local out = {} for _, n in ipairs(ns.ModuleNames()) do if not listed[n] then out[#out + 1] = n end end return out`);
  expect(Object.values(missing), "every module is in a group (a new module needs a line in O.MODULE_GROUPS)").toEqual([]);
  expect(all.includes("header|More"), "so nothing falls into More").toBe(false);
  addon.eval('ns.SetModuleEnabled("Chat", false) ns.Options.Show("modules") ns.Options.PAGES[2].rows()[3][5]("off")');
  expect(addon.eval("return ns.Options.moduleFilter"), "the filter cycle sets the filter").toBe("off");
  expect(rows().filter((r) => !r.startsWith("text|")).slice(1), "Off lists only the module that is off, under its group").toEqual(["cycle|Show", "header|Chat", "module|Chat"]);
  addon.eval('ns.Options.PAGES[2].rows()[3][5]("on")');
  expect(rows().some((r) => r === "module|Chat"), "On leaves it out").toBe(false);
  addon.eval('ns.Options.moduleFilter = "all"');
});

it("options: search lists the settings that match under the box, opens one, and lists the changed ones", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("");
  // Types into the search box.
  const search = (text) => addon.eval(`local s = Vanguard_Options.search s:SetText("${text}") s:GetScript("OnTextChanged")(s)`);
  // The results list: false while hidden, else its lines ("caption|page") and whether it says nothing matched.
  const list = () => addon.eval(`local r = Vanguard_Options.results if not r or not r:IsShown() then return false end
    local out = {} for _, l in ipairs(r.lines) do if l:IsShown() then out[#out + 1] = l.caption.__text .. "|" .. l.page.__text end end return { out, r.none:IsShown() }`);
  search("colour blind");
  expect(list()[0][0], "a word the caption doesn't say finds the setting, with its page").toBe("Color assist|General");
  search("font size");
  expect(list()[0].some((l) => l.startsWith("Text size|")), "and so does font size").toBe(true);
  search("TEST-ONLY nothing");
  expect(list(), "no match says so").toEqual([{}, true]);
  search("");
  expect(list(), "an empty box hides the list").toBe(false);
  addon.eval('ns.Options.Show("chat") __click("Copy button over the chat")');
  search("changed");
  expect(list()[0].some((l) => l.startsWith("Copy button over the chat|")), "changed lists what differs from the default").toBe(true);
  addon.eval('Vanguard_Options.results.lines[1]:GetScript("OnClick")(Vanguard_Options.results.lines[1])');
  expect([addon.eval("return ns.Options.current"), addon.eval("return Vanguard_Options.found:IsShown()"), list()], "clicking a line opens its page, marks the row and hides the list").toEqual(["chat", true, false]);
  search("town and gear");
  expect(list(), "a page title that matches lights the nav and lists no settings").toBe(false);
  search("swing");
  addon.eval("Vanguard_Options:Hide()");
  expect(addon.eval("return Vanguard_Options.results:IsShown()"), "closing the window closes the list").toBe(false);
});

it("options: every search keyword belongs to a real caption", () => {
  const addon = loggedIn(CLICK_LUA);
  const gone = addon.eval(`local have = {}
    for _, page in ipairs(ns.Options.PAGES) do for _, row in ipairs(ns.Options.RowsOf(page)) do if type(row[2]) == "string" then have[row[2]:lower()] = true end end end
    local out = {} for caption in pairs(ns.Options.KEYWORDS) do if not have[caption] then out[#out + 1] = caption end end return out`);
  expect(Object.values(gone), "a caption that was renamed takes its keywords with it").toEqual([]);
});
