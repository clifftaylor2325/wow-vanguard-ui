// ForeverUI's real Lua under Node (fengari) against the TEST-ONLY WoW
// stub (scripts/lib/wow-stub.lua). One case per it(), same checks as before.

import { afterAll, expect, it } from "vitest";
import { createAddon } from "./lib/lua-harness.mjs";
import { dumpHits } from "./lib/lua-coverage.mjs";

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

// A logged-in addon; extra Lua runs before login (e.g. a module or a skin).
function loggedIn(extra = "", opts = {}) {
  const addon = createAddon(opts);
  if (extra) addon.eval(extra);
  addon.login();
  return addon;
}

// Whether any chat line matches re.
const chatHas = (addon, re) => addon.chat().some((line) => re.test(line));

it("saved variables", () => {
  const addon = loggedIn();
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
  expect(dst.eval("return ForeverUI_Confirm:IsShown()") && /Reload/.test(dst.eval("return ForeverUI_Confirm.accept.text:GetText()")), "and a reload is offered").toBeTruthy();
  dst.eval('ReloadUI = function() __reloaded = true end; ForeverUI_Confirm.accept:GetScript("OnClick")(ForeverUI_Confirm.accept)');
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
  expect(relog.eval("return ForeverUICharDB.profile") === "Default" && relog.eval("return ForeverUI_Confirm:IsShown()") === true, "changing spec switches profile and offers a reload").toBeTruthy();
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

it("raid frames", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  const h = addon.eval(`local h = ForeverUI_Raid return { template = h:GetAttribute("template"), groupBy = h:GetAttribute("groupBy"),
    party = h:GetAttribute("showParty"), start = h:GetAttribute("startingIndex"), vis = h.__drivers["state-visibility"],
    init = h:GetAttribute("initialConfigFunction"), w = h:GetAttribute("fui-width") }`);
  expect(h.template === "SecureUnitButtonTemplate" && h.groupBy === "GROUP" && h.party === true && h.w === 90, "a secure group header, grouped by group, covering the party").toBeTruthy();
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
      ["HARMFUL|RAID"] = { { dispelName = "Magic" } },
      ["HELPFUL|PLAYER|RAID"] = { { icon = "TEST-ONLY-HOT-A", expirationTime = 1030, duration = 12, applications = 2 },
        { icon = "TEST-ONLY-HOT-B", expirationTime = { __secret = true }, duration = { __secret = true } } },
      ["HELPFUL|PLAYER|RAID_IN_COMBAT"] = { { icon = "TEST-ONLY-HOT-COMBAT", expirationTime = 1020, duration = 6 } },
    },
  }
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) return ((__auras[unit] or {})[filter] or {})[i] end }
`;

// Raid button 1's indicators.
const indicators = (addon) => addon.eval(`local b = ForeverUI_RaidUnitButton1
  local out = { dispel = b.dispel:IsShown(), edge = b.dispel.edges[1].__vertexColor, hots = {} }
  for i, f in ipairs(b.hots) do out.hots[i] = { shown = f:IsShown(), icon = f.icon.__texture, count = f.count:GetText(), cd = f.cooldown.__cooldown } end
  return out`);

it("raid indicators", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + AURA_ENV);
  addon.eval('__spawn(1, "raid1")');
  const i = indicators(addon);
  expect(i.dispel === true && isTok(addon, i.edge, "magic"), "a Magic debuff you can dispel gets a blue border").toBeTruthy();
  expect(i.hots[0].shown && i.hots[0].icon === "TEST-ONLY-HOT-A" && i.hots[0].count === "2", "your HoTs show as icons with stacks").toBeTruthy();
  expect(i.hots[0].cd[0] === 1018 && i.hots[0].cd[1] === 12, "with a timer from plain numbers").toBeTruthy();
  expect(i.hots[1].shown && i.hots[1].icon === "TEST-ONLY-HOT-B" && i.hots[1].cd == null, `a HoT with hidden timings still shows, without a sweep (got ${JSON.stringify(i.hots[1])})`).toBeTruthy();
  expect(i.hots[2].shown === false, "unused icons stay hidden").toBeTruthy();
  addon.eval('__auras.raid1["HARMFUL|RAID"][1].dispelName = { __secret = true }');
  addon.fire("UNIT_AURA", "raid1");
  expect(indicators(addon).edge[0] === 0.8, "a hidden dispel type gets a plain highlight").toBeTruthy();
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  const combat = indicators(addon);
  expect(combat.hots[0].icon === "TEST-ONLY-HOT-COMBAT" && combat.hots[1].shown === false, "in combat the client's combat filter decides which buffs show").toBeTruthy();
  addon.eval('__auras.raid1["HARMFUL|RAID"] = {}');
  addon.fire("UNIT_AURA", "raid1");
  expect(indicators(addon).dispel === false, "the border goes when the debuff does").toBeTruthy();
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
    if unit == "nameplate1" and filter == "HARMFUL|PLAYER" and i == 1 then return { icon = "TEST-ONLY-DOT", expirationTime = 1010, duration = 12 } end
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
    dot = f.debuffs[1]:IsShown() and f.debuffs[1].icon.__texture, cast = f.cast:IsShown() and f.cast.text:GetText(), edge = edge }`);

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
      if w.__parent == f and w.__texture and w.__texture:find("Shadow") then out.shadow = out.shadow + 1 out.tc = out.tc or w.__texCoord end
      if w.__parent == f and w.__layer == "BORDER" and w.__points.TOPLEFT and w.__points.TOPLEFT.y ~= 0 then out.sheen = out.sheen + 1 out.sheenColor = w.__vertexColor end
    end
    return out`);
  expect(parts.shadow === 8 && parts.tc?.length === 4, "a shadowed panel gets eight shadow pieces cut from Media/Textures/Shadow").toBeTruthy();
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

it("target and focus auras", () => {
  const addon = loggedIn(UNITS_ENV + `
    __units.focus = { name = "TEST-ONLY Focus", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }
    __frameAuras = { ["HARMFUL|PLAYER"] = { { icon = "MY-DOT", applications = 3 } }, HARMFUL = { { icon = "ANY-DEBUFF" }, { icon = "MY-DOT" } }, HELPFUL = { { icon = "BUFF-A" }, { icon = "BUFF-B" } } }
    C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter) return (__frameAuras[filter] or {})[i] end }`, NO_RAID);
  addon.fire("PLAYER_TARGET_CHANGED");
  const t = addon.eval(`local f = ForeverUI_target return { d1 = f.debuffs[1]:IsShown() and f.debuffs[1].icon.__texture, d2 = f.debuffs[2]:IsShown(),
    count = f.debuffs[1].count:GetText(), b = { f.buffs[1].icon.__texture, f.buffs[2].icon.__texture }, b3 = f.buffs[3]:IsShown() }`);
  expect(t.d1 === "MY-DOT" && t.d2 === false && t.count === "3", "your debuffs show above the target, with stacks").toBeTruthy();
  expect(t.b[0] === "BUFF-A" && t.b[1] === "BUFF-B" && t.b3 === false, "buffs show above them").toBeTruthy();
  addon.eval("ForeverUIDB.profiles.Default.FrameAuras.onlyMine = false");
  addon.fire("UNIT_AURA", "focus");
  expect(addon.eval("return ForeverUI_focus.debuffs[2]:IsShown()") === true, "with onlyMine off, everyone's debuffs show (focus refreshed on UNIT_AURA)").toBeTruthy();
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
