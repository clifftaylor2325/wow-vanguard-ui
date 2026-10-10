// Tests for the TEST-ONLY headless client itself (scripts/lib/wow-stub.lua,
// wow-layout.lua, wow-world.lua, wow-inspect.lua and lua-harness.mjs): Lua
// 5.1 fidelity, layout, the world's events, timers, input and inspectors.
// Each case loads the addon, as every scenario does.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fengari from "fengari";
import { expect, it } from "vitest";
import { expectErrors } from "./lib/error-guard.mjs";
import { createAddon, hasCachedChunk, pushFileChunk, root, tocFiles } from "./lib/lua-harness.mjs";

const { lua, lauxlib, lualib } = fengari;

// A logged-in addon on a finished-setup account.
const loggedIn = () => {
  const addon = createAddon({ savedVariables: "VanguardDB = { version = 1, profiles = {}, setupDone = true }" });
  addon.login();
  return addon;
};

it("numbers print as the game's Lua 5.1 prints them: whole floats without .0", () => {
  const addon = createAddon();
  expect(addon.eval('return { tostring(6 / 2), 7 / 2 .. "", "x" .. 10 / 5, string.format("%d|%s|%.1f", 2.7, 4 / 2, 1.5), string.format("%5.1f%%", 84) }'))
    .toEqual(["3", "3.5", "x2", "2|2|1.5", " 84.0%"]);
  expect(addon.eval("return { math.pow(2, 3), loadstring ~= nil, table.getn({ 1, 2 }), unpack({ 7 }) }")).toEqual([8, true, 2, 7]);
});

it("a Lua error carries a traceback naming the addon file", () => {
  const addon = createAddon();
  expectErrors("TEST-ONLY: eval:2: attempt to index a nil value (local 't')");
  expect(() => addon.eval("ns.Theme.RGB(nil .. 'x')")).toThrow(/eval:2: attempt to concatenate/);
  expect(() => addon.eval("ns.Try('TEST-ONLY', function() local t = nil; return t.x end) return ns.errors[#ns.errors]")).not.toThrow();
  expect(addon.eval("return ns.errors[#ns.errors].text")).toMatch(/TEST-ONLY: eval:2: attempt to index/);
  expect(() => addon.eval("ns.Theme.RGB({})")).toThrow(/Core\/Theme\.lua:\d+:/);
});

it("a worker compiles each addon file once: the second addon loads from the chunk cache, with file names intact", () => {
  createAddon();
  expect(tocFiles().every((file) => hasCachedChunk(path.join(root, file))), "every TOC file is cached after one load").toBe(true);
  const addon = createAddon();
  expect(() => addon.eval("ns.Theme.RGB({})"), "an error in a cached chunk still names its file and line").toThrow(/Core\/Theme\.lua:\d+:/);
  expect(addon.eval('return debug.getinfo(ns.Theme.RGB, "S").source'), "a cached function knows its source").toBe("@Core/Theme.lua");
});

it("an edited file is compiled again, an unchanged one served from the cache", () => {
  const file = path.join(os.tmpdir(), `fui-chunk-${process.pid}.lua`);
  fs.writeFileSync(file, "return 1");
  // Loads the file as "@TEST-ONLY-cache.lua" in a bare state and returns its result.
  const load = () => {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    pushFileChunk(L, file, "@TEST-ONLY-cache.lua");
    expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
    return lua.lua_tonumber(L, -1);
  };
  expect(load()).toBe(1);
  expect(hasCachedChunk(file)).toBe(true);
  expect(load(), "the cached chunk gives the same result").toBe(1);
  fs.writeFileSync(file, "return 22");
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(file, later, later);
  expect(load(), "a new modification time means a new compile").toBe(22);
  fs.writeFileSync(file, "return (");
  fs.utimesSync(file, new Date(later.getTime() + 5000), new Date(later.getTime() + 5000));
  expect(load, "a syntax error names the chunk").toThrow(/TEST-ONLY-cache\.lua/);
  fs.rmSync(file, { force: true });
});

it("a font string takes text only once it has a font, as the client's does", () => {
  const addon = createAddon();
  addon.eval(`__f = CreateFrame("Frame", nil, UIParent) __bare = __f:CreateFontString(nil, "OVERLAY")`);
  expect(() => addon.eval(`__bare:SetText("TEST-ONLY")`), "no font yet: refused").toThrow(/FontString:SetText\(\): Font not set/);
  addon.eval(`__bare:SetFont("Fonts/TEST-ONLY.TTF", 12, "") __bare:SetText("TEST-ONLY")
    __obj = __f:CreateFontString(nil, "OVERLAY") __obj:SetFontObject(GameFontNormal or {}) __obj:SetText("TEST-ONLY")
    __tpl = __f:CreateFontString(nil, "OVERLAY", "GameFontNormal") __tpl:SetText("TEST-ONLY")`);
  expect(addon.eval("return { __bare:GetText(), __obj:GetText(), __tpl:GetText() }"), "a font, a font object or a template: taken").toEqual(["TEST-ONLY", "TEST-ONLY", "TEST-ONLY"]);
});

it("layout: anchors, sizes and scale resolve to screen rects as the client lays them out", () => {
  const addon = createAddon();
  // A frame's edges and size in its own units.
  const rect = (lua) => addon.eval(`local f = ${lua} return { f:GetLeft(), f:GetBottom(), f:GetWidth(), f:GetHeight() }`);
  addon.eval(`
    __a = CreateFrame("Frame", "TESTONLY_A", UIParent) __a:SetSize(200, 100) __a:SetPoint("CENTER")
    __b = CreateFrame("Frame", "TESTONLY_B", __a) __b:SetPoint("TOPLEFT", __a, "TOPLEFT", 10, -10) __b:SetPoint("BOTTOMRIGHT", __a, "BOTTOMRIGHT", -10, 10)
    __c = CreateFrame("Frame", "TESTONLY_C", UIParent) __c:SetSize(50, 20) __c:SetPoint("BOTTOMRIGHT", -5, 5) __c:SetScale(2)
    __t = __a:CreateFontString(nil, "OVERLAY", "GameFontNormal") __t:SetPoint("TOP") __t:SetText("Hello")`);
  expect(rect("__a"), "a centered 200x100 frame on 1920x1080").toEqual([860, 490, 200, 100]);
  expect(rect("__b"), "a frame anchored on both corners gets its size from them").toEqual([870, 500, 180, 80]);
  expect(rect("__c"), "a scaled frame's offsets are in its own units, and so are its edges (screen pixels / scale)").toEqual([(1920 - 10 - 100) / 2, 5, 50, 20]);
  expect(addon.eval("local l, b, w, h = __c:GetScaledRect() return { l, b, w, h }"), "and its scaled rect in pixels").toEqual([1810, 10, 100, 40]);
  expect(addon.eval("return { __t:GetStringWidth() > 0, __t:GetHeight() > 0, select(1, __t:GetCenter()) == 960 }"), "text has a size and sits at its anchor").toEqual([true, true, true]);
  expect(addon.eval("local f = CreateFrame('Frame') return f:GetLeft()"), "an unanchored frame has no edges, as in game").toBe(null);
  expect(addon.frame("TESTONLY_B").rect, "the inspector gives the same rect in pixels").toMatchObject({ left: 870, bottom: 500, width: 180, height: 80, top: 580, right: 1050 });
});

it("the world: a unit change fires the client's events at frames registered for them", () => {
  const addon = loggedIn();
  addon.eval(`__got = {} local f = CreateFrame("Frame") f:RegisterUnitEvent("UNIT_HEALTH", "target") f:RegisterEvent("PLAYER_TARGET_CHANGED")
    f:SetScript("OnEvent", function(_, event, unit) __got[#__got + 1] = event .. ":" .. tostring(unit) end)`);
  addon.world.setUnit("target", { name: "TEST-ONLY Boar", hp: 50, maxhp: 100, reaction: 2 });
  addon.world.setUnit("target", { hp: 25 });
  addon.world.setUnit("player", { hp: 10 });
  expect(addon.eval("return __got"), "a new target, then its health; another unit's health is not delivered to a target-only registration").toEqual(["PLAYER_TARGET_CHANGED:nil", "UNIT_HEALTH:target"]);
  expect(addon.eval('return { UnitName("target"), UnitHealth("target"), UnitExists("targettarget"), UnitIsUnit("player", "player") }')).toEqual(["TEST-ONLY Boar", 25, false, true]);
  addon.world.removeUnit("target");
  expect(addon.eval('return { UnitExists("target"), __got[#__got] }')).toEqual([false, "PLAYER_TARGET_CHANGED:nil"]);
});

it("auras, actions and secrets through the world", () => {
  const addon = loggedIn();
  addon.world.addAura("player", { name: "TEST-ONLY Buff", duration: 30, applications: 3, sourceUnit: "player" });
  addon.world.addAura("player", { name: "TEST-ONLY Curse", duration: 10, isHarmful: true, dispelName: "Curse" });
  // The names of the player's auras through a filter.
  const byFilter = (filter) => addon.eval(`local out = {} for i = 1, 5 do local a = C_UnitAuras.GetAuraDataByIndex("player", i, "${filter}") if a then out[#out + 1] = a.name end end return out`);
  expect(byFilter("HELPFUL|PLAYER")).toEqual(["TEST-ONLY Buff"]);
  expect(byFilter("HARMFUL")).toEqual(["TEST-ONLY Curse"]);
  expect(addon.eval('local name, icon, count = AuraUtil.FindAuraByName("TEST-ONLY Buff", "player", "HELPFUL") return { name, icon, count }')).toEqual(["TEST-ONLY Buff", "TEST-ONLY-ICON-TEST-ONLY Buff", 3]);
  addon.world.removeAura("player", "TEST-ONLY Buff");
  expect(byFilter("HELPFUL")).toEqual({});
  addon.world.setAction(1, { id: 133 });
  expect(addon.eval("return { GetActionInfo(1) }")).toEqual(["spell", 133]);
  expect(addon.eval("return { GetActionTexture(1), (C_Spell.GetSpellName(133)) }")).toEqual(["Interface\\Icons\\Spell_Fire_FlameBolt", "Fireball"]);
  addon.world.set("units.player.hp", addon.world.secret(100));
  expect(addon.eval('return { issecretvalue(UnitHealth("player")), pcall(function() return UnitHealth("player") + 1 end) }').slice(0, 2), "a secret errors on arithmetic, as in instanced combat").toEqual([true, false]);
});

it("timers run on the test clock, and combat queues work", () => {
  const addon = loggedIn();
  addon.eval("__fired = 0 C_Timer.After(2, function() __fired = __fired + 1 end) __ticker = C_Timer.NewTicker(1, function() __fired = __fired + 10 end, 2)");
  addon.advance(1);
  expect(addon.eval("return __fired"), "after one second only the ticker's first tick ran").toBe(10);
  addon.advance(2);
  expect(addon.eval("return __fired"), "by three seconds the timer and both ticks ran").toBe(21);
  addon.world.combat(true);
  addon.eval("ns.OutOfCombat(function() __after = GetTime() end)");
  expect(addon.eval("return { InCombatLockdown(), __after == nil }"), "the function waits for combat to end").toEqual([true, true]);
  addon.world.combat(false);
  expect(addon.eval("return __after ~= nil")).toBe(true);
});

it("input: clicks, hover, the wheel and keys reach the frame's scripts", () => {
  const addon = createAddon();
  addon.eval(`__log = {} local b = CreateFrame("Button", "TESTONLY_Button", UIParent)
    b:SetScript("OnClick", function(_, button) __log[#__log + 1] = "click:" .. button end)
    b:SetScript("OnEnter", function() __log[#__log + 1] = "enter" end)
    b:SetScript("OnLeave", function() __log[#__log + 1] = "leave" end)
    b:SetScript("OnMouseWheel", function(_, d) __log[#__log + 1] = "wheel:" .. d end)
    b:SetScript("OnKeyDown", function(_, k) __log[#__log + 1] = "key:" .. k end)
    local e = CreateFrame("EditBox", "TESTONLY_Edit", UIParent)
    e:SetScript("OnTextChanged", function(self) __log[#__log + 1] = "text:" .. self:GetText() end)
    e:SetScript("OnEnterPressed", function() __log[#__log + 1] = "enter-key" end)`);
  addon.click("TESTONLY_Button", "RightButton");
  addon.hover("TESTONLY_Button");
  expect(addon.eval("return TESTONLY_Button:IsMouseOver()")).toBe(true);
  addon.wheel("TESTONLY_Button", -1);
  addon.key("TESTONLY_Button", "ESCAPE");
  addon.hover(null);
  addon.type("TESTONLY_Edit", "hi");
  addon.enter("TESTONLY_Edit");
  addon.keys({ shift: true });
  expect(addon.eval("return __log")).toEqual(["click:RightButton", "enter", "wheel:-1", "key:ESCAPE", "leave", "text:hi", "enter-key"]);
  expect(addon.eval("return IsShiftKeyDown()")).toBe(true);
});

it("inspectors: a frame's snapshot, text search and the top-level screen", () => {
  const addon = loggedIn();
  addon.world.setUnit("target", { name: "TEST-ONLY Pillager", hp: 640, maxhp: 800, reaction: 2 });
  const target = addon.frame("Vanguard_target");
  expect(target).toMatchObject({ kind: "Button", visible: true, attributes: { unit: "target" } });
  expect(target.rect.width).toBeGreaterThan(0);
  expect(addon.frame("Vanguard_target.health")).toMatchObject({ kind: "StatusBar", value: 640, max: 800 });
  expect(addon.texts("TEST-ONLY Pillager").length, "the name is drawn once").toBe(1);
  expect(addon.find("Pillager").kind).toBe("FontString");
  expect(addon.frame("TESTONLY_Nope")).toBe(null);
  const screen = addon.screen();
  expect(screen.map((f) => f.name)).toContain("Vanguard_player");
  for (const f of screen) {
    expect(f.rect.left >= 0 && f.rect.bottom >= 0 && f.rect.right <= 1920 && f.rect.top <= 1080, `${f.name} stays on screen`).toBe(true);
  }
});

it("the auction house: queries recorded, restricted calls logged with the click that made them, 0-based replicate rows", () => {
  const addon = createAddon();
  addon.eval(`__wfgWorld.items[2589].commodity = true __wfgWorld.bags[0][1] = { itemID = 2589, count = 5 }
    __wfgWorld.ah.replicate = { { itemID = 2589, count = 5, buyoutPrice = 500 }, { itemID = 2589, count = 1, buyoutPrice = 90 } }
    __b = CreateFrame("Button", "TESTONLY_Post", UIParent)
    __b:SetScript("OnClick", function() C_AuctionHouse.PostCommodity(ItemLocation:CreateFromBagAndSlot(0, 1), 1, 5, 99) end)`);
  addon.world.openAuctionHouse();
  expect(addon.eval("return { AuctionHouseFrame:IsShown(), C_AuctionHouse.GetNumReplicateItems() }"), "the window opened").toEqual([true, 2]);
  expect(addon.eval("return { select(3, C_AuctionHouse.GetReplicateItemInfo(1)), select(10, C_AuctionHouse.GetReplicateItemInfo(1)), select(17, C_AuctionHouse.GetReplicateItemInfo(0)) }"), "row 1 is the second listing: count, buyout, itemID").toEqual([1, 90, 2589]);
  expect(addon.world.get("ah.reads"), "each read counted").toBe(3);
  const loc = "ItemLocation:CreateFromBagAndSlot(0, 1)";
  expect(addon.eval(`local l = ${loc} return { l:IsValid(), C_AuctionHouse.GetItemCommodityStatus(l), C_AuctionHouse.GetItemKeyFromItem(l).itemID, C_Item.GetStackCount(l) }`), "a commodity in bag 0 slot 1").toEqual([true, 2, 2589, 5]);
  addon.eval("C_AuctionHouse.SendBrowseQuery({ searchString = 'TEST-ONLY' }) C_AuctionHouse.CancelAuction(7)");
  addon.click("TESTONLY_Post");
  expect(addon.eval("local q = __wfgWorld.ah.queries[1] return { q.fn, q.args[1].searchString }"), "a query is only recorded").toEqual(["SendBrowseQuery", "TEST-ONLY"]);
  const log = addon.eval("local out = {} for i, c in ipairs(__wfgWorld.ah.restricted) do out[i] = { c.fn, c.clicked, c.path:find('rawClick') ~= nil } end return out");
  expect(log, "the cancel came from no click, the post from the button's click (its path runs through the click)").toEqual([["CancelAuction", false, false], ["PostCommodity", true, true]]);
  addon.world.closeAuctionHouse();
  expect(addon.eval("return AuctionHouseFrame:IsShown()")).toBe(false);
});

it("a call from the tests that runs past its instruction budget fails with a traceback, and the addon goes on", () => {
  const addon = createAddon({ instructionBudget: 5e6 });
  expect(() => addon.eval("while true do end")).toThrow(/Lua ran 5000000 instructions in one call from the tests/);
  expect(addon.eval("return ns.Theme ~= nil"), "the state is still usable after the error").toBe(true);
  expect(addon.eval("local n = 0 for i = 1, 100000 do n = n + 1 end return n"), "a long call inside the budget runs").toBe(100000);
});
