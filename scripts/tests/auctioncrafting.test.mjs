// auctioncrafting: the Auction helper's crafting costs (Modules/AuctionCrafting.lua): beside the
// game's profession window, the recipe on display priced from the auction prices, and Add
// reagents, at the TEST-ONLY profession window of the headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock, items, and recipes. 100 makes a TEST-ONLY bag from 3 Linen Cloth and a
// thread (plus slots left out: an optional reagent, a currency, a hidden count); 101 is an enchant
// (nothing made, one TEST-ONLY dust); 102 makes 1 to 3 TEST-ONLY bandages from a Linen Cloth.
const CRAFT_ENV = `
  __now = 1790000000
  time = function() return __now end
  local items = __wfgWorld.items
  items[2320] = { name = "TEST-ONLY Coarse Thread", icon = "TEST-ONLY-THREAD" }
  items[4238] = { name = "TEST-ONLY Linen Bag", icon = "TEST-ONLY-BAG" }
  items[10940] = { name = "TEST-ONLY Strange Dust", icon = "TEST-ONLY-DUST" }
  items[1251] = { name = "TEST-ONLY Bandage" }
  local function slot(id, qty, kind) return { reagents = { { itemID = id } }, quantityRequired = qty, reagentType = kind or 1 } end
  __wfgWorld.recipes = {
    [100] = { recipeID = 100, name = "TEST-ONLY Linen Bag", outputItemID = 4238, quantityMin = 1, quantityMax = 1,
      reagentSlotSchematics = { slot(2589, 3), slot(2320, 1), slot(9999, 1, 0), { reagents = { { currencyID = 7 } }, quantityRequired = 1, reagentType = 1 },
        slot(2592, __wfgWorld.secret(2)) } },
    [101] = { recipeID = 101, name = "TEST-ONLY Enchant Bracer", quantityMin = 1, quantityMax = 1, reagentSlotSchematics = { slot(10940, 2) } },
    [102] = { recipeID = 102, name = "TEST-ONLY Bandage", outputItemID = 1251, quantityMin = 1, quantityMax = 3, reagentSlotSchematics = { slot(2589, 1) } },
  }
  function __price(id, copper) ns.AuctionPrices.Record(id, copper, __now) end
`;

const CR = "ns.GetModule('AuctionHelper').Crafting";

// A logged-in warrior (no class reagents) with Linen Cloth at 10c and the bag at 5s.
function crafter(extra = "", opts) {
  const addon = loggedIn(CRAFT_ENV + extra, opts);
  addon.world.setUnit("player", { class: "WARRIOR", level: 60 });
  addon.eval("__price(2589, 10) __price(4238, 500)");
  return addon;
}

// The panel as the player sees it: [shown, title, reagent rows as [name, count, cost], totals as [label, value]].
const panel = (addon) => addon.eval(`local f = Vanguard_CraftingPanel
  if not f then return false end
  local rows, lines = {}, {}
  for _, r in ipairs(f.rows) do if r:IsShown() then rows[#rows + 1] = { r.name:GetText(), r.qty:GetText(), r.price:GetText() } end end
  for i, l in ipairs(f.lines) do lines[i] = { l.label:GetText(), l.value:GetText() } end
  return { f:IsVisible(), f.title:GetText(), rows, lines }`);

// A total line's value colour is the token `name`.
const lineIs = (addon, i, name) => isTok(addon, addon.eval(`return Vanguard_CraftingPanel.lines[${i}].value.__textColor`), name);

it("beside the profession window, a recipe's reagents, what they cost, what it sells for and the profit", () => {
  const addon = crafter();
  addon.world.openProfession(100);
  expect(panel(addon), "the thread has no price yet: the cost is at least, and no profit").toEqual([true, "TEST-ONLY Linen Bag",
    [["Linen Cloth", "x 3", "30c"], ["TEST-ONLY Coarse Thread", "x 1", "no price"]],
    [["Reagents", "at least 30c"], ["Sells for", "5s 0c"], ["Profit", "needs every price"]]]);
  expect([lineIs(addon, 1, "muted"), lineIs(addon, 2, "gold"), lineIs(addon, 3, "muted")], "what's missing in muted").toEqual([true, true, true]);
  addon.eval("__price(2320, 20)");
  addon.update(0);
  expect(panel(addon)[3], "a new price repaints it").toEqual([["Reagents", "50c"], ["Sells for", "5s 0c"], ["Profit", "4s 50c"]]);
  expect(lineIs(addon, 3, "good"), "a profit in green").toBe(true);
  const [p, w] = [addon.frame("Vanguard_CraftingPanel").rect, addon.frame("ProfessionsFrame").rect];
  expect([p.left - w.right, p.top, p.width], "right of the window, past its side tabs, from its top").toEqual([52, w.top, 240]);
});

it("another recipe repaints it: an enchant sells nothing, a recipe that makes several sells their average, a loss is red", () => {
  const addon = crafter("", {});
  addon.world.openProfession(101);
  expect(panel(addon).slice(2), "an enchant: its dust unpriced, nothing to sell").toEqual([[["TEST-ONLY Strange Dust", "x 2", "no price"]],
    [["Reagents", "at least 0c"], ["Sells for", "nothing to sell"], ["Profit", "needs every price"]]]);
  addon.eval("__price(1251, 4)");
  addon.world.selectRecipe(102);
  expect(panel(addon)[3], "1 to 3 made: 2 at 4c, less 10c of linen").toEqual([["Reagents", "10c"], ["Sells for", "8c"], ["Profit", "-2c"]]);
  expect(lineIs(addon, 3, "bad"), "a loss in red").toBe(true);
  addon.world.selectRecipe(999);
  expect(addon.frame("Vanguard_CraftingPanel").visible, "a recipe the client has no schematic for: hidden").toBe(false);
  addon.world.selectRecipe(100);
  addon.eval("ProfessionsFrame.CraftingPage.SchematicForm:Hide()");
  expect(addon.frame("Vanguard_CraftingPanel").visible, "another tab: hidden with the recipe form").toBe(false);
  addon.eval("ProfessionsFrame.CraftingPage.SchematicForm:Show()");
  expect(addon.frame("Vanguard_CraftingPanel").visible, "back: shown again").toBe(true);
  addon.world.closeProfession();
  expect(addon.frame("Vanguard_CraftingPanel").visible, "the window closed: hidden").toBe(false);
  addon.eval("ns.Settings('AuctionHelper').crafting = false");
  addon.world.openProfession(100);
  expect(addon.frame("Vanguard_CraftingPanel").visible, "switched off: not shown").toBe(false);
  addon.eval("ns.AuctionPrices.Record(2589, 9, __now)");
  addon.update(0);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("Add reagents keeps the reagents for the crafts typed in stock and makes the Restock list", () => {
  const addon = crafter();
  addon.slash("stock 2589 40");
  addon.world.openProfession(100);
  addon.type("Vanguard_CraftingPanel.crafts", "5");
  addon.click("Vanguard_CraftingPanel.add");
  expect(addon.eval("local s = ns.Settings('Errands').stockList return { s[2589], s[2320], s[9999] or false }"), "the larger count stays; optional reagents aren't added").toEqual([40, 5, false]);
  expect(chatHas(addon, /Keep stocked for 5 x TEST-ONLY Linen Bag: Linen Cloth x40, TEST-ONLY Coarse Thread x5\./), "chat says so").toBe(true);
  expect(addon.eval("local out = {} for i, e in ipairs(VanguardDB.ah.lists.Restock) do out[i] = { e.term, e.want } end return out"), "what's short is on the Restock list").toEqual([[2320, 5], [2589, 40]]);
  addon.type("Vanguard_CraftingPanel.crafts", "lots");
  addon.click("Vanguard_CraftingPanel.add");
  expect(chatHas(addon, /Keep stocked for 1 x TEST-ONLY Linen Bag/), "anything but a number: one craft").toBe(true);
  const noErrands = crafter("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { Errands = false } } }" });
  noErrands.world.openProfession(100);
  noErrands.click("Vanguard_CraftingPanel.add");
  expect(chatHas(noErrands, /Keep stocked is part of Errands, which is off/), "Errands off: said, nothing kept").toBe(true);
});

it("only post-hooks: the window's fields stay the game's; the helper off hooks nothing; no client schematic API is fine", () => {
  // A frame's fields as text, but for the hooked Init, the recipe the game's own Init keeps, and the
  // marks the Windows module leaves on a window it skins and makes movable.
  const keys = `local skip = { Init = true, currentRecipeInfo = true, vgWindow = true }
    local function keys(t) local out = {} for k, v in pairs(t) do if not skip[k] then out[#out + 1] = tostring(k) .. "=" .. tostring(v) end end table.sort(out) return table.concat(out, ",") end`;
  const addon = crafter(`__wfgWorld.openProfession() ${keys}
    __before = { keys(ProfessionsFrame), keys(ProfessionsFrame.CraftingPage), keys(ProfessionsFrame.CraftingPage.SchematicForm) }`);
  addon.world.openProfession(100);
  addon.eval("__price(2320, 1)");
  addon.update(0);
  const same = addon.eval(`${keys} local f = ProfessionsFrame
    return { keys(f) == __before[1], keys(f.CraftingPage) == __before[2], keys(f.CraftingPage.SchematicForm) == __before[3] }`);
  expect([panel(addon)[0], same], "shown, and nothing of the game's changed but the post-hook").toEqual([true, [true, true, true]]);
  const off = crafter("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { AuctionHelper = false } } }" });
  off.world.openProfession(100);
  expect(off.eval("return Vanguard_CraftingPanel == nil"), "the helper off: no panel").toBe(true);
  const old = crafter("C_TradeSkillUI.GetRecipeSchematic = nil");
  old.world.openProfession(100);
  expect([old.eval("return Vanguard_CraftingPanel == nil"), old.eval("return #ns.errors")], "no schematic API: no panel, no error").toEqual([true, 0]);
  const late = crafter("__wfgWorld.openProfession() ns.GetModule('AuctionHelper').Crafting.hooked = nil");
  expect(late.eval(`return ${CR}.hooked`), "loaded before login: hooked when a profession opens").toBe(null);
  late.world.openProfession(100);
  expect(panel(late)[0], "hooked at TRADE_SKILL_SHOW").toBe(true);
});

it("the options have the switch", () => {
  const addon = crafter();
  addon.eval('ns.Options.Show("more")');
  expect(addon.find("^Crafting costs and profit beside the profession window").text, "under Auction house").toMatch(/^Crafting costs/);
});
