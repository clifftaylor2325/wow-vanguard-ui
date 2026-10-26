// Tests for the TEST-ONLY headless client itself (scripts/lib/wow-stub.lua, wow-text.lua, wow-textfit.lua,
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

// Every way of using a secret that the client refuses, as Lua: each must raise.
const SECRET_USES = ["s + 1", "1 - s", "s * 2", "s / 2", "s % 2", "s ^ 2", "-s", "s .. x", "x .. s", "#s", "s < 1", "1 <= s", "s()", "s.x"];

it("a secret raises on arithmetic, concatenation, length, ordering, a call and a field read or write; issecretvalue and rawget still see it", () => {
  const addon = loggedIn();
  addon.world.set("units.player.hp", addon.world.secret(100));
  const tried = addon.eval(`local s, x = UnitHealth("player"), "x" local out = {}
    ${SECRET_USES.map((use) => `out[#out + 1] = select(2, pcall(function() return ${use} end))`).join("\n")}
    out[#out + 1] = select(2, pcall(function() s.y = 1 end))
    return out`);
  expect(tried).toHaveLength(SECRET_USES.length + 1);
  for (const [i, message] of tried.entries()) expect(message, SECRET_USES[i] ?? "s.y = 1").toContain("attempt to use a secret value");
  expect(addon.eval('local s = UnitHealth("player") return { issecretvalue(s), rawget(s, "n"), s == s, s == 100, type(s), pcall(function() return s + 1 end) }').slice(0, 6))
    .toEqual([true, 100, true, false, "table", false]);
});

it("an aura change refreshes every aura container showing that unit, including one made after the last change", () => {
  const addon = createAddon();
  addon.eval(`__refreshed = {}
    function __container(key, unit)
      local c = CreateFrame("AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
      local update = c.UpdateAllAuras
      c.UpdateAllAuras = function(self) __refreshed[#__refreshed + 1] = key return update(self) end
      c:SetUnit(unit)
    end
    __container("early", "player") __container("target", "target")`);
  addon.world.addAura("player", { name: "TEST-ONLY Buff", duration: 30 });
  addon.eval('__container("late", "player") __refreshed = {}');
  addon.world.addAura("player", { name: "TEST-ONLY Shield", duration: 30 });
  expect(addon.eval("return __refreshed"), "both player containers, in creation order; not the target's").toEqual(["early", "late"]);
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

it("showing or hiding a frame runs OnShow and OnHide on its shown children, as the client does", () => {
  const addon = createAddon();
  const log = addon.eval(`local log = {}
    local p = CreateFrame("Frame", nil, UIParent) p:Hide()
    local shown, hidden = CreateFrame("Frame", nil, p), CreateFrame("Frame", nil, p)
    hidden:Hide()
    for name, f in pairs({ shown = shown, hidden = hidden }) do
      for _, s in ipairs({ "OnShow", "OnHide" }) do f:SetScript(s, function() log[#log + 1] = name .. " " .. s end) end
    end
    p:Show() p:Hide()
    return log`);
  expect(log, "the shown child follows its parent; the hidden one doesn't").toEqual(["shown OnShow", "shown OnHide"]);
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

// Taint rules (scripts/lib/wow-taint.lua) ------------------------------------------------------

// Runs Lua as if it were a line of one of the addon's files (Modules/TEST-ONLY.lua), and returns its result.
const asAddon = (addon, lua) => addon.eval(`return assert(load(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))()`);

it("taint: frames belong to whoever made them; the addon's files make the addon's", () => {
  const addon = createAddon();
  addon.eval(`__mine = assert(load("local f = CreateFrame('Frame', nil, UIParent) return f", "@Modules/TEST-ONLY.lua"))()
    __mineTex = assert(load("local t = ChatFrame1:CreateTexture() return t", "@Modules/TEST-ONLY.lua"))()
    __game = CreateFrame("StatusBar", nil, UIParent) __game:SetStatusBarTexture("TEST-ONLY") __gameTex = __game:CreateTexture()
    __viaPcall = assert(load("local ok, f = pcall(CreateFrame, 'Frame') return f", "@Core/TEST-ONLY.lua"))()`);
  expect(addon.eval("return { UIParent.__byGame, ChatFrame1.__byGame, __game.__byGame, __game:GetStatusBarTexture().__byGame, __gameTex.__byGame }"),
    "the client's frames, test code's stand-ins, and regions the stub makes for them are the game's").toEqual([true, true, true, true, true]);
  expect(addon.eval("return { __mine.__byGame == nil, __mineTex.__byGame == nil, __viaPcall.__byGame == nil }"),
    "a frame or region the addon's files make (through pcall too) is the addon's").toEqual([true, true, true]);
  addon.eval("AuctionHouseFrame = nil __wfgWorld.openAuctionHouse()");
  expect(addon.eval("return AuctionHouseFrame.__byGame"), "a window the world makes later is the game's").toBe(true);
});

it("taint: addon code storing a field on a game frame fails the test; game, test and own-frame writes don't", () => {
  const addon = createAddon();
  expectErrors("field write: Modules/TEST-ONLY.lua:1 stored the field vgTest on the game's frame ChatFrame1");
  asAddon(addon, "ChatFrame1.vgTest = true ChatFrame1.vgTest = false");
  asAddon(addon, "local f = CreateFrame('Frame') f.vgMine = true");
  addon.eval("ChatFrame1.testOnly = 1 hooksecurefunc(ChatFrame1, 'Show', function() end)");
  expect(addon.eval("return { ChatFrame1.vgTest, #__wfgStub.violations, __wfgStub.violations[1].count }"), "the write still happens, and is one entry").toEqual([false, 1, 1]);
  const unnamed = createAddon();
  unnamed.eval("__plain = CreateFrame('Frame')");
  expectErrors(/^field write: Modules\/TEST-ONLY\.lua:1 stored the field vgTest on the game's frame Frame #\d+$/);
  asAddon(unnamed, "__plain.vgTest = true");
});

// A TEST-ONLY secure button (the game's), the addon's holder around it, and a listener for blocked actions.
const SECURE_ENV = `
  __secure = CreateFrame("Button", "TESTONLY_Secure", UIParent, "SecureActionButtonTemplate")
  __holder = assert(load("local f = CreateFrame('Frame', 'TESTONLY_Holder', UIParent) return f", "@Modules/TEST-ONLY.lua"))()
  __inner = CreateFrame("Button", nil, __holder, "SecureUnitButtonTemplate")
  __blocked = {}
  __listen = CreateFrame("Frame") __listen:RegisterEvent("ADDON_ACTION_BLOCKED")
  __listen:SetScript("OnEvent", function(_, _, who, what) __blocked[#__blocked + 1] = who .. " " .. what end)
`;

it("taint: in combat, addon code's protected calls on protected frames are blocked, as the client blocks them", () => {
  const addon = createAddon();
  addon.eval(SECURE_ENV);
  expect(addon.eval("return { __secure:IsProtected() }"), "a secure template's frame is protected itself").toEqual([true, true]);
  expect(addon.eval("return { __holder:IsProtected() }"), "a frame holding one is protected through it").toEqual([true, false]);
  expect(addon.eval("return { PlayerFrame:IsProtected(), select(2, ChatFrame1:IsProtected()) }"), "the game's unit frames are; its chat is not").toEqual([true, false]);
  asAddon(addon, "__secure:Hide()");
  expect(addon.eval("return __secure:IsShown()"), "out of combat the call goes through").toBe(false);
  addon.world.combat(true);
  expectErrors("blocked in combat: Modules/TEST-ONLY.lua:1 called Show on the protected frame TESTONLY_Secure",
    "blocked in combat: Modules/TEST-ONLY.lua:1 called SetPoint on the protected frame TESTONLY_Holder");
  asAddon(addon, "__secure:Show() pcall(__secure.Show, __secure) __holder:SetPoint('CENTER') __secure:SetAlpha(0.5) ChatFrame1:Hide()");
  expect(addon.eval("return { __secure:IsShown(), next(__holder.__points) == nil, __secure:GetAlpha(), ChatFrame1:IsShown() }"),
    "blocked calls do nothing; unprotected ones and unprotected frames are untouched").toEqual([false, true, 0.5, false]);
  expect(addon.eval("return __blocked"), "the client says so with ADDON_ACTION_BLOCKED").toEqual(["Vanguard Show()", "Vanguard Show()", "Vanguard SetPoint()"]);
  addon.eval("__secure:Show() __holder:SetPoint('CENTER')");
  expect(addon.eval("return { __secure:IsShown(), next(__holder.__points) ~= nil }"), "the game's own (secure) code is never blocked").toEqual([true, true]);
});

it("taint: a hook in front of a protected method doesn't hide the addon code that called it", () => {
  const addon = createAddon();
  addon.eval(SECURE_ENV + "hooksecurefunc(__secure, 'Hide', function() end)");
  addon.world.combat(true);
  expectErrors("blocked in combat: Core/TEST-ONLY.lua:1 called Hide on the protected frame TESTONLY_Secure");
  addon.eval(`assert(load("__secure:Hide()", "@Core/TEST-ONLY.lua"))()`);
  expect(addon.eval("return __secure:IsShown()"), "still shown").toBe(true);
});

it("taint: in combat, ShowUIPanel and HideUIPanel refuse a run with addon code in it, as the client's panel manager does", () => {
  const addon = createAddon();
  addon.eval(`__panel = CreateFrame("Frame", "TESTONLY_Panel", UIParent) __panel:Hide()
    __opener = assert(load("ShowUIPanel(__panel)", "@Interface/TEST-ONLY.lua"))`);
  asAddon(addon, "__opener()");
  expect(addon.eval("return __panel:IsShown()"), "out of combat the addon may open a panel").toBe(true);
  addon.world.combat(true);
  expectErrors("blocked in combat: Modules/TEST-ONLY.lua:1 reached HideUIPanel(TESTONLY_Panel), which refuses addon code in a fight",
    "blocked in combat: Modules/TEST-ONLY.lua:1 reached ShowUIPanel(TESTONLY_Panel), which refuses addon code in a fight");
  asAddon(addon, "HideUIPanel(__panel)");
  expect(addon.eval("return __panel:IsShown()"), "a refused call does nothing").toBe(true);
  addon.eval("__panel:Hide()");
  asAddon(addon, "__opener()");
  expect(addon.eval("return __panel:IsShown()"), "game code the addon called is refused too").toBe(false);
  addon.eval("__opener()");
  expect(addon.eval("return __panel:IsShown()"), "the game's own run is never refused").toBe(true);
});

it("taint: addon code that hands an aura call a secret gets the client's error, through pcall too; plain ids, game and test code don't", () => {
  const addon = createAddon();
  addon.world.addAura("player", { name: "TEST-ONLY Buff", duration: 10, auraInstanceID: 7 });
  addon.eval("__id = __wfgWorld.secret(7)");
  expect(asAddon(addon, "return { pcall(C_UnitAuras.GetAuraDuration, 'player', __id) }"), "refused, with the client's words")
    .toEqual([false, "bad argument #2 to '?' (Usage: C_UnitAuras.GetAuraDuration(). Secret values are only allowed during untainted execution for this argument.)"]);
  expect(asAddon(addon, "return C_UnitAuras.GetAuraDataByAuraInstanceID('player', 7).name"), "a plain id is answered").toBe("TEST-ONLY Buff");
  expect(addon.eval("return { C_UnitAuras.GetAuraDataByAuraInstanceID('player', __id) == nil, C_Secrets.ShouldUnitAuraInstanceBeSecret('player', 7) }"),
    "the game's (and the tests') own code may pass it; the aura's times are plain").toEqual([true, false]);
  addon.world.addAura("player", { name: "TEST-ONLY Hidden", duration: addon.world.secret(10), expirationTime: addon.world.secret(20), auraInstanceID: 8 });
  addon.eval("__wfgWorld.aurasSecret = true");
  expect(addon.eval("return { C_Secrets.ShouldUnitAuraInstanceBeSecret('player', 8), C_Secrets.ShouldUnitAuraInstanceBeSecret('player', 7) }"),
    "secret times, or every aura while auras are hidden").toEqual([true, true]);
  expect(asAddon(addon, "return { pcall(C_UnitAuras.GetAuraDataByAuraInstanceID, 'player', 8) }"), "a hidden aura's data, asked for by a plain id: refused")
    .toEqual([false, "GetAuraDataByAuraInstanceID(): Auras cannot be accessed when secret while tainted by 'Vanguard'"]);
  expect(addon.eval("return C_UnitAuras.GetAuraDataByAuraInstanceID('player', 8).name"), "the game's own code still reads it").toBe("TEST-ONLY Hidden");
  addon.eval("C_Secrets = {}");
  expect(asAddon(addon, "return C_UnitAuras.GetAuraDataByAuraInstanceID('player', 8).name"), "a client that can't say lets it through").toBe("TEST-ONLY Hidden");
});

it("taint: secret geometry, derived: a secret fill, secret text and what anchors to them read as secrets", () => {
  const addon = createAddon();
  addon.eval(`__bar = CreateFrame("StatusBar", nil, UIParent) __bar:SetSize(100, 10) __bar:SetPoint("CENTER")
    __bar:SetStatusBarTexture("TEST-ONLY") __bar:SetMinMaxValues(0, 100) __bar:SetValue(__wfgWorld.secret(40))
    __spark = __bar:CreateTexture() __spark:SetSize(2, 10) __spark:SetPoint("CENTER", __bar:GetStatusBarTexture(), "RIGHT")
    __text = __bar:CreateFontString() __text:SetFont("TEST-ONLY", 10) __text:SetText(__wfgWorld.secret("TEST-ONLY"))
    __scroll = CreateFrame("ScrollFrame", nil, ChatFrame1) __scroll:SetSize(10, 10) __scroll:SetPoint("CENTER")
    __child = CreateFrame("Frame", nil, __scroll) __child:SetSize(10, 50) __scroll:SetScrollChild(__child)`);
  // Which getters answer with secrets now.
  const secrets = () => addon.eval(`local s = issecretvalue return { s(__bar:GetStatusBarTexture():GetWidth()), s(__spark:GetLeft()), s(__text:GetStringWidth()), s(__bar:GetWidth()), s(UIParent:GetWidth()), s(ChatFrame1:GetWidth()) }`);
  expect(secrets(), "off: nothing is secret").toEqual([false, false, false, false, false, false]);
  addon.world.secretGeometry("derived");
  expect(secrets(), "derived: the fill, the spark on it and the secret text; not the bar, the screen or the game's chat").toEqual([true, true, true, false, false, false]);
  expect(() => addon.eval("return __spark:GetLeft() + 1"), "arithmetic on one fails, as in game").toThrow(/attempt to use a secret value/);
  addon.world.secretGeometry("strict");
  expect(secrets(), "strict: every frame of the game's too (test code made this bar, so it is one), never the screen").toEqual([true, true, true, true, false, true]);
  expect(addon.eval("local x, y = __bar:GetCenter() return { issecretvalue(x), issecretvalue(y), __scroll:GetVerticalScrollRange() }"),
    "every value a getter returns is hidden; the scroll range is worked out from true heights").toEqual([true, true, 40]);
  expect(addon.eval("return { CreateFrame('Frame'):GetLeft() == nil, __wfgStub.secretGeometryOf(__child) }"), "a frame with no rect still has no position").toEqual([true, true]);
  expect(() => addon.world.secretGeometry("TEST-ONLY"), "an unknown mode is refused").toThrow(/derived, strict or off/);
  addon.world.secretGeometry(null);
  expect(secrets(), "and off again").toEqual([false, false, false, false, false, false]);
});

// Lua that makes a 100 x 26 button on UIParent (`b`) with a font string (`fs`) in the theme font at `size`.
const FIT_BOX = (size) => `
  local b = CreateFrame("Button", nil, UIParent) b:SetSize(100, 26) b:SetPoint("CENTER")
  local fs = b:CreateFontString(nil, "OVERLAY") fs:SetFont(ns.Theme.FONTS.regular, ${size}) fs:SetPoint("CENTER")
`;

it("text metrics: rough by default; with textFit, the theme font's own widths, by size, wrapped at the string's width", () => {
  const rough = createAddon();
  expect(rough.eval(`${FIT_BOX(12)} fs:SetText("Hello") fs:SetWidth(200) return { fs:GetStringWidth(), fs:GetUnboundedStringWidth(), fs:GetStringHeight() }`), "rough: 6 a character, 14 a line, as before").toEqual([200, 30, 14]);
  const addon = createAddon({ textFit: true });
  const widths = addon.eval(`${FIT_BOX(12)} fs:SetText("Hello world") local at12 = fs:GetStringWidth()
    fs:SetFont(ns.Theme.FONTS.regular, 24) local at24 = fs:GetStringWidth() fs:SetTextScale(0.5) return { at12, at24, fs:GetStringWidth(), fs:GetTextScale() }`);
  expect(widths[0], "Fira Sans Condensed is narrower than 6 a character at 12").toBeLessThan(11 * 6);
  expect([widths[1] / widths[0], widths[2]], "width scales with the size and the text scale").toEqual([2, widths[0]]);
  const wrapped = addon.eval(`${FIT_BOX(12)} fs:SetText("one two three four five six seven eight") fs:SetWidth(60) fs:SetSpacing(2)
    local lines, all = __wfgStub.textLineCount(fs, 60) local h = fs:GetStringHeight() fs:SetMaxLines(2) return { lines, h, (__wfgStub.textLineCount(fs, 60)), fs:GetMaxLines(), fs:GetLineHeight() }`);
  expect(wrapped, "wrapped word by word at the width, 12 a line plus the spacing; max lines caps what draws").toEqual([4, 4 * 12 + 3 * 2, 2, 2, 12]);
  expect(addon.eval(`${FIT_BOX(12)} fs:SetText("|cffff0000Red|r |TInterface\\\\Icons\\\\X:0|t") local a = fs:GetStringWidth() fs:SetText("Red ") return { a > fs:GetStringWidth(), __wfgStub.drawnText("a||b|nc") }`), "colour codes draw nothing, an icon a square, || one bar, |n a new line")
    .toEqual([true, "a|b\nc"]);
});

it("text fit: a pseudo-locale makes every string a third longer, padded with its own letters, and finds its English", () => {
  const addon = createAddon({ textFit: true });
  expect(addon.eval('return { ns.L["Save"], ns.L["Open the map"], ns.L["%d"], ns.English(ns.L["Save"]) }')).toEqual(["SaveSa", "Open the mapOpent", "%ddd", "Save"]);
  expect(addon.eval('return __wfgPseudoKeys[ns.L["Save"]]'), "the audit names it by its English").toBe("Save");
});

it("text fit: the audit finds text cut short, text running out of its frame and text over a control, and passes text that fits", () => {
  const addon = createAddon({ textFit: true });
  addon.eval(FIT_BOX(12).replace("local b", "__b").replace(/\bb([:.])/g, "__b$1").replace("local fs", "__fs").replace(/\bfs([:.])/g, "__fs$1"));
  // The audit of the button after some Lua, as "kind:other" lines.
  const audit = (lua) => Object.values(addon.eval(`${lua} local out = {} for _, f in ipairs(__wfgTextFit(__b)) do out[#out + 1] = f.kind .. ":" .. tostring(f.other) end return out`));
  expect(audit('__fs:SetText("Fits")'), "short text in its button").toEqual([]);
  expect(audit('__fs:SetText("A caption much wider than its button")'), "a centred label wider than its button spills both ways").toEqual(["spill:nil"]);
  expect(audit('__fs:SetPoint("LEFT", 4, 0) __fs:SetPoint("RIGHT", -4, 0) __fs:SetWordWrap(false)'), "pinned across it with no wrap, the client cuts it").toEqual(["cut:wider than its box"]);
  expect(audit('__fs:SetWordWrap(true) __fs:SetMaxLines(2)'), "two lines are not enough either").toEqual(["cut:more lines than it may draw"]);
  expect(audit('__fs:SetMaxLines(0) __fs:SetHeight(20)'), "wrapped into a fixed height").toEqual(["cut:taller than its box"]);
  const over = audit(`__fs:SetHeight(nil) __fs.__height = nil __fs:ClearAllPoints() __fs:SetPoint("LEFT", 4, 0) __fs:SetText("Label")
    local s = CreateFrame("Button", nil, __b) s:SetSize(30, 20) s:SetPoint("LEFT", 10, 0) local t = s:CreateTexture() t:SetColorTexture(1, 1, 1)
    local o = __b:CreateFontString(nil, "OVERLAY") o:SetFont(ns.Theme.FONTS.regular, 12) o:SetPoint("LEFT", 8, 0) o:SetText("Over")`);
  expect(over, "text drawn over another text, and both over a control that isn't theirs").toEqual(["overlap:Over", "overlap:Button", "overlap:Button"]);
  expect(audit('__b:SetAlpha(0)'), "a faded-out frame's text draws nothing").toEqual([]);
});

it("text fit: a caption beside its frame, an invisible click area and clipped text are not findings", () => {
  const addon = createAddon({ textFit: true });
  const findings = addon.eval(`${FIT_BOX(12)} fs:ClearAllPoints() fs:SetPoint("LEFT", b, "RIGHT", 4, 0) fs:SetText("A caption beside the box")
    local area = CreateFrame("Button", nil, b) area:SetAllPoints()
    local clip = CreateFrame("Frame", nil, b) clip:SetSize(10, 10) clip:SetPoint("TOPLEFT") clip:SetClipsChildren(true)
    local hidden = clip:CreateFontString(nil, "OVERLAY") hidden:SetFont(ns.Theme.FONTS.regular, 12) hidden:SetPoint("TOPLEFT", clip, "BOTTOMRIGHT", 50, -50) hidden:SetText("Out of view")
    return __wfgTextFit(b)`);
  expect(findings).toEqual({});
  expect(addon.eval(`${FIT_BOX(12)} fs:SetText("Wider than the box it sits in") return __wfgTextFit(b)[1].place`), "an unnamed frame's place is the top level").toBe("top level");
});
