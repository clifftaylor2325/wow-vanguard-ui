// ForeverUI's real Lua under Node (fengari) against the TEST-ONLY WoW
// stub (scripts/lib/wow-stub.lua). One case per it(), same checks as before.

import { afterAll, expect, it } from "vitest";
import { createAddon } from "./lib/lua-harness.mjs";
import { dumpHits } from "./lib/lua-coverage.mjs";
import { luaValue } from "./lib/lua-emit.mjs";

// Writes the worker's line hits when coverage asked for a hits file.
afterAll(() => {
  if (process.env.LUA_COVERAGE_HITS) dumpHits(process.env.LUA_COVERAGE_HITS);
});

// r, g, b, a of a theme color token, read from the addon.
const tok = (addon, name) => addon.eval(`return { ns.Theme.RGB("${name}") }`);

// Whether color c matches the theme token `name` in r, g and b.
const isTok = (addon, c, name) => {
  const t = tok(addon, name);
  return Array.isArray(c) && [0, 1, 2].every((i) => Math.abs(c[i] - t[i]) < 1e-6);
};

// Enters or leaves combat (leaving fires PLAYER_REGEN_ENABLED, which runs queued work).
function setCombat(addon, on) {
  addon.eval(`__wfgStub.inCombat = ${on}`);
  if (!on) addon.fire("PLAYER_REGEN_ENABLED");
}

// An account that has finished first-run setup, so the wizard stays shut in
// cases about other things (a case's own ForeverUIDB replaces it).
const SETUP_DONE = "ForeverUIDB = { version = 1, profiles = {}, setupDone = true }\n";

// A logged-in addon; extra Lua runs before login (e.g. a module or a skin).
// firstRun: a brand-new account (no SavedVariables unless given), so setup opens.
function loggedIn(extra = "", { firstRun = false, savedVariables = "" } = {}) {
  const addon = createAddon({ savedVariables: firstRun ? savedVariables : SETUP_DONE + savedVariables });
  if (extra) addon.eval(extra);
  addon.login();
  return addon;
}

// Whether any chat line matches re.
const chatHas = (addon, re) => addon.chat().some((line) => re.test(line));

it("saved variables", () => {
  expect(createAddon().eval("return next(ns.Profile()) == nil"), "before ADDON_LOADED the profile is empty").toBe(true);
  const addon = loggedIn("", { firstRun: true });
  const sv = addon.savedVariables();
  expect(sv.account.version === 1 && typeof sv.account.profiles === "object", "fresh install creates ForeverUIDB").toBeTruthy();
  expect(sv.char.profile === "Default", "a new character uses the Default profile").toBeTruthy();
  const kept = loggedIn("", { savedVariables: 'ForeverUIDB = { profiles = { Main = { theme = { accent = { 1, 0, 0 } } } } }\nForeverUICharDB = { profile = "Main" }' });
  expect(kept.eval("return select(1, ns.Theme.Accent())") === 1, "the character's saved profile is used").toBeTruthy();
  expect(kept.eval("return ns.Theme.Settings().panel[4]") === 0.94, "missing theme settings get defaults").toBeTruthy();
});

it("modules", () => {
  const addon = loggedIn(`
    ns.Module("Good", { defaults = { size = 3 }, Enable = function(s) __size = s.size end })
    ns.Module("Bad", { Enable = function() error("boom") end })
    ns.Module("Off", { Enable = function() __off = true end })
  `, { savedVariables: 'ForeverUIDB = { profiles = { Default = { modules = { Off = false } } } }' });
  expect(addon.eval("return __size") === 3, "a module is enabled with its defaults").toBeTruthy();
  expect(chatHas(addon, /module Bad failed to load: .*boom/), "a failing module is reported").toBeTruthy();
  expect(addon.eval("return ns.GetModule('Bad').enabled") === false, "a failing module is marked not enabled").toBeTruthy();
  expect(addon.eval("return __off") === null, "a module turned off in the profile is not enabled").toBeTruthy();
  addon.slash("disable Good");
  expect(addon.eval("return ns.ModuleEnabled('Good')") === false, "/fui disable turns a module off").toBeTruthy();
});

it("combat queue", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true; ns.OutOfCombat(function() __ran = (__ran or 0) + 1 end)");
  expect(addon.eval("return __ran") === null, "work waits during combat").toBeTruthy();
  expect(addon.eval("return ns.QueuedCount()") === 1, "queued work is counted").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return __ran") === 1, "queued work runs once after combat").toBeTruthy();
  addon.eval("ns.OutOfCombat(function() __ran = __ran + 1 end)");
  expect(addon.eval("return __ran") === 2, "out of combat, work runs at once").toBeTruthy();
});

it("theme", () => {
  const addon = loggedIn();
  const colors = addon.eval(`
    local f = ns.Theme.Panel(CreateFrame("Frame", "TestPanel", UIParent), { accent = true })
    ns.Theme.Panel(f, { accent = true })
    local out = {}
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__kind == "Texture" then out[#out + 1] = w.__vertexColor end
    end
    return out`);
  expect(colors.length === 6, `a panel is one background, four edges and a sheen, painted once (got ${colors.length})`).toBeTruthy();
  expect(colors.some((c) => isTok(addon, c, "accent")), "an accent panel's border uses the accent").toBeTruthy();
  addon.slash("accent ff8000");
  const edge = addon.eval(`
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == TestPanel and w.__layer == "BORDER" then return w.__vertexColor end
    end`);
  expect(edge[0] === 1 && Math.abs(edge[1] - 128 / 255) < 1e-9 && edge[2] === 0, "/fui accent repaints painted frames live").toBeTruthy();
  addon.slash("accent nope");
  expect(chatHas(addon, /Usage: \/fui accent/), "a bad accent shows usage").toBeTruthy();
  addon.slash("theme reset");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.brass[1]") === true, "/fui theme reset restores the default accent (brass)").toBeTruthy();
});

it("widgets", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local before = ns.Theme.PaintedCount()
    local b = ns.Theme.Button(CreateFrame("Button", nil, UIParent, "UIPanelButtonTemplate"))
    local e = ns.Theme.EditBox(CreateFrame("EditBox", nil, UIParent))
    local c = ns.Theme.CloseButton(CreateFrame("Button", nil, UIParent, "UIPanelCloseButton"))
    local glyph
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == c and w.__kind == "Texture" and w.__layer == "OVERLAY" then glyph = w.__texture end
    end
    return { painted = ns.Theme.PaintedCount() - before, glyph = glyph }`);
  expect(out.painted === 3, "button, edit box and close button are painted").toBeTruthy();
  expect(/Media\\Icons\\Close$/.test(out.glyph || ""), "the close button draws the Close icon").toBeTruthy();
});

it("skin API", () => {
  const addon = loggedIn(`
    ForeverUI.RegisterSkin("Early", function(S) __early = S.apiVersion; S.Panel(CreateFrame("Frame", nil, UIParent)) end)
    ForeverUI.RegisterSkin("Early", function() __dup = true end)
    ForeverUI.RegisterSkin("Broken", function() error("oops") end)
  `);
  expect(addon.eval("return __early") === 1, "a skin registered before login runs at login with apiVersion 1").toBeTruthy();
  expect(addon.eval("return __dup") === null, "the first registration of a name wins").toBeTruthy();
  expect(chatHas(addon, /skin for Broken failed: .*oops/), "a failing skin is reported, not raised").toBeTruthy();
  addon.eval('ForeverUI.RegisterSkin("Late", function() __late = true end)');
  expect(addon.eval("return __late") === true, "a skin registered after login runs at once").toBeTruthy();
  const off = loggedIn('ForeverUI.RegisterSkin("Muted", function() __muted = true end)', {
    savedVariables: "ForeverUIDB = { profiles = { Default = { skins = { Muted = false } } } }",
  });
  expect(off.eval("return __muted") === null, "a skin turned off in the profile never runs").toBeTruthy();
  off.clearChat();
  off.slash("skins");
  expect(chatHas(off, /Muted/), "/fui skins lists registered skins").toBeTruthy();
});

it("movers", () => {
  const addon = loggedIn(`
    __f = CreateFrame("Frame", nil, UIParent)
    __f:SetSize(200, 40)
    ns.Mover(__f, "player", "Player frame", { "CENTER", "CENTER", -250, -150 })
  `);
  // The frame's first anchor as [point, relPoint, x, y].
  const point = () => addon.eval("local p, _, rp, x, y = __f:GetPoint(1); return { p, rp, x, y }");
  expect(JSON.stringify(point()) === JSON.stringify(["CENTER", "CENTER", -250, -150]), "a frame starts at its default point").toBeTruthy();
  addon.slash("unlock");
  const handle = "ns.MoverHandleForTest()";
  addon.eval(`function ns.MoverHandleForTest() for _, w in ipairs(__wfgStub.frames) do if w.mover then return w end end end`);
  expect(addon.eval(`return ${handle}:IsShown()`) === true, "/fui unlock shows a handle").toBeTruthy();
  addon.eval(`local h = ${handle}; h:GetScript("OnDragStart")(h); h:ClearAllPoints(); h:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -20); h:GetScript("OnDragStop")(h)`);
  expect(JSON.stringify(point()) === JSON.stringify(["TOPLEFT", "TOPLEFT", 10, -20]), "dropping a handle moves its frame").toBeTruthy();
  expect(addon.eval("return ForeverUIDB.profiles.Default.positions.player.x") === 10, "the position is saved in the profile").toBeTruthy();
  addon.slash("reset player");
  expect(point()[0] === "CENTER", "/fui reset puts the frame back").toBeTruthy();
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval(`return ${handle}:IsShown()`) === false, "entering combat locks").toBeTruthy();
  addon.eval("__wfgStub.inCombat = true");
  addon.clearChat();
  addon.slash("unlock");
  expect(chatHas(addon, /Not in combat/), "unlock is refused in combat").toBeTruthy();
});

it("layout", () => {
  const addon = loggedIn();
  // ns.Layout.Anchor on a 1920x1080 screen.
  const anchor = (l, b, w, h) => addon.eval(`return { ns.Layout.Anchor(${l}, ${b}, ${w}, ${h}, 1920, 1080) }`);
  expect(JSON.stringify(anchor(20, 900, 200, 40)) === JSON.stringify(["TOPLEFT", 20, -140]), "top-left third anchors TOPLEFT with edge offsets").toBeTruthy();
  expect(JSON.stringify(anchor(1700, 20, 200, 40)) === JSON.stringify(["BOTTOMRIGHT", -20, 20]), "bottom-right third anchors BOTTOMRIGHT").toBeTruthy();
  expect(JSON.stringify(anchor(860, 520, 200, 40)) === JSON.stringify(["CENTER", 0, 0]), "the middle anchors CENTER").toBeTruthy();
  expect(JSON.stringify(anchor(860, 20, 200, 40)) === JSON.stringify(["BOTTOM", 0, 20]), "bottom middle anchors BOTTOM").toBeTruthy();
  // ns.Layout.Snap of a 100x20 rect next to one at (500, 300).
  const snap = (l, b) => addon.eval(`return { ns.Layout.Snap(${l}, ${b}, 100, 20, { { left = 500, bottom = 300, w = 100, h = 20 } }, 1920, 1080) }`);
  expect(JSON.stringify(snap(605, 250)) === JSON.stringify([600, 250]), "a left edge within 8 px snaps to another frame's right edge").toBeTruthy();
  expect(JSON.stringify(snap(700, 250)) === JSON.stringify([700, 250]), "nothing close, no snap").toBeTruthy();
  expect(JSON.stringify(snap(1000, 527)) === JSON.stringify([1000, 530]), "a center within 8 px snaps to the screen center").toBeTruthy();
});

it("unlock mode", () => {
  const addon = loggedIn(`
    UIParent:SetSize(1920, 1080)
    __a = CreateFrame("Frame", nil, UIParent); __a:SetSize(100, 20)
    __b = CreateFrame("Frame", nil, UIParent); __b:SetSize(100, 20)
    ns.Mover(__a, "a", "A", { "CENTER", "CENTER", 0, 0 })
    ns.Mover(__b, "b", "B", { "CENTER", "CENTER", 0, -100 })
  `);
  addon.slash("unlock");
  expect(addon.eval("return ns.GridLineCount()") === 94, "unlock shows a 32 px grid (61 + 33 lines on 1920x1080)").toBeTruthy();
  // Drops handle `key` with its bottom-left at (left, bottom).
  const drop = (key, left, bottom) =>
    addon.eval(`local h = ns.MoverHandleForTest("${key}"); h.__left, h.__bottom = ${left}, ${bottom}; h:GetScript("OnDragStop")(h)`);
  addon.eval(`function ns.MoverHandleForTest(k) for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == k then return w end end end`);
  addon.eval(`local h = ns.MoverHandleForTest("b"); h.__left, h.__bottom = 500, 300`);
  drop("a", 603, 900);
  // Mover a's saved [point, x, y].
  const saved = () => addon.eval("local p = ForeverUIDB.profiles.Default.positions.a; return { p.point, p.x, p.y }");
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -310, -160]), `a drop snaps to the other handle and anchors to the nearest edge (got ${JSON.stringify(saved())})`).toBeTruthy();
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnMouseDown")(h)`);
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "LEFT")`);
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -160]), "the arrow keys nudge the selected handle 1 px").toBeTruthy();
  addon.eval(`IsShiftKeyDown = function() return true end; local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "UP")`);
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -150]), "Shift nudges 10 px").toBeTruthy();
  expect(/TOP -311, -150/.test(addon.eval(`return ns.MoverHandleForTest("a").label:GetText()`)), "the selected handle shows its point and offsets").toBeTruthy();
  addon.slash("grid 64");
  expect(addon.eval("return ns.GridLineCount()") === 48, "/fui grid 64 redraws the grid (31 + 17)").toBeTruthy();
  addon.slash("grid off");
  expect(addon.eval("return ns.GridLineCount()") === 0, "/fui grid off hides it").toBeTruthy();
  addon.slash("snap off");
  drop("a", 603, 900);
  expect(saved()[0] === "TOP" && saved()[1] === -307, `with snapping off, the drop stays where it was (got ${JSON.stringify(saved())})`).toBeTruthy();
  addon.slash("lock");
  expect(addon.eval(`return ns.MoverHandleForTest("a"):IsShown()`) === false, "/fui lock hides the handles").toBeTruthy();
});

it("accent presets", () => {
  const addon = loggedIn();
  addon.slash("accent void");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.void[1]") === true, "/fui accent void sets the void preset").toBeTruthy();
  addon.slash("accent blue");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "the old preset names still work (blue is arcane)").toBeTruthy();
  addon.slash("accent #3D9EFF");
  expect(Math.abs(addon.eval("return select(3, ns.Theme.Accent())") - 1) < 1e-9, "hex accents still work").toBeTruthy();
});

it("slash", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /unlock \| lock/), "/fui help lists commands").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /profile Default/), "/fui status shows the profile").toBeTruthy();
  addon.slash("profile Raid");
  expect(addon.eval("return ForeverUICharDB.profile") === "Raid", "/fui profile switches this character's profile").toBeTruthy();
  addon.clearChat();
  addon.slash("bogus");
  expect(chatHas(addon, /Unknown command/), "unknown commands say so").toBeTruthy();
});

// TEST-ONLY units. A secret is a table: Lua errors on arithmetic or
// comparison with it, so any math the addon did on a secret would fail here.
const UNITS_ENV = `
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

// A frame's state for the unit-frame tests.
const ufState = (addon, key) => addon.eval(`
  local f = ForeverUI_${key}
  return { shown = f:IsShown(), watched = f.__watched == true, unit = f:GetAttribute("unit"),
    type1 = f:GetAttribute("*type1"), type2 = f:GetAttribute("*type2"),
    hp = f.health.__value, max = f.health.__max, color = f.health.__barColor,
    power = f.power.__value, powerColor = f.power.__barColor,
    name = f.name:GetText(), text = f.healthText:GetText() }`);

// Saved variables with the raid frames module off (so UnitFrames builds its own party frames).
const NO_RAID = { savedVariables: "ForeverUIDB = { profiles = { Default = { modules = { RaidFrames = false } } } }" };

it("unit frames", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const player = ufState(addon, "player");
  expect(player.unit === "player" && player.type1 === "target" && player.type2 === "togglemenu", "player frame is a secure unit button").toBeTruthy();
  expect(player.hp === 900 && player.max === 1000 && player.text === "900", "player health bar and text").toBeTruthy();
  expect(player.color[0] === 0.25 && player.color[2] === 0.92, "players get their class color").toBeTruthy();
  expect(player.power === 50 && isTok(addon, player.powerColor, "mana"), "power bar value and mana color").toBeTruthy();
  expect(player.name === "<name>" && !player.watched, "player name; player frame is always shown").toBeTruthy();
  const target = ufState(addon, "target");
  expect(target.watched, "target frame shows and hides with its unit").toBeTruthy();
  expect(target.hp?.__secret && target.max?.__secret, "secret health goes to the bar untouched").toBeTruthy();
  expect(target.text?.__secret, "secret health text comes from the client's formatter").toBeTruthy();
  expect(isTok(addon, target.color, "hostile"), "hostile units are red").toBeTruthy();
  expect(ufState(addon, "party1").text === "Dead", "dead units say Dead").toBeTruthy();
  const hidden = addon.eval("return { parentShown = PlayerFrame:GetParent():IsShown(), events = PlayerFrame:IsEventRegistered('UNIT_HEALTH') }");
  expect(hidden.parentShown === false && hidden.events === false, "the Blizzard player frame is hidden and silenced").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(["uf_player", "uf_target", "uf_targettarget", "uf_focus", "uf_pet", "uf_party1"].every((k) => movers.includes(k)), "every frame group is movable").toBeTruthy();
});

it("unit frame events", () => {
  const addon = loggedIn(UNITS_ENV);
  addon.eval("__units.player.hp = 400");
  addon.fire("UNIT_HEALTH", "player");
  expect(ufState(addon, "player").hp === 400, "UNIT_HEALTH updates the bar").toBeTruthy();
  addon.eval('__units.focus = { name = "TEST-ONLY Focus", hp = 10, maxhp = 20, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }');
  addon.fire("PLAYER_FOCUS_CHANGED");
  const focus = ufState(addon, "focus");
  expect(focus.name === "TEST-ONLY Focus" && isTok(addon, focus.color, "friendly"), "focus change fills the focus frame; friendly is green").toBeTruthy();
  addon.eval('__units.targettarget = { name = "TEST-ONLY ToT", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" }');
  addon.update(0.25);
  expect(ufState(addon, "targettarget").name === "TEST-ONLY ToT", "target of target refreshes on a timer").toBeTruthy();
});

it("unit frames wait for combat", () => {
  const addon = createAddon();
  addon.eval(UNITS_ENV + "__wfgStub.inCombat = true");
  addon.login();
  expect(addon.eval("return ForeverUI_player") === null, "no secure frames are built in combat").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return ForeverUI_player ~= nil") === true, "they are built when combat ends").toBeTruthy();
});

// TEST-ONLY action slots and bindings. Slot 3's cooldown is secret.
const ACTIONS_ENV = `
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
  ClearOverrideBindings = function() __overrides = {} end
  SetOverrideBindingClick = function(_, _, key, name, button) __overrides[key] = name .. ":" .. button end
  RegisterStateDriver = function(frame, state, driver) frame.__states = frame.__states or {}; frame.__states[state] = driver end
  MainMenuBar = CreateFrame("Frame", "MainMenuBar", UIParent)
`;

// One action button's state.
const button = (addon, bar, i) => addon.eval(`
  local b = ForeverUI_Bar${bar}Button${i}
  return { action = b:GetAttribute("action"), type = b:GetAttribute("type"), icon = b.icon.__texture,
    shown = b.icon:IsShown(), count = b.count:GetText(), hotkey = b.hotkey:GetText(),
    color = b.icon.__vertexColor, checked = b:GetChecked(), cooldown = b.cooldown.__cooldown }`);

it("action bars", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const bars = addon.eval("local out = {} for n = 1, 8 do out[n] = _G['ForeverUI_Bar' .. n] ~= nil end return out");
  expect(JSON.stringify(bars) === JSON.stringify([true, true, true, false, false, false, false, false]), "bars 1-3 on by default; the right-edge bars 4-5 and bars 6-8 off").toBeTruthy();
  const b1 = button(addon, 1, 1);
  expect(b1.type === "action" && b1.action === 1 && b1.icon === "TEST-ONLY-A", "bar 1 button 1 is secure action slot 1 with its icon").toBeTruthy();
  expect(b1.hotkey === "1" && b1.checked === true, "hotkey text; the current action is checked").toBeTruthy();
  const b2 = button(addon, 1, 2);
  expect(b2.hotkey === "S2" && b2.count === "5", "SHIFT-2 shows as S2; counts above 1 show").toBeTruthy();
  expect(b2.color[2] === 1 && b2.color[0] === 0.4, "out of power tints blue").toBeTruthy();
  const b3 = button(addon, 1, 3);
  expect(b3.color[0] === 0.4 && b3.color[2] === 0.4, "unusable dims gray").toBeTruthy();
  expect(b3.cooldown[0]?.__secret && b3.cooldown[1]?.__secret, "a secret cooldown goes to the widget untouched").toBeTruthy();
  expect(button(addon, 1, 4).shown === false, "an empty slot hides its icon").toBeTruthy();
  expect(button(addon, 2, 1).action === 61 && button(addon, 2, 1).hotkey === "CM4", "bar 2 is slots 61-72 on MULTIACTIONBAR1; CTRL-BUTTON4 shows CM4").toBeTruthy();
  const o = addon.eval("return __overrides");
  expect(o["1"] === "ForeverUI_Bar1Button1:LeftButton" && o["SHIFT-2"] === "ForeverUI_Bar1Button2:LeftButton", "default bindings click the ForeverUI buttons").toBeTruthy();
  expect(o["CTRL-BUTTON4"] === "ForeverUI_Bar2Button1:LeftButton", "bar 2 bindings too").toBeTruthy();
  expect(/\[vehicleui\]/.test(addon.eval("return ForeverUI_Bar1.__states.page")), "bar 1 has a secure page driver").toBeTruthy();
  expect(addon.eval("return ForeverUI_Bar2.__states.page") === null, "other bars don't page").toBeTruthy();
  expect(addon.eval("return MainMenuBar:GetParent():IsShown()") === false, "the default main bar is hidden").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(["bar1", "bar2", "bar3"].every((k) => movers.includes(k)), "every bar is movable").toBeTruthy();
});

// Each action bar's default y offset (bottom-center stack), bars 1-8; null when off or not stacked.
const stackY = (addon) => addon.eval(`local out = {}
  for n = 1, 8 do
    local point, _, _, y = ns.MoverPoint("bar" .. n)
    out[n] = point == "BOTTOM" and y or false
  end
  return out`);

it("reagent and item counts show even at 0 and 1", () => {
  const addon = loggedIn(ACTIONS_ENV + `
    __actions[1].count = 0 __actions[1].reagent = true
    __actions[2].count = 1 __actions[2].stack = true
    __actions[3].count = 1
    __actions[4] = { tex = "TEST-ONLY-D", count = 0, usable = true, reagent = { __secret = true } }
    IsConsumableAction = function(slot) return (__actions[slot] or {}).reagent end
    IsStackableAction = function(slot) return (__actions[slot] or {}).stack == true end`);
  // The count text on bar 1's button n.
  const count = (n) => addon.eval(`return ForeverUI_Bar1Button${n}.count:GetText()`);
  expect(count(1), "a spell out of its reagent shows 0").toBe("0");
  expect(count(2), "the last potion shows 1").toBe("1");
  expect(count(3), "a plain action with one charge shows nothing").toBe("");
  expect(count(4), "a hidden answer counts as not used up").toBe("");
});

it("action bars stack with bar 1 on top", () => {
  const addon = loggedIn(ACTIONS_ENV);
  expect(JSON.stringify(stackY(addon)) === JSON.stringify([124, 82, 40, false, false, false, false, false]), `bar 3 at the bottom, bar 1 on top (got ${JSON.stringify(stackY(addon))})`).toBeTruthy();
  const six = loggedIn(ACTIONS_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { ActionBars = { bars = { [6] = { enabled = true } } } } } }" });
  const y6 = stackY(six);
  expect(y6[5] === 40 && y6[2] === 82 && y6[0] === 166, `turning on bar 6 puts it underneath; bar 1 stays on top (got ${JSON.stringify(y6)})`).toBeTruthy();
});

it("action bar stack follows button size and rows", () => {
  const big = loggedIn(ACTIONS_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { ActionBars = { size = 44 } } } }" });
  expect(JSON.stringify(stackY(big).slice(0, 3)) === JSON.stringify([140, 90, 40]), "bigger buttons stack without overlapping").toBeTruthy();
  const two = loggedIn(ACTIONS_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { ActionBars = { bars = { [3] = { perRow = 6 } } } } } }" });
  expect(JSON.stringify(stackY(two).slice(0, 3)) === JSON.stringify([164, 122, 40]), "a two-row bar pushes the bars above it up by its height").toBeTruthy();
});

it("a moved action bar keeps its spot until reset", () => {
  const moved = loggedIn(ACTIONS_ENV, { savedVariables: 'ForeverUIDB = { profiles = { Default = { positions = { bar1 = { point = "BOTTOM", relPoint = "BOTTOM", x = 0, y = 40 } } } } }' });
  expect(stackY(moved)[0] === 40, "a position you saved wins").toBeTruthy();
  moved.slash("reset all");
  expect(stackY(moved)[0] === 124, "/fui reset all puts bar 1 back on top").toBeTruthy();
});

it("the bottom stack follows per-bar size and rows, live", () => {
  const addon = loggedIn(ACTIONS_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { ActionBars = { bars = { [2] = { size = 48 } } } } } }" });
  expect(JSON.stringify(stackY(addon).slice(0, 3)) === JSON.stringify([136, 82, 40]), `a bar's own button size sets its row height (got ${JSON.stringify(stackY(addon))})`).toBeTruthy();
  // Bar n's frame: its bottom offset on screen.
  const frameY = (n) => addon.eval(`return ForeverUI_Bar${n}.__points.BOTTOM.y`);
  addon.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[3].perRow = 6 AB.SettingChanged(3, "perRow")');
  expect(JSON.stringify(stackY(addon).slice(0, 3)) === JSON.stringify([176, 122, 40]) && frameY(1) === 176 && frameY(2) === 122, "changing a bar's buttons per row re-stacks at once: bar 1 stays on top, nothing overlaps").toBeTruthy();
  setCombat(addon, true);
  addon.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[3].size = 48 AB.SettingChanged(3, "size")');
  expect(frameY(1) === 176, "in combat the stack waits (secure frames don't move)").toBeTruthy();
  setCombat(addon, false);
  expect(frameY(2) === 146 && frameY(1) === 200, "and re-stacks when combat ends").toBeTruthy();
  addon.eval('ns.SetMoverPoint("bar1", "BOTTOM", "BOTTOM", 0, 300) ns.Unlock() local AB = ns.GetModule("ActionBars") AB.settings.bars[3].perRow = 12 AB.SettingChanged(3, "perRow") ns.SetMoverDefault("TEST-ONLY missing", { "CENTER", "CENTER", 0, 0 })');
  expect(frameY(1) === 300 && frameY(2) === 94, "a bar you dragged keeps its spot; the others re-stack (with unlock mode on)").toBeTruthy();
  addon.eval("ns.Lock()");
});

it("action bar paging and events", () => {
  const addon = loggedIn(ACTIONS_ENV);
  // Run the secure page snippet the way the client would, with a minimal restricted env.
  addon.eval(`
    local bar = ForeverUI_Bar1
    local snippet = assert(loadstring and loadstring(ns.GetModule("ActionBars").ON_PAGE) or load(ns.GetModule("ActionBars").ON_PAGE, "page", "t", setmetatable({}, { __index = _G })))
    local kids = {}
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == bar then kids[#kids + 1] = w end end
    local env = { self = { SetAttribute = function() end, GetChildren = function() return unpack(kids) end }, newstate = 7, ipairs = ipairs, newtable = function(...) return { ... } end }
    if setfenv then setfenv(snippet, env) else snippet = load(ns.GetModule("ActionBars").ON_PAGE, "page", "t", env) end
    snippet()`);
  const paged = button(addon, 1, 1);
  expect(paged.action === 73 && paged.icon === "TEST-ONLY-PAGE7", "page 7 re-points button 1 to slot 73 and it refreshes").toBeTruthy();
  addon.eval('__actions[61] = { tex = "TEST-ONLY-NEW", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 61);
  expect(button(addon, 2, 1).icon === "TEST-ONLY-NEW", "ACTIONBAR_SLOT_CHANGED refreshes that slot").toBeTruthy();
  addon.eval('__binds.ACTIONBUTTON3 = { "Q" }');
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("UPDATE_BINDINGS");
  expect(addon.eval("return __overrides.Q") === null, "binding changes wait for combat to end").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return __overrides.Q") === "ForeverUI_Bar1Button3:LeftButton" && button(addon, 1, 3).hotkey === "Q", "then they apply").toBeTruthy();
});

it("action bar dragging", () => {
  const addon = loggedIn(ACTIONS_ENV);
  // Starts a drag on bar 1 button 2; returns the slot picked up, if any.
  const drag = () => addon.eval("local b = ForeverUI_Bar1Button2; b:GetScript('OnDragStart')(b); return __picked");
  expect(drag() === null, "locked buttons don't drag without Shift").toBeTruthy();
  addon.eval("IsShiftKeyDown = function() return true end");
  expect(drag() === 2, "Shift-drag picks the action up").toBeTruthy();
  addon.eval("local b = ForeverUI_Bar2Button5; b:GetScript('OnReceiveDrag')(b)");
  expect(addon.eval("return __placed") === 65, "dropping onto a button places the action in its slot").toBeTruthy();
});

// TEST-ONLY: runs the setter of bar n's row `label` on the action bar options page,
// as its control would, with a Lua value; false when there is no such row.
const setBarOption = (addon, n, label, lua) => addon.eval(`
  local page, card
  for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then page = p end end
  for _, row in ipairs(page.rows()) do
    if row[1] == "header" then card = row[2] end
    if card and card:match("^Bar ${n}") and row[2] == ${JSON.stringify(label)} then row[#row](${lua}) return true end
  end
  return false`);

// TEST-ONLY: what the getter of bar n's row `label` on the action bar options page says.
const getBarOption = (addon, n, label) => addon.eval(`
  local page, card
  for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then page = p end end
  for _, row in ipairs(page.rows()) do
    if row[1] == "header" then card = row[2] end
    if card and card:match("^Bar ${n}") and row[2] == ${JSON.stringify(label)} then return row[#row - 1]() end
  end`);

// Bar 2's secure visibility driver, alpha, and whether it takes the mouse.
const barVis = (addon, n = 2) => addon.eval(`local bar = ForeverUI_Bar${n}
  return { driver = bar.__states.visibility, alpha = bar:GetAlpha(), mouse = bar.__mouse }`);

it("action bar visibility: each mode's state driver and mouseover alpha", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const start = barVis(addon);
  expect(start.driver === "show" && start.alpha === 1 && start.mouse === false, "a bar shown always: driver show, full alpha, doesn't take the mouse").toBeTruthy();
  const modes = { mouseover: "show", combat: "[combat] show; hide", hidden: "hide", always: "show" };
  for (const [mode, driver] of Object.entries(modes)) {
    expect(setBarOption(addon, 2, "Visibility", JSON.stringify(mode)), `the Visibility row sets ${mode}`).toBeTruthy();
    expect(barVis(addon).driver === driver, `${mode} registers the secure state driver "${driver}" (got ${barVis(addon).driver})`).toBeTruthy();
  }
  setBarOption(addon, 2, "Visibility", '"mouseover"');
  expect(barVis(addon).alpha === 0 && barVis(addon).mouse === true, "a mouseover bar starts faded out and takes the mouse").toBeTruthy();
  // TEST-ONLY: count every Show, Hide and SetShown on bar 2 from here on.
  addon.eval("__shows = 0 local bar = ForeverUI_Bar2 bar.Show = function() __shows = __shows + 1 end bar.Hide = bar.Show bar.SetShown = bar.Show");
  setCombat(addon, true);
  addon.eval("local b = ForeverUI_Bar2Button3 b:GetScript('OnEnter')(b)");
  expect(barVis(addon).alpha === 1, "hovering a button fades the bar in, in combat too").toBeTruthy();
  addon.eval("ForeverUI_Bar2.__mouseOver = true local b = ForeverUI_Bar2Button3 b:GetScript('OnLeave')(b)");
  expect(barVis(addon).alpha === 1, "moving off a button while still over the bar keeps it shown").toBeTruthy();
  addon.eval("ForeverUI_Bar2.__mouseOver = false local bar = ForeverUI_Bar2 bar:GetScript('OnLeave')(bar)");
  expect(barVis(addon).alpha === 0, "leaving the bar fades it out").toBeTruthy();
  addon.eval("local bar = ForeverUI_Bar2 bar:GetScript('OnEnter')(bar)");
  expect(barVis(addon).alpha === 1 && addon.eval("return __shows") === 0, "mouseover only changes alpha: never Show, Hide or SetShown").toBeTruthy();
  setBarOption(addon, 2, "Visibility", '"combat"');
  expect(barVis(addon).driver === "show", "a visibility change made in combat waits").toBeTruthy();
  setCombat(addon, false);
  expect(barVis(addon).driver === "[combat] show; hide", "and applies when combat ends").toBeTruthy();
  addon.eval('ForeverUIDB.profiles.Default.ActionBars.bars[2].visibility = "TEST-ONLY-unknown" ns.GetModule("ActionBars").ApplyVisibility(2)');
  expect(barVis(addon).driver === "show" && barVis(addon).alpha === 1, "an unknown visibility counts as Always").toBeTruthy();
});

it("action bar empty slots hide until the grid shows", () => {
  const addon = loggedIn(ACTIONS_ENV + '__actions[5] = { tex = { __secret = true }, count = 0, usable = true }');
  // Button i of bar n's alpha.
  const alpha = (n, i) => addon.eval(`return ForeverUI_Bar${n}Button${i}:GetAlpha()`);
  expect(alpha(1, 1) === 1 && alpha(1, 4) === 0 && alpha(2, 2) === 0, "buttons with an action show; empty slots are invisible (no empty squares at level 1)").toBeTruthy();
  expect(alpha(1, 5) === 1, "a secret icon counts as an action").toBeTruthy();
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(alpha(1, 4) === 1 && alpha(2, 2) === 1, "picking up a spell or item (ACTIONBAR_SHOWGRID) shows the empty slots").toBeTruthy();
  addon.eval('__actions[4] = { tex = "TEST-ONLY-DROPPED", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(alpha(1, 4) === 1 && alpha(1, 6) === 0 && alpha(2, 2) === 0, "dropping it (ACTIONBAR_HIDEGRID) hides the empty slots again; the filled one stays").toBeTruthy();
  setCombat(addon, true);
  addon.eval("ForeverUI_Bar1Button2:SetAttribute('action', 74)");
  expect(alpha(1, 2) === 0, "a slot that turns empty when bar 1 pages in combat hides at once (alpha, no waiting)").toBeTruthy();
});

it("the right-edge bars start off and show on mouseover when turned on", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const s = addon.eval("local b = ForeverUIDB.profiles.Default.ActionBars.bars return { b[4].enabled, b[5].enabled, b[4].visibility, b[5].visibility }");
  expect(s[0] === false && s[1] === false && addon.eval("return ForeverUI_Bar4 == nil and ForeverUI_Bar5 == nil") === true, "bars 4 and 5 start off; nothing is built for them").toBeTruthy();
  expect(s[2] === "mouseover" && s[3] === "mouseover" && getBarOption(addon, 4, "Visibility") === "mouseover", "and are set to On mouseover for when they are turned on").toBeTruthy();
  const titles = addon.eval('local out = {} for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then for _, r in ipairs(p.rows()) do if r[1] == "header" then out[#out + 1] = r[2] end end end end return out');
  expect(titles.includes("Bar 4, right edge") && titles.includes("Bar 5, right edge") && titles.includes("Bar 1"), `each bar has its own card; the right-edge ones say so (got ${titles})`).toBeTruthy();
  expect(setBarOption(addon, 4, "Show bar 4", "true") && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[4].enabled") === true, "Show bar 4 turns it on (after a reload)").toBeTruthy();
  const saved4 = addon.eval("local b = ForeverUIDB.profiles.Default.ActionBars.bars[4] return { b.enabled, b.visibility, b.buttons, b.perRow }");
  expect(JSON.stringify(saved4) === JSON.stringify([true, "mouseover", 12, 1]), `a fresh enable is saved with On mouseover (got ${JSON.stringify(saved4)})`).toBeTruthy();
  const on = loggedIn(ACTIONS_ENV, { savedVariables: 'ForeverUIDB = { profiles = { Default = { ActionBars = { bars = { [4] = { enabled = true, visibility = "mouseover", buttons = 12, perRow = 1 } } } } } }' });
  const bar4 = barVis(on, 4);
  expect(bar4.driver === "show" && bar4.alpha === 0 && bar4.mouse === true, "turned on, bar 4 is faded out until the mouse is over it").toBeTruthy();
  const second = on.eval("local _, _, _, x, y = ForeverUI_Bar4Button2:GetPoint(1) return { x, y }");
  expect(second[0] === 0 && second[1] === -40, "one button per row, as before").toBeTruthy();
});

// TEST-ONLY profile saved before bars had a visibility setting: bar 4 was on
// (the old default), bar 5 had been turned off.
const OLD_BARS_PROFILE = `ForeverUIDB = { profiles = { Default = { ActionBars = { size = 36, spacing = 4, bars = {
  { enabled = true, buttons = 12, perRow = 12 }, { enabled = true, buttons = 12, perRow = 12 }, { enabled = true, buttons = 12, perRow = 12 },
  { enabled = true, buttons = 12, perRow = 1 }, { enabled = false, buttons = 12, perRow = 1 },
  { enabled = false, buttons = 12, perRow = 12 }, { enabled = false, buttons = 12, perRow = 12 }, { enabled = false, buttons = 12, perRow = 12 } } } } } }`;

it("an old profile keeps its right-edge bar on Always; a fresh enable gets On mouseover", () => {
  const old = loggedIn(ACTIONS_ENV, { savedVariables: OLD_BARS_PROFILE });
  const bar4 = barVis(old, 4);
  expect(bar4.driver === "show" && bar4.alpha === 1 && bar4.mouse === false, "bar 4, already on in the old profile, still shows always").toBeTruthy();
  expect(getBarOption(old, 4, "Visibility") === "always" && getBarOption(old, 2, "Visibility") === "always", "its Visibility reads Always; so do the other bars").toBeTruthy();
  expect(getBarOption(old, 5, "Visibility") === "mouseover", "bar 5, off in the old profile, is set to On mouseover for when it is turned on").toBeTruthy();
  setBarOption(old, 5, "Show bar 5", "true");
  // Each read goes through ns.Settings, so the upgrade runs again on what is now saved.
  const saved5 = old.eval("local b = ForeverUIDB.profiles.Default.ActionBars.bars[5] return { b.enabled, b.visibility }");
  expect(saved5[0] === true && saved5[1] === "mouseover" && getBarOption(old, 5, "Visibility") === "mouseover", "turning bar 5 on fresh saves On mouseover, and the upgrade leaves it (it has a saved visibility)").toBeTruthy();
  expect(getBarOption(old, 4, "Visibility") === "always", "bar 4 stays Always").toBeTruthy();
  // A new profile's fresh enable is checked in "the right-edge bars start off and show on mouseover when turned on".
});

it("In combat bars show during a drag out of combat; a drag that starts in combat leaves secure visibility alone", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setBarOption(addon, 2, "Visibility", '"combat"');
  // TEST-ONLY: count every state driver registration from here on.
  addon.eval("__regs = 0 local register = RegisterStateDriver RegisterStateDriver = function(...) __regs = __regs + 1 return register(...) end");
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(barVis(addon).driver === "show" && barVis(addon, 3).driver === "show", "picking up a spell out of combat shows the In combat bar").toBeTruthy();
  expect(addon.eval("return __regs") === 1, "only the In combat bar's driver changes").toBeTruthy();
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).driver === "[combat] show; hide", "dropping it restores the bar's own driver").toBeTruthy();
  addon.eval("__regs = 0");
  setCombat(addon, true);
  addon.fire("ACTIONBAR_SHOWGRID");
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(addon.eval("return __regs") === 0 && addon.eval("return ns.QueuedCount()") === 0, "a drag that starts in combat changes no driver and queues nothing").toBeTruthy();
  setCombat(addon, false);
  expect(addon.eval("return __regs") === 0 && barVis(addon).driver === "[combat] show; hide", "not even after combat ends").toBeTruthy();
  addon.fire("ACTIONBAR_SHOWGRID");
  setCombat(addon, true);
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).driver === "show" && addon.eval("return ns.QueuedCount()") === 1, "a drag that ends after combat starts restores the driver once combat ends").toBeTruthy();
  setCombat(addon, false);
  expect(barVis(addon).driver === "[combat] show; hide", "and then it does").toBeTruthy();
});

it("mouseover bars are revealed during a drag and restored after", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setBarOption(addon, 2, "Visibility", '"mouseover"');
  // TEST-ONLY: count every Show, Hide and SetShown on bar 2 from here on.
  addon.eval("__shows = 0 local bar = ForeverUI_Bar2 bar.Show = function() __shows = __shows + 1 end bar.Hide = bar.Show bar.SetShown = bar.Show");
  setCombat(addon, true);
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(barVis(addon).alpha === 1, "picking up a spell reveals the mouseover bar, in combat too").toBeTruthy();
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).alpha === 0, "dropping it fades the bar out again").toBeTruthy();
  addon.fire("ACTIONBAR_SHOWGRID");
  addon.eval("ForeverUI_Bar2.__mouseOver = true");
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).alpha === 1, "unless the mouse is still over the bar").toBeTruthy();
  expect(addon.eval("return __shows") === 0 && addon.eval("return ns.QueuedCount()") === 0 && barVis(addon).driver === "show", "alpha only: no Show or Hide, nothing queued, driver unchanged").toBeTruthy();
});

it("Hidden bar bindings stay intact", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setBarOption(addon, 2, "Visibility", '"hidden"');
  expect(barVis(addon).driver === "hide", "a Hidden bar isn't drawn").toBeTruthy();
  expect(addon.eval("return __overrides['CTRL-BUTTON4']") === "ForeverUI_Bar2Button1:LeftButton", "but its key still clicks its button").toBeTruthy();
  addon.fire("UPDATE_BINDINGS");
  expect(addon.eval("return __overrides['CTRL-BUTTON4']") === "ForeverUI_Bar2Button1:LeftButton", "also after the bindings are rebuilt").toBeTruthy();
  const help = addon.eval('local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then page = p end end local rows = page.rows() for i, r in ipairs(rows) do if r[2] == "Visibility" then return rows[i + 1] end end');
  expect(help[0] === "text" && /keys.*still casts/.test(help[1]), `the Visibility row's help text says so (got ${JSON.stringify(help)})`).toBeTruthy();
});

it("action bar layout: per-bar buttons, rows and size, deferred in combat", () => {
  const addon = loggedIn(ACTIONS_ENV + '__binds.MULTIACTIONBAR1BUTTON12 = { "F12" }');
  // Bar 2's size, button 7's offset and size, and whether button 12 shows.
  const lay = () => addon.eval(`local bar, b7 = ForeverUI_Bar2, ForeverUI_Bar2Button7
    local _, _, _, x, y = b7:GetPoint(1)
    return { w = bar:GetWidth(), h = bar:GetHeight(), x7 = x, y7 = y, size = b7:GetWidth(), shown12 = ForeverUI_Bar2Button12:IsShown() }`);
  const before = lay();
  expect(JSON.stringify(before) === JSON.stringify({ w: 476, h: 36, x7: 240, y7: 0, size: 36, shown12: true }), `bar 2 starts as one row of 12 at the shared 36 px (got ${JSON.stringify(before)})`).toBeTruthy();
  expect(getBarOption(addon, 2, "Button size") === 36 && addon.eval("return __overrides.F12") === "ForeverUI_Bar2Button12:LeftButton", "its size row reads the shared size; button 12 has its key").toBeTruthy();
  setCombat(addon, true);
  setBarOption(addon, 2, "Buttons per row", 6);
  setBarOption(addon, 2, "Buttons", 10);
  setBarOption(addon, 2, "Button size", 40);
  expect(JSON.stringify(lay()) === JSON.stringify(before) && addon.eval("return ns.QueuedCount()") === 3, "layout changes made in combat wait for it to end (secure frames)").toBeTruthy();
  setCombat(addon, false);
  const after = lay();
  expect(JSON.stringify(after) === JSON.stringify({ w: 260, h: 84, x7: 0, y7: -44, size: 40, shown12: false }), `then bar 2 is two rows of 6 at 40 px, showing 10 buttons (got ${JSON.stringify(after)})`).toBeTruthy();
  expect(addon.eval("return __overrides.F12") === null && getBarOption(addon, 2, "Button size") === 40, "a hidden button gives up its key; the bar keeps its own size").toBeTruthy();
  expect(addon.eval("return ForeverUI_Bar3Button1:GetWidth()") === 36, "other bars keep theirs").toBeTruthy();
});

// TEST-ONLY minimap, chat windows and combined bag, as the client would have them.
const UI_ENV = `
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

it("minimap", () => {
  const addon = loggedIn(UI_ENV);
  const mm = addon.eval(`return { parent = Minimap:GetParent():GetName(), mask = Minimap.__maskTexture,
    size = Minimap.__width, zone = ns.GetModule("Minimap").zone:GetText(), zoneColor = ns.GetModule("Minimap").zone.__textColor,
    border = MinimapCluster.BorderTop.__alpha, zoomIn = Minimap.ZoomIn.__alpha, shape = GetMinimapShape() }`);
  expect(mm.parent === "ForeverUI_Minimap" && mm.size === 180, "the minimap moves into the themed holder at 180 px").toBeTruthy();
  expect(mm.shape === "SQUARE", "GetMinimapShape tells other addons it is square").toBeTruthy();
  expect(mm.zone === "TEST-ONLY Vale" && isTok(addon, mm.zoneColor, "zoneContested"), "zone text on top, colored for contested").toBeTruthy();
  expect(mm.border === 0 && mm.zoomIn === 0, "border art and zoom buttons are faded").toBeTruthy();
  addon.update(0.25);
  expect(addon.eval('return ns.GetModule("Minimap").coords:GetText()') === "45.7, 12.3", "coordinates under the map").toBeTruthy();
  addon.eval("Minimap:GetScript('OnMouseWheel')(Minimap, 1)");
  expect(addon.eval("return Minimap:GetZoom()") === 1, "the mouse wheel zooms in").toBeTruthy();
  addon.eval("for _ = 1, 10 do Minimap:GetScript('OnMouseWheel')(Minimap, 1) end");
  expect(addon.eval("return Minimap:GetZoom()") === 5, "and stops at the last zoom level").toBeTruthy();
  addon.eval("C_Map.GetPlayerMapPosition = function() return { GetXY = function() return { __secret = true }, 0.5 end } end");
  addon.update(0.25);
  expect(addon.eval('return ns.GetModule("Minimap").coords:GetText()') === "", "secret or missing coordinates show nothing").toBeTruthy();
  expect(addon.eval("return ns.MoverList()[1] ~= nil") === true, "the minimap is movable").toBeTruthy();
});

it("chat", () => {
  const addon = loggedIn(UI_ENV);
  const c = addon.eval(`return { font = { ChatFrame1:GetFont() }, box = ns.Theme.PaintedCount(),
    tab1 = ChatFrame1Tab.Text.__textColor, tab2 = ChatFrame2Tab.Text.__textColor }`);
  expect(c.font[0] === "Interface\\AddOns\\ForeverUI\\Media\\Fonts\\FiraSansCondensed-Medium.ttf" && c.font[1] === 15, `chat windows get the theme font at their own size (got ${JSON.stringify(c.font)})`).toBeTruthy();
  expect(isTok(addon, c.tab2, "accent") && isTok(addon, c.tab1, "text2"), "the selected window's tab is accent, others gray").toBeTruthy();
  addon.slash("accent ember");
  expect(isTok(addon, addon.eval("return ChatFrame2Tab.Text.__textColor"), "accent"), "tabs follow accent changes").toBeTruthy();
});

it("bags", () => {
  const addon = loggedIn(UI_ENV);
  expect(addon.eval("return __cvars.combinedBags") === "1", "combined bags are turned on").toBeTruthy();
  addon.eval("ContainerFrameCombinedBags:Show()");
  const b = addon.eval("return { border = __item.IconBorder.__alpha, painted = ns.Theme.PaintedCount() }");
  expect(b.border === 0, "item slot art is faded when the bag opens").toBeTruthy();
  addon.eval("ContainerFrameCombinedBags:Hide(); ContainerFrameCombinedBags:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()") === b.painted, "reopening repaints, it doesn't pile up").toBeTruthy();
});

// TEST-ONLY numbers for the info strip: head slot 30%, legs 9% worn, 12 free slots, 12g 34s 7c.
const STRIP_ENV = `
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
const block = (addon, key) => addon.eval(`local fs = ns.GetModule("InfoStrip").texts.${key} return { shown = fs:IsShown(), text = fs:GetText(), color = fs.__textColor }`);

it("the info strip under the minimap", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV + CLICK_LUA);
  const dur = block(addon, "durability");
  expect(dur.text === "9%" && isTok(addon, dur.color, "bad"), "your most worn item, red at 10% or less").toBe(true);
  addon.eval("__dur[7] = { 50, 100 } __dur[1] = { 20, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(isTok(addon, block(addon, "durability").color, "warn"), "orange at 25% or less").toBe(true);
  addon.eval("__dur[1] = { 90, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(block(addon, "durability").text === "50%" && isTok(addon, block(addon, "durability").color, "text"), "plain above that").toBe(true);
  expect(block(addon, "bags").text, "free slots across the five bags").toBe("12 free");
  expect([block(addon, "system").text, block(addon, "gold").text, block(addon, "clock").text], "fps and latency, gold, the time").toEqual(["58 fps  64 ms", "12g 34s 7c", "21:04"]);
  expect(block(addon, "ammo").shown, "a mage carries no ammo").toBe(false);
  addon.eval("__fps = 30 __money = 507 __wfgStub.advance(1.1)");
  expect(block(addon, "system").text, "fps waits for the third second").toBe("58 fps  64 ms");
  addon.eval("__wfgStub.advance(2.2)");
  addon.fire("PLAYER_MONEY");
  expect([block(addon, "system").text, block(addon, "gold").text], "then updates; under a gold, no gold part").toEqual(["30 fps  64 ms", "5s 7c"]);
  addon.eval("C_Container.GetContainerNumFreeSlots = function() return 0 end");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(isTok(addon, block(addon, "bags").color, "bad"), "full bags are red").toBe(true);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Clock")') && block(addon, "clock").shown, "a block turns off at once").toBe(false);
  expect(addon.eval('return { ns.MoverPoint("infostrip") }'), "the strip is movable, under the minimap").toEqual(["TOPRIGHT", "TOPRIGHT", -12, -200]);
});

it("the info strip: ammo, and clients that can't answer", () => {
  const hunter = loggedIn(UNITS_ENV + STRIP_ENV + '__units.player.class = "HUNTER"');
  expect(block(hunter, "ammo").text, "a hunter's ammo").toBe("ammo 412");
  hunter.eval("__ammo = 0");
  hunter.fire("UNIT_INVENTORY_CHANGED", "player");
  expect(block(hunter, "ammo").text === "ammo 0" && isTok(hunter, block(hunter, "ammo").color, "bad"), "out of ammo is red").toBe(true);
  hunter.eval('__units.player.class = "WARRIOR"');
  hunter.fire("BAG_UPDATE_DELAYED");
  expect(block(hunter, "ammo").shown, "a warrior with none shows nothing").toBe(false);
  hunter.eval('UnitClass = function() return "x", { __secret = true } end');
  hunter.fire("BAG_UPDATE_DELAYED");
  expect(block(hunter, "ammo").shown, "a hidden class shows nothing").toBe(false);
  const bare = loggedIn(UNITS_ENV + "GetMoney = function() return { __secret = true } end");
  expect(["durability", "bags", "system", "gold", "clock"].map((k) => block(bare, k).shown), "no answer, no block").toEqual([false, false, false, false, false]);
});

// TEST-ONLY merchant: repairs for 50s; bag 0 holds a gray item, a gray with no value, and a white.
const MERCHANT_ENV = `
  __repairs, __used = {}, {}
  CanMerchantRepair = function() return __canRepair end
  __canRepair, __cost, __gold = true, 5000, 10000
  GetRepairAllCost = function() return __cost, true end
  GetMoney = function() return __gold end
  RepairAllItems = function(guild) __repairs[#__repairs + 1] = guild end
  __bag = { { quality = 0 }, { quality = 0, hasNoValue = true }, { quality = 1 }, { quality = { __secret = true } } }
  __sticky = 1
  C_Container = { GetContainerNumSlots = function(bag) return bag == 0 and 4 or 0 end,
    GetContainerItemInfo = function(bag, slot) return __bag[slot] end,
    UseContainerItem = function(bag, slot) __used[#__used + 1] = slot if __sticky > 0 then __sticky = __sticky - 1 else __bag[slot] = nil end end }
  C_Timer = { After = function(_, fn) fn() end }
  ERR_ABILITY_COOLDOWN = "TEST-ONLY not ready"
  UIErrorsFrame = CreateFrame("Frame", "UIErrorsFrame", UIParent) UIErrorsFrame:RegisterEvent("UI_ERROR_MESSAGE")
  function UIErrorsFrame:AddMessage(text) self.__lines = self.__lines or {} self.__lines[#self.__lines + 1] = text end
`;

it("at a merchant: repair with your own gold, sell junk", () => {
  const addon = loggedIn(MERCHANT_ENV);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __repairs"), "repairs with your own gold, not the guild's").toEqual([false]);
  expect(chatHas(addon, /Repaired for 50s 0c/) && chatHas(addon, /Selling 1 junk item/), "and says so").toBe(true);
  expect(addon.eval("return { __used, __bag[1] == nil }"), "the gray item is sold, tried again when the first try didn't take").toEqual([[1, 1], true]);
  addon.eval("__gold = 100 __repairs = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__repairs") === 0 && chatHas(addon, /Not enough gold to repair/), "no repair you can't pay for").toBe(true);
  addon.eval("__cost = 0");
  addon.fire("MERCHANT_SHOW");
  addon.eval("__canRepair = false");
  addon.fire("MERCHANT_SHOW");
  addon.eval("C_MerchantFrame = { SellAllJunkItems = function() __all = true end }");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __all"), "the client's own one-step sale where it has one").toBe(true);
  const off = loggedIn(MERCHANT_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Merchant = { repair = false, junk = false, errors = false } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return { #__repairs, #__used, UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE') }"), "each part can be turned off").toEqual([0, 0, true]);
  const bare = loggedIn("CanMerchantRepair = nil");
  bare.fire("MERCHANT_SHOW");
  expect(bare.eval("return ns.GetModule('Merchant').Noisy('x')"), "a client without these calls does nothing").toBe(false);
});

it("the error line drops what the action bar already shows", () => {
  const addon = loggedIn(MERCHANT_ENV);
  expect(addon.eval("return UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE')"), "ForeverUI takes over the error line").toBe(false);
  addon.fire("UI_ERROR_MESSAGE", 51, "TEST-ONLY not ready");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 53);
  expect(addon.eval("return UIErrorsFrame.__lines"), "noise is dropped, useful errors stay").toEqual(["TEST-ONLY Out of range"]);
  const none = loggedIn("UIErrorsFrame = nil");
  expect(none.eval("return ns.GetModule('Merchant').settings.errors"), "no error line on this client: nothing to take over").toBe(true);
});

it("a Sort button on the combined bag, where the client can sort", () => {
  const addon = loggedIn(UI_ENV + "C_Container = { SortBags = function() __sorted = true end }");
  expect(addon.eval('local b = ns.GetModule("Bags").sort b:GetScript("OnClick")(b) return __sorted'), "Sort sorts your bags").toBe(true);
  expect(loggedIn(UI_ENV).eval('return ns.GetModule("Bags").sort == nil'), "no sort call, no button").toBe(true);
});

it("range tint", () => {
  const polled = loggedIn(ACTIONS_ENV + "IsActionInRange = function(slot) if slot == 1 then return false end if slot == 3 then return { __secret = true } end return true end");
  expect(isTok(polled, button(polled, 1, 1).color, "outOfRange"), "out of range tints red (asked directly on clients without range events)").toBeTruthy();
  expect(button(polled, 1, 3).color[0] === 0.4, "a secret range answer never tints red").toBeTruthy();
  const evented = loggedIn(ACTIONS_ENV + "__rangeSlots = {} C_ActionBar = { EnableActionRangeCheck = function(slot, on) __rangeSlots[slot] = on end }");
  expect(evented.eval("return __rangeSlots[1]") === true, "clients with range events are asked to watch each slot").toBeTruthy();
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, true);
  expect(isTok(evented, button(evented, 1, 1).color, "outOfRange"), "ACTION_RANGE_CHECK_UPDATE out of range tints red").toBeTruthy();
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, true, true);
  expect(button(evented, 1, 1).color[0] === 1, "back in range, back to normal").toBeTruthy();
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, false);
  expect(button(evented, 1, 1).color[0] === 1, "an action without a range is never red").toBeTruthy();
});

// TEST-ONLY experience and a watched faction.
const DATA_ENV = `
  UnitXP = function() return 12300 end
  UnitXPMax = function() return 40000 end
  GetXPExhaustion = function() return 5000 end
  UnitLevel = function() return 42 end
  IsPlayerAtEffectiveMaxLevel = function() return __maxLevel == true end
  C_Reputation = { GetWatchedFactionData = function() return __faction end }
  __faction = { name = "TEST-ONLY Faction", reaction = 5, currentReactionThreshold = 3000, nextReactionThreshold = 9000, currentStanding = 4200 }
`;

// The data bars' state.
const bars = (addon) => addon.eval(`local x, r = ForeverUI_xpbar, ForeverUI_repbar
  return { xpShown = x:IsShown(), xp = x.__value, xpMax = x.__max, rested = x.rested.__width, xpText = x.text:GetText(), xpTextShown = x.text:IsShown(),
    repShown = r:IsShown(), rep = r.__value, repMax = r.__max, repColor = r.__barColor, repText = r.text:GetText() }`);

it("data bars", () => {
  const addon = loggedIn(DATA_ENV);
  const b = bars(addon);
  expect(b.xp === 12300 && b.xpMax === 40000 && Math.abs(b.rested - 476 * 17300 / 40000) < 1e-9, "XP bar with rested overlay out to XP + rested").toBeTruthy();
  expect(b.xpText === "Level 42  12.3K / 40.0K (30%)  rested 5.0K", `XP text (got ${b.xpText})`).toBeTruthy();
  expect(b.xpTextShown === false, "text shows on hover only by default").toBeTruthy();
  addon.eval("ForeverUI_xpbar:GetScript('OnEnter')(ForeverUI_xpbar)");
  expect(addon.eval("return ForeverUI_xpbar.text:IsShown()") === true, "hovering shows it").toBeTruthy();
  expect(b.rep === 1200 && b.repMax === 6000 && b.repColor[1] === 0.6, "reputation within the current standing, friendly green").toBeTruthy();
  expect(b.repText === "TEST-ONLY Faction  1.2K / 6.0K (20%)", `reputation text (got ${b.repText})`).toBeTruthy();
  addon.eval("__maxLevel = true; __faction = nil");
  addon.fire("PLAYER_XP_UPDATE");
  addon.fire("UPDATE_FACTION");
  const after = bars(addon);
  expect(after.xpShown === false && after.repShown === false, "XP hides at max level; reputation hides with nothing watched").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(movers.includes("xpbar") && movers.includes("repbar"), "both bars are movable").toBeTruthy();
});

it("profile strings", () => {
  const addon = loggedIn();
  const round = addon.eval(`
    local S = ns.Serialize
    local data = { a = 1, b = 2.5, c = -0.125, d = "quote \\" back \\\\ nl \\n tab \\t é", e = true, f = false,
      list = { 10, 20, { deep = "x" } }, [7] = "seven", fn = function() end }
    local text = S.Encode("profile", data)
    local scope, back = S.Decode(text)
    return { text = text, again = S.Encode("profile", data), scope = scope, back = back }`);
  expect(/^FUI1:profile:[0-9a-f]{4}:[A-Za-z0-9+/=]+$/.test(round.text), "FUI1:scope:checksum:base64").toBeTruthy();
  expect(round.text === round.again, "encoding is deterministic").toBeTruthy();
  const b = round.back;
  expect(round.scope === "profile" && b.a === 1 && b.b === 2.5 && b.c === -0.125 && b.e === true && b.f === false, "numbers and booleans round-trip").toBeTruthy();
  expect(b.d === 'quote " back \\ nl \n tab \t é', `strings with quotes, backslashes, control and UTF-8 bytes round-trip (got ${JSON.stringify(b.d)})`).toBeTruthy();
  expect(b.list[2].deep === "x" && b["7"] === "seven" && b.fn === undefined, "nested tables and number keys round-trip; functions are left out").toBeTruthy();
  // ns.Serialize.Decode on a Lua string expression: { scope, err }.
  const decode = (lua) => addon.eval(`local scope, err = ns.Serialize.Decode(${lua}) return { scope = scope, err = err }`);
  expect(/not a ForeverUI/.test(decode('"hello"').err), "rejects other text").toBeTruthy();
  expect(/cut off/.test(decode(`${JSON.stringify(round.text.slice(0, -4))}`).err), "rejects a truncated string").toBeTruthy();
  const code = addon.eval(`local S = ns.Serialize local body = S.Base64("os.exit()") return "FUI1:profile:" .. S.Checksum(body) .. ":" .. body`);
  expect(/can't be read/.test(decode(JSON.stringify(code)).err), "text that isn't settings (e.g. code) is refused, never run").toBeTruthy();
});

it("export and import", () => {
  const src = loggedIn();
  src.slash("accent ff8000");
  src.eval('ns.Profile().positions = { uf_player = { point = "TOP", relPoint = "TOP", x = 1, y = -2 } }');
  src.slash("export");
  const text = src.eval("return ForeverUI_TextEdit:GetText()");
  expect(text.startsWith("FUI1:profile:") && src.eval("return ForeverUI_TextDialog:IsShown()"), "/fui export shows the string, selected to copy").toBeTruthy();
  const dst = loggedIn();
  dst.slash("import");
  dst.eval(`ForeverUI_TextEdit:SetText(${JSON.stringify(text)}); ForeverUI_TextDialog.primary:GetScript("OnClick")(ForeverUI_TextDialog.primary)`);
  expect(dst.eval("return ForeverUICharDB.profile") === "Imported", "a whole-profile import becomes a new profile this character uses").toBeTruthy();
  expect(dst.eval("return ForeverUIDB.profiles.Imported.positions.uf_player.x") === 1 && dst.eval("return ForeverUIDB.profiles.Imported.theme.accent[1]") === 1, "with every setting").toBeTruthy();
  expect(dst.eval("return ForeverUI_Reload:IsShown()") && /Reload/.test(dst.eval("return ForeverUI_Reload.accept.text:GetText()")), "and a reload is offered").toBeTruthy();
  dst.eval('ReloadUI = function() __reloaded = true end; ForeverUI_Reload.accept:GetScript("OnClick")(ForeverUI_Reload.accept)');
  expect(dst.eval("return __reloaded") === true, "Reload reloads the UI").toBeTruthy();
  const theme = src.eval('return ns.ExportProfile("theme")');
  dst.eval('ns.UseProfile("Default")');
  expect(/Imported theme settings/.test(dst.eval(`return ns.ImportProfile(${JSON.stringify(theme)})`)), "a module string imports into the active profile").toBeTruthy();
  expect(dst.eval("return ForeverUIDB.profiles.Default.theme.accent[1]") === 1 && dst.eval("return (ForeverUIDB.profiles.Default.positions or {}).uf_player") === null, "replacing only that module's settings").toBeTruthy();
  dst.clearChat();
  dst.eval('ns.AskText("x", function() end)');
  dst.slash("import");
  dst.eval('ForeverUI_TextEdit:SetText("garbage"); ForeverUI_TextDialog.primary:GetScript("OnClick")(ForeverUI_TextDialog.primary)');
  expect(chatHas(dst, /Import failed: not a ForeverUI profile string/), "a bad paste says why").toBeTruthy();
});

it("profile management", () => {
  const addon = loggedIn();
  addon.slash("profile new Raid");
  expect(addon.eval("return ForeverUIDB.profiles.Raid ~= nil") === true, "/fui profile new creates one").toBeTruthy();
  addon.slash("profile new Raid");
  expect(chatHas(addon, /taken or not allowed/), "names are unique").toBeTruthy();
  addon.eval("ForeverUIDB.profiles.Raid.theme = { accent = { 0, 1, 0 } }");
  addon.slash("profile copy Raid");
  expect(addon.eval("return ForeverUIDB.profiles.Default.theme.accent[2]") === 1, "/fui profile copy copies into the active profile").toBeTruthy();
  addon.slash("profile delete Default");
  expect(chatHas(addon, /Can't delete/), "the active profile can't be deleted").toBeTruthy();
  addon.slash("profile delete Raid");
  expect(addon.eval("return ForeverUIDB.profiles.Raid") === null, "others can").toBeTruthy();
  addon.slash("profile reset");
  expect(addon.eval("return ForeverUIDB.profiles.Default.theme") === null, "/fui profile reset clears the active profile").toBeTruthy();
  addon.slash("profile bad/name");
  expect(chatHas(addon, /1-32 letters/), "profile names are checked").toBeTruthy();
});

it("spec profiles", () => {
  const env = "GetSpecialization = function() return __spec end __spec = 2";
  const addon = loggedIn(env);
  addon.slash("profile new Healer");
  addon.eval('ForeverUIDB.profiles.Healer.theme = { accent = { 0, 1, 0 } }');
  addon.slash("spec Healer");
  expect(addon.eval("return ForeverUICharDB.specProfiles[2]") === "Healer", "/fui spec maps the current spec to a profile").toBeTruthy();
  const relog = createAddon({ savedVariables: 'ForeverUIDB = { version = 1, profiles = { Default = {}, Healer = { theme = { accent = { 0, 1, 0 } } } } }\nForeverUICharDB = { profile = "Default", specProfiles = { [2] = "Healer" } }' });
  relog.eval(env);
  relog.login();
  expect(relog.eval("return ForeverUICharDB.profile") === "Healer" && relog.eval("return select(2, ns.Theme.Accent())") === 1, "logging in as that spec uses its profile before modules load").toBeTruthy();
  relog.eval("__spec = 1; ForeverUICharDB.specProfiles[1] = 'Default'");
  relog.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(relog.eval("return ForeverUICharDB.profile") === "Default" && relog.eval("return ForeverUI_Reload:IsShown()") === true, "changing spec switches profile and offers a reload").toBeTruthy();
  addon.slash("spec off");
  expect(addon.eval("return ForeverUICharDB.specProfiles[2]") === null, "/fui spec off stops switching").toBeTruthy();
});

// TEST-ONLY lookup: the shown control whose label or caption starts with a text, clicked.
const CLICK_LUA = `
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

it("options window", () => {
  const addon = loggedIn(CLICK_LUA + DATA_ENV + "GetSpecialization = function() return 1 end");
  addon.slash("");
  expect(addon.eval("return ForeverUI_Options:IsShown()") === true, "/fui opens the options window").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === false, "no reload button until something needs one").toBeTruthy();
  addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.fill and w.__parent and w.__parent.hex and w.__scripts.OnClick then __swatches = (__swatches or 0) + 1 if __swatches == 2 then w.__scripts.OnClick(w) end end end");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "the second swatch (arcane) sets the accent at once").toBeTruthy();
  expect(addon.eval('return __click("Snap to other frames")') && addon.eval("return ns.MoverOptions().snap") === false, "the snap check box turns snapping off").toBeTruthy();
  expect(addon.eval('return __click("Action bars")'), "the nav switches pages").toBeTruthy();
  expect(addon.eval('return __click("Show bar 6")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[6].enabled") === true, "check boxes change settings").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "a change that needs a reload shows the Reload button").toBeTruthy();
  expect(addon.eval('return __click("Visibility")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[1].visibility") === "mouseover", "cycle buttons step through choices").toBeTruthy();
  expect(addon.eval('return __click("Button size")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[1].size") === 38, "a bar's size slider starts at the shared size and steps by 2").toBeTruthy();
  addon.eval('__click("Modules")');
  expect(addon.eval('return __click("UnitFrames")') && addon.eval("return ns.ModuleEnabled('UnitFrames')") === false, "modules can be turned off").toBeTruthy();
  addon.eval('__click("Profiles")');
  expect(addon.eval('return __click("Export profile")') && addon.eval("return ForeverUI_TextEdit:GetText():sub(1, 5)") === "FUI1:", "Export profile shows the string").toBeTruthy();
  expect(addon.eval('return __click("Use this profile for this spec")') && addon.eval("return ForeverUICharDB.specProfiles[1]") === "Default", "the spec button maps this spec").toBeTruthy();
  addon.eval('ReloadUI = function() __reloaded = true end; ForeverUI_Options.reload:GetScript("OnClick")(ForeverUI_Options.reload)');
  expect(addon.eval("return __reloaded") === true, "Reload UI reloads").toBeTruthy();
  addon.slash("options");
  expect(addon.eval("return ForeverUI_Options:IsShown()") === false, "/fui options toggles it closed").toBeTruthy();
  addon.eval('ForeverUI_OnAddonCompartmentClick("ForeverUI", "RightButton")');
  expect(addon.eval("return ns.Unlocked()") === true, "right-clicking the addons button toggles moving frames").toBeTruthy();
  addon.eval('ForeverUI_OnAddonCompartmentClick("ForeverUI", "LeftButton")');
  expect(addon.eval("return ForeverUI_Options:IsShown()") === true, "left-clicking it opens the options").toBeTruthy();
});

// TEST-ONLY raid: three members; raid2 is you. The stub has no secure
// header, so tests create buttons the way the header would and call its setup.
const RAID_ENV = `
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
    local b = CreateFrame("Button", "ForeverUI_RaidUnitButton" .. i, ForeverUI_Raid, "SecureUnitButtonTemplate")
    ForeverUI_Raid.initialConfigFunction(ForeverUI_Raid, b:GetName())
    b:SetAttribute("unit", unit)
    return b
  end
`;

// One raid button's state.
const raidButton = (addon, i) => addon.eval(`local b = ForeverUI_RaidUnitButton${i}
  return { hp = b.health.__value, max = b.health.__max, color = b.health.__barColor, name = b.name:GetText(), role = b.role:GetText(), status = b.status:GetText() }`);

it("a unit event reaches only the tile showing that unit", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.eval(`__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")
    local RF = ns.GetModule("RaidFrames") local update, isUnit = RF.Update, UnitIsUnit
    __updates, __asked = {}, 0
    RF.Update = function(b, ...) __updates[#__updates + 1] = b:GetName() return update(b, ...) end
    UnitIsUnit = function(a, b) if b ~= "target" and b ~= "player" then __asked = __asked + 1 end return isUnit(a, b) end`);
  addon.fire("UNIT_HEALTH", "raid3");
  expect(addon.eval("return { __updates, __asked }"), "one tile is updated, and the client is never asked which tile shows raid3").toEqual([["ForeverUI_RaidUnitButton3"], 0]);
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return RF.byUnit.player == ForeverUI_RaidUnitButton2'), "the tile showing you is also found by player").toBe(true);
  addon.eval('__updates = {} ForeverUI_RaidUnitButton3:SetAttribute("unit", "raid9")');
  addon.fire("UNIT_HEALTH", "raid3");
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return { RF.byUnit.raid3 == nil, RF.byUnit.raid9 == ForeverUI_RaidUnitButton3, #__updates }'), "a roster change moves the tile to its new unit").toEqual([true, true, 1]);
  addon.eval('ForeverUI_RaidUnitButton2:SetAttribute("unit", "raid1")');
  expect(addon.eval('local RF = ns.GetModule("RaidFrames") return RF.byUnit.player == nil'), "and the player entry goes when that tile shows someone else").toBe(true);
});

it("raid frames", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  const h = addon.eval(`local h = ForeverUI_Raid return { template = h:GetAttribute("template"), groupBy = h:GetAttribute("groupBy"),
    party = h:GetAttribute("showParty"), start = h:GetAttribute("startingIndex"), vis = h.__drivers["state-visibility"],
    init = h:GetAttribute("initialConfigFunction"), w = h:GetAttribute("fui-width") }`);
  expect(h.template === "SecureUnitButtonTemplate" && h.groupBy === "GROUP" && h.party === true && h.w === 100, "a secure group header, grouped by group, covering the party").toBeTruthy();
  expect(h.start === 1 && /\[group:raid\] show; \[group:party\] show; hide/.test(h.vis), "buttons are precreated, then the header shows in groups only").toBeTruthy();
  expect(/CallMethod\("initialConfigFunction"/.test(h.init) && /\*type2", "togglemenu"/.test(h.init), "each new button is sized, gets target/menu clicks, and is set up").toBeTruthy();
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const tank = raidButton(addon, 1);
  expect(tank.hp === 300 && tank.max === 1000 && tank.name === "TEST-ONLY Tank" && tank.role === "T", "health, name and role letter").toBeTruthy();
  const soft = 0.78 * 0.55 + (0x12 / 255) * 0.45;
  expect(Math.abs(tank.color[0] - soft) < 1e-6, "class colors, softened into the panel color by default").toBeTruthy();
  expect(tank.status === "-700", "the second row shows missing health").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton1.name.__font[3]") === "OUTLINE", "names over the bar are outlined").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton1.power:IsShown()") === true, "a thin power bar along the bottom").toBeTruthy();
  expect(raidButton(addon, 3).status === "Offline", "offline players say so").toBeTruthy();
  expect(raidButton(addon, 2).status === "-100", "you, too, with your missing health").toBeTruthy();
  addon.eval("__units.raid1.hp = 900");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).hp === 900, "UNIT_HEALTH refreshes that member").toBeTruthy();
  addon.eval("__units.raid1.hp = 1000");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "", "no text at full health").toBeTruthy();
  addon.eval("__units.raid1.hp = { __secret = true }");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "", "no missing-health text when the client keeps health secret").toBeTruthy();
  // In combat the client's shortened health text is a secret string, and comparing
  // it errors. Raid frames must decide Dead/Offline without reading that text.
  addon.eval(`__healthTextCalls = 0
    local UF = ns.GetModule("UnitFrames") local text = UF.HealthText
    UF.HealthText = function(...) __healthTextCalls = __healthTextCalls + 1 return text(...) end`);
  addon.fire("UNIT_HEALTH", "raid1");
  expect(addon.eval("return __healthTextCalls") === 0, "raid frames never compare the (possibly secret) health text").toBeTruthy();
  expect(addon.eval("return ForeverUI_RaidUnitButton1.down") === false, "secret health is not Dead or Offline").toBeTruthy();
  addon.eval("__units.raid1.hp = 900; AbbreviateNumbers = nil");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(raidButton(addon, 1).status === "-100", "plain numbers without the client's formatter").toBeTruthy();
  addon.eval('local s = ForeverUIDB.profiles.Default.RaidFrames s.look = "class" s.showPower = false ns.GetModule("RaidFrames").UpdateAll()');
  expect(raidButton(addon, 1).color[0] === 0.78 && addon.eval("return ForeverUI_RaidUnitButton1.power:IsShown()") === false, "bright class colors and no power bar, by choice").toBeTruthy();
  addon.eval("__units.player.hp = 100");
  addon.fire("UNIT_HEALTH", "player");
  expect(raidButton(addon, 2).hp === 100, "an event for you updates your raid button too").toBeTruthy();
  expect(addon.eval("return CompactRaidFrameContainer:GetParent():IsShown()") === false, "the default raid frames are hidden").toBeTruthy();
  expect(addon.eval("return ForeverUI_party1") === null, "UnitFrames doesn't build party frames the raid frames cover").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.raid") === true, "the raid frames are movable").toBeTruthy();
});

it("raid frames: a dark style chosen before 'look' carries over", () => {
  const sv = 'ForeverUIDB = { profiles = { Default = { RaidFrames = { style = "dark" } } }, chars = {} }';
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: sv });
  const s = addon.eval("return ForeverUIDB.profiles.Default.RaidFrames");
  expect(s.look === "dark" && s.style == null, "style = dark becomes look = dark, and the old key goes").toBeTruthy();
});

it("click casting", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return __spec end __spec = 1");
  const CC = 'ns.GetModule("ClickCast")';
  expect(addon.eval(`return ${CC}.KeyText("ctrl-shift-BUTTON2")`) === "Ctrl + Shift + Right click", "mouse keys read as Ctrl + Shift + Right click").toBeTruthy();
  expect(addon.eval(`return ${CC}.KeyText("SHIFT-MOUSEWHEELUP")`) === "Shift + Wheel up (hover)", "hover keys read as Shift + Wheel up (hover)").toBeTruthy();
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew")
    ${CC}.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal")
    ${CC}.Add("MOUSEWHEELUP", "macro", "/cast [@mouseover] TEST-ONLY Heal")
    __spawn(1, "raid1")`);
  const b = addon.eval(`local b = ForeverUI_RaidUnitButton1 return { t = b:GetAttribute("ctrl-type2"), s = b:GetAttribute("ctrl-spell2"),
    ht = b:GetAttribute("type-fui2"), hs = b:GetAttribute("spell-fui2"), mt = b:GetAttribute("type-fui3"), mx = b:GetAttribute("macrotext-fui3"),
    enter = b.__wraps.OnEnter, leave = b.__wraps.OnLeave, hide = b.__wraps.OnHide }`);
  expect(b.t === "spell" && b.s === "TEST-ONLY Renew", "Ctrl + Right click on a raid frame casts the spell (ctrl-type2 / ctrl-spell2)").toBeTruthy();
  expect(b.ht === "spell" && b.hs === "TEST-ONLY Flash Heal" && b.mt === "macro" && /@mouseover/.test(b.mx), "hover keys click virtual buttons that cast the spell or run the macro").toBeTruthy();
  expect(/SetBindingClick\(true, "SHIFT-1", self, "fui2"\)/.test(b.enter) && /"MOUSEWHEELUP", self, "fui3"/.test(b.enter), "entering a frame binds the hover keys to it").toBeTruthy();
  expect(!/BUTTON2/.test(b.enter), "mouse bindings aren't key bindings").toBeTruthy();
  expect(b.leave === "self:ClearBindings()" && b.hide === "self:ClearBindings()", "leaving or hiding the frame releases the keys").toBeTruthy();
  addon.eval(`${CC}.Remove("ctrl-BUTTON2")`);
  expect(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-type2")') === null, "removing a binding clears it from the frames").toBeTruthy();
  addon.eval("__wfgStub.inCombat = true");
  addon.eval(`${CC}.Add("ctrl-BUTTON1", "spell", "TEST-ONLY Shield")`);
  expect(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-type1")') === null, "in combat, changes wait").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-spell1")') === "TEST-ONLY Shield", "and apply when combat ends").toBeTruthy();
  addon.eval("__spec = 2");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-spell1")') === null, "each spec has its own bindings").toBeTruthy();
  addon.clearChat();
  addon.eval("__spec = 1");
  addon.slash("binds");
  expect(chatHas(addon, /Shift \+ 1 \(hover\)  ->  TEST-ONLY Flash Heal/), "/fui binds lists this spec's bindings").toBeTruthy();
});

it("click casting options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + `GetSpecialization = function() return 1 end
    IsControlKeyDown = function() return __ctrl == true end
    C_Spell = { GetSpellName = function(id) return id == 139 and "TEST-ONLY Renew" or nil end }
    GetCursorInfo = function() return __cursor, 1, "spell", 139 end
    ClearCursor = function() __cursor = nil end`);
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.eval('return __click("Set key")'), "Set key starts capturing").toBeTruthy();
  addon.eval(`__ctrl = true
    for _, w in ipairs(__wfgStub.frames) do if w.capturing then w:GetScript("OnMouseDown")(w, "RightButton") end end`);
  expect(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.keyText:GetText() end end") === "Ctrl + Right click", "a Ctrl + right click is captured").toBeTruthy();
  addon.eval(`__cursor = "spell"
    for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then w.input:GetScript("OnReceiveDrag")(w.input) end end`);
  expect(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.input:GetText() end end") === "TEST-ONLY Renew", "dropping a spell from the spellbook fills in its name").toBeTruthy();
  expect(addon.eval('return __click("Add binding")'), "Add binding").toBeTruthy();
  expect(addon.eval('local b = ns.GetModule("ClickCast").Bindings()[1] return b.key .. "=" .. b.value') === "ctrl-BUTTON2=TEST-ONLY Renew", "adds it for this spec").toBeTruthy();
  expect(addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.remove and w.key == "ctrl-BUTTON2" and w:IsShown() then return w.text:GetText() end end') === "Ctrl + Right click  ->  TEST-ONLY Renew", "and lists it").toBeTruthy();
  addon.eval('__click("Add binding")');
  expect(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.message:GetText() end end") === "Can't add: press a key or click first.", "an incomplete binding says what's missing").toBeTruthy();
  expect(addon.eval('return __click("Remove")') && addon.eval('return #ns.GetModule("ClickCast").Bindings()') === 0, "Remove removes it").toBeTruthy();
});

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
  const addon = loggedIn(UNITS_ENV + RAID_ENV + AURA_ENV);
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

// TEST-ONLY healing data: a prediction calculator, threat, known spells and buffs.
const HEALING_ENV = `
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
const healing = (addon, i) => addon.eval(`local b = ForeverUI_RaidUnitButton${i}
  return { heal = b.heal:IsShown() and b.heal.__value, healMax = b.heal.__max, shield = b.shield.__value,
    threat = b.threat:IsShown() and b.threat.__vertexColor, missing = b.missing:IsShown() and b.missing.__texture }`);

it("heal prediction, aggro, buff watch", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const one = healing(addon, 1);
  expect(one.heal === 200 && one.healMax === 1000 && one.shield === 150, "incoming heals and shields from the client's calculator").toBeTruthy();
  expect(addon.eval("return __calc.clamp") === 0, "incoming heals are clamped to missing health").toBeTruthy();
  expect(healing(addon, 2).heal?.__secret, "hidden incoming heals go to the bar untouched").toBeTruthy();
  expect(isTok(addon, one.threat, "threat3"), "full aggro shows a red strip").toBeTruthy();
  expect(healing(addon, 2).threat === false, "hidden threat shows no strip").toBeTruthy();
  expect(one.missing === "TEST-ONLY-ICON-Arcane Intellect", "a player missing your buff is marked with its icon").toBeTruthy();
  expect(healing(addon, 2).missing === false, "the group version of the buff counts").toBeTruthy();
  expect(healing(addon, 3).missing === false, "offline players aren't marked").toBeTruthy();
  addon.eval("__buffs.raid1 = { ['Arcane Intellect'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "the mark goes once they have it").toBeTruthy();
  addon.eval("__threat.raid1 = 0");
  addon.fire("UNIT_THREAT_SITUATION_UPDATE", "raid1");
  expect(healing(addon, 1).threat === false, "the strip goes with the aggro").toBeTruthy();
  addon.eval("__pred.raid1.heals = 50");
  addon.fire("UNIT_HEAL_PREDICTION", "raid1");
  expect(healing(addon, 1).heal === 50, "UNIT_HEAL_PREDICTION refreshes the heal bar").toBeTruthy();
});

it("healing fallbacks and options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + `CreateUnitHealPredictionCalculator = nil
    UnitGetIncomingHeals = function() return 120 end`);
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).heal === 120 && healing(addon, 1).shield == null, "without the calculator: the older incoming-heals call; no shields").toBeTruthy();
  addon.eval('ns.Options.Show("healing")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.save and w.input then w.input:SetText("TEST-ONLY Aura, Arcane Brilliance") w.save:GetScript("OnClick")(w.save) end end`);
  expect(addon.eval("return ForeverUIDB.profiles.Default.RaidHealing.buffs") === "TEST-ONLY Aura, Arcane Brilliance", "the buff list saves").toBeTruthy();
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Brilliance", "and the frames watch the saved names").toBeTruthy();
  expect(addon.eval('return __click("Aggro strip")') && addon.eval("return ForeverUIDB.profiles.Default.RaidHealing.aggro") === false, "the page's switches work").toBeTruthy();
});

// TEST-ONLY WoW Forever client: a 1.x interface number, the aura restriction, no specializations.
const FOREVER_ENV = `
  GetBuildInfo = function() return "1.16.0", "TEST-ONLY", "Sep 1 2026", 16001 end
  __secretAuras = false
  C_Secrets = { ShouldAurasBeSecret = function() return __secretAuras end }
`;

// Whether any shown font string reads exactly `text`.
const shownText = (addon, text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  local shown, f = true, w
  while f do if not f.__shown then shown = false end f = f.__parent end
  if shown and w.__kind == "FontString" and w.__text == "${text}" then return true end
end return false`);

it("WoW Forever client: interface, hidden auras, no specializations", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + FOREVER_ENV);
  expect(addon.eval("return ns.IsForever()") === true, "a 1.x interface number (16001) is WoW Forever").toBeTruthy();
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Intellect", "readable auras: a missing buff is marked").toBeTruthy();
  addon.eval("__secretAuras = true");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "while auras are hidden, an unseen buff is unknown, not missing").toBeTruthy();
  addon.eval("__secretAuras = { __secret = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "a hidden answer to 'are auras hidden?' counts as hidden").toBeTruthy();
  addon.eval("C_Secrets.ShouldAurasBeSecret = function() error('TEST-ONLY') end");
  expect(addon.eval("return ns.AurasSecret()") === true, "an error counts as hidden").toBeTruthy();
  addon.eval("C_Secrets.ShouldAurasBeSecret = function() return __secretAuras end __secretAuras = false");
  setCombat(addon, false);
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Intellect", "leaving combat looks at every buff again").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client WoW Forever {2}· {2}auras on the engine {2}· {2}aura values readable/), "/fui status names the client and the aura state").toBeTruthy();
  addon.slash("spec Default");
  expect(chatHas(addon, /no specializations/), "/fui spec explains there are no specializations").toBeTruthy();
  addon.eval('ns.Options.Show("profiles")');
  expect(shownText(addon, "SWITCH PROFILE") && !shownText(addon, "SPECIALIZATION"), "the Profiles page has no spec section").toBeTruthy();
  addon.eval('UnitClass = function() return "Paladin", "PALADIN" end');
  expect(addon.eval('for _, n in ipairs(ns.GetModule("RaidHealing").BuffNames()) do if n == "Greater Blessing of Kings" then return true end end'), "any blessing counts for a paladin").toBeTruthy();
});

it("a retail client is not WoW Forever and keeps its aura state readable", () => {
  const addon = loggedIn('GetBuildInfo = function() return "12.0.7", "TEST-ONLY", "Sep 1 2026", 120007 end');
  expect(addon.eval("return ns.IsForever()") === false && addon.eval("return ns.AurasSecret()") === false, "120007 is retail; no C_Secrets means readable").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client Retail/), "/fui status says Retail").toBeTruthy();
});

// TEST-ONLY group status: raid icons, ready check, resurrection, leader, range.
const STATUS_ENV = `
  __status = { icon = { raid1 = 8 }, ready = {}, rez = {}, range = { raid1 = true, raid3 = false } }
  GetRaidTargetIndex = function(unit) return __status.icon[unit] end
  GetReadyCheckStatus = function(unit) return __status.ready[unit] end
  UnitHasIncomingResurrection = function(unit) return __status.rez[unit] == true end
  UnitIsGroupLeader = function(unit) return unit == "raid1" end
  UnitIsGroupAssistant = function(unit) return unit == "raid3" end
  UnitInRange = function(unit) return __status.range[unit], true end
`;

// Raid button i's status marks.
const marks = (addon, i) => addon.eval(`local b = ForeverUI_RaidUnitButton${i}
  local function tex(t) return t:IsShown() and t.__texture end
  return { icon = b.raidIcon:IsShown() and b.raidIcon.__texCoord, ready = tex(b.ready), rez = b.rez:IsShown(), leader = tex(b.leader), alpha = b.__alpha }`);

// The reload overlay on a button as [type, macro, key-down, sits above the button], or false.
const reloadOverlay = (addon, path) => addon.eval(`local b = ${path} local o = b.reloadOverlay
  return o and { o:GetAttribute("type"), o:GetAttribute("macrotext"), o:GetAttribute("useOnKeyDown"), o:GetFrameLevel() > b:GetFrameLevel() } or false`);

// The next session of an addon: the client writes SavedVariables at logout and
// loads them back before ADDON_LOADED; extra Lua runs before login.
function nextSession(addon, extra = "") {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `ForeverUIDB = ${luaValue(sv.account)}\nForeverUICharDB = ${luaValue(sv.char)}\n` });
  if (extra) next.eval(extra);
  next.login();
  return next;
}

it("a session: what you set in one login comes back in the next", () => {
  const first = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA);
  first.slash("profile TEST-ONLY Alt");
  first.slash("accent arcane");
  first.slash("disable Minimap");
  first.eval('ns.Settings("UnitFrames").healthFormat = "percent" ns.Settings("RaidFrames").look = "dark"');
  first.eval('ns.SetMoverPoint("uf_player", "TOPLEFT", "TOPLEFT", 40, -60)');
  const next = nextSession(first, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(next.eval("return ns.ProfileName()"), "the character is still on its profile").toBe("TEST-ONLY Alt");
  expect(next.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the accent is kept").toBe(true);
  expect(next.eval("return ns.ModuleEnabled('Minimap')"), "a module turned off stays off").toBe(false);
  expect(next.eval('return { ns.Settings("UnitFrames").healthFormat, ns.Settings("RaidFrames").look }'), "module settings are kept").toEqual(["percent", "dark"]);
  expect(next.eval('return { ns.MoverPoint("uf_player") }'), "a moved frame stays where you put it").toEqual(["TOPLEFT", "TOPLEFT", 40, -60]);
  expect(next.eval("return ForeverUI_Setup == nil or not ForeverUI_Setup:IsShown()"), "setup doesn't come back").toBe(true);
  const third = nextSession(next, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(third.eval("return ns.ProfileName()"), "and it holds for a third session").toBe("TEST-ONLY Alt");
});

it("/fui errors: what ForeverUI caught this session", () => {
  const addon = loggedIn();
  addon.eval("for i = #ns.errors, 1, -1 do ns.errors[i] = nil end");
  addon.slash("errors");
  expect(chatHas(addon, /No errors caught this session/), "with nothing caught, it says so").toBe(true);
  const broken = loggedIn(`__wfgStub.noAuraContainer = true
    local M = ns.Module("TEST-ONLY Broken", {}) function M.Enable() error("TEST-ONLY boom") end`);
  broken.slash("errors");
  expect(chatHas(broken, /\d+ error\(s\) caught this session, newest last/) && chatHas(broken, /aura containers \(using ForeverUI's own icons\)/) && chatHas(broken, /module TEST-ONLY Broken: .*TEST-ONLY boom/), "a module that failed and a missing aura container are both listed").toBe(true);
  broken.eval('for i = 1, 25 do ns.CaughtError("TEST-ONLY", i) end');
  expect(broken.eval("return { #ns.errors, ns.errors[1] }"), "only the last 20 are kept").toEqual([20, "TEST-ONLY: 6"]);
});

it("reload buttons: a /reload macro overlay, since the Forever client blocks ReloadUI()", () => {
  const addon = loggedIn(FOREVER_ENV + "ReloadUI = function() __reloaded = true end");
  addon.eval('ns.OfferReload("TEST-ONLY change.")');
  expect(addon.eval("return ForeverUI_Reload:IsShown() and ForeverUI_Reload.title:GetText()"), "a reload is offered with its reason").toBe("TEST-ONLY change. Reload the UI now to apply it?");
  expect(reloadOverlay(addon, "ForeverUI_Reload.accept"), "Reload carries a /reload macro overlay, on mouse-up, above the button").toEqual(["macro", "/reload", false, true]);
  addon.eval('local a = ForeverUI_Reload.accept a:SetScript("OnEnter", function() __hover = "in" end) a:SetScript("OnLeave", function() __hover = "out" end)');
  addon.eval("local o = ForeverUI_Reload.accept.reloadOverlay o:GetScript('OnEnter')(o)");
  expect(addon.eval("return __hover"), "hovering the overlay lights the button under it").toBe("in");
  addon.eval("local o = ForeverUI_Reload.accept.reloadOverlay o:GetScript('OnLeave')(o)");
  expect(addon.eval("return __hover"), "and leaving it lets go").toBe("out");
  addon.eval("local a = ForeverUI_Reload.accept a:SetScript('OnEnter', nil) a.reloadOverlay:GetScript('OnEnter')(a.reloadOverlay)");
  addon.eval("ForeverUI_Reload.cancel:GetScript('OnClick')(ForeverUI_Reload.cancel)");
  expect(addon.eval("return ForeverUI_Reload:IsShown()"), "Later closes it").toBe(false);
  setCombat(addon, true);
  addon.slash("");
  expect(reloadOverlay(addon, "ForeverUI_Options.reload"), "a reload button built in combat has no overlay yet").toBe(false);
  addon.eval("ForeverUI_Options.reload:GetScript('OnClick')(ForeverUI_Options.reload)");
  expect(addon.eval("return __reloaded") === null && chatHas(addon, /Type \/reload in chat/), "clicked then, it says to type /reload (ReloadUI would be blocked)").toBe(true);
  setCombat(addon, false);
  expect(reloadOverlay(addon, "ForeverUI_Options.reload"), "the overlay arrives when combat ends").toEqual(["macro", "/reload", false, true]);
});

it("unit frame health text settings apply at once", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + "UnitHealthPercent = function() return 90 end CurveConstants = { ScaleTo100 = 1 }");
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Show health numbers") and ForeverUI_player.healthText:GetText()'), "turning health numbers off clears them at once").toBe("");
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()"), "with no reload").toBe(false);
  addon.eval('__click("Show health numbers")');
  expect(addon.eval('return __click("Health as") and ForeverUI_player.healthText:GetText()'), "switching to percent shows it at once").toMatch(/%$/);
  expect(addon.eval('return __click("Shaman totems") and ForeverUIDB.profiles.Default.ClassBars.totems'), "the totem switch is on the page (after a reload)").toBe(false);
  expect(addon.eval('return __click("Druid mana") and ForeverUIDB.profiles.Default.ClassBars.druidMana'), "and the druid mana switch").toBe(false);
});

// TEST-ONLY totems: slot 1 has a totem down (plain values), the other slots are empty.
const TOTEMS_ENV = `
  __units.player.class = "SHAMAN"
  __totems = { [1] = { true, "TEST-ONLY Totem", 100, 120, "TEST-ONLY-ICON-Totem" } }
  GetTotemInfo = function(slot) local t = __totems[slot] if t then return t[1], t[2], t[3], t[4], t[5] end return false, "", 0, 0, nil end
`;

// One totem cell's state: alpha, icon, plain sweep, duration object, numbers shown, secure attributes.
const totemCell = (addon, slot) => addon.eval(`local c = ns.GetModule("ClassBars").cells[${slot}]
  return { alpha = c.__alpha, icon = c.icon.__texture, sweep = c.cooldown.__cooldown, object = c.cooldown.__durationObject,
    numbers = c.cooldown.__hideNumbers == false, type2 = c:GetAttribute("type2"), slot = c:GetAttribute("totem-slot"), follows = c.__alphaFromBoolean }`);

it("class bars: totems for shamans, mana in forms for druids", () => {
  const addon = loggedIn(UNITS_ENV + TOTEMS_ENV);
  expect(addon.eval('local CB = ns.GetModule("ClassBars") return { #CB.cells, select(2, CB.totems:GetPoint()) == ForeverUI_player }'), "a shaman gets four totem cells under the player frame").toEqual([4, true]);
  expect(totemCell(addon, 1), "a totem that is down shows its icon, its sweep and the client's numbers").toMatchObject({ alpha: 1, icon: "TEST-ONLY-ICON-Totem", sweep: [100, 120], numbers: true, type2: "destroytotem", slot: 1 });
  expect(totemCell(addon, 2).alpha, "an empty slot is see-through (cells are secure, so alpha, not Hide)").toBe(0);
  addon.eval('GetTotemDuration = function(slot) return { __duration = slot } end __totems[2] = { true, "TEST-ONLY Totem 2", 200, 60, "TEST-ONLY-ICON-Two" }');
  addon.fire("PLAYER_TOTEM_UPDATE");
  expect(totemCell(addon, 2), "a new totem shows, timed by the client's duration object").toMatchObject({ alpha: 1, icon: "TEST-ONLY-ICON-Two", object: { __duration: 2 } });
  addon.eval("__totems[1] = { { __secret = true }, 'x', { __secret = true }, { __secret = true }, 'TEST-ONLY-ICON-Totem' }");
  addon.fire("PLAYER_TOTEM_UPDATE");
  expect(totemCell(addon, 1), "a hidden answer goes to the client's alpha-from-boolean; the cell keeps its alpha").toMatchObject({ alpha: 1, follows: { __secret: true } });
  const off = loggedIn(UNITS_ENV + TOTEMS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { ClassBars = { totems = false } } }" });
  expect(off.eval('return ns.GetModule("ClassBars").cells == nil'), "totems can be turned off").toBe(true);
  const noFrames = loggedIn(UNITS_ENV + TOTEMS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { UnitFrames = false } } }" });
  expect(noFrames.eval('return ns.GetModule("ClassBars").cells == nil'), "no player frame (the game's own shows its totems), no row").toBe(true);
  const early = loggedIn(UNITS_ENV + TOTEMS_ENV + "GetTotemInfo = nil");
  expect(early.eval('ns.GetModule("ClassBars").UpdateTotems() return ns.GetModule("ClassBars").cells[1].__alpha'), "no totem call on this client: cells stay as built").toBe(null);
});

it("class bars: druid mana while a form shows rage or energy", () => {
  const addon = loggedIn(UNITS_ENV + '__units.player.class = "DRUID" __form = 1 UnitPowerType = function() return __form end');
  // The mana bar: shown, max and value.
  const mana = () => addon.eval('local CB = ns.GetModule("ClassBars") return { CB.manaHolder:IsShown(), select(2, CB.mana:GetMinMaxValues()), CB.mana:GetValue() }');
  expect(mana(), "in bear form the mana bar shows your mana").toEqual([true, 100, 50]);
  addon.eval("__form = 0 __units.player.power = 70");
  addon.fire("UNIT_POWER_UPDATE", "target");
  expect(mana()[0], "another unit's power changes nothing").toBe(true);
  addon.fire("UPDATE_SHAPESHIFT_FORM");
  expect(mana(), "back in caster form it hides").toEqual([false, 100, 70]);
  addon.eval("__form = { __secret = true }");
  addon.fire("UNIT_DISPLAYPOWER", "player");
  expect(mana()[0], "a hidden power type counts as no form").toBe(false);
  const other = loggedIn(UNITS_ENV + 'UnitClass = function() return "x", { __secret = true } end');
  expect(other.eval('local CB = ns.GetModule("ClassBars") return CB.cells == nil and CB.mana == nil'), "a hidden or other class builds nothing").toBe(true);
  const combat = createAddon({ savedVariables: SETUP_DONE });
  combat.eval(UNITS_ENV + '__units.player.class = "DRUID" UnitPowerType = function() return 3 end');
  setCombat(combat, true);
  combat.login();
  expect(combat.eval('return ns.GetModule("ClassBars").mana == nil'), "logging in during combat waits").toBe(true);
  setCombat(combat, false);
  expect(combat.eval('return ns.GetModule("ClassBars").manaHolder:IsShown()'), "and builds the bar when combat ends").toBe(true);
});

it("raid status marks", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + STATUS_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const one = marks(addon, 1);
  expect(one.icon && one.icon[0] === 0.75 && one.icon[2] === 0.25, "the skull shows from the icon sheet's eighth cell").toBeTruthy();
  expect(one.leader === "Interface\\GroupFrame\\UI-Group-LeaderIcon" && /Assistant/.test(marks(addon, 3).leader), "leader crown and assistant mark").toBeTruthy();
  expect(marks(addon, 2).leader === false && marks(addon, 2).icon === false, "others get neither").toBeTruthy();
  expect(one.alpha === 1 && marks(addon, 3).alpha === 0.4 && marks(addon, 2).alpha === 1, "out of range fades; you never fade").toBeTruthy();
  addon.eval("__status.range.raid3 = true");
  addon.eval("__wfgStub.advance(0.25)");
  expect(marks(addon, 3).alpha === 1, "range is re-checked on a timer").toBeTruthy();
  addon.eval("__status.range.raid3 = { __secret = true }");
  addon.eval("__wfgStub.advance(0.25)");
  expect(addon.eval("return ForeverUI_RaidUnitButton3.__alphaFromBoolean.__secret"), "a hidden range goes to the client's alpha-from-boolean").toBe(true);
  addon.eval("ForeverUI_RaidUnitButton3.SetAlphaFromBoolean = false __wfgStub.advance(0.25)");
  expect(marks(addon, 3).alpha === 1, "a hidden range never fades on a client without alpha-from-boolean").toBeTruthy();
  addon.eval('__status.ready = { raid1 = "ready", raid3 = "waiting" }');
  addon.fire("READY_CHECK");
  expect(/ReadyCheck-Ready/.test(marks(addon, 1).ready) && /Waiting/.test(marks(addon, 3).ready), "ready check answers show").toBeTruthy();
  addon.eval('__status.ready.raid3 = "notready"');
  addon.fire("READY_CHECK_CONFIRM", "raid3");
  expect(/NotReady/.test(marks(addon, 3).ready), "answers update").toBeTruthy();
  addon.fire("READY_CHECK_FINISHED");
  expect(marks(addon, 1).ready === false, "and clear when the check ends (no timer on this client)").toBeTruthy();
  addon.eval("__status.rez.raid3 = true");
  addon.fire("INCOMING_RESURRECT_CHANGED", "raid3");
  expect(marks(addon, 3).rez === true && marks(addon, 1).rez === false, "a resurrection on the way is marked").toBeTruthy();
  addon.eval("__status.icon.raid1 = { __secret = true }");
  addon.fire("RAID_TARGET_UPDATE");
  expect(marks(addon, 1).icon === false, "a hidden raid icon shows nothing").toBeTruthy();
  addon.eval('ForeverUIDB.profiles.Default.RaidStatus.leader = false; ns.GetModule("RaidStatus").UpdateAll()');
  expect(marks(addon, 1).leader === false, "each mark can be turned off").toBeTruthy();
});

// TEST-ONLY tooltip: GameTooltip as a plain frame with the tooltip calls the module uses.
const TOOLTIP_ENV = `
  __hooks, __post = {}, {}
  hooksecurefunc = function(name, fn) __hooks[name] = fn end
  GameTooltip_SetDefaultAnchor = function() end
  Enum = { TooltipDataType = { Unit = 2 } }
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

// The default tooltip's state.
const tooltip = (addon) => addon.eval(`local tt = GameTooltip
  return { shown = tt:IsShown(), nine = tt.NineSlice.__alpha, name = GameTooltipTextLeft1.__textColor,
    lines = tt.__lines, count = #tt.__lines, anchor = tt.__anchor, point = select(2, tt:GetPoint(1)) == ForeverUI_TooltipAnchor }`);

it("tooltips", () => {
  const addon = loggedIn(UNITS_ENV + TOOLTIP_ENV);
  let t = tooltip(addon);
  expect(t.nine === 0 && addon.eval("return GameTooltip.fuiSkinned") === true, "the default art is hidden under a flat panel").toBeTruthy();
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
  addon.eval('ForeverUIDB.profiles.Default.Tooltips.anchor = "cursor"; __hooks.GameTooltip_SetDefaultAnchor(GameTooltip, UIParent)');
  expect(tooltip(addon).anchor === "ANCHOR_CURSOR", "or follows the cursor").toBeTruthy();
  addon.eval("ForeverUIDB.profiles.Default.Tooltips.hideInCombat = true; __wfgStub.inCombat = true; __showUnit('target')");
  expect(tooltip(addon).shown === false, "unit tooltips can hide in combat").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.tooltip") === true, "the tooltip corner is movable").toBeTruthy();
});

// TEST-ONLY nameplates: nameplate1 is the hostile target (hidden health), nameplate2 a friend,
// nameplate3 a plate the client keeps from addons.
const PLATE_ENV = `
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
const plate = (addon, unit) => addon.eval(`local p = __plates.${unit} local f = p.fui
  if not f then return { drawn = false, default = p.UnitFrame:IsShown() } end
  local edge for _, w in ipairs(__wfgStub.frames) do if w.__parent == f and w.__layer == "BORDER" then edge = w.__vertexColor break end end
  return { drawn = f:IsShown(), default = p.UnitFrame:IsShown(), hp = f.__value, color = f.__barColor, name = f.name:GetText(),
    dot = f.debuffs.frame.__groups[1].buttons[1].__shown and f.debuffs.frame.__groups[1].buttons[1].__icon.__texture, cast = f.cast:IsShown() and f.cast.text:GetText(), edge = edge }`);

it("a nameplate first drawn in combat gets the client's aura container after the fight", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // nameplate2's debuff row: on the engine, its frame kind, and its unit.
  const row = () => addon.eval("local f = __plates.nameplate2.fui return { engine = f.debuffsOnEngine, kind = f.debuffs.frame.__kind, unit = f.debuffs.unit or f.debuffs.frame.__unit }");
  expect(row(), "in combat a container can't be made, so the plate gets the fallback icons").toMatchObject({ engine: false, kind: "Frame", unit: "nameplate2" });
  addon.eval("__old = __plates.nameplate2.fui.debuffs.frame");
  setCombat(addon, false);
  expect(row(), "after the fight it gets the client's own container, on the same unit").toMatchObject({ engine: true, kind: "AuraContainer", unit: "nameplate2" });
  expect(addon.eval("return __old:IsShown()"), "and the fallback row is put away").toBe(false);
  const old = loggedIn(UNITS_ENV + PLATE_ENV + "__wfgStub.noAuraContainer = true");
  setCombat(old, true);
  old.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  setCombat(old, false);
  expect(old.eval("return __plates.nameplate2.fui.debuffsOnEngine"), "a client without the container keeps the fallback").toBe(false);
});

it("nameplates", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  const accent = addon.eval("return { ns.Theme.Accent() }");
  // Whether two colors have the same r, g, b.
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate3");
  let one = plate(addon, "nameplate1");
  expect(one.drawn && one.default === false, "our frame is drawn and the default one hidden").toBeTruthy();
  expect(one.hp?.__secret, "hidden health goes to the bar untouched").toBeTruthy();
  expect(isTok(addon, one.color, "hostile") && one.name === "TEST-ONLY Boar", "reaction color and name").toBeTruthy();
  expect(one.dot === "TEST-ONLY-DOT", "your debuffs show over the name").toBeTruthy();
  const row = addon.eval(`local c = __plates.nameplate1.fui.debuffs.frame local b = c.__groups[1].buttons[1]
    return { unit = c.__unit, timer = b.__durationText ~= nil, mouse = b.__mouse, sort = c.__groups[1].opts.sortMethod, point = c.__points.BOTTOMLEFT.relPoint }`);
  expect(row.unit === "nameplate1" && row.timer && row.mouse === false && row.point === "TOPLEFT", "a row over the plate that follows its unit, with timers, letting clicks through").toBeTruthy();
  expect(same(one.edge, accent), "your target gets an accent border").toBeTruthy();
  expect(plate(addon, "nameplate3").drawn === false && plate(addon, "nameplate3").default === true, "a plate kept from addons is left alone").toBeTruthy();
  addon.eval("__plates.nameplate1.UnitFrame:Show()");
  expect(plate(addon, "nameplate1").default === false, "the default frame stays hidden").toBeTruthy();
  addon.eval("__threat.nameplate1 = 3");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect(isTok(addon, plate(addon, "nameplate1").color, "threat3"), "red while you have aggro").toBeTruthy();
  addon.eval("__threat.nameplate1 = { __secret = true }");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect(isTok(addon, plate(addon, "nameplate1").color, "hostile"), "hidden threat: back to the reaction color").toBeTruthy();
  addon.eval("__cast.nameplate1 = true");
  addon.fire("UNIT_SPELLCAST_START", "nameplate1");
  expect(plate(addon, "nameplate1").cast === "TEST-ONLY Spell", "casts show under the plate").toBeTruthy();
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  expect(plate(addon, "nameplate1").drawn === false, "a removed plate is hidden until reused").toBeTruthy();
  addon.fire("PLAYER_ENTERING_WORLD");
  const two = plate(addon, "nameplate2");
  expect(two.drawn && two.color[0] === 1 && two.color[1] === 0.96, "after a reload, plates on screen are picked up (class color)").toBeTruthy();
  expect(!same(two.edge, accent), "only your target has the accent border").toBeTruthy();
  addon.eval('ns.Options.Show("nameplates")');
  expect(addon.eval('return __click("Threat colors while you have aggro")') && addon.eval("return ForeverUIDB.profiles.Default.Nameplates.threat") === false, "the options page works").toBeTruthy();
});

// The top border of a fresh panel at a UI scale on a screen `height` pixels tall
// (optionally with a TEST-ONLY PixelUtil): { h, pixelUtil }.
function borderAt(scale, height, pixelUtil = false) {
  const pu = pixelUtil ? `PixelUtil = { GetNearestPixelSize = function(size, s) __pu = true return size * 768 / ${height} / s end }` : "";
  const addon = loggedIn(`GetPhysicalScreenSize = function() return 1920, ${height} end ${pu}`);
  return addon.eval(`UIParent:SetScale(${scale})
    local f = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent))
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__layer == "BORDER" and w.__height then return { h = w.__height, pixelUtil = __pu == true } end
    end`);
}

it("theme tokens and pixel-perfect borders", () => {
  for (const scale of [0.64, 0.71, 1]) {
    const px = borderAt(scale, 1080).h * scale * 1080 / 768;
    expect(Math.abs(px - 1) < 1e-9, `at UI scale ${scale} a border is one screen pixel (got ${px})`).toBeTruthy();
  }
  expect(borderAt(0.71, 1440, true).pixelUtil === true, "the client's PixelUtil sizes borders where it exists").toBeTruthy();
  const addon = loggedIn(CLICK_LUA + "GetPhysicalScreenSize = function() return 2560, 1440 end");
  expect(addon.eval('return (pcall(ns.Theme.RGB, "TEST-ONLY-nope"))') === false, "an unknown color name is an error, not a silent default").toBeTruthy();
  expect(addon.eval("local fs = UIParent:CreateFontString() ns.Theme.Color(fs, 1, 0, 0) return fs.__textColor[1]") === 1, "Color still takes r, g, b (skin API)").toBeTruthy();
  expect(isTok(addon, addon.eval("local t = UIParent:CreateTexture() ns.Theme.Tint(t, 'magic') return t.__vertexColor"), "magic"), "Tint colors a texture by name").toBeTruthy();
  expect(addon.eval('return ns.Theme.Hex("white")') === "ffffffff", "Hex gives the escape-code form").toBeTruthy();
  addon.eval('ns.Chat("TEST-ONLY line")');
  const last = addon.chat().at(-1);
  expect(last.startsWith("|c" + addon.eval('return ns.Theme.Hex("accent")') + "ForeverUI:|r"), `chat lines start with ForeverUI: in the accent (got ${last})`).toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  setCombat(addon, true);
  addon.eval('__click("Pixel-perfect UI scale")');
  expect(addon.eval("return UIParent:GetScale()") === 1, "the pixel-perfect scale waits for combat to end").toBeTruthy();
  setCombat(addon, false);
  expect(Math.abs(addon.eval("return UIParent:GetScale()") - 768 / 1440) < 1e-9, "then UIParent gets 768 / screen height").toBeTruthy();
  addon.eval('__click("Pixel-perfect UI scale")');
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "turning it off offers a reload (the client's scale comes back)").toBeTruthy();
});

it("bundled font and logo", () => {
  const FIRA = "Interface\\AddOns\\ForeverUI\\Media\\Fonts\\FiraSansCondensed-";
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval("return (ns.Theme.Font())") === FIRA + "Medium.ttf", "the bundled Fira Sans Condensed is the default font").toBeTruthy();
  expect(addon.eval("return (ns.Theme.Font(true))") === FIRA + "SemiBold.ttf", "bold asks for its SemiBold weight").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval('return __click("Font")') && addon.eval("return (ns.Theme.Font())") === "Fonts\\FRIZQT__.TTF", "the Font option switches to the game's font").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "a font change offers a reload").toBeTruthy();
  const korean = loggedIn('GetLocale = function() return "koKR" end');
  expect(korean.eval("return (ns.Theme.Font())") === "Fonts\\FRIZQT__.TTF", "Korean and Chinese clients keep the game's font (Fira has no Hangul or Han)").toBeTruthy();
  const logo = addon.eval(`local l = ForeverUI_Options.logo
    local out = {}
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == l then out[#out + 1] = { tex = w.__texture, color = w.__vertexColor } end end
    return out`);
  expect(logo.length === 2 && logo.every((t) => /Media\\Textures\\Logo(Left|Right)$/.test(t.tex)), "the options title has the two-part logo").toBeTruthy();
  addon.slash("accent fel");
  const left = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == ForeverUI_Options.logo and w.__texture:find("Left") then return w.__vertexColor end end`);
  expect(isTok(addon, left, "accent"), "the logo's left diamond follows the accent live").toBeTruthy();
});

it("text roles, sheen and shadows", () => {
  const addon = loggedIn(CLICK_LUA);
  // A fresh font string styled for a role: its font, shadow offset and color.
  const fs = (role, color) => addon.eval(`local fs = ns.Theme.Text(UIParent:CreateFontString(), "${role}"${color ? `, "${color}"` : ""})
    return { font = { fs:GetFont() }, shadow = fs.__shadowOffset, color = fs.__textColor }`);
  const title = fs("title");
  expect(/SemiBold\.ttf$/.test(title.font[0]) && title.font[1] === 15, "the title role is SemiBold 15").toBeTruthy();
  expect(/Medium\.ttf$/.test(fs("label").font[0]) && fs("label").font[1] === 12, "the label role is Medium 12").toBeTruthy();
  expect(isTok(addon, fs("label").color, "text") && isTok(addon, fs("small", "muted").color, "muted"), "roles color text by name (text by default)").toBeTruthy();
  const world = fs("world");
  expect(world.font[2] === "OUTLINE" && world.shadow?.[0] === 0, "world text is outlined without a shadow").toBeTruthy();
  expect(fs("label").shadow?.[0] === 1 && fs("label").shadow?.[1] === -1, "other text gets a one-pixel shadow").toBeTruthy();
  expect(addon.eval('return (pcall(ns.Theme.Text, UIParent:CreateFontString(), "TEST-ONLY-nope"))') === false, "an unknown role is an error").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  addon.eval('__click("Text size")');
  expect(fs("label").font[1] === 13 && addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "Text size scales every role (110%: 12 -> 13) and offers a reload").toBeTruthy();
  const parts = addon.eval(`local f = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true })
    local out = { shadow = 0, sheen = 0 }
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__texture and w.__texture:find("Shadow") then out.shadow = out.shadow + 1 out.tc = out.tc or w.__texCoord
        for _, p in pairs(w.__points) do if p.y ~= 0 or p.x ~= 0 then out.shifted = true end end
        out.snapped = (out.snapped or true) and w.__snapToPixelGrid == false end
      if w.__parent == f and w.__layer == "BORDER" and w.__points.TOPLEFT and w.__points.TOPLEFT.y ~= 0 then out.sheen = out.sheen + 1 out.sheenColor = w.__vertexColor end
    end
    return out`);
  expect(parts.shadow === 8 && parts.tc?.length === 4, "a shadowed panel gets eight shadow pieces cut from Media/Textures/Shadow").toBeTruthy();
  expect([parts.shifted ?? false, parts.snapped], "the shadow sits flush around the panel (no drop, so no gap under it), pixel-snapped").toEqual([false, true]);
  expect(parts.sheen === 1 && isTok(addon, parts.sheenColor, "sheen"), "and a sheen one pixel inside its top edge").toBeTruthy();
  expect(addon.eval("local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__parent == ForeverUI_Options and w.__texture and w.__texture:find('Shadow') then n = n + 1 end end return n") === 8, "the options window casts a shadow").toBeTruthy();
});

it("options window: nav, search, controls, footer", () => {
  const addon = loggedIn(CLICK_LUA + "GetAddOnMetadata = function(_, key) return key == 'Version' and 'TEST-ONLY-9.9' or nil end");
  addon.eval('ns.Options.Show("general")');
  const nav = addon.eval(`local out = {}
    for k, b in pairs(ForeverUI_Options.nav) do out[k] = { icon = b.icon.__texture, rail = b.rail:IsShown(), text = b.text:GetText() } end
    return out`);
  expect(/Icons\\General$/.test(nav.general.icon) && /Icons\\Healing$/.test(nav.healing.icon), "every nav entry has its icon").toBeTruthy();
  expect(nav.general.rail === true && nav.raid.rail === false, "the current page gets the accent rail").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.notice:IsShown() or ForeverUI_Options.reload:IsShown()") === false, "no reload notice until something needs one").toBeTruthy();
  expect(/TEST-ONLY-9\.9/.test(addon.eval("return ForeverUI_Options.version:GetText()")), "the footer shows the version").toBeTruthy();
  addon.eval('ns.Options.Search("dispel")');
  expect(addon.eval("return ForeverUI_Options.nav.raid:GetAlpha()") === 1 && addon.eval("return ForeverUI_Options.nav.general:GetAlpha()") === 0.35, "search dims pages without a match").toBeTruthy();
  addon.eval('ForeverUI_Options.search:GetScript("OnEnterPressed")(ForeverUI_Options.search)');
  expect(addon.eval("return ns.Options.current") === "raid", "Enter in the search opens the first match").toBeTruthy();
  addon.eval('ns.Options.Search("")');
  expect(addon.eval("return ForeverUI_Options.nav.general:GetAlpha()") === 1, "clearing the search brings every page back").toBeTruthy();
  addon.eval('ns.Options.Show("more")');
  const seg = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.segments and w.label:GetText() == "Numbers" then
      w.segments[2]:GetScript("OnClick")(w.segments[2]) return { value = ForeverUIDB.profiles.Default.DataBars.text, on = w.segments[2].fill:IsShown(), off = w.segments[1].fill:IsShown() } end end`);
  expect(seg.value === "always" && seg.on === true && seg.off === false, "clicking a segment picks it and lights it").toBeTruthy();
  const dd = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.label:GetText() == "Tooltip position" then
      w.dropdown:GetScript("OnClick")(w.dropdown)
      local m = ForeverUI_Menu
      local shown = m:IsShown()
      m.items[2]:GetScript("OnClick")(m.items[2])
      return { shown = shown, count = #m.items, value = ForeverUIDB.profiles.Default.Tooltips.anchor, closed = not m:IsShown(), text = w.dropdown.text:GetText() } end end`);
  expect(dd.shown && dd.count === 3 && dd.value === "cursor" && dd.closed && dd.text === "at the cursor", "a dropdown opens a menu of its choices; picking one sets it and closes the menu").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  const slider = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.value and w.label:GetText() == "Text size" then
      w:GetScript("OnMouseWheel")(w, -1)
      return { v = ns.Theme.Settings().textScale, text = w.value:GetText() } end end`);
  expect(Math.abs(slider.v - 0.95) < 1e-9 && slider.text === "95%", "the Text size slider steps by 5% with the wheel and shows the value").toBeTruthy();
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.hex then w.hex:SetText("#5aa2f0") w.hex:GetScript("OnEnterPressed")(w.hex) end end`);
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "typing a hex color in the accent box sets it").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.notice:IsShown() and ForeverUI_Options.reload:IsShown()") === true, "a reload-only change shows the notice and the Reload now button").toBeTruthy();
  const profiles = addon.eval(`ns.CreateProfile = ns.CreateProfile ForeverUIDB.profiles["TEST-ONLY Healer"] = {}
    local d = ForeverUI_Options.profile d:GetScript("OnClick")(d)
    local texts = {} for i, b in ipairs(ForeverUI_Menu.items) do if b:IsShown() then texts[#texts + 1] = b.text:GetText() end end
    ForeverUI_Menu.items[2]:GetScript("OnClick")(ForeverUI_Menu.items[2])
    return { texts = texts, now = ns.ProfileName() }`);
  expect(profiles.texts.length === 2 && profiles.now === "TEST-ONLY Healer", "the header's profile dropdown lists profiles and switches (on reload)").toBeTruthy();
});

it("frames pass: bar texture, smoothing, raid style, shields, glows", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + CLICK_LUA + `
    Enum = { StatusBarInterpolation = { ExponentialEaseOut = 1 } }
    __setValueArgs = {}
    local sv = __wfgStub.methods and __wfgStub.methods.SetValue`);
  addon.eval('__spawn(1, "raid1")');
  const tex = addon.eval("return ForeverUI_RaidUnitButton1.health.__barTexture.__texture");
  expect(/Media\\Textures\\Bar$/.test(tex), "raid health uses the Forever bar texture").toBeTruthy();
  expect(/Media\\Textures\\Stripes$/.test(addon.eval("return ForeverUI_RaidUnitButton1.shield.__barTexture.__texture")), "shields are striped").toBeTruthy();
  expect(/Bar$/.test(addon.eval("return ForeverUI_player.health.__barTexture.__texture")), "unit frames use it too").toBeTruthy();
  addon.eval('ns.Options.Show("raid")');
  addon.eval('__click("Style")');
  const dark = addon.eval("local b = ForeverUI_RaidUnitButton1 return { bar = b.health.__barColor, name = b.name.__textColor }");
  expect(isTok(addon, dark.bar, "darkBar") && dark.name[0] === 0.78, "the dark raid style: dark bars, class-colored names (at once)").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  addon.eval('__click("Bar texture")');
  expect(addon.eval("return ns.Theme.BarTexture()") === "Interface\\Buttons\\WHITE8X8" && addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "Flat bars are an option (on reload)").toBeTruthy();
  const glow = addon.eval(`local f = CreateFrame("Frame", nil, UIParent) local g = ns.Theme.Glow(f, 6)
    local hidden = not g[1]:IsShown() ns.Theme.ShowGlow(g, true) return { n = #g, hidden = hidden, shown = g[1]:IsShown(), tex = g[1].__texture, color = g[1].__vertexColor }`);
  expect(glow.n === 8 && glow.hidden && glow.shown && /Glow$/.test(glow.tex) && isTok(addon, glow.color, "accent"), "a glow is eight hidden Glow pieces, shown in the accent").toBeTruthy();
});

it("proc glow on action buttons", () => {
  const addon = loggedIn(ACTIONS_ENV + "GetActionInfo = function(slot) if slot == 2 then return 'spell', 424242 end end");
  // Whether only button 2 (the one holding the spell) glows.
  const glowShown = () => addon.eval("return ForeverUI_Bar1Button2.glow[1]:IsShown() and not ForeverUI_Bar1Button1.glow[1]:IsShown()");
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_SHOW", 424242);
  expect(glowShown() === true, "a proc lights the button holding that spell, and only it").toBeTruthy();
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_HIDE", 424242);
  expect(addon.eval("return ForeverUI_Bar1Button2.glow[1]:IsShown()") === false, "and goes out when the proc ends").toBeTruthy();
});

// TEST-ONLY animation group: records the fade and finishes only when __finishFades() runs.
const FAKE_FADES = `
  __fades = {}
  function __fakeFader(frame)
    frame.CreateAnimationGroup = function()
      local g = { scripts = {} }
      function g:SetToFinalAlpha() end
      function g:Stop() self.playing = false end
      function g:SetScript(k, fn) self.scripts[k] = fn end
      function g:Play() self.playing = true table.insert(__fades, self) end
      function g:CreateAnimation() local a = {} function a:SetFromAlpha(v) g.from = v end function a:SetToAlpha(v) g.to = v end function a:SetDuration(v) g.duration = v end return a end
      return g
    end
  end
  function __finishFades()
    for _, g in ipairs(__fades) do if g.playing and g.scripts.OnFinished then g.playing = false g.scripts.OnFinished() end end
    __fades = {}
  end
`;

it("motion: fades, reduce motion, sounds", () => {
  const addon = loggedIn(CLICK_LUA + FAKE_FADES + "SOUNDKIT = { IG_MAINMENU_OPTION_CHECKBOX_ON = 856, IG_MAINMENU_OPTION_CHECKBOX_OFF = 857, IG_MAINMENU_OPEN = 850, IG_MAINMENU_CLOSE = 851, IG_CHARACTER_INFO_TAB = 841 } __sounds = {} PlaySound = function(k) table.insert(__sounds, k) end");
  addon.eval('local f = CreateFrame("Frame", "TEST_Fade", UIParent) __fakeFader(f) f:Hide() ns.Theme.FadeIn(f)');
  expect(addon.eval("return TEST_Fade:IsShown() and __fades[1].from == 0 and __fades[1].to == 1 and __fades[1].duration == 0.12") === true, "FadeIn shows the frame and fades it from 0 to 1 in 0.12 s").toBeTruthy();
  addon.eval("__finishFades() ns.Theme.FadeOut(TEST_Fade)");
  expect(addon.eval("return TEST_Fade:IsShown()") === true, "FadeOut keeps the frame up while it fades").toBeTruthy();
  addon.eval("__finishFades()");
  expect(addon.eval("return TEST_Fade:IsShown()") === false, "and hides it when the fade ends").toBeTruthy();
  addon.eval("ns.Theme.Settings().reduceMotion = true ns.Theme.FadeIn(TEST_Fade) ns.Theme.FadeOut(TEST_Fade)");
  expect(addon.eval("return #__fades == 0 and not TEST_Fade:IsShown()") === true, "Reduce motion skips fades").toBeTruthy();
  addon.eval("ns.Theme.Settings().reduceMotion = false");
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval("return __sounds[#__sounds]") === 850, "opening the window plays the open sound").toBeTruthy();
  addon.eval('__click("Snap to other frames")');
  expect(addon.eval("return __sounds[#__sounds]") === 857, "switching something off plays the off click").toBeTruthy();
  addon.eval('__click("Interface sounds") __sounds = {} __click("Snap to other frames")');
  expect(addon.eval("return #__sounds") === 0, "Interface sounds can be turned off").toBeTruthy();
});

it("unlock popover: anchor, offsets, reset", () => {
  const addon = loggedIn(UI_ENV);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "minimap" then __h = w end end __h:GetScript("OnMouseDown")(__h, "RightButton")');
  expect(addon.eval("return ForeverUI_MoverPopover:IsShown()") === true, "right-clicking a handle opens its popover").toBeTruthy();
  addon.eval('local p = ForeverUI_MoverPopover p.x:SetText("123") p.x:GetScript("OnEnterPressed")(p.x)');
  expect(addon.eval('return select(3, ns.MoverPoint("minimap"))') === 123, "typing an X offset saves it").toBeTruthy();
  addon.eval('local d = ForeverUI_MoverPopover.anchor d:GetScript("OnClick")(d) ForeverUI_Menu.items[5]:GetScript("OnClick")(ForeverUI_Menu.items[5])');
  const p = addon.eval('return { ns.MoverPoint("minimap") }');
  expect(p[0] === "CENTER" && p[2] === 0 && p[3] === 0, "picking an anchor moves the frame to that screen point with no offset").toBeTruthy();
  expect(addon.eval("return ForeverUI_MoverPopover.x:GetText()") === "0", "the boxes follow").toBeTruthy();
  addon.eval("ns.Nudge('minimap', 5, 0)");
  expect(addon.eval("return ForeverUI_MoverPopover.x:GetText()") === "5", "arrow-key nudges update the popover").toBeTruthy();
  addon.eval("ForeverUI_MoverPopover.reset:GetScript('OnClick')(ForeverUI_MoverPopover.reset)");
  expect(addon.eval('return select(1, ns.MoverPoint("minimap"))') !== "CENTER", "Reset puts the frame back where it started").toBeTruthy();
  addon.slash("lock");
  expect(addon.eval("return ForeverUI_MoverPopover:IsShown()") === false, "locking closes the popover").toBeTruthy();
});

it("special bars", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + `
    for i = 1, 10 do
      local b = CreateFrame("CheckButton", "PetActionButton" .. i, UIParent)
      b.icon = b:CreateTexture(nil, "ARTWORK")
      b.art = b:CreateTexture(nil, "BACKGROUND")
    end
    StanceButton1 = CreateFrame("CheckButton", "StanceButton1", UIParent)
    StanceButton1.icon = StanceButton1:CreateTexture(nil, "ARTWORK")
    ExtraActionButton1 = CreateFrame("CheckButton", "ExtraActionButton1", UIParent)`);
  addon.login();
  const pet = addon.eval("local b = PetActionButton3 return { skinned = b.fuiSkinned, art = b.art.__alpha, icon = b.icon.__alpha }");
  expect(pet.skinned === true && pet.art === 0 && pet.icon === undefined, "pet buttons are restyled: art faded, icon kept").toBeTruthy();
  expect(addon.eval("return StanceButton1.fuiSkinned and ExtraActionButton1.fuiSkinned") === true, "stance and extra action buttons too").toBeTruthy();
  const exit = addon.eval("local b = ForeverUI_VehicleExit return { type = b:GetAttribute('type'), macro = b:GetAttribute('macrotext'), driver = b.__states.visibility }");
  expect(exit.type === "macro" && exit.macro === "/leavevehicle", "the vehicle exit button leaves the vehicle").toBeTruthy();
  expect(/canexitvehicle/.test(exit.driver), "and only shows while you can leave").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.vehicleexit") === true, "it is movable").toBeTruthy();
});

// TEST-ONLY casts: __casts[unit] = { kind = "cast"|"channel", start, finish, shielded }.
const CAST_ENV = `
  __casts = {}
  UnitExists = function() return false end
  local function info(unit, kind)
    local c = __casts[unit]
    if not c or c.kind ~= kind then return nil end
    return "TEST-ONLY Spell", "", "TEST-ONLY-ICON", c.start, c.finish, false, c.shielded, c.shielded
  end
  UnitCastingInfo = function(unit) return info(unit, "cast") end
  UnitChannelInfo = function(unit) return info(unit, "channel") end
  PlayerCastingBarFrame = CreateFrame("StatusBar", "PlayerCastingBarFrame", UIParent)
  PlayerCastingBarFrame:RegisterEvent("UNIT_SPELLCAST_START")
`;

// A cast bar's state.
const castBar = (addon, unit) => addon.eval(`local b = ForeverUI_CastBar_${unit}
  return { shown = b:IsShown(), value = b.__value, color = b.__barColor, text = b.text:GetText(), icon = b.icon.__texture }`);

it("cast bars", () => {
  const addon = loggedIn(CAST_ENV);
  expect(castBar(addon, "player").shown === false, "no cast, no bar").toBeTruthy();
  addon.eval('__casts.player = { kind = "cast", start = 999000, finish = 1002000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.update(0.01);
  let b = castBar(addon, "player");
  expect(b.shown && b.text === "TEST-ONLY Spell" && b.icon === "TEST-ONLY-ICON", "a cast shows its name and icon").toBeTruthy();
  expect(Math.abs(b.value - 1010 / 3000) < 1e-6 && isTok(addon, b.color, "cast"), "the bar fills with the cast, in the cast color").toBeTruthy();
  addon.update(1.49);
  expect(Math.abs(castBar(addon, "player").value - 2500 / 3000) < 1e-6, "and keeps filling").toBeTruthy();
  addon.eval('__casts.target = { kind = "channel", start = 1000000, finish = 1004000, shielded = true }');
  addon.fire("UNIT_SPELLCAST_CHANNEL_START", "target");
  addon.update(0.01);
  b = castBar(addon, "target");
  expect(isTok(addon, b.color, "shielded") && b.value > 0.5 && b.value < 0.7, "a channel empties; an uninterruptible cast is gray").toBeTruthy();
  addon.eval('__casts.focus = { kind = "cast", start = { __secret = true }, finish = { __secret = true } }');
  addon.fire("UNIT_SPELLCAST_START", "focus");
  addon.update(0.1);
  expect(castBar(addon, "focus").value === 1, "hidden timings show a full bar (name and icon still shown)").toBeTruthy();
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  expect(castBar(addon, "player").shown === false, "the bar hides when the cast ends").toBeTruthy();
  expect(addon.eval("return PlayerCastingBarFrame:IsEventRegistered('UNIT_SPELLCAST_START')") === false, "the default cast bar is silenced").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.cast_player and out.cast_target and out.cast_focus") === true, "all three are movable").toBeTruthy();
});

it("cast bar flashes on finish and interrupt", () => {
  const addon = loggedIn(CAST_ENV + FAKE_FADES);
  addon.eval("__fakeFader(ForeverUI_CastBar_player)");
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  let b = castBar(addon, "player");
  expect(b.shown && b.value === 1 && isTok(addon, b.color, "good"), "a finished cast flashes full and green").toBeTruthy();
  addon.eval("__finishFades()");
  expect(castBar(addon, "player").shown === false, "then fades away").toBeTruthy();
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_INTERRUPTED", "player");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  b = castBar(addon, "player");
  expect(b.shown && isTok(addon, b.color, "bad") && b.text === "Interrupted", "an interrupted cast flashes red and says so (the STOP after it changes nothing)").toBeTruthy();
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect(isTok(addon, castBar(addon, "player").color, "cast") && castBar(addon, "player").text === "TEST-ONLY Spell", "a new cast replaces the flash at once").toBeTruthy();
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

it("events unsubscribe and a delivered event with no listeners", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local n = 0
    local function fn() n = n + 1 end
    -- TEST-ONLY event, not one the addon registers itself.
    ns.On("TEST_ONLY_EVENT", fn)
    ns.On("TEST_ONLY_EVENT", fn)
    local frame
    for _, w in ipairs(__wfgStub.frames) do
      if w.__events.TEST_ONLY_EVENT and w.__scripts.OnEvent then frame = w end
    end
    __wfgStub.fire("TEST_ONLY_EVENT")
    local once = n
    ns.Off("TEST_ONLY_EVENT", fn)
    __wfgStub.fire("TEST_ONLY_EVENT")
    frame:RegisterEvent("TEST_ONLY_EVENT")
    frame:GetScript("OnEvent")(frame, "TEST_ONLY_EVENT")
    -- TEST-ONLY event nobody subscribed to.
    return { once = once, after = n, offMissing = ns.Off("NO_SUCH_EVENT", fn) == nil }
  `);
  expect(out.once === 1 && out.after === 1 && out.offMissing === true, "a listener is registered once, Off removes it, and Off of nothing is a no-op").toBeTruthy();
});

it("mover coordinates with no handle", () => {
  const addon = loggedIn();
  expect(addon.eval('return ns.ShowCoords({ label = "TEST-ONLY" })') === null, "a mover that has no handle yet shows nothing").toBeTruthy();
});

it("skin SetFont and a UI scale change", () => {
  const addon = loggedIn();
  const size = addon.eval(`
    -- TEST-ONLY skin, only so SetFont runs.
    ForeverUI.RegisterSkin("TESTONLY", function(S)
      local fs = UIParent:CreateFontString()
      S.SetFont(fs)
      __size = select(2, fs:GetFont())
    end)
    return __size
  `);
  expect(size === 12, "S.SetFont with no size uses 12 when the font string has none").toBeTruthy();
  addon.fire("UI_SCALE_CHANGED");
  addon.fire("DISPLAY_SIZE_CHANGED");
  expect(addon.eval("return ns.Theme.PaintedCount()") > 0, "a scale change repaints").toBeTruthy();
});

it("slash commands for frames, accent, grid, theme, modules, skins, profile and spec", () => {
  const addon = loggedIn(`
    -- TEST-ONLY spec index the slash command prints.
    GetSpecialization = function() return 2 end
    -- TEST-ONLY version from C_AddOns.GetAddOnMetadata.
    C_AddOns = { GetAddOnMetadata = function() return "0.3.0" end }
  `);
  // TEST-ONLY skin name. The slash assertion matches this exact string.
  addon.eval('ForeverUI.RegisterSkin("TESTONLY", function() end)');
  addon.slash("frames");
  expect(chatHas(addon, /Movable frames:/), "/fui frames lists movers").toBeTruthy();
  addon.slash("accent reset");
  expect(chatHas(addon, /Accent back to default/), "/fui accent reset clears a custom accent").toBeTruthy();
  addon.slash("grid 1");
  expect(chatHas(addon, /Usage: \/fui grid/), "a grid size outside 8-256 is refused").toBeTruthy();
  addon.slash("theme");
  expect(chatHas(addon, /Usage: \/fui theme reset/), "/fui theme without reset is refused").toBeTruthy();
  addon.slash("modules");
  expect(chatHas(addon, /UnitFrames/), "/fui modules lists modules").toBeTruthy();
  // TEST-ONLY module name that does not exist.
  addon.slash("enable NoSuch");
  expect(chatHas(addon, /No module called NoSuch/), "an unknown module is refused").toBeTruthy();
  addon.slash("skins TESTONLY on");
  expect(chatHas(addon, /Skin for TESTONLY on/), "/fui skins on stores the choice").toBeTruthy();
  addon.slash("profile");
  expect(chatHas(addon, /Profile: Default/), "/fui profile with no name shows the current profile").toBeTruthy();
  addon.slash("spec");
  expect(chatHas(addon, /Spec 2 uses the character's profile/), "/fui spec with no name shows that no spec profile is set").toBeTruthy();
});

it("profile copy, empty export and a taken import name", () => {
  const addon = loggedIn();
  // TEST-ONLY profile name that was never created.
  expect(addon.eval('return ns.CopyProfile("Missing")') === false, "copying a profile that does not exist does nothing").toBeTruthy();
  expect(addon.eval("return ns.CopyProfile(ns.ProfileName())") === false, "copying a profile onto itself does nothing").toBeTruthy();
  // TEST-ONLY module name with nothing saved.
  const empty = addon.eval('local text, err = ns.ExportProfile("NoSuchModule") return { missing = text == nil, err = err }');
  expect(empty.missing === true && /nothing saved for NoSuchModule/.test(empty.err), "exporting a module with no saved table says so").toBeTruthy();
  const imported = addon.eval(`
    local text = ns.ExportProfile()
    -- TEST-ONLY profile already named Imported, so the next import is "Imported 2".
    ForeverUIDB.profiles.Imported = {}
    return ns.ImportProfile(text)
  `);
  expect(/Imported 2/.test(imported) && addon.eval("return ForeverUICharDB.profile") === "Imported 2", "a second whole-profile import takes the next free name").toBeTruthy();
});

it("a profile string with an unterminated quote", () => {
  const addon = loggedIn();
  const err = addon.eval(`
    local S = ns.Serialize
    -- TEST-ONLY profile body whose string never closes.
    local body = S.Base64('{["a"]="unterminated')
    local text = "FUI1:profile:" .. S.Checksum(body) .. ":" .. body
    local _, why = S.Decode(text)
    return why
  `);
  expect(/can't be read/.test(err), "an unterminated string inside a profile string is refused").toBeTruthy();
});

it("options slider, search, scroll, special bars and profile switch", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const scale = addon.eval(`
    local row
    for _, w in ipairs(__wfgStub.frames) do
      if w.track and w.min and w.label and w.label.__text == "Text size" then row = w end
    end
    row.set(row.max)
    row:GetScript("OnClick")(row)
    local wrapped = row.get()
    -- TEST-ONLY track geometry, and a cursor halfway along it.
    row.track.__left, row.track.__width = 0, 100
    GetCursorPosition = function() return 50 end
    row.track:GetScript("OnMouseDown")()
    __wfgStub.update(0.05)
    row.track:GetScript("OnMouseUp")()
    local dragged = row.get()
    ForeverUI_Options.search:SetText("")
    ForeverUI_Options.search:GetScript("OnTextChanged")(ForeverUI_Options.search)
    local hint = ForeverUI_Options.search.hint:IsShown()
    for _, w in ipairs(__wfgStub.frames) do
      if w.__scrollChild and w.__scripts.OnMouseWheel then
        -- TEST-ONLY page taller than its view, so the wheel can scroll.
        w.__height, w.__scrollChild.__height = 100, 800
        w:GetScript("OnMouseWheel")(w, -1)
      end
    end
    return { wrapped = wrapped, dragged = dragged, hint = hint }
  `);
  expect(scale.wrapped === 0.8 && Math.abs(scale.dragged - 1.05) < 1e-9 && scale.hint === true, "a slider wraps at the max, drags with the cursor, and the search hint shows while empty").toBeTruthy();
  expect(addon.eval('ns.Options.Show("actionbars") return __click("Restyle the pet, stance and extra action buttons (reload)")') === true, "the special-bars switch is on the action bar page").toBeTruthy();
  expect(addon.eval("return ForeverUIDB.profiles.Default.SpecialBars.skinPet") === false, "it turns pet, stance and extra bars off together").toBeTruthy();
  addon.eval('ns.NewProfile("TEST-ONLY Healer") ns.Options.Show("profiles")');
  expect(addon.eval('return __click("Use TEST-ONLY Healer")') === true, "each other profile gets a switch button").toBeTruthy();
  expect(addon.eval("return ns.ProfileName()") === "TEST-ONLY Healer", "the button switches to that profile").toBeTruthy();
});

it("choice fallback, key capture and the mouse wheel", () => {
  const addon = loggedIn(CLICK_LUA + `
    -- TEST-ONLY spec index so the click-cast page builds for spec 1.
    GetSpecialization = function() return 1 end`);
  // TEST-ONLY choice value that is not in the list.
  const fallback = addon.eval('return ns.Widgets.NextChoice({ { "a", "A" }, { "b", "B" } }, "missing")[1]');
  expect(fallback === "a", "a choice that is not in the list wraps to the first").toBeTruthy();
  addon.eval('ns.Options.Show("clickcast")');
  const captured = addon.eval(`
    __click("Set key")
    local cap, cycle
    for _, w in ipairs(__wfgStub.frames) do
      if w.capturing then cap = w end
      if w.caption == "Action" then cycle = w end
    end
    cap:GetScript("OnKeyDown")(cap, "F")
    local key = "F"
    for _, w in ipairs(__wfgStub.frames) do if w.keyText and w.keyText:GetText() ~= "" then key = w.keyText:GetText() end end
    __click("Set key")
    for _, w in ipairs(__wfgStub.frames) do if w.capturing then cap = w end end
    cap:GetScript("OnKeyDown")(cap, "ESCAPE")
    local cancelled = cap.capturing == false
    __click("Set key")
    for _, w in ipairs(__wfgStub.frames) do if w.capturing then cap = w end end
    cap:GetScript("OnMouseWheel")(cap, -1)
    local wheel = ""
    for _, w in ipairs(__wfgStub.frames) do if w.keyText then wheel = w.keyText:GetText() end end
    cycle:GetScript("OnClick")(cycle)
    local stepped = cycle.text:GetText()
    local calls = 0
    -- TEST-ONLY getter: the first read is an unknown action, then "spell".
    cycle.get = function() calls = calls + 1; return calls == 1 and "missing" or "spell" end
    cycle:GetScript("OnClick")(cycle)
    return { key = key, cancelled = cancelled, wheel = wheel, stepped = stepped, back = cycle.text:GetText() }
  `);
  expect(captured.key === "F (hover)" && captured.cancelled === true, "a key is captured, and Escape cancels").toBeTruthy();
  expect(captured.wheel === "Wheel down (hover)", "the wheel is captured as a hover binding").toBeTruthy();
  expect(captured.stepped === "Action: Macro" && captured.back === "Action: Spell", "the action cycle steps, and an unknown value wraps to the first").toBeTruthy();
  expect(addon.eval('return __click("Also on your player, target and focus frames (reload)")') === true, "unit-frame click casting is a switch on the page").toBeTruthy();
  expect(addon.eval("return ns.Settings('ClickCast').unitFrames") === true, "the switch turns it on").toBeTruthy();
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

it("cast timing from the client's duration object", () => {
  const addon = loggedIn(CAST_ENV);
  addon.eval(`
    -- TEST-ONLY duration object for the player's cast.
    UnitCastingDuration = function() return { __duration = true } end
    -- TEST-ONLY bar that accepts a duration object.
    ForeverUI_CastBar_player.SetTimerDuration = function() __timer = true return true end
    -- TEST-ONLY cast the duration object is applied to.
    __casts.player = { kind = "cast", start = 1000, finish = 2000, shielded = false }
  `);
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect(addon.eval("return __timer") === true, "a cast uses the client's duration object when the bar accepts one").toBeTruthy();
  expect(addon.eval('return ForeverUI_CastBar_player:GetScript("OnUpdate")') === null, "and then does not tick the bar itself").toBeTruthy();
});

it("action button cooldowns, the C_ActionBar API and range polling", () => {
  const addon = loggedIn(ACTIONS_ENV + `
    -- TEST-ONLY: no unit exists, so range polling does not mark buttons red.
    UnitExists = function() return false end`);
  addon.update(0.25);
  expect(addon.eval("return ForeverUI_Bar1Button1.outOfRange") === false, "without range events, buttons are polled and an unknown range is not red").toBeTruthy();
  addon.eval(`
    C_ActionBar = { GetActionTexture = function() return "TEST-ONLY-CAPI" end }
    ns.GetModule("ActionBars").UpdateButton(ForeverUI_Bar1Button1)
  `);
  expect(addon.eval("return ForeverUI_Bar1Button1.icon.__texture") === "TEST-ONLY-CAPI", "C_ActionBar is used when it has the call").toBeTruthy();
  addon.eval(`
    -- TEST-ONLY cooldown duration object.
    GetActionCooldownDuration = function() return { __duration = true } end
    -- TEST-ONLY sweep that records the duration object.
    ForeverUI_Bar1Button1.cooldown.SetCooldownFromDurationObject = function() __obj = true return true end
  `);
  addon.fire("ACTIONBAR_UPDATE_COOLDOWN");
  expect(addon.eval("return __obj") === true, "a cooldown duration object is passed straight to the sweep").toBeTruthy();
  addon.eval(`
    GetActionCooldownDuration = nil
    -- TEST-ONLY cooldown given as a table of start and duration.
    GetActionCooldown = function() return { startTime = 5, duration = 2 } end
  `);
  addon.fire("ACTIONBAR_UPDATE_COOLDOWN");
  const cd = addon.eval("return ForeverUI_Bar1Button1.cooldown.__cooldown");
  expect(cd[0] === 5 && cd[1] === 2, "a cooldown given as a table uses its start and duration").toBeTruthy();
});

it("minimap with no position, chat window hooks, and short numbers", () => {
  const addon = loggedIn(`
    __hooks = {}
    -- TEST-ONLY chat hooks: hooksecurefunc, FCF_OpenTemporaryWindow and FCF_Tab_OnClick.
    hooksecurefunc = function(name, fn) __hooks[name] = fn end
    function FCF_OpenTemporaryWindow() end
    function FCF_Tab_OnClick() end
  `);
  expect(addon.eval('return ns.GetModule("Minimap").CoordsText()') === "", "coordinates are blank when the client has no map position").toBeTruthy();
  expect(addon.eval("return type(__hooks.FCF_OpenTemporaryWindow)") === "function", "a new whisper window is skinned when it opens").toBeTruthy();
  expect(addon.eval("return type(__hooks.FCF_Tab_OnClick)") === "function", "clicking a chat tab refreshes the tabs").toBeTruthy();
  expect(addon.eval('return ns.GetModule("DataBars").Short(1500000)') === "1.5M", "a million is shown as millions").toBeTruthy();
  expect(addon.eval('return ns.GetModule("DataBars").Short(12)') === "12", "a small number is shown whole").toBeTruthy();
});

it("click-casting validation, labels and unit frames", () => {
  const addon = loggedIn("", {
    // TEST-ONLY saved profile: unit-frame click casting starts on.
    savedVariables: "ForeverUIDB = { profiles = { Default = { ClickCast = { unitFrames = true } } } }",
  });
  const CC = 'ns.GetModule("ClickCast")';
  const bad = addon.eval(`local ok, err = ${CC}.Add("1", "spell", "   ") return err`);
  expect(bad === "type or drag a spell", "a spell binding with no spell is refused").toBeTruthy();
  expect(addon.eval(`local _, err = ${CC}.Add("1", "macro", "") return err`) === "type the macro text", "a macro binding with no text is refused").toBeTruthy();
  expect(addon.eval(`return ${CC}.ActionText({ action = "target" })`) === "Target", "a target binding reads as Target").toBeTruthy();
  expect(addon.eval(`return ${CC}.ActionText({ action = "menu" })`) === "Menu", "anything else reads as Menu").toBeTruthy();
  const frames = addon.eval(`local n = 0 for _ in pairs(ns.GetModule("UnitFrames").frames) do n = n + 1 end return n`);
  expect(addon.eval(`return #${CC}.frames`) >= frames && frames > 0, "unit frames are registered when that setting is on").toBeTruthy();
});

it("a dropped spell named by GetSpellInfo", () => {
  const addon = loggedIn(`
    -- TEST-ONLY: C_Spell is absent, so the name comes from GetSpellInfo.
    C_Spell = nil
    -- TEST-ONLY spell id on the cursor.
    GetSpellInfo = function(id) return id == 90001 and "TEST-ONLY Spark" or nil end
    GetCursorInfo = function() return "spell", nil, nil, 90001 end
    -- TEST-ONLY cursor clear, so the drop can finish.
    ClearCursor = function() __cleared = true end
  `);
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then w.input:GetScript("OnReceiveDrag")(w.input) end end');
  expect(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.input:GetText() end end") === "TEST-ONLY Spark", "without C_Spell.GetSpellName, the dropped spell's name comes from GetSpellInfo").toBeTruthy();
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

it("cast bars: spark, seconds left, latency and the uninterruptible edge", () => {
  const addon = loggedIn(CAST_ENV + 'GetNetStats = function() return 0, 0, 40, 150 end');
  addon.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__wfgStub.update(1)");
  const b = addon.eval(`local b = ForeverUI_CastBar_player
    return { time = b.time:GetText(), lag = b.lag:IsShown() and b.lag.__width, width = b:GetWidth(), spark = b.spark.__points.TOP.relPoint }`);
  expect(b.time === "2.0", "the seconds left, at the bar's right").toBeTruthy();
  expect(b.lag === b.width * 150 / 3000, "your latency shaded at the end of your cast (world latency)").toBeTruthy();
  expect(b.spark === "TOPRIGHT", "a spark rides the fill's edge").toBeTruthy();
  addon.eval('__casts.target = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000, shielded = true }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  const t = addon.eval(`local b = ForeverUI_CastBar_target local edge
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == b and w.__layer == "BORDER" then edge = w.__vertexColor break end end
    return { lag = b.lag:IsShown(), edge = edge }`);
  expect(t.lag === false && isTok(addon, t.edge, "shielded"), "no latency on others' bars; a cast you can't interrupt gets a gray edge").toBeTruthy();
  const noStats = loggedIn(CAST_ENV + "GetNetStats = nil");
  noStats.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  noStats.fire("UNIT_SPELLCAST_START", "player");
  expect(noStats.eval("return ForeverUI_CastBar_player.lag:IsShown()") === false, "no latency shade where the client can't say").toBeTruthy();
  const homeOnly = loggedIn(CAST_ENV + "GetNetStats = function() return 0, 0, 60, { __secret = true } end");
  homeOnly.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  homeOnly.fire("UNIT_SPELLCAST_START", "player");
  expect(homeOnly.eval("return ForeverUI_CastBar_player.lag.__width") === homeOnly.eval("return ForeverUI_CastBar_player:GetWidth()") * 60 / 3000, "home latency when world latency is hidden").toBeTruthy();
});

it("unit frames on WoW Forever: levels, health percent, classification", () => {
  const addon = loggedIn(UNITS_ENV + FOREVER_ENV + `
    UnitLevel = function(unit) return ({ player = 60, target = -1, focus = { __secret = true } })[unit] or 12 end
    GetCreatureDifficultyColor = function(level) return { r = 1, g = 0.1, b = 0.1 } end
    UnitClassification = function(unit) return ({ target = "worldboss", focus = "rare" })[unit] or "normal" end
    CurveConstants = { ScaleTo100 = { __curve = true } }
    UnitHealthPercent = function(unit, predicted, curve) return 84 end
    __units.focus = { name = "TEST-ONLY Focus", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }`, NO_RAID);
  addon.fire("PLAYER_TARGET_CHANGED");
  addon.fire("PLAYER_FOCUS_CHANGED");
  const f = addon.eval(`local p, t, fo = ForeverUI_player, ForeverUI_target, ForeverUI_focus
    return { level = p.level:GetText(), color = p.level.__textColor, boss = t.level:GetText(), hidden = fo.level:GetText(), hiddenColor = fo.level.__textColor,
      health = p.healthText:GetText(), mark = t.class:IsShown() and t.class.__vertexColor, rare = fo.class.__vertexColor, playerMark = p.class }`);
  expect(f.level === "60" && f.color[1] === 0.1 && f.boss === "??" && f.hidden === "", "the level left of the name, colored by difficulty; ?? for a boss; nothing when hidden").toBeTruthy();
  expect(isTok(addon, f.hiddenColor, "text2"), "a hidden level falls back to the plain text color").toBeTruthy();
  expect(f.health === "84%", "health as a percent from the client's own percent").toBeTruthy();
  expect(isTok(addon, f.mark, "bad") && isTok(addon, f.rare, "text2") && f.playerMark == null, "a diamond marks bosses, rares and elites on the target and focus").toBeTruthy();
  addon.eval("UnitLevel = function(unit) return unit == 'player' and 61 or 12 end");
  addon.fire("UNIT_LEVEL", "player");
  expect(addon.eval("return ForeverUI_player.level:GetText()"), "when you level, your frame shows the new level").toBe("61");
  addon.eval("UnitLevel = function(unit) return unit == 'player' and 62 or 14 end");
  addon.fire("PLAYER_LEVEL_UP", 62);
  expect(addon.eval("return { ForeverUI_player.level:GetText(), ForeverUI_target.level:GetText() }"), "a level-up refreshes every frame (their level colors are relative to yours)").toEqual(["62", "14"]);
  addon.eval("UnitHealthPercent = function() error('TEST-ONLY') end");
  addon.fire("UNIT_HEALTH", "player");
  expect(addon.eval("return ForeverUI_player.healthText:GetText()") === "900", "if the client's percent fails, the value shows").toBeTruthy();
  const retail = loggedIn(UNITS_ENV, NO_RAID);
  expect(retail.eval("return ForeverUI_player.level") === null && retail.eval("return ForeverUI_player.healthText:GetText()") === "900", "elsewhere: no level, health as a value").toBeTruthy();
});

it("combo points for rogues and druids", () => {
  const addon = loggedIn(UNITS_ENV + `__units.player.class = "ROGUE" __cp = 3
    GetComboPoints = function(unit, target) return __cp end`, NO_RAID);
  // The pips' state: shown, how many lit, how many in all.
  const pips = () => addon.eval(`local CP = ns.GetModule("ComboPoints") local lit = 0
    for _, p in ipairs(CP.pips) do if p.fill:IsShown() then lit = lit + 1 end end
    return { shown = CP.bar:IsShown(), lit = lit, n = #CP.pips }`);
  let p = pips();
  expect(p.shown && p.lit === 3 && p.n === 5, "five pips above the player frame, one lit per point").toBeTruthy();
  addon.eval("__cp = 0");
  addon.fire("UNIT_POWER_UPDATE", "player", "COMBO_POINTS");
  expect(pips().shown === false, "hidden while you have no points").toBeTruthy();
  addon.eval("__cp = { __secret = true }");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(pips().shown === false, "a hidden count shows nothing").toBeTruthy();
  const druid = loggedIn(UNITS_ENV + `__units.player.class = "DRUID"
    Enum = Enum or {} Enum.PowerType = { ComboPoints = 4 } UnitPower = function(unit, kind) return kind == 4 and 2 or 0 end`, NO_RAID);
  expect(druid.eval('local CP = ns.GetModule("ComboPoints") return CP.bar:IsShown() and CP.Count()') === 2, "without the older call, your combo-point power is read").toBeTruthy();
  const mage = loggedIn(UNITS_ENV, NO_RAID);
  expect(mage.eval('return ns.GetModule("ComboPoints").bar') === null, "other classes build nothing").toBeTruthy();
  const noFrames = loggedIn(UNITS_ENV + '__units.player.class = "ROGUE"', { savedVariables: "ForeverUIDB = { profiles = { Default = { modules = { UnitFrames = false, RaidFrames = false } } } }" });
  expect(noFrames.eval('local CP = ns.GetModule("ComboPoints") CP.Update() return CP.bar') === null, "no player frame, no pips").toBeTruthy();
});

it("action bar cooldown numbers in the theme's font", () => {
  const addon = loggedIn(UNITS_ENV + ACTIONS_ENV);
  const cd = addon.eval(`local cd = ForeverUI_Bar1Button1.cooldown local fs = cd:GetCountdownFontString() return { font = fs.__font, color = fs.__textColor }`);
  expect(cd.font[0].includes("SemiBold") && cd.font[1] === 14, "the client's countdown numbers use the theme's bold font").toBeTruthy();
});

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = ForeverUI_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);

// The setup wizard's state: the step showing (0 while closed), the account flag, and whether frames are unlocked.
const setupState = (addon) => addon.eval("return { step = ns.Setup.Step() or 0, done = ForeverUIDB.setupDone == true, unlocked = ns.Unlocked() }");

// The border color of a painted frame (its BORDER-layer edge texture).
const borderOf = (addon, lua) => addon.eval(`local f = ${lua}
  for _, w in ipairs(__wfgStub.frames) do
    if w.__parent == f and w.__layer == "BORDER" and w.__kind == "Texture" then return w.__vertexColor end
  end`);

it("first-run setup: once per account, three clicks with the defaults", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  expect(setupState(addon), "a new account opens setup at step 1").toEqual({ step: 1, done: false, unlocked: false });
  expect(addon.eval("return ForeverUI_Setup.caption:GetText()"), "the caption names the step").toBe("Step 1 of 3 · Layout");
  expect(addon.eval("return ForeverUI_Setup.back:IsShown()"), "there is no Back on the first step").toBe(false);
  expect(addon.eval("return UISpecialFrames[#UISpecialFrames]"), "Escape closes setup").toBe("ForeverUI_Setup");
  setupClick(addon, "next");
  expect(setupState(addon).step === 2 && addon.eval("return ForeverUI_Setup.back:IsShown()"), "Next goes to Look, which has Back").toBe(true);
  setupClick(addon, "next");
  expect(setupState(addon), "the last step unlocks the frames").toEqual({ step: 3, done: false, unlocked: true });
  expect(addon.eval("return ForeverUI_Setup.next.text:GetText()"), "the last step's button is Done").toBe("Done");
  setupClick(addon, "next");
  expect(setupState(addon), "Done closes setup, locks the frames and remembers that setup ran").toEqual({ step: 0, done: true, unlocked: false });
  const kept = addon.eval("return { raid = ForeverUIDB.profiles.Default.positions.raid == nil, look = ns.Settings('RaidFrames').look, brass = select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.brass[1] }");
  expect(kept, "the defaults change no position, style or accent").toEqual({ raid: true, look: "soft", brass: true });
  const again = loggedIn("", { firstRun: true, savedVariables: "ForeverUIDB = { setupDone = true }" });
  expect(again.eval("return ForeverUI_Setup == nil"), "setup does not open again on this account").toBe(true);
});

it("first-run setup waits for combat and steps aside in a fight", () => {
  const addon = loggedIn("__wfgStub.inCombat = true", { firstRun: true });
  expect(setupState(addon).step, "logging in during combat does not open setup").toBe(0);
  expect(chatHas(addon, /Setup opens when combat ends/), "it says when setup will open").toBe(true);
  const queued = addon.eval("return ns.QueuedCount()");
  addon.slash("setup");
  expect(addon.eval("return ns.QueuedCount()"), "asking again in combat queues nothing more").toBe(queued);
  setCombat(addon, false);
  expect(setupState(addon).step, "setup opens once combat ends").toBe(1);
  setupClick(addon, "next");
  setupClick(addon, "next");
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(setupState(addon), "a fight hides setup and locks the frames, without finishing it").toEqual({ step: 0, done: false, unlocked: false });
  setCombat(addon, false);
  expect(setupState(addon), "after the fight setup comes back on the same step, frames unlocked").toEqual({ step: 3, done: false, unlocked: true });
  addon.slash("setup");
  expect(setupState(addon), "/fui setup starts again at step 1 and locks the frames").toEqual({ step: 1, done: false, unlocked: false });
});

it("/fui setup reopens setup; Back and the close button", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /setup\s+first-run setup again/), "/fui help lists setup").toBe(true);
  addon.slash("setup");
  expect(setupState(addon).step, "/fui setup opens it on an account that finished setup").toBe(1);
  setupClick(addon, "next");
  setupClick(addon, "back");
  expect(setupState(addon).step, "Back returns to the previous step").toBe(1);
  setupClick(addon, "close");
  expect(setupState(addon), "the close button ends setup").toEqual({ step: 0, done: true, unlocked: false });
  const upgraded = loggedIn("", { firstRun: true, savedVariables: 'ForeverUIDB = { version = 1, profiles = { Default = { theme = { reduceMotion = true } } } }' });
  expect(setupState(upgraded).step, "an account from before setup existed sees it once").toBe(1);
  upgraded.eval("ForeverUI_Setup:Hide()");
  expect(setupState(upgraded), "Escape (the client hides the frame) ends setup too").toEqual({ step: 0, done: true, unlocked: false });
});

it("setup layouts: Healing puts the raid frames under the character and turns click casting on", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const layouts = addon.eval("local out = {} for i, b in ipairs(ForeverUI_Setup.pages[1].choices) do out[i] = b.text:GetText() end return out");
  expect(layouts, "there are two layouts, Damage and tanking first").toEqual(["Damage and tanking", "Healing"]);
  expect(addon.eval('return __click("Healing")') && addon.eval("return ForeverUI_Setup.pages[1].hint:GetText()"), "picking Healing shows what it does").toMatch(/click casting on/);
  expect(borderOf(addon, "ForeverUI_Setup.pages[1].choices[2]"), "the chosen layout is outlined in the accent").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing centers the raid frames just above the player cast bar").toEqual(["BOTTOM", "BOTTOM", 0, 224]);
  expect(addon.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "click casting and the raid frames are on").toBe(true);
  setupClick(addon, "next");
  setupClick(addon, "next");
  expect(addon.eval("return ForeverUI_Reload == nil"), "nothing was off, so no reload is offered").toBe(true);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "ForeverUIDB = { profiles = { Default = { modules = { ClickCast = false, RaidFrames = false } } } }" });
  off.eval('__click("Healing")');
  setupClick(off, "next");
  expect(off.eval("return ForeverUIDB.profiles.Default.positions.raid"), "without raid frames built, the spot is saved for next time").toEqual({ point: "BOTTOM", relPoint: "BOTTOM", x: 0, y: 224 });
  expect(off.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "Healing turns click casting and the raid frames on").toBe(true);
  setupClick(off, "next");
  setupClick(off, "next");
  expect(off.eval("return ForeverUI_Reload:IsShown() and ForeverUI_Reload.title:GetText()"), "a module that was off offers a reload at the end").toMatch(/Setup turned on a module that was off/);
});

it("setup layouts: Damage and tanking restores ForeverUI's defaults, undoing Healing", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const home = addon.eval("return { ns.MoverPoint('raid') }");
  addon.eval('__click("Healing")');
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing moved the raid frames").not.toEqual(home);
  addon.slash("setup");
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "re-running setup with the default layout puts the raid frames back").toEqual(home);
  expect(addon.eval("return ForeverUIDB.profiles.Default.positions.raid == nil"), "and forgets the saved spot").toBe(true);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: 'ForeverUIDB = { profiles = { Default = { modules = { RaidFrames = false }, positions = { raid = { point = "TOP", relPoint = "CENTER", x = 0, y = -200 } } } } }' });
  setupClick(off, "next");
  expect(off.eval("return ForeverUIDB.profiles.Default.positions.raid == nil"), "without raid frames built, the saved spot is cleared for next time").toBe(true);
});

// Where a point name sits across and up a rect (0 = left or bottom, 1 = right or top).
const ACROSS = (point) => (/LEFT/.test(point) ? 0 : /RIGHT/.test(point) ? 1 : 0.5);
const UP = (point) => (/BOTTOM/.test(point) ? 0 : /TOP/.test(point) ? 1 : 0.5);

// The rect { l, b, r, t } of a w x h frame anchored at [point, relPoint, x, y] on UIParent, on an sw x sh screen.
function rectAt([point, relPoint, x, y], w, h, sw, sh) {
  const l = ACROSS(relPoint) * sw + x - ACROSS(point) * w;
  const b = UP(relPoint) * sh + y - UP(point) * h;
  return { l, b, r: l + w, t: b + h };
}

// True when two rects overlap (touching edges don't count).
const overlaps = (a, c) => a.l < c.r && c.l < a.r && a.b < c.t && c.b < a.t;

// The frames Healing must stay clear of, as { key: [point, relPoint, x, y, w, h] } from the addon's movers and frames.
const healingNeighbours = (addon) => addon.eval(`
  local out = {}
  local frames = { cast_player = ForeverUI_CastBar_player, uf_player = ForeverUI_player, uf_target = ForeverUI_target }
  for n = 1, 8 do frames["bar" .. n] = _G["ForeverUI_Bar" .. n] end
  for key, f in pairs(frames) do
    local p, rp, x, y = ns.MoverPoint(key)
    if p then out[key] = { p, rp, x, y, f:GetWidth(), f:GetHeight() } end
  end
  return out`);

// The raid block for g side-by-side groups of five, sized from the raid header's own attributes.
const raidBlock = (addon, groups) => addon.eval(`local h = ForeverUI_Raid
  local w, ht, gap, dy = h:GetAttribute("fui-width"), h:GetAttribute("fui-height"), h:GetAttribute("columnSpacing"), -h:GetAttribute("yOffset")
  local rows = h:GetAttribute("unitsPerColumn")
  return { ${groups} * w + (${groups} - 1) * gap, rows * ht + (rows - 1) * dy }`);

it("setup Healing layout: clear of the bars, the cast bar, and the player and target frames", () => {
  const addon = loggedIn(ACTIONS_ENV + UNITS_ENV + RAID_ENV, { firstRun: true });
  const cast = addon.eval("return ns.GetModule('CastBars').LAYOUT.player");
  expect(cast.point[0], "the cast bar is anchored by its bottom, so its top is y + height").toBe("BOTTOM");
  expect(addon.eval("return ns.Setup.HealingPoint()"), "Healing: centered, one layout gap above the cast bar's top").toEqual(["BOTTOM", "BOTTOM", 0, cast.point[3] + cast.h + addon.eval("return ns.Layout.GAP")]);
  addon.eval("ns.Setup.ApplyLayout('healing')");
  const at = addon.eval("return { ns.MoverPoint('raid') }");
  const near = healingNeighbours(addon);
  expect(["bar1", "bar2", "bar3", "cast_player", "uf_player", "uf_target"].every((k) => near[k]), "the default layout has the bottom bars, the cast bar, and the player and target frames").toBe(true);
  const bars = Object.keys(near).filter((k) => k.startsWith("bar"));
  // 1366 x 768 is UI scale 1; 2133 x 1200 is 1080p at UI scale 0.64.
  for (const [sw, sh] of [[1366, 768], [2133, 1200]]) {
    // A neighbour's rect on this screen.
    const rect = (key) => rectAt(near[key].slice(0, 4), near[key][4], near[key][5], sw, sh);
    // Whether a raid of this many groups, at the Healing spot, overlaps none of these neighbours.
    const clearOf = (groups, keys) => {
      const [w, h] = raidBlock(addon, groups);
      const r = rectAt(at, w, h, sw, sh);
      return keys.every((k) => !overlaps(r, rect(k)));
    };
    const [w1, h1] = raidBlock(addon, 1);
    expect(rectAt(at, w1, h1, sw, sh).b - rect("cast_player").t, `${sw}x${sh}: one layout gap above the cast bar`).toBe(6);
    for (let g = 1; g <= 8; g += 1) expect(clearOf(g, [...bars, "cast_player"]), `${sw}x${sh}: ${g} group(s) clear every action bar and the cast bar`).toBe(true);
    // N: the most groups (a party is one column, like one group) that fit between the player and target frames.
    let n = 0;
    while (n < 8 && clearOf(n + 1, ["uf_player", "uf_target"])) n += 1;
    // Cutoff: with 100 px tiles, 2 groups (204 px wide) fit the 300 px between the player and target frames; 3 groups (308 px) overlap them.
    expect(n, `${sw}x${sh}: a party and raids of up to 2 groups clear the player and target frames; 3 or more overlap them`).toBe(2);
  }
});

it("setup look: accent swatches and the raid frame style apply at once", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  setupClick(addon, "next");
  expect(borderOf(addon, "ForeverUI_Setup.pages[2].swatches[1]"), "the current accent (brass) is outlined").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  addon.eval("local s = ForeverUI_Setup.pages[2].swatches[2] s:GetScript('OnClick')(s)");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the second swatch sets the arcane accent").toBe(true);
  expect(borderOf(addon, "ForeverUI_Setup.pages[2].swatches[1]"), "brass is no longer outlined").toEqual(tok(addon, "edge").slice(0, 4));
  expect(addon.eval("local p = ForeverUI_Setup.pages[2] return { p.swatches[1].check:IsShown(), p.swatches[2].check:IsShown() }"), "the check moves to the chosen swatch").toEqual([false, true]);
  addon.eval("local b = ForeverUI_Setup.pages[2].styles[2] b:GetScript('OnClick')(b)");
  expect(addon.eval("return ns.Settings('RaidFrames').look"), "a style button sets the raid frame style").toBe("dark");
  expect(borderOf(addon, "ForeverUI_Setup.pages[2].styles[2]"), "the chosen style is outlined").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
});

// TEST-ONLY power: your power type and your spells' costs (90001 costs mana, 90002 costs nothing).
const TICKS_ENV = `
  __ptype = 0
  UnitPowerType = function() return __ptype end
  __costs = { [90001] = { { type = 0, cost = 20 } }, [90002] = { { type = 0, cost = 0 } } }
  C_Spell = C_Spell or {}
  C_Spell.GetSpellPowerCost = function(id) return __costs[id] end
`;

// The spark: shown, where it sits along the bar (its TOP point's x) and whether its timer runs.
const spark = (addon) => addon.eval(`local PT = ns.GetModule("PowerTicks") local top = PT.spark.__points.TOP
  return { PT.spark:IsShown(), top and top.x or -1, PT.driver.__scripts.OnUpdate ~= nil }`);

it("power ticks: the five-second rule after a mana spell", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV);
  addon.eval("ns.GetModule('PowerTicks').bar:SetWidth(200)");
  expect(addon.eval("local PT = ns.GetModule('PowerTicks') return { PT.mode, PT.spark:GetParent() == ForeverUI_player.power }"), "a mana user gets the mana spark on the player frame's power bar").toEqual(["mana", true]);
  expect(spark(addon), "no spark before a cast").toEqual([false, -1, false]);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "target", "x", 90001);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90002);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", { __secret: true });
  expect(spark(addon)[0], "another unit's cast, a free spell or a hidden spell starts nothing").toBe(false);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  expect(spark(addon), "a mana spell starts the spark at the left").toEqual([true, 0, true]);
  addon.eval("__wfgStub.advance(2.5)");
  expect(spark(addon)[1], "halfway through the five seconds it's halfway along").toBe(100);
  addon.eval("__wfgStub.advance(3)");
  expect([spark(addon)[0], spark(addon)[2]], "after five seconds it hides and its timer stops").toEqual([false, false]);
  addon.fire("UNIT_POWER_FREQUENT", "player", "MANA");
  expect(spark(addon)[0], "mana going up is not an energy tick").toBe(false);
  addon.eval("C_Spell.GetSpellPowerCost = nil");
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  expect(spark(addon)[0], "a client that can't say what a spell costs: no spark").toBe(false);
});

it("power ticks: energy every two seconds, and forms switch", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV + "__ptype = 3");
  addon.eval("ns.GetModule('PowerTicks').bar:SetWidth(200)");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon)[0], "the first reading is only a starting point").toBe(false);
  addon.eval("__units.player.power = 70");
  addon.fire("UNIT_POWER_FREQUENT", "target", "ENERGY");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon), "energy going up is a tick: the spark starts").toEqual([true, 0, true]);
  addon.eval("__wfgStub.advance(2.5)");
  expect(spark(addon), "and keeps crossing every two seconds").toEqual([true, 50, true]);
  addon.eval("__units.player.power = { __secret = true }");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  addon.eval("__units.player.power = 10");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon)[1], "a hidden value and a drop (an ability) don't restart it").toBe(50);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  expect(spark(addon)[1], "casts don't move the energy spark").toBe(50);
  addon.fire("UNIT_DISPLAYPOWER", "player");
  expect(spark(addon)[0], "the same power type keeps it").toBe(true);
  addon.eval("__ptype = 1");
  addon.fire("UPDATE_SHAPESHIFT_FORM");
  expect([addon.eval("return ns.GetModule('PowerTicks').mode"), ...spark(addon)], "rage (bear form) has no spark").toEqual([null, false, 50, false]);
});

it("power ticks: switches, and no player frame", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Five-second rule") and ns.GetModule("PowerTicks").mode'), "the mana spark switches off at once").toBe(null);
  expect(addon.eval('return __click("Energy tick") and ForeverUIDB.profiles.Default.PowerTicks.energy'), "the energy switch is on the page").toBe(false);
  const off = loggedIn(UNITS_ENV + TICKS_ENV + "__ptype = 3", { savedVariables: "ForeverUIDB.profiles = { Default = { PowerTicks = { energy = false } } }" });
  expect(off.eval("return ns.GetModule('PowerTicks').mode"), "energy switched off: no spark").toBe(null);
  const noFrames = loggedIn(UNITS_ENV + TICKS_ENV + CLICK_LUA, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { UnitFrames = false } } }" });
  expect(noFrames.eval("return ns.GetModule('PowerTicks').spark == nil"), "no player frame, no spark").toBe(true);
  noFrames.slash("");
  noFrames.eval('__click("Unit frames")');
  expect(noFrames.eval('return __click("Five-second rule") and ForeverUIDB.profiles.Default.PowerTicks.mana'), "the switch still saves").toBe(false);
});

// TEST-ONLY swings: a client with the swing timer, and you a warrior.
const SWING_ENV = `
  __units.player.class = "WARRIOR"
  C_SwingTimer = {}
  Enum = Enum or {}
  Enum.PlayerSwingType = { MainHand = 0, OffHand = 1, Ranged = 2 }
`;

// Each swing row: shown, its fill (value of max) and its seconds left.
const swings = (addon) => addon.eval(`local SW = ns.GetModule("SwingTimer") local out = {}
  for id = 0, 2 do local r = SW.rows[id] out[id + 1] = { r:IsShown(), r:GetValue(), select(2, r:GetMinMaxValues()), r.time:GetText() } end
  return out`);

it("swing timer: a row per hand, from the client's own swings", () => {
  const addon = loggedIn(UNITS_ENV + SWING_ENV);
  expect(swings(addon).map((r) => r[0]), "nothing shows before you swing").toEqual([false, false, false]);
  addon.fire("PLAYER_SWING", 2.6, 0);
  addon.fire("PLAYER_SWING", 1.4, 1);
  expect(swings(addon).slice(0, 2), "main hand and off hand start empty, timed by the client").toEqual([[true, 0, 2.6, "2.6"], [true, 0, 1.4, "1.4"]]);
  addon.eval("__wfgStub.advance(1)");
  expect(swings(addon)[0], "a second later the main hand has filled that much").toEqual([true, 1, 2.6, "1.6"]);
  addon.eval("__wfgStub.advance(0.5)");
  expect(swings(addon)[1][0], "the off hand hides once its swing lands").toBe(false);
  addon.fire("PLAYER_SWING", { __secret: true }, 0);
  addon.fire("PLAYER_SWING", 0, 0);
  addon.fire("PLAYER_SWING", 2, 7);
  expect(swings(addon)[0][1], "a hidden or empty length, or an unknown hand, changes nothing").toBe(1.5);
  addon.eval("__wfgStub.advance(2)");
  expect([swings(addon)[0][0], addon.eval("return ForeverUI_SwingTimer.__scripts.OnUpdate == nil")], "once every swing has landed the timer stops").toEqual([false, true]);
  addon.fire("PLAYER_SWING", 2, 2);
  addon.fire("PLAYER_DEAD");
  expect(swings(addon)[2][0], "dying clears the rows").toBe(false);
});

it("swing timer: who sees it", () => {
  // Whether a login with this setup and these saved settings builds the swing rows.
  const wanted = (env, saved) => loggedIn(UNITS_ENV + env, saved ? { savedVariables: saved } : undefined).eval("return ns.GetModule('SwingTimer').rows ~= nil");
  expect(wanted(SWING_ENV.replace("WARRIOR", "MAGE")), "a mage doesn't, by default").toBe(false);
  expect(wanted(SWING_ENV.replace("WARRIOR", "MAGE"), "ForeverUIDB.profiles = { Default = { SwingTimer = { show = 'always' } } }"), "unless it's set to always").toBe(true);
  expect(wanted(SWING_ENV, "ForeverUIDB.profiles = { Default = { SwingTimer = { show = 'never' } } }"), "never is never").toBe(false);
  expect(wanted(SWING_ENV.replace('"WARRIOR"', '{ __secret = true }')), "a hidden class: no timer").toBe(false);
  expect(wanted(SWING_ENV.replace("C_SwingTimer = {}", "")), "a client without swings: no timer").toBe(false);
  expect(wanted(SWING_ENV + "Enum.PlayerSwingType = nil"), "or without swing types").toBe(false);
  const partial = loggedIn(UNITS_ENV + SWING_ENV + "Enum.PlayerSwingType = { MainHand = 0 }");
  expect(partial.eval("local n = 0 for _ in pairs(ns.GetModule('SwingTimer').rows) do n = n + 1 end return n"), "a row only for each hand the client names").toBe(1);
  const addon = loggedIn(UNITS_ENV + SWING_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Swing timer") and ForeverUIDB.profiles.Default.SwingTimer.show'), "the switch is on the page").toBe("always");
});
