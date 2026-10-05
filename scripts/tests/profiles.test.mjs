// profiles: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { RETAIL, UI_ENV, chatHas, loggedIn, setCombat } from "./helpers.mjs";

it("profile strings", () => {
  const addon = loggedIn();
  const round = addon.eval(`
    local S = ns.Serialize
    local data = { a = 1, b = 2.5, c = -0.125, d = "quote \\" back \\\\ nl \\n tab \\t é", e = true, f = false,
      list = { 10, 20, { deep = "x" } }, [7] = "seven", fn = function() end }
    local text = S.Encode("profile", data)
    local scope, back = S.Decode(text)
    return { text = text, again = S.Encode("profile", data), scope = scope, back = back }`);
  expect(/^VG1:profile:[0-9a-f]{4}:[A-Za-z0-9+/=]+$/.test(round.text), "VG1:scope:checksum:base64").toBeTruthy();
  expect(round.text === round.again, "encoding is deterministic").toBeTruthy();
  const b = round.back;
  expect(round.scope === "profile" && b.a === 1 && b.b === 2.5 && b.c === -0.125 && b.e === true && b.f === false, "numbers and booleans round-trip").toBeTruthy();
  expect(b.d === 'quote " back \\ nl \n tab \t é', `strings with quotes, backslashes, control and UTF-8 bytes round-trip (got ${JSON.stringify(b.d)})`).toBeTruthy();
  expect(b.list[2].deep === "x" && b["7"] === "seven" && b.fn === undefined, "nested tables and number keys round-trip; functions are left out").toBeTruthy();
  // ns.Serialize.Decode on a Lua string expression: { scope, err }.
  const decode = (lua) => addon.eval(`local scope, err = ns.Serialize.Decode(${lua}) return { scope = scope, err = err }`);
  expect(/not a Vanguard/.test(decode('"hello"').err), "rejects other text").toBeTruthy();
  expect(/cut off/.test(decode(`${JSON.stringify(round.text.slice(0, -4))}`).err), "rejects a truncated string").toBeTruthy();
  const code = addon.eval(`local S = ns.Serialize local body = S.Base64("os.exit()") return "VG1:profile:" .. S.Checksum(body) .. ":" .. body`);
  expect(/can't be read/.test(decode(JSON.stringify(code)).err), "text that isn't settings (e.g. code) is refused, never run").toBeTruthy();
});

it("profile strings keep big whole numbers", () => {
  const r = loggedIn().eval(`local S = ns.Serialize
    local realFormat = string.format
    string.format = function(f, ...)
      local v = ...
      if f:find("%d", 1, true) and type(v) == "number" and (math.abs(v) >= 2 ^ 31 or v ~= math.floor(v)) then error("%d of " .. v .. " is undefined on Lua 5.1") end
      return realFormat(f, ...)
    end
    local text = S.Encode("profile", { big = 2 ^ 40, neg = -(2 ^ 40), half = 2 ^ 40 + 0.5, one = 1 })
    local raw = S.Unbase64(text:match("^VG1:profile:%x%x%x%x:(.+)$"))
    local _, back = S.Decode(text)
    string.format = realFormat
    return { raw = raw, big = back.big, neg = back.neg, half = back.half, one = back.one }`);
  expect(r.raw, "whole numbers are written as plain digits").toBe('{["big"]=1099511627776,["half"]=1099511627776.5,["neg"]=-1099511627776,["one"]=1}');
  expect([r.big, r.neg, r.half, r.one], "and read back exactly").toEqual([1099511627776, -1099511627776, 1099511627776.5, 1]);
});

it("export and import", () => {
  const src = loggedIn();
  src.slash("accent ff8000");
  src.eval('ns.Profile().positions = { uf_player = { point = "TOP", relPoint = "TOP", x = 1, y = -2 } }');
  src.slash("export");
  const text = src.eval("return Vanguard_TextEdit:GetText()");
  expect(text.startsWith("VG1:profile:") && src.eval("return Vanguard_TextDialog:IsShown()"), "/vg export shows the string, selected to copy").toBeTruthy();
  const dst = loggedIn(RETAIL);
  dst.slash("import");
  dst.eval(`Vanguard_TextEdit:SetText(${JSON.stringify(text)}); Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
  expect(dst.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile }"), "a whole-profile import becomes a new profile this character uses after the reload").toEqual(["Default", "Imported"]);
  expect(dst.eval("return VanguardDB.profiles.Imported.positions.uf_player.x") === 1 && dst.eval("return VanguardDB.profiles.Imported.theme.accent[1]") === 1, "with every setting").toBeTruthy();
  expect(dst.eval("return Vanguard_Question:IsShown() and Vanguard_Question.title:GetText()"), "it asks about the UI scale the profile was made at first").toBe("This profile was made at UI scale 100% on a 1920 x 1080 screen (yours: 100%). Use its UI scale?");
  dst.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(dst.eval("return Vanguard_Question:IsShown() == false and GetCVar('uiScale') == nil"), "No leaves the UI scale alone").toBe(true);
  expect(dst.eval("return Vanguard_Reload:IsShown()") && /Reload/.test(dst.eval("return Vanguard_Reload.accept.text:GetText()")), "and a reload is offered").toBeTruthy();
  dst.eval('ReloadUI = function() __reloaded = true end; Vanguard_Reload.accept:GetScript("OnClick")(Vanguard_Reload.accept)');
  expect(dst.eval("return __reloaded") === true, "Reload reloads the UI").toBeTruthy();
  const theme = src.eval('return ns.ExportProfile("theme")');
  dst.eval('ns.UseProfile("Default")');
  expect(/Imported theme settings/.test(dst.eval(`return ns.ImportProfile(${JSON.stringify(theme)})`)), "a module string imports into the active profile").toBeTruthy();
  expect(dst.eval("return VanguardDB.profiles.Default.theme.accent[1]") === 1 && dst.eval("return (VanguardDB.profiles.Default.positions or {}).uf_player") === null, "replacing only that module's settings").toBeTruthy();
  dst.clearChat();
  dst.eval('ns.AskText("x", function() end)');
  dst.slash("import");
  dst.eval('Vanguard_TextEdit:SetText("garbage"); Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)');
  expect(chatHas(dst, /Import failed: not a Vanguard profile string/), "a bad paste says why").toBeTruthy();
});

it("profile management", () => {
  const addon = loggedIn();
  addon.slash("profile new Raid");
  expect(addon.eval("return VanguardDB.profiles.Raid ~= nil") === true, "/vg profile new creates one").toBeTruthy();
  addon.slash("profile new Raid");
  expect(chatHas(addon, /taken or not allowed/), "names are unique").toBeTruthy();
  addon.eval("VanguardDB.profiles.Raid.theme = { accent = { 0, 1, 0 } }");
  addon.slash("profile copy Raid");
  expect(addon.eval("return VanguardDB.profiles.Default.theme.accent[2]") === 1, "/vg profile copy copies into the active profile").toBeTruthy();
  addon.slash("profile delete Default");
  expect(chatHas(addon, /Can't delete/), "the active profile can't be deleted").toBeTruthy();
  addon.slash("profile delete Raid");
  expect(addon.eval("return VanguardDB.profiles.Raid") === null, "others can").toBeTruthy();
  addon.slash("profile reset");
  expect(addon.eval("return VanguardDB.profiles.Default.theme") === null, "/vg profile reset clears the active profile").toBeTruthy();
  addon.slash("profile bad/name");
  expect(chatHas(addon, /1-32 letters/), "profile names are checked").toBeTruthy();
});

it("spec profiles", () => {
  const env = "GetSpecialization = function() return __spec end __spec = 2";
  const addon = loggedIn(env);
  addon.slash("profile new Healer");
  addon.eval('VanguardDB.profiles.Healer.theme = { accent = { 0, 1, 0 } }');
  addon.slash("spec Healer");
  expect(addon.eval("return VanguardCharDB.specProfiles[2]") === "Healer", "/vg spec maps the current spec to a profile").toBeTruthy();
  const relog = createAddon({ savedVariables: 'VanguardDB = { version = 1, profiles = { Default = {}, Healer = { theme = { accent = { 0, 1, 0 } } } } }\nVanguardCharDB = { profile = "Default", specProfiles = { [2] = "Healer" } }' });
  relog.eval(env);
  relog.login();
  expect(relog.eval("return VanguardCharDB.profile") === "Healer" && relog.eval("return select(2, ns.Theme.Accent())") === 1, "logging in as that spec uses its profile before modules load").toBeTruthy();
  relog.eval("__spec = 1; VanguardCharDB.specProfiles[1] = 'Default'");
  relog.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect([relog.eval("return VanguardCharDB.profile"), relog.eval("return VanguardCharDB.pendingProfile"), relog.eval("return Vanguard_Reload:IsShown()")], "changing spec stages its profile and offers a reload").toEqual(["Healer", "Default", true]);
  addon.slash("spec off");
  expect(addon.eval("return VanguardCharDB.specProfiles[2]") === null, "/vg spec off stops switching").toBeTruthy();
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
    VanguardDB.profiles.Imported = {}
    return ns.ImportProfile(text)
  `);
  expect(/Imported 2/.test(imported) && addon.eval("return VanguardCharDB.pendingProfile") === "Imported 2", "a second whole-profile import takes the next free name").toBeTruthy();
});

it("a profile string with an unterminated quote", () => {
  const addon = loggedIn();
  const err = addon.eval(`
    local S = ns.Serialize
    -- TEST-ONLY profile body whose string never closes.
    local body = S.Base64('{["a"]="unterminated')
    local text = "VG1:profile:" .. S.Checksum(body) .. ":" .. body
    local _, why = S.Decode(text)
    return why
  `);
  expect(/can't be read/.test(err), "an unterminated string inside a profile string is refused").toBeTruthy();
});

// TEST-ONLY saved variables: Raid has its own accent, Default does not; a switch to Raid was staged last session.
const STAGED = 'VanguardDB = { version = 1, profiles = { Default = {}, Raid = { theme = { accent = { 0, 1, 0 } } } } }\nVanguardCharDB = { profile = "Default", pendingProfile = "Raid" }';

it("a staged profile switch applies at the next load, and until then the running profile is the one edited", () => {
  const addon = loggedIn();
  addon.slash("profile new Raid");
  const before = addon.eval("local t = ns.Settings('theme') return { t == ns.Profile().theme, ns.ProfileName() }");
  addon.slash("profile Raid");
  expect(addon.eval("return { ns.ProfileName(), ns.SelectedProfileName(), ns.PendingProfileName(), ns.Settings('theme') == ns.Profile().theme, Vanguard_Reload:IsShown() }"), "staging changes neither the running profile nor its cached tables, and offers the reload")
    .toEqual(["Default", "Raid", "Raid", true, true]);
  addon.slash("accent ff8000");
  expect(addon.eval("return { VanguardDB.profiles.Default.theme ~= nil, VanguardDB.profiles.Raid.theme == nil }"), "an accent change lands in the profile on screen, not the staged one").toEqual([true, true]);
  expect(before, "the cache held the running profile before staging").toEqual([true, "Default"]);
  addon.clearChat();
  addon.slash("profile");
  expect(chatHas(addon, /Profile: Default; Raid after a reload {3}\(all: Default, Raid\)/), "/vg profile says what comes after the reload").toBeTruthy();
  addon.slash("profile Default");
  expect([addon.eval("return ns.PendingProfileName()"), chatHas(addon, /already uses profile Default/)], "choosing the running profile again takes the switch back").toEqual([null, true]);
  const next = createAddon({ savedVariables: STAGED });
  next.login();
  expect(next.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile == nil, ns.ProfileName(), ns.SelectedProfileName(), (select(2, ns.Theme.Accent())) }"), "the next load applies it, clears it, and modules get the staged profile's tables")
    .toEqual(["Raid", true, "Raid", "Raid", 1]);
  expect(next.eval("return ns.Settings('theme') == VanguardDB.profiles.Raid.theme"), "the settings cache hands out the new profile's tables").toBe(true);
});

it("a staged profile that no longer exists is created empty when it is applied", () => {
  const addon = createAddon({ savedVariables: 'VanguardDB = { version = 1, profiles = { Default = {} } }\nVanguardCharDB = { profile = "Default", pendingProfile = "Gone" }' });
  addon.login();
  expect(addon.eval("return { ns.ProfileName(), VanguardDB.profiles.Gone ~= nil }"), "the switch still happens, onto an empty profile").toEqual(["Gone", true]);
});

it("the spec change events stage the spec's profile, whatever they pass", () => {
  const env = "GetSpecialization = function() return __spec end __spec = 2";
  const addon = createAddon({ savedVariables: 'VanguardDB = { version = 1, profiles = { Default = {}, Healer = {} } }\nVanguardCharDB = { profile = "Default", specProfiles = { [2] = "Healer" } }' });
  addon.eval(env);
  addon.login();
  expect(addon.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile == nil }"), "login applies the spec's profile at once").toEqual(["Healer", true]);
  addon.eval("__spec = 1 VanguardCharDB.specProfiles[1] = 'Default'");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "target");
  expect(addon.eval("return VanguardCharDB.pendingProfile"), "another unit's spec change is ignored").toBe(null);
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 2);
  expect([addon.eval("return VanguardCharDB.pendingProfile"), addon.eval("return Vanguard_Reload:IsShown()")], "ACTIVE_TALENT_GROUP_CHANGED passes group numbers and still stages the profile").toEqual(["Default", true]);
  addon.eval("__spec = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect(addon.eval("return VanguardCharDB.pendingProfile"), "changing back to the running profile's spec takes the switch back").toBe(null);
});

it("a frame's scale and opacity travel with the profile: export, import and a staged switch", () => {
  const src = loggedIn(UI_ENV);
  src.eval('ns.SetMoverScale("minimap", 1.25) ns.SetMoverAlpha("minimap", 0.75)');
  const text = src.eval("return ns.ExportProfile()");
  const dst = loggedIn(UI_ENV);
  dst.eval(`ns.ImportProfile(${JSON.stringify(text)})`);
  expect(dst.eval("return VanguardDB.profiles.Imported.positions.minimap"), "the imported profile has them").toEqual({ scale: 1.25, alpha: 0.75 });
  expect(dst.eval("return { ns.MoverLook('minimap') }"), "the running profile keeps its own until the reload").toEqual([1, 1]);
  const next = createAddon({ savedVariables: 'VanguardDB = { version = 1, setupDone = true, profiles = { Default = {}, Raid = { positions = { minimap = { scale = 1.5, alpha = 0.5 } } } } }\nVanguardCharDB = { profile = "Default", pendingProfile = "Raid" }' });
  next.eval(UI_ENV);
  next.login();
  expect(next.eval("local f = ns.MoverFrame('minimap') return { f:GetScale(), f:GetAlpha() }"), "the staged profile's scale and opacity apply at the next load").toEqual([1.5, 0.5]);
});

// Pastes a string into /vg import and clicks Import.
const importText = (addon, text) => {
  addon.slash("import");
  addon.eval(`Vanguard_TextEdit:SetText(${JSON.stringify(text)}) Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
};

it("profile strings carry the UI scale and screen; importing one asks whether to use its UI scale", () => {
  const src = loggedIn("__wfgStub.setScreen(2560, 1440) UIParent:SetScale(0.7)");
  const text = src.eval("return ns.ExportProfile()");
  expect(src.eval(`local _, data = ns.Serialize.Decode(${JSON.stringify(text)}) return data.display`), "a whole-profile string has the UI scale and screen it was made on").toEqual({ uiScale: 0.7, width: 2560, height: 1440 });
  expect(src.eval("return ns.Profile().display"), "without adding them to the profile itself").toBe(null);
  src.slash("accent ff8000");
  expect(src.eval(`local _, data = ns.Serialize.Decode(ns.ExportProfile("theme")) return data.display == nil`), "a module's string has none").toBe(true);
  const dst = loggedIn();
  importText(dst, text);
  expect(dst.eval("return Vanguard_Question.title:GetText()"), "the question names the scale and screen, and yours").toBe("This profile was made at UI scale 70% on a 2560 x 1440 screen (yours: 100%). Use its UI scale?");
  expect(dst.eval("return Vanguard_Reload == nil or not Vanguard_Reload:IsShown()"), "the reload waits for the answer").toBe(true);
  dst.eval('Vanguard_Question.yes:GetScript("OnClick")(Vanguard_Question.yes)');
  expect(dst.eval("return { GetCVar('useUiScale'), GetCVar('uiScale'), Vanguard_Reload:IsShown(), VanguardDB.profiles.Imported.display == nil }"), "Use it sets the game's UI scale, then the reload is offered; the block isn't kept in the profile").toEqual(["1", "0.7", true, true]);
  const old = dst.eval('return ns.Serialize.Encode("profile", { theme = { reduceMotion = true }, display = { uiScale = "TEST-ONLY" } })');
  dst.eval("Vanguard_Reload:Hide()");
  importText(dst, old);
  expect(dst.eval("return { Vanguard_Question:IsShown(), Vanguard_Reload:IsShown(), VanguardDB.profiles['Imported 2'].display == nil }"), "a string with no usable UI scale goes straight to the reload").toEqual([false, true, true]);
  expect(dst.eval("return ns.DisplayQuestion({ uiScale = 0.8 })"), "a block with no screen size leaves it out").toBe("This profile was made at UI scale 80% (yours: 100%). Use its UI scale?");
});

// TEST-ONLY Edit Mode: its manager lists the presets, then the account's layouts; the
// layouts load when UpdateLayoutInfo first runs; C_EditMode switches and reloads them.
const EDIT_MODE_ENV = `
  __layouts = { { layoutName = "Modern" }, { layoutName = "Classic" }, { layoutName = "TEST-ONLY Raid" } }
  __active = 1
  EditModeManagerFrame = CreateFrame("Frame", "EditModeManagerFrame", UIParent)
  function EditModeManagerFrame:GetLayouts() return __layouts end
  function EditModeManagerFrame:GetActiveLayoutInfo() return __loaded and __layouts[__active] or nil end
  function EditModeManagerFrame:UpdateLayoutInfo() __loaded = true end
  C_EditMode = { SetActiveLayout = function(i) __active = i EditModeManagerFrame:UpdateLayoutInfo() end }
`;

// A character logging in with these saved variables and Edit Mode; Lua in before runs before login.
function editModeLogin(saved, before = "") {
  const addon = createAddon({ savedVariables: `VanguardDB = { version = 1, setupDone = true, profiles = { Default = {}, Raid = { editMode = { layout = "TEST-ONLY Raid" } } } }\n${saved}` });
  addon.eval(EDIT_MODE_ENV + before);
  addon.login();
  return addon;
}

// The layout in use, the one the running profile remembers, and the profile this character last ran.
const layouts = (addon) => addon.eval("return { ns.EditModeLayout() or 'none', ns.Profile().editMode and ns.Profile().editMode.layout or 'none', VanguardCharDB.editModeProfile or 'none' }");

it("the Edit Mode layout goes with the profile: remembered, exported, and switched to when the profile loads", () => {
  const fresh = editModeLogin('VanguardCharDB = { profile = "Default" }');
  expect(layouts(fresh), "before Edit Mode has its layouts, nothing is read").toEqual(["none", "none", "none"]);
  fresh.eval("EditModeManagerFrame:UpdateLayoutInfo()");
  expect(layouts(fresh), "once it has them, the profile remembers the layout in use, and switches nothing").toEqual(["Modern", "Modern", "Default"]);
  fresh.eval("C_EditMode.SetActiveLayout(3)");
  expect(layouts(fresh), "picking another layout in Edit Mode is remembered").toEqual(["TEST-ONLY Raid", "TEST-ONLY Raid", "Default"]);
  expect(fresh.eval("local _, data = ns.Serialize.Decode(ns.ExportProfile()) return data.editMode.layout"), "and it is in the profile's string").toBe("TEST-ONLY Raid");
  const switched = editModeLogin('VanguardCharDB = { profile = "Default", pendingProfile = "Raid", editModeProfile = "Default" }');
  switched.eval("EditModeManagerFrame:UpdateLayoutInfo()");
  expect(layouts(switched), "loading another profile switches Edit Mode to its layout").toEqual(["TEST-ONLY Raid", "TEST-ONLY Raid", "Raid"]);
  expect(chatHas(switched, /Edit Mode layout TEST-ONLY Raid, from profile Raid\./), "and says so").toBe(true);
  const shared = editModeLogin('VanguardCharDB = { profile = "Raid", editModeProfile = "Raid" }', "__loaded = true");
  expect(layouts(shared), "the profile it ran last time switches nothing (another character may share it); layouts loaded before login are read at login").toEqual(["Modern", "Modern", "Raid"]);
});

it("the Edit Mode layout: one this account lacks, combat, and a client without Edit Mode", () => {
  const missing = editModeLogin('VanguardCharDB = { profile = "Raid", editModeProfile = "Default" }', '__layouts[3] = nil');
  missing.eval("EditModeManagerFrame:UpdateLayoutInfo()");
  expect(layouts(missing), "a layout this account doesn't have is kept in the profile").toEqual(["Modern", "TEST-ONLY Raid", "Raid"]);
  expect(chatHas(missing, /uses Edit Mode layout TEST-ONLY Raid, which this account doesn't have/), "and the player is told").toBe(true);
  const fight = editModeLogin('VanguardCharDB = { profile = "Raid", editModeProfile = "Default" }');
  setCombat(fight, true);
  fight.eval("EditModeManagerFrame:UpdateLayoutInfo() EditModeManagerFrame:UpdateLayoutInfo()");
  expect(layouts(fight), "in combat the switch waits, and the layout in use isn't remembered over the profile's").toEqual(["Modern", "TEST-ONLY Raid", "Raid"]);
  setCombat(fight, false);
  expect(layouts(fight), "it switches when combat ends").toEqual(["TEST-ONLY Raid", "TEST-ONLY Raid", "Raid"]);
  const none = loggedIn("EditModeManagerFrame = CreateFrame('Frame', 'EditModeManagerFrame', UIParent)");
  expect(none.eval("return { ns.EditModeLayout() == nil, ns.Profile().editMode == nil }"), "without Edit Mode's layout methods nothing is read or saved").toEqual([true, true]);
  const noSwitch = editModeLogin('VanguardCharDB = { profile = "Raid", editModeProfile = "Default" }', "C_EditMode = nil __loaded = true");
  expect(layouts(noSwitch), "without the client's switch, the layout in use stays and is remembered").toEqual(["Modern", "Modern", "Raid"]);
  const unhooked = editModeLogin('VanguardCharDB = { profile = "Raid", editModeProfile = "Default" }', "hooksecurefunc = nil __loaded = true");
  expect(layouts(unhooked), "without hooks nothing is followed").toEqual(["Modern", "TEST-ONLY Raid", "Default"]);
});

it("strings and profiles from before the rename (ForeverUI 0.3.0)", () => {
  const addon = loggedIn();
  const old = addon.eval(`
    local S = ns.Serialize
    local text = S.Encode("profile", { theme = { barTexture = "forever" } }):gsub("^VG1:", "FUI1:")
    local scope, back = S.Decode(text)
    return { prefix = text:sub(1, 5), scope = scope, bar = back and back.theme.barTexture }`);
  expect([old.prefix, old.scope, old.bar], "an FUI1 string from ForeverUI still decodes").toEqual(["FUI1:", "profile", "forever"]);
  // TEST-ONLY saved profile written by ForeverUI 0.3.0, with its bundled bar style picked.
  const saved = 'VanguardDB = { version = 2, profiles = { Default = { theme = { barTexture = "forever" } } } }\nVanguardCharDB = { profile = "Default" }';
  const renamed = loggedIn("", { savedVariables: saved });
  expect(renamed.eval("return ns.Theme.Settings().barTexture"), "the old bar style name reads as Vanguard's").toBe("vanguard");
  expect(renamed.eval("return ns.Theme.BarTexture() == ns.Theme.Texture('Bar')"), "and draws the bundled bar").toBe(true);
});
