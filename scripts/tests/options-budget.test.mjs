// options-budget: how many rows each options tab shows when it opens, and the fold that keeps it short (real Lua in
// the TEST-ONLY headless client; docs/design/SETTINGS-SIMPLIFICATION.md, D1).
//
// A tab opens on at most 8 rows. The tabs that did not when the budget began are listed in options-budget-baseline.json,
// with the rows each shows now, and the list only shrinks: a tab over 8 that is not listed fails, a tab that shows more
// than it is listed with fails, and a listed tab that shows fewer must be lowered (or taken out at 8 or under).
// VG_BUDGET_WRITE=1 rewrites the list from what the tabs show; use it only to take out or lower what a change fixed,
// never to let a longer tab in.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createAddon, FOREVER_CLIENT, RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { CLICK_LUA, SETUP_DONE, loggedIn } from "./helpers.mjs";

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "options-budget-baseline.json");
const BUDGET = 8;

// Lua: one "page / tab = shown" line per tab, as the window opens it. A tab is a card (a header starts one; rows before
// the first header make an untitled one); the shown rows are the card's after its fold (Core/OptionsFold.lua).
const TABS = `
local O = ns.Options
local out = {}
local function emit(page, title, rows)
  if #rows == 0 then return end
  local shown = O.Fold.Split(rows)
  out[#out + 1] = page.key .. " / " .. (title or "(untitled)") .. " = " .. #shown
end
for _, page in ipairs(O.PAGES) do
  local title, rows = nil, {}
  for _, row in ipairs(O.RowsOf(page)) do
    if row.isReset then
    elseif row[1] == "header" then emit(page, title, rows) title, rows = ns.English(row[2]), {}
    else rows[#rows + 1] = row end
  end
  emit(page, title, rows)
end
return table.concat(out, "\\n")
`;

// What every tab shows on one client: { "page / tab": rows }.
function tabsOn(client) {
  const addon = createAddon({ client, savedVariables: SETUP_DONE });
  addon.login();
  const tabs = {};
  for (const line of addon.eval(TABS).split("\n")) {
    const [name, rows] = line.split(" = ");
    tabs[name] = Number(rows);
  }
  return tabs;
}

// The longest a tab shows on either client, for the tabs over the budget.
function overBudget() {
  const over = {};
  for (const tabs of [tabsOn(FOREVER_CLIENT), tabsOn(RETAIL_CLIENT)]) {
    for (const [name, rows] of Object.entries(tabs)) if (rows > BUDGET) over[name] = Math.max(over[name] ?? 0, rows);
  }
  return Object.fromEntries(Object.entries(over).sort());
}

it("options budget: no tab opens on more rows than the budget or than its baseline", () => {
  const found = overBudget();
  if (process.env.VG_BUDGET_WRITE) return void fs.writeFileSync(BASELINE, JSON.stringify(found, null, 2) + "\n");
  const known = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const grew = Object.keys(found).filter((name) => found[name] > (known[name] ?? BUDGET));
  const fixed = Object.keys(known).filter((name) => (found[name] ?? BUDGET) < known[name]);
  expect(grew, `tabs that show more rows than ${BUDGET} (fold the parts of a feature: essential = true on the rest)`).toEqual([]);
  expect(fixed, "tabs that show fewer rows than their baseline: lower or remove them in options-budget-baseline.json (VG_BUDGET_WRITE=1)").toEqual([]);
});

// The Raid frames page open on its first tab; the first tab's fold line and its rows, as Lua helpers.
const RAID = `
  ns.Options.Show("raid")
  local card
  for _, w in ipairs(__wfgStub.frames) do if w.foldRows and w:IsShown() then card = w end end
  local function visibleRows() local n = 0 for _, w in ipairs(card.foldRows) do if w:IsVisible() then n = n + 1 end end return n end
`;

it("options fold: Raid frames opens on its essential rows and a More settings line with the count", () => {
  const addon = loggedIn(CLICK_LUA);
  const state = addon.eval(`${RAID} return { card.fold.text.__text, card.fold.count.__text, #card.foldRows, visibleRows(), card.fold.collapsed, #card.rows }`);
  expect(state, "the line, 15 rows folded away of 22, none showing").toEqual(["MORE SETTINGS", "15", 15, 0, true, 22]);
  const shown = addon.eval(`${RAID} local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.card == card and not w.folded and w.source and w:IsVisible() then n = n + 1 end end return n`);
  expect(shown, "7 rows show").toBe(7);
});

it("options fold: pressing the line opens the rest below it, and again folds it, the card growing and shrinking with it", () => {
  const addon = loggedIn(CLICK_LUA);
  const closed = addon.eval(`${RAID} return card.height`);
  const opened = addon.eval(`${RAID} card.fold.__scripts.OnClick(card.fold, "LeftButton") return { visibleRows(), card.height, card.fold.collapsed, card:GetHeight() }`);
  expect(opened.slice(0, 1).concat(opened[2]), "all 15 show and the chevron opens").toEqual([15, false]);
  expect(opened[1], "the card is taller by the 15 rows").toBeGreaterThan(closed + 15 * 20);
  expect(opened[3], "and the frame follows its height").toBe(opened[1]);
  const folded = addon.eval(`${RAID} card.fold.__scripts.OnClick(card.fold, "LeftButton") return { visibleRows(), card.height }`);
  expect(folded, "pressing again folds them and gives the height back").toEqual([0, closed]);
});

it("options fold: a folded row found by search, a link or OpenHit opens its fold, and the fold stays open for the session", () => {
  const addon = loggedIn(CLICK_LUA);
  const revealed = addon.eval(`${RAID} local row for _, w in ipairs(card.foldRows) do if w.caption == "Power bar" then row = w end end
    return { row:IsVisible(), ns.Options.RevealRow(row), card.fold.collapsed }`);
  expect(revealed, "Power bar sits in the fold; revealing it opens the fold").toEqual([false, true, false]);
  const again = addon.eval(`ns.Options.Show("general") ${RAID} return card.fold.collapsed`);
  expect(again, "leaving the page and coming back keeps it open").toBe(false);
  addon.eval('ns.Options.JumpTo("Leader and assistant marks")');
  expect(addon.eval("return Vanguard_Options.found:IsShown()"), "a jump to a folded row finds it").toBe(true);
});

it("options fold: the fold line wears the accent dot while a folded row is changed, and Tab reaches the line", () => {
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval(`${RAID} return card.fold.changed:IsShown()`), "no dot with every folded row at its default").toBe(false);
  addon.eval('__click("Power bar")');
  expect(addon.eval(`${RAID} return card.fold.changed:IsShown()`), "changing a folded row lights it").toBe(true);
  addon.eval('__click("Power bar")');
  expect(addon.eval(`${RAID} return card.fold.changed:IsShown()`), "putting it back clears it").toBe(false);
  addon.eval(`${RAID} card.fold:SetCollapsed(true) card.fold.__scripts.OnClick(card.fold) card.fold.__scripts.OnClick(card.fold)`);
  addon.eval('Vanguard_Options:Hide() ns.Options.Show("raid")');
  addon.key("Vanguard_Options", "TAB");
  addon.key("Vanguard_Options", "TAB");
  expect(addon.eval("return Vanguard_Options.focusRow ~= nil"), "Tab walks the page's rows").toBe(true);
});
