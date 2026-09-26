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
    local b = ns.Theme.Button(CreateFrame("Button", nil, UIParent, "UIPanelButtonTemplate"))
    local e = ns.Theme.EditBox(CreateFrame("EditBox", nil, UIParent))
    local c = ns.Theme.CloseButton(CreateFrame("Button", nil, UIParent, "UIPanelCloseButton"))
    local glyph
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == c and w.__kind == "FontString" then glyph = w.__text end
    end
    return { painted = ns.Theme.PaintedCount(), glyph = glyph }`);
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

console.log("ForeverUI — Lua harness (fengari)");
console.log("  core     saved variables, profiles, modules, combat queue");
console.log("  theme    panels, widgets, live accent, reset");
console.log("  skins    ForeverUI.RegisterSkin before/after login, errors, per-addon off");
console.log("  movers   default point, unlock, drag, save, reset, combat lock");
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("OK  ForeverUI core under the strict WoW stub");
