// A Vitest reporter that ends a run with one line per Lua harness category
// (scripts/verify-lua.test.mjs), like the summary the harness printed before
// it moved onto Vitest. A case not listed in CATEGORIES is counted under
// "other", and scripts/lua-summary.test.mjs fails until it gets a category.

import path from "node:path";

const HARNESS = "verify-lua.test.mjs";
const OTHER = "other";

// Category name -> the it() names in scripts/verify-lua.test.mjs it covers.
export const CATEGORIES = [
  ["core", ["saved variables", "a session: what you set in one login comes back in the next", "modules", "combat queue", "slash", "events unsubscribe and a delivered event with no listeners", "slash commands for frames, accent, grid, theme, modules, skins, profile and spec", "WoW Forever client: interface, hidden auras, no specializations", "a retail client is not WoW Forever and keeps its aura state readable", "reload buttons: a /reload macro overlay, since the Forever client blocks ReloadUI()", "/fui errors: what ForeverUI caught this session"]],
  ["theme", ["theme", "widgets", "theme tokens and pixel-perfect borders", "bundled font and logo", "text roles, sheen and shadows"]],
  ["skins", ["skin API", "skin SetFont and a UI scale change"]],
  ["movers", ["movers", "layout", "mover coordinates with no handle"]],
  ["unlock", ["unlock mode", "accent presets", "unlock popover: anchor, offsets, reset"]],
  ["special", ["special bars"]],
  ["motion", ["motion: fades, reduce motion, sounds"]],
  ["frames", ["frames pass: bar texture, smoothing, raid style, shields, glows", "proc glow on action buttons", "brass art: a calmer HUD, soft sparks, corner diamonds and role marks"]],
  ["bars", ["action bars", "reagent and item counts show even at 0 and 1", "action bars stack with bar 1 on top", "action bar stack follows button size and rows", "a moved action bar keeps its spot until reset", "the bottom stack follows per-bar size and rows, live", "action bar paging and events", "action bar dragging", "action button cooldowns, the C_ActionBar API and range polling", "a dropped spell named by GetSpellInfo", "action bar visibility: each mode's state driver and mouseover alpha", "action bar empty slots hide until the grid shows", "the right-edge bars start off and show on mouseover when turned on", "action bar layout: per-bar buttons, rows and size, deferred in combat", "an old profile keeps its right-edge bar on Always; a fresh enable gets On mouseover", "In combat bars show during a drag out of combat; a drag that starts in combat leaves secure visibility alone", "mouseover bars are revealed during a drag and restored after", "Hidden bar bindings stay intact", "action bar cooldown numbers in the theme's font"]],
  ["status", ["raid status marks"]],
  ["tooltip", ["tooltips"]],
  ["plates", ["nameplates", "a nameplate first drawn in combat gets the client's aura container after the fight", "nameplates show levels in the difficulty color"]],
  ["healing", ["heal prediction, aggro, buff watch", "healing fallbacks and options"]],
  ["auras", ["raid indicators", "raid indicators on the fallback", "a client that won't drive the dispel highlight never shows it uncolored", "raid tile zones never overlap", "target and focus auras", "your buffs and debuffs replace the game's, with weapon enchants in front", "your buffs: the enchant switch, and clients without enchant info", "aura duration objects and power colors the theme does not name", "aura containers on the client's engine", "aura container timer options a client refuses, and the engine probe", "aura containers without the engine (the fallback)", "aura colors and stacks when the client hides the values"]],
  ["clicks", ["click casting", "click casting options", "click-casting validation, labels and unit frames"]],
  ["raid", ["raid frames", "a unit event reaches only the tile showing that unit", "raid frames: a dark style chosen before 'look' carries over"]],
  ["options", ["options window", "options window: nav, search, controls, footer", "options slider, search, scroll, special bars and profile switch", "choice fallback, key capture and the mouse wheel", "options: a changed setting gets a dot that puts the default back", "options: profiles in the window", "options: search jumps to the row, and the page edges fade", "text that fits: chat size, tooltip fonts, the status line, name width"]],
  ["profiles", ["profile strings", "export and import", "profile management", "spec profiles", "profile copy, empty export and a taken import name", "a profile string with an unterminated quote"]],
  ["range", ["range tint"]],
  ["data", ["data bars"]],
  ["more", ["minimap", "chat", "bags", "game windows in the ForeverUI look: framed windows, popups, breath bar, and windows that load later", "game windows: switched off they stay the game's, and missing windows are fine", "the game's extras: duplicates hidden, minimap buttons on the map, menu strip, quest tracker", "the game's extras: each switch off leaves the game's frame alone, and missing frames are fine", "the info strip under the minimap", "the info strip: ammo, and clients that can't answer", "at a merchant: repair with your own gold, sell junk", "the error line drops what the action bar already shows", "a Sort button on the combined bag, where the client can sort", "minimap with no position, chat window hooks, and short numbers"]],
  ["casts", ["cast bars", "cast bars: spark, seconds left, latency and the uninterruptible edge", "cast bar flashes on finish and interrupt", "cast timing from the client's duration object"]],
  ["units", ["unit frames", "unit frames on WoW Forever: levels, health percent, classification", "combo points for rogues and druids", "class bars: totems for shamans, mana in forms for druids", "unit frame health text settings apply at once", "class bars: druid mana while a form shows rage or energy", "unit frame events", "unit frames wait for combat", "power ticks: the five-second rule after a mana spell", "power ticks: energy every two seconds, and forms switch", "power ticks: switches, and no player frame", "swing timer: a row per hand, from the client's own swings", "swing timer: who sees it", "threat on your target and your pet's happiness", "threat and happiness only where the client and settings allow"]],
  ["setup", ["first-run setup: once per account, three clicks with the defaults", "first-run setup waits for combat and steps aside in a fight", "/fui setup reopens setup; Back and the close button", "setup layouts: Healing puts the raid frames under the character and turns click casting on", "setup layouts: Damage and tanking restores ForeverUI's defaults, undoing Healing", "Centered layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect", "Centered layout: compact raid grid, one-time migrations, a strip with nothing to show", "setup look: accent swatches and the raid frame style apply at once"]],
];

// The category a Lua harness case belongs to ("other" when it is not listed).
export function categoryOf(name) {
  const hit = CATEGORIES.find(([, names]) => names.includes(name));
  return hit ? hit[0] : OTHER;
}

// Tallies [{ name, state }] into Map(category -> { passed, total }), in CATEGORIES order.
export function tally(cases) {
  const counts = new Map([...CATEGORIES, [OTHER, []]].map(([c]) => [c, { passed: 0, total: 0 }]));
  for (const { name, state } of cases) {
    const c = counts.get(categoryOf(name));
    c.total += 1;
    if (state === "passed") c.passed += 1;
  }
  return counts;
}

// One "  name     passed/total passed" line per category that has cases.
export function summaryLines(counts) {
  const rows = [...counts].filter(([, c]) => c.total > 0);
  return rows.map(([name, c]) => `  ${name.padEnd(9)}${c.passed}/${c.total} passed`);
}

// The harness's cases from a finished run as [{ name, state }]; [] when it did not run.
function harnessCases(testModules) {
  const mod = testModules.find((m) => path.basename(m.moduleId) === HARNESS);
  if (!mod) return [];
  return [...mod.children.allTests()].map((t) => ({ name: t.name, state: t.result().state }));
}

// A reporter object for vitest.config.mjs that prints the category lines after a run.
export function luaSummaryReporter() {
  return {
    // Keeps Vitest's logger so the lines print with the rest of the run's output.
    onInit(vitest) { this.logger = vitest.logger; },
    // Prints the category lines when the Lua harness was part of the run.
    onTestRunEnd(testModules) {
      const cases = harnessCases(testModules);
      if (cases.length === 0) return;
      this.logger.log(["", "Lua harness by category", ...summaryLines(tally(cases))].join("\n"));
    },
  };
}