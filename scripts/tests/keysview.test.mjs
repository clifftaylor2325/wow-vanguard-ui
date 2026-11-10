// keysview: the "Your keys" card on the Action bars page, in Vanguard's real Lua in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY: a spell on bar 1 button 1 (key 1), a bag key, and Shift-Q on bar 2 button 1.
function withKeys(extra = "") {
  const addon = loggedIn(extra);
  addon.world.learn(133, { name: "Fireball" });
  addon.world.setAction(1, { id: 133 });
  addon.eval('__wfgWorld.bindings.MULTIACTIONBAR1BUTTON1 = { "SHIFT-Q" }');
  addon.eval('ns.Options.Show("actionbars") ns.Options.ShowTab("Your keys")');
  return addon;
}

// A key on the card: its chord, label, icon, entry and label colour token.
const cap = (addon, key) => addon.eval(`
  for _, w in ipairs(__wfgStub.frames) do
    if w.key == "${key}" and w.chord and w:IsVisible() then
      local e = w.entry
      return { chord = w.chord, label = w.label:GetText(), icon = w.icon:IsShown() and w.icon.__texture or false,
        place = e and e.place, name = e and e.name, color = ns.Theme.ColorToken(w.label), alpha = w:GetAlpha() }
    end
  end`);
// The card's list lines, without the empty ones.
const lines = (addon) => addon.eval(`
  for _, w in ipairs(__wfgStub.frames) do
    if w.lines and w:IsVisible() then
      local out = {}
      for _, fs in ipairs(w.lines) do if fs:GetText() ~= "" then out[#out + 1] = fs:GetText() end end
      return out
    end
  end`);

it("your keys: a key shows the icon and name of what is on it, a game command shows its name, a free key is muted", () => {
  const addon = withKeys();
  expect(cap(addon, "1"), "key 1 is bar 1 button 1").toMatchObject({ chord: "1", label: "1", icon: "Interface\\Icons\\Spell_Fire_FlameBolt", place: "Bar 1 button 1", name: "Fireball", color: "text" });
  expect(cap(addon, "B"), "a game key shows its command, no icon").toMatchObject({ icon: false, place: "TOGGLEBACKPACK", color: "accentText" });
  expect(cap(addon, "Q"), "a free key is muted, at full alpha so its border and label stay crisp").toMatchObject({ icon: false, color: "muted", alpha: 1 });
  expect(addon.eval("local C = ns.KeysView.CapColor return { C({ icon = 1 }), C({}), C(nil) }"), "the shared rule key setup's preview uses too").toEqual(["text", "accentText", "muted"]);
  expect(cap(addon, "SPACE").label, "the space bar uses the short name").toBe("Sp");
  expect(lines(addon).some((l) => l.includes("Bar 1 button 1 · Fireball")), "the list says what key 1 does").toBe(true);
});

it("your keys: a macro and an item slot are named by kind, an empty slot shows no name", () => {
  const addon = withKeys();
  addon.world.setAction(1, { type: "macro", macro: "Pull", icon: "TEST-ONLY-M" });
  addon.eval("ns.Options.Refresh()");
  expect(cap(addon, "1").name, "a macro by its name").toBe("Pull");
  addon.world.setAction(1, { type: "item", icon: "TEST-ONLY-I" });
  addon.eval("ns.Options.Refresh()");
  expect(cap(addon, "1").name, "an item by kind").toBe("Item");
  addon.world.setAction(1, { type: "equipmentset", icon: "TEST-ONLY-E" });
  addon.eval("ns.Options.Refresh()");
  expect(cap(addon, "1").name ?? null, "anything else has no name").toBeNull();
  addon.world.setAction(1, null);
  addon.eval("ns.Options.Refresh()");
  expect(cap(addon, "1").icon, "an empty slot has no icon").toBe(false);
});

it("your keys: a secret icon is never shown", () => {
  const addon = withKeys("issecretvalue = function(v) return __wfgRawType(v) == 'table' and rawget(v, '__secret') == true end");
  addon.eval("C_ActionBar.GetActionTexture = function() return { __secret = true } end ns.Options.Refresh()");
  expect(cap(addon, "1").icon, "the icon is dropped").toBe(false);
});

it("H31-4-1: with the game's deprecation fallbacks off (no GetActionTexture or GetActionText globals), the card reads slots through C_ActionBar", () => {
  const addon = withKeys("GetActionText = nil GetActionTexture = nil");
  expect(addon.eval("return #ns.errors"), "opening Your keys raises nothing").toBe(0);
  expect(cap(addon, "1"), "key 1 still shows Fireball's icon").toMatchObject({ icon: "Interface\\Icons\\Spell_Fire_FlameBolt", name: "Fireball" });
  addon.world.setAction(1, { type: "macro", macro: "Pull", icon: "TEST-ONLY-M" });
  addon.eval("ns.Options.Refresh()");
  expect(cap(addon, "1"), "and a macro's name and icon").toMatchObject({ name: "Pull", icon: "TEST-ONLY-M" });
  addon.eval("C_ActionBar.GetActionTexture = nil ns.Options.Refresh()");
  expect(cap(addon, "1").icon, "a client with neither call shows no icon").toBe(false);
});

// Clicks the tab with this id on the card.
const clickTab = (addon, id) => addon.click(addon.eval(`for i, w in ipairs(__wfgStub.frames) do if w.tabId == "${id}" and w:IsVisible() then return i end end`));
// The tab showing now.
const showing = (addon) => addon.eval("return ns.KeysView.tab");

it("your keys: the Shift tab shows the Shift keys", () => {
  const addon = withKeys();
  clickTab(addon, "shift");
  expect(cap(addon, "Q"), "Shift-Q is bar 2 button 1").toMatchObject({ chord: "SHIFT-Q", place: "Bar 2 button 1" });
  expect(lines(addon).some((l) => l.includes("Bar 2 button 1")), "and the list says so").toBe(true);
});

it("your keys: a held modifier shows its tab and letting go goes back to the tab clicked", () => {
  const addon = withKeys();
  for (const [mod, tab] of [["alt", "alt"], ["ctrl", "ctrl"], ["shift", "shift"]]) {
    addon.keys({ [mod]: true });
    addon.fire("MODIFIER_STATE_CHANGED");
    expect(showing(addon), `${mod} held`).toBe(tab);
    addon.keys({ [mod]: false });
    addon.fire("MODIFIER_STATE_CHANGED");
    expect(showing(addon), `${mod} let go`).toBe("none");
  }
  clickTab(addon, "ctrl");
  addon.keys({ alt: true });
  addon.fire("MODIFIER_STATE_CHANGED");
  addon.keys({ alt: false });
  addon.fire("MODIFIER_STATE_CHANGED");
  expect(showing(addon), "a clicked tab is not lost to a tap of another modifier").toBe("ctrl");
});

it("your keys: a tab with no keys says so, and a long list ends in 'and N more'", () => {
  const addon = withKeys();
  addon.eval("ns.KeysView.tab = 'alt' ns.Options.Refresh()");
  expect(lines(addon), "no Alt keys").toEqual(["No keys are bound here."]);
  addon.eval("for i, k in ipairs({ 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Z' }) do __wfgWorld.bindings['TEST_CMD' .. i] = { k } end ns.KeysView.tab = 'none' ns.Options.Refresh()");
  const out = lines(addon);
  expect(out.length, "eight lines").toBe(8);
  expect(out[7], "the last line counts the rest").toBe("and 7 more");
});

// Runs a key's enter and leave scripts and answers the tooltip's lines as it showed them (nil when the key isn't on the card).
const hover = (addon, key) => addon.eval(`
  for _, w in ipairs(__wfgStub.frames) do
    if w.key == "${key}" and w.chord and w:IsVisible() then
      w:GetScript("OnEnter")(w)
      local out = {}
      for _, l in ipairs(GameTooltip.__lines) do out[#out + 1] = l.text end
      w:GetScript("OnLeave")(w)
      return out
    end
  end`);

it("your keys: hovering a key names its place and what is on it; a free key says it is free", () => {
  const addon = withKeys();
  expect(hover(addon, "1"), "a bound key").toEqual(["1", "Bar 1 button 1", "Fireball"]);
  expect(hover(addon, "Q"), "a free key").toEqual(["Q", "Nothing is bound to this key."]);
});

it("your keys: the tooltip works in combat too", () => {
  const addon = withKeys();
  setCombat(addon, true);
  expect(hover(addon, "1")?.[1], "the place is still read").toBe("Bar 1 button 1");
});

it("your keys: a hidden card ignores the modifier", () => {
  const addon = withKeys();
  addon.eval("ns.Options.Hide()");
  addon.keys({ shift: true });
  addon.fire("MODIFIER_STATE_CHANGED");
  expect(showing(addon)).toBe("none");
});

it("your keys: hidden values and odd buttons never break the card", () => {
  const addon = withKeys("issecretvalue = function(v) return __wfgRawType(v) == 'table' and rawget(v, '__secret') == true end");
  addon.eval("GetActionInfo = function() return { __secret = true }, { __secret = true } end ns.Options.Refresh()");
  expect(cap(addon, "1").name ?? null, "a secret kind has no name").toBeNull();
  addon.eval("GetActionInfo = function() return 'spell', { __secret = true } end ns.Options.Refresh()");
  expect(cap(addon, "1").name ?? null, "a secret spell id has no name").toBeNull();
  addon.eval("GetActionInfo = function() return 'macro' end C_ActionBar.GetActionText = function() return { __secret = true } end ns.Options.Refresh()");
  expect(cap(addon, "1").name ?? null, "a secret macro name is dropped").toBeNull();
  addon.eval("Vanguard_Bar1Button1.action = nil ns.Options.Refresh()");
  expect(cap(addon, "1"), "a button with no slot yet still names its place").toMatchObject({ place: "Bar 1 button 1", icon: false });
});

it("your keys: a key another addon points at a Vanguard button by override shows that button; two modifiers show None", () => {
  const addon = withKeys();
  addon.eval('local get = GetBindingAction GetBindingAction = function(k, o) if k == "Z" and o then return "CLICK Vanguard_Bar1Button1:LeftButton" end return get(k) end ns.Options.Refresh()');
  expect(cap(addon, "Z"), "Z fires bar 1 button 1").toMatchObject({ place: "Bar 1 button 1", name: "Fireball" });
  addon.keys({ shift: true, ctrl: true });
  addon.fire("MODIFIER_STATE_CHANGED");
  expect(addon.eval("return ns.KeysView.tab"), "two modifiers: no tab fits").toBe("none");
});

it("your keys: a modifier let go while the card was closed does not stick", () => {
  const addon = withKeys();
  addon.keys({ alt: true });
  addon.fire("MODIFIER_STATE_CHANGED");
  addon.eval("ns.Options.Hide()");
  addon.keys({ alt: false });
  addon.eval('ns.Options.Show("actionbars") ns.Options.ShowTab("Your keys")');
  expect(showing(addon)).toBe("none");
});

it("your keys: a changed binding or slot repaints the open card, and a closed one is left alone", () => {
  const addon = withKeys();
  addon.eval('__wfgWorld.bindings.TOGGLEBACKPACK = { "Q" }');
  addon.fire("UPDATE_BINDINGS");
  addon.fire("ACTIONBAR_SLOT_CHANGED", 1);
  addon.advance(2);
  expect(cap(addon, "Q").place, "Q now opens the bags").toBe("TOGGLEBACKPACK");
  addon.eval("ns.Options.Hide()");
  addon.fire("UPDATE_BINDINGS");
});

it("your keys: a key whose button is hidden is not reported as that button's", () => {
  const addon = withKeys();
  addon.eval("Vanguard_Bar1Button1:Hide() ns.Options.Refresh()");
  expect(cap(addon, "1").place, "falls back to the game's command").toBe("ACTIONBUTTON1");
});

it("H17-2-1: a key's icon is cropped like every other game icon, so the art's bevel stays out of the key", () => {
  const addon = withKeys();
  const coords = addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.key == "1" and w.chord and w:IsVisible() then return w.icon.__texCoord end
  end`);
  const edge = addon.eval("return ns.Theme.ICON_EDGE");
  expect(coords, "the icon shows the middle of the art, T.ICON_EDGE trimmed off each side").toEqual([edge, 1 - edge, edge, 1 - edge]);
});

// The key sitting at a place in the drawn main block (row 1 is the function row), by its slot.
const keyAt = (addon, row, col) => addon.eval(`
  for _, w in ipairs(__wfgStub.frames) do
    if w.slot and w.slot[1] == ${row} and w.slot[2] == ${col} and w:IsVisible() then return w.key end
  end`);
// Picks a layout in the card's dropdown (its set function, as a menu pick calls it) and returns the dropdown's text.
const pickLayout = (addon, id) => addon.eval(`
  for _, w in ipairs(__wfgStub.frames) do
    if w.layout and w:IsVisible() then w.layout.set("${id}") w.layout:Refresh() return w.layout.text:GetText() end
  end`);

it("your keys: the picture has the function row and the number pad, and a bound one shows its place", () => {
  const addon = withKeys('__wfgWorld.bindings.MULTIACTIONBAR1BUTTON2 = { "F5" } __wfgWorld.bindings.MULTIACTIONBAR1BUTTON3 = { "NUMPAD7" }');
  expect(cap(addon, "F5"), "a function key").toMatchObject({ chord: "F5", place: "Bar 2 button 2" });
  expect(cap(addon, "NUMPAD7"), "a number pad key").toMatchObject({ chord: "NUMPAD7", label: "N7" });
  for (const key of ["F1", "F12", "NUMPADDIVIDE", "NUMPADPLUS", "NUMPAD0", "NUMPADDECIMAL"]) expect(cap(addon, key), key).toMatchObject({ chord: key });
  expect(lines(addon).some((l) => l.includes("Bar 2 button 2")), "and the list says so").toBe(true);
});

it("your keys: the letters follow the layout of the client's locale until one is picked", () => {
  const addon = withKeys();
  expect([keyAt(addon, 3, 1), keyAt(addon, 5, 1)], "QWERTY by default").toEqual(["Q", "Z"]);
  addon.eval('GetLocale = function() return "deDE" end ns.Options.Show("actionbars") ns.Options.ShowTab("Your keys")');
  expect([keyAt(addon, 3, 6), keyAt(addon, 5, 1)], "German: Y and Z swap").toEqual(["Z", "Y"]);
  addon.eval('GetLocale = function() return "frFR" end');
  expect(pickLayout(addon, "bogus"), "an unknown pick is Automatic").toBe("Automatic");
  expect([keyAt(addon, 3, 1), keyAt(addon, 4, 1), keyAt(addon, 4, 10)], "French: AZERTY").toEqual(["A", "Q", "M"]);
});

it("your keys: a layout picked wins over the locale and repaints the keys with what is on them", () => {
  const addon = withKeys('__wfgWorld.bindings.MULTIACTIONBAR1BUTTON2 = { "W" }');
  expect(pickLayout(addon, "azerty"), "the dropdown names it").toBe("AZERTY");
  expect(keyAt(addon, 5, 1), "AZERTY's W is at the Z place").toBe("W");
  expect(cap(addon, "W"), "and shows what is on W").toMatchObject({ place: "Bar 2 button 2" });
  expect(pickLayout(addon, "qwertz"), "QWERTZ").toBe("QWERTZ");
  expect(keyAt(addon, 3, 6), "Z is on the Y place").toBe("Z");
  expect(pickLayout(addon, "auto"), "back to the locale's").toBe("Automatic");
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
