// tooltip: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { UNITS_ENV, calls, expectErrors, isTok, loggedIn, tooltip } from "./helpers.mjs";

// TEST-ONLY tooltip: GameTooltip as a plain frame with the tooltip calls the module uses.
const TOOLTIP_ENV = `
  __hooks, __post = {}, {}
  hooksecurefunc = function(name, fn) __hooks[name] = fn end
  GameTooltip_SetDefaultAnchor = function() end
  Enum = Enum or {} Enum.TooltipDataType = { Item = 0, Unit = 2 }
  TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) __post[kind] = fn end }
  local tt = CreateFrame("Frame", "GameTooltip", UIParent)
  tt.NineSlice = CreateFrame("Frame", nil, tt)
  tt:CreateFontString("GameTooltipTextLeft1", "ARTWORK")
  tt.__lines = {}
  tt.GetUnit = function(self) return "TEST-ONLY", self.__unit end
  tt.AddLine = function(self, text, r, g, b) self.__lines[#self.__lines + 1] = { text = text, r = r } end
  tt.SetOwner = function(self, owner, anchor) self.__owner, self.__anchor = owner, anchor end
  GameTooltipStatusBar = CreateFrame("StatusBar", "GameTooltipStatusBar", tt)
  __units.targettarget = __units.player
  function __showUnit(unit) tt.__unit, tt.__lines = unit, {} tt:Show() __post[2](tt) end
`;

it("tooltips", () => {
  const addon = loggedIn(UNITS_ENV + TOOLTIP_ENV);
  let t = tooltip(addon);
  expect(t.nine === 0 && addon.eval("return ns.FrameState('vgSkinned')[GameTooltip]") === true, "the default art is hidden under a flat panel").toBeTruthy();
  expect(addon.eval("return GameTooltipStatusBar.__barTexture ~= nil"), "the health bar gets a flat texture").toBeTruthy();
  addon.eval("__showUnit('target')");
  t = tooltip(addon);
  expect(isTok(addon, t.name, "hostile"), "the name line takes the unit's reaction color").toBeTruthy();
  // The tooltip border's color (one of its edge textures).
  const edge = () => addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.__parent == GameTooltip and w.__layer == "BORDER" then return w.__vertexColor end end');
  expect(isTok(addon, edge(), "hostile"), "and so does the border").toBeTruthy();
  addon.eval("GameTooltip:Hide()");
  expect(!isTok(addon, edge(), "hostile"), "which goes back to the theme's when it hides").toBeTruthy();
  expect(t.count === 1 && t.lines[0].text === "Target: <name>" && t.lines[0].r === 0.25, "a Target line in the target's class color").toBeTruthy();
  addon.eval("__showUnit('target')");
  addon.eval("__showUnit(nil)");
  expect(tooltip(addon).count === 0, "tooltips without a unit are left alone").toBeTruthy();
  addon.eval("__showUnit({ __secret = true })");
  expect(tooltip(addon).count === 0, "a hidden unit is left alone").toBeTruthy();
  addon.eval("__hooks.GameTooltip_SetDefaultAnchor(GameTooltip, UIParent)");
  t = tooltip(addon);
  expect(t.anchor === "ANCHOR_NONE" && t.point === true, "the default tooltip goes to the movable corner").toBeTruthy();
  addon.eval('VanguardDB.profiles.Default.Tooltips.anchor = "cursor"; __hooks.GameTooltip_SetDefaultAnchor(GameTooltip, UIParent)');
  expect(tooltip(addon).anchor === "ANCHOR_CURSOR", "or follows the cursor").toBeTruthy();
  addon.eval("VanguardDB.profiles.Default.Tooltips.hideInCombat = true; __wfgStub.inCombat = true; __showUnit('target')");
  expect(tooltip(addon).shown === false, "unit tooltips can hide in combat").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.tooltip") === true, "the tooltip corner is movable").toBeTruthy();
});

// TEST-ONLY items for the sell price: 90001 sells for 25c, 90002 has no value, 90003 isn't cached yet.
const ITEM_TIP_ENV = `
  __prices = { ["item:90001"] = 25, ["item:90002"] = 0 }
  C_Item = { GetItemInfo = function(link) local p = __prices[link] if p then return "TEST-ONLY Item", link, 1, 1, 1, "", "", 20, "", "", p end end }
  local tt = GameTooltip
  tt.GetItem = function(self) return "TEST-ONLY Item", self.__link end
  tt.GetOwner = function(self) return self.__owner end
  tt.AddDoubleLine = function(self, left, right, lr, lg, lb, rr, rg, rb) self.__lines[#self.__lines + 1] = { text = left .. " " .. right, left = { lr, lg, lb }, right = { rr, rg, rb } } end
  function __showItem(link, count, money)
    tt.__link, tt.__owner, tt.shownMoneyFrames, tt.__lines = link, { count = count }, money, {}
    if __post[0] then __post[0](tt) else tt.__scripts.OnTooltipSetItem(tt) end
    return tt.__lines
  end
`;

it("item tooltips show what the stack sells for, unless the client already does", () => {
  const addon = loggedIn(UNITS_ENV + TOOLTIP_ENV + ITEM_TIP_ENV);
  const line = addon.eval('return __showItem("item:90001", 20)[1]');
  expect(line.text === "Sells for 5s 0c" && isTok(addon, line.left, "text2") && isTok(addon, line.right, "gold"), "a stack of 20 at 25c each, the price in gold").toBe(true);
  expect(addon.eval('return __showItem("item:90001", nil)[1].text'), "a single item").toBe("Sells for 0s 25c");
  expect(addon.eval('return { #__showItem("item:90002", 1), #__showItem("item:90003", 1), #__showItem({ __secret = true }, 1), #__showItem("item:90001", 1, 1) }'), "no value, not cached yet, hidden, or the client's own price: no line").toEqual([0, 0, 0, 0]);
  addon.eval("VanguardDB.profiles.Default.Tooltips.sellPrice = false");
  expect(addon.eval('return #__showItem("item:90001", 1)'), "the switch turns it off").toBe(0);
  const old = loggedIn(UNITS_ENV + TOOLTIP_ENV.replace("TooltipDataProcessor =", "__noProcessor =") + "GameTooltip.HasScript = function() return true end" + ITEM_TIP_ENV);
  expect(old.eval('return __showItem("item:90001", 2)[1].text'), "a client without the tooltip data API: the old script").toBe("Sells for 0s 50c");
});

it("item tooltips: other modules' lines come after the tooltip's own, and one that fails doesn't stop the rest", () => {
  expectErrors(/^tooltip lines: eval:\d+: TEST-ONLY broken line$/);
  const addon = loggedIn(UNITS_ENV + TOOLTIP_ENV + ITEM_TIP_ENV);
  addon.eval(`local TT = ns.GetModule("Tooltips")
    TT.AddItemLines(function(tt, link) tt:AddLine("TEST-ONLY first " .. link) end)
    TT.AddItemLines(function() error("TEST-ONLY broken line") end)
    TT.AddItemLines(function(tt) tt:AddLine("TEST-ONLY last") end)`);
  const lines = addon.eval('local out = {} for i, l in ipairs(__showItem("item:90001", 2)) do out[i] = l.text end return out');
  expect(lines, "the sell price, then each added line with the item's link, past the one that failed").toEqual(["Sells for 0s 50c", "TEST-ONLY first item:90001", "TEST-ONLY last"]);
  expect(addon.eval("return ns.errors[#ns.errors].text"), "the failure is caught for /vg errors").toMatch(/TEST-ONLY broken line/);
  expect(addon.eval("return #__showItem({ __secret = true }, 1)"), "a hidden link: no lines at all").toBe(0);
});

it("item tooltips: how many you have, and the item ID when asked", () => {
  const addon = loggedIn(UNITS_ENV + TOOLTIP_ENV + ITEM_TIP_ENV + "C_Item.GetItemCount = function(link, bank) if link == 'item:90002' then return 3, 3 end return bank and 12 or 7 end");
  expect(addon.eval('local l = __showItem("item:90002", 1) return l[1].text'), "all in your bags").toBe("You have 3");
  expect(addon.eval('local l = __showItem("item:90001", 1) return { l[2].text, #l }'), "some in the bank; no ID line by default").toEqual(["You have 12 (5 in the bank)", 2]);
  addon.eval("VanguardDB.profiles.Default.Tooltips.itemID = true VanguardDB.profiles.Default.Tooltips.itemCount = false");
  expect(addon.eval('local l = __showItem("item:90002", 1) return l[#l].text'), "the ID line, when switched on").toBe("Item ID 90002");
  addon.eval("C_Item.GetItemCount = function() return 0, 0 end VanguardDB.profiles.Default.Tooltips.itemCount = true VanguardDB.profiles.Default.Tooltips.itemID = false");
  expect(addon.eval('return #__showItem("item:90002", 1)'), "none of it: no count line").toBe(0);
});

// TEST-ONLY: the client's other tooltips (GameTooltipTemplate / TooltipBackdropTemplate frames with a
// NineSlice), all but QuickKeybindTooltip, which this client lacks.
const MORE_TIPS = ["ItemRefShoppingTooltip1", "ItemRefShoppingTooltip2", "GameNoHeaderTooltip", "GameSmallHeaderTooltip", "BuffFrameTooltip", "SettingsTooltip", "PartyMemberBuffTooltip", "AutoCompleteBox"];
const MORE_TIPS_ENV = MORE_TIPS.map((n) => `local tt = CreateFrame("Frame", "${n}", UIParent) tt.NineSlice = CreateFrame("Frame", nil, tt)`).join("\n");
// Each of those tooltips' state: skinned (its NineSlice faded under a panel) or not.
const moreTips = (addon) => addon.eval(`local out = {} for _, n in ipairs({ "${MORE_TIPS.join('", "')}" }) do
    out[#out + 1] = ns.FrameState('vgSkinned')[_G[n]] == true and _G[n].NineSlice.__alpha == 0 and select("#", _G[n]:GetRegions()) > 0
  end return out`);

it("more tooltips: the client's other tooltips get the panel with the menus group on, one it lacks is skipped", () => {
  const addon = loggedIn(MORE_TIPS_ENV);
  expect(moreTips(addon), "every one the client has").toEqual(MORE_TIPS.map(() => true));
  expect(addon.eval("return { QuickKeybindTooltip == nil, #ns.errors }"), "the missing one is skipped without an error").toEqual([true, 0]);
  const off = loggedIn(MORE_TIPS_ENV + 'local tt = CreateFrame("Frame", "GameTooltip", UIParent) tt.NineSlice = CreateFrame("Frame", nil, tt)',
    { savedVariables: "VanguardDB.profiles = { Default = { Windows = { menus = false } } }" });
  expect(moreTips(off), "with the menus group off they are the game's").toEqual(MORE_TIPS.map(() => false));
  expect(off.eval("return ns.FrameState('vgSkinned')[GameTooltip]"), "the main tooltips still are skinned").toBe(true);
});
