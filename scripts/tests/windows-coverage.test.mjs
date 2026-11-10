// windows-coverage: which game windows Vanguard's skin covers, said two ways (real Lua in the TEST-ONLY headless
// client). In game, /vg status counts the registered windows by state and /vg status windows names them, so a
// window a game patch left looking stock is seen the same day. In the repo, docs/design/RESKIN-COVERAGE.md is
// written from the window registry (Modules/Windows*.lua: GW.ORDER, GW.REGISTERED, GW.ON_DEMAND, GW.NEEDS) for both
// clients, and the case at the end fails when the registry and the committed page differ.
//
//   VG_COVERAGE_WRITE=1 npx vitest run scripts/tests/windows-coverage.test.mjs    writes the page again

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createAddon, FOREVER_CLIENT, RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { SETUP_DONE, WINDOWS_ENV, chatHas, loggedIn } from "./helpers.mjs";

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/design/RESKIN-COVERAGE.md");

// TEST-ONLY game windows made before login: a character pane and a merchant window to dress, and the breath bars'
// holder without the method its skin follows (a game patch took it away).
const SOME_WINDOWS = WINDOWS_ENV + `
  __window("CharacterFrame") __window("MerchantFrame")
  MirrorTimerContainer = CreateFrame("Frame", "MirrorTimerContainer", UIParent)
`;

// How many windows are in each state, and the states of a few named ones.
const coverage = (addon) => addon.eval(`local GW = ns.GetModule("Windows") local c, n = GW.Coverage(), {}
  for _, state in ipairs(GW.STATES) do n[state] = #c[state] end
  return { counts = n, dressed = c.dressed, missing = c.missing, character = GW.StateOf("CharacterFrame"), timers = GW.StateOf("MirrorTimerContainer"), quest = GW.StateOf("QuestFrame"),
    auction = GW.StateOf("AuctionHouseFrame"), total = #GW.ORDER }`);

it("coverage: a window whose skin ran is dressed, one that lacks a need is missing, one the game has not made is unseen, and every window is counted once", () => {
  const addon = loggedIn(SOME_WINDOWS);
  const c = coverage(addon);
  expect([c.character, c.timers, c.auction], "the pane is dressed, the breath bars lack SetupTimer, the auction house has not loaded").toEqual(["dressed", "missing", "unseen"]);
  expect([c.dressed.includes("CharacterFrame") && c.dressed.includes("MerchantFrame"), c.missing, c.counts.off], "both windows dressed, the one missing, none switched off").toEqual([true, ["MirrorTimerContainer"], 0]);
  expect(Object.values(c.counts).reduce((a, b) => a + b, 0), "each registered window is in exactly one state").toBe(c.total);
  expect(addon.eval("return ns.GetModule('Windows').LoadsWith().AuctionHouseFrame"), "an on-demand window names the part of the game it waits for").toBe("Blizzard_AuctionHouseUI");
});

it("coverage: a group switched off, the module switched off, and the quest window Vanguard's dialog stands in for", () => {
  const town = loggedIn(SOME_WINDOWS + ' __window("QuestFrame")', { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  expect([coverage(town).character, coverage(town).dressed.includes("MerchantFrame")], "the windows group off: its windows are off, not dressed").toEqual(["off", false]);
  const none = loggedIn(SOME_WINDOWS, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Windows = false } } }" });
  expect([coverage(none).counts.off, coverage(none).total], "the module off: every window is off").toEqual([coverage(none).total, coverage(none).total]);
  const dialog = loggedIn(SOME_WINDOWS + ' __window("QuestFrame")');
  expect(coverage(dialog).quest, "the quest window is replaced while the quest dialog is on").toBe("replaced");
  const stock = loggedIn(SOME_WINDOWS + ' __window("QuestFrame")', { savedVariables: "VanguardDB.profiles = { Default = { modules = { QuestDialog = false } } }" });
  expect(coverage(stock).quest, "and dressed like any other with the quest dialog off").toBe("dressed");
});

it("/vg status counts the game windows by state and names the ones left as the game's; /vg status windows lists every one", () => {
  const addon = loggedIn(SOME_WINDOWS);
  addon.slash("status");
  expect(chatHas(addon, /Game windows: \d+ dressed {2}· {2}1 left as the game's {2}· {2}\d+ replaced {2}· {2}0 switched off {2}· {2}\d+ not made yet {2}· {2}MirrorTimerContainer \(no SetupTimer\(\)\)$/), "the counts, then the window a patch broke with what it lacks").toBe(true);
  addon.slash("status WINDOWS");
  expect([chatHas(addon, /dressed: CharacterFrame, MerchantFrame/), chatHas(addon, /missing: MirrorTimerContainer$/), chatHas(addon, /unseen: .*AuctionHouseFrame/), chatHas(addon, /off: /)],
    "one line a state that has windows, none for an empty state").toEqual([true, true, true, false]);
  const clean = loggedIn(WINDOWS_ENV + '__window("CharacterFrame")');
  clean.slash("status");
  expect(chatHas(clean, /Game windows: \d+ dressed {2}· {2}0 left as the game's .* not made yet$/), "with nothing missing the line ends at the counts").toBe(true);
});

// Lua: the registry as rows "group|window|part of the game|needs", in the order registered.
const REGISTRY = `
local GW, out = ns.GetModule("Windows"), {}
local later = GW.LoadsWith()
local function needs(name)
  local n, parts = GW.NEEDS[name] or {}, {}
  for _, kind in ipairs({ "parts", "methods", "game" }) do
    for _, path in ipairs(n[kind] or {}) do parts[#parts + 1] = path .. (kind == "parts" and "" or "()") end
  end
  return table.concat(parts, ", ")
end
for _, name in ipairs(GW.ORDER) do
  out[#out + 1] = table.concat({ GW.REGISTERED[name].group, name, later[name] or "", needs(name) }, "|")
end
return out`;

// One client's registry rows, read after a login with every module on.
function registry(client) {
  const addon = createAddon({ client, savedVariables: SETUP_DONE });
  addon.login();
  return addon.eval(REGISTRY).map((row) => row.split("|"));
}

// One client's section of the page: a count line, then a table row per registered window.
function section(title, rows) {
  const later = rows.filter((r) => r[2] !== "").length;
  const lines = [`## ${title}`, "", `${rows.length} registered windows: ${rows.length - later} looked for at login, ${later} when their part of the game loads.`, "",
    "| Group | Window | Made | Its skin needs |", "| --- | --- | --- | --- |"];
  for (const [group, name, addon, needs] of rows) lines.push(`| ${group} | \`${name}\` | ${addon === "" ? "at login" : `with \`${addon}\``} | ${needs === "" ? "-" : `\`${needs}\``} |`);
  return lines.join("\n");
}

// The whole page, from both clients' registries.
function page() {
  const intro = ["# Reskin coverage", "",
    "Every game window Vanguard's skin is registered for, by client. Written from the window registry by `scripts/tests/windows-coverage.test.mjs` (`VG_COVERAGE_WRITE=1` writes it again); don't edit it by hand. The test fails when this page and the registry differ, so a window added to or dropped from `Modules/Windows*.lua` shows up in a pull request's diff.",
    "",
    "Group is the switch under Game windows that turns the window's skin off. Made says when the game makes the window: at login, or with a part of the game that loads on demand. Its skin needs lists what the skin is written against (`GW.Needs`): a window that lacks one keeps the game's look, and `/vg status` names it. In game, `/vg status` counts these windows by state (dressed, left as the game's, replaced, switched off, not made yet) and `/vg status windows` lists them.",
    "",
    "Not on this page, because they are skinned outside the registry: tooltips, bags and the bank, chat and its bubbles, the cast bar, the pet, stance and extra buttons, the Cooldown Manager, the damage meter, loss of control, the talking head and raid warnings. Not skinned at all yet: the alert toasts, level-up and event toasts, help tips, the barber shop, item socketing and upgrade, the bonus roll, player choice frames and the pet battle interface."];
  return `${[...intro, "", section("WoW Forever", registry(FOREVER_CLIENT)), "", section("Retail", registry(RETAIL_CLIENT))].join("\n")}\n`;
}

it("docs/design/RESKIN-COVERAGE.md is the window registry, for both clients", () => {
  const text = page();
  if (process.env.VG_COVERAGE_WRITE) return void fs.writeFileSync(PAGE, text);
  expect(fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : "", "the page is out of date: VG_COVERAGE_WRITE=1 npx vitest run scripts/tests/windows-coverage.test.mjs").toBe(text);
});
