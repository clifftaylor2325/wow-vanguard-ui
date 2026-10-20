// broker: other addons' data feeds in the broker strip (Modules/BrokerStrip.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, loggedIn } from "./helpers.mjs";

// TEST-ONLY LibDataBroker-1.1 as another addon would load it (a minimal stand-in on the bundled
// LibStub and CallbackHandler): __feed(name, obj) shares a feed, __set(name, key, value) changes one.
const LDB_ENV = `
  local ldb = LibStub:NewLibrary("LibDataBroker-1.1", 4)
  ldb.callbacks = LibStub("CallbackHandler-1.0"):New(ldb)
  ldb.objs = {}
  function ldb:NewDataObject(name, obj) self.objs[name] = obj self.callbacks:Fire("LibDataBroker_DataObjectCreated", name, obj) return obj end
  function ldb:DataObjectIterator() return pairs(self.objs) end
  function ldb:GetDataObjectByName(name) return self.objs[name] end
  function __feed(name, obj) return ldb:NewDataObject(name, obj) end
  function __set(name, key, value) ldb.objs[name][key] = value ldb.callbacks:Fire("LibDataBroker_AttributeChanged", name, key, value, ldb.objs[name]) end
  __clicks = {}
  __feed("TEST-ONLY Gold", { type = "data source", text = "12g", icon = "TEST-ONLY-ICON",
    OnTooltipShow = function(tip) tip.__shownBy = "gold" end, OnClick = function(_, button) __clicks[#__clicks + 1] = button end })
  __feed("TEST-ONLY Guild", { type = "data source", label = "Guild", OnEnter = function() __entered = true end, OnLeave = function() __left = true end })
  __feed("TEST-ONLY Launcher", { type = "launcher", icon = "TEST-ONLY-ICON" })
`;

// The strip's shown slots: { name, text } each, and whether the strip shows.
const strip = (addon) => addon.eval(`local out = {}
  for i = 1, 4 do local s = _G["Vanguard_BrokerSlot" .. i] if s:IsShown() then out[#out + 1] = { s.name, s.text:GetText() } end end
  return { shown = Vanguard_BrokerStrip:IsShown(), slots = out }`);

it("broker strip: picked feeds show with their text and icon, and follow their changes", () => {
  const addon = loggedIn(LDB_ENV, { savedVariables: "VanguardDB.profiles = { Default = { BrokerStrip = { feeds = { 'TEST-ONLY Guild', 'TEST-ONLY Gold', 'TEST-ONLY Gone' } } } }" });
  expect(addon.eval("return ns.GetModule('BrokerStrip').Sources()"), "data sources only, by name").toEqual(["TEST-ONLY Gold", "TEST-ONLY Guild"]);
  expect(strip(addon), "in the order picked; a feed no addon shares is skipped; a feed with no text shows its label").toEqual({ shown: true, slots: [["TEST-ONLY Guild", "Guild"], ["TEST-ONLY Gold", "12g"]] });
  expect(addon.eval("return { Vanguard_BrokerSlot1.icon:IsShown(), Vanguard_BrokerSlot2.icon:IsShown(), Vanguard_BrokerSlot2.icon.__texture }"), "the icon, where it has one").toEqual([false, true, "TEST-ONLY-ICON"]);
  addon.eval('__set("TEST-ONLY Gold", "text", "13g") __set("TEST-ONLY Launcher", "text", "x")');
  expect(strip(addon).slots[1], "a change repaints its slot").toEqual(["TEST-ONLY Gold", "13g"]);
  addon.eval('__feed("TEST-ONLY Late", { type = "data source", text = 7 }) ns.GetModule("BrokerStrip").Choose("TEST-ONLY Late", true)');
  expect(strip(addon).slots[2], "a feed shared later, picked: it joins, a number as text").toEqual(["TEST-ONLY Late", "7"]);
  addon.eval('local BS = ns.GetModule("BrokerStrip") BS.Choose("TEST-ONLY Guild", false) BS.Choose("TEST-ONLY Gold", false) BS.Choose("TEST-ONLY Late", false)');
  expect(strip(addon).shown, "nothing picked: the strip hides").toBe(false);
});

it("broker strip: hover shows the feed's tooltip, and clicks reach it", () => {
  const addon = loggedIn(LDB_ENV, { savedVariables: "VanguardDB.profiles = { Default = { BrokerStrip = { feeds = { 'TEST-ONLY Gold', 'TEST-ONLY Guild' } } } }" });
  addon.eval("local s = Vanguard_BrokerSlot1 s.__scripts.OnEnter(s) s.__scripts.OnClick(s, 'RightButton')");
  expect([addon.eval("return GameTooltip.__shownBy"), addon.eval("return GameTooltip:IsShown()"), addon.eval("return __clicks")], "its tooltip, and the click with its button").toEqual(["gold", true, ["RightButton"]]);
  addon.eval("local s = Vanguard_BrokerSlot1 s.__scripts.OnLeave(s)");
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving hides it").toBe(false);
  addon.eval("local s = Vanguard_BrokerSlot2 s.__scripts.OnEnter(s) s.__scripts.OnLeave(s) s.__scripts.OnClick(s, 'LeftButton')");
  expect(addon.eval("return { __entered, __left, #__clicks }"), "a feed with its own enter and leave, and no click").toEqual([true, true, 1]);
  const many = loggedIn(LDB_ENV + 'for i = 1, 5 do __feed("TEST-ONLY Feed " .. i, { type = "data source", text = i }) end', {
    savedVariables: "VanguardDB.profiles = { Default = { BrokerStrip = { feeds = { 'TEST-ONLY Feed 1', 'TEST-ONLY Feed 2', 'TEST-ONLY Feed 3', 'TEST-ONLY Feed 4', 'TEST-ONLY Feed 5' } } } }" });
  expect(strip(many).slots.length, "four at most").toBe(4);
});

it("broker strip: without LibDataBroker it hides, and joins when an addon loads it; options list the feeds", () => {
  const addon = loggedIn(CLICK_LUA);
  expect([strip(addon).shown, addon.eval("return #ns.GetModule('BrokerStrip').Sources()")], "no broker: hidden, no feeds").toEqual([false, 0]);
  addon.eval('ns.Options.Show("map")');
  expect(addon.eval('return __click("TEST-ONLY Gold")'), "no feed switches on the page").toBe(false);
  addon.eval(LDB_ENV);
  addon.eval("ns.GetModule('BrokerStrip').Choose('TEST-ONLY Gold', true)");
  addon.fire("ADDON_LOADED", "TEST-ONLY Feeder");
  addon.eval('__set("TEST-ONLY Gold", "text", "14g")');
  expect(strip(addon).slots, "the broker loaded later: hooked, so the picked feed shows and follows its changes").toEqual([["TEST-ONLY Gold", "14g"]]);
  const page = loggedIn(CLICK_LUA + LDB_ENV);
  page.eval('ns.Options.Show("map")');
  page.eval('__click("TEST-ONLY Guild")');
  expect([page.eval("return ns.GetModule('BrokerStrip').Chosen('TEST-ONLY Guild')"), strip(page).slots], "a feed's switch picks it").toEqual([true, [["TEST-ONLY Guild", "Guild"]]]);
  const off = loggedIn(LDB_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { BrokerStrip = false } } }" });
  off.eval("ns.GetModule('BrokerStrip').Choose('TEST-ONLY Gold', true)");
  expect([off.eval("return Vanguard_BrokerStrip == nil"), off.eval("return ns.GetModule('BrokerStrip').Chosen('TEST-ONLY Gold')")], "module off: no strip, but picks are kept").toEqual([true, true]);
});

// Each shown slot's width, the strip's width and height.
const sizes = (addon) => addon.eval(`local out = {}
  for i = 1, 4 do local s = _G["Vanguard_BrokerSlot" .. i] if s:IsShown() then out[#out + 1] = s:GetWidth() end end
  return { out, Vanguard_BrokerStrip:GetWidth(), Vanguard_BrokerStrip:GetHeight() }`);

it("broker strip: each slot fits its feed between 48 and 200 wide, grows but never shrinks while you play, and the strip fits the slots", () => {
  const addon = loggedIn(LDB_ENV + '__feed("TEST-ONLY Long", { type = "data source", text = string.rep("x", 40) })', {
    savedVariables: "VanguardDB.profiles = { Default = { BrokerStrip = { feeds = { 'TEST-ONLY Gold', 'TEST-ONLY Guild', 'TEST-ONLY Long' } } } }" });
  expect(sizes(addon), "12g at the 48 floor, Guild's icon-less 5 letters (50), a long text held to 200; slots side by side inside 4 each end").toEqual([[48, 50, 200], 306, 18]);
  expect(addon.eval("local p = Vanguard_BrokerSlot3.__points.LEFT return { p.rel == Vanguard_BrokerStrip, p.x }"), "the third slot starts after the first two").toEqual([true, 102]);
  addon.eval('__set("TEST-ONLY Gold", "text", "1234g 56s 78c")');
  expect(sizes(addon)[0], "a longer figure widens its slot (12 + 78 + 8) and the strip lays out again").toEqual([98, 50, 200]);
  addon.eval('__set("TEST-ONLY Gold", "text", "1g")');
  expect(sizes(addon)[0][0], "a shorter one keeps the width, so the strip doesn't jump").toBe(98);
  addon.eval('__set("TEST-ONLY Guild", "value", "x")');
  expect(sizes(addon)[0], "a change to anything else is not measured").toEqual([98, 50, 200]);
  addon.eval("Vanguard_BrokerSlot1.text.GetStringWidth = function() return { __secret = true } end ns.GetModule('BrokerStrip').widths = {} ns.GetModule('BrokerStrip').Layout()");
  expect(sizes(addon)[0][0], "a width the client hides: the old fixed 120").toBe(120);
});

it("broker strip: a feed's own icon crop and tint, a hidden text, and the tooltip on the side with room", () => {
  const addon = loggedIn(LDB_ENV, { savedVariables: "VanguardDB.profiles = { Default = { BrokerStrip = { feeds = { 'TEST-ONLY Gold' } } } }" });
  const icon = () => addon.eval("local i = Vanguard_BrokerSlot1.icon return { i.__texCoord, i.__vertexColor }");
  expect(icon(), "whole and untinted by default").toEqual([[0, 1, 0, 1], [1, 1, 1, 1]]);
  addon.eval('local o = LibStub("LibDataBroker-1.1"):GetDataObjectByName("TEST-ONLY Gold") o.iconCoords = { 0.1, 0.9, 0.1, 0.9 } o.iconR, o.iconG = 0.5, 0.25 __set("TEST-ONLY Gold", "iconB", "TEST-ONLY not a number")');
  expect(icon(), "the feed's crop and colour, a channel that isn't a number left white").toEqual([[0.1, 0.9, 0.1, 0.9], [0.5, 0.25, 1, 1]]);
  addon.eval('__set("TEST-ONLY Gold", "text", { __secret = true })');
  expect(strip(addon).slots[0][1], "a hidden text shows nothing").toBe("");
  // The anchor the tooltip took on hover.
  const anchor = () => addon.eval("local s = Vanguard_BrokerSlot1 s.__scripts.OnEnter(s) s.__scripts.OnLeave(s) return GameTooltip.__anchor");
  expect(anchor(), "at the top of the screen it opens below").toBe("ANCHOR_BOTTOM");
  addon.eval('Vanguard_BrokerStrip:ClearAllPoints() Vanguard_BrokerStrip:SetPoint("BOTTOM", UIParent, "BOTTOM", 0, 40)');
  expect(anchor(), "near the bottom it opens above").toBe("ANCHOR_TOP");
});

it("broker strip: at Text size 130 % the strip and its icons are taller, and the slots measure their text again", () => {
  const addon = loggedIn(LDB_ENV, { savedVariables: "VanguardDB.profiles = { Default = { BrokerStrip = { feeds = { 'TEST-ONLY Gold' } } } }" });
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  expect([sizes(addon)[2], addon.eval("return { Vanguard_BrokerSlot1:GetHeight(), Vanguard_BrokerSlot1.icon:GetWidth() }")], "13-point text: a 17-tall slot in a 21-tall strip, a 15 icon").toEqual([21, [17, 15]]);
  addon.eval("ns.Theme.Settings().textScale = 1 ns.Theme.Refresh()");
  expect(sizes(addon)[2], "and back").toBe(18);
});
