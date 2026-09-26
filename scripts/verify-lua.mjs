// Runs ForeverUI's real Lua under Node (fengari) against the TEST-ONLY WoW
// stub (scripts/lib/wow-stub.lua) and checks core behavior.

import { createAddon } from "./lib/lua-harness.mjs";

const failures = [];

// Records msg as a failure unless cond holds.
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// Runs one test case; a thrown error becomes a labeled failure.
function attempt(label, fn) {
  try {
    fn();
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
  }
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

attempt("saved variables", () => {
  const addon = loggedIn();
  const sv = addon.savedVariables();
  assert(sv.account.version === 1 && typeof sv.account.profiles === "object", "fresh install creates ForeverUIDB");
  assert(sv.char.profile === "Default", "a new character uses the Default profile");
  const kept = loggedIn("", { savedVariables: 'ForeverUIDB = { profiles = { Main = { theme = { accent = { 1, 0, 0 } } } } }\nForeverUICharDB = { profile = "Main" }' });
  assert(kept.eval("return select(1, ns.Theme.Accent())") === 1, "the character's saved profile is used");
  assert(kept.eval("return ns.Theme.Settings().panel[4]") === 0.92, "missing theme settings get defaults");
});

attempt("modules", () => {
  const addon = loggedIn(`
    ns.Module("Good", { defaults = { size = 3 }, Enable = function(s) __size = s.size end })
    ns.Module("Bad", { Enable = function() error("boom") end })
    ns.Module("Off", { Enable = function() __off = true end })
  `, { savedVariables: 'ForeverUIDB = { profiles = { Default = { modules = { Off = false } } } }' });
  assert(addon.eval("return __size") === 3, "a module is enabled with its defaults");
  assert(chatHas(addon, /module Bad failed to load: .*boom/), "a failing module is reported");
  assert(addon.eval("return ns.GetModule('Bad').enabled") === false, "a failing module is marked not enabled");
  assert(addon.eval("return __off") === null, "a module turned off in the profile is not enabled");
  addon.slash("disable Good");
  assert(addon.eval("return ns.ModuleEnabled('Good')") === false, "/fui disable turns a module off");
});

attempt("combat queue", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true; ns.OutOfCombat(function() __ran = (__ran or 0) + 1 end)");
  assert(addon.eval("return __ran") === null, "work waits during combat");
  assert(addon.eval("return ns.QueuedCount()") === 1, "queued work is counted");
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  assert(addon.eval("return __ran") === 1, "queued work runs once after combat");
  addon.eval("ns.OutOfCombat(function() __ran = __ran + 1 end)");
  assert(addon.eval("return __ran") === 2, "out of combat, work runs at once");
});

attempt("theme", () => {
  const addon = loggedIn();
  const colors = addon.eval(`
    local f = ns.Theme.Panel(CreateFrame("Frame", "TestPanel", UIParent), { accent = true })
    ns.Theme.Panel(f, { accent = true })
    local out = {}
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__kind == "Texture" then out[#out + 1] = w.__vertexColor end
    end
    return out`);
  assert(colors.length === 5, `a panel is one background and four edges, painted once (got ${colors.length})`);
  assert(colors.some((c) => c[0] === 0.24 && c[2] === 1), "an accent panel's border uses the accent");
  addon.slash("accent ff8000");
  const edge = addon.eval(`
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == TestPanel and w.__layer == "BORDER" then return w.__vertexColor end
    end`);
  assert(edge[0] === 1 && Math.abs(edge[1] - 128 / 255) < 1e-9 && edge[2] === 0, "/fui accent repaints painted frames live");
  addon.slash("accent nope");
  assert(chatHas(addon, /Usage: \/fui accent/), "a bad accent shows usage");
  addon.slash("theme reset");
  assert(addon.eval("return select(1, ns.Theme.Accent())") === 0.24, "/fui theme reset restores the default accent");
});

attempt("widgets", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local before = ns.Theme.PaintedCount()
    local b = ns.Theme.Button(CreateFrame("Button", nil, UIParent, "UIPanelButtonTemplate"))
    local e = ns.Theme.EditBox(CreateFrame("EditBox", nil, UIParent))
    local c = ns.Theme.CloseButton(CreateFrame("Button", nil, UIParent, "UIPanelCloseButton"))
    local glyph
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == c and w.__kind == "FontString" then glyph = w.__text end
    end
    return { painted = ns.Theme.PaintedCount() - before, glyph = glyph }`);
  assert(out.painted === 3, "button, edit box and close button are painted");
  assert(out.glyph === "x", "the close button draws an x");
});

attempt("skin API", () => {
  const addon = loggedIn(`
    ForeverUI.RegisterSkin("Early", function(S) __early = S.apiVersion; S.Panel(CreateFrame("Frame", nil, UIParent)) end)
    ForeverUI.RegisterSkin("Early", function() __dup = true end)
    ForeverUI.RegisterSkin("Broken", function() error("oops") end)
  `);
  assert(addon.eval("return __early") === 1, "a skin registered before login runs at login with apiVersion 1");
  assert(addon.eval("return __dup") === null, "the first registration of a name wins");
  assert(chatHas(addon, /skin for Broken failed: .*oops/), "a failing skin is reported, not raised");
  addon.eval('ForeverUI.RegisterSkin("Late", function() __late = true end)');
  assert(addon.eval("return __late") === true, "a skin registered after login runs at once");
  const off = loggedIn('ForeverUI.RegisterSkin("Muted", function() __muted = true end)', {
    savedVariables: "ForeverUIDB = { profiles = { Default = { skins = { Muted = false } } } }",
  });
  assert(off.eval("return __muted") === null, "a skin turned off in the profile never runs");
  off.clearChat();
  off.slash("skins");
  assert(chatHas(off, /Muted/), "/fui skins lists registered skins");
});

attempt("movers", () => {
  const addon = loggedIn(`
    __f = CreateFrame("Frame", nil, UIParent)
    __f:SetSize(200, 40)
    ns.Mover(__f, "player", "Player frame", { "CENTER", "CENTER", -250, -150 })
  `);
  // The frame's first anchor as [point, relPoint, x, y].
  const point = () => addon.eval("local p, _, rp, x, y = __f:GetPoint(1); return { p, rp, x, y }");
  assert(JSON.stringify(point()) === JSON.stringify(["CENTER", "CENTER", -250, -150]), "a frame starts at its default point");
  addon.slash("unlock");
  const handle = "ns.MoverHandleForTest()";
  addon.eval(`function ns.MoverHandleForTest() for _, w in ipairs(__wfgStub.frames) do if w.mover then return w end end end`);
  assert(addon.eval(`return ${handle}:IsShown()`) === true, "/fui unlock shows a handle");
  addon.eval(`local h = ${handle}; h:GetScript("OnDragStart")(h); h:ClearAllPoints(); h:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -20); h:GetScript("OnDragStop")(h)`);
  assert(JSON.stringify(point()) === JSON.stringify(["TOPLEFT", "TOPLEFT", 10, -20]), "dropping a handle moves its frame");
  assert(addon.eval("return ForeverUIDB.profiles.Default.positions.player.x") === 10, "the position is saved in the profile");
  addon.slash("reset player");
  assert(point()[0] === "CENTER", "/fui reset puts the frame back");
  addon.fire("PLAYER_REGEN_DISABLED");
  assert(addon.eval(`return ${handle}:IsShown()`) === false, "entering combat locks");
  addon.eval("__wfgStub.inCombat = true");
  addon.clearChat();
  addon.slash("unlock");
  assert(chatHas(addon, /Not in combat/), "unlock is refused in combat");
});

attempt("layout", () => {
  const addon = loggedIn();
  // ns.Layout.Anchor on a 1920x1080 screen.
  const anchor = (l, b, w, h) => addon.eval(`return { ns.Layout.Anchor(${l}, ${b}, ${w}, ${h}, 1920, 1080) }`);
  assert(JSON.stringify(anchor(20, 900, 200, 40)) === JSON.stringify(["TOPLEFT", 20, -140]), "top-left third anchors TOPLEFT with edge offsets");
  assert(JSON.stringify(anchor(1700, 20, 200, 40)) === JSON.stringify(["BOTTOMRIGHT", -20, 20]), "bottom-right third anchors BOTTOMRIGHT");
  assert(JSON.stringify(anchor(860, 520, 200, 40)) === JSON.stringify(["CENTER", 0, 0]), "the middle anchors CENTER");
  assert(JSON.stringify(anchor(860, 20, 200, 40)) === JSON.stringify(["BOTTOM", 0, 20]), "bottom middle anchors BOTTOM");
  // ns.Layout.Snap of a 100x20 rect next to one at (500, 300).
  const snap = (l, b) => addon.eval(`return { ns.Layout.Snap(${l}, ${b}, 100, 20, { { left = 500, bottom = 300, w = 100, h = 20 } }, 1920, 1080) }`);
  assert(JSON.stringify(snap(605, 250)) === JSON.stringify([600, 250]), "a left edge within 8 px snaps to another frame's right edge");
  assert(JSON.stringify(snap(700, 250)) === JSON.stringify([700, 250]), "nothing close, no snap");
  assert(JSON.stringify(snap(1000, 527)) === JSON.stringify([1000, 530]), "a center within 8 px snaps to the screen center");
});

attempt("unlock mode", () => {
  const addon = loggedIn(`
    UIParent:SetSize(1920, 1080)
    __a = CreateFrame("Frame", nil, UIParent); __a:SetSize(100, 20)
    __b = CreateFrame("Frame", nil, UIParent); __b:SetSize(100, 20)
    ns.Mover(__a, "a", "A", { "CENTER", "CENTER", 0, 0 })
    ns.Mover(__b, "b", "B", { "CENTER", "CENTER", 0, -100 })
  `);
  addon.slash("unlock");
  assert(addon.eval("return ns.GridLineCount()") === 94, "unlock shows a 32 px grid (61 + 33 lines on 1920x1080)");
  // Drops handle `key` with its bottom-left at (left, bottom).
  const drop = (key, left, bottom) =>
    addon.eval(`local h = ns.MoverHandleForTest("${key}"); h.__left, h.__bottom = ${left}, ${bottom}; h:GetScript("OnDragStop")(h)`);
  addon.eval(`function ns.MoverHandleForTest(k) for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == k then return w end end end`);
  addon.eval(`local h = ns.MoverHandleForTest("b"); h.__left, h.__bottom = 500, 300`);
  drop("a", 603, 900);
  // Mover a's saved [point, x, y].
  const saved = () => addon.eval("local p = ForeverUIDB.profiles.Default.positions.a; return { p.point, p.x, p.y }");
  assert(JSON.stringify(saved()) === JSON.stringify(["TOP", -310, -160]), `a drop snaps to the other handle and anchors to the nearest edge (got ${JSON.stringify(saved())})`);
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnMouseDown")(h)`);
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "LEFT")`);
  assert(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -160]), "the arrow keys nudge the selected handle 1 px");
  addon.eval(`IsShiftKeyDown = function() return true end; local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "UP")`);
  assert(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -150]), "Shift nudges 10 px");
  assert(/TOP -311, -150/.test(addon.eval(`return ns.MoverHandleForTest("a").label:GetText()`)), "the selected handle shows its point and offsets");
  addon.slash("grid 64");
  assert(addon.eval("return ns.GridLineCount()") === 48, "/fui grid 64 redraws the grid (31 + 17)");
  addon.slash("grid off");
  assert(addon.eval("return ns.GridLineCount()") === 0, "/fui grid off hides it");
  addon.slash("snap off");
  drop("a", 603, 900);
  assert(saved()[0] === "TOP" && saved()[1] === -307, `with snapping off, the drop stays where it was (got ${JSON.stringify(saved())})`);
  addon.slash("lock");
  assert(addon.eval(`return ns.MoverHandleForTest("a"):IsShown()`) === false, "/fui lock hides the handles");
});

attempt("accent presets", () => {
  const addon = loggedIn();
  addon.slash("accent bronze");
  assert(addon.eval("return select(1, ns.Theme.Accent())") === 0.8, "/fui accent bronze sets the bronze preset");
  addon.slash("accent #3D9EFF");
  assert(Math.abs(addon.eval("return select(3, ns.Theme.Accent())") - 1) < 1e-9, "hex accents still work");
});

attempt("slash", () => {
  const addon = loggedIn();
  addon.slash("help");
  assert(chatHas(addon, /unlock \| lock/), "/fui help lists commands");
  addon.slash("status");
  assert(chatHas(addon, /profile Default/), "/fui status shows the profile");
  addon.slash("profile Raid");
  assert(addon.eval("return ForeverUICharDB.profile") === "Raid", "/fui profile switches this character's profile");
  addon.clearChat();
  addon.slash("bogus");
  assert(chatHas(addon, /Unknown command/), "unknown commands say so");
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

attempt("unit frames", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const player = ufState(addon, "player");
  assert(player.unit === "player" && player.type1 === "target" && player.type2 === "togglemenu", "player frame is a secure unit button");
  assert(player.hp === 900 && player.max === 1000 && player.text === "900", "player health bar and text");
  assert(player.color[0] === 0.25 && player.color[2] === 0.92, "players get their class color");
  assert(player.power === 50 && player.powerColor[2] === 1, "power bar value and mana color");
  assert(player.name === "<name>" && !player.watched, "player name; player frame is always shown");
  const target = ufState(addon, "target");
  assert(target.watched, "target frame shows and hides with its unit");
  assert(target.hp?.__secret && target.max?.__secret, "secret health goes to the bar untouched");
  assert(target.text?.__secret, "secret health text comes from the client's formatter");
  assert(target.color[0] === 0.78, "hostile units are red");
  assert(ufState(addon, "party1").text === "Dead", "dead units say Dead");
  const hidden = addon.eval("return { parentShown = PlayerFrame:GetParent():IsShown(), events = PlayerFrame:IsEventRegistered('UNIT_HEALTH') }");
  assert(hidden.parentShown === false && hidden.events === false, "the Blizzard player frame is hidden and silenced");
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  assert(["uf_player", "uf_target", "uf_targettarget", "uf_focus", "uf_pet", "uf_party1"].every((k) => movers.includes(k)), "every frame group is movable");
});

attempt("unit frame events", () => {
  const addon = loggedIn(UNITS_ENV);
  addon.eval("__units.player.hp = 400");
  addon.fire("UNIT_HEALTH", "player");
  assert(ufState(addon, "player").hp === 400, "UNIT_HEALTH updates the bar");
  addon.eval('__units.focus = { name = "TEST-ONLY Focus", hp = 10, maxhp = 20, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }');
  addon.fire("PLAYER_FOCUS_CHANGED");
  const focus = ufState(addon, "focus");
  assert(focus.name === "TEST-ONLY Focus" && focus.color[1] === 0.69, "focus change fills the focus frame; friendly is green");
  addon.eval('__units.targettarget = { name = "TEST-ONLY ToT", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" }');
  addon.update(0.25);
  assert(ufState(addon, "targettarget").name === "TEST-ONLY ToT", "target of target refreshes on a timer");
});

attempt("unit frames wait for combat", () => {
  const addon = createAddon();
  addon.eval(UNITS_ENV + "__wfgStub.inCombat = true");
  addon.login();
  assert(addon.eval("return ForeverUI_player") === null, "no secure frames are built in combat");
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  assert(addon.eval("return ForeverUI_player ~= nil") === true, "they are built when combat ends");
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
  RegisterStateDriver = function(frame, state, driver) frame.__driver = { state, driver } end
  MainMenuBar = CreateFrame("Frame", "MainMenuBar", UIParent)
`;

// One action button's state.
const button = (addon, bar, i) => addon.eval(`
  local b = ForeverUI_Bar${bar}Button${i}
  return { action = b:GetAttribute("action"), type = b:GetAttribute("type"), icon = b.icon.__texture,
    shown = b.icon:IsShown(), count = b.count:GetText(), hotkey = b.hotkey:GetText(),
    color = b.icon.__vertexColor, checked = b:GetChecked(), cooldown = b.cooldown.__cooldown }`);

attempt("action bars", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const bars = addon.eval("local out = {} for n = 1, 8 do out[n] = _G['ForeverUI_Bar' .. n] ~= nil end return out");
  assert(JSON.stringify(bars) === JSON.stringify([true, true, true, true, true, false, false, false]), "bars 1-5 on by default, 6-8 off");
  const b1 = button(addon, 1, 1);
  assert(b1.type === "action" && b1.action === 1 && b1.icon === "TEST-ONLY-A", "bar 1 button 1 is secure action slot 1 with its icon");
  assert(b1.hotkey === "1" && b1.checked === true, "hotkey text; the current action is checked");
  const b2 = button(addon, 1, 2);
  assert(b2.hotkey === "S2" && b2.count === "5", "SHIFT-2 shows as S2; counts above 1 show");
  assert(b2.color[2] === 1 && b2.color[0] === 0.4, "out of power tints blue");
  const b3 = button(addon, 1, 3);
  assert(b3.color[0] === 0.4 && b3.color[2] === 0.4, "unusable dims gray");
  assert(b3.cooldown[0]?.__secret && b3.cooldown[1]?.__secret, "a secret cooldown goes to the widget untouched");
  assert(button(addon, 1, 4).shown === false, "an empty slot hides its icon");
  assert(button(addon, 2, 1).action === 61 && button(addon, 2, 1).hotkey === "CM4", "bar 2 is slots 61-72 on MULTIACTIONBAR1; CTRL-BUTTON4 shows CM4");
  const o = addon.eval("return __overrides");
  assert(o["1"] === "ForeverUI_Bar1Button1:LeftButton" && o["SHIFT-2"] === "ForeverUI_Bar1Button2:LeftButton", "default bindings click the ForeverUI buttons");
  assert(o["CTRL-BUTTON4"] === "ForeverUI_Bar2Button1:LeftButton", "bar 2 bindings too");
  assert(addon.eval("return ForeverUI_Bar1.__driver[1]") === "page" && /\[vehicleui\]/.test(addon.eval("return ForeverUI_Bar1.__driver[2]")), "bar 1 has a secure page driver");
  assert(addon.eval("return ForeverUI_Bar2.__driver") === null, "other bars don't page");
  assert(addon.eval("return MainMenuBar:GetParent():IsShown()") === false, "the default main bar is hidden");
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  assert(["bar1", "bar2", "bar3", "bar4", "bar5"].every((k) => movers.includes(k)), "every bar is movable");
});

attempt("action bar paging and events", () => {
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
  assert(paged.action === 73 && paged.icon === "TEST-ONLY-PAGE7", "page 7 re-points button 1 to slot 73 and it refreshes");
  addon.eval('__actions[61] = { tex = "TEST-ONLY-NEW", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 61);
  assert(button(addon, 2, 1).icon === "TEST-ONLY-NEW", "ACTIONBAR_SLOT_CHANGED refreshes that slot");
  addon.eval('__binds.ACTIONBUTTON3 = { "Q" }');
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("UPDATE_BINDINGS");
  assert(addon.eval("return __overrides.Q") === null, "binding changes wait for combat to end");
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  assert(addon.eval("return __overrides.Q") === "ForeverUI_Bar1Button3:LeftButton" && button(addon, 1, 3).hotkey === "Q", "then they apply");
});

attempt("action bar dragging", () => {
  const addon = loggedIn(ACTIONS_ENV);
  // Starts a drag on bar 1 button 2; returns the slot picked up, if any.
  const drag = () => addon.eval("local b = ForeverUI_Bar1Button2; b:GetScript('OnDragStart')(b); return __picked");
  assert(drag() === null, "locked buttons don't drag without Shift");
  addon.eval("IsShiftKeyDown = function() return true end");
  assert(drag() === 2, "Shift-drag picks the action up");
  addon.eval("local b = ForeverUI_Bar2Button5; b:GetScript('OnReceiveDrag')(b)");
  assert(addon.eval("return __placed") === 65, "dropping onto a button places the action in its slot");
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

attempt("minimap", () => {
  const addon = loggedIn(UI_ENV);
  const mm = addon.eval(`return { parent = Minimap:GetParent():GetName(), mask = Minimap.__maskTexture,
    size = Minimap.__width, zone = ns.GetModule("Minimap").zone:GetText(), zoneColor = ns.GetModule("Minimap").zone.__textColor,
    border = MinimapCluster.BorderTop.__alpha, zoomIn = Minimap.ZoomIn.__alpha, shape = GetMinimapShape() }`);
  assert(mm.parent === "ForeverUI_Minimap" && mm.size === 180, "the minimap moves into the themed holder at 180 px");
  assert(mm.shape === "SQUARE", "GetMinimapShape tells other addons it is square");
  assert(mm.zone === "TEST-ONLY Vale" && mm.zoneColor[1] === 0.7, "zone text on top, colored for contested");
  assert(mm.border === 0 && mm.zoomIn === 0, "border art and zoom buttons are faded");
  addon.update(0.25);
  assert(addon.eval('return ns.GetModule("Minimap").coords:GetText()') === "45.7, 12.3", "coordinates under the map");
  addon.eval("Minimap:GetScript('OnMouseWheel')(Minimap, 1)");
  assert(addon.eval("return Minimap:GetZoom()") === 1, "the mouse wheel zooms in");
  addon.eval("for _ = 1, 10 do Minimap:GetScript('OnMouseWheel')(Minimap, 1) end");
  assert(addon.eval("return Minimap:GetZoom()") === 5, "and stops at the last zoom level");
  addon.eval("C_Map.GetPlayerMapPosition = function() return { GetXY = function() return { __secret = true }, 0.5 end } end");
  addon.update(0.25);
  assert(addon.eval('return ns.GetModule("Minimap").coords:GetText()') === "", "secret or missing coordinates show nothing");
  assert(addon.eval("return ns.MoverList()[1] ~= nil") === true, "the minimap is movable");
});

attempt("chat", () => {
  const addon = loggedIn(UI_ENV);
  const c = addon.eval(`return { font = { ChatFrame1:GetFont() }, box = ns.Theme.PaintedCount(),
    tab1 = ChatFrame1Tab.Text.__textColor, tab2 = ChatFrame2Tab.Text.__textColor }`);
  assert(c.font[0] === "Fonts\\FRIZQT__.TTF" && c.font[1] === 15, `chat windows get the theme font at their own size (got ${JSON.stringify(c.font)})`);
  assert(c.tab2[0] === 0.24 && c.tab1[0] === 0.7, "the selected window's tab is accent, others gray");
  addon.slash("accent red");
  assert(addon.eval("return ChatFrame2Tab.Text.__textColor[1]") === 0.9, "tabs follow accent changes");
});

attempt("bags", () => {
  const addon = loggedIn(UI_ENV);
  assert(addon.eval("return __cvars.combinedBags") === "1", "combined bags are turned on");
  addon.eval("ContainerFrameCombinedBags:Show()");
  const b = addon.eval("return { border = __item.IconBorder.__alpha, painted = ns.Theme.PaintedCount() }");
  assert(b.border === 0, "item slot art is faded when the bag opens");
  addon.eval("ContainerFrameCombinedBags:Hide(); ContainerFrameCombinedBags:Show()");
  assert(addon.eval("return ns.Theme.PaintedCount()") === b.painted, "reopening repaints, it doesn't pile up");
});

attempt("range tint", () => {
  const polled = loggedIn(ACTIONS_ENV + "IsActionInRange = function(slot) if slot == 1 then return false end if slot == 3 then return { __secret = true } end return true end");
  assert(button(polled, 1, 1).color[0] === 0.9, "out of range tints red (asked directly on clients without range events)");
  assert(button(polled, 1, 3).color[0] === 0.4, "a secret range answer never tints red");
  const evented = loggedIn(ACTIONS_ENV + "__rangeSlots = {} C_ActionBar = { EnableActionRangeCheck = function(slot, on) __rangeSlots[slot] = on end }");
  assert(evented.eval("return __rangeSlots[1]") === true, "clients with range events are asked to watch each slot");
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, true);
  assert(button(evented, 1, 1).color[0] === 0.9, "ACTION_RANGE_CHECK_UPDATE out of range tints red");
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, true, true);
  assert(button(evented, 1, 1).color[0] === 1, "back in range, back to normal");
  evented.fire("ACTION_RANGE_CHECK_UPDATE", 1, false, false);
  assert(button(evented, 1, 1).color[0] === 1, "an action without a range is never red");
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

attempt("data bars", () => {
  const addon = loggedIn(DATA_ENV);
  const b = bars(addon);
  assert(b.xp === 12300 && b.xpMax === 40000 && Math.abs(b.rested - 476 * 17300 / 40000) < 1e-9, "XP bar with rested overlay out to XP + rested");
  assert(b.xpText === "Level 42  12.3K / 40.0K (30%)  rested 5.0K", `XP text (got ${b.xpText})`);
  assert(b.xpTextShown === false, "text shows on hover only by default");
  addon.eval("ForeverUI_xpbar:GetScript('OnEnter')(ForeverUI_xpbar)");
  assert(addon.eval("return ForeverUI_xpbar.text:IsShown()") === true, "hovering shows it");
  assert(b.rep === 1200 && b.repMax === 6000 && b.repColor[1] === 0.6, "reputation within the current standing, friendly green");
  assert(b.repText === "TEST-ONLY Faction  1.2K / 6.0K (20%)", `reputation text (got ${b.repText})`);
  addon.eval("__maxLevel = true; __faction = nil");
  addon.fire("PLAYER_XP_UPDATE");
  addon.fire("UPDATE_FACTION");
  const after = bars(addon);
  assert(after.xpShown === false && after.repShown === false, "XP hides at max level; reputation hides with nothing watched");
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  assert(movers.includes("xpbar") && movers.includes("repbar"), "both bars are movable");
});

attempt("profile strings", () => {
  const addon = loggedIn();
  const round = addon.eval(`
    local S = ns.Serialize
    local data = { a = 1, b = 2.5, c = -0.125, d = "quote \\" back \\\\ nl \\n tab \\t é", e = true, f = false,
      list = { 10, 20, { deep = "x" } }, [7] = "seven", fn = function() end }
    local text = S.Encode("profile", data)
    local scope, back = S.Decode(text)
    return { text = text, again = S.Encode("profile", data), scope = scope, back = back }`);
  assert(/^FUI1:profile:[0-9a-f]{4}:[A-Za-z0-9+/=]+$/.test(round.text), "FUI1:scope:checksum:base64");
  assert(round.text === round.again, "encoding is deterministic");
  const b = round.back;
  assert(round.scope === "profile" && b.a === 1 && b.b === 2.5 && b.c === -0.125 && b.e === true && b.f === false, "numbers and booleans round-trip");
  assert(b.d === 'quote " back \\ nl \n tab \t é', `strings with quotes, backslashes, control and UTF-8 bytes round-trip (got ${JSON.stringify(b.d)})`);
  assert(b.list[2].deep === "x" && b["7"] === "seven" && b.fn === undefined, "nested tables and number keys round-trip; functions are left out");
  // ns.Serialize.Decode on a Lua string expression: { scope, err }.
  const decode = (lua) => addon.eval(`local scope, err = ns.Serialize.Decode(${lua}) return { scope = scope, err = err }`);
  assert(/not a ForeverUI/.test(decode('"hello"').err), "rejects other text");
  assert(/cut off/.test(decode(`${JSON.stringify(round.text.slice(0, -4))}`).err), "rejects a truncated string");
  const code = addon.eval(`local S = ns.Serialize local body = S.Base64("os.exit()") return "FUI1:profile:" .. S.Checksum(body) .. ":" .. body`);
  assert(/can't be read/.test(decode(JSON.stringify(code)).err), "text that isn't settings (e.g. code) is refused, never run");
});

attempt("export and import", () => {
  const src = loggedIn();
  src.slash("accent ff8000");
  src.eval('ns.Profile().positions = { uf_player = { point = "TOP", relPoint = "TOP", x = 1, y = -2 } }');
  src.slash("export");
  const text = src.eval("return ForeverUI_TextEdit:GetText()");
  assert(text.startsWith("FUI1:profile:") && src.eval("return ForeverUI_TextDialog:IsShown()"), "/fui export shows the string, selected to copy");
  const dst = loggedIn();
  dst.slash("import");
  dst.eval(`ForeverUI_TextEdit:SetText(${JSON.stringify(text)}); ForeverUI_TextDialog.primary:GetScript("OnClick")(ForeverUI_TextDialog.primary)`);
  assert(dst.eval("return ForeverUICharDB.profile") === "Imported", "a whole-profile import becomes a new profile this character uses");
  assert(dst.eval("return ForeverUIDB.profiles.Imported.positions.uf_player.x") === 1 && dst.eval("return ForeverUIDB.profiles.Imported.theme.accent[1]") === 1, "with every setting");
  assert(dst.eval("return ForeverUI_Confirm:IsShown()") && /Reload/.test(dst.eval("return ForeverUI_Confirm.accept.text:GetText()")), "and a reload is offered");
  dst.eval('ReloadUI = function() __reloaded = true end; ForeverUI_Confirm.accept:GetScript("OnClick")(ForeverUI_Confirm.accept)');
  assert(dst.eval("return __reloaded") === true, "Reload reloads the UI");
  const theme = src.eval('return ns.ExportProfile("theme")');
  dst.eval('ns.UseProfile("Default")');
  assert(/Imported theme settings/.test(dst.eval(`return ns.ImportProfile(${JSON.stringify(theme)})`)), "a module string imports into the active profile");
  assert(dst.eval("return ForeverUIDB.profiles.Default.theme.accent[1]") === 1 && dst.eval("return (ForeverUIDB.profiles.Default.positions or {}).uf_player") === null, "replacing only that module's settings");
  dst.clearChat();
  dst.eval('ns.AskText("x", function() end)');
  dst.slash("import");
  dst.eval('ForeverUI_TextEdit:SetText("garbage"); ForeverUI_TextDialog.primary:GetScript("OnClick")(ForeverUI_TextDialog.primary)');
  assert(chatHas(dst, /Import failed: not a ForeverUI profile string/), "a bad paste says why");
});

attempt("profile management", () => {
  const addon = loggedIn();
  addon.slash("profile new Raid");
  assert(addon.eval("return ForeverUIDB.profiles.Raid ~= nil") === true, "/fui profile new creates one");
  addon.slash("profile new Raid");
  assert(chatHas(addon, /taken or not allowed/), "names are unique");
  addon.eval("ForeverUIDB.profiles.Raid.theme = { accent = { 0, 1, 0 } }");
  addon.slash("profile copy Raid");
  assert(addon.eval("return ForeverUIDB.profiles.Default.theme.accent[2]") === 1, "/fui profile copy copies into the active profile");
  addon.slash("profile delete Default");
  assert(chatHas(addon, /Can't delete/), "the active profile can't be deleted");
  addon.slash("profile delete Raid");
  assert(addon.eval("return ForeverUIDB.profiles.Raid") === null, "others can");
  addon.slash("profile reset");
  assert(addon.eval("return ForeverUIDB.profiles.Default.theme") === null, "/fui profile reset clears the active profile");
  addon.slash("profile bad/name");
  assert(chatHas(addon, /1-32 letters/), "profile names are checked");
});

attempt("spec profiles", () => {
  const env = "GetSpecialization = function() return __spec end __spec = 2";
  const addon = loggedIn(env);
  addon.slash("profile new Healer");
  addon.eval('ForeverUIDB.profiles.Healer.theme = { accent = { 0, 1, 0 } }');
  addon.slash("spec Healer");
  assert(addon.eval("return ForeverUICharDB.specProfiles[2]") === "Healer", "/fui spec maps the current spec to a profile");
  const relog = createAddon({ savedVariables: 'ForeverUIDB = { version = 1, profiles = { Default = {}, Healer = { theme = { accent = { 0, 1, 0 } } } } }\nForeverUICharDB = { profile = "Default", specProfiles = { [2] = "Healer" } }' });
  relog.eval(env);
  relog.login();
  assert(relog.eval("return ForeverUICharDB.profile") === "Healer" && relog.eval("return select(2, ns.Theme.Accent())") === 1, "logging in as that spec uses its profile before modules load");
  relog.eval("__spec = 1; ForeverUICharDB.specProfiles[1] = 'Default'");
  relog.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  assert(relog.eval("return ForeverUICharDB.profile") === "Default" && relog.eval("return ForeverUI_Confirm:IsShown()") === true, "changing spec switches profile and offers a reload");
  addon.slash("spec off");
  assert(addon.eval("return ForeverUICharDB.specProfiles[2]") === null, "/fui spec off stops switching");
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

attempt("options window", () => {
  const addon = loggedIn(CLICK_LUA + DATA_ENV + "GetSpecialization = function() return 1 end");
  addon.slash("");
  assert(addon.eval("return ForeverUI_Options:IsShown()") === true, "/fui opens the options window");
  assert(addon.eval("return ForeverUI_Options.reload:IsShown()") === false, "no reload button until something needs one");
  addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.fill and w.__scripts.OnClick then __swatches = (__swatches or 0) + 1 if __swatches == 2 then w.__scripts.OnClick(w) end end end");
  assert(addon.eval("return select(1, ns.Theme.Accent())") === 0.8, "the bronze swatch sets the accent at once");
  assert(addon.eval('return __click("Snap to other frames")') && addon.eval("return ns.MoverOptions().snap") === false, "the snap check box turns snapping off");
  assert(addon.eval('return __click("Action bars")'), "the nav switches pages");
  assert(addon.eval('return __click("Bar 6")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[6].enabled") === true, "check boxes change settings");
  assert(addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "a change that needs a reload shows the Reload button");
  assert(addon.eval('return __click("Button size")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.size") === 40, "cycle buttons step through choices");
  addon.eval('__click("Modules")');
  assert(addon.eval('return __click("UnitFrames")') && addon.eval("return ns.ModuleEnabled('UnitFrames')") === false, "modules can be turned off");
  addon.eval('__click("Profiles")');
  assert(addon.eval('return __click("Export profile")') && addon.eval("return ForeverUI_TextEdit:GetText():sub(1, 5)") === "FUI1:", "Export profile shows the string");
  assert(addon.eval('return __click("Use this profile for this spec")') && addon.eval("return ForeverUICharDB.specProfiles[1]") === "Default", "the spec button maps this spec");
  addon.eval('ReloadUI = function() __reloaded = true end; ForeverUI_Options.reload:GetScript("OnClick")(ForeverUI_Options.reload)');
  assert(addon.eval("return __reloaded") === true, "Reload UI reloads");
  addon.slash("options");
  assert(addon.eval("return ForeverUI_Options:IsShown()") === false, "/fui options toggles it closed");
  addon.eval('ForeverUI_OnAddonCompartmentClick("ForeverUI", "RightButton")');
  assert(addon.eval("return ns.Unlocked()") === true, "right-clicking the addons button toggles moving frames");
  addon.eval('ForeverUI_OnAddonCompartmentClick("ForeverUI", "LeftButton")');
  assert(addon.eval("return ForeverUI_Options:IsShown()") === true, "left-clicking it opens the options");
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

attempt("raid frames", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  const h = addon.eval(`local h = ForeverUI_Raid return { template = h:GetAttribute("template"), groupBy = h:GetAttribute("groupBy"),
    party = h:GetAttribute("showParty"), start = h:GetAttribute("startingIndex"), vis = h.__drivers["state-visibility"],
    init = h:GetAttribute("initialConfigFunction"), w = h:GetAttribute("fui-width") }`);
  assert(h.template === "SecureUnitButtonTemplate" && h.groupBy === "GROUP" && h.party === true && h.w === 90, "a secure group header, grouped by group, covering the party");
  assert(h.start === 1 && /\[group:raid\] show; \[group:party\] show; hide/.test(h.vis), "buttons are precreated, then the header shows in groups only");
  assert(/CallMethod\("initialConfigFunction"/.test(h.init) && /\*type2", "togglemenu"/.test(h.init), "each new button is sized, gets target/menu clicks, and is set up");
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const tank = raidButton(addon, 1);
  assert(tank.hp === 300 && tank.max === 1000 && tank.name === "TEST-ONLY Tank" && tank.role === "T", "health, name and role letter");
  assert(tank.color[0] === 0.78, "class colors");
  assert(raidButton(addon, 3).status === "Offline", "offline players say so");
  addon.eval("__units.raid1.hp = 900");
  addon.fire("UNIT_HEALTH", "raid1");
  assert(raidButton(addon, 1).hp === 900, "UNIT_HEALTH refreshes that member");
  addon.eval("__units.player.hp = 100");
  addon.fire("UNIT_HEALTH", "player");
  assert(raidButton(addon, 2).hp === 100, "an event for you updates your raid button too");
  assert(addon.eval("return CompactRaidFrameContainer:GetParent():IsShown()") === false, "the default raid frames are hidden");
  assert(addon.eval("return ForeverUI_party1") === null, "UnitFrames doesn't build party frames the raid frames cover");
  assert(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.raid") === true, "the raid frames are movable");
});

attempt("click casting", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return __spec end __spec = 1");
  const CC = 'ns.GetModule("ClickCast")';
  assert(addon.eval(`return ${CC}.KeyText("ctrl-shift-BUTTON2")`) === "Ctrl + Shift + Right click", "mouse keys read as Ctrl + Shift + Right click");
  assert(addon.eval(`return ${CC}.KeyText("SHIFT-MOUSEWHEELUP")`) === "Shift + Wheel up (hover)", "hover keys read as Shift + Wheel up (hover)");
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew")
    ${CC}.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal")
    ${CC}.Add("MOUSEWHEELUP", "macro", "/cast [@mouseover] TEST-ONLY Heal")
    __spawn(1, "raid1")`);
  const b = addon.eval(`local b = ForeverUI_RaidUnitButton1 return { t = b:GetAttribute("ctrl-type2"), s = b:GetAttribute("ctrl-spell2"),
    ht = b:GetAttribute("type-fui2"), hs = b:GetAttribute("spell-fui2"), mt = b:GetAttribute("type-fui3"), mx = b:GetAttribute("macrotext-fui3"),
    enter = b.__wraps.OnEnter, leave = b.__wraps.OnLeave, hide = b.__wraps.OnHide }`);
  assert(b.t === "spell" && b.s === "TEST-ONLY Renew", "Ctrl + Right click on a raid frame casts the spell (ctrl-type2 / ctrl-spell2)");
  assert(b.ht === "spell" && b.hs === "TEST-ONLY Flash Heal" && b.mt === "macro" && /@mouseover/.test(b.mx), "hover keys click virtual buttons that cast the spell or run the macro");
  assert(/SetBindingClick\(true, "SHIFT-1", self, "fui2"\)/.test(b.enter) && /"MOUSEWHEELUP", self, "fui3"/.test(b.enter), "entering a frame binds the hover keys to it");
  assert(!/BUTTON2/.test(b.enter), "mouse bindings aren't key bindings");
  assert(b.leave === "self:ClearBindings()" && b.hide === "self:ClearBindings()", "leaving or hiding the frame releases the keys");
  addon.eval(`${CC}.Remove("ctrl-BUTTON2")`);
  assert(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-type2")') === null, "removing a binding clears it from the frames");
  addon.eval("__wfgStub.inCombat = true");
  addon.eval(`${CC}.Add("ctrl-BUTTON1", "spell", "TEST-ONLY Shield")`);
  assert(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-type1")') === null, "in combat, changes wait");
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  assert(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-spell1")') === "TEST-ONLY Shield", "and apply when combat ends");
  addon.eval("__spec = 2");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  assert(addon.eval('return ForeverUI_RaidUnitButton1:GetAttribute("ctrl-spell1")') === null, "each spec has its own bindings");
  addon.clearChat();
  addon.eval("__spec = 1");
  addon.slash("binds");
  assert(chatHas(addon, /Shift \+ 1 \(hover\)  ->  TEST-ONLY Flash Heal/), "/fui binds lists this spec's bindings");
});

attempt("click casting options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + `GetSpecialization = function() return 1 end
    IsControlKeyDown = function() return __ctrl == true end
    C_Spell = { GetSpellName = function(id) return id == 139 and "TEST-ONLY Renew" or nil end }
    GetCursorInfo = function() return __cursor, 1, "spell", 139 end
    ClearCursor = function() __cursor = nil end`);
  addon.eval('ns.Options.Show("clickcast")');
  assert(addon.eval('return __click("Set key")'), "Set key starts capturing");
  addon.eval(`__ctrl = true
    for _, w in ipairs(__wfgStub.frames) do if w.capturing then w:GetScript("OnMouseDown")(w, "RightButton") end end`);
  assert(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.keyText:GetText() end end") === "Ctrl + Right click", "a Ctrl + right click is captured");
  addon.eval(`__cursor = "spell"
    for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then w.input:GetScript("OnReceiveDrag")(w.input) end end`);
  assert(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.input:GetText() end end") === "TEST-ONLY Renew", "dropping a spell from the spellbook fills in its name");
  assert(addon.eval('return __click("Add binding")'), "Add binding");
  assert(addon.eval('local b = ns.GetModule("ClickCast").Bindings()[1] return b.key .. "=" .. b.value') === "ctrl-BUTTON2=TEST-ONLY Renew", "adds it for this spec");
  assert(addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.remove and w.key == "ctrl-BUTTON2" and w:IsShown() then return w.text:GetText() end end') === "Ctrl + Right click  ->  TEST-ONLY Renew", "and lists it");
  addon.eval('__click("Add binding")');
  assert(addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.input and w.keyText then return w.message:GetText() end end") === "Can't add: press a key or click first.", "an incomplete binding says what's missing");
  assert(addon.eval('return __click("Remove")') && addon.eval('return #ns.GetModule("ClickCast").Bindings()') === 0, "Remove removes it");
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

attempt("raid indicators", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + AURA_ENV);
  addon.eval('__spawn(1, "raid1")');
  const i = indicators(addon);
  assert(i.dispel === true && i.edge[2] === 1 && i.edge[0] === 0.2, "a Magic debuff you can dispel gets a blue border");
  assert(i.hots[0].shown && i.hots[0].icon === "TEST-ONLY-HOT-A" && i.hots[0].count === "2", "your HoTs show as icons with stacks");
  assert(i.hots[0].cd[0] === 1018 && i.hots[0].cd[1] === 12, "with a timer from plain numbers");
  assert(i.hots[1].shown && i.hots[1].icon === "TEST-ONLY-HOT-B" && i.hots[1].cd == null, `a HoT with hidden timings still shows, without a sweep (got ${JSON.stringify(i.hots[1])})`);
  assert(i.hots[2].shown === false, "unused icons stay hidden");
  addon.eval('__auras.raid1["HARMFUL|RAID"][1].dispelName = { __secret = true }');
  addon.fire("UNIT_AURA", "raid1");
  assert(indicators(addon).edge[0] === 0.8, "a hidden dispel type gets a plain highlight");
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  const combat = indicators(addon);
  assert(combat.hots[0].icon === "TEST-ONLY-HOT-COMBAT" && combat.hots[1].shown === false, "in combat the client's combat filter decides which buffs show");
  addon.eval('__auras.raid1["HARMFUL|RAID"] = {}');
  addon.fire("UNIT_AURA", "raid1");
  assert(indicators(addon).dispel === false, "the border goes when the debuff does");
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

attempt("heal prediction, aggro, buff watch", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const one = healing(addon, 1);
  assert(one.heal === 200 && one.healMax === 1000 && one.shield === 150, "incoming heals and shields from the client's calculator");
  assert(addon.eval("return __calc.clamp") === 0, "incoming heals are clamped to missing health");
  assert(healing(addon, 2).heal?.__secret, "hidden incoming heals go to the bar untouched");
  assert(one.threat && one.threat[0] === 1 && one.threat[1] === 0, "full aggro shows a red strip");
  assert(healing(addon, 2).threat === false, "hidden threat shows no strip");
  assert(one.missing === "TEST-ONLY-ICON-Arcane Intellect", "a player missing your buff is marked with its icon");
  assert(healing(addon, 2).missing === false, "the group version of the buff counts");
  assert(healing(addon, 3).missing === false, "offline players aren't marked");
  addon.eval("__buffs.raid1 = { ['Arcane Intellect'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  assert(healing(addon, 1).missing === false, "the mark goes once they have it");
  addon.eval("__threat.raid1 = 0");
  addon.fire("UNIT_THREAT_SITUATION_UPDATE", "raid1");
  assert(healing(addon, 1).threat === false, "the strip goes with the aggro");
  addon.eval("__pred.raid1.heals = 50");
  addon.fire("UNIT_HEAL_PREDICTION", "raid1");
  assert(healing(addon, 1).heal === 50, "UNIT_HEAL_PREDICTION refreshes the heal bar");
});

attempt("healing fallbacks and options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + `CreateUnitHealPredictionCalculator = nil
    UnitGetIncomingHeals = function() return 120 end`);
  addon.eval('__spawn(1, "raid1")');
  assert(healing(addon, 1).heal === 120 && healing(addon, 1).shield == null, "without the calculator: the older incoming-heals call; no shields");
  addon.eval('ns.Options.Show("healing")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.save and w.input then w.input:SetText("TEST-ONLY Aura, Arcane Brilliance") w.save:GetScript("OnClick")(w.save) end end`);
  assert(addon.eval("return ForeverUIDB.profiles.Default.RaidHealing.buffs") === "TEST-ONLY Aura, Arcane Brilliance", "the buff list saves");
  assert(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Brilliance", "and the frames watch the saved names");
  assert(addon.eval('return __click("Aggro strip")') && addon.eval("return ForeverUIDB.profiles.Default.RaidHealing.aggro") === false, "the page's switches work");
});

console.log("ForeverUI — Lua harness (fengari)");
console.log("  core     saved variables, profiles, modules, combat queue");
console.log("  theme    panels, widgets, live accent, reset");
console.log("  skins    ForeverUI.RegisterSkin before/after login, errors, per-addon off");
console.log("  movers   default point, unlock, drag, save, reset, combat lock");
console.log("  unlock   edge anchors, snapping, grid, arrow-key nudge, accent presets");
console.log("  bars     secure buttons, bindings, hotkeys, paging snippet, usable, secrets, drag, events, combat wait");
console.log("  healing  calculator and fallback heal/shield bars, hidden values, aggro strip, buff watch by name, options");
console.log("  auras    dispel border by type (hidden -> highlight), HoT icons, stacks, timers, combat filter");
console.log("  clicks   click casting and hover keys: attributes, enter/leave snippets, remove, combat wait, per spec, options editor");
console.log("  raid     secure header, precreated buttons, health/name/role/offline, events, party coverage, default frames hidden");
console.log("  options  window, pages, swatches, check boxes, cycles, reload button, export, spec, addons button");
console.log("  profiles strings round-trip, refuse bad/cut/code pastes, export/import, new/copy/delete/reset, spec switching");
console.log("  range    red when out of range, by range events or asked; secrets never red");
console.log("  data     XP with rested, watched reputation, hover text, hides when empty");
console.log("  more     minimap (square, zone, coords, zoom), chat skin and tabs, combined bags");
console.log("  units    secure buttons, bars, colors, secret values, events, ToT timer, Blizzard frames hidden, combat wait");
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("OK  ForeverUI core under the strict WoW stub");
