// A Vitest reporter that ends a run with one line per Lua harness category
// (scripts/verify-lua.test.mjs), like the summary the harness printed before
// it moved onto Vitest. A case not listed in CATEGORIES is counted under
// "other", and scripts/lua-summary.test.mjs fails until it gets a category.

import path from "node:path";

const HARNESS = "verify-lua.test.mjs";
const OTHER = "other";

// Category name -> the it() names in scripts/verify-lua.test.mjs it covers.
export const CATEGORIES = [
  ["core", ["saved variables", "wrong-typed saved values are replaced by their defaults", "the account file's version is read and upgraded", "a session: what you set in one login comes back in the next", "modules", "combat queue", "combat queue: a key replaces its entry, in place", "pins: a throwing apply is reported and the pin keeps working", "pins: any number of game moves in combat leave one pending pin", "slash", "events unsubscribe and a delivered event with no listeners", "events: a handler that throws does not stop the others, and the error is kept with its stack", "events: on a client without debugstack or an error handler, the error is still kept", "events: a broken game error handler cannot lose the record", "events: Blizzard's CallErrorHandler is preferred when the client has it", "slash commands for frames, accent, grid, theme, modules, skins, profile and spec", "WoW Forever client: interface, hidden auras, no specializations", "a retail client is not WoW Forever and keeps its aura state readable", "reload buttons: a /reload macro overlay, since the Forever client blocks ReloadUI()", "client capability probe: what this client has, and /fui status says so", "client capability probe: every flag off, every module still enables", "client capability probe: in a fight the aura container waits; first use probes early", "secure snippets: a client that compiles them keeps hover keys and says so in /fui status", "secure snippets: a client whose snippets fail to compile turns hover keys off, once, and keeps mouse bindings", "secure snippets: a snippet that runs but writes nothing, and a client without the handler API, count as no", "secure snippets: logging in during a fight defers the probe, and it runs before click casting applies", "/fui errors: what ForeverUI caught this session", "caught errors: one entry per distinct error, counted, with its stack, told once", "caught errors: without debugstack or an error handler (this stub), and a hidden error value", "caught errors: a game handler that fails or reports again cannot loop, and an empty handler slot", "caught errors: an after-combat update that fails is reported and the rest still run", "/fui errors: counts, build, interface version and the aura backend, then clear", "smoke-test checklist: every /fui command it names is real", "smoke-test checklist: every step has its Do, Expect and paste lines", "Forever fixes: the newer calls for zone color, pet moods, breath bars, the minimap eye, the house icon and the build line"]],
  ["theme", ["theme", "widgets", "theme tokens and pixel-perfect borders", "one-pixel borders at every resolution and UI scale", "bundled font and logo", "text roles, sheen and shadows"]],
  ["skins", ["skin API", "skin SetFont and a UI scale change"]],
  ["movers", ["movers", "layout", "mover coordinates with no handle"]],
  ["unlock", ["unlock mode", "accent presets", "unlock popover: anchor, offsets, reset"]],
  ["special", ["special bars"]],
  ["motion", ["motion: fades, reduce motion, sounds"]],
  ["frames", ["frames pass: bar texture, smoothing, raid style, shields, glows", "proc glow on action buttons", "brass art: a calmer HUD, soft sparks, corner diamonds and role marks"]],
  ["bars", ["action bars", "reagent and item counts show even at 0 and 1", "action bars stack with bar 1 on top", "action bar stack follows button size and rows", "a moved action bar keeps its spot until reset", "the bottom stack follows per-bar size and rows, live", "action bar paging and events", "action bar dragging", "action button cooldowns, the C_ActionBar API and range polling", "a dropped spell named by GetSpellInfo", "action bar visibility: each mode's state driver and mouseover alpha", "action bar empty slots hide until the grid shows", "the right-edge bars start off and show on mouseover when turned on", "action bar layout: per-bar buttons, rows and size, deferred in combat", "an old profile keeps its right-edge bar on Always; a fresh enable gets On mouseover", "In combat bars show during a drag out of combat; a drag that starts in combat leaves secure visibility alone", "mouseover bars are revealed during a drag and restored after", "Hidden bar bindings stay intact", "action bar cooldown numbers in the theme's font"]],
  ["status", ["raid status marks"]],
  ["tooltip", ["tooltips", "item tooltips show what the stack sells for, unless the client already does", "item tooltips: how many you have, and the item ID when asked"]],
  ["plates", ["nameplates", "a nameplate first drawn in combat gets the client's aura container after the fight", "nameplates show levels in the difficulty color"]],
  ["healing", ["heal prediction, aggro, buff watch", "healing fallbacks and options"]],
  ["auras", ["raid indicators", "raid indicators on the fallback", "a client that won't drive the dispel highlight never shows it uncolored", "raid tile zones never overlap", "target and focus auras", "your buffs and debuffs replace the game's, with weapon enchants in front", "your buffs: the enchant switch, and clients without enchant info", "aura duration objects and power colors the theme does not name", "aura containers on the client's engine", "aura container timer options a client refuses, and the engine probe", "aura containers without the engine (the fallback)", "the engine probe refuses an AuraContainer without AddAuraGroup", "a container the client refuses after the probe retires the engine for the session", "raid tiles built after the engine retires get the fallback highlight", "aura colors and stacks when the client hides the values", "aura filter words this client rejects are dropped for the session", "a client that rejects every aura filter word keeps the filter and shows no auras", "aura filters pass through on a client without the aura read", "the raid dispel highlight reads through the stripped filter on the fallback"]],
  ["clicks", ["click casting", "click casting options", "click-casting validation, labels and unit frames"]],
  ["raid", ["raid frames", "a unit event reaches only the tile showing that unit", "raid frames: a dark style chosen before 'look' carries over"]],
  ["options", ["options window", "options window: nav, search, controls, footer", "options slider, search, scroll, special bars and profile switch", "choice fallback, key capture and the mouse wheel", "options: a changed setting gets a dot that puts the default back", "options: profiles in the window", "options: search jumps to the row, and the page edges fade", "text that fits: chat size, tooltip fonts, the status line, name width"]],
  ["profiles", ["profile strings", "profile strings keep big whole numbers", "export and import", "profile management", "spec profiles", "profile copy, empty export and a taken import name", "a profile string with an unterminated quote"]],
  ["range", ["range tint"]],
  ["data", ["data bars"]],
  ["more", ["minimap", "chat", "bags", "game windows in the ForeverUI look: framed windows, popups, breath bar, and windows that load later", "game windows: switched off they stay the game's, and missing windows are fine", "game windows: quest and gossip text stays readable on the dark panel", "the game's tools: Cooldown Manager and damage meter styled and placed, standing aside for Edit Mode", "the game's extras: duplicates hidden, minimap buttons on the map, menu strip, quest tracker", "the game's extras: each switch off leaves the game's frame alone, and missing frames are fine", "the game's extras: a protected frame is hidden once, out of combat, with no Show hook", "menu and bag strips: the bars' own frame art is hidden, the key ring is skinned", "menu and bag strips: they re-fit when the game lays the bars out or resizes them", "menu and bag strips: a saved bag position wins; the default follows the menu strip's spot", "menu and bag strips: no re-fit while pins are paused or in combat, and one queued entry per bar", "menu and bag strips: glyphs are 16 screen pixels on a square face, accent under the mouse", "the quest tracker in the ForeverUI look: flat headers, brass lines, theme arrows and font", "Round Four leftovers: menu glyphs, a target diamond, raid names above incoming heals", "the info strip under the minimap", "the info strip: ammo, and clients that can't answer", "the info strip: XP and gold per hour, and time to level", "at a merchant: repair with your own gold, sell junk", "boss frames: five in a column at the top left, the game's put away", "boss frames: the game's holder is put away only out of combat", "raid tools: calls, target icons and world markers for the leader and assistants", "raid frames: groups as rows, and the main tank's shield", "a ForeverUI button on the game menu opens the options", "game menu button: falls back, or goes without what the menu lacks", "Train all at a trainer: learns what you can afford, one at a time", "keep stocked: /fui stock sets the list, a merchant tops you up", "flight timer: the first flight is timed, the next counts down", "the error line drops what the action bar already shows", "a Sort button on the combined bag, where the client can sort", "more game windows: friends, books and letters, and windows that load later", "game alerts: loss of control and the talking head, styled and placed (or hidden)", "the faction look: your faction's crest and heading font, and Off", "/fui factionart: which of the game's own faction pictures the client has", "main tank frames: the raid's main tanks and assists, with what each is targeting", "party pets and targets: small tiles above the party, only in a party, when switched on", "Edit Mode shows ForeverUI's handles too, with a note under its window", "the game's tools: one hint when the Cooldown Manager is off", "the info strip: your DPS in the last fight, from the game's damage meter", "nameplates: a gold ! by units your quests need", "the AFK screen: a dimmed screen and a card while you're away", "the AFK screen: clicks, keys and fights put it away; what the client can't say is left out", "quest log: zones, a quest's details, and its buttons", "quest log: keys follow rebinding, /fui quests, closing, and switched off", "quest tracker: watched quests with levels, objectives and items", "quest tracker: nearest first, collapsing, too many quests, and switched off", "quest dialog: gossip lines, quest details, rewards and keys", "quest dialog: turning in, picking a reward, closing, and handing the windows back", "quest dialog: late item details redraw the page; spell and currency rewards", "quest automation: accept, turn in, best reward, skip chatter; Shift skips it", "chat extras: web links you can copy, and a Copy button for the recent chat", "minimap drawer: addon buttons gathered beside the map", "auto-accept: summons, resurrections and duels, each off until switched on", "bags and bank: item quality borders, the search boxes and the bank in the theme", "character pane durability, the mail's Open All button", "minimap with no position, chat window hooks, and short numbers"]],
  ["casts", ["cast bars", "cast bars: spark, seconds left, latency and the uninterruptible edge", "cast bar flashes on finish and interrupt", "cast timing from the client's duration object"]],
  ["units", ["unit frames", "unit frames on WoW Forever: levels, health percent, classification", "combo points for rogues and druids", "class bars: totems for shamans, mana in forms for druids", "unit frame health text settings apply at once", "class bars: druid mana while a form shows rage or energy", "unit frame events", "unit frames wait for combat", "power ticks: the five-second rule after a mana spell", "power ticks: energy every two seconds, and forms switch", "power ticks: switches, and no player frame", "swing timer: a row per hand, from the client's own swings", "swing timer: who sees it", "threat on your target and your pet's happiness", "threat and happiness only where the client and settings allow"]],
  ["setup", ["first-run setup: once per account, three clicks with the defaults", "first-run setup waits for combat and steps aside in a fight", "/fui setup reopens setup; Back and the close button", "setup layouts: Healing puts the raid frames under the character and turns click casting on", "setup layouts: Damage and tanking restores ForeverUI's defaults, undoing Healing", "setup layouts: Like the game's puts your frames at the top left; another layout puts them back", "setup layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect", "Centered layout: compact raid grid, one-time migrations, a strip with nothing to show", "setup look: accent swatches and the raid frame style apply at once"]],
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