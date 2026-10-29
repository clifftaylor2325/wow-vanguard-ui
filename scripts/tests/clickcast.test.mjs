// clickcast: the spell catalog, binding records and the no-typing options page,
// in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, GAME_CLICKS_LUA, GAME_ENGINE_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";

const CS = "ns.ClickCastSpells";
const CC = 'ns.GetModule("ClickCast")';

// A priest's spellbook: ranks, a passive, an off-spec entry and a damage spell.
const PRIEST = [
  [2061, { name: "Flash Heal", rank: 1, helpful: true, icon: "Interface\\Icons\\TEST-ONLY-FH" }],
  [9472, { name: "Flash Heal", rank: 2, helpful: true, icon: "Interface\\Icons\\TEST-ONLY-FH2" }],
  [139, { name: "Renew", rank: 1, helpful: true }],
  [17, { name: "Power Word: Shield", rank: 1, helpful: true }],
  [527, { name: "Dispel Magic", rank: 1, helpful: true }],
  [1243, { name: "Power Word: Fortitude", rank: 1, helpful: true }],
  [2006, { name: "Resurrection", rank: 1, helpful: true }],
  [585, { name: "Smite", rank: 1, helpful: false }],
  [15270, { name: "Spirit Tap", passive: true, helpful: false }],
  [2651, { name: "Elune's Grace", offSpec: true, helpful: true }],
  [2050, { name: "Lesser Heal", rank: 1, helpful: true }],
  [2054, { name: "Heal", rank: 1, helpful: true }],
  [2060, { name: "Greater Heal", rank: 1, helpful: true }],
  [528, { name: "Cure Disease", rank: 1, helpful: true }],
];

// A logged-in priest with the spellbook above, on the click-casting page when asked.
function priest(extra = "", opts = {}) {
  const addon = loggedIn(CLICK_LUA + extra, opts);
  addon.eval('__wfgWorld.units.player.class = "PRIEST" __wfgWorld.units.player.className = "Priest"');
  for (const [id, fields] of PRIEST) addon.world.learn(id, fields);
  return addon;
}

// The first widget passing a Lua predicate on `w`, as its id.
const widget = (addon, predicate) => addon.frames(predicate)[0]?.id;

// The grid cell for a binding key.
const cell = (addon, key) => widget(addon, `w.key == "${key}" and w.iconFrame ~= nil and w.empty ~= nil`);

// The visible picker row whose text reads exactly `text`.
const pickerRow = (addon, text) => widget(addon, `w.item ~= nil and w.chevron ~= nil and w:IsShown() and w.text.__text == "${text}"`);

// A picker row's rank chevron.
const chevron = (addon, row) => widget(addon, `w.__parent == __wfgStub.frames[${row}] and w.text ~= nil and type(w.text.__text) == "string" and w.text.__text:sub(1, 5) == "Ranks"`);

// The text dialog's primary button (Bind or Import), clicked.
const confirm = (addon) => addon.eval('local f = Vanguard_TextDialog f.primary:GetScript("OnClick")(f.primary)');

// The texts drawn inside a widget, as a list.
const textsIn = (addon, id) => addon.eval(`local out = {} for _, c in ipairs(__wfgStub.frames) do if c.__parent == __wfgStub.frames[${id}] and type(c.__text) == "string" and c:IsShown() then out[#out + 1] = c.__text end end return out`);

// Saved variables with click casting on the unit frames too, so bindings have frames to land on.
const WITH_FRAMES = "VanguardDB = { profiles = { Default = { ClickCast = { unitFrames = true } } } }";

// The current spec's bindings as { key: "action:value:spellID:rank" }.
const bindings = (addon) => addon.eval(`local out = {} for _, b in ipairs(${CC}.Bindings()) do out[b.key] = b.action .. ":" .. tostring(b.value) .. ":" .. tostring(b.spellID) .. ":" .. tostring(b.rank) end return out`);

it("the spell catalog folds ranks and sorts the spellbook into healer groups", () => {
  const addon = priest();
  const fh = addon.eval(`local s = ${CS}.Spell("Flash Heal") return { id = s.spellID, max = s.maxRank, ranks = #s.ranks, first = s.ranks[1].rank, icon = s.icon }`);
  expect(fh).toMatchObject({ id: 9472, max: 2, ranks: 2, first: 1, icon: "Interface\\Icons\\TEST-ONLY-FH2" });
  const groups = addon.eval(`local g, out = ${CS}.Groups(), {} for name, list in pairs(g) do out[name] = {} for i, s in ipairs(list) do out[name][i] = s.name end end return out`);
  expect(groups.heals).toEqual(["Flash Heal", "Renew", "Lesser Heal", "Heal", "Greater Heal"]);
  expect(groups.cleanse).toEqual(["Power Word: Shield", "Dispel Magic", "Cure Disease"]);
  expect(groups.buffs).toEqual(["Power Word: Fortitude"]);
  expect(groups.other).toEqual(["Resurrection"]);
  expect(addon.eval(`return ${CS}.Spell("Spirit Tap") == nil and ${CS}.Spell("Elune's Grace") == nil`), "passives and off-spec entries are not listed").toBe(true);
  addon.eval("C_Spell.IsSpellHelpful = nil");
  expect(addon.eval(`local out = {} for i, s in ipairs(${CS}.Groups().other) do out[i] = s.name end return out`), "without IsSpellHelpful the class table alone decides, and the rest is Other").toEqual(["Resurrection", "Smite"]);
  const layout = addon.eval(`local l, out = ${CS}.Layout(), {} for k, b in pairs(l) do out[k] = b.action .. ":" .. tostring(b.value) end return out`);
  expect(layout).toMatchObject({ BUTTON1: "target:nil", BUTTON2: "menu:nil", BUTTON3: "spell:Flash Heal", "alt-BUTTON2": "spell:Resurrection" });
  expect(addon.eval(`return ${CS}.HasLayout(), ${CS}.ClassName()`)).toBe(true);
  expect(addon.eval(`return ${CS}.ClassName()`)).toBe("Priest");
  addon.world.learn(596, { name: "Prayer of Healing", rank: 1, helpful: true });
  expect(addon.eval(`return #${CS}.Groups().heals`), "learning a spell rebuilds the catalog").toBe(6);
  addon.eval('C_SpellBook.GetNumSpellBookSkillLines = function() return 2 end');
  addon.fire("LEARNED_SPELL_IN_SKILL_LINE");
  expect(addon.eval(`return #${CS}.Catalog().spells`), "a skill line the client won't describe is skipped").toBe(12);
  addon.eval("C_Spell.GetSpellInfo = nil");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(addon.eval(`return #${CS}.Catalog().spells`), "without spell details nothing is listed").toBe(0);
  addon.eval("C_SpellBook = nil");
  addon.fire("SPELLS_CHANGED");
  expect(addon.eval(`return #${CS}.Catalog().spells, ${CS}.HasLayout()`), "without the spellbook API the catalog is empty").toBe(0);
  addon.eval('__wfgWorld.units.player.class = "WARRIOR" UnitClass = nil');
  expect(addon.eval(`return ${CS}.HasLayout()`)).toBe(false);
  expect(addon.eval(`return ${CS}.ClassName()`), "without UnitClass the button still has a name").toBe("Class");
  addon.eval('UnitClass = function() return nil, 42 end');
  expect(addon.eval(`return ${CS}.PlayerClass()`), "a non-string class token is ignored").toBe(null);
});

// TEST-ONLY: the priest's spellbook on a German client (names faked; only their being different matters).
const PRIEST_DE = [
  [2061, { name: "Blitzheilung", rank: 1, helpful: true }], [139, { name: "Erneuerung", rank: 1, helpful: true }],
  [17, { name: "Machtwort: Schild", rank: 1, helpful: true }], [527, { name: "Magiebannung", rank: 1, helpful: true }],
  [1243, { name: "Machtwort: Seelenstärke", rank: 1, helpful: true }], [2006, { name: "Auferstehung", rank: 1, helpful: true }],
  [2060, { name: "Große Heilung", rank: 1, helpful: true }], [528, { name: "Krankheit heilen", rank: 1, helpful: true }],
  [585, { name: "Göttliche Pein", rank: 1, helpful: false }],
];

it("on a German client the groups and the starter layout find the spells by id, under the client's names", () => {
  const addon = loggedIn(CLICK_LUA + '__wfgWorld.locale = "deDE"');
  addon.eval('__wfgWorld.units.player.class = "PRIEST" __wfgWorld.units.player.className = "Priester"');
  for (const [id, fields] of PRIEST_DE) addon.world.learn(id, fields);
  const groups = addon.eval(`local g, out = ${CS}.Groups(), {} for name, list in pairs(g) do out[name] = {} for i, s in ipairs(list) do out[name][i] = s.name end end return out`);
  expect(groups.heals, "the heals by their German names").toEqual(["Blitzheilung", "Erneuerung", "Große Heilung"]);
  expect(groups.cleanse).toEqual(["Machtwort: Schild", "Magiebannung", "Krankheit heilen"]);
  expect(groups.buffs).toEqual(["Machtwort: Seelenstärke"]);
  expect(groups.other, "Resurrection is in no class group; the damage spell is left out").toEqual(["Auferstehung"]);
  const layout = addon.eval(`local l, out = ${CS}.Layout(), {} for k, b in pairs(l) do out[k] = b.action .. ":" .. tostring(b.value) end return out`);
  expect(layout, "the layout binds the German names").toMatchObject({ BUTTON3: "spell:Blitzheilung", "shift-BUTTON1": "spell:Große Heilung", "alt-BUTTON2": "spell:Auferstehung" });
  expect(addon.eval(`return ${CS}.ClassName()`), "the button names the class as the client does").toBe("Priester");
  addon.eval(`${CC}.ApplyLayout(${CS}.Layout())`);
  expect(bindings(addon).BUTTON3, "applied, it binds the spell's German name and its id").toBe("spell:Blitzheilung:2061:nil");
});

it("a name-bound spell made in another client language casts by the name this client gives its id", () => {
  const addon = priest("__wfgWorld.spec = 1", {
    // TEST-ONLY saved bindings made on an English client: Renew by its English name and id.
    savedVariables: WITH_FRAMES + ' VanguardCharDB = { clickcast = { [1] = { { key = "shift-BUTTON2", action = "spell", value = "Renew", spellID = 139 } } } }',
  });
  // The shift-right-click spell attribute on the first click-cast frame.
  const attr = () => addon.eval(`return ${CC}.frames[1]:GetAttribute("shift-spell2")`);
  expect(attr(), "a name the client knows stays as saved").toBe("Renew");
  addon.eval(`__wfgWorld.spells[139].name = "Erneuerung" ${CC}.ApplyAll()`);
  expect(attr(), "the German client gets its own name for the id").toBe("Erneuerung");
  expect(bindings(addon)["shift-BUTTON2"], "the saved name is left as it was").toBe("spell:Renew:139:nil");
});

it("a layout spell the client can't name is left out, not bound under an English name", () => {
  const addon = priest();
  addon.eval("__wfgWorld.spells[2061] = nil");
  const layout = addon.eval(`local l, out = ${CS}.Layout(), {} for k, b in pairs(l) do out[k] = b.action .. ":" .. tostring(b.value) end return out`);
  expect([layout.BUTTON3, layout["alt-BUTTON2"]], "Flash Heal unknown: no middle-click binding; the rest stay").toEqual([undefined, "spell:Resurrection"]);
});

it("ns.SpellName: the client's name for an id through C_Spell, else the old global; nil when hidden or unknown", () => {
  const addon = priest();
  // Runs setup, then asks for Renew's name.
  const name = (setup) => addon.eval(`${setup} return ns.SpellName(139)`);
  expect(name(""), "through C_Spell").toBe("Renew");
  expect(name("C_Spell.GetSpellName = function() return __wfgWorld.secret('Renew') end"), "a hidden name is no name").toBe(null);
  expect(name("C_Spell.GetSpellName = nil"), "the old global without C_Spell's call").toBe("Renew");
  expect(name("GetSpellInfo = function() return __wfgWorld.secret('Renew') end"), "a hidden name from the old global is none either").toBe(null);
  expect(name("GetSpellInfo = nil"), "a client with neither").toBe(null);
  expect(addon.eval("C_Spell = nil return ns.SpellNames({ 139, 2061 })"), "the list form leaves out what the client can't name").toEqual({});
});

it("the spell catalog listens for new spells by an event Forever has, so login reports no error", () => {
  const addon = priest();
  expect(addon.eval('local out = "" for _, e in ipairs(ns.errors) do out = out .. e.text .. ";" end return out'), "no 'not on this client' report at login").toBe("");
  expect(addon.eval(`return #${CS}.Catalog().spells`)).toBe(11);
  addon.eval('C_SpellBook.GetNumSpellBookSkillLines = function() return 0 end');
  addon.fire("LEARNED_SPELL_IN_SKILL_LINE");
  expect(addon.eval(`return #${CS}.Catalog().spells`), "a spell learned into a skill line rebuilds the catalog").toBe(0);
});

it("bindings carry spell ids and ranks, move, copy, export and import", () => {
  const addon = priest("__wfgWorld.spec = 1", {
    // TEST-ONLY saved bindings from an older version: a spell by name only; click casting on the unit frames too.
    savedVariables: WITH_FRAMES + ' VanguardCharDB = { clickcast = { [1] = { { key = "BUTTON4", action = "spell", value = "Renew" } } } }',
  });
  expect(bindings(addon).BUTTON4, "an old name-only binding gets its spell id once").toBe("spell:Renew:139:nil");
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "Flash Heal", 2061, 1) ${CC}.Add("shift-BUTTON1", "spell", "Flash Heal", 9472) ${CC}.Add("BUTTON5", "focus") ${CC}.Add("SHIFT-Q", "assist")`);
  // An attribute expression read off the first click-cast frame (f).
  const attrs = (lua) => addon.eval(`local f = ${CC}.frames[1] return ${lua}`);
  expect(attrs('f:GetAttribute("ctrl-spell2")'), "a picked rank casts by its spell id").toBe(2061);
  expect(attrs('f:GetAttribute("shift-spell1")'), "no rank casts by name, so a new rank applies by itself").toBe("Flash Heal");
  expect(attrs('f:GetAttribute("type5") .. "/" .. f:GetAttribute("*type-vg5")'), "hover keys use the * prefix so modified presses find them").toBe("focus/assist");
  expect(addon.eval(`return ${CC}.ActionText(${CC}.Binding("ctrl-BUTTON2")) .. "|" .. ${CC}.ActionText(${CC}.Binding("BUTTON5")) .. "|" .. ${CC}.ActionText(${CC}.Binding("SHIFT-Q"))`)).toBe("Flash Heal (Rank 1)|Focus|Assist");
  addon.eval(`${CC}.CopyToSpec(2)`);
  expect(addon.eval(`return #${CC}.Bindings(2), ${CC}.Bindings(2)[1].key`)).toBe(5);
  const text = addon.eval(`return ${CC}.Export()`);
  expect(/^VG1:clickcast:/.test(text)).toBe(true);
  addon.eval(`${CC}.Clear()`);
  expect(addon.eval(`return #${CC}.Bindings(), ${CC}.frames[1]:GetAttribute("type5")`)).toBe(0);
  expect(addon.eval(`return ${CC}.Import(${JSON.stringify(text)})`), "importing brings them back").toBe(5);
  expect(bindings(addon)["ctrl-BUTTON2"]).toBe("spell:Flash Heal:2061:1");
  expect(addon.eval(`local n, err = ${CC}.Import("garbage") return err`)).toBe("not a Vanguard profile string");
  expect(addon.eval(`local n, err = ${CC}.Import(ns.Serialize.Encode("profile", { a = 1 })) return err`)).toBe("not a click-casting string");
  const odd = addon.eval(`return ns.Serialize.Encode("clickcast", { bindings = { { key = 1 }, { key = "BUTTON4", action = "target" } } })`);
  expect(addon.eval(`return ${CC}.Import(${JSON.stringify(odd)})`), "malformed entries are skipped").toBe(1);
  addon.eval(`${CC}.ApplyLayout(${CS}.Layout())`);
  expect(bindings(addon)).toMatchObject({ BUTTON1: "target:nil:nil:nil", BUTTON2: "menu:nil:nil:nil", "alt-BUTTON2": "spell:Resurrection:2006:nil" });
  expect(bindings(addon).BUTTON3.startsWith("spell:Flash Heal:"), "the layout's spells bind by name").toBe(true);
  addon.eval('__wfgWorld.bindings.TOGGLEGAMEMENU = { "ESCAPE" }');
  expect(addon.eval(`return ${CC}.Collision("1") .. "|" .. tostring(${CC}.Collision("SHIFT-Q")) .. "|" .. ${CC}.Collision("ESCAPE") .. "|" .. tostring(${CC}.Collision("ctrl-BUTTON2"))`)).toBe("Action bar 1 slot 1|nil|togglegamemenu|nil");
  addon.eval('__wfgWorld.bindings.MULTIACTIONBAR1BUTTON2 = { "F" }');
  expect(addon.eval(`return ${CC}.Collision("F")`)).toBe("Action bar 2 slot 2");
  addon.eval("GetBindingAction = nil");
  expect(addon.eval(`return ${CC}.Collision("1")`)).toBe(null);
  addon.eval("C_Spell.GetSpellInfo = nil");
  addon.eval(`${CC}.Add("BUTTON4", "spell", "Renew")`);
  expect(bindings(addon).BUTTON4, "the old GetSpellInfo global also answers ids").toBe("spell:Renew:139:nil");
  expect(addon.eval(`local ok, err = ${CC}.Add("BUTTON4", "spell", "") return err`)).toBe("pick a spell");
});

it("a fight closes the spell picker, so it can't hold the keyboard through combat", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.click(cell(addon, "ctrl-BUTTON2"));
  expect(addon.frame("Vanguard_SpellPicker").visible, "open before the fight").toBe(true);
  addon.world.combat(true);
  expect(addon.frame("Vanguard_SpellPicker").visible, "closed as the fight starts").toBe(false);
  expect(addon.eval("return Vanguard_SpellPicker.catcher:IsShown()"), "and its click catcher").toBe(false);
});

it("the grid picks spells from the spellbook, with ranks, drops and clears", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.frames("w.key ~= nil and w.iconFrame ~= nil and w.empty ~= nil").length, "five mouse buttons by four modifiers").toBe(20);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  expect(addon.frame("Vanguard_SpellPicker").visible, "clicking a cell opens the picker").toBe(true);
  expect(addon.texts("HEALS").length === 1 && addon.texts("ACTIONS").length === 0, "groups are headed; the actions are further down").toBe(true);
  addon.eval("Vanguard_SpellPicker.SetPropagateKeyboardInput = function(self, v) self.__passed = v end");
  addon.eval('Vanguard_SpellPicker.__scripts.OnKeyDown(Vanguard_SpellPicker, "A")');
  expect(addon.frame("Vanguard_SpellPicker").visible && addon.eval("return Vanguard_SpellPicker.__passed"), "other keys pass through").toBe(true);
  addon.eval("Vanguard_SpellPicker.__passed = nil");
  addon.world.combat(true);
  addon.eval('Vanguard_SpellPicker.__scripts.OnKeyDown(Vanguard_SpellPicker, "A")');
  expect(addon.eval("return Vanguard_SpellPicker.__passed"), "in combat the picker never calls the protected key pass-through").toBe(null);
  addon.world.combat(false);
  addon.eval('Vanguard_SpellPicker.__scripts.OnKeyDown(Vanguard_SpellPicker, "ESCAPE")');
  expect(addon.frame("Vanguard_SpellPicker").visible, "Escape closes the picker").toBe(false);
  expect(addon.eval("return Vanguard_SpellPicker.catcher:IsShown()"), "and its click catcher").toBe(false);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  expect(addon.eval("return Vanguard_SpellPicker.catcher:IsShown()"), "an open picker has a catcher behind it").toBe(true);
  expect(addon.eval("return Vanguard_SpellPicker:GetParent() == UIParent"), "the picker is not reparented under its anchor (the game could move it below the catcher)").toBe(true);
  addon.eval("Vanguard_SpellPicker.catcher.__scripts.OnClick(Vanguard_SpellPicker.catcher)");
  expect(addon.frame("Vanguard_SpellPicker").visible, "clicking outside closes it").toBe(false);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.eval(`local c = __wfgStub.frames[${cell(addon, "ctrl-BUTTON2")}] c:Hide() c:Show()`);
  expect(addon.frame("Vanguard_SpellPicker").visible, "the picker goes when its anchor hides (page or window closed)").toBe(false);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.click(pickerRow(addon, "Flash Heal"));
  expect(bindings(addon)["ctrl-BUTTON2"], "picking a spell binds its highest rank by name").toBe("spell:Flash Heal:9472:nil");
  expect(addon.frame("Vanguard_SpellPicker").visible).toBe(false);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.click(chevron(addon, pickerRow(addon, "Flash Heal")));
  expect(addon.texts("Rank 1").length, "the chevron opens the ranks").toBe(1);
  addon.click(pickerRow(addon, "Rank 1"));
  expect(bindings(addon)["ctrl-BUTTON2"], "a rank binds by its own id").toBe("spell:Flash Heal:2061:1");
  expect(textsIn(addon, cell(addon, "ctrl-BUTTON2")), "the cell shows the spell and rank").toContain("Flash Heal (Rank 1)");
  addon.click(cell(addon, "ctrl-BUTTON2"), "RightButton");
  expect(bindings(addon)["ctrl-BUTTON2"], "right-click clears the cell").toBe(undefined);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.click(chevron(addon, pickerRow(addon, "Flash Heal")));
  expect(addon.texts("Rank 1").length, "the chevron closes them again").toBe(0);
  addon.type("Vanguard_SpellPicker.search", "ren");
  expect(addon.texts("Flash Heal").length === 0 && pickerRow(addon, "Renew") !== undefined, "the search narrows the list").toBe(true);
  addon.type("Vanguard_SpellPicker.search", "");
  addon.wheel("Vanguard_SpellPicker", -1);
  expect(addon.eval("return Vanguard_SpellPicker.offset"), "the wheel scrolls the list").toBe(3);
  expect(addon.texts("scroll for more").length).toBe(1);
  addon.wheel("Vanguard_SpellPicker", 5);
  expect(addon.eval("return Vanguard_SpellPicker.offset"), "and stops at the top").toBe(0);
  addon.click(widget(addon, 'w.item ~= nil and w.chevron ~= nil and w:IsShown() and w.item.header ~= nil'));
  expect(addon.frame("Vanguard_SpellPicker").visible, "a header does nothing").toBe(true);
  addon.hover(pickerRow(addon, "Renew"));
  expect(addon.eval("return GameTooltip.__spellId"), "hovering a spell shows its tooltip").toBe(139);
  addon.hover(widget(addon, 'w.item ~= nil and w.chevron ~= nil and w:IsShown() and w.item.header ~= nil'));
  addon.hover(null);
  addon.eval('__wfgWorld.cursor = { type = "spell", id = 139 }');
  addon.click(cell(addon, "alt-BUTTON1"));
  expect(bindings(addon)["alt-BUTTON1"], "a spell dropped on a cell binds it").toBe("spell:Renew:139:nil");
  expect(addon.eval("return __wfgWorld.cursor")).toBe(null);
  addon.eval('__wfgWorld.cursor = { type = "spell", id = 2061 }');
  addon.click(cell(addon, "ctrl-BUTTON1"));
  expect(bindings(addon)["ctrl-BUTTON1"], "a lower rank dropped on a cell binds that rank").toBe("spell:Flash Heal:2061:1");
  expect(addon.eval(`return ${CC}.Binding("ctrl-BUTTON1").rank and 1`), "and casts by its id").toBe(1);
  addon.eval('__wfgWorld.cursor = { type = "spell", id = 9472 }');
  addon.click(cell(addon, "ctrl-BUTTON1"));
  expect(bindings(addon)["ctrl-BUTTON1"], "the top rank still binds by name").toBe("spell:Flash Heal:9472:nil");
  addon.eval('__wfgWorld.cursor = { type = "item", id = 1 }');
  addon.eval(`local c = __wfgStub.frames[${cell(addon, "alt-BUTTON2")}] c:GetScript("OnReceiveDrag")(c)`);
  expect(bindings(addon)["alt-BUTTON2"], "an item on the cursor isn't a spell").toBe(undefined);
  addon.eval('__wfgWorld.cursor = { type = "spell", id = 99999 }');
  addon.click(cell(addon, "alt-BUTTON2"));
  expect(bindings(addon)["alt-BUTTON2"], "an unknown spell on the cursor is ignored").toBe(undefined);
  addon.eval("__wfgWorld.cursor = nil GameTooltip.__spellId = nil");
  addon.hover(cell(addon, "alt-BUTTON1"));
  expect(addon.eval("return GameTooltip.__spellId"), "hovering a cell shows its spell").toBe(139);
  addon.hover(null);
  addon.eval("GameTooltip.SetSpellByID = nil");
  addon.hover(cell(addon, "alt-BUTTON1"));
  addon.hover(null);
});

it("the picker's actions, macros and typed names; the extra modifier columns", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.click(cell(addon, "shift-BUTTON2"));
  addon.wheel("Vanguard_SpellPicker", -9);
  addon.click(pickerRow(addon, "Target"));
  expect(bindings(addon)["shift-BUTTON2"]).toBe("target:nil:nil:nil");
  addon.click(cell(addon, "shift-BUTTON2"));
  addon.wheel("Vanguard_SpellPicker", -9);
  addon.click(pickerRow(addon, "Macro..."));
  expect(addon.frame("Vanguard_TextDialog").visible && addon.texts("Bind").length === 1, "Macro... asks in the text dialog").toBe(true);
  addon.type("Vanguard_TextEdit", "/cast [@mouseover] TEST-ONLY Heal");
  confirm(addon);
  expect(bindings(addon)["shift-BUTTON2"]).toBe("macro:/cast [@mouseover] TEST-ONLY Heal:nil:nil");
  expect(addon.frame("Vanguard_TextDialog").visible).toBe(false);
  addon.click(cell(addon, "shift-BUTTON2"));
  addon.wheel("Vanguard_SpellPicker", -9);
  addon.click(pickerRow(addon, "Type a spell name..."));
  addon.type("Vanguard_TextEdit", "  TEST-ONLY Unknown  ");
  confirm(addon);
  expect(bindings(addon)["shift-BUTTON2"], "a typed name is trimmed and bound as it is").toBe("spell:TEST-ONLY Unknown:nil:nil");
  expect(textsIn(addon, widget(addon, `w.__parent == __wfgStub.frames[${cell(addon, "shift-BUTTON2")}] and w.letter ~= nil`)), "a spell without an icon shows its initial").toContain("T");
  addon.click(cell(addon, "shift-BUTTON2"));
  addon.wheel("Vanguard_SpellPicker", -9);
  addon.click(pickerRow(addon, "Macro..."));
  addon.type("Vanguard_TextEdit", "   ");
  confirm(addon);
  expect(addon.frame("Vanguard_TextDialog").visible, "an empty macro isn't bound and the dialog stays").toBe(true);
  addon.eval("ns.HideText()");
  addon.eval('__click("More modifiers")');
  expect(addon.frames("w.key ~= nil and w.iconFrame ~= nil and w.empty ~= nil and w:IsVisible()").length, "three more columns").toBe(35);
  expect(cell(addon, "ctrl-shift-BUTTON1") !== undefined).toBe(true);
  addon.eval('__click("Fewer modifiers")');
  expect(addon.frames("w.key ~= nil and w.iconFrame ~= nil and w.empty ~= nil and w:IsVisible()").length).toBe(20);
});

it("the starter layout, hover keys with collision notes, and the test tile", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.eval('return __click("Priest healing layout")')).toBe(true);
  addon.eval('ns.Options.ShowTab("Keys while hovering a frame")');
  expect(bindings(addon)).toMatchObject({ BUTTON1: "target:nil:nil:nil", "ctrl-BUTTON1": "spell:Dispel Magic:527:nil" });
  expect(bindings(addon).BUTTON3.startsWith("spell:Flash Heal:")).toBe(true);
  const add = widget(addon, 'w.caption == "Add key" and w.onKey ~= nil');
  expect(addon.texts("No hover keys yet. Add one, press the key, pick the spell.").length).toBe(1);
  addon.click(add);
  addon.keys({ shift: true });
  addon.key(add, "Q");
  addon.keys({ shift: false });
  expect(addon.frame("Vanguard_SpellPicker").visible, "a pressed key opens the picker").toBe(true);
  addon.click(pickerRow(addon, "Renew"));
  expect(bindings(addon)["SHIFT-Q"]).toBe("spell:Renew:139:nil");
  expect(addon.texts("Shift + Q").length, "the row names the key without the (hover) tail").toBe(1);
  addon.eval(`${CC}.Add("1", "spell", "Greater Heal", 2060)`);
  addon.eval("ns.Options.Refresh()");
  expect(addon.texts("also Action bar 1 slot 1").length, "a key the action bar uses says so").toBe(1);
  addon.click(add);
  addon.eval(`local a = __wfgStub.frames[${add}] a:GetScript("OnMouseDown")(a, "RightButton")`);
  expect(addon.texts("That's a mouse button: it lives in the Click casting grid.").length).toBe(1);
  for (let i = 1; i <= 9; i++) addon.eval(`${CC}.Add("F${i}", "target")`);
  addon.eval("ns.Options.Refresh()");
  expect(addon.texts("+3 more (/vg binds)").length, "rows past the list are counted").toBe(1);
  addon.eval(`${CC}.Remove("SHIFT-Q")`);
  const q = widget(addon, 'w.key == "1" and w.remove ~= nil and w.keyText ~= nil');
  addon.eval(`__wfgStub.frames[${q}].remove:GetScript("OnClick")()`);
  expect(bindings(addon)["1"], "Remove removes the row's binding").toBe(undefined);
  addon.eval("ns.Client = ns.Client or {} ns.Client.ProbeSnippets = function() return false end ns.Options.Refresh()");
  expect(addon.texts("This client can't compile the secure code hover keys need; mouse bindings still work.").length).toBe(1);
  addon.eval("ns.Client.ProbeSnippets = nil");
  const tile = widget(addon, "w.result ~= nil and w.bar ~= nil");
  addon.hover(tile);
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`)).toBe("Press a key or click...");
  addon.key(tile, "LSHIFT");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`), "a lone modifier waits").toBe("Press a key or click...");
  addon.key(tile, "F1");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`)).toBe("F1 -> Target on Tester");
  addon.click(tile, "MiddleButton");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`)).toBe("Middle click -> Flash Heal on Tester");
  addon.click(tile, "RightButton");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`), "the layout's right click is the unit menu").toBe("Right click -> Unit menu on Tester");
  addon.click(tile, "Button9");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`), "an unknown mouse button reads as the left one").toBe("Left click -> Target on Tester");
  addon.wheel(tile, 1);
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`)).toBe("Wheel up -> nothing bound");
  addon.hover(null);
  addon.eval("UnitName = nil ns.Options.Refresh()");
  addon.hover(tile);
  addon.key(tile, "F2");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`)).toBe("F2 -> Target on you");
  addon.hover(null);
  // How many bindings this spec has.
  const count = () => addon.eval(`return #${CC}.Bindings()`);
  addon.eval('return __click("Clear all")');
  expect(addon.eval("return Vanguard_Question:IsShown()"), "Clear all asks first").toBe(true);
  expect(count(), "and clears nothing yet").toBeGreaterThan(0);
  addon.click("Vanguard_Question.no");
  expect(count(), "No keeps the bindings").toBeGreaterThan(0);
  addon.eval('return __click("Clear all")');
  addon.click("Vanguard_Question.confirm");
  expect(count(), "Clear empties them").toBe(0);
});

it("the minus key can be a hover key: its name reads, with or without a modifier", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  const tile = widget(addon, "w.result ~= nil and w.bar ~= nil");
  addon.hover(tile);
  addon.key(tile, "-");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`), "pressing minus over the test tile").toBe("- -> nothing bound");
  addon.hover(null);
  addon.eval(`${CC}.Add("-", "spell", "Renew", 139) ${CC}.Add("CTRL-SHIFT--", "target")`);
  addon.eval("ns.Options.Refresh()");
  expect(addon.eval('local out = {} for _, w in ipairs(__wfgStub.frames) do if w.keyText and w.remove and w:IsShown() then out[#out + 1] = w.keyText:GetText() end end return out'),
    "both rows name their key").toEqual(["-", "Ctrl + Shift + -"]);
  expect(addon.eval(`return ${CC}.KeyText("SHIFT--") .. "|" .. ${CC}.KeyText("ALT-MOUSEWHEELUP") .. "|" .. ${CC}.KeyText("META-Q")`)).toBe("Shift + - (hover)|Alt + Wheel up (hover)|Q (hover)");
});

it("sharing: export, import, copy to another spec, and the combat notice", () => {
  const addon = priest("__wfgWorld.spec = 1 GetNumSpecializations = function() return __specs end __specs = 2", { savedVariables: WITH_FRAMES });
  addon.eval(`${CC}.Add("BUTTON2", "spell", "Renew", 139)`);
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('__click("Export")');
  expect(/^VG1:clickcast:/.test(addon.eval("return Vanguard_TextEdit:GetText()")), "Export shows the string to copy").toBe(true);
  const text = addon.eval("return Vanguard_TextEdit:GetText()");
  addon.eval("ns.HideText()");
  addon.clearChat();
  addon.eval('__click("Import")');
  addon.type("Vanguard_TextEdit", "nonsense");
  confirm(addon);
  expect(chatHas(addon, /Can't import: not a Vanguard profile string\./)).toBe(true);
  addon.type("Vanguard_TextEdit", text);
  confirm(addon);
  expect(chatHas(addon, /Imported 1 click-casting bindings\./) && !addon.frame("Vanguard_TextDialog").visible).toBe(true);
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to spec..."');
  expect(addon.frame(copy).visible, "with specs, Copy to spec shows").toBe(true);
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect(chatHas(addon, /copied to spec 2/) && addon.eval(`return #${CC}.Bindings(2)`) === 1).toBe(true);
  addon.eval("__specs = 0 ns.Options.Refresh()");
  expect(addon.frame(copy).visible, "without other specs it hides").toBe(false);
  addon.world.combat(true);
  addon.eval(`${CC}.Add("BUTTON5", "menu")`);
  addon.eval('ns.Options.Refresh() ns.Options.ShowTab("Click casting")');
  expect(addon.texts("In combat: changes are kept and apply when the fight ends.").length).toBe(1);
  expect(addon.eval(`return ${CC}.frames[1]:GetAttribute("type5")`)).toBe(null);
  addon.click(cell(addon, "alt-BUTTON3"));
  addon.world.combat(false);
  expect(addon.eval(`return ${CC}.frames[1]:GetAttribute("type5")`), "the fight ends: the change applies and the page re-reads").toBe("togglemenu");
  expect(addon.frame("Vanguard_SpellPicker").visible, "an open picker follows the bindings").toBe(true);
});

it("without specializations the page speaks of this character", () => {
  const addon = priest("", { savedVariables: "VanguardDB = { profiles = { Default = { ClickCast = { unitFrames = true } } } }" });
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.frames('w.__kind == "FontString" and w:IsVisible() and type(w.__text) == "string" and w.__text:find("Bindings for this character", 1, true)').length).toBe(1);
  expect(addon.eval(`return #${CC}.frames > 0`), "unit frames join when that setting is on").toBe(true);
  addon.eval('__click("Also on your player, target and focus frames")');
  expect(addon.eval('return ns.Settings("ClickCast", ns.GetModule("ClickCast").defaults).unitFrames')).toBe(false);
});

it("the hover keys tab shows Add key and its hint at the top of its card, inside the page as it opens", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast") ns.Options.ShowTab("Keys while hovering a frame")');
  const view = addon.frames('w.__kind == "ScrollFrame" and w:IsVisible()')[0].rect;
  const list = addon.frames("w.rows ~= nil and w.add ~= nil")[0].rect;
  const add = addon.frame(widget(addon, 'w.caption == "Add key" and w.onKey ~= nil'));
  const hint = addon.texts("No hover keys yet. Add one, press the key, pick the spell.")[0];
  expect([add.visible, view.top - add.rect.top, add.rect.bottom >= view.bottom], "Add key is the card's first line, 16 under the page's top, in the page before any scrolling").toEqual([true, 16, true]);
  expect([hint.visible, hint.rect.bottom >= view.bottom, hint.rect.right <= list.right], "the hint beside it, inside the page and the card").toEqual([true, true, true]);
  // A mouse button pressed for the new key says it lives in the grid, in the hint's spot: the hint goes, not printed over.
  const addId = widget(addon, 'w.caption == "Add key" and w.onKey ~= nil');
  addon.click(addId);
  addon.eval(`local a = __wfgStub.frames[${addId}] a:GetScript("OnMouseDown")(a, "RightButton")`);
  expect([addon.texts("No hover keys yet. Add one, press the key, pick the spell.").length, addon.texts("That's a mouse button: it lives in the Click casting grid.").length], "with no keys yet, the empty line makes room for the mouse-button line").toEqual([0, 1]);
  addon.eval(`${CC}.Add("SHIFT-Q", "target") ns.Options.Refresh()`);
  const row = addon.texts("Shift + Q")[0].rect;
  expect(row.top <= add.rect.bottom, "a hover key's row comes under the Add key line").toBe(true);
  addon.eval("ns.Client = ns.Client or {} ns.Client.ProbeSnippets = function() return false end ns.Options.Refresh()");
  const off = addon.texts("This client can't compile the secure code hover keys need; mouse bindings still work.")[0];
  expect([off.visible, view.top - off.rect.top, off.rect.right <= list.right], "without snippets the note takes the top line, inside the card").toEqual([true, 20, true]);
  addon.eval("ns.Client.ProbeSnippets = nil");
});

// A visible font string's size and colour by its exact text, as { size, color }.
const fontOf = (addon, text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__kind == "FontString" and w:IsVisible() and w.__text == ${JSON.stringify(text)} then
  return { (select(2, w:GetFont())), w.__textColor } end end`);

it("the grid's column headers are section headers centred over their cells, and an action with no icon shows its letter in the name role", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('__click("Priest healing layout")');
  const [small, name] = addon.eval("return { ns.Theme.RoleSize('small'), ns.Theme.RoleSize('name') }");
  const head = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.text and w.__kind == "Button" and w:IsVisible() and w.text.__text == "PLAIN" then
    return { w:GetHeight(), w:GetWidth(), w.text.__points.CENTER ~= nil, w.text.__points.LEFT == nil, (select(2, w.text:GetFont())), w.text.__textColor, (w:GetCenter()) } end end`);
  const plain = addon.eval(`local c = __wfgStub.frames[${cell(addon, "BUTTON1")}] return { c:GetWidth(), (c:GetCenter()) }`);
  expect(head.slice(0, 5), "a section header 18 tall, one column wide, its text centred in small").toEqual([18, plain[0] + 4, true, true, small]);
  expect([isTok(addon, head[5], "muted"), Math.abs(head[6] - plain[1]) < 1], "muted, and centred over its column's cells").toEqual([true, true]);
  const letter = addon.eval(`local l = __wfgStub.frames[${cell(addon, "BUTTON1")}].iconFrame.letter return { l:GetText(), (select(2, l:GetFont())), l.__textColor }`);
  expect([letter[0], letter[1], isTok(addon, letter[2], "accentText")], "the left click's Target shows a T in the name role, in the accent's text colour").toEqual(["T", name, true]);
});

it("on a Russian client an action with no icon shows its whole first letter, not half of it", () => {
  const addon = priest("", { client: '__wfgWorld.locale = "ruRU"' });
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('__click(ns.Format(ns.L["{class} healing layout"], { class = "Priest" }))');
  const letter = addon.eval(`return __wfgStub.frames[${cell(addon, "BUTTON1")}].iconFrame.letter:GetText()`);
  const action = addon.eval('return ns.GetModule("ClickCast").ActionText({ action = "target" })');
  expect([letter, letter.length], "the first letter of the translated Target, one character").toEqual([action[0], 1]);
});

it("the picker's rows are list rows (T.ROW.height) and a group's name shows in a section header on its row", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.click(cell(addon, "ctrl-BUTTON2"));
  const [height, small] = addon.eval("return { ns.Theme.ROW.height, ns.Theme.RoleSize('small') }");
  const row = addon.eval(`local r = __wfgStub.frames[${pickerRow(addon, "Flash Heal")}] return { r.__kind, r:GetHeight(), r.SetSelected ~= nil, r.wash ~= nil, r.section:IsShown() }`);
  expect(row, "a spell's row is a Button of the list row's height with the selected look, and no section header").toEqual(["Button", height, true, true, false]);
  const header = widget(addon, "w.item ~= nil and w.chevron ~= nil and w:IsShown() and w.item.header ~= nil");
  const section = addon.eval(`local r = __wfgStub.frames[${header}] return { r.section:IsShown(), r.section:GetHeight(), r.section.text:GetText(), (select(2, r.section.text:GetFont())), r.section.text.__textColor, r.text:GetText() }`);
  expect([section.slice(0, 5).filter((_, i) => i !== 4), isTok(addon, section[4], "muted"), section[5]], "a group's row holds an 18 high section header in small muted capitals and no text of its own").toEqual([[true, 18, "HEALS", small], true, ""]);
});

it("the hover keys card: its key rows are list rows; the empty line is label text2, the count small text2, the off note small muted; an empty cell's mark is label disabled", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast") ns.Options.ShowTab("Keys while hovering a frame")');
  const [height, label, small] = addon.eval("return { ns.Theme.ROW.height, ns.Theme.RoleSize('label'), ns.Theme.RoleSize('small') }");
  const empty = fontOf(addon, "No hover keys yet. Add one, press the key, pick the spell.");
  expect([empty[0], isTok(addon, empty[1], "text2")], "the empty-state line: label, text2").toEqual([label, true]);
  const mark = addon.eval(`local c = __wfgStub.frames[${cell(addon, "BUTTON1")}] return { (select(2, c.empty:GetFont())), c.empty.__textColor }`);
  expect([mark[0], isTok(addon, mark[1], "disabled")], "an empty cell's dash: label, disabled").toEqual([label, true]);
  addon.eval(`${CC}.Add("SHIFT-Q", "target") ns.Options.Refresh()`);
  const row = addon.eval(`local r = __wfgStub.frames[${widget(addon, 'w.key == "SHIFT-Q" and w.remove ~= nil and w.keyText ~= nil')}] return { r.__kind, r:GetHeight(), r.SetSelected ~= nil, r.wash ~= nil }`);
  expect(row, "a key row is a Button of the list row's height with the selected look").toEqual(["Button", height, true, true]);
  for (let i = 1; i <= 10; i++) addon.eval(`${CC}.Add("F${i}", "target")`);
  addon.eval("ns.Options.Refresh()");
  const count = fontOf(addon, "+3 more (/vg binds)");
  expect([count[0], isTok(addon, count[1], "text2")], "the count: small, text2").toEqual([small, true]);
  addon.eval("ns.Client = ns.Client or {} ns.Client.ProbeSnippets = function() return false end ns.Options.Refresh()");
  const off = fontOf(addon, "This client can't compile the secure code hover keys need; mouse bindings still work.");
  expect([off[0], isTok(addon, off[1], "muted")], "the no-snippets note: small, muted").toEqual([small, true]);
  addon.eval("ns.Client.ProbeSnippets = nil");
});

it("with the game's own click bindings, the page marks a Target or Unit menu binding the game won't run, and says why", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval(`${CC}.ApplyLayout(ns.ClickCastSpells.Layout()) ${CC}.Add("BUTTON3", "menu") ${CC}.Add("SHIFT-Q", "menu") ${CC}.Add("SHIFT-E", "spell", "Renew", 139) ns.Options.Refresh()`);
  // A cell's name: its text and whether it is drawn in a colour token.
  const name = (key, token) => addon.eval(`local c = __wfgStub.frames[${cell(addon, key)}] return { c.name:GetText(), c.name.__textColor }`)
    .map((v, i) => (i === 1 ? isTok(addon, v, token) : v));
  expect([name("BUTTON3", "warn"), name("BUTTON1", "text"), name("BUTTON2", "text")], "the middle-click menu is in the warning colour; the layout's own Left and Right clicks (the game's) aren't").toEqual([["Unit menu", true], ["Target", true], ["Unit menu", true]]);
  addon.hover(cell(addon, "BUTTON3"));
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "hovering it says why").toEqual(
    ["Unit menu", "Does nothing: the game runs it only on a click its own Click Casting window binds."]);
  addon.hover(null);
  // A hover-key row's note: its text and whether it is drawn in a colour token.
  const note = (key, token) => addon.eval(`local r = __wfgStub.frames[${widget(addon, `w.key == "${key}" and w.remove ~= nil and w.keyText ~= nil`)}] return { r.note:GetText(), r.note.__textColor }`)
    .map((v, i) => (i === 1 ? isTok(addon, v, token) : v));
  expect([note("SHIFT-Q", "warn"), note("SHIFT-E", "muted")], "a Unit menu hover key says why it does nothing; a spell key keeps its plain note").toEqual(
    [["does nothing: the game won't run it from a key", true], ["", true]]);
  addon.eval("GameTooltip = nil");
  addon.hover(cell(addon, "BUTTON3"));
  addon.hover(null);
});

// A click-casting string for a list of Lua binding tables (as written in Lua source).
const encoded = (addon, list) => addon.eval(`return ns.Serialize.Encode("clickcast", { bindings = ${list} })`);

// How many times the bindings were applied to the frames while fn ran (the module's ApplyAll, counted).
function applies(addon, fn) {
  addon.eval(`__applies, __realApply = 0, ${CC}.ApplyAll ${CC}.ApplyAll = function(...) __applies = __applies + 1 return __realApply(...) end`);
  const result = fn();
  addon.eval(`${CC}.ApplyAll = __realApply`);
  return [result, addon.eval("return __applies")];
}

it("import: a good string replaces the bindings and applies them once, however many it holds", () => {
  const addon = priest("", { savedVariables: WITH_FRAMES });
  addon.eval(`${CC}.Add("BUTTON4", "target")`);
  const list = Array.from({ length: 60 }, (_, i) => `{ key = "F${i}", action = "macro", value = "/cast Renew ${i}" }`).join(", ");
  const text = encoded(addon, `{ ${list}, { key = "BUTTON2", action = "spell", value = "Renew", spellID = 139, rank = 1 }, { key = "F0", action = "target" }, { key = 1 } }`);
  const [n, count] = applies(addon, () => addon.eval(`return ${CC}.Import(${JSON.stringify(text)})`));
  expect(n, "60 macros and a spell (the second F0 replaced the first; the malformed entry was skipped)").toBe(61);
  expect(count, "one pass over the frames, not two per binding").toBe(1);
  expect(Object.keys(bindings(addon)).includes("BUTTON4"), "the old bindings are replaced").toBe(false);
  expect([bindings(addon).F0, bindings(addon).BUTTON2], "the last of two for one key wins; the spell keeps its id and rank").toEqual(["target:nil:nil:nil", "spell:Renew:139:1"]);
});

it("import: a string that cannot be imported changes nothing (empty, too many, a text too long, no usable binding)", () => {
  const addon = priest("", { savedVariables: WITH_FRAMES });
  addon.eval(`${CC}.Add("BUTTON4", "target") ${CC}.Add("SHIFT-Q", "macro", "/say keep me")`);
  const before = JSON.stringify(bindings(addon));
  // A Lua list of n well-formed target bindings.
  const many = (n) => `{ ${Array.from({ length: n }, (_, i) => `{ key = "F${i}", action = "target" }`).join(", ")} }`;
  const tries = {
    empty: [encoded(addon, "{}"), "no usable bindings in it"],
    "all malformed": [encoded(addon, '{ { key = 1 }, { key = "BUTTON1", action = "teleport" }, { key = "", action = "target" }, { key = "A", action = "macro" } }'), "no usable bindings in it"],
    "201 bindings": [encoded(addon, many(201)), "more than 200 bindings"],
    "256 characters": [encoded(addon, `{ { key = "BUTTON1", action = "target" }, { key = "A", action = "macro", value = "${"x".repeat(256)}" } }`), "a text is longer than 255 characters"],
  };
  for (const [name, [text, why]] of Object.entries(tries)) {
    const [result, count] = applies(addon, () => addon.eval(`local n, err = ${CC}.Import(${JSON.stringify(text)}) return { n or false, err }`));
    expect([name, result, count], "refused with its reason, and nothing applied").toEqual([name, [false, why], 0]);
    expect(JSON.stringify(bindings(addon)), `${name}: the old bindings are still there`).toBe(before);
  }
  expect(addon.eval(`return #${CC}.Bindings()`)).toBe(2);
});

it("import: the limits themselves are fine (200 bindings, a 255 character macro), and odd numbers are dropped", () => {
  const addon = priest("", { savedVariables: WITH_FRAMES });
  const list = Array.from({ length: 199 }, (_, i) => `{ key = "F${i}", action = "target" }`).join(", ");
  const text = encoded(addon, `{ ${list}, { key = "A", action = "macro", value = "${"x".repeat(255)}" } }`);
  expect(addon.eval(`return ${CC}.Import(${JSON.stringify(text)})`), "200 bindings, one with 255 characters").toBe(200);
  const odd = encoded(addon, '{ { key = "BUTTON4", action = "spell", value = "Renew", spellID = 1.5, rank = "x" }, { key = "BUTTON5", action = "spell", value = "Renew", spellID = "139", rank = 2 } }');
  addon.eval(`${CC}.Import(${JSON.stringify(odd)})`);
  expect([bindings(addon).BUTTON4, bindings(addon).BUTTON5], "a fraction and text are no spell id or rank; a number in text is one").toEqual(["spell:Renew:139:nil", "spell:Renew:139:2"]);
});

it("import: the options window says why a string was refused, and the layout applies in one pass", () => {
  const addon = priest("", { savedVariables: WITH_FRAMES });
  addon.eval(`${CC}.Add("BUTTON4", "target")`);
  addon.eval('ns.Options.Show("clickcast")');
  addon.clearChat();
  addon.eval('__click("Import")');
  addon.type("Vanguard_TextEdit", encoded(addon, "{}"));
  confirm(addon);
  expect([chatHas(addon, /Can't import: no usable bindings in it\./), bindings(addon).BUTTON4], "empty string: told, and BUTTON4 is still bound").toEqual([true, "target:nil:nil:nil"]);
  const [, count] = applies(addon, () => addon.eval(`${CC}.ApplyLayout(${CS}.Layout())`));
  expect(count, "a layout of many keys applies once").toBe(1);
  expect(bindings(addon).BUTTON2, "and still binds them").toBe("menu:nil:nil:nil");
});

it("the test tile keeps the keys it reads from the game, and passes Escape and modifiers on", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  const tile = widget(addon, "w.result ~= nil and w.bar ~= nil");
  addon.eval(`local t = __wfgStub.frames[${tile}] t.SetPropagateKeyboardInput = function(self, v) self.__passed = v end t.EnableKeyboard = function(self, on) self.__kb = on end`);
  // Whether the tile let the key go on to the game (nil when it never said).
  const passed = (key) => { addon.eval(`__wfgStub.frames[${tile}].__passed = nil`); addon.hover(tile); addon.key(tile, key); return addon.eval(`return __wfgStub.frames[${tile}].__passed`); };
  expect([passed("F1"), passed("1")], "a key it tests is kept from the game: pressing it casts nothing").toEqual([false, false]);
  expect([passed("ESCAPE"), passed("LSHIFT")], "Escape and a lone modifier go on").toEqual([true, true]);
  addon.world.combat(true);
  expect(passed("F1"), "in a fight the call is left alone").toBe(null);
  addon.world.combat(false);
  addon.hover(null);
  addon.eval("ns.Client.has.keyPropagate = false");
  expect(passed("F1"), "a client that cannot pass keys on is left alone").toBe(null);
  expect(addon.eval(`return __wfgStub.frames[${tile}].__kb`), "the tile reads keys while the pointer is on it").toBe(true);
  addon.hover(null);
  expect(addon.eval(`return __wfgStub.frames[${tile}].__kb`), "and gives the keyboard back when it leaves").toBe(false);
});
it("the test tile does not take the keyboard in a fight, whether the pointer was on it first or arrives later", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  const tile = widget(addon, "w.result ~= nil and w.bar ~= nil");
  addon.eval(`__wfgStub.frames[${tile}].EnableKeyboard = function(self, on) self.__kb = on end`);
  // Whether the tile has its keyboard on.
  const keyboard = () => addon.eval(`return __wfgStub.frames[${tile}].__kb`);
  addon.hover(tile);
  expect(keyboard(), "out of a fight it reads keys").toBe(true);
  addon.world.combat(true);
  expect(keyboard(), "a fight starting with the pointer on it lets the keyboard go").toBe(false);
  addon.hover(null);
  addon.hover(tile);
  expect(keyboard(), "entering it in the fight leaves the keyboard off").toBe(false);
  addon.world.combat(false);
  addon.hover(null);
  addon.hover(tile);
  expect(keyboard(), "and entering it after the fight reads keys again").toBe(true);
});

it("a rebuilt Click casting page's new test tile lets go of the keyboard when a fight starts", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.eval('return __click("More modifiers")'), "the columns button rebuilds the page").toBe(true);
  const tiles = addon.frames("w.result ~= nil and w.bar ~= nil");
  expect(tiles.length, "the old tile is still around beside the new one").toBe(2);
  const tile = tiles[1].id;
  addon.eval(`__wfgStub.frames[${tile}].EnableKeyboard = function(self, on) self.__kb = on end`);
  addon.hover(tile);
  addon.world.combat(true);
  expect(addon.eval(`return __wfgStub.frames[${tile}].__kb`), "the rebuilt page's tile lets go").toBe(false);
});

// A priest's Click casting page open, its test tile's keyboard tracked in __kb; answers the tile and a reader of __kb.
function tileWithKeyboard() {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast") ns.Options.ShowTab("Try it")');
  const tile = widget(addon, "w.result ~= nil and w.bar ~= nil");
  addon.eval(`__wfgStub.frames[${tile}].EnableKeyboard = function(self, on) self.__kb = on end`);
  // Whether the tile has its keyboard on.
  const keyboard = () => addon.eval(`return __wfgStub.frames[${tile}].__kb`);
  return { addon, tile, keyboard };
}
it("the test tile reads keys again when the fight ends with the pointer still on it", () => {
  const { addon, tile, keyboard } = tileWithKeyboard();
  addon.hover(tile);
  addon.world.combat(true);
  expect(keyboard(), "the fight took the keyboard off").toBe(false);
  addon.world.combat(false);
  expect(keyboard(), "the pointer stayed on the tile, so it reads keys again").toBe(true);
});
it("the test tile stays off the keyboard when the fight ends with the pointer elsewhere", () => {
  const { addon, tile, keyboard } = tileWithKeyboard();
  addon.hover(tile);
  addon.world.combat(true);
  addon.hover(null);
  addon.world.combat(false);
  expect(keyboard(), "the pointer left in the fight").toBe(false);
});
it("a spell picker opened in a fight does not take the keyboard; one opened after it does", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.eval("Vanguard_SpellPicker.EnableKeyboard = function(self, on) self.__kb = on end");
  // Clicks the cell open and answers whether the picker shows, and whether its keyboard is on.
  const keyboardAfterOpening = () => {
    addon.click(cell(addon, "ctrl-BUTTON2"));
    return [addon.frame("Vanguard_SpellPicker").visible, addon.eval("return Vanguard_SpellPicker.__kb")];
  };
  addon.world.combat(true);
  expect(keyboardAfterOpening(), "opened in the fight, shown with the keyboard off").toEqual([true, false]);
  addon.world.combat(false);
  addon.eval("Vanguard_SpellPicker:Hide()");
  expect(keyboardAfterOpening(), "opened after it, the keyboard is on again").toEqual([true, true]);
});
it("a spell picker opened in a fight reads keys when the fight ends, if it is still up", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.world.combat(true);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.eval("Vanguard_SpellPicker.EnableKeyboard = function(self, on) self.__kb = on end");
  addon.world.combat(false);
  expect(addon.eval("return Vanguard_SpellPicker.__kb"), "up at the end of the fight: the keyboard is on").toBe(true);
});
it("a spell picker closed during the fight it opened in stays off the keyboard", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  addon.world.combat(true);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.eval("Vanguard_SpellPicker.EnableKeyboard = function(self, on) self.__kb = on end Vanguard_SpellPicker.__kb = false Vanguard_SpellPicker:Hide()");
  addon.world.combat(false);
  expect(addon.eval("return Vanguard_SpellPicker.__kb"), "hidden at the end of the fight: left alone").toBe(false);
});

it("the Click casting page shows one Reset this page card however often the window opened before a rebuild", () => {
  const addon = loggedIn(CLICK_LUA + "C_ClickBindings = {}");
  for (let i = 0; i < 3; i++) addon.eval('ns.Options.Show("general") ns.Options.Hide() Vanguard_Options:Hide()');
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.eval('return __click("More modifiers")'), "the columns button rebuilds the page").toBe(true);
  const shown = addon.eval(`local n = 0 for _, w in ipairs(__wfgStub.frames) do
      local fs = w.text or w.label
      if w:IsVisible() and type(fs) == "table" and fs.__text == "Reset this page" then n = n + 1 end end return n`);
  expect(shown, "one reset button").toBe(1);
});

it("the spell picker finds a Russian spell typed in small letters", () => {
  const addon = priest("", { client: '__wfgWorld.locale = "ruRU"' });
  addon.world.learn(3001, { name: "Обновление", rank: 1, helpful: true });
  addon.eval('ns.Options.Show("clickcast")');
  addon.click(cell(addon, "ctrl-BUTTON2"));
  addon.type("Vanguard_SpellPicker.search", "обновление");
  expect(pickerRow(addon, "Обновление") !== undefined, "the capital О is folded on both sides").toBe(true);
});

// TEST-ONLY saved click-casting lists from before the lists were kept per talent group: Renew and Target, under
// the key given (the specialization index, or 0 where the client has none).
const oldList = (key) => `VanguardCharDB = { clickcast = { [${key}] = { { key = "BUTTON2", action = "spell", value = "Renew", spellID = 139 }, { key = "BUTTON1", action = "target" } } } }`;

// The keys of a saved list (by its spec key), in order, or null when there is no such list.
const savedKeys = (addon, key) => addon.eval(`local l = VanguardCharDB.clickcast[${key}] if not l then return nil end local out = {} for i, b in ipairs(l) do out[i] = b.key end return out`);

// Whether the character's talent-group migration has been stamped.
const migrated = (addon) => addon.eval("return VanguardCharDB.clickcastStamps ~= nil and VanguardCharDB.clickcastStamps.talentGroups == true");

it("the talent-group migration copies the old single list to each group without one, once, and keeps the old key", () => {
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: oldList(0) });
  expect([savedKeys(addon, 1), savedKeys(addon, 2)], "both groups start from the old list").toEqual([["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"]]);
  expect([savedKeys(addon, 0), migrated(addon)], "the old key is kept for a version, and the step is stamped").toEqual([["BUTTON2", "BUTTON1"], true]);
  addon.eval(`${CC}.Remove("BUTTON1")`);
  expect([savedKeys(addon, 1), savedKeys(addon, 2), savedKeys(addon, 0)], "the copies are separate lists").toEqual([["BUTTON2"], ["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"]]);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.eval(`${CC}.Clear() VanguardCharDB.clickcast[0] = nil`);
  addon.eval("__wfgWorld.specGroup = 1");
  expect([addon.eval(`return #${CC}.Bindings(2)`), savedKeys(addon, 1)], "stamped, it does not run again: a cleared group stays empty").toEqual([0, ["BUTTON2"]]);
});

it("the talent-group migration leaves a group that has its own list alone, and uses the specialization index where there is one", () => {
  const own = ' VanguardCharDB.clickcast[2] = { { key = "BUTTON4", action = "focus" } }';
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: oldList(0) + own });
  expect([savedKeys(addon, 1), savedKeys(addon, 2)], "Secondary keeps its own; Primary gets the old list").toEqual([["BUTTON2", "BUTTON1"], ["BUTTON4"]]);
  const indexed = priest("__wfgWorld.specGroup = 1 __wfgWorld.spec = 1", { savedVariables: oldList(1) });
  expect([savedKeys(indexed, 1), savedKeys(indexed, 2), savedKeys(indexed, 0)], "the list saved under specialization 1 is Primary's, and Secondary gets a copy").toEqual([["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"], null]);
});

it("the talent-group migration waits for a client that names a talent group, and does nothing without one", () => {
  const addon = priest("", { savedVariables: oldList(0) });
  expect([savedKeys(addon, 1), migrated(addon)], "no talent groups: the list stays where it was, unstamped").toEqual([null, false]);
  expect(addon.eval(`return #${CC}.Bindings()`), "and it is still the character's list").toBe(2);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect([addon.eval(`return #${CC}.Bindings()`), savedKeys(addon, 1), migrated(addon)], "once the client names a group, the next read migrates").toEqual([2, ["BUTTON2", "BUTTON1"], true]);
});

it("on WoW Forever the Click casting page speaks of talent groups, and Copy to goes across them", () => {
  const addon = priest("__wfgWorld.specGroup = 1 GetNumSpecializations = function() return 3 end");
  addon.eval(`${CC}.Add("BUTTON2", "spell", "Renew", 139)`);
  addon.eval('ns.Options.Show("clickcast")');
  const sentence = " on this character. Click a cell to pick a spell, right-click to clear, or drop a spell on it.";
  expect(addon.texts(`Bindings for Primary talents${sentence}`).length, "the line over the grid names the talent group").toBe(1);
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');
  expect(addon.eval(`return __wfgStub.frames[${copy}].choices()`), "the other talent group, not the client's specializations").toEqual([[2, "Copy to Secondary talents"]]);
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect([chatHas(addon, /Click-casting bindings copied to Secondary talents\./), addon.eval(`return #${CC}.Bindings(2)`)], "copied across, and said").toEqual([true, 1]);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  addon.eval("ns.Options.Refresh()");
  expect(addon.texts(`Bindings for Secondary talents${sentence}`).length, "the line follows the group").toBe(1);
  expect(addon.eval(`return __wfgStub.frames[${copy}].choices()`), "and the copy goes back to Primary").toEqual([[1, "Copy to Primary talents"]]);
});

it("with a game Spell on the same click, the page marks the binding the game's runs over, and says why", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "RightButton", modifiers = __wfgWorld.modifierBits.shift })
    ${CC}.ApplyLayout(ns.ClickCastSpells.Layout()) ns.Options.Show("clickcast")`);
  const why = "the game's own Click Casting window binds a spell or macro to this click, and that runs instead";
  // A cell's name colour as a token.
  const colour = (key, token) => isTok(addon, addon.eval(`return __wfgStub.frames[${cell(addon, key)}].name.__textColor`), token);
  expect([colour("shift-BUTTON2", "warn"), colour("shift-BUTTON1", "text")], "Shift + Right click (Renew) is in the warning colour, the neighbouring cell is not").toEqual([true, true]);
  addon.hover(cell(addon, "shift-BUTTON2"));
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "hovering it says why").toEqual(["Renew", `Does nothing: ${why}.`]);
  addon.hover(null);
  addon.clearChat();
  addon.slash("binds");
  expect(chatHas(addon, new RegExp(`Shift \\+ Right click  ->  Renew .*\\(does nothing: ${why.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`)), "/vg binds adds the reason").toBe(true);
});

// The menu-click notice's text, and the shape of the old starter layouts (Flash Heal on Right, the menu on Middle).
const MENU_NOTICE = "Middle click can't open the unit menu on your raid frames: the game only runs it on a click its own Click Casting window binds. Put the menu on Right click and what is on Right click now on Middle click?";
const OLD_SHAPE = `${CC}.Add("BUTTON2", "spell", "Flash Heal", 2061) ${CC}.Add("BUTTON3", "menu")`;

it("the Click casting page offers to fix the old layouts' dead menu click, and Swap them moves the menu and the spell", () => {
  const addon = priest(GAME_CLICKS_LUA + GAME_ENGINE_LUA);
  addon.eval(`${CC}.Add("shift-BUTTON2", "spell", "Renew", 139) ${OLD_SHAPE} ns.Options.Show("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "the notice shows").toBe(1);
  expect(addon.eval('return __click("Swap them")'), "with its button").toBe(true);
  expect([bindings(addon).BUTTON2, bindings(addon).BUTTON3], "Right click is the menu, Middle click the spell it had").toEqual(["menu:nil:nil:nil", "spell:Flash Heal:2061:nil"]);
  expect(bindings(addon)["shift-BUTTON2"], "nothing else changes").toBe("spell:Renew:139:nil");
  expect(addon.texts(MENU_NOTICE).length, "the notice goes").toBe(0);
  expect(addon.eval(`return ${CC}.MenuClickNeedsFix()`)).toBe(false);
  expect(addon.eval(`return #${CC}.FixMenuClick()`), "with nothing to fix it does nothing").toBe(0);
  expect(bindings(addon).BUTTON2, "and changes nothing").toBe("menu:nil:nil:nil");
});

it("Swap them in a fight keeps the change and applies it when the fight ends", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  addon.world.combat(true);
  const [, during] = applies(addon, () => addon.eval('return __click("Swap them")'));
  expect([bindings(addon).BUTTON2, during], "the list is changed at once, and nothing is applied to the frames in the fight").toEqual(["menu:nil:nil:nil", 0]);
  const [, after] = applies(addon, () => addon.world.combat(false));
  expect(after, "it applies when the fight ends").toBe(1);
});

it("Dismiss puts the notice away for good: the stamp survives a rebuilt page and a new session", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  addon.eval('__click("Dismiss")');
  expect([addon.texts(MENU_NOTICE).length, bindings(addon).BUTTON3], "gone, and nothing was rewritten").toEqual([0, "menu:nil:nil:nil"]);
  expect(addon.eval("return VanguardCharDB.clickcastStamps.menuNotice"), "stamped for the character").toBe(true);
  addon.eval('ns.Options.RebuildPage("clickcast")');
  expect(addon.texts(MENU_NOTICE).length, "a rebuilt page doesn't bring it back").toBe(0);
  const again = priest(GAME_CLICKS_LUA, { savedVariables: 'VanguardCharDB = { clickcastStamps = { menuNotice = true }, clickcast = { [0] = { { key = "BUTTON2", action = "spell", value = "Flash Heal" }, { key = "BUTTON3", action = "menu" } } } }' });
  again.eval('ns.Options.Show("clickcast")');
  expect([again.eval(`return ${CC}.MenuClickNeedsFix()`), again.texts(MENU_NOTICE).length], "the shape is still there, and so is the stamp: no notice").toEqual([true, 0]);
});

it("the menu-click notice shows only for the old shape, where the game won't run the menu click", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval('ns.Options.Show("clickcast")');
  // Whether the page offers the fix now (the page is built again when that changes).
  const offered = () => addon.texts(MENU_NOTICE).length === 1;
  addon.eval(`${CC}.ApplyLayout(${CS}.Layout()) ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "the starter layout (Target, the menu on Right, the heal on Middle) is fine").toBe(false);
  addon.eval(`${CC}.Clear() ${CC}.Add("BUTTON2", "spell", "Flash Heal", 2061) ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a spell on Right and no menu on Middle is fine").toBe(false);
  addon.eval(`${CC}.Add("BUTTON3", "menu") ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a spell on Right and the menu on Middle is the old shape").toBe(true);
  addon.eval(`${CC}.Add("BUTTON2", "macro", "/cast Flash Heal") ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a macro on Right is a heal too: offered").toBe(true);
  addon.eval(`${CC}.Add("BUTTON2", "focus") ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "Focus on Right is not").toBe(false);
  addon.eval(`${CC}.Add("BUTTON2", "spell", "Flash Heal", 2061) ns.Options.RebuildPage("clickcast")`);
  expect(offered()).toBe(true);
  addon.eval(`${CC}.settings.useGame = true ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "while the game's own bindings are in use the menu click works").toBe(false);
  addon.eval(`${CC}.settings.useGame = false Enum.ClickBindingType = nil ns.Options.RebuildPage("clickcast")`);
  expect(offered(), "a client that can't say what the game binds shows nothing").toBe(false);
  expect(priest(`${OLD_SHAPE} ns.Options.Show("clickcast")`).texts(MENU_NOTICE).length, "nor does a client without the game's click bindings").toBe(0);
});

it("the notice follows the page: it appears when a talent group change brings the old shape, and goes with the fix", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 2");
  addon.eval(`${OLD_SHAPE} __wfgWorld.specGroup = 1 ns.Options.Show("clickcast")`);
  expect(addon.texts(MENU_NOTICE).length, "Primary talents have no bindings: no notice").toBe(0);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect(addon.texts(MENU_NOTICE).length, "Secondary talents hold the old shape: the page offers the fix").toBe(1);
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 2);
  expect(addon.texts(MENU_NOTICE).length, "an event that changes nothing leaves one notice").toBe(1);
  addon.eval('__click("Swap them")');
  expect(addon.texts(MENU_NOTICE).length).toBe(0);
});

// The old shape's bindings (Flash Heal on Right, the menu on Middle) over a game profile changed by Lua, the page open;
// answers whether the swap is offered, what MenuClickNeedsFix says, and the two bindings after trying CC.FixMenuClick.
function offeredOver(profileLua) {
  const addon = priest(GAME_CLICKS_LUA + profileLua);
  addon.eval(`${OLD_SHAPE} ns.Options.Show("clickcast")`);
  const needs = addon.eval(`return ${CC}.MenuClickNeedsFix()`);
  const offered = addon.texts(MENU_NOTICE).length === 1;
  addon.eval(`${CC}.FixMenuClick()`);
  return { needs, offered, after: [bindings(addon).BUTTON2, bindings(addon).BUTTON3] };
}

it("the swap is offered only where the Middle menu fails for want of cover and both clicks would then run", () => {
  const before = ["spell:Flash Heal:2061:nil", "menu:nil:nil:nil"];
  expect(offeredOver(""), "the default profile: offered").toMatchObject({ needs: true, offered: true, after: [before[1], before[0]] });
  const spellOnMiddle = offeredOver('table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "MiddleButton", modifiers = 0 })');
  expect(spellOnMiddle, "a game Spell on Middle would stay in the way: not offered, and nothing is swapped").toEqual({ needs: false, offered: false, after: before });
  const rightIsSpell = offeredOver('table.remove(__gameClicks, 2) table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "RightButton", modifiers = 0 })');
  expect(rightIsSpell, "the game's Spell on Right: the menu would not open there either: not offered").toEqual({ needs: false, offered: false, after: before });
});

it("a modifier mask whose text reads as no modifier raises no warning on the plain click", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${CC}.Add("BUTTON4", "focus") GetStringFromModifiers = function() return "" end
    table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 139, button = "Button4", modifiers = __wfgWorld.modifierBits.shift })`);
  expect(addon.eval(`return ${CC}.WontRun(${CC}.Binding("BUTTON4"))`), "a shifted game binding is not the plain one").toBe(null);
});

it("hidden profile fields give no warning and no error", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`${CC}.Add("BUTTON4", "focus") ${CC}.Add("shift-BUTTON4", "focus") ${CC}.Add("BUTTON5", "focus")
    local secret = __wfgWorld.secret
    table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 1, button = "Button4", modifiers = secret(4) })
    table.insert(__gameClicks, { type = secret(1), actionID = 1, button = "Button5", modifiers = 0 })
    table.insert(__gameClicks, { type = Enum.ClickBindingType.Spell, actionID = 1, button = secret("Button4"), modifiers = 0 })`);
  expect(addon.eval(`local out = {} for _, b in ipairs(${CC}.Bindings()) do out[#out + 1] = ${CC}.WontRun(b) or "" end return out`)).toEqual(["", "", ""]);
  expect(addon.eval("return #ns.errors"), "no error on the way").toBe(0);
});

it("a talent group change re-reads the open window's rows, whichever page is open and whether or not the Click casting page is built", () => {
  const addon = priest(GAME_CLICKS_LUA);
  addon.eval(`ns.Options.Show("general") ${OLD_SHAPE} __refreshes = 0 local real = ns.Options.Refresh
    ns.Options.Refresh = function(...) if debug.traceback():find("ClickCastOptions", 1, true) then __refreshes = __refreshes + 1 end return real(...) end`);
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 2);
  expect(addon.eval("return __refreshes"), "the window's rows were re-read although the Click casting page was never built").toBeGreaterThan(0);
});

it("Swap them fixes every talent group that has the old shape, and Dismiss is for the character", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: 'VanguardCharDB = { clickcast = { [0] = { { key = "BUTTON2", action = "spell", value = "Flash Heal", spellID = 2061 }, { key = "BUTTON3", action = "menu" } } } }' });
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.eval('return __click("Swap them")')).toBe(true);
  // A talent group's two bindings as "Right/Middle".
  const pair = (group) => addon.eval(`local l = ${CC}.Bindings(${group}) local out = {} for _, b in ipairs(l) do out[b.key] = b.action end return out.BUTTON2 .. "/" .. out.BUTTON3`);
  expect([pair(1), pair(2)], "Primary and Secondary both have the menu on Right and the spell on Middle").toEqual(["menu/spell", "menu/spell"]);
});

// TEST-ONLY saved lists of a character already moved to talent groups: Flash Heal on Middle and the menu on Right in
// Primary (key 1), Smite on Right in Secondary (key 2) when asked, and the last group the client named.
const groupLists = (remembered, secondary = "") => `VanguardCharDB = { clickcastStamps = { talentGroups = true }, clickcastGroup = ${remembered}, clickcast = {
  [1] = { { key = "BUTTON2", action = "menu" }, { key = "BUTTON3", action = "spell", value = "Flash Heal", spellID = 2061 } }${secondary} } }`;

it("Copy to never copies a list onto itself, and the page names the list it shows even when the client names no group", () => {
  const addon = priest("GetNumSpecializations = function() return 1 end", { savedVariables: groupLists(1) });
  addon.eval('ns.Options.Show("clickcast")');
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');
  expect(addon.eval(`return __wfgStub.frames[${copy}].choices()`), "the remembered group is not offered").toEqual([[2, "Copy to Secondary talents"]]);
  expect(addon.texts("Bindings for Primary talents on this character. Click a cell to pick a spell, right-click to clear, or drop a spell on it.").length, "the line names the list on screen").toBe(1);
  addon.eval(`${CC}.CopyToSpec(1)`);
  expect(savedKeys(addon, 1), "copying a list onto itself leaves it").toEqual(["BUTTON2", "BUTTON3"]);
});

it("Copy to asks before it replaces a list that has bindings, and not before it fills an empty one", () => {
  const secondary = ', [2] = { { key = "BUTTON2", action = "spell", value = "Smite" } }';
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: groupLists(1, secondary) });
  addon.eval('ns.Options.Show("clickcast")');
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect([addon.eval("return Vanguard_Question:IsShown()"), addon.texts("Replace the bindings of Secondary talents with these?").length], "it asks, naming the group").toEqual([true, 1]);
  expect(savedKeys(addon, 2), "and replaces nothing yet").toEqual(["BUTTON2"]);
  addon.click("Vanguard_Question.no");
  expect(savedKeys(addon, 2), "No keeps the list").toEqual(["BUTTON2"]);
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  addon.click("Vanguard_Question.confirm");
  expect([savedKeys(addon, 2), chatHas(addon, /copied to Secondary talents\./)], "Replace copies and says so").toEqual([["BUTTON2", "BUTTON3"], true]);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.eval(`${CC}.Clear()`);
  addon.eval("__wfgWorld.specGroup = 1 ns.Options.Refresh()");
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect([addon.eval("return Vanguard_Question:IsShown()"), savedKeys(addon, 2)], "an empty list is filled without a question").toEqual([false, ["BUTTON2", "BUTTON3"]]);
});

it("on WoW Forever the Clear all question, /vg binds and the Copy caption name the talent group, not the spec", () => {
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: groupLists(1) });
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('return __click("Clear all")');
  expect(addon.texts("Clear every click-casting binding for Primary talents? This can't be undone.").length).toBe(1);
  addon.click("Vanguard_Question.no");
  addon.clearChat();
  addon.slash("binds");
  expect(chatHas(addon, /Click casting \(Primary talents\):/), "/vg binds names the group").toBe(true);
  addon.eval(`${CC}.Clear()`);
  addon.clearChat();
  addon.slash("binds");
  expect(chatHas(addon, /No click-casting bindings for Primary talents\./), "and so does its empty line").toBe(true);
  const plain = priest("");
  plain.slash("binds");
  expect(chatHas(plain, /No click-casting bindings for this spec\./), "without talent groups it says spec").toBe(true);
  plain.eval('ns.Options.Show("clickcast") return __click("Clear all")');
  expect(plain.texts("Clear every click-casting binding for this spec? This can't be undone.").length).toBe(1);
});

it("the talent-group migration finds the old list under the specialization index, 0 or any other key, and stamps only when it has something to go by", () => {
  // The old list under a key, the client answering a specialization index (or none), and the saved lists after the first read.
  const after = (key, index) => {
    const addon = priest(`__wfgWorld.specGroup = 1 ${index === null ? "" : `__wfgWorld.spec = ${index}`}`, { savedVariables: oldList(key) });
    return [savedKeys(addon, 1), savedKeys(addon, 2), migrated(addon)];
  };
  const both = [["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"], true];
  expect(after(0, 5), "the list at 0 while the client now answers specialization 5").toEqual(both);
  expect(after(5, null), "the list at 5 while the client now answers none").toEqual(both);
  expect(after(3, 3), "the list at the answered index").toEqual(both);
  const fresh = priest("__wfgWorld.specGroup = 1", { savedVariables: "VanguardCharDB = {}" });
  expect([savedKeys(fresh, 1), migrated(fresh)], "nothing saved and no group in use: nothing stamped").toEqual([{}, false]);
  fresh.eval(`${CC}.Add("BUTTON4", "focus")`);
  fresh.eval(`${CC}.Bindings()`);
  expect(migrated(fresh), "once a group holds bindings the character is moved over").toBe(true);
});

it("Swap them says in chat which lists it changed, the notice says when it also fixes the other talent group, and a macro on Right click is swapped too", () => {
  const both = 'VanguardCharDB = { clickcast = { [0] = { { key = "BUTTON2", action = "macro", value = "/cast Flash Heal" }, { key = "BUTTON3", action = "menu" } } } }';
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: both });
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts(`${MENU_NOTICE} This also fixes Secondary talents, which has the same bindings.`).length, "the notice names the other group").toBe(1);
  addon.clearChat();
  addon.eval('__click("Swap them")');
  expect([chatHas(addon, /Unit menu moved to Right click, and what was on Right click to Middle click \(Primary talents\)\./), chatHas(addon, /\(Secondary talents\)\./)], "one line for each list changed").toEqual([true, true]);
  expect(addon.eval(`local out = {} for _, b in ipairs(${CC}.Bindings(2)) do out[b.key] = b.action end return out.BUTTON2 .. "/" .. out.BUTTON3`), "the macro went to Middle in Secondary too").toBe("menu/macro");
});

it("a healer with the old layouts' menu click is told once in chat at login, and not once it is swapped or dismissed", () => {
  const old = 'VanguardCharDB = { clickcast = { [0] = { { key = "BUTTON2", action = "spell", value = "Flash Heal" }, { key = "BUTTON3", action = "menu" } } } }';
  const told = /Middle click can't open the unit menu on your raid frames\. \/vg > Click casting/;
  const addon = priest(GAME_CLICKS_LUA, { savedVariables: old });
  expect(chatHas(addon, told), "told at login").toBe(true);
  addon.clearChat();
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(chatHas(addon, told), "and only once").toBe(false);
  const dismissed = priest(GAME_CLICKS_LUA, { savedVariables: old + ' VanguardCharDB.clickcastStamps = { menuNotice = true }' });
  expect(chatHas(dismissed, told), "not after a dismissal").toBe(false);
  expect(chatHas(priest(GAME_CLICKS_LUA), told), "not for a list that doesn't have the shape").toBe(false);
});
