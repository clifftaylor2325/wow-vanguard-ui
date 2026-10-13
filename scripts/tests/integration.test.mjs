// integration: Vanguard.OpenOptions and Vanguard.RegisterPreset called as another addon would,
// in Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn, setCombat } from "./helpers.mjs";

it("RegisterPreset checks its arguments", () => {
  const addon = loggedIn(CLICK_LUA);
  // Calls RegisterPreset with Lua argument text, as another addon would.
  const call = (args) => addon.eval(`return { Vanguard.RegisterPreset(${args}) }`);
  expect(call('"Mine", "VG1:parts:0000:x", "mine"')[0], "a usable preset registers").toBe(true);
  expect(call('"Mine", "VG1:parts:0000:y"')[0], "a name again replaces it").toBe(true);
  for (const bad of ['nil, "VG1:x"', '"  ", "VG1:x"', '"Mine", 5', '"Mine", "hello"', '"Mine", "VG1:x", 7', `"${"n".repeat(33)}", "VG1:x"`, `"Mine", "VG1:${"x".repeat(20000)}"`]) {
    expect(call(bad)[0], `refused: ${bad.slice(0, 30)}`).toBe(false);
  }
  expect(call('"healer", "VG1:x"')[1], "a built-in name can't be taken").toMatch(/built-in/);
  const list = addon.eval("return Vanguard.GetPresets()");
  expect(list.map((p) => p.name), "built-ins first, then registered").toEqual(["Healer", "Damage", "Tank", "Mine"]);
  expect(list.map((p) => p.builtIn), "built-in flags").toEqual([true, true, true, false]);
  addon.eval('Vanguard.RegisterPreset("Piped", "VG1:x", "a|cffff0000red")');
  expect(addon.eval("return Vanguard.GetPresets()[5].info"), "escape codes are dropped from info").toBe("acffff0000red");
  for (let i = 0; i < 30; i++) addon.eval(`Vanguard.RegisterPreset("P${i}", "VG1:x")`);
  expect(addon.eval("return Vanguard.GetPresets()").length, "at most 20 presets").toBe(20);
});

it("the built-in presets are made from the role tables, so setup's layouts and the presets agree", () => {
  const addon = loggedIn(CLICK_LUA);
  const same = addon.eval(`local out = {}
    for _, p in ipairs(ns.BUILTIN_PRESETS) do
      local scope, data = ns.Serialize.Decode(p.text)
      local parts = table.concat(data.parts, ",")
      ns.StripPayload(data)
      local want = ns.ROLE_SETTINGS[p.name]
      local ok = scope == "parts" and parts == "Nameplates,RaidAuras,RaidFrames,RaidHealing"
      for part, values in pairs(want) do
        for k, v in pairs(values) do if data[part][k] ~= v then ok = false end end
        for k in pairs(data[part]) do if values[k] == nil then ok = false end end
      end
      for part in pairs(data) do if not want[part] then ok = false end end
      out[#out + 1] = p.name .. ":" .. tostring(ok)
    end
    return out`);
  expect(same, "each preset string decodes to its role's table, those four parts and nothing else").toEqual(["Healer:true", "Damage:true", "Tank:true"]);
  expect(addon.eval("return ns.ROLE_SETTINGS.Healer.RaidFrames.compact == nil and ns.ROLE_SETTINGS.Damage.RaidFrames.compact == nil"), "no preset changes compact, so a 40-man still fits a small screen").toBe(true);
});

it("OpenOptions opens a page and a row", () => {
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval('return Vanguard.OpenOptions("nowhere")'), "an unknown page is refused").toBe(false);
  expect(addon.eval("return Vanguard.OpenOptions(5)"), "a non-string page is refused").toBe(false);
  expect(addon.eval('return Vanguard.OpenOptions("profiles", "Apply Healer")'), "a known page opens").toBe(true);
  expect(addon.eval("return ns.Options.current"), "on that page").toBe("profiles");
  expect(addon.texts("Apply Healer").length, "the presets are on the Profiles page").toBe(1);
  expect(addon.eval('return Vanguard.OpenOptions("general", 3)'), "a non-string setting is ignored").toBe(true);
  expect(addon.eval('return Vanguard.OpenOptions("chat", "Chat watch")'), "a page that came out of the old Bars, map, chat page opens").toBe(true);
  expect(addon.eval("return ns.Options.current"), "on its own page").toBe("chat");
  expect(addon.eval('return Vanguard.OpenOptions("more")'), "the old page key still opens something").toBe(true);
  expect(addon.eval("return ns.Options.current"), "the first of the pages it was split into").toBe("bars");
});

it("a built-in preset applies after a question, and keeps local data", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Profile().positions = { uf_player = { x = 7, y = 9 } } ns.Profile().RaidFrames = { width = 120, sortByRole = false }');
  addon.slash("preset");
  expect(chatHas(addon, /Healer.*Damage|Healer/), "/vg preset lists them").toBeTruthy();
  addon.clearChat();
  addon.slash("preset nothing");
  expect(chatHas(addon, /No preset called nothing/), "an unknown name says so").toBeTruthy();
  addon.slash("preset healer");
  expect(addon.eval('return __click("Apply")'), "the question has an Apply button").toBeTruthy();
  expect(addon.eval("return ns.Profile().RaidFrames.sortByRole"), "the preset's value is in").toBe(true);
  expect(addon.eval("return ns.Profile().RaidFrames.width"), "a local value the preset leaves out stays").toBe(120);
  expect(addon.eval("return ns.Profile().positions.uf_player.x"), "the layout stays").toBe(7);
  expect(chatHas(addon, /as it was before this import is saved as profile/), "chat says where the backup is").toBeTruthy();
  expect(addon.eval("local n = 0 for k in pairs(VanguardDB.profiles) do if k:find('backup') then n = n + 1 end end return n"), "a backup was made").toBe(1);
});

it("a preset waits out combat, and a bad string fails with a reason", () => {
  const addon = loggedIn(CLICK_LUA);
  setCombat(addon, true);
  addon.slash("preset Tank");
  addon.eval('__click("Apply")');
  expect(chatHas(addon, /waits until combat ends/), "no import in combat").toBeTruthy();
  expect(addon.eval("local n = 0 for k in pairs(VanguardDB.profiles) do if k:find('backup') then n = n + 1 end end return n"), "nothing was imported or backed up").toBe(0);
  setCombat(addon, false);
  addon.eval('Vanguard.RegisterPreset("Broken", "VG1:parts:zzzz:@@@")');
  addon.clearChat();
  addon.slash("preset Broken");
  addon.eval('__click("Apply")');
  expect(chatHas(addon, /Import failed/), "a string that doesn't decode is reported").toBeTruthy();
  addon.eval("ns.StartImport('VG1:parts:0000:x', function() end, function() end)");
  addon.eval("ns.AskPreset(ns.FindPreset('Tank')) __click('Apply')");
  expect(addon.eval("return ns.FindPreset(5)"), "a non-string name finds nothing").toBeNull();
});
