// auras: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { CLICK_LUA, NO_RAID, RAID_ENV, SETUP_DONE, UNITS_ENV, button, isTok, key, loggedIn, setCombat, tooltip } from "./helpers.mjs";

// TEST-ONLY auras by unit and filter. raid1: a Magic debuff and two of your HoTs.
const AURA_ENV = `
  __auras = {
    raid1 = {
      ["HARMFUL|RAID"] = { { icon = "TEST-ONLY-CURSE", dispelName = "Magic", auraInstanceID = 21 } },
      ["HARMFUL|!RAID"] = { { icon = "TEST-ONLY-BOSS", auraInstanceID = 22 } },
      HARMFUL = { { icon = "TEST-ONLY-CURSE", dispelName = "Magic", auraInstanceID = 21 }, { icon = "TEST-ONLY-BOSS", auraInstanceID = 22 } },
      ["HELPFUL|PLAYER|RAID_IN_COMBAT"] = { { icon = "TEST-ONLY-HOT-A", expirationTime = 1030, duration = 12, applications = 2 },
        { icon = "TEST-ONLY-HOT-B", expirationTime = { __secret = true }, duration = { __secret = true } } },
    },
  }
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) return ((__auras[unit] or {})[filter] or {})[i] end }
`;

// Raid button 1's aura rows as the client's containers hold them.
const indicators = (addon) => addon.eval(`local b = ForeverUI_RaidUnitButton1
  local d, h = b.debuffRow.frame, b.hotRow.frame
  local first = d.__groups[1].buttons[1]
  local out = { dispel = { filter = d.__groups[1].filter, max = d.__groups[1].opts.maxFrameCount, shown = first.__shown, icon = first.__icon.__texture,
      regs = #first.__dispel, wash = first.__dispel[5].texture.__vertexColor, washShown = first.__dispel[5].texture.__shown, edge = first.__dispel[6].texture.__vertexColor },
    others = { filter = d.__groups[2].filter, max = d.__groups[2].opts.maxFrameCount, icon = d.__groups[2].buttons[1].__shown and d.__groups[2].buttons[1].__icon.__texture },
    hots = { filter = h.__groups[1].filter, max = h.__groups[1].opts.maxFrameCount, icon = h.__groups[1].buttons[1].__icon.__texture,
      count = h.__groups[1].buttons[1].__count:GetText(), pandemic = #h.__groups[1].buttons[1].__pandemic, timer = h.__groups[1].buttons[1].__durationText },
    mouse = first.__mouse, unit = d.__unit, rowsShown = d.__shown and h.__shown,
    dPoint = { d.__points.BOTTOMLEFT.x, d.__points.BOTTOMLEFT.y }, hPoint = { h.__points.BOTTOMRIGHT.x, h.__points.BOTTOMRIGHT.y } }
  return out`);

it("raid indicators", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + AURA_ENV + ENGINE_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(3, "raid3")');
  const i = indicators(addon);
  expect(i.dispel.filter === "HARMFUL|RAID" && i.dispel.max === 1 && i.dispel.icon === "TEST-ONLY-CURSE", "the first debuff shown is one you can dispel").toBeTruthy();
  expect(i.others.filter === "HARMFUL|!RAID" && i.others.max === 2 && i.others.icon === "TEST-ONLY-BOSS", "then up to two others (a boss debuff shows too)").toBeTruthy();
  expect(i.dispel.regs === 9 && i.dispel.washShown && isTok(addon, i.dispel.wash, "magic") && i.dispel.wash[3] === 0.35 && isTok(addon, i.dispel.edge, "magic"),
    "the client washes the tile and colors its edge by the debuff's type").toBeTruthy();
  expect(i.hots.filter === "HELPFUL|PLAYER|RAID_IN_COMBAT" && i.hots.max === 3 && i.hots.icon === "TEST-ONLY-HOT-A" && i.hots.count === "2", "your HoTs, with stacks").toBeTruthy();
  expect(i.hots.pandemic === 1 && i.hots.timer == null, "HoTs light in their refresh window; no timer numbers on raid icons").toBeTruthy();
  expect(i.mouse === false && i.unit === "raid1" && i.rowsShown, "icons let clicks through to the tile, and follow its unit").toBeTruthy();
  expect(i.dPoint[0] === 2 && i.dPoint[1] === -43 && i.hPoint[0] === 98 && i.hPoint[1] === -43, "debuffs sit bottom left and HoTs bottom right, above the power bar").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton3.debuffRow.frame.__shown") === false, "the offline show no auras").toBeTruthy();
  addon.eval('ForeverUI_RaidUnitButton1:SetAttribute("unit", "raid2")');
  expect(addon.eval("return ForeverUI_RaidUnitButton1.debuffRow.frame.__unit") === "raid2", "a roster change points the rows at the new unit").toBeTruthy();
  const b1 = "ForeverUI_RaidUnitButton1";
  addon.eval(`${b1}:GetScript("OnEnter")(${b1})`);
  const hover = addon.eval(`return ${b1}.hover:IsShown()`);
  addon.eval(`${b1}:GetScript("OnLeave")(${b1})`);
  expect(hover === true && addon.eval(`return ${b1}.hover:IsShown()`) === false, "a faint wash while the mouse is over a tile").toBeTruthy();
  // Tile 1's own edge color.
  const edgeOf = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == ${b1} and w.__layer == "BORDER" then return w.__vertexColor end end`);
  addon.eval("UnitIsUnit = function(a, b) return a == 'raid2' and b == 'target' end");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(isTok(addon, edgeOf(), "accent"), "your target's tile gets an accent edge").toBeTruthy();
  addon.eval("UnitIsUnit = function() return false end");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(!isTok(addon, edgeOf(), "accent"), "and loses it when you target someone else").toBeTruthy();
  expect(isTok(addon, addon.eval("return ForeverUI_RaidUnitButton3.health.__barColor"), "darkBar"), "the offline get a dark bar").toBeTruthy();
});

it("a client that won't drive the dispel highlight never shows it uncolored", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + AURA_ENV + "Enum.CustomAuraButtonDispelTypeTextureStyle = nil");
  addon.eval('__spawn(1, "raid1")');
  const out = addon.eval(`local first = ForeverUI_RaidUnitButton1.debuffRow.frame.__groups[1].buttons[1]
    local shown = 0 for _, w in ipairs(__wfgStub.frames) do if w.__parent == first and w.__kind == "Texture" and w.__texture and w.__texture:find("Fade") and w.__shown then shown = shown + 1 end end
    return { regs = #first.__dispel, icon = first.__shown, washes = shown }`);
  expect(out.icon === true && out.regs === 0 && out.washes === 0, "the debuff icon still shows; the unregistered wash stays hidden").toBeTruthy();
});

it("raid indicators on the fallback", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + AURA_ENV + "__wfgStub.noAuraContainer = true");
  addon.eval('__spawn(1, "raid1")');
  // Button 1's fallback highlight and icons.
  const state = () => addon.eval(`local b = ForeverUI_RaidUnitButton1 local g = b.debuffRow.groups
    return { shown = b.dispel:IsShown(), wash = b.dispel.wash.__vertexColor, edge = b.dispel.edges[1].__vertexColor,
      first = g[1].icons[1].icon.__texture, other = g[2].icons[1]:IsShown() and g[2].icons[1].icon.__texture, dup = g[2].icons[2]:IsShown(),
      hot = b.hotRow.groups[1].icons[1].icon.__texture, hotCd = b.hotRow.groups[1].icons[1].cooldown.__cooldown, hidden = b.hotRow.groups[1].icons[2].cooldown.__cooldown }`);
  let s1 = state();
  expect(s1.shown && isTok(addon, s1.wash, "magic") && s1.wash[3] === 0.35 && isTok(addon, s1.edge, "magic"), "a debuff you can dispel washes the tile in its type's color").toBeTruthy();
  expect(s1.first === "TEST-ONLY-CURSE" && s1.other === "TEST-ONLY-BOSS" && s1.dup === false, "the dispellable one first, the others after, none twice").toBeTruthy();
  expect(s1.hot === "TEST-ONLY-HOT-A" && s1.hotCd[0] === 1018 && s1.hidden == null, "HoTs with a sweep from plain times, none from hidden ones").toBeTruthy();
  addon.eval('__auras.raid1["HARMFUL|RAID"][1].dispelName = { __secret = true }');
  addon.fire("UNIT_AURA", "raid1");
  expect(isTok(addon, state().edge, "bad"), "a hidden type the client can't color for us shows as a plain warning").toBeTruthy();
  addon.eval('__auras.raid1["HARMFUL|RAID"] = {}');
  addon.fire("UNIT_AURA", "raid1");
  expect(state().shown === false, "the highlight goes when the debuff does").toBeTruthy();
});

it("raid tile zones never overlap", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  const clashes = addon.eval(`local RF, out = ns.GetModule("RaidFrames"), {}
    local names = { "name", "status", "missing", "debuffs", "hots", "power" }
    local function hit(a, b) return a[1] < b[1] + b[3] and b[1] < a[1] + a[3] and a[2] < b[2] + b[4] and b[2] < a[2] + a[4] end
    local function inside(r, w, h) return r[1] >= 0 and r[2] >= 0 and r[1] + r[3] <= w and r[2] + r[4] <= h end
    for _, scale in ipairs({ 1, 1.2 }) do
      ns.Theme.Settings().textScale = scale
      for _, size in ipairs({ { 72, 36 }, { 90, 40 }, { 100, 48 }, { 125, 60 } }) do
        local z = RF.Zones(size[1], size[2])
        for i, a in ipairs(names) do
          if not inside(z[a], size[1], size[2]) then out[#out + 1] = a .. " leaves the tile at " .. size[1] .. "x" .. size[2] end
          for j = i + 1, #names do
            if hit(z[a], z[names[j]]) then out[#out + 1] = a .. "/" .. names[j] .. " at " .. size[1] .. "x" .. size[2] .. " scale " .. scale end
          end
        end
      end
    end
    ns.Theme.Settings().textScale = 1
    return table.concat(out, "; ")`);
  expect(clashes, "name, status, missing-buff mark, debuffs, HoTs and power bar each keep their own space").toBe("");
  const z = addon.eval('local z = ns.GetModule("RaidFrames").Zones(100, 48) return { icon = z.icon, per = z.per, status = z.status[5] }');
  expect(z.icon === 14 && z.per === 3 && z.status === "CENTER", "at the default 100x48: 14 px icons, three a side, status under the name").toBeTruthy();
  expect(addon.eval('return ns.GetModule("RaidFrames").Zones(72, 36).status[5]') === "RIGHT", "a short tile puts the status at the name row's right").toBeTruthy();
});

// TEST-ONLY auras on the target and focus: a sheep, your dot, someone else's debuff, two buffs.
const FRAME_AURAS = `
  __units.focus = { name = "TEST-ONLY Focus", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }
  __frameAuras = { ["HARMFUL|CROWD_CONTROL"] = { { icon = "SHEEP" } }, ["HARMFUL|PLAYER|!CROWD_CONTROL"] = { { icon = "MY-DOT", applications = 3 } },
    ["HARMFUL|!PLAYER|!CROWD_CONTROL"] = { { icon = "ANY-DEBUFF" } }, HELPFUL = { { icon = "BUFF-A" }, { icon = "BUFF-B" } } }
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) return (__frameAuras[filter] or {})[i] end }
`;

// A frame's aura rows, as the client's containers hold them.
const frameRows = (addon, key) => addon.eval(`local f = ForeverUI_${key}
  local function row(c) if not c then return nil end local p = c.frame.__points[c.frame.__flowAnchor] local out = { point = { point = p.point, relPoint = p.relPoint }, groups = {} }
    for g, grp in ipairs(c.frame.__groups) do local b = grp.buttons[1]
      out.groups[g] = { filter = grp.filter, max = grp.opts.maxFrameCount, icon = b and b.__shown and b.__icon.__texture or false,
        count = b and b.__count:GetText(), dim = b and b.__icon.__desaturated, timer = b and b.__durationText ~= nil } end
    return out end
  return { debuffs = row(f.debuffs), buffs = row(f.buffs) }`);

it("target and focus auras", () => {
  const addon = loggedIn(UNITS_ENV + FRAME_AURAS, NO_RAID);
  addon.fire("PLAYER_TARGET_CHANGED");
  const t = frameRows(addon, "target");
  expect(t.debuffs.point.point === "TOPLEFT" && t.debuffs.point.relPoint === "BOTTOMLEFT", "debuffs sit under the target frame").toBeTruthy();
  expect(t.buffs.point.point === "BOTTOMLEFT" && t.buffs.point.relPoint === "TOPLEFT", "buffs sit above it, so neither row floats").toBeTruthy();
  expect(t.debuffs.groups[0].icon === "SHEEP" && t.debuffs.groups[1].icon === "MY-DOT" && t.debuffs.groups[1].count === "3", "crowd control first, then your debuffs, with stacks").toBeTruthy();
  expect(t.debuffs.groups[2].max === 0, "only your debuffs by default").toBeTruthy();
  expect(t.buffs.groups[0].icon === "BUFF-A" && t.debuffs.groups[1].timer === false, "buffs above; no timer numbers by default (the sweep shows time left)").toBeTruthy();
  const f = frameRows(addon, "focus");
  expect(f.buffs == null && f.debuffs.groups[1].icon === "MY-DOT", "the focus shows your debuffs only").toBeTruthy();
  expect(addon.eval("return ForeverUI_target.debuffs.frame.__flowLine") === 220, "the row wraps at the frame's width").toBeTruthy();
  addon.eval('__frameAuras.HELPFUL = {}');
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(frameRows(addon, "target").buffs.groups[0].icon === false, "a new target reads its auras again").toBeTruthy();
  const all = loggedIn(UNITS_ENV + FRAME_AURAS, { savedVariables: "ForeverUIDB = { profiles = { Default = { modules = { RaidFrames = false }, FrameAuras = { onlyMine = false, timers = true } } } }" });
  all.fire("PLAYER_FOCUS_CHANGED");
  const others = frameRows(all, "focus").debuffs.groups[2];
  expect(others.icon === "ANY-DEBUFF" && others.dim === true && others.max === 8, "with onlyMine off, others' debuffs show too, dimmed").toBeTruthy();
  expect(frameRows(all, "focus").debuffs.groups[1].timer === true, "timer numbers can be turned on").toBeTruthy();
});

it("aura duration objects and power colors the theme does not name", () => {
  const addon = loggedIn(UNITS_ENV);
  const swept = addon.eval(`
    C_UnitAuras = C_UnitAuras or {}
    -- TEST-ONLY duration object the client would return for this aura.
    C_UnitAuras.GetAuraDuration = function() return { __duration = true } end
    local cd = CreateFrame("Cooldown", nil, UIParent)
    -- TEST-ONLY cooldown that records a duration-object sweep.
    cd.SetCooldownFromDurationObject = function() __swept = true return true end
    -- TEST-ONLY aura row: instance id, expiry and duration.
    ns.Auras.Sweep(cd, "player", { auraInstanceID = 7, expirationTime = 20, duration = 5 })
    return __swept == true
  `);
  expect(swept === true, "a duration object is handed to the cooldown when the client offers one").toBeTruthy();
  const runic = addon.eval(`
    __units.player.ptype = "RUNIC_POWER"
    -- TEST-ONLY client power color the theme does not name.
    PowerBarColor.RUNIC_POWER = { r = 0.2, g = 0.3, b = 0.4 }
    return { ns.GetModule("UnitFrames").PowerColor("player") }
  `);
  expect(runic[0] === 0.2 && runic[1] === 0.3 && runic[2] === 0.4, "an unnamed power type uses the client's PowerBarColor").toBeTruthy();
  const mana = addon.eval(`
    PowerBarColor.RUNIC_POWER = nil
    return { ns.GetModule("UnitFrames").PowerColor("player") }
  `);
  expect(isTok(addon, mana, "mana"), "with no client color, power falls back to mana").toBeTruthy();
  const text = addon.eval(`
    AbbreviateNumbers = function() error("TEST-ONLY") end
    return ns.GetModule("UnitFrames").HealthText("player")
  `);
  expect(text === "900", "if the client's number formatter errors, a plain number is shown as text").toBeTruthy();
});

// TEST-ONLY client pieces the engine backend uses for its timer text and debuff edges.
const ENGINE_ENV = `
  Enum = Enum or {}
  Enum.NumericRuleFormatRounding = { Up = 1, Down = 2 }
  Enum.LuaCurveType = { Step = 1 }
  Enum.DurationTextBindingProperty = { RemainingDuration = 0 }
  Enum.CustomAuraButtonDispelTypeTextureStyle = { PreserveAsset = 3 }
  AuraContainerSortMethod = { ExpirationOnly = 5 }
  C_StringUtil = { CreateNumericRuleFormatter = function() local f = {} function f:SetBreakpoints(p) self.points = p end return f end }
  C_CurveUtil = { CreateColorCurve = function() local c = { points = {} } function c:SetType(t) self.type = t end function c:AddPoint(x, color) self.points[#self.points + 1] = { x, color } end return c end }
`;

// TEST-ONLY auras on the target: two of yours, one of someone else's, one buff.
const CONTAINER_AURAS = `
  __ca = {
    ["HARMFUL|PLAYER"] = { { icon = "MY-DOT", auraInstanceID = 1, dispelName = "Magic", applications = 3 }, { icon = "MY-CURSE", auraInstanceID = 2, dispelName = "Curse" } },
    ["HARMFUL|!PLAYER"] = { { icon = "THEIR-DOT", auraInstanceID = 3 } },
    HARMFUL = { { icon = "MY-DOT", auraInstanceID = 1, dispelName = "Magic", applications = 3 }, { icon = "THEIR-DOT", auraInstanceID = 3 }, { icon = "MY-CURSE", auraInstanceID = 2, dispelName = "Curse" } },
  }
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) return (__ca[filter] or {})[i] end }
  __spec = { point = { "TOPLEFT", UIParent, "BOTTOMLEFT", 0, -3 }, grow = "RIGHT", growY = "DOWN", lineSize = 60, gap = 2, timer = true, mouse = false,
    groups = { { filter = "HARMFUL|PLAYER", max = 3, size = 20, debuff = true, pandemic = true, sort = "ExpirationOnly" },
      { filter = "HARMFUL|!PLAYER", max = 2, size = 16, debuff = true, dim = true, newLine = true } } }
`;

it("aura containers on the client's engine", () => {
  const addon = loggedIn(UNITS_ENV + ENGINE_ENV + CONTAINER_AURAS);
  const c = addon.eval(`__c = ns.Auras.Container(UIParent, __spec, "target")
    local f = __c.frame local g1, g2 = f.__groups[1], f.__groups[2] local b = g1.buttons[1]
    return { backend = ns.Auras.BackendName(), kind = f.__kind, anchor = f.__flowAnchor, grow = f.__flowGrow, line = f.__flowLine,
      filters = { g1.filter, g2.filter }, max = g1.opts.maxFrameCount, sort = g1.opts.sortMethod, newLine = g2.opts.layout.forceNewLine,
      icon = b.__icon.__texture, shown = b.__shown, count = b.__count:GetText(), cd = b.__durationCooldown ~= nil, mouse = b.__mouse,
      dim = g2.buttons[1].__icon.__desaturated, mine = b.__icon.__desaturated, rings = #b.__dispel, ringStyle = b.__dispel[1].opts.style,
      ringShown = b.__dispel[1].texture.__shown, ringColor = b.__dispel[1].texture.__vertexColor, pandemic = #b.__pandemic,
      timer = b.__durationText.opts.textFormatter.points[3].format, color = b.__durationText.opts.textColor.curve.points[1][1],
      swipe = b.__durationCooldown.__swipeColor, hideNumbers = b.__durationCooldown.__hideNumbers, third = g1.buttons[3].__shown,
      second = g2.buttons[1].__points.TOPLEFT.y }`);
  expect(c.backend === "engine" && c.kind === "AuraContainer", "the client's AuraContainer is used when it has one").toBeTruthy();
  expect(c.anchor === "TOPLEFT" && c.grow[0] === 1 && c.grow[1] === -1 && c.line === 60, "it flows from the anchored corner, right and down, wrapping at the line size").toBeTruthy();
  expect(c.filters[0] === "HARMFUL|PLAYER" && c.filters[1] === "HARMFUL|!PLAYER" && c.max === 3 && c.sort === 5, "the client gets the filters as written, with counts and sort").toBeTruthy();
  expect(c.newLine === true && c.second < 0, "a group asked to start a new row does").toBeTruthy();
  expect(c.icon === "MY-DOT" && c.shown && c.count === "3" && c.third === false, "the client fills the icons, stacks and all").toBeTruthy();
  expect(c.cd && c.hideNumbers === true && c.swipe[3] === 0.65, "a dark sweep with no countdown numbers on it").toBeTruthy();
  expect(c.mouse === false, "icons can let clicks through (raid frames)").toBeTruthy();
  expect(c.dim === true && c.mine === false, "others' auras are dimmed, yours are not").toBeTruthy();
  expect(c.rings === 4 && c.ringStyle === 3 && c.ringShown && isTok(addon, c.ringColor, "magic"), "a debuff's edge is handed to the client, colored by its type").toBeTruthy();
  expect(c.pandemic === 1, "the refresh-window wash is handed to the client").toBeTruthy();
  expect(c.timer === "%dm" && c.color === 0, "the timer text gets the theme's formatter and time-left colors").toBeTruthy();
  addon.eval("__c:SetUnit(nil)");
  expect(addon.eval("return __c.frame.__enabled == false and __c.frame.__groups[1].buttons[1].__shown == false"), "no unit: the container turns off").toBeTruthy();
  expect(addon.eval("__wfgStub.inCombat = true local n = ns.Auras.BackendName() __wfgStub.inCombat = false return n") === "fallback", "a container needed in combat (a new nameplate) gets the fallback").toBeTruthy();
  addon.eval('__c:SetUnit("target") __ca["HARMFUL|PLAYER"] = {} __c:Refresh()');
  expect(addon.eval("return __c.frame.__groups[1].buttons[1].__shown") === false, "Refresh reads the auras again").toBeTruthy();
});

// TEST-ONLY weapons: a shaman's imbue on the main hand (30 minutes left), nothing on the off hand.
const WEAPONS_ENV = `
  Enum = Enum or {}
  Enum.WeaponSlot = { MainHand = 0, OffHand = 1, Ranged = 2 }
  __enchants = { [0] = { { hasEnchant = true, enchantType = 2, timeLeft = 1800000, enchantIconID = "TEST-ONLY-ICON-Imbue" } } }
  C_Item = { GetWeaponEnchantInfo = function(slot) return __enchants[slot] end }
  GetInventoryItemTexture = function(unit, slot) return "TEST-ONLY-ICON-Weapon" .. slot end
  BuffFrame = CreateFrame("Frame", "BuffFrame", UIParent) BuffFrame:RegisterEvent("UNIT_AURA")
  DebuffFrame = CreateFrame("Frame", "DebuffFrame", UIParent)
  GameTooltip = CreateFrame("Frame", "GameTooltip", UIParent)
  function GameTooltip:SetOwner(owner) self.__owner = owner end
  function GameTooltip:SetInventoryItem(unit, slot) self.__item = slot end
`;

// The player aura holder's state: the container's groups and point, and the enchant cells.
const playerAuras = (addon) => addon.eval(`local PA = ns.GetModule("PlayerAuras") local f = PA.auras.frame
  local cells = {} for i, c in ipairs(PA.cells) do cells[i] = { shown = c:IsShown(), icon = c.icon.__texture, sweep = c.cooldown.__cooldown, inv = c.inv } end
  return { unit = f.__unit, filters = { f.__groups[1].filter, f.__groups[2].filter }, newLine = f.__groups[2].opts.layout.forceNewLine,
    cancel = f.__groups[1].buttons[1].__cancelButtons, x = f.__points.TOPRIGHT.x, cells = cells }`);

it("your buffs and debuffs replace the game's, with weapon enchants in front", () => {
  const addon = loggedIn(UNITS_ENV + ENGINE_ENV + WEAPONS_ENV + "GetTime = function() return 1000 end");
  expect(addon.eval("return { BuffFrame:IsShown(), BuffFrame:IsEventRegistered('UNIT_AURA'), DebuffFrame:IsShown() }"), "the game's buff frames are put away").toEqual([false, false, false]);
  const pa = playerAuras(addon);
  expect(pa, "one container on you: buffs, then debuffs from a new row; right-click cancels").toMatchObject({ unit: "player", filters: ["HELPFUL", "HARMFUL"], newLine: true, cancel: "RightButtonUp" });
  expect(pa.cells[0], "the main hand's imbue shows first, its sweep full").toMatchObject({ shown: true, icon: "TEST-ONLY-ICON-Imbue", sweep: [1000, 1800], inv: 16 });
  expect(pa.cells[1].shown === false && pa.x === -34, "no off-hand enchant, and the buffs move over by one cell").toBe(true);
  expect(addon.eval('return { ns.MoverPoint("playerauras") }'), "the holder is movable, left of the minimap").toEqual(["TOPRIGHT", "TOPRIGHT", -210, -14]);
  addon.eval("__enchants[0][1].timeLeft = 1200000 __enchants[1] = { { hasEnchant = true, timeLeft = 600000, enchantIconID = 0 } }");
  addon.fire("UNIT_INVENTORY_CHANGED", "party1");
  expect(playerAuras(addon).cells[1].shown, "another unit's inventory changes nothing").toBe(false);
  addon.fire("UNIT_INVENTORY_CHANGED", "player");
  const two = playerAuras(addon);
  expect(two.cells[0].sweep, "time passing keeps the sweep's full length, so it empties").toEqual([400, 1800]);
  expect(two.cells[1], "an oil on the off hand, drawn with the weapon's icon").toMatchObject({ shown: true, icon: "TEST-ONLY-ICON-Weapon17", sweep: [1000, 600] });
  expect(two.x, "and the buffs move over by two cells").toBe(-68);
  addon.eval("__enchants[1] = { { hasEnchant = { __secret = true }, timeLeft = 600000 } } local c = ns.GetModule('PlayerAuras').cells[1] c.cooldown:GetScript('OnCooldownDone')(c.cooldown)");
  expect(playerAuras(addon).cells[1].shown, "a hidden answer shows no cell").toBe(false);
  addon.eval("local c = ns.GetModule('PlayerAuras').cells[1] c:GetScript('OnEnter')(c)");
  expect(addon.eval("return { GameTooltip.__owner == ns.GetModule('PlayerAuras').cells[1], GameTooltip.__item, GameTooltip:IsShown() }"), "hovering a cell shows the weapon").toEqual([true, 16, true]);
  addon.eval("local c = ns.GetModule('PlayerAuras').cells[1] c:GetScript('OnLeave')(c) c = ns.GetModule('PlayerAuras').cells[2] c:GetScript('OnEnter')(c)");
  expect(addon.eval("return GameTooltip:IsShown()"), "and leaving hides it; an empty cell shows nothing").toBe(false);
});

it("your buffs: the enchant switch, and clients without enchant info", () => {
  const addon = loggedIn(UNITS_ENV + ENGINE_ENV + WEAPONS_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Weapon enchants in front")') && playerAuras(addon).cells[0].shown, "turning enchants off hides them at once").toBe(false);
  expect(playerAuras(addon).x, "and the buffs take the corner").toBe(0);
  expect(addon.eval('return __click("Icon size") and ForeverUIDB.profiles.Default.PlayerAuras.size'), "the icon size is on the page").toBe(36);
  const bare = loggedIn(UNITS_ENV + ENGINE_ENV + "GameTooltip = nil");
  expect(bare.eval("local PA = ns.GetModule('PlayerAuras') local c = PA.cells[1] c:GetScript('OnEnter')(c) c:GetScript('OnLeave')(c) return #PA.Enchants()"), "no enchant info on this client: no cells, and no tooltip to show").toBe(0);
  const old = loggedIn(UNITS_ENV + WEAPONS_ENV + "__wfgStub.noAuraContainer = true");
  expect(old.eval('return ns.GetModule("PlayerAuras").auras.frame.__kind'), "without the client's containers, ForeverUI's own icons").toBe("Frame");
  const combat = createAddon({ savedVariables: SETUP_DONE });
  combat.eval(UNITS_ENV + WEAPONS_ENV + `C_EventUtils = { IsEventValid = function(e) return e ~= "WEAPON_ENCHANT_CHANGED" end }
    __caught = {} local keep = ns.CaughtError ns.CaughtError = function(where, err) __caught[#__caught + 1] = where .. ": " .. err keep(where, err) end`);
  setCombat(combat, true);
  combat.login();
  expect(combat.eval('return ns.GetModule("PlayerAuras").cells == nil and BuffFrame:IsShown() == false'), "logging in during a fight hides the game's frames and waits to build").toBe(true);
  setCombat(combat, false);
  expect(combat.eval("return ns.GetModule('PlayerAuras').cells[1]:IsShown() and table.concat(__caught, '\\n')"), "an event this client lacks is skipped and noted").toMatch(/event WEAPON_ENCHANT_CHANGED: not on this client/);
});

it("aura container timer options a client refuses, and the engine probe", () => {
  const addon = loggedIn(UNITS_ENV + ENGINE_ENV + CONTAINER_AURAS);
  // The timer options a fresh container's first icon got, with `refuse` refused by the client.
  const opts = (refuse) => addon.eval(`__wfgStub.refuseDurationOptions = ${refuse}
    local c = ns.Auras.Container(UIParent, __spec, "target") local o = c.frame.__groups[1].buttons[1].__durationText.opts
    return { formatter = o.textFormatter ~= nil, color = o.textColor ~= nil }`);
  const noColor = opts("{ textColor = true }");
  expect(noColor.formatter && !noColor.color, "a refused color keeps the formatter").toBeTruthy();
  const bare = opts("{ textColor = true, textFormatter = true }");
  expect(!bare.formatter && !bare.color, "a refused formatter falls back to the client's own text").toBeTruthy();
  const fresh = loggedIn(UNITS_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { modules = { FrameAuras = false, PlayerAuras = false } } } }" });
  expect(fresh.eval("__wfgStub.inCombat = true return ns.AuraEngine.Available()") === false, "the probe waits for the end of combat").toBeTruthy();
  expect(fresh.eval("__wfgStub.inCombat = false return ns.AuraEngine.Available()") === true, "then asks once").toBeTruthy();
  const bareClient = loggedIn(UNITS_ENV + CONTAINER_AURAS);
  expect(bareClient.eval('local c = ns.Auras.Container(UIParent, __spec, "target") return c.frame.__groups[1].buttons[1].__durationText.opts.textFormatter') === null, "a client without formatters or curves still gets its timer text").toBeTruthy();
});

it("aura containers without the engine (the fallback)", () => {
  const addon = loggedIn(UNITS_ENV + CONTAINER_AURAS + `__wfgStub.noAuraContainer = true
    C_UnitAuras.GetAuraApplicationDisplayCount = function(unit, id) return id == 1 and "3*" or "" end`);
  const c = addon.eval(`__c = ns.Auras.Container(UIParent, __spec, "target")
    local g1, g2 = __c.groups[1], __c.groups[2]
    local function pos(icon) local p = icon.__points.TOPLEFT return p and { p.x, p.y } end
    return { backend = ns.Auras.BackendName(), filter = g2.filter, mine = { g1.icons[1].icon.__texture, g1.icons[2].icon.__texture },
      theirs = g2.icons[1]:IsShown() and g2.icons[1].icon.__texture, dup = g2.icons[2]:IsShown(), count = g1.icons[1].count:GetText(),
      ring = g1.icons[2].ring[1].__vertexColor, ringShown = g1.icons[2].ring[1].__shown, dim = g2.icons[1].icon.__desaturated,
      numbers = g1.icons[1].cooldown.__hideNumbers, font = g1.icons[1].cooldown.__countdown.__font ~= nil,
      p1 = pos(g1.icons[1]), p2 = pos(g1.icons[2]), p3 = pos(g2.icons[1]), events = __c.frame.__events.UNIT_AURA }`);
  expect(c.backend === "fallback", "without AuraContainer, ForeverUI's own icons are used").toBeTruthy();
  expect(c.filter === "HARMFUL", "'!' tokens are dropped for the older reads").toBeTruthy();
  expect(c.mine[0] === "MY-DOT" && c.mine[1] === "MY-CURSE" && c.theirs === "THEIR-DOT" && c.dup === false, "an aura an earlier group shows isn't shown twice").toBeTruthy();
  expect(c.count === "3*", "stacks use the client's display count (it formats hidden counts)").toBeTruthy();
  expect(c.ringShown && isTok(addon, c.ring, "curse") && c.dim === true, "debuff edges in their type's color; others' auras dimmed").toBeTruthy();
  expect(c.numbers === false && c.font, "timer icons show the client's countdown numbers in the theme's font").toBeTruthy();
  expect(c.p1[0] === 0 && c.p2[0] === 22 && c.p3[0] === 0 && c.p3[1] === -22, "icons flow right, and the second group starts a new row below").toBeTruthy();
  expect(c.events === true, "the container follows its unit's UNIT_AURA").toBeTruthy();
  addon.eval('__ca["HARMFUL|PLAYER"] = { { icon = "A", auraInstanceID = 10 }, { icon = "B", auraInstanceID = 11 }, { icon = "C", auraInstanceID = 12 } }');
  addon.fire("UNIT_AURA", "target");
  const wrapped = addon.eval("local p = __c.groups[1].icons[3].__points.TOPLEFT return { p.x, p.y }");
  expect(wrapped[0] === 0 && wrapped[1] === -22, "a row wraps at the line size").toBeTruthy();
  addon.eval("__c:SetUnit(nil)");
  expect(addon.eval("return __c.groups[1].icons[1]:IsShown()") === false, "no unit: nothing shows").toBeTruthy();
});

it("aura colors and stacks when the client hides the values", () => {
  const addon = loggedIn(UNITS_ENV + ENGINE_ENV + `
    C_UnitAuras = { GetAuraDispelTypeColor = function(unit, id, curve) __curve = curve return CreateColor(0.1, 0.2, 0.3) end,
      GetAuraApplicationDisplayCount = function() error("TEST-ONLY") end }`);
  const out = addon.eval(`local A = ns.Auras
    local r, g, b = A.DispelColor("target", { auraInstanceID = 5, dispelName = { __secret = true } })
    return { color = { r, g, b }, points = #__curve.points, step = __curve.type, plain = { A.DispelColor("target", { dispelName = "Poison" }) },
      typeless = A.DispelToken(nil), unknown = A.DispelToken("Enrage"), stacks = A.StackText("target", { auraInstanceID = 5, applications = 4 }),
      one = A.StackText("target", { applications = 1 }), hidden = A.StackText("target", { applications = { __secret = true } }) }`);
  expect(out.color[0] === 0.1 && out.points === 7 && out.step === 1, "a hidden type is colored by the client through the theme's curve").toBeTruthy();
  expect(isTok(addon, out.plain, "poison") && out.typeless === "bad" && out.unknown === "bad", "plain types use their token; none or unknown is 'bad'").toBeTruthy();
  expect(out.stacks === "4" && out.one === "" && out.hidden === "", "stacks: plain counts above 1 when the client's formatter fails; nothing when hidden").toBeTruthy();
  const noCurve = loggedIn(UNITS_ENV + `C_UnitAuras = { GetAuraDispelTypeColor = function() return nil end }`);
  expect(noCurve.eval('return ns.Auras.DispelToken("Magic")') === "magic" && isTok(noCurve, noCurve.eval('return { ns.Auras.DispelColor("target", { dispelName = { __secret = true } }) }'), "bad"), "no curve support: a hidden type shows as 'bad'").toBeTruthy();
});
