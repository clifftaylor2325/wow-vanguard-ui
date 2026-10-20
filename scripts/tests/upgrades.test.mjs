// upgrades: gear compared with what you wear (Modules/Upgrades.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn, px } from "./helpers.mjs";
import { alphaOf, buttonOf, closeOf, escapes, insets, pressEscape, thumbOf, titleOf, titleSize } from "./dialogs.mjs";

// TEST-ONLY gear for a warrior with no group role (strength weights: STR 1, DPS 2.5; SPI is worth
// nothing). Worn: bracers 1 (STR 10), rings 5 (STR 4) and 6 (STR 8), main hand 8 (3 DPS), off hand 9
// (STR 2), feet 14 (SPI only), waist 16 (STR 7); the head is empty. __link(n) is item n's link.
const GEAR_ENV = `
  __wfgWorld.units.player.class = "WARRIOR"
  __gear = {
    [1] = { "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 10 } }, [2] = { "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 12 } },
    [3] = { "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 5 } }, [4] = { "INVTYPE_FINGER", { ITEM_MOD_STRENGTH_SHORT = 6 } },
    [5] = { "INVTYPE_FINGER", { ITEM_MOD_STRENGTH_SHORT = 4 } }, [6] = { "INVTYPE_FINGER", { ITEM_MOD_STRENGTH_SHORT = 8 } },
    [7] = { "INVTYPE_2HWEAPON", { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 10 } }, [8] = { "INVTYPE_WEAPONMAINHAND", { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 3 } },
    [9] = { "INVTYPE_SHIELD", { ITEM_MOD_STRENGTH_SHORT = 2 } }, [10] = { "INVTYPE_HEAD", { ITEM_MOD_STAMINA_SHORT = 5 } },
    [11] = { "INVTYPE_CLOAK", { ITEM_MOD_STRENGTH_SHORT = 50 } }, [12] = { "INVTYPE_NON_EQUIP", {} },
    [13] = { "INVTYPE_FEET", { ITEM_MOD_STRENGTH_SHORT = 3 } }, [14] = { "INVTYPE_FEET", { ITEM_MOD_SPIRIT_SHORT = 9 } },
    [15] = { "INVTYPE_WAIST", { ITEM_MOD_STRENGTH_SHORT = 7 } }, [16] = { "INVTYPE_WAIST", { ITEM_MOD_STRENGTH_SHORT = 7, ITEM_MOD_SPIRIT_SHORT = { __secret = true } } },
    [17] = { "INVTYPE_HAND", { ITEM_MOD_STRENGTH_SHORT = 9 } },
  }
  function __link(n) return "|cff1eff00|Hitem:" .. n .. "::|h[TEST-ONLY Item " .. n .. "]|h|r" end
  local function gear(link) return __gear[tonumber(tostring(link):match("item:(%d+)"))] end
  local instant = C_Item.GetItemInfoInstant
  C_Item.GetItemInfoInstant = function(link) local g = gear(link) if g then return tonumber(link:match("item:(%d+)")), "Armor", "Plate", g[1] end return instant(link) end
  C_Item.GetItemStats = function(link) local g = gear(link) return g and g[2] end
  C_Item.IsEquippableItem = function(link) local g = gear(link) return g ~= nil and g[1] ~= "INVTYPE_NON_EQUIP" and g[1] ~= "INVTYPE_HAND" end
  C_PlayerInfo = { CanUseItem = function(id) return id ~= 11 end }
  __worn = { [9] = __link(1), [11] = __link(5), [12] = __link(6), [16] = __link(8), [17] = __link(9), [8] = __link(14), [6] = __link(16) }
  GetInventoryItemLink = function(unit, slot) return __worn[slot] end
  __tt = {}
  function __tt:AddLine(text, r, g, b) self.lines[#self.lines + 1] = text end
  function __line(n) __tt.lines = {} ns.GetModule("Upgrades").AddLine(__tt, __link(n)) return __tt.lines[1] or false end
`;

it("upgrades: tooltips compare gear with what you wear, by your class's weights", () => {
  const addon = loggedIn(GEAR_ENV);
  expect([addon.eval("return __line(2)"), addon.eval("return __line(3)")], "better and worse bracers, against the pair you wear").toEqual(["Upgrade +20% (estimate) vs TEST-ONLY Item 1", "Downgrade -50% (estimate) vs TEST-ONLY Item 1"]);
  expect(addon.eval("return __line(4)"), "a ring against the weaker ring you wear").toBe("Upgrade +50% (estimate) vs TEST-ONLY Item 5");
  expect(addon.eval("return __line(7)"), "a two-hander against both hands (3 DPS x 2.5 + 2 STR)").toBe("Upgrade +163% (estimate) vs TEST-ONLY Item 8");
  expect(addon.eval("return __line(10)"), "an empty slot").toBe("Upgrade: fills an empty slot");
  expect(addon.eval("return __line(13)"), "against worn gear worth nothing to you").toBe("Upgrade +100% (estimate) vs TEST-ONLY Item 14");
  expect(addon.eval("return { __line(11), __line(12), __line(17), __line(15) }"), "gear you can't use, can't wear, isn't equippable, or that's the same: no line").toEqual([false, false, false, false]);
  expect(addon.eval("local up, good = __tt, { ns.Theme.RGB('good') } __tt.AddLine = function(self, text, r) self.lines[1] = r == good[1] end return __line(2)"), "an upgrade in the good color").toBe(true);
  addon.eval("ns.GetModule('Upgrades').settings.tooltip = false");
  expect(addon.eval("return __line(2)"), "switched off").toBe(false);
  const bare = loggedIn("__tt = {} function __tt:AddLine(t) self.lines[#self.lines + 1] = t end");
  expect(bare.eval('__tt.lines = {} ns.GetModule("Upgrades").AddLine(__tt, "item:2") return #__tt.lines'), "a client without item stats: no line").toBe(0);
});

it("upgrades: the role picks the weights, and /vg weights shows and changes them", () => {
  const addon = loggedIn(GEAR_ENV);
  addon.slash("weights");
  expect(chatHas(addon, /Weights for strength \(role damage\): AGI 0\.6, AP 0\.5, ARMOR 0\.01, ARP 0\.4, CRIT 0\.8, DPS 2\.5, EXP 0\.7, HASTE 0\.6, HIT 0\.9, STA 0\.2, STR 1/), "the kind, the role and every weight").toBe(true);
  addon.slash("weights set str 2");
  expect([chatHas(addon, /STR is worth 2 for strength now\./), addon.eval("return (ns.GetModule('Upgrades').Current()).STR")], "one weight changed, and used").toEqual([true, 2]);
  addon.slash("weights set luck 1");
  expect(chatHas(addon, /Use \/vg weights set <stat> <number>; stats: AGI, AP, ARMOR, ARP, BLOCK, BLOCKVALUE, CRIT, DEF, DODGE, DPS, EXP, HASTE, HIT, INT, MP5, PARRY, RAP, SP, SPI, STA, STR\./), "an unknown stat lists the ones there are").toBe(true);
  addon.slash("weights reset");
  expect([chatHas(addon, /back to the defaults/), addon.eval("return (ns.GetModule('Upgrades').Current()).STR")], "reset").toEqual([true, 1]);
  addon.eval("__wfgWorld.units.player.role = 'TANK'");
  addon.fire("PLAYER_ROLES_ASSIGNED");
  expect(addon.eval("local UP = ns.GetModule('Upgrades') return { select(2, UP.Current()), UP.Role() }"), "a tank role: the tank weights").toEqual(["tank", "tank"]);
  addon.eval("__wfgWorld.units.player.role = __wfgWorld.secret('TANK')");
  expect(addon.eval("return ns.GetModule('Upgrades').Role()"), "a hidden group role counts as none: damage").toBe("damage");
  addon.eval("ns.GetModule('Upgrades').settings.role = 'healer' ns.GetModule('Upgrades').Changed()");
  expect(addon.eval("return select(2, ns.GetModule('Upgrades').Current())"), "a role the class doesn't have: its damage weights").toBe("strength");
  expect(addon.eval("local W = ns.UpgradeWeights return { W.Kind('DRUID', 'healer'), W.Kind('TEST-ONLY', 'tank') }"), "a druid healer; a class not listed").toEqual(["healer", "caster"]);
  const off = loggedIn(GEAR_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Upgrades = false } } }" });
  expect(off.eval("local UP = ns.GetModule('Upgrades') UP.Changed() UP.MarkBag({}) return UP.current == nil"), "switched off: the role switch and a bag without items do nothing").toBe(true);
});

it("upgrades: weights go out and come back as a string", () => {
  const addon = loggedIn(GEAR_ENV);
  addon.slash("weights set hit 3");
  addon.slash("weights export");
  const text = addon.eval("return Vanguard_TextEdit:GetText()");
  expect(/^VG1:weights:/.test(text), "export shows a weights string").toBe(true);
  addon.slash("weights reset");
  addon.slash("weights import");
  addon.eval(`Vanguard_TextEdit:SetText(${JSON.stringify(text)}) Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
  expect([chatHas(addon, /Imported weights for strength\./), addon.eval("return (ns.GetModule('Upgrades').Current()).HIT")], "import puts them back").toEqual([true, 3]);
  // UP.Import of a Lua string expression: { ok, why }.
  const bad = (lua) => addon.eval(`local ok, why = ns.GetModule("Upgrades").Import(${lua}) return { ok, why }`);
  expect(bad('"garbage"'), "not a string at all").toEqual([false, "not a Vanguard profile string"]);
  expect(bad('ns.Serialize.Encode("profile", {})'), "a profile string").toEqual([false, "not a weights string"]);
  expect(bad('ns.Serialize.Encode("weights", { kind = "strength", weights = { STR = 4, LUCK = 9, HIT = "x" } })'), "unknown stats and non-numbers are dropped").toEqual([true, "strength"]);
  expect(addon.eval("local c = ns.GetModule('Upgrades').Current() return { str = c.STR, noLuck = c.LUCK == nil, hit = c.HIT }"), "only STR came through").toEqual({ str: 4, noLuck: true, hit: 0.9 });
  addon.slash("weights import");
  addon.eval('Vanguard_TextEdit:SetText("garbage") Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)');
  expect(chatHas(addon, /Import failed: not a Vanguard profile string\./), "a failed paste says why").toBe(true);
});

it("upgrades: the weights wizard has a slider for every stat, and saves only on Save", () => {
  const addon = loggedIn(GEAR_ENV);
  // Runs Lua in the client.
  const lua = (code) => addon.eval(code);
  // Clicks the button the Lua expression names.
  const click = (expr) => lua(`local b = ${expr} b:GetScript("OnClick")(b)`);
  // The strength weight in use.
  const stat = () => lua("return (ns.GetModule('Upgrades').Current()).STR");
  addon.slash("weights set hit 1.5");
  addon.slash("weights wizard");
  expect(lua("return { Vanguard_WeightsWizard:IsShown(), Vanguard_WeightsWizard.caption:GetText() }"), "it opens and says who the weights are for").toEqual([true, "Weights for strength (role damage). The Weigh stats for choice under Gear upgrades picks the role; 0 makes a stat worthless."]);
  // Each slider as "label weight", in order.
  const rows = () => lua("local out = {} for _, r in ipairs(Vanguard_WeightsWizard.rows) do out[#out + 1] = r.label:GetText() .. ' ' .. r.get() end return out");
  const opened = rows();
  expect(opened.length, "a slider for every stat").toBe(21);
  expect(opened.slice(0, 4), "what the kind values first, starting from this profile's weights").toEqual(["Weapon damage per second 2.5", "Strength 1", "Hit rating 1.5", "Crit rating 0.8"]);
  expect(opened.slice(-2), "then the stats it doesn't, by name").toEqual(["Spell power 0", "Spirit 0"]);
  const wizard = "Vanguard_WeightsWizard";
  expect(titleOf(addon, wizard), "a window title: the title role in the text colour, T.SPACE.pad in, on the close button's line").toEqual({ size: titleSize(addon), text: true, left: 16, mid: -24 });
  expect(closeOf(addon, wizard), "with the X where every window has it").toEqual([px(addon, 24), px(addon, 24), true]);
  expect([escapes(addon, wizard), alphaOf(addon, wizard)], "Escape closes it; the dialog alpha").toEqual([true, 0.98]);
  const caption = addon.frame(`${wizard}.caption`);
  expect([caption.font.size, isTok(addon, caption.textColor, "muted"), insets(addon, `${wizard}.caption`, wizard).slice(0, 2)], "the caption is a note: small muted, T.SPACE.pad in, under the head").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true, [16, 40]]);
  expect(insets(addon, `${wizard}.view`, wizard), "the list is T.SPACE.pad in, a gap (8) under the caption, a thumb's gutter (12) more on the right, over the foot (50)").toEqual([16, 40 + lua(`return ${wizard}.caption:GetHeight()`) + 8, 28, 50]);
  expect(lua(`local r = ${wizard}.rows[1] return { r:GetWidth(), r:GetHeight(), r.box:GetWidth(), r.box:GetHeight(), r.box:GetLeft() - r:GetRight(), ${wizard}.view:GetRight() - r.box:GetRight() }`), "a stat's slider (348) and its box (60 by 20, a gap of 8 on) fill the list's width (416)").toEqual([348, 28, 60, 20, 8, 0]);
  expect(thumbOf(addon, `${wizard}.view`, wizard), "21 stats are more than fit: the thumb shows, in the right pad").toEqual([true, true, 16]);
  lua(`${wizard}.view:Fit(100)`);
  expect(thumbOf(addon, `${wizard}.view`, wizard)[0], "a list that fits has no thumb").toBe(false);
  expect([buttonOf(addon, `${wizard}.save`), buttonOf(addon, `${wizard}.cancel`), buttonOf(addon, `${wizard}.defaults`)], "Save is the one accent button; Cancel and Defaults are plain; all standalone, 120 wide").toEqual([[true, "Save", 26, 120], [false, "Cancel", 26, 120], [false, "Defaults", 26, 120]]);
  expect(insets(addon, `${wizard}.save`, wizard).slice(2), "Save a pad from the corner").toEqual([16, 16]);
  addon.click(`${wizard}.chrome.close`);
  expect(lua(`return ${wizard}:IsShown()`), "the X closes it").toBe(false);
  addon.slash("weights wizard");
  pressEscape(addon);
  expect([lua(`return ${wizard}:IsShown()`), stat()], "so does Escape, and nothing is saved").toEqual([false, 1]);
  addon.slash("weights wizard");
  lua("Vanguard_WeightsWizard.rows[2].set(2) Vanguard_WeightsWizard.rows[21].set(0.5)");
  expect(stat(), "nothing is saved before Save").toBe(1);
  click("Vanguard_WeightsWizard.cancel");
  expect([lua("return Vanguard_WeightsWizard:IsShown()"), stat()], "Cancel changes nothing").toEqual([false, 1]);
  addon.slash("weights wizard");
  lua("Vanguard_WeightsWizard.rows[2].set(2)");
  click("Vanguard_WeightsWizard.defaults");
  expect(rows().slice(1, 3), "Defaults put the kind's defaults back").toEqual(["Strength 1", "Hit rating 0.9"]);
  lua("Vanguard_WeightsWizard.rows[2].set(2) Vanguard_WeightsWizard.rows[21].set(0.5)");
  lua("local r = Vanguard_WeightsWizard.rows[3] r.box:SetText('4.25') r.box:GetScript('OnEnterPressed')(r.box)");
  lua("local r = Vanguard_WeightsWizard.rows[4] r.box:SetText('lots') r.box:GetScript('OnEditFocusLost')(r.box)");
  expect(lua("local f = Vanguard_WeightsWizard return { f.rows[3].get(), f.rows[3].box:GetText(), f.rows[4].box:GetText() }"), "a box takes an exact weight past the slider's end; anything else puts it back").toEqual([4.25, "4.25", "0.8"]);
  click("Vanguard_WeightsWizard.save");
  expect([lua("return Vanguard_WeightsWizard:IsShown()"), stat(), chatHas(addon, /Stat weights saved for strength \(role damage\)\./)], "Save keeps the change and closes").toEqual([false, 2, true]);
  expect(lua("return ns.GetModule('Upgrades').settings.weights.strength"), "only what differs from the defaults is kept").toEqual({ STR: 2, SPI: 0.5, HIT: 4.25 });
  addon.slash("weights wizard");
  click("Vanguard_WeightsWizard.defaults");
  click("Vanguard_WeightsWizard.save");
  expect(lua("return ns.GetModule('Upgrades').settings.weights.strength == nil"), "saving the defaults keeps nothing").toBe(true);
});

it("upgrades: the wizard names every stat, and says when Gear upgrades is off", () => {
  const addon = loggedIn(GEAR_ENV);
  expect(addon.eval("local missing = {} for short in pairs(ns.UpgradeWeights.STATS) do if not ns.GetModule('Upgrades').Wizard.LABELS[short] then missing[#missing + 1] = short end end return missing"), "every stat has a name").toEqual({});
  const off = loggedIn(GEAR_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Upgrades = false } } }" });
  off.slash("weights wizard");
  expect(chatHas(off, /Gear upgrades is switched off/), "with the module off it says so").toBe(true);
  off.clearChat();
  off.slash("weights");
  expect(chatHas(off, /Gear upgrades is switched off/), "and so does /vg weights").toBe(true);
});

// TEST-ONLY combined bag holding better bracers (2) and worse ones (3), and a slot that isn't a bag button.
const BAG_ENV = `
  local f = CreateFrame("Frame", "ContainerFrameCombinedBags", UIParent)
  __buttons = {}
  for slot = 1, 2 do local b = CreateFrame("Button", nil, f) b.GetBagID = function() return 0 end b.GetID = function() return slot end __buttons[slot] = b end
  __buttons[3] = CreateFrame("Button", nil, f)
  function f:EnumerateValidItems() return ipairs(__buttons) end
  function f:UpdateItems() end
  __wfgWorld.bags[0] = { [1] = { itemID = 2, link = __link(2) }, [2] = { itemID = 3, link = __link(3) } }
`;

it("upgrades: arrows on upgrades in the combined bag and on quest rewards", () => {
  const addon = loggedIn(GEAR_ENV + BAG_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Bags = false } } }" });
  // Whether each of the three bag buttons shows its arrow.
  const arrows = () => addon.eval("local out = {} for i = 1, 3 do local a = ns.FrameState('vgUpgrade')[__buttons[i]] out[i] = a ~= nil and a:IsShown() end return out");
  addon.eval("ContainerFrameCombinedBags:UpdateItems()");
  expect(arrows(), "the better bracers only").toEqual([true, false, false]);
  addon.eval("__worn[9] = __link(2)");
  addon.fire("PLAYER_EQUIPMENT_CHANGED", 9);
  expect(arrows(), "wearing them now: no arrow").toEqual([false, false, false]);
  addon.eval("__worn[9] = nil ContainerFrameCombinedBags:Hide()");
  addon.fire("PLAYER_EQUIPMENT_CHANGED", 9);
  expect(arrows(), "a closed bag isn't marked until it updates").toEqual([false, false, false]);
  addon.eval("ns.GetModule('Upgrades').settings.bags = false ContainerFrameCombinedBags:UpdateItems()");
  expect(arrows(), "switched off").toEqual([false, false, false]);
  // Paints a reward card for a link (a Lua expression); whether its arrow shows.
  const card = (link) => addon.eval(`local QP = ns.QuestParts local c = __card or QP.Card(UIParent) __card = c
    QP.PaintCard(c, { name = "TEST-ONLY Reward", texture = 1, count = 1, quality = 2, link = ${link} }) return ns.FrameState('vgUpgrade')[c] ~= nil and ns.FrameState('vgUpgrade')[c]:IsShown()`);
  expect([card("__link(2)"), card("nil")], "a reward that's an upgrade gets the arrow; one with no link doesn't").toEqual([true, false]);
  addon.eval("ns.GetModule('Upgrades').settings.quests = false");
  expect(card("__link(2)"), "switched off").toBe(false);
});
