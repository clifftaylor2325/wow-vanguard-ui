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

attempt("unit frames", () => {
  const addon = loggedIn(UNITS_ENV);
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

console.log("ForeverUI — Lua harness (fengari)");
console.log("  core     saved variables, profiles, modules, combat queue");
console.log("  theme    panels, widgets, live accent, reset");
console.log("  skins    ForeverUI.RegisterSkin before/after login, errors, per-addon off");
console.log("  movers   default point, unlock, drag, save, reset, combat lock");
console.log("  unlock   edge anchors, snapping, grid, arrow-key nudge, accent presets");
console.log("  bars     secure buttons, bindings, hotkeys, paging snippet, usable, secrets, drag, events, combat wait");
console.log("  units    secure buttons, bars, colors, secret values, events, ToT timer, Blizzard frames hidden, combat wait");
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("OK  ForeverUI core under the strict WoW stub");
