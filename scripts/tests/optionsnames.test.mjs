// optionsnames: the options window's captions are short names, and a renamed row keeps its old caption as its tip
// (real Lua in the TEST-ONLY headless client; docs/design/SETTINGS-SIMPLIFICATION.md, D3; Core/OptionsNames.lua).

import { expect, it } from "vitest";
import { createAddon, FOREVER_CLIENT, RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { CLICK_LUA, SETUP_DONE, loggedIn } from "./helpers.mjs";

// The longest a caption may be, in English characters, leaving out the reload bracket the window turns into a tag
// and a "(the game's setting)" bracket that says whose setting it is.
const LONGEST = 40;

// Lua: every setting, button and choice row's English caption (as the window reads it), with its tip and its old
// caption (row.was), one { caption, tip, was } per row.
const ROWS = `
local out = {}
for _, page in ipairs(ns.Options.PAGES) do
  for _, row in ipairs(ns.Options.RowsOf(page)) do
    local kind = row[1]
    if (kind == "check" or kind == "cycle" or kind == "slider" or kind == "button") and type(row[2]) == "string" then
      out[#out + 1] = { caption = row.english or row[2], tip = row.tip, was = row.was }
    end
  end
end
return out`;

// Every row of the window on one client, logged in with every module on.
function rowsOn(client) {
  const addon = createAddon({ client, savedVariables: SETUP_DONE });
  addon.login();
  return { addon, rows: Object.values(addon.eval(ROWS)) };
}

// A caption's length as the rule counts it.
const counted = (caption) => caption.replace(/ \(the game's setting\)$/, "").length;

it("options names: every caption is at most 40 characters on both clients", () => {
  for (const client of [FOREVER_CLIENT, RETAIL_CLIENT]) {
    const long = rowsOn(client).rows.filter((row) => counted(row.caption) > LONGEST).map((row) => row.caption);
    expect(long, "a longer caption becomes a name, the sentence its tip (Core/OptionsNames.lua)").toEqual([]);
  }
});

it("options names: each renamed row is a live caption that wears its old caption as its tip", () => {
  const seen = new Set();
  for (const client of [FOREVER_CLIENT, RETAIL_CLIENT]) {
    const { addon, rows } = rowsOn(client);
    const renamed = addon.eval("local out = {} for name, old in pairs(ns.Options.RENAMED) do out[name] = ns.English(old) end return out");
    for (const row of rows.filter((r) => renamed[r.caption])) {
      seen.add(row.caption);
      expect(row.tip.startsWith(renamed[row.caption].replace(/ \(reload\)$/, "")), `${row.caption}: its old caption is its tip`).toBe(true);
      expect(row.was, `${row.caption}: and its old English, for a jump`).toBe(renamed[row.caption].replace(/ \(reload\)$/, ""));
    }
    for (const name of Object.keys(renamed)) expect(rows.filter((r) => r.caption === name).length, `${name}: one row has it`).toBeLessThanOrEqual(1);
    if (client === RETAIL_CLIENT) expect(Object.keys(renamed).filter((name) => !seen.has(name)), "every listed name is a row on some client").toEqual([]);
  }
});

it("options names: the search keywords and the game-setting tips are keyed by live captions", () => {
  const captions = new Set();
  let keys = [];
  for (const client of [FOREVER_CLIENT, RETAIL_CLIENT]) {
    const { addon, rows } = rowsOn(client);
    for (const row of rows) captions.add(row.caption.toLowerCase());
    keys = addon.eval("local out = {} for k in pairs(ns.Options.KEYWORDS) do out[#out + 1] = k end for k in pairs(ns.Options.GAME_SETTING_TIPS) do out[#out + 1] = k:lower() end return out");
  }
  expect(Object.values(keys).filter((key) => !captions.has(key)), "a renamed caption takes its keywords with it").toEqual([]);
});

it("options names: the search finds a renamed row by its old words, and a jump by its old caption lands on it", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("");
  addon.eval('ns.Options.Search("hostile target")');
  const hits = addon.eval("local out = {} for _, hit in ipairs(ns.Options.hits or {}) do out[#out + 1] = hit.caption end return out");
  expect(Object.values(hits), "Calm HUD's old sentence names a hostile target").toContain("Calm HUD out of combat");
  addon.eval('ns.Options.Show("unitframes") ns.Options.JumpTo("Tag mark on your target: a green check")');
  expect(addon.eval("return Vanguard_Options.found:IsShown()"), "an older note's jump by the old caption still marks the row").toBe(true);
});

it("options names: a renamed reload row's tip has no reload bracket, and says when it applies", () => {
  const { addon } = rowsOn(FOREVER_CLIENT);
  const tip = addon.eval(`for _, page in ipairs(ns.Options.PAGES) do for _, row in ipairs(ns.Options.RowsOf(page)) do
    if row.english == "Group threat panel" then return row.tip end end end`);
  expect(tip, "the old sentence, its bracket left to the tag").toBe("Group threat panel: who has the most threat on your target");
});

it("options: a feature reached only by typing has a button on its card, which says what its /vg command says", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval("ns.GetModule('CraftQueue').settings.on = true");
  addon.slash("");
  // Presses a button on a page: whether it was there, and whether it printed to chat.
  const said = (page, label) => {
    addon.eval(`ns.Options.Show("${page}")`);
    const before = addon.chat().length;
    const pressed = addon.eval(`return __click(${JSON.stringify(label)})`);
    return [pressed, addon.chat().length > before];
  };
  expect(said("tools", "List this session's fights"), "/vg fights").toEqual([true, true]);
  expect(said("tools", "Recap the last fight in chat"), "/vg recap").toEqual([true, true]);
  for (const label of ["List my sell list in chat", "List the craft queue in chat", "Put the newest ranks on my bars", "What trainers teach next", "List the perk plan in chat"]) {
    expect(said("town", label), label).toEqual([true, true]);
  }
});

it("options: Forget every merchant asks first, and only Forget forgets them", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval("VanguardDB.vendors = { TEST = true }");
  addon.slash("");
  addon.eval('ns.Options.Show("town") __click("Forget every merchant...")');
  expect(addon.eval("return Vanguard_Question:IsShown() and VanguardDB.vendors ~= nil"), "a question, nothing forgotten yet").toBe(true);
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return VanguardDB.vendors ~= nil"), "No keeps them").toBe(true);
  addon.eval('__click("Forget every merchant...") Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect([addon.eval("return VanguardDB.vendors == nil"), /Forgot every merchant\.$/.test(addon.chat().at(-1))], "Forget forgets them and says so").toEqual([true, true]);
});

it("options: Move frames on Chat windows and Situations unlocks the frames", () => {
  for (const page of ["chat", "situations"]) {
    const addon = loggedIn(CLICK_LUA);
    addon.slash("");
    addon.eval(`ns.Options.Show("${page}")`);
    expect(addon.eval('return __click("Move frames") and ns.Unlocked()'), `${page}: the handles show`).toBe(true);
  }
});
