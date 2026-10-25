// optionsreadable: the options window's reload tags, page reset, grouped Modules page and settings search (real Lua in the TEST-ONLY headless client).

import { expect, it } from "vitest";
import { CLICK_LUA, loggedIn } from "./helpers.mjs";

// The row widget (a shown one) with this caption, as Lua source: `w`.
const FIND = (caption) => `local w for _, x in ipairs(__wfgStub.frames) do if x.label and x.label.__text == "${caption}" and x:IsVisible() then w = x end end`;

it("options: a setting that applies on reload wears a tag, not (reload) in its caption", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const tagged = addon.eval(`${FIND("Safer colours")} return { w ~= nil, w.tag and w.tag.__text, w.tag and w.tag:IsShown() }`);
  expect(tagged, "Safer colours has its tag and no suffix").toEqual([true, "reload", true]);
  const plain = addon.eval(`${FIND("Pixel-perfect scale")} return { w ~= nil, w.tag ~= nil }`);
  expect(plain, "a setting that applies at once has no tag").toEqual([true, false]);
  const tip = addon.eval(`${FIND("Safer colours")} w.__scripts.OnEnter(w) local t = GameTooltip.__lines[1] and GameTooltip.__lines[1].text w.__scripts.OnLeave(w) return t`);
  expect(tip, "hovering the row says when it takes effect").toMatch(/Takes effect after \/reload\./);
  addon.eval('ns.Options.JumpTo("Safer colours (reload)")');
  expect(addon.eval("return Vanguard_Options.found:IsShown()"), "a link written with the old caption still finds the row").toBe(true);
});

it("options: a module's switch wears a Reload to apply tag, with the own-switch note after it", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("modules")');
  const tagged = addon.eval(`${FIND("Chat history")} return { w ~= nil, w.tag and w.tag.__text, w.tag and w.tag:IsShown() }`);
  expect(tagged, "the switch says it needs a reload").toEqual([true, "Reload to apply", true]);
  const note = addon.eval(`${FIND("Chat history")} local p = w.ownSwitch.__points.LEFT return { p.rel == w.tag, p.relPoint }`);
  expect(note, "the own-switch note sits after the tag, not over it").toEqual([true, "RIGHT"]);
  const tip = addon.eval(`${FIND("Chat history")} w.__scripts.OnEnter(w) local t = GameTooltip.__lines[1] and GameTooltip.__lines[1].text w.__scripts.OnLeave(w) return t`);
  expect(tip, "hovering the switch says when it takes effect").toBe("Takes effect after /reload.");
  const search = addon.eval(`local s = Vanguard_Options.search s:SetText("reload chat history") s:GetScript("OnTextChanged")(s)
    local out = {} for _, l in ipairs(Vanguard_Options.results.lines) do if l:IsShown() then out[#out + 1] = l.caption.__text .. "|" .. l.page.__text end end return out`);
  expect(Object.values(search), "a search for reload finds the module's switch").toEqual(["Chat history|Modules"]);
});

it("options: Reset this page asks, then puts back what changed on that page only", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  // Whether the Reset this page button is on.
  const enabled = () => addon.eval(`local on for _, x in ipairs(__wfgStub.frames) do if x.caption == "Reset this page" and x:IsVisible() then on = x:IsEnabled() end end return on`);
  expect(enabled(), "nothing changed: the button is off").toBe(false);
  addon.eval(`__click("Copy button in the chat's tab bar")`);
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
  const stale = addon.eval(`local have = {} for _, n in ipairs(ns.ModuleNames()) do have[n] = true end
    local out = {} for _, g in ipairs(ns.Options.MODULE_GROUPS) do for _, n in ipairs(g[2]) do if not have[n] then out[#out + 1] = n end end end return out`);
  expect(Object.values(stale), "every module a group names exists (one in no group is listed under More)").toEqual([]);
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
  expect(list()[0][0], "a word the caption doesn't say finds the setting, with its page").toBe("Safer colours|General");
  search("font size");
  expect(list()[0].some((l) => l.startsWith("Text size|")), "and so does font size").toBe(true);
  search("TEST-ONLY nothing");
  expect(list(), "no match says so").toEqual([{}, true]);
  search("");
  expect(list(), "an empty box hides the list").toBe(false);
  addon.eval(`ns.Options.Show("chat") __click("Copy button in the chat's tab bar")`);
  search("changed");
  expect(list()[0].some((l) => l.startsWith("Copy button in the chat's tab bar|")), "changed lists what differs from the default").toBe(true);
  addon.eval('Vanguard_Options.results.lines[1]:GetScript("OnClick")(Vanguard_Options.results.lines[1])');
  expect([addon.eval("return ns.Options.current"), addon.eval("return Vanguard_Options.found:IsShown()"), list()], "clicking a line opens its page, marks the row and hides the list").toEqual(["chat", true, false]);
  search("town and gear");
  expect(list(), "a page title that matches lights the nav and lists no settings").toBe(false);
  search("swing");
  addon.eval("Vanguard_Options:Hide()");
  expect(addon.eval("return Vanguard_Options.results:IsShown()"), "closing the window closes the list").toBe(false);
});

// Fills in TEST-ONLY translations (English key -> text) before the window first opens, as a locale file would.
const translate = (addon, texts) => addon.eval(Object.entries(texts).map(([key, text]) => `ns.L[${JSON.stringify(key)}] = ${JSON.stringify(text)}`).join(" "));
// Types into the search box, then reads the results list's lines ("caption|page").
const searched = (addon, text) => addon.eval(`local s = Vanguard_Options.search s:SetText(${JSON.stringify(text)}) s:GetScript("OnTextChanged")(s)
  local out = {} for _, l in ipairs(Vanguard_Options.results.lines) do if l:IsShown() then out[#out + 1] = l.caption.__text .. "|" .. l.page.__text end end return out`);

it("options: a translated reload caption gives its last bracket to the reload tag, half-width or full-width", () => {
  const addon = loggedIn(CLICK_LUA);
  translate(addon, { "Coordinates on the world map (reload)": "TEST-ONLY 世界地图坐标（重新加载）", "Gather addon minimap buttons into a drawer (reload)": "TEST-ONLY Knöpfe (Minikarte) (Neu laden)", "Tracking, mail and difficulty on the minimap's corners (reload)": "TEST-ONLY ohne Klammer" });
  addon.eval('ns.Options.Show("map")');
  // The shown row with this caption: whether it is there and its tag's words.
  const row = (caption) => addon.eval(`${FIND(caption)} return { w ~= nil, w and w.tag and w.tag.__text }`);
  expect(row("TEST-ONLY 世界地图坐标"), "a full-width bracket goes to the tag").toEqual([true, "reload"]);
  expect(row("TEST-ONLY Knöpfe (Minikarte)"), "only the last bracket goes; one inside the caption stays").toEqual([true, "reload"]);
  expect(row("TEST-ONLY ohne Klammer"), "a translation with no bracket at its end keeps its words and still wears the tag").toEqual([true, "reload"]);
});

it("options: search finds a translated setting by its translation, its English caption and either language's keywords", () => {
  const addon = loggedIn(CLICK_LUA);
  const words = addon.eval('return ns.Options.KEYWORDS["safer colours"]');
  translate(addon, { "Safer colours (reload)": "TEST-ONLY Sicherere Farben (Neu laden)", [words]: "TEST-ONLY farbenblind" });
  addon.eval(`ns.Options.KEYWORDS["safer colours"] = "TEST-ONLY farbenblind"`);
  addon.slash("");
  const hit = ["TEST-ONLY Sicherere Farben|General"];
  expect(Object.values(searched(addon, "sicherere farben")), "by the translation").toEqual(hit);
  expect(Object.values(searched(addon, "safer colours")), "by the English caption").toContain(hit[0]);
  expect(Object.values(searched(addon, "farbenblind")), "by a translated keyword").toEqual(hit);
  expect(Object.values(searched(addon, "colorblind")), "by the English keyword").toEqual(hit);
});

it("options: the nav keeps a translated page lit for its English title, and the translated word for changed lists the changed settings", () => {
  const addon = loggedIn(CLICK_LUA);
  translate(addon, { changed: "TEST-ONLY geaendert", Modules: "TEST-ONLY Module" });
  addon.eval(`ns.Options.PAGES[2].title = "TEST-ONLY Module" ns.Options.Show("chat") __click("Copy button in the chat's tab bar")`);
  addon.eval('ns.Options.Search("modules")');
  expect(addon.eval("return ns.Options.matched.modules == true"), "the English title still matches the page").toBe(true);
  expect(Object.values(searched(addon, "test-only geaendert")).some((l) => l.startsWith("Copy button in the chat's tab bar|")), "the translated word lists what differs from the default").toBe(true);
});

it("options: every search keyword belongs to a real caption", () => {
  const addon = loggedIn(CLICK_LUA);
  const gone = addon.eval(`local have = {}
    for _, page in ipairs(ns.Options.PAGES) do for _, row in ipairs(ns.Options.RowsOf(page)) do if type(row[2]) == "string" then have[row[2]:lower()] = true end end end
    local out = {} for caption in pairs(ns.Options.KEYWORDS) do if not have[caption] then out[#out + 1] = caption end end return out`);
  expect(Object.values(gone), "a caption that was renamed takes its keywords with it").toEqual([]);
});

it("options: picking a camera zoom on the Game windows page sets it and the game's zoom", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("windows")');
  const clicked = addon.eval('return __click("Furthest the camera zooms out")');
  const out = addon.eval(`return { camera = ns.GetModule("Quiet").settings.camera, cvar = tostring(GetCVar("cameraDistanceMaxZoomFactor")) }`);
  expect([clicked, out]).toEqual([true, { camera: 1.5, cvar: "1.5" }]);
});
