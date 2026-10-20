// profiles: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { CLICK_LUA, RETAIL, UI_ENV, chatHas, expectErrors, isTok, loggedIn, px, setCombat } from "./helpers.mjs";
import { alphaOf, buttonOf, closeOf, escapes, insets, pressEscape, thumbOf, titleOf, titleSize } from "./dialogs.mjs";

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
it("profile strings with a number that is not finite are refused, never decoded to infinity", () => {
  const addon = loggedIn();
  // Decodes a profile string around body (a checksum made to match): { scope, err }.
  const err = (body) => addon.eval(`local S = ns.Serialize local body = S.Base64(${JSON.stringify(body)}) local scope, err = S.Decode("VG1:profile:" .. S.Checksum(body) .. ":" .. body) return { scope = scope, err = err }`);
  expect(err('{["x"]=1e999}').err, "1e999 would be infinity").toMatch(/can't be read|unexpected/);
  expect(err('{["x"]=-1e999}').err, "so would -1e999").toMatch(/can't be read|unexpected/);
  expect(err('{["x"]=1e3}').scope, "an ordinary exponent still reads").toBe("profile");
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
  expect(addon.eval("return VanguardDB.profiles.Default.theme ~= nil and Vanguard_Question:IsShown()"), "/vg profile reset asks first").toBe(true);
  addon.eval("Vanguard_Question.confirm:GetScript(\"OnClick\")(Vanguard_Question.confirm)");
  expect(addon.eval("return { VanguardDB.profiles.Default.theme == nil, VanguardDB.profiles[\"Default backup\"].theme.accent[2] }"), "then clears the active profile and keeps a copy").toEqual([true, 1]);
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
    -- The profile changes after the export, so the string matches no profile here.
    ns.Theme.Settings().reduceMotion = not ns.Theme.Settings().reduceMotion
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
it("a staged profile that no longer exists is dropped when it would be applied", () => {
  const addon = createAddon({ savedVariables: 'VanguardDB = { version = 1, profiles = { Default = {} } }\nVanguardCharDB = { profile = "Default", pendingProfile = "Gone" }' });
  addon.login();
  expect(addon.eval("return { ns.ProfileName(), VanguardDB.profiles.Gone == nil, VanguardCharDB.pendingProfile == nil }"), "the character keeps its profile, and the deleted one isn't made again empty").toEqual(["Default", true, true]);
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
it("swapping back to a spec with no profile of its own takes back the switch another spec staged", () => {
  const addon = createAddon({ savedVariables: 'VanguardDB = { version = 1, setupDone = true, profiles = { Default = {}, Heal = {}, Picked = {} } }\nVanguardCharDB = { profile = "Default", setupDone = true, specProfiles = { [2] = "Heal" } }' });
  addon.eval("GetSpecialization = function() return __spec end __spec = 1");
  addon.login();
  addon.eval("__spec = 2");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval("return VanguardCharDB.pendingProfile"), "spec 2 stages its profile").toBe("Heal");
  addon.eval("__spec = 1");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval("return VanguardCharDB.pendingProfile"), "spec 1 uses the character's profile again").toBe(null);
  addon.eval("ns.UseProfile('Picked')");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval("return VanguardCharDB.pendingProfile"), "a profile the player picked stays staged").toBe("Picked");
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
  dst.slash("accent ff8000");
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
it("Use it after an import turns Pixel-perfect off in the imported profile, not in the one being left", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { theme = { pixelScale = true } }\n" });
  // TEST-ONLY whole profile made with Pixel-perfect on, at UI scale 90%.
  const text = addon.eval('return ns.Serialize.Encode("profile", ns.StampPayload({ theme = { accent = "jade", pixelScale = true }, display = { uiScale = 0.9 } }))');
  importText(addon, text);
  addon.eval('Vanguard_Question.yes:GetScript("OnClick")(Vanguard_Question.yes)');
  expect(addon.eval("return { VanguardCharDB.pendingProfile, GetCVar('uiScale') }"), "the import is staged and the game's UI scale set").toEqual(["Imported", "0.9"]);
  expect(addon.eval("return { VanguardDB.profiles.Imported.theme.pixelScale, ns.Theme.Settings().pixelScale }"), "Pixel-perfect goes off where the chosen scale will run, and the profile on screen keeps its own").toEqual([false, true]);
  addon.eval("ns.UseProfile('Default') VanguardDB.profiles.Bare = {} ns.UseProfile('Bare') ns.OfferDisplay({ uiScale = 0.8 }, function() end)");
  addon.eval('Vanguard_Question.yes:GetScript("OnClick")(Vanguard_Question.yes)');
  expect(addon.eval("return VanguardDB.profiles.Bare.theme.pixelScale"), "a staged profile with no theme yet gets one").toBe(false);
  addon.eval("ns.UseProfile('Default') ns.OfferDisplay({ uiScale = 0.8 }, function() end)");
  addon.eval('Vanguard_Question.yes:GetScript("OnClick")(Vanguard_Question.yes)');
  expect(addon.eval("return { ns.Theme.Settings().pixelScale, GetCVar('uiScale') }"), "with no switch staged it goes off in the profile in use").toEqual([false, "0.8"]);
});
it("No to 'Use its UI scale?' keeps this player's scale: a Pixel-perfect profile from a 4K screen brings neither its switch nor its multiple", () => {
  const other = loggedIn(CLICK_LUA + "__wfgStub.setScreen(3840, 2160)");
  other.eval('ns.Setup.ApplyScreen("pixel")');
  const text = other.eval("return ns.ExportProfile()");
  const a = loggedIn(CLICK_LUA);
  const before = a.eval("return UIParent:GetScale()");
  importText(a, text);
  expect(a.eval("return Vanguard_Question.title:GetText()")).toBe("This profile was made at UI scale 71% on a 3840 x 2160 screen (yours: 100%). Use its UI scale?");
  a.eval('local b = Vanguard_Question.no b:GetScript("OnClick")(b, "LeftButton")');
  a.fire("PLAYER_LOGOUT");
  const sv = a.savedVariables();
  const b = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  b.eval(CLICK_LUA);
  b.login();
  expect(b.eval("local s = ns.Theme.Settings() return { ns.ProfileName(), UIParent:GetScale(), s.pixelScale, s.pixelMultiple }"), "after the reload: the imported profile at this player's scale").toEqual(["Imported", before, false, 0]);
});
it("a whole-profile import keeps this player's own Pixel-perfect switch and multiple, even with no UI scale to ask about", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { theme = { pixelScale = true, pixelMultiple = 2 } }\n" });
  importText(addon, addon.eval('return ns.Serialize.Encode("profile", ns.StampPayload({ theme = { accent = "jade" } }))'));
  expect(addon.eval("local t = VanguardDB.profiles.Imported.theme return { t.pixelScale, t.pixelMultiple, t.accent }"), "the string's settings with this player's scale").toEqual([true, 2, "jade"]);
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
// TEST-ONLY: what ForeverUI 0.3.0 exported (it wrote every default in): its action bar and data bar sizes, as an FUI1 string.
const OLD_SIZES = `local p = { ActionBars = { lockButtons = true, rangeTint = true, size = 36, spacing = 4 },
  DataBars = { width = 476, height = 10, xp = true, reputation = true, text = "hover" } }
  return (ns.Serialize.Encode("profile", p):gsub("^VG1:", "FUI1:"))`;
it("an imported ForeverUI 0.3.0 profile gets today's button size with today's data bar width", () => {
  const a = loggedIn(CLICK_LUA);
  a.eval("ns.ImportDialog()");
  a.eval(`Vanguard_TextEdit:SetText(${JSON.stringify(a.eval(OLD_SIZES))})`);
  a.eval('__click("Import")');
  a.fire("PLAYER_LOGOUT");
  const sv = a.savedVariables();
  const b = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  b.login();
  expect(b.eval("return { ns.ProfileName(), ns.Settings('ActionBars').size, ns.Settings('ActionBars').spacing, ns.Settings('DataBars').width }"), "38 px buttons 2 apart over the 478 px bars").toEqual(["Imported", 38, 2, 478]);
});
it("a profile deleted on another character falls back to Default, not back empty", () => {
  // TEST-ONLY saved files: this character last used Raid, which another character has since deleted.
  const gone = createAddon({ savedVariables: 'VanguardDB = { version = 2, setupDone = true, profiles = { Default = { theme = { accent = { 0, 1, 0 } } } } }\nVanguardCharDB = { profile = "Raid" }' });
  gone.login();
  expect(gone.eval("return VanguardCharDB.profile"), "the character loads Default").toBe("Default");
  expect(gone.eval("return VanguardDB.profiles.Raid"), "and the deleted name doesn't come back").toBe(null);
  expect(gone.eval("return select(2, ns.Theme.Accent())"), "with Default's settings").toBe(1);
  // TEST-ONLY: a switch to Healer was staged here, then Healer was deleted elsewhere before the reload.
  const staged = createAddon({ savedVariables: 'VanguardDB = { version = 2, setupDone = true, profiles = { Default = {}, Tank = {} } }\nVanguardCharDB = { profile = "Tank", pendingProfile = "Healer" }' });
  staged.login();
  expect(staged.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile == nil }"), "the staged switch is dropped and the character keeps its profile").toEqual(["Tank", true]);
  expect(staged.eval("return VanguardDB.profiles.Healer"), "without making the deleted profile again").toBe(null);
});
it("Copy here while a switch waits copies into the profile used after the reload", () => {
  const addon = loggedIn();
  addon.slash("profile new Raid");
  addon.slash("profile new Healer");
  addon.eval('VanguardDB.profiles.Default.theme = { accent = { 1, 0, 0 } }; VanguardDB.profiles.Healer.theme = { accent = { 0, 1, 0 } }');
  addon.slash("profile Raid");
  expect(addon.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile }"), "Raid is staged for the reload").toEqual(["Default", "Raid"]);
  addon.clearChat();
  addon.slash("profile copy Healer");
  expect(addon.eval("return VanguardDB.profiles.Raid.theme.accent[2]"), "/vg profile copy writes into the incoming profile").toBe(1);
  expect(addon.eval("return VanguardDB.profiles.Default.theme.accent[1]"), "and leaves the running profile alone").toBe(1);
  expect(addon.eval("return Vanguard_Reload.title:GetText()"), "the reload offer names the profile it copied into").toBe("Copied Healer into Raid. Reload the UI now to apply it?");
  expect(addon.eval('return ns.CopyProfile("Raid")'), "a profile can't be copied onto the one it is going into").toBe(false);
  addon.eval('VanguardDB.profiles.Healer.theme = { accent = { 0, 0, 1 } }');
  expect(addon.eval('return ns.CopyProfile("Healer")'), "ns.CopyProfile returns the profile it copied into").toBe("Raid");
  expect(addon.eval("return { VanguardDB.profiles.Raid.theme.accent[3], VanguardDB.profiles.Default.theme.accent[1] }"), "Copy here does the same").toEqual([1, 1]);
});
// A string made in Lua: ns.Serialize.Encode(scope, <Lua table>); `fui` gives it ForeverUI's FUI1 prefix.
const encoded = (addon, scope, lua, fui = false) => addon.eval(`local text = ns.Serialize.Encode("${scope}", ${lua}) return ${fui ? '(text:gsub("^VG1:", "FUI1:"))' : "text"}`);
// ns.ImportProfile on a string: { m = what it says, notes, reload } or { why = why not }.
const imports = (addon, text) => addon.eval(`local m, r = ns.ImportProfile(${JSON.stringify(text)})
  if not m then return { why = r } end
  return { m = m, notes = r.notes, reload = r.reload }`);
it("profile strings carry their format and version, and an older string is upgraded before anything is saved", () => {
  const addon = loggedIn();
  expect(addon.eval("local _, d = ns.Serialize.Decode(ns.ExportProfile()) return { d.format, type(d.addonVersion) }"), "every string says its format and the version that made it").toEqual([2, "string"]);
  // TEST-ONLY whole profile from before formats (ForeverUI's prefix), with the old bar style name.
  const old = encoded(addon, "profile", '{ theme = { barTexture = "forever", reduceMotion = true } }', true);
  const whole = imports(addon, old);
  expect(whole.m, "it imports as a new profile, as before").toBe("Imported as profile Imported; this character will use it after a reload.");
  expect(addon.eval("local t = VanguardDB.profiles.Imported return { t.theme.barTexture, t.format == nil, t.addonVersion == nil }"), "its tables went through their upgrades (ns.Migrate) first; the string's own keys aren't kept").toEqual(["vanguard", true, true]);
  expect(whole.notes.length, "the renamed bar style is no missing texture: the only note is the backup").toBe(1);
  addon.eval('ns.Theme.Settings().reduceMotion = true ns.Theme.Settings().barTexture = "soft"');
  // TEST-ONLY module string from before formats: the theme table alone, under its name.
  const mod = imports(addon, encoded(addon, "theme", '{ barTexture = "forever" }', true));
  expect(mod.m, "a module's string still imports into the active profile").toBe("Imported theme settings into profile Default.");
  expect(addon.eval("return { ns.Theme.Settings().barTexture, ns.Theme.Settings().reduceMotion }"), "upgraded, and merged: what it doesn't carry keeps its local value").toEqual(["vanguard", true]);
  expect(imports(addon, encoded(addon, "profile", "{ format = 3 }")).why, "a string from a newer Vanguard says so").toBe("it was made by a newer version of Vanguard: update Vanguard, then import it again");
  expect(imports(addon, encoded(addon, "talents", '{ class = "MAGE" }')).why, "another kind of Vanguard string is named").toBe("it's a talents string, not a profile string");
  expect(imports(addon, "garbage").why, "and the old reasons stand").toBe("not a Vanguard profile string");
});
it("a partial string merges into the profile: what it carries wins, what it doesn't keeps its local value", () => {
  const src = loggedIn();
  src.eval('ns.Profile().positions = { uf_player = { point = "TOP", relPoint = "TOP", x = 1, y = -2 } } ns.Theme.Settings().reduceMotion = true');
  const layout = src.eval('return ns.ExportProfile("layout")');
  expect(layout.startsWith("VG1:parts:"), "a part's string").toBe(true);
  const dst = loggedIn();
  dst.eval('ns.Profile().positions = { uf_player = { point = "LEFT", relPoint = "LEFT", x = 5, y = 5, scale = 1.5 }, minimap = { point = "TOPRIGHT", relPoint = "TOPRIGHT", x = -3, y = -3 } }');
  expect(imports(dst, layout), "it imports into the active profile, and a reload applies it").toMatchObject({ m: "Imported layout settings into profile Default.", reload: true });
  expect(dst.eval("return ns.Profile().positions.uf_player"), "a frame the string places takes its spot whole").toEqual({ point: "TOP", relPoint: "TOP", x: 1, y: -2 });
  expect(dst.eval("return { ns.Profile().positions.minimap.x, ns.Theme.Settings().reduceMotion }"), "a frame it doesn't place keeps its own, and settings outside the layout stay").toEqual([-3, false]);
  dst.eval("local s = ns.Settings('InfoStrip') s.dps, s.gold = false, false");
  // TEST-ONLY partial string from a version whose InfoStrip had only the DPS switch.
  imports(dst, encoded(dst, "parts", '{ format = 2, parts = { "InfoStrip" }, InfoStrip = { dps = true } }'));
  expect(dst.eval("return { ns.Settings('InfoStrip').dps, ns.Settings('InfoStrip').gold }"), "a module's settings merge key by key").toEqual([true, false]);
  dst.eval("ns.Settings('Situations').overrides = { raid = { settings = { InfoStrip = { dps = true } } }, party = { positions = { minimap = { scale = 2 } } } }");
  // TEST-ONLY Situations part with a raid override that only fades the minimap.
  imports(dst, encoded(dst, "parts", '{ format = 2, parts = { "situations" }, Situations = { overrides = { raid = { positions = { minimap = { alpha = 0.5 } } } } } }'));
  expect(dst.eval("local o = ns.Settings('Situations').overrides return { o.raid.settings == nil, o.raid.positions.minimap.alpha, o.party.positions.minimap.scale }"), "a situation's override is replaced whole; the others stay").toEqual([true, 0.5, 2]);
  expect(imports(dst, encoded(dst, "parts", "{ format = 2 }")).m, "a string that names no parts still says where it went").toBe("Imported its settings into profile Default.");
});
it("export with Include parts: /vg export <part ...>, and the export panel's switches", () => {
  const addon = loggedIn();
  addon.eval('ns.Profile().positions = { uf_player = { point = "TOP", relPoint = "TOP", x = 1, y = -2 } }');
  const parts = addon.eval("return ns.ProfileParts()");
  expect(parts.slice(0, 3), "the parts: layout, situations overrides and global settings first").toEqual(["layout", "situations", "global"]);
  expect(parts.slice(3), "then each module with saved settings, by name").toEqual([...parts.slice(3)].sort());
  // The export string's tables: whether it has positions, theme and InfoStrip, and its parts list.
  const holds = (lua) => addon.eval(`local _, d = ns.Serialize.Decode(${lua}) return { d.positions ~= nil, d.theme ~= nil, d.InfoStrip ~= nil, d.parts and table.concat(d.parts, " ") or "whole" }`);
  expect(holds('ns.ExportProfile("LAYOUT")'), "a part by name, in any case").toEqual([true, false, false, "layout"]);
  expect(holds("ns.ExportProfile(ns.ProfileParts())"), "every part is the whole profile").toEqual([true, true, true, "whole"]);
  addon.slash("export layout infostrip");
  expect(addon.eval("return Vanguard_TextDialog.title:GetText()"), "/vg export takes several parts").toBe("Vanguard export (layout infostrip)  Ctrl+C to copy");
  expect(holds("Vanguard_TextEdit:GetText()"), "and the string holds just those").toEqual([true, false, true, "layout InfoStrip"]);
  addon.clearChat();
  addon.slash("export layout TEST-ONLY");
  expect(chatHas(addon, /Nothing to export: nothing saved for TEST-ONLY yet\.$/), "a part with nothing saved is named").toBe(true);
  addon.slash("export pick");
  // The panel: its title, whether it shows, and for each switch shown its label and whether it is on.
  const panel = () => addon.eval(`local f = Vanguard_ExportDialog local out = { title = f.title:GetText(), shown = f:IsShown(), rows = {} }
    for _, r in ipairs(f.rows) do if r:IsShown() then out.rows[#out.rows + 1] = { r.label:GetText(), r.get() == true } end end
    return out`);
  const opened = panel();
  expect([opened.title, opened.shown, opened.rows.length], "/vg export pick opens the panel with a switch per part").toEqual(["Export: what to include", true, parts.length]);
  expect(opened.rows.slice(0, 3), "named for the player, every one on").toEqual([["Layout (positions and movers)", true], ["Situations overrides", true], ["Global settings (theme, modules list, skins)", true]]);
  const dialog = "Vanguard_ExportDialog";
  expect(titleOf(addon, dialog), "a window title: the title role in the text colour, T.SPACE.pad in, on the close button's line").toEqual({ size: titleSize(addon), text: true, left: 16, mid: -24 });
  expect(closeOf(addon, dialog), "with the X where every window has it").toEqual([px(addon, 24), px(addon, 24), true]);
  expect([escapes(addon, dialog), alphaOf(addon, dialog)], "Escape closes it; the dialog alpha").toEqual([true, 0.98]);
  const note = addon.frame(`${dialog}.note`);
  expect([note.font.size, isTok(addon, note.textColor, "muted"), insets(addon, `${dialog}.note`, dialog).slice(0, 2)], "the note is small muted, T.SPACE.pad in, under the head (40)").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true, [16, 40]]);
  expect(insets(addon, `${dialog}.view`, dialog).slice(0, 3), "the list is T.SPACE.pad in on the left and a thumb's gutter (12) more on the right, under the note (a gap of 8)").toEqual([16, 40 + addon.eval(`return ${dialog}.note:GetHeight()`) + 8, 28]);
  expect(addon.eval(`return { ${dialog}.rows[1]:GetWidth(), ${dialog}.rows[1]:GetHeight(), ${dialog}.rows[2]:GetTop() - ${dialog}.rows[1]:GetTop(), ${dialog}.view.child:GetHeight() }`), "a switch row as wide as the list, a list row (28) tall, the list as tall as its rows").toEqual([376, 28, -28, 28 * parts.length]);
  expect(thumbOf(addon, `${dialog}.view`, dialog), "more parts than fit: the thumb shows, in the right pad").toEqual([true, true, 16]);
  // Clicks the button the Lua expression names.
  const click = (lua) => addon.eval(`local b = ${lua} b:GetScript("OnClick")(b)`);
  click("Vanguard_ExportDialog.none");
  expect(panel().rows.every((r) => r[1] === false), "None turns every switch off").toBe(true);
  click("Vanguard_ExportDialog.export");
  expect(panel().title, "with nothing on, Export says so").toBe("Switch on at least one part to export.");
  click("Vanguard_ExportDialog.rows[1]");
  click("Vanguard_ExportDialog.export");
  expect([panel().shown, addon.eval("return Vanguard_TextDialog.title:GetText()")], "Export closes the panel and shows the string for what is on").toEqual([false, "Vanguard export (layout)  Ctrl+C to copy"]);
  expect(holds("Vanguard_TextEdit:GetText()"), "only the layout").toEqual([true, false, false, "layout"]);
  addon.eval("ns.Profile().InfoStrip = nil ns.ExportDialog()");
  const again = panel();
  expect([again.title, again.rows.length, again.rows.every((r) => r[1])], "opened again: its title back, every switch on, one for each part there is now").toEqual(["Export: what to include", parts.length - 1, true]);
  click("Vanguard_ExportDialog.none");
  click("Vanguard_ExportDialog.all");
  click("Vanguard_ExportDialog.export");
  expect(addon.eval("return Vanguard_TextDialog.title:GetText()"), "everything on is the whole profile").toBe("Vanguard export (profile Default)  Ctrl+C to copy");
  expect(addon.eval("return Vanguard_TextEdit:GetText():sub(1, 12)")).toBe("VG1:profile:");
  addon.eval("ns.ExportDialog()");
  expect([buttonOf(addon, `${dialog}.cancel`), buttonOf(addon, `${dialog}.export`)], "the dismiss button reads Cancel, beside the Export primary (the panel's one accent button); both standalone buttons, 120 wide").toEqual([[false, "Cancel", 26, 120], [true, "Export", 26, 120]]);
  expect(addon.eval(`return { ${dialog}.all:GetWidth(), ${dialog}.none:GetWidth(), ${dialog}.all:GetHeight(), ${dialog}.chrome.close ~= ${dialog}.cancel }`), "All and None are the small pair; the X is not the Cancel button").toEqual([60, 60, 26, true]);
  expect(insets(addon, `${dialog}.export`, dialog).slice(2), "Export a pad from the corner").toEqual([16, 16]);
  click("Vanguard_ExportDialog.cancel");
  expect(panel().shown, "Cancel closes it").toBe(false);
  addon.eval("ns.ExportDialog()");
  addon.click(`${dialog}.chrome.close`);
  expect(panel().shown, "so does the X").toBe(false);
  addon.eval("ns.ExportDialog()");
  pressEscape(addon);
  expect(panel().shown, "and Escape").toBe(false);
  addon.eval("local all = ns.ProfileParts ns.ProfileParts = function() return { 'layout', 'global' } end ns.ExportDialog() ns.ProfileParts = all");
  expect([panel().rows.length, thumbOf(addon, `${dialog}.view`, dialog)[0]], "two parts fit the list: no thumb").toEqual([2, false]);
});
it("every import backs up the profile in use first, into one rolling backup profile", () => {
  const addon = loggedIn();
  addon.eval("ns.Theme.Settings().reduceMotion = true");
  expect(addon.eval("return ns.BackupProfile()"), "the backup is named after the profile").toBe("Default backup");
  expect(addon.eval("local b = VanguardDB.profiles['Default backup'] return { b ~= ns.Profile(), b.theme ~= ns.Profile().theme, b.theme.reduceMotion }"), "a copy of it").toEqual([true, true, true]);
  // TEST-ONLY partial string that turns Reduce motion off.
  const off = encoded(addon, "parts", '{ format = 2, parts = { "global" }, theme = { reduceMotion = false } }');
  addon.clearChat();
  importText(addon, off);
  expect(chatHas(addon, /Profile Default as it was before this import is saved as profile Default backup\./), "the import says where the profile as it was is").toBe(true);
  expect(addon.eval("return { ns.Theme.Settings().reduceMotion, VanguardDB.profiles['Default backup'].theme.reduceMotion }"), "and the backup has it").toEqual([false, true]);
  importText(addon, off);
  expect(addon.eval("return { ns.ProfileNames(), VanguardDB.profiles['Default backup'].theme.reduceMotion }"), "the next import replaces the same backup").toEqual([["Default", "Default backup"], false]);
  // TEST-ONLY 32-character profile names: one that needs cutting, and one whose backup name would be its own.
  const backupOf = (name) => addon.eval(`VanguardDB.profiles["${name}"] = {} VanguardCharDB.profile = "${name}" return ns.BackupProfile()`);
  expect(backupOf(`TEST-ONLY ${"x".repeat(22)}`), "a long name is cut to fit 32 characters").toBe(`TEST-ONLY ${"x".repeat(15)} backup`);
  expect(backupOf(`TEST-ONLY ${"x".repeat(15)} backup`), "and the backup is never the profile in use").toBe(`TEST-ONLY ${"x".repeat(13)} backup 2`);
});
it("an import's backup never overwrites a profile another character or a spec uses", () => {
  // TEST-ONLY: another character runs on "Default backup", and this character's spec 2 uses "Default backup 2".
  const sv = 'VanguardDB.profiles = { Default = {}, ["Default backup"] = { marker = "other" }, ["Default backup 2"] = { marker = "spec" } }\nVanguardDB.guard = { chars = { ["TEST-ONLY Other-Realm"] = { profile = "Default backup", stamp = 1 }, broken = "x" } }\nVanguardCharDB.specProfiles = { [2] = "Default backup 2" }';
  const addon = loggedIn("", { savedVariables: sv });
  const backup = addon.eval('return (select(2, ns.ImportProfile(ns.Serialize.Encode("profile", ns.StampPayload({ theme = { accent = "copper" } }))))).backup');
  expect(backup, "the backup takes the next free name").toBe("Default backup 3");
  expect(addon.eval('return { VanguardDB.profiles["Default backup"].marker, VanguardDB.profiles["Default backup 2"].marker }'), "the profiles in use keep their settings").toEqual(["other", "spec"]);
  expect(addon.eval('VanguardDB.profiles["Default backup 3"] = nil VanguardDB.guard = nil VanguardCharDB.specProfiles = nil return ns.BackupProfile()'), "a file without a guard or spec map backs up as before").toBe("Default backup");
});
it("importing a string that matches a profile here uses that profile instead of making a copy", () => {
  const addon = loggedIn();
  const own = addon.eval("return ns.ExportProfile()");
  addon.clearChat();
  importText(addon, own);
  expect(chatHas(addon, /This string matches profile Default, which this character already uses: nothing new to import\./), "your own export says it is the profile you use").toBe(true);
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return { VanguardDB.profiles.Imported == nil, Vanguard_Reload == nil or not Vanguard_Reload:IsShown(), Vanguard_TextDialog:IsShown() }"), "no copy is made, and after the UI scale question no reload is offered").toEqual([true, true, false]);
  addon.eval("VanguardDB.profiles.Raid = ns.Copy(ns.Profile()) ns.Theme.Settings().reduceMotion = not ns.Theme.Settings().reduceMotion");
  expect(imports(addon, own), "a string matching another profile switches to it").toMatchObject({ m: "This string matches profile Raid; this character will use it after a reload.", reload: true });
  expect(addon.eval("return { VanguardCharDB.pendingProfile, VanguardDB.profiles.Imported == nil }")).toEqual(["Raid", true]);
});
it("an import names each font and bar texture this client doesn't have, and what it draws instead", () => {
  const addon = loggedIn('LibStub("LibSharedMedia-3.0"):Register("font", "TEST-ONLY Shared", [[Interface\\AddOns\\TestOnly\\Font.ttf]])');
  // TEST-ONLY theme naming a font and a bar texture no addon shares here.
  const text = encoded(addon, "parts", '{ format = 2, parts = { "global" }, theme = { font = "TEST-ONLY Missing", barTexture = "TEST-ONLY Gone" } }');
  addon.clearChat();
  importText(addon, text);
  expect(chatHas(addon, /Font not found: TEST-ONLY Missing \(no addon here shares it\)\. Vanguard uses its default font instead\./), "a missing font is named, with what is used instead").toBe(true);
  expect(chatHas(addon, /Bar texture not found: TEST-ONLY Gone \(no addon here shares it\)\. Vanguard uses its Vanguard bar texture instead\./), "and a missing bar texture").toBe(true);
  expect(addon.eval("return { ns.Theme.Settings().font, ns.Theme.BarTexture() == ns.Theme.Texture('Bar') }"), "the names stay saved, and Vanguard's own are drawn").toEqual(["TEST-ONLY Missing", true]);
  // How many lines ns.MissingMedia gives for a theme (a Lua table).
  const found = (lua) => addon.eval(`return #ns.MissingMedia({ theme = ${lua} })`);
  expect([found('{ font = "TEST-ONLY Shared", barTexture = "soft" }'), found('{ font = "client" }'), found('{ font = "" }'), found('{ font = [[Fonts\\TEST-ONLY.ttf]] }'), addon.eval("return #ns.MissingMedia({})")], "a shared font, Vanguard's bars, the game's font and a font path are found").toEqual([0, 0, 0, 0, 0]);
});
// A TEST-ONLY profile big enough to take many frames at a small budget: its string.
const BIG = `local t = {} for i = 1, 400 do t["TEST-ONLY key " .. i] = i end ns.Profile().TestOnlyBig = t return ns.ExportProfile()`;
it("a large string is imported across frames, with its progress in the box's title", () => {
  const text = loggedIn().eval(BIG);
  const addon = loggedIn();
  addon.eval("ns.Serialize.BUDGET = 20");
  importText(addon, text);
  // The import box's title, whether its Import button shows, and the profile staged (false before).
  const state = () => addon.eval("return { Vanguard_TextDialog.title:GetText(), Vanguard_TextDialog.primary:IsShown(), VanguardCharDB.pendingProfile or false }");
  const first = state();
  expect(first[0], "the box's title shows how far it has got").toMatch(/^Importing… \d+%$/);
  expect(first.slice(1), "its Import button is put away, and nothing is imported yet").toEqual([false, false]);
  addon.clearChat();
  importText(addon, text);
  expect(chatHas(addon, /Import failed: an import is still running\./), "a second import waits for the first").toBe(true);
  const seen = [];
  for (let frames = 0; frames < 400 && state()[2] === false; frames++) {
    const percent = state()[0].match(/^Importing… (\d+)%$/);
    if (percent) seen.push(Number(percent[1]));
    addon.update(0.02);
  }
  expect(seen.length, "it took many frames").toBeGreaterThan(5);
  expect(seen.every((p, i) => i === 0 || p >= seen[i - 1]), `the percentage only goes up (${seen.join(" ")})`).toBe(true);
  expect(addon.eval("return { VanguardCharDB.pendingProfile, VanguardDB.profiles.Imported.TestOnlyBig['TEST-ONLY key 400'], Vanguard_TextDialog:IsShown() }"), "then it finishes like any import").toEqual(["Imported", 400, false]);
});
it("a large string that fails part way says why, and a failing step ends the import", () => {
  const text = loggedIn().eval(BIG);
  const addon = loggedIn();
  addon.eval("ns.Serialize.BUDGET = 20");
  addon.clearChat();
  importText(addon, text.slice(0, -40));
  for (let frames = 0; frames < 50; frames++) addon.update(0.02);
  expect(chatHas(addon, /Import failed: the string is incomplete \(was it cut off when pasting\?\)\./), "a cut-off string is found out after its checksum").toBe(true);
  expect(addon.eval("return { Vanguard_TextDialog.title:GetText(), Vanguard_TextDialog.primary:IsShown() }"), "and the box is back, to paste again").toEqual(["Paste a Vanguard string, then Import", true]);
  expectErrors("profile import: eval:2: TEST-ONLY import failure");
  addon.eval('ns.ApplyImport = function() error("TEST-ONLY import failure") end');
  importText(addon, "VG1:x:0000:AAAA");
  expect(chatHas(addon, /Import failed: something went wrong while importing it \(see \/vg errors\)\./), "a step that fails ends the import with a reason").toBe(true);
  const sync = addon.eval(`ns.ApplyImport = function(scope) return scope end
    local timer, steps, said = C_Timer, {}, nil
    C_Timer = nil
    ns.StartImport(${JSON.stringify(text)}, function(p) steps[#steps + 1] = p end, function(m) said = m end)
    C_Timer = timer
    return { #steps, said }`);
  expect(sync[1], "without the client's timer every step runs at once").toBe("profile");
  expect(sync[0]).toBeGreaterThan(5);
});
// Settings-loss guard (Core/SettingsGuard.lua) -----------------------------------------------------

// Logs out (the guard leaves its stamps and backup), then logs in again with `account` and `char` Lua
// for the saved files (each defaults to what the first session saved; "nil" drops a file).
function relog(addon, { account, char, extra = CLICK_LUA } = {}) {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${account ?? luaValue(sv.account)}\nVanguardCharDB = ${char ?? luaValue(sv.char)}\n` });
  next.eval(extra);
  next.login();
  return next;
}
