// clickcast: the spell catalog, binding records and the no-typing options page,
// in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn } from "./helpers.mjs";

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
  expect(layout).toMatchObject({ BUTTON1: "target:nil", BUTTON3: "menu:nil", BUTTON2: "spell:Flash Heal", "alt-BUTTON2": "spell:Resurrection" });
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
  addon.eval(`${CC}.Move("ctrl-BUTTON2", "BUTTON5") ${CC}.Move("BUTTON4", "BUTTON4") ${CC}.Move("nope", "BUTTON4")`);
  expect(bindings(addon)).toMatchObject({ BUTTON5: "spell:Flash Heal:2061:1", "ctrl-BUTTON2": "focus:nil:nil:nil" });
  expect(addon.eval(`${CC}.Move("BUTTON4", "alt-BUTTON3") return ${CC}.Binding("alt-BUTTON3").value`), "moving to an empty key just moves").toBe("Renew");
  addon.eval(`${CC}.CopyToSpec(2)`);
  expect(addon.eval(`return #${CC}.Bindings(2), ${CC}.Bindings(2)[1].key`)).toBe(5);
  const text = addon.eval(`return ${CC}.Export()`);
  expect(/^VG1:clickcast:/.test(text)).toBe(true);
  addon.eval(`${CC}.Clear()`);
  expect(addon.eval(`return #${CC}.Bindings(), ${CC}.frames[1]:GetAttribute("type5")`)).toBe(0);
  expect(addon.eval(`return ${CC}.Import(${JSON.stringify(text)})`), "importing brings them back").toBe(5);
  expect(bindings(addon).BUTTON5).toBe("spell:Flash Heal:2061:1");
  expect(addon.eval(`local n, err = ${CC}.Import("garbage") return err`)).toBe("not a Vanguard profile string");
  expect(addon.eval(`local n, err = ${CC}.Import(ns.Serialize.Encode("profile", { a = 1 })) return err`)).toBe("not a click-casting string");
  const odd = addon.eval(`return ns.Serialize.Encode("clickcast", { bindings = { { key = 1 }, { key = "BUTTON4", action = "target" } } })`);
  expect(addon.eval(`return ${CC}.Import(${JSON.stringify(odd)})`), "malformed entries are skipped").toBe(1);
  addon.eval(`${CC}.ApplyLayout(${CS}.Layout())`);
  expect(bindings(addon)).toMatchObject({ BUTTON1: "target:nil:nil:nil", BUTTON3: "menu:nil:nil:nil", "alt-BUTTON2": "spell:Resurrection:2006:nil" });
  expect(bindings(addon).BUTTON2.startsWith("spell:Flash Heal:"), "the layout's spells bind by name").toBe(true);
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

it("the grid picks spells from the spellbook, with ranks, drops and clears", () => {
  const addon = priest();
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.frames("w.key ~= nil and w.iconFrame ~= nil and w.empty ~= nil").length, "five mouse buttons by four modifiers").toBe(20);
  addon.click(cell(addon, "ctrl-BUTTON2"));
  expect(addon.frame("Vanguard_SpellPicker").visible, "clicking a cell opens the picker").toBe(true);
  expect(addon.texts("HEALS").length === 1 && addon.texts("ACTIONS").length === 0, "groups are headed; the actions are further down").toBe(true);
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
  expect(bindings(addon)).toMatchObject({ BUTTON1: "target:nil:nil:nil", "ctrl-BUTTON1": "spell:Dispel Magic:527:nil" });
  expect(bindings(addon).BUTTON2.startsWith("spell:Flash Heal:")).toBe(true);
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
  expect(addon.texts("That's a mouse button: it lives in the grid above.").length).toBe(1);
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
  addon.click(tile, "RightButton");
  expect(addon.eval(`return __wfgStub.frames[${tile}].result:GetText()`)).toBe("Right click -> Flash Heal on Tester");
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
  expect(addon.eval('return __click("Clear all")') && addon.eval(`return #${CC}.Bindings()`)).toBe(0);
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
  addon.eval("ns.Options.Refresh()");
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
