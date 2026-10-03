// profiles: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { RETAIL, chatHas, loggedIn } from "./helpers.mjs";

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

it("profile strings keep big whole numbers", () => {
  const r = loggedIn().eval(`local S = ns.Serialize
    local realFormat = string.format
    string.format = function(f, ...)
      local v = ...
      if f:find("%d", 1, true) and type(v) == "number" and (math.abs(v) >= 2 ^ 31 or v ~= math.floor(v)) then error("%d of " .. v .. " is undefined on Lua 5.1") end
      return realFormat(f, ...)
    end
    local text = S.Encode("profile", { big = 2 ^ 40, neg = -(2 ^ 40), half = 2 ^ 40 + 0.5, one = 1 })
    local raw = S.Unbase64(text:match("^FUI1:profile:%x%x%x%x:(.+)$"))
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
  const text = src.eval("return ForeverUI_TextEdit:GetText()");
  expect(text.startsWith("FUI1:profile:") && src.eval("return ForeverUI_TextDialog:IsShown()"), "/fui export shows the string, selected to copy").toBeTruthy();
  const dst = loggedIn(RETAIL);
  dst.slash("import");
  dst.eval(`ForeverUI_TextEdit:SetText(${JSON.stringify(text)}); ForeverUI_TextDialog.primary:GetScript("OnClick")(ForeverUI_TextDialog.primary)`);
  expect(dst.eval("return { ForeverUICharDB.profile, ForeverUICharDB.pendingProfile }"), "a whole-profile import becomes a new profile this character uses after the reload").toEqual(["Default", "Imported"]);
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
  expect([relog.eval("return ForeverUICharDB.profile"), relog.eval("return ForeverUICharDB.pendingProfile"), relog.eval("return ForeverUI_Reload:IsShown()")], "changing spec stages its profile and offers a reload").toEqual(["Healer", "Default", true]);
  addon.slash("spec off");
  expect(addon.eval("return ForeverUICharDB.specProfiles[2]") === null, "/fui spec off stops switching").toBeTruthy();
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
  expect(/Imported 2/.test(imported) && addon.eval("return ForeverUICharDB.pendingProfile") === "Imported 2", "a second whole-profile import takes the next free name").toBeTruthy();
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

// TEST-ONLY saved variables: Raid has its own accent, Default does not; a switch to Raid was staged last session.
const STAGED = 'ForeverUIDB = { version = 1, profiles = { Default = {}, Raid = { theme = { accent = { 0, 1, 0 } } } } }\nForeverUICharDB = { profile = "Default", pendingProfile = "Raid" }';

it("a staged profile switch applies at the next load, and until then the running profile is the one edited", () => {
  const addon = loggedIn();
  addon.slash("profile new Raid");
  const before = addon.eval("local t = ns.Settings('theme') return { t == ns.Profile().theme, ns.ProfileName() }");
  addon.slash("profile Raid");
  expect(addon.eval("return { ns.ProfileName(), ns.SelectedProfileName(), ns.PendingProfileName(), ns.Settings('theme') == ns.Profile().theme, ForeverUI_Reload:IsShown() }"), "staging changes neither the running profile nor its cached tables, and offers the reload")
    .toEqual(["Default", "Raid", "Raid", true, true]);
  addon.slash("accent ff8000");
  expect(addon.eval("return { ForeverUIDB.profiles.Default.theme ~= nil, ForeverUIDB.profiles.Raid.theme == nil }"), "an accent change lands in the profile on screen, not the staged one").toEqual([true, true]);
  expect(before, "the cache held the running profile before staging").toEqual([true, "Default"]);
  addon.clearChat();
  addon.slash("profile");
  expect(chatHas(addon, /Profile: Default; Raid after a reload {3}\(all: Default, Raid\)/), "/fui profile says what comes after the reload").toBeTruthy();
  addon.slash("profile Default");
  expect([addon.eval("return ns.PendingProfileName()"), chatHas(addon, /already uses profile Default/)], "choosing the running profile again takes the switch back").toEqual([null, true]);
  const next = createAddon({ savedVariables: STAGED });
  next.login();
  expect(next.eval("return { ForeverUICharDB.profile, ForeverUICharDB.pendingProfile == nil, ns.ProfileName(), ns.SelectedProfileName(), (select(2, ns.Theme.Accent())) }"), "the next load applies it, clears it, and modules get the staged profile's tables")
    .toEqual(["Raid", true, "Raid", "Raid", 1]);
  expect(next.eval("return ns.Settings('theme') == ForeverUIDB.profiles.Raid.theme"), "the settings cache hands out the new profile's tables").toBe(true);
});

it("a staged profile that no longer exists is created empty when it is applied", () => {
  const addon = createAddon({ savedVariables: 'ForeverUIDB = { version = 1, profiles = { Default = {} } }\nForeverUICharDB = { profile = "Default", pendingProfile = "Gone" }' });
  addon.login();
  expect(addon.eval("return { ns.ProfileName(), ForeverUIDB.profiles.Gone ~= nil }"), "the switch still happens, onto an empty profile").toEqual(["Gone", true]);
});

it("the spec change events stage the spec's profile, whatever they pass", () => {
  const env = "GetSpecialization = function() return __spec end __spec = 2";
  const addon = createAddon({ savedVariables: 'ForeverUIDB = { version = 1, profiles = { Default = {}, Healer = {} } }\nForeverUICharDB = { profile = "Default", specProfiles = { [2] = "Healer" } }' });
  addon.eval(env);
  addon.login();
  expect(addon.eval("return { ForeverUICharDB.profile, ForeverUICharDB.pendingProfile == nil }"), "login applies the spec's profile at once").toEqual(["Healer", true]);
  addon.eval("__spec = 1 ForeverUICharDB.specProfiles[1] = 'Default'");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "target");
  expect(addon.eval("return ForeverUICharDB.pendingProfile"), "another unit's spec change is ignored").toBe(null);
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 2);
  expect([addon.eval("return ForeverUICharDB.pendingProfile"), addon.eval("return ForeverUI_Reload:IsShown()")], "ACTIVE_TALENT_GROUP_CHANGED passes group numbers and still stages the profile").toEqual(["Default", true]);
  addon.eval("__spec = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect(addon.eval("return ForeverUICharDB.pendingProfile"), "changing back to the running profile's spec takes the switch back").toBe(null);
});
