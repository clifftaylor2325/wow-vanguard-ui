// An inventory of the options window, measured in the headless client: for each client (WoW Forever, Retail)
// every page, its tabs (cards), its rows by kind, how many have a default (a reset dot), how many apply after a
// reload, and which modules' settings sit on it. The numbers in docs/design/SETTINGS-SIMPLIFICATION.md come from
// here. Run: node scripts/options-inventory.mjs [--json <file>] (the JSON holds one line per row).

import fs from "node:fs";
import { createAddon, FOREVER_CLIENT, RETAIL_CLIENT } from "./lib/lua-harness.mjs";

// An account that has finished setup, so the wizard stays shut and every module is on.
const SETUP_DONE = "VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = {}\n";

// Lua that walks every page's rows as the window reads them (O.RowsOf) and returns one tab-separated line per
// row: page key, page title, card (tab) title, kind, caption (English), has a default, applies on reload, the
// module and key it sets, and whether it is the page's reset button.
const WALK = `
local O = ns.Options
local out = {}
local function clean(s) return (tostring(s or ""):gsub("[%c\\\\\\"]", " ")) end
for _, page in ipairs(O.PAGES) do
  local card = "(untitled)"
  for _, row in ipairs(O.RowsOf(page)) do
    if row[1] == "header" then card = ns.English(row[2])
    else
      local at = ({ check = 4, cycle = 5, slider = 5 })[row[1]]
      local module, key = "", ""
      if at then module, key = O.SettingOf(row[at - 1]) end
      local caption = type(row[2]) == "string" and (row.english or ns.English(row[2])) or ""
      out[#out + 1] = table.concat({ page.key, clean(ns.English(page.title)), clean(card), row[1], clean(caption),
        (at and row[at + 1] ~= nil) and 1 or 0, row.reload and 1 or 0, clean(module), clean(key), row.isReset and 1 or 0 }, "\\t")
    end
  end
end
return table.concat(out, "\\n")
`;

// One row's fields from a line of WALK's output.
function parseRow(line) {
  const [page, title, card, kind, caption, def, reload, module, key, reset] = line.split("\t");
  return { page, title, card, kind, caption, def: def === "1", reload: reload === "1", module, key, reset: reset === "1" };
}

// Every row of the window on one client, logged in with every module on.
function inventory(client) {
  const addon = createAddon({ client, savedVariables: SETUP_DONE });
  addon.login();
  return addon.eval(WALK).split("\n").map(parseRow);
}

// Counts one row into its page's totals: its tab, its kind, a default, a reload tag and the module it sets.
function count(p, r) {
  p.cards.add(r.card);
  p.rows += 1;
  if (r.def) p.settings += 1;
  if (r.reload) p.reload += 1;
  if (r.module) p.modules.add(r.module);
  p.kinds[r.kind] = (p.kinds[r.kind] || 0) + 1;
}

// The rows grouped by page: tabs, rows, settings, reload rows, modules and kinds per page (the reset row left out).
function byPage(rows) {
  const pages = new Map();
  for (const r of rows) {
    if (r.reset) continue;
    if (!pages.has(r.page)) pages.set(r.page, { title: r.title, cards: new Set(), rows: 0, settings: 0, reload: 0, modules: new Set(), kinds: {} });
    count(pages.get(r.page), r);
  }
  return pages;
}

// Prints one client's table: a line per page and a total line.
function print(name, rows) {
  const pages = byPage(rows);
  const total = { cards: 0, rows: 0, settings: 0, reload: 0 };
  console.log(`\n== ${name}: ${pages.size} pages, ${rows.filter((r) => r.kind === "module").length} module switches`);
  console.log("page\ttabs\trows\tsettings\treload\tmodules\tkinds");
  for (const [key, p] of pages) {
    total.cards += p.cards.size; total.rows += p.rows; total.settings += p.settings; total.reload += p.reload;
    console.log(`${p.title} (${key})\t${p.cards.size}\t${p.rows}\t${p.settings}\t${p.reload}\t${p.modules.size}\t${JSON.stringify(p.kinds)}`);
  }
  console.log(`TOTAL\t${total.cards}\t${total.rows}\t${total.settings}\t${total.reload}`);
}

const data = { forever: inventory(FOREVER_CLIENT), retail: inventory(RETAIL_CLIENT) };
const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(data, null, 1));
for (const [name, rows] of Object.entries(data)) print(name, rows);
