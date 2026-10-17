// Shared helpers for the Lua harness tests (scripts/tests/*.test.mjs): a
// logged-in addon, chat and theme-color checks, and the TEST-ONLY game
// environments cases build on.

import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { createAddon, root } from "../lib/lua-harness.mjs";
import { SCOPE_FILE, modulesOffLua, scopeFor } from "../lib/login-scope.mjs";
import { relFile } from "../lib/suite-timing.mjs";

// Tests that cause an error on purpose name it, so the error guard (setup.mjs) lets it stand.
export { expectErrors } from "../lib/error-guard.mjs";

// The deliberate aura-container fallback notice. It stays in ns.errors by the user's
// decision D-06, so a test whose client lacks AuraContainer names it with expectErrors.
export const AURA_FALLBACK = /^aura containers \(using Vanguard's own icons\): wow-world\.lua:\d+: CreateFrame: unknown frame type AuraContainer$/;

// A length in UI units rounded to whole screen pixels at UIParent's scale now, as the theme
// rounds sizes and offsets (T.PixelRound; with even, an even number of pixels).
export const px = (addon, n, even = false) => addon.eval(`return ns.Theme.PixelRound(UIParent, ${n}, ${even})`);

// r, g, b, a of a theme color token, read from the addon.
export const tok = (addon, name) => addon.eval(`return { ns.Theme.RGB("${name}") }`);

// Whether color c matches the theme token `name` in r, g and b.
export const isTok = (addon, c, name) => {
  const t = tok(addon, name);
  return Array.isArray(c) && [0, 1, 2].every((i) => Math.abs(c[i] - t[i]) < 1e-6);
};

// How many grid lines the player sees: visible 1 px textures spanning the whole screen, across or down.
export const gridLines = (addon) => addon.frames('w.__kind == "Texture" and w:IsVisible() and ((w:GetWidth() == 1 and w:GetHeight() == UIParent:GetHeight()) or (w:GetHeight() == 1 and w:GetWidth() == UIParent:GetWidth()))').length;

// Enters or leaves combat (leaving fires PLAYER_REGEN_ENABLED, which runs queued work).
export function setCombat(addon, on) {
  addon.eval(`__wfgStub.inCombat = ${on}`);
  if (!on) addon.fire("PLAYER_REGEN_ENABLED");
}

// A retail-like client (the world's default is WoW Forever): the newer interface number.
export const RETAIL = "__wfgWorld.build.interface = 120007\n";

// An account that has finished first-run setup, and a character that has played on it, so the
// wizard stays shut in cases about other things (a case's own VanguardDB or VanguardCharDB replaces them).
export const SETUP_DONE = "VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = {}\n";

// The scope data (which test files log in with the six heavy modules off), read once.
const SCOPE_DATA = JSON.parse(fs.readFileSync(path.join(root, SCOPE_FILE), "utf8"));

// The running case as { file, key }: its file relative to the repo root with forward slashes, and
// its describe chain and title joined by " > " (the shape the scope data and the JSON report use).
// Outside a running case the key is undefined.
export function runningCase() {
  const { testPath, currentTestName } = expect.getState();
  return { file: testPath ? relFile(root, testPath) : undefined, key: currentTestName };
}

// The Lua that turns the heavy modules off for the running case: empty (a full login) unless the
// data scopes it, or VG_LOGIN_SCOPE says probe; VG_LOGIN_SCOPE=full always gives the empty text.
function scopeLua() {
  return modulesOffLua(scopeFor({ mode: process.env.VG_LOGIN_SCOPE, ...runningCase(), data: SCOPE_DATA }));
}

// A logged-in addon; extra Lua runs before login (e.g. a module or a skin).
// firstRun: a brand-new account (no SavedVariables unless given), so setup opens.
// client: Lua run before the addon's files load (RETAIL_CLIENT from the harness).
// The six heavy modules are off for a case the scope data lists (see scripts/lib/login-scope.mjs).
export function loggedIn(extra = "", { firstRun = false, savedVariables = "", client = "" } = {}) {
  const addon = createAddon({ client, savedVariables: (firstRun ? savedVariables : SETUP_DONE + savedVariables) + scopeLua() });
  if (extra) addon.eval(extra);
  addon.login();
  return addon;
}

// Whether any chat line matches re.
export const chatHas = (addon, re) => Array.from(addon.chat()).some((line) => re.test(line));

// TEST-ONLY units. A secret is a table: Lua errors on arithmetic or
// comparison with it, so any math the addon did on a secret would fail here.
export const UNITS_ENV = `
  __units = {
    player = { name = "<name>", hp = 900, maxhp = 1000, power = 50, maxpower = 100, ptype = "MANA", player = true, class = "MAGE" },
    target = { name = "TEST-ONLY Boar", hp = { __secret = true }, maxhp = { __secret = true }, power = 0, maxpower = 0, ptype = "RAGE", reaction = 2 },
    party1 = { name = "TEST-ONLY Friend", hp = 0, maxhp = 500, power = 0, maxpower = 0, ptype = "ENERGY", player = true, class = "ROGUE", dead = true },
  }
  local function u(unit) return __units[unit] end
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  UnitExists = function(unit) return u(unit) ~= nil end
  UnitName = function(unit) return u(unit) and u(unit).name end
  UnitHealth = function(unit) return u(unit).hp end
  UnitHealthMax = function(unit) return u(unit).maxhp end
  UnitPower = function(unit) return u(unit).power end
  UnitPowerMax = function(unit) return u(unit).maxpower end
  UnitPowerType = function(unit) return 0, u(unit).ptype end
  UnitIsPlayer = function(unit) return u(unit) and u(unit).player == true end
  UnitClass = function(unit) return "Class", u(unit).class end
  UnitReaction = function(unit) return u(unit).reaction end
  UnitIsDeadOrGhost = function(unit) return u(unit).dead == true end
  UnitIsConnected = function() return true end
  AbbreviateNumbers = function(v) if issecretvalue(v) then return { __secret = true, text = true } end return tostring(v) end
  RegisterUnitWatch = function(f) f.__watched = true end
  RAID_CLASS_COLORS = { MAGE = { r = 0.25, g = 0.78, b = 0.92 }, ROGUE = { r = 1, g = 0.96, b = 0.41 } }
  PowerBarColor = { MANA = { r = 0, g = 0, b = 1 }, RAGE = { r = 1, g = 0, b = 0 } }
  PlayerFrame = CreateFrame("Frame", "PlayerFrame", UIParent)
  PlayerFrame:RegisterEvent("UNIT_HEALTH")
`;

// Saved variables with the raid frames module off (so UnitFrames builds its own party frames).
export const NO_RAID = { savedVariables: "VanguardDB = { profiles = { Default = { modules = { RaidFrames = false } } } }" };

// TEST-ONLY action slots and bindings. Slot 3's cooldown is secret.
export const ACTIONS_ENV = `
  GetActionCooldownDuration = nil
  __actions = {
    [1] = { tex = "TEST-ONLY-A", count = 0, usable = true, current = true },
    [2] = { tex = "TEST-ONLY-B", count = 5, usable = false, noPower = true },
    [3] = { tex = "TEST-ONLY-C", count = 0, usable = false, cd = { { __secret = true }, { __secret = true } } },
    [73] = { tex = "TEST-ONLY-PAGE7", count = 0, usable = true },
  }
  local function a(slot) return __actions[slot] or {} end
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  GetActionTexture = function(slot) return a(slot).tex end
  GetActionCount = function(slot) return a(slot).count or 0 end
  IsUsableAction = function(slot) return a(slot).usable == true, a(slot).noPower == true end
  IsCurrentAction = function(slot) return a(slot).current == true end
  IsAutoRepeatAction = function() return false end
  GetActionCooldown = function(slot) local cd = a(slot).cd or { 0, 0 } return cd[1], cd[2] end
  PickupAction = function(slot) __picked = slot end
  PlaceAction = function(slot) __placed = slot end
  __binds = { ACTIONBUTTON1 = { "1" }, ACTIONBUTTON2 = { "SHIFT-2" }, MULTIACTIONBAR1BUTTON1 = { "CTRL-BUTTON4" } }
  GetBindingKey = function(cmd) return unpack(__binds[cmd] or {}) end
  __overrides = {}
  __owners = {}
  ClearOverrideBindings = function(owner) for k in pairs(__overrides) do if __owners[k] == owner then __overrides[k] = nil end end end
  SetOverrideBindingClick = function(owner, _, key, name, button) __overrides[key] = name .. ":" .. (button or "LeftButton") __owners[key] = owner end
  RegisterStateDriver = function(frame, state, driver) frame.__states = frame.__states or {}; frame.__states[state] = driver end
  MainMenuBar = CreateFrame("Frame", "MainMenuBar", UIParent)
`;

// One action button's state.
export const button = (addon, bar, i) => addon.eval(`
  local b = Vanguard_Bar${bar}Button${i}
  return { action = b:GetAttribute("action"), type = b:GetAttribute("type"), icon = b.icon.__texture,
    shown = b.icon:IsShown(), count = b.count:GetText(), hotkey = b.hotkey:GetText(),
    color = b.icon.__vertexColor, checked = b:GetChecked(), cooldown = b.cooldown.__cooldown }`);

// TEST-ONLY minimap, chat windows and combined bag, as the client would have them.
export const UI_ENV = `
  UnitExists = function() return false end
  Minimap = CreateFrame("Minimap", "Minimap", UIParent)
  Minimap.ZoomIn = CreateFrame("Button", nil, Minimap)
  MinimapCluster = CreateFrame("Frame", "MinimapCluster", UIParent)
  MinimapCluster.BorderTop = CreateFrame("Frame", nil, MinimapCluster)
  GetMinimapZoneText = function() return "TEST-ONLY Vale" end
  GetZonePVPInfo = function() return "contested" end
  C_Map = { GetBestMapForUnit = function() return 1 end,
    GetPlayerMapPosition = function() return { GetXY = function() return 0.4567, 0.123 end } end }
  NUM_CHAT_WINDOWS = 2
  for i = 1, 2 do
    local f = CreateFrame("ScrollingMessageFrame", "ChatFrame" .. i, UIParent)
    f:SetFont("TEST-ONLY-FONT", 15, "")
    local tab = CreateFrame("Button", "ChatFrame" .. i .. "Tab", UIParent)
    tab.Text = tab:CreateFontString(nil, "OVERLAY")
    CreateFrame("EditBox", "ChatFrame" .. i .. "EditBox", UIParent)
  end
  SELECTED_CHAT_FRAME = ChatFrame2
  C_CVar = { SetCVar = function(k, v) __cvars = __cvars or {}; __cvars[k] = v end }
  ContainerFrameCombinedBags = CreateFrame("Frame", "ContainerFrameCombinedBags", UIParent)
  ContainerFrameCombinedBags:Hide()
  __item = CreateFrame("Button", nil, ContainerFrameCombinedBags)
  __item.IconBorder = __item:CreateTexture(nil, "OVERLAY")
  __item.icon = __item:CreateTexture(nil, "ARTWORK")
  ContainerFrameCombinedBags.EnumerateValidItems = function() return ipairs({ __item }) end
`;

// Presses a key on the quest dialog.
export const key = (addon, k) => addon.eval(`Vanguard_QuestDialog.__scripts.OnKeyDown(Vanguard_QuestDialog, "${k}")`);

// The game calls made so far (then forgets them).
export const calls = (addon) => { const c = addon.eval("local c = __calls __calls = {} return c"); return Array.isArray(c) ? c : []; };

// TEST-ONLY numbers for the info strip: head slot 30%, legs 9% worn, 12 free slots, 12g 34s 7c.
export const STRIP_ENV = `
  __dur = { [1] = { 30, 100 }, [7] = { 9, 100 }, [2] = { 0, 0 } }
  GetInventoryItemDurability = function(slot) local d = __dur[slot] if d then return d[1], d[2] end end
  C_Container = { GetContainerNumFreeSlots = function(bag) return bag == 0 and 4 or 2 end }
  __fps, __ammo, __money = 58.7, 412, 123407
  GetFramerate = function() return __fps end
  GetNetStats = function() return 0, 0, 40, 64 end
  GetMoney = function() return __money end
  GetInventoryItemCount = function(unit, slot) return slot == 0 and __ammo or 0 end
  date = function() return "21:04" end
`;

// One info strip block: shown, its text and its color.
export const block = (addon, key) => addon.eval(`local fs = ns.GetModule("InfoStrip").texts.${key} return { shown = fs:IsShown(), text = fs:GetText(), color = fs.__textColor }`);

// Moves the test clock without running a frame (a long stretch of play).
export const later = (addon, seconds) => addon.eval(`__wfgStub.now = __wfgStub.now + ${seconds}`);

// TEST-ONLY experience and a watched faction.
export const DATA_ENV = `
  UnitXP = function() return 12300 end
  UnitXPMax = function() return 40000 end
  GetXPExhaustion = function() return 5000 end
  UnitLevel = function() return 42 end
  IsPlayerAtEffectiveMaxLevel = function() return __maxLevel == true end
  C_Reputation = { GetWatchedFactionData = function() return __faction end }
  __faction = { name = "TEST-ONLY Faction", reaction = 5, currentReactionThreshold = 3000, nextReactionThreshold = 9000, currentStanding = 4200 }
`;

// The data bars' state.
export const bars = (addon) => addon.eval(`local x, r = Vanguard_xpbar, Vanguard_repbar
  return { xpShown = x:IsShown(), xp = x.__value, xpMax = x.__max, rested = x.rested.__width, xpText = x.text:GetText(), xpTextShown = x.text:IsShown(),
    repShown = r:IsShown(), rep = r.__value, repMax = r.__max, repColor = r.__barColor, repText = r.text:GetText() }`);

// TEST-ONLY lookup: the shown control whose label or caption starts with a text, clicked.
export const CLICK_LUA = `
  function __click(text)
    for _, w in ipairs(__wfgStub.frames) do
      local fs = w.label or w.text
      local shown, f = true, w
      while f do if not f.__shown then shown = false end f = f.__parent end
      if shown and type(fs) == "table" and type(fs.__text) == "string" and fs.__text:sub(1, #text) == text and w.__scripts.OnClick then
        w.__scripts.OnClick(w, "LeftButton")
        return true
      end
    end
    return false
  end
`;

// TEST-ONLY raid: three members; raid2 is you. The stub has no secure
// header, so tests create buttons the way the header would and call its setup.
export const RAID_ENV = `
  __units.raid1 = { name = "TEST-ONLY Tank", hp = 300, maxhp = 1000, power = 0, maxpower = 0, ptype = "RAGE", player = true, class = "WARRIOR", role = "TANK" }
  __units.raid2 = __units.player
  __units.raid3 = { name = "TEST-ONLY Gone", hp = 0, maxhp = 800, power = 0, maxpower = 0, ptype = "MANA", player = true, class = "MAGE", offline = true }
  RAID_CLASS_COLORS.WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }
  UnitGroupRolesAssigned = function(unit) return (__units[unit] or {}).role or "NONE" end
  UnitIsUnit = function(a, b) return __units[a] ~= nil and __units[a] == __units[b] end
  UnitIsConnected = function(unit) return not (__units[unit] or {}).offline end
  RegisterAttributeDriver = function(frame, attr, driver) frame.__drivers = frame.__drivers or {}; frame.__drivers[attr] = driver end
  CompactRaidFrameContainer = CreateFrame("Frame", "CompactRaidFrameContainer", UIParent)
  function __spawn(i, unit)
    local b = CreateFrame("Button", "Vanguard_RaidUnitButton" .. i, Vanguard_Raid, "SecureUnitButtonTemplate")
    -- Sized as RF.INIT sizes it, and placed in a column with the header grown to fit, as the
    -- client's group header does (a 0 x 0 tile or header gets no rect, nor anything on it).
    local w, h = Vanguard_Raid:GetAttribute("vg-width"), Vanguard_Raid:GetAttribute("vg-height")
    b:SetSize(w, h)
    b:SetPoint("TOPLEFT", Vanguard_Raid, "TOPLEFT", 0, -(i - 1) * h)
    Vanguard_Raid:SetSize(w, math.max(Vanguard_Raid:GetHeight(), i * h))
    Vanguard_Raid.initialConfigFunction(Vanguard_Raid, b:GetName())
    b:SetAttribute("unit", unit)
    return b
  end
`;

// One raid button's state.
export const raidButton = (addon, i) => addon.eval(`local b = Vanguard_RaidUnitButton${i}
  return { hp = b.health.__value, max = b.health.__max, color = b.health.__barColor, name = b.name:GetText(), role = b.role:IsShown() and b.role.__texture,
    roleW = b.role.__width, nameAfter = b.name.__points.TOPLEFT.rel == b.role, status = b.status:GetText() }`);

// TEST-ONLY healing data: a prediction calculator, threat, known spells and buffs.
export const HEALING_ENV = `
  __pred = { raid1 = { max = 1000, heals = 200, shields = 150 }, raid2 = { max = 900, heals = { __secret = true }, shields = 0 }, raid3 = { max = 800, heals = 0, shields = 0 } }
  CreateUnitHealPredictionCalculator = function()
    local c = {}
    function c:SetIncomingHealClampMode(m) self.clamp = m end
    function c:SetIncomingHealOverflowPercent() end
    function c:GetMaximumHealth() return __pred[self.unit].max end
    function c:GetIncomingHeals() return __pred[self.unit].heals end
    function c:GetTotalDamageAbsorbs() return __pred[self.unit].shields end
    __calc = c
    return c
  end
  UnitGetDetailedHealPrediction = function(unit, _, c) c.unit = unit end
  __threat = { raid1 = 3, raid2 = { __secret = true } }
  UnitThreatSituation = function(unit) return __threat[unit] end
  __known = { ["Arcane Brilliance"] = true, ["Arcane Intellect"] = true }
  C_Spell = { GetSpellInfo = function(name) return __known[name] and {} or nil end, GetSpellTexture = function(name) return "TEST-ONLY-ICON-" .. name end }
  __buffs = { raid2 = { ["Arcane Brilliance"] = true } }
  C_UnitAuras = { GetAuraDataBySpellName = function(unit, name) return (__buffs[unit] or {})[name] and {} or nil end }
`;

// Raid button i's healer extras.
export const healing = (addon, i) => addon.eval(`local b = Vanguard_RaidUnitButton${i}
  return { heal = b.heal:IsShown() and b.heal.__value, healMax = b.heal.__max, shield = b.shield.__value,
    threat = b.threat:IsShown() and b.threat.__vertexColor, missing = b.missing:IsShown() and b.missing.__texture }`);

// TEST-ONLY WoW Forever client: a 1.x interface number, the aura restriction, no specializations.
export const FOREVER_ENV = `
  GetBuildInfo = function() return "1.16.0", "TEST-ONLY", "Sep 1 2026", 16001 end
  C_SpecializationInfo = nil GetSpecialization = nil
  __secretAuras = false
  C_Secrets = { ShouldAurasBeSecret = function() return __secretAuras end }
`;

// Raid button i's status marks.
export const marks = (addon, i) => addon.eval(`local b = Vanguard_RaidUnitButton${i}
  local function tex(t) return t:IsShown() and t.__texture end
  return { icon = b.raidIcon:IsShown() and b.raidIcon.__texCoord, ready = tex(b.ready), readyColor = b.ready.__vertexColor, rez = b.rez:IsShown(),
    leader = tex(b.leader), leaderColor = b.leader.__vertexColor, leaderShadow = b.leader.shadow:IsShown(), status = b.status:IsShown(), alpha = b.__alpha }`);

// The default tooltip's state.
export const tooltip = (addon) => addon.eval(`local tt = GameTooltip
  return { shown = tt:IsShown(), nine = tt.NineSlice.__alpha, name = GameTooltipTextLeft1.__textColor,
    lines = tt.__lines, count = #tt.__lines, anchor = tt.__anchor, point = select(2, tt:GetPoint(1)) == Vanguard_TooltipAnchor }`);

// TEST-ONLY nameplates: nameplate1 is the hostile target (hidden health), nameplate2 a friend,
// nameplate3 a plate the client keeps from addons.
export const PLATE_ENV = `
  __plates, __threat, __cast = {}, {}, {}
  C_NamePlate = { GetNamePlateForUnit = function(unit) return __plates[unit] end }
  UnitIsUnit = function(a, b) return __units[a] ~= nil and __units[a] == __units[b] end
  UnitThreatSituation = function(_, unit) return __threat[unit] end
  UnitCastingInfo = function(unit) if __cast[unit] then return "TEST-ONLY Spell", "", "TEST-ONLY-ICON", 1000, 3000, false, nil, false end end
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter)
    if unit == "nameplate1" and filter == "HARMFUL|PLAYER|!CROWD_CONTROL" and i == 1 then return { icon = "TEST-ONLY-DOT", expirationTime = 1010, duration = 12 } end
  end }
  local function plate(unit, forbidden)
    local p = CreateFrame("Frame", nil, UIParent)
    -- The client sizes and places every nameplate; a 0 x 0 one would get no rect, nor Vanguard's plate on it.
    p:SetSize(110, 45)
    p:SetPoint("CENTER")
    p.UnitFrame = CreateFrame("Frame", nil, p)
    p.IsForbidden = function() return forbidden end
    __plates[unit] = p
  end
  __units.nameplate1 = __units.target
  __units.nameplate2 = __units.party1
  __units.nameplate3 = __units.party1
  plate("nameplate1") plate("nameplate2") plate("nameplate3", true)
`;

// One nameplate's state.
export const plate = (addon, unit) => addon.eval(`local p = __plates.${unit} local f = ns.FrameState('vgPlate')[p]
  if not f then return { drawn = false, default = p.UnitFrame:IsShown() } end
  local edge for _, w in ipairs(__wfgStub.frames) do if w.__parent == f and w.__layer == "OVERLAY" and w.__sublevel == 7 then edge = w.__vertexColor break end end
  return { drawn = f:IsShown(), default = p.UnitFrame:IsShown(), hp = f.__value, color = f.__barColor, name = f.name:GetText(),
    dot = f.debuffs.frame.__groups[1].buttons[1].__shown and f.debuffs.frame.__groups[1].buttons[1].__icon.__texture, cast = f.cast:IsShown() and f.cast.text:GetText(), edge = edge }`);

// TEST-ONLY animation group: records the fade and finishes only when __finishFades() runs.
export const FAKE_FADES = `
  __fades = {}
  function __fakeFader(frame)
    frame.CreateAnimationGroup = function()
      local g = { scripts = {}, owner = frame }
      function g:SetToFinalAlpha() end
      function g:Stop() self.playing = false end
      function g:SetScript(k, fn) self.scripts[k] = fn end
      function g:Play() self.playing = true table.insert(__fades, self) end
      function g:CreateAnimation(kind)
        local a = { kind = kind } g.anims = g.anims or {} table.insert(g.anims, a)
        function a:SetFromAlpha(v) g.from = v end function a:SetToAlpha(v) g.to = v end
        function a:SetDuration(v) self.duration = v if kind == "Alpha" then g.duration = v end end
        function a:SetSmoothing(v) self.smoothing = v end function a:SetOrder(v) self.order = v end
        function a:SetOffset(x, y) self.offset = { x, y } end
        return a
      end
      return g
    end
  end
  function __finishFades()
    for _, g in ipairs(__fades) do if g.playing and g.scripts.OnFinished then g.playing = false g.scripts.OnFinished() end end
    __fades = {}
  end
`;

// The border color of a painted frame (its BORDER-layer edge texture).
export const borderOf = (addon, lua) => addon.eval(`local f = ${lua}
  for _, w in ipairs(__wfgStub.frames) do
    if w.__parent == f and w.__layer == "BORDER" and w.__kind == "Texture" then return w.__vertexColor end
  end`);

// Where along a point's vertical axis a frame hangs: 0 at BOTTOM, 1 at TOP, 0.5 between.
export const UP = (point) => (/BOTTOM/.test(point) ? 0 : /TOP/.test(point) ? 1 : 0.5);

// TEST-ONLY game tools: Cooldown Manager rows (one item each), a damage meter
// with one window and one line, and the Edit Mode window.
export const TOOLS_ENV = `
  hooksecurefunc = hooksecurefunc or function(a, b, c)
    if type(a) == "table" then local orig = a[b] a[b] = function(...) local r = orig(...) c(...) return r end
    else local orig = _G[a] _G[a] = function(...) orig(...) b(...) end end
  end
  function __item(viewer, bar)
    local item = CreateFrame("Frame", nil, viewer) item:SetSize(32, 32)
    if bar then
      item.Icon = CreateFrame("Frame", nil, item) item.Icon.Icon = item.Icon:CreateTexture()
      item.Bar = CreateFrame("StatusBar", nil, item) item.Bar.Name = item.Bar:CreateFontString() item.Bar.Duration = item.Bar:CreateFontString()
    else
      item.Icon = item:CreateTexture() item.Icon:SetAllPoints()
      item.ChargeCount = CreateFrame("Frame", nil, item) item.ChargeCount.Current = item.ChargeCount:CreateFontString()
    end
    viewer.items[#viewer.items + 1] = item
    return item
  end
  for _, name in ipairs({ "EssentialCooldownViewer", "UtilityCooldownViewer", "BuffIconCooldownViewer", "BuffBarCooldownViewer" }) do
    local v = CreateFrame("Frame", name, UIParent) v.items = {}
    function v:GetItemFrames() return self.items end
    function v:RefreshLayout() __item(self, self == BuffBarCooldownViewer) end
    __item(v, name == "BuffBarCooldownViewer")
  end
  DamageMeter = CreateFrame("Frame", "DamageMeter", UIParent) DamageMeter:SetSize(400, 200) DamageMeter:SetPoint("TOPLEFT")
  DamageMeter.windows = {}
  function DamageMeter:ForEachSessionWindow(fn) for _, w in ipairs(self.windows) do fn(w) end end
  function DamageMeter:SetupSessionWindow()
    local w = CreateFrame("Frame", "DamageMeterSessionWindow" .. (#self.windows + 1), self)
    w.Header = w:CreateTexture() w.ScrollBox = CreateFrame("Frame", nil, w) w.ScrollBox.lines = {}
    function w.ScrollBox:ForEachFrame(fn) for _, l in ipairs(self.lines) do fn(l) end end
    function w.ScrollBox:Update() end
    self.windows[#self.windows + 1] = w
    return w
  end
  function __line(w)
    local l = CreateFrame("Button", nil, w.ScrollBox) l.StatusBar = CreateFrame("StatusBar", nil, l)
    l.StatusBar.BackgroundRegions = { l.StatusBar:CreateTexture() } l.StatusBar.Name = l.StatusBar:CreateFontString() l.StatusBar.Value = l.StatusBar:CreateFontString()
    l.Icon = CreateFrame("Frame", nil, l) l.Icon.Icon = l.Icon:CreateTexture()
    w.ScrollBox.lines[#w.ScrollBox.lines + 1] = l
    return l
  end
  __line(DamageMeter:SetupSessionWindow())
  EditModeManagerFrame = CreateFrame("Frame", "EditModeManagerFrame", UIParent) EditModeManagerFrame:Hide()
`;

// True when two rects overlap (touching edges don't count).
export const overlaps = (a, c) => a.l < c.r && c.l < a.r && a.b < c.t && c.b < a.t;

// TEST-ONLY power: your power type and your spells' costs (90001 costs mana, 90002 costs nothing).
export const TICKS_ENV = `
  __ptype = 0
  UnitPowerType = function() return __ptype end
  __costs = { [90001] = { { type = 0, cost = 20 } }, [90002] = { { type = 0, cost = 0 } } }
  C_Spell = C_Spell or {}
  C_Spell.GetSpellPowerCost = function(id) return __costs[id] end
`;

// The spark: shown, where it sits along the bar (its TOP point's x) and whether its timer runs.
export const spark = (addon) => addon.eval(`local PT = ns.GetModule("PowerTicks") local top = PT.spark.__points.TOP
  return { PT.spark:IsShown(), top and top.x or -1, PT.driver.__scripts.OnUpdate ~= nil }`);

// TEST-ONLY swings: a client with the swing timer, and you a warrior.
export const SWING_ENV = `
  __units.player.class = "WARRIOR"
  C_SwingTimer = {}
  Enum = Enum or {}
  Enum.PlayerSwingType = { MainHand = 0, OffHand = 1, Ranged = 2 }
`;

// TEST-ONLY client frames Vanguard tidies away: the game's XP bar, durability figure, clock and calendar
// button, minimap buttons, micro menu, bag bar and quest tracker. hooksecurefunc hooks methods too, as in game.
export const TIDY_ENV = `
  hooksecurefunc = function(a, b, c)
    if type(a) == "table" then local orig = a[b] a[b] = function(...) local r = orig(...) c(...) return r end
    else local orig = _G[a] _G[a] = function(...) orig(...) b(...) end end
  end
  for _, name in ipairs({ "StatusTrackingBarManager", "DurabilityFrame", "TimeManagerClockButton", "GameTimeFrame",
    "AddonCompartmentFrame", "MicroMenuContainer", "BagsBar", "ObjectiveTrackerFrame" }) do CreateFrame("Frame", name, UIParent) end
  MinimapCluster.Tracking = CreateFrame("Frame", nil, MinimapCluster)
  MinimapCluster.IndicatorFrame = CreateFrame("Frame", nil, MinimapCluster)
  MinimapCluster.IndicatorFrame.MailFrame = CreateFrame("Frame", nil, MinimapCluster.IndicatorFrame)
`;

// Whether one of the game's frames was put away (hidden, under another parent).
export const putAway = (addon, path) => addon.eval(`local f = ${path} return f:GetParent() ~= UIParent and not f:IsShown()`);

// A frame's parent check and its single anchor point name.
export const pinned = (addon, path, parent) => addon.eval(`local f = ${path} local p = next(f.__points) return { f:GetParent() == ${parent}, p }`);

// TEST-ONLY micro menu buttons in the game's micro menu: their background plate,
// art, a normal texture the game swaps atlases on, and an alert flash; the
// backpack button with its bag ID.
export const MICRO_ENV = `
  function __micro(name)
    local b = CreateFrame("Button", name, MicroMenuContainer)
    b:SetSize(32, 40)
    b.Background = b:CreateTexture(nil, "BACKGROUND")
    b:CreateTexture(nil, "ARTWORK"):SetTexture("TEST-ONLY-ART")
    b.normal = b:CreateTexture(nil, "ARTWORK")
    b.GetNormalTexture = function(self) return self.normal end
    b.Flash = b:CreateTexture(nil, "OVERLAY")
    return b
  end
  __micro("CharacterMicroButton") __micro("MainMenuMicroButton")
  __bag = CreateFrame("Button", "MainMenuBarBackpackButton", BagsBar) __bag:SetSize(40, 40)
  __bag.icon = __bag:CreateTexture() __bag.icon:SetAllPoints() __bag:CreateTexture(nil, "OVERLAY"):SetTexture("TEST-ONLY-ART")
  function __bag:GetBagID() return 0 end
`;

// Strips under the Forever-like bars; extra is more Lua to run first.
export const strips = (extra = "", opts) => loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + extra, opts);

// TEST-ONLY Forever extras for the strips (on top of TIDY_ENV + MICRO_ENV): the bars' own frame art, bars that size
// themselves in Layout (__menuW is the micro menu's width then), the key ring, a menu button with no size yet.
export const STRIPS_ENV = `
  MicroMenu = CreateFrame("Frame", "MicroMenu", MicroMenuContainer)
  MicroMenu.BorderArt = MicroMenu:CreateTexture(nil, "BACKGROUND")
  MicroMenu.BackgroundArt = MicroMenu:CreateTexture(nil, "BACKGROUND")
  BagsBar.BorderArt = BagsBar:CreateTexture(nil, "BACKGROUND")
  function MicroMenuContainer:Layout() self:SetSize(__menuW or 378, 40) end
  function BagsBar:Layout() self:SetSize(266, 45) end
  __bag:SetSize(45, 45)
  __keyring = CreateFrame("Button", "KeyRingButton", BagsBar) __keyring:SetSize(33, 45) __keyring.icon = __keyring:CreateTexture()
  CreateFrame("Button", "EJMicroButton", MicroMenuContainer)
`;

// TEST-ONLY pet and stance bars, as the client has them, with the game's Edit Mode spot.
export const SPECIAL_BARS_ENV = `
  PetActionBar = CreateFrame("Frame", "PetActionBar", UIParent)
  PetActionBar:SetSize(509, 43)
  PetActionBar:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
  StanceBar = CreateFrame("Frame", "StanceBar", UIParent)
  StanceBar:SetSize(30, 30)
  StanceBar:SetPoint("BOTTOM", UIParent, "BOTTOM", 0, 0)
`;

// TEST-ONLY client whose AuraContainer has every engine method except `name`.
export const lacking = (name) => `
  local real = CreateFrame
  CreateFrame = function(kind, ...) local f = real(kind, ...) if kind == "AuraContainer" then f[${JSON.stringify(name)}] = false end return f end
  __wfgStub.transparent[CreateFrame] = true
`;

// TEST-ONLY totems: slot 1 has a totem down (plain values), the other slots are empty.
export const TOTEMS_ENV = `
  __units.player.class = "SHAMAN"
  __totems = { [1] = { true, "TEST-ONLY Totem", 100, 120, "TEST-ONLY-ICON-Totem" } }
  GetTotemInfo = function(slot) local t = __totems[slot] if t then return t[1], t[2], t[3], t[4], t[5] end return false, "", 0, 0, nil end
  GetTotemDuration = nil
`;

// TEST-ONLY client pieces the engine backend uses for its timer text and debuff edges.
export const ENGINE_ENV = `
  Enum = Enum or {}
  Enum.NumericRuleFormatRounding = { Up = 1, Down = 2 }
  Enum.LuaCurveType = { Step = 1 }
  Enum.DurationTextBindingProperty = { RemainingDuration = 0 }
  Enum.CustomAuraButtonDispelTypeTextureStyle = { PreserveAsset = 3 }
  AuraContainerSortMethod = { ExpirationOnly = 5 }
  C_StringUtil = { CreateNumericRuleFormatter = function() local f = {} function f:SetBreakpoints(p) self.points = p end return f end }
  C_CurveUtil = { CreateColorCurve = function() local c = { points = {} } function c:SetType(t) self.type = t end function c:AddPoint(x, color) self.points[#self.points + 1] = { x, color } end return c end }
`;

// One totem cell's state: alpha, icon, plain sweep, duration object, numbers shown, secure attributes.
export const totemCell = (addon, slot) => addon.eval(`local c = ns.GetModule("ClassBars").cells[${slot}]
  return { alpha = c.__alpha, icon = c.icon.__texture, sweep = c.cooldown.__cooldown, object = c.cooldown.__durationObject,
    numbers = c.cooldown.__hideNumbers == false, type2 = c:GetAttribute("type2"), slot = c:GetAttribute("totem-slot"), follows = c.__alphaFromBoolean }`);

// TEST-ONLY quest giver: a farmer with a quest to take (wolves), one to turn in (a letter) and
// a gossip option; two reward choices (boots sell for 50c, gloves for 3s) and bread you always get.
export const QUEST_ENV = `
  __calls, __prices = {}, { ["item:90021"] = 50, ["item:90022"] = 300 }
  local function log(name) return function(...) __calls[#__calls + 1] = name .. " " .. tostring((...)) end end
  UISpecialFrames = {}
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  UnitName = function(unit) if unit == "npc" then return "TEST-ONLY Farmer" end return "<name>" end
  __npc = true
  UnitExists = (function(old) return function(unit) if unit == "npc" then return __npc end return old(unit) end end)(UnitExists)
  SetPortraitTexture = function(t, unit) t.__portrait = unit end
  GetQuestDifficultyColor = function(level) return { r = level > 10 and 1 or 0.25, g = 0.75, b = 0.25 } end
  C_Item = { GetItemQualityColor = function() return 0, 0.44, 0.87 end, GetItemInfo = function(link) return "x", link, 1, 1, 1, "", "", 1, "", "", __prices[link] end }
  __avail = { { title = "TEST-ONLY Wolves", questLevel = 8, questID = 90031 } }
  __active = { { title = "TEST-ONLY Letter", questLevel = 12, questID = 90032, isComplete = true } }
  __options = { { name = "TEST-ONLY Tell me more", icon = 90041, gossipOptionID = 90041, orderIndex = 0 } }
  C_GossipInfo = { GetText = function() return __greeting end, GetAvailableQuests = function() return __avail end,
    GetActiveQuests = function() return __active end, GetOptions = function() return __options end,
    SelectAvailableQuest = log("avail"), SelectActiveQuest = log("active"), SelectOption = log("option"), CloseGossip = log("closeGossip") }
  __greeting = "TEST-ONLY Well met, <name>."
  GetTitleText = function() return "TEST-ONLY Wolves" end
  GetQuestText = function() return "TEST-ONLY Wolves trouble the farm." end
  GetObjectiveText = function() return "Slay 8 TEST-ONLY Wolves." end
  GetProgressText = function() return "TEST-ONLY Done yet?" end
  GetRewardText = function() return "TEST-ONLY Thank you." end
  GetGreetingText = function() return "TEST-ONLY Hello." end
  __choices = { { "TEST-ONLY Boots", "TEST-ONLY-ICON", 1, 3, "item:90021" }, { "TEST-ONLY Gloves", "TEST-ONLY-ICON", 1, 2, "item:90022" } }
  __rewards = { { "TEST-ONLY Bread", "TEST-ONLY-ICON", 5, 1, "item:90023" } }
  GetNumQuestChoices = function() return #__choices end
  GetNumQuestRewards = function() return #__rewards end
  GetNumQuestItems = function() return 0 end
  GetQuestItemInfo = function(kind, i) local x = (kind == "choice" and __choices or __rewards)[i] return x[1], x[2], x[3], x[4] end
  GetQuestItemLink = function(kind, i) return (kind == "choice" and __choices or __rewards)[i][5] end
  GetRewardMoney = function() return 1200 end
  GetRewardXP = function() return 450 end
  __completable, __autoAccept, __shift = true, false, false
  IsQuestCompletable = function() return __completable end
  QuestGetAutoAccept = function() return __autoAccept end
  IsShiftKeyDown = function() return __shift end
  AcceptQuest, DeclineQuest, CompleteQuest, CloseQuest, AcknowledgeAutoAcceptQuest = log("accept"), log("decline"), log("complete"), log("closeQuest"), log("ack")
  GetQuestReward = log("reward")
  __greetAvail, __greetActive = 1, 0
  GetNumAvailableQuests = function() return __greetAvail end
  GetNumActiveQuests = function() return __greetActive end
  GetAvailableTitle = function() return "TEST-ONLY Rats" end
  GetAvailableLevel = function() return 5 end
  GetActiveTitle = function() return "TEST-ONLY Parcel", false end
  GetActiveLevel = function() return 6 end
  SelectAvailableQuest, SelectActiveQuest = log("greetAvail"), log("greetActive")
  QuestFrame = CreateFrame("Frame", "QuestFrame", UIParent) QuestFrame:RegisterEvent("QUEST_DETAIL") QuestFrame:RegisterEvent("QUEST_LOG_UPDATE")
  CustomGossipFrameManager = CreateFrame("Frame", "CustomGossipFrameManager", UIParent) CustomGossipFrameManager:RegisterEvent("GOSSIP_SHOW")
  GameTooltip = CreateFrame("Frame", "GameTooltip", UIParent)
  GameTooltip.SetOwner = function() end
  GameTooltip.SetQuestItem = function(self, kind, i) self.__questItem = kind .. " " .. i end
`;

// TEST-ONLY away player: a level 42 mage in a made-up zone, 300 of 1000 XP into the level.
export const AFK_ENV = `
  __afk, __level = false, 42
  UnitIsAFK = function(unit) return unit == "player" and __afk end
  UnitLevel = function() return __level end
  GetMaxPlayerLevel = function() return 60 end
  GetRealZoneText = function() return "TEST-ONLY Vale" end
  GetSubZoneText = function() return "TEST-ONLY Hamlet" end
  UnitXP = function() return 300 end
  UnitXPMax = function() return 1000 end
  date = function() return "21:04" end
`;

// Who hears a unit event: `subs`, the units each ns.OnUnit subscription asked
// the client for (one "a,b" entry per subscription, sorted, space-separated),
// and `plain`, how many frames take the event for every unit.
export const unitEvents = (addon, event) => addon.eval(`local subs, plain = {}, 0
  for _, w in ipairs(__wfgStub.frames) do
    local units = w.__unitEvents and w.__unitEvents["${event}"]
    if w.__events["${event}"] and not units then plain = plain + 1 end
    if w.__events["${event}"] and units and w.vgHandler then subs[#subs + 1] = table.concat(units, ",") end
  end
  table.sort(subs)
  return { subs = table.concat(subs, " "), plain = plain }`);

// TEST-ONLY game windows: a framed window built like the game's ButtonFrameTemplate (art textures,
// NineSlice, inset, portrait, close button, title, push buttons), a popup, and the breath bars' container
// (MirrorTimerContainer: three unnamed MirrorTimerTemplate-shaped timers, each with a StatusBar, its frame art
// and a label; SetupTimer(i) shows the i-th and gives its bar the game's texture back, as the game's does).
export const WINDOWS_ENV = `
  function __window(name, kind)
    local f = CreateFrame("Frame", name, UIParent)
    f:CreateTexture(nil, "BACKGROUND"):SetTexture("TEST-ONLY-ART")
    f.NineSlice = CreateFrame("Frame", nil, f) f.NineSlice:CreateTexture(nil, "BORDER")
    f.Inset = CreateFrame("Frame", nil, f) f.Inset.NineSlice = CreateFrame("Frame", nil, f.Inset)
    f.PortraitContainer = CreateFrame("Frame", nil, f)
    f.CloseButton = CreateFrame("Button", name .. "CloseButton", f)
    f.TitleContainer = CreateFrame("Frame", nil, f) f.TitleContainer.TitleText = f.TitleContainer:CreateFontString(nil, "OVERLAY")
    for i = 1, 2 do CreateFrame("Button", name .. "Button" .. i, f) end
    f:Hide()
    return f
  end
  __window("MerchantFrame") __window("StaticPopup1")
  MirrorTimerContainer = CreateFrame("Frame", "MirrorTimerContainer", UIParent)
  for _ = 1, 3 do
    local t = CreateFrame("Frame", nil, MirrorTimerContainer)
    t.StatusBar = CreateFrame("StatusBar", nil, t)
    t.Border = t:CreateTexture(nil, "OVERLAY") t.Border:SetTexture("TEST-ONLY-ART")
    t.Text = t:CreateFontString(nil, "OVERLAY")
    t:Hide()
  end
  function MirrorTimerContainer:SetupTimer(i)
    local t = select(i, self:GetChildren()) t.StatusBar:SetStatusBarTexture("TEST-ONLY-ART") t:Show()
  end
`;

// A window's state: its own art faded, its parts dressed, how many frames are painted.
export const windowState = (addon, name) => addon.eval(`local f = ${name}
  local art for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
  local panel = 0 for _, r in ipairs({ f:GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then panel = panel + 1 end end
  return { art = art, nine = f.NineSlice.__alpha, portrait = f.PortraitContainer.__alpha, insetNine = f.Inset.NineSlice.__alpha,
    panel = panel > 0, title = f.TitleContainer.TitleText:GetFont() ~= nil, painted = ns.Theme.PaintedCount() }`);
