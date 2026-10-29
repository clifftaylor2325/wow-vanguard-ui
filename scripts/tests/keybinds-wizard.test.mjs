// keybinds-wizard: key setup's window (Modules/KeybindsWizard.lua) and the Your keys card's key setup controls, in
// the TEST-ONLY headless client: the three steps, the drawn keyboard's proposed keys, pressing a key over it, the
// list of changes with tick boxes, Apply in the key set picked, the reasons it changes nothing, the fight, the offer
// after first-run setup, and putting keys back from the card. Characters and icons here are test-only.

import { expect, it } from "vitest";
import { CLICK_LUA, RETAIL, chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY spells a level-12 warrior knows, with their icons: { id, name }.
const WARRIOR_SPELLS = [[78, "Heroic Strike"], [772, "Rend"], [7384, "Overpower"], [6343, "Thunder Clap"],
  [7386, "Sunder Armor"], [72, "Shield Bash"], [1715, "Hamstring"], [2687, "Bloodrage"], [100, "Charge"],
  [6673, "Battle Shout"], [2457, "Battle Stance"], [71, "Defensive Stance"], [20230, "Retaliation"]];

// TEST-ONLY: picks a value on a choice row, by its dropdown or its segment, as a player would.
const CHOOSE_LUA = `
  function __choose(row, value)
    if row.dropdown then row.dropdown.set(value) return end
    for _, seg in ipairs(row.segments) do if seg.value == value then seg.__scripts.OnClick(seg) end end
  end
`;

// A logged-in level-12 warrior with the stance bar's Battle and Defensive Stance (Retaliation stays unlearned).
function warrior(extra = "", opts = {}) {
  const addon = loggedIn(CLICK_LUA + CHOOSE_LUA + extra, opts);
  addon.eval('__wfgWorld.setUnit("player", { name = "Brakk", class = "WARRIOR", className = "Warrior", level = 12 })');
  for (const [id, name] of WARRIOR_SPELLS) if (id !== 20230) addon.world.learn(id, { name, icon: `TEST-ONLY-${id}` });
  addon.eval('__wfgWorld.setStances({ { spellID = 2457, icon = "TEST-ONLY-BS" }, { spellID = 71, icon = "TEST-ONLY-DS" } })');
  addon.clearChat();
  return addon;
}

// Runs the Your keys card's row with this caption, as its button does.
const cardButton = (addon, caption) => addon.eval(`for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then
  for _, r in ipairs(p.rows()) do if r[2] == "${caption}" then r[3]() return true end end end end return false`);

// Opens key setup from the Your keys card.
const open = (addon) => cardButton(addon, "Set up keys");

// The window's state: shown, step, caption and the footer's labels (a hidden button reads false).
const win = (addon) => addon.eval(`local f = Vanguard_KeysWizard
  local function label(b) return b:IsShown() and b.text:GetText() end
  return { shown = f:IsShown(), step = ns.KeybindsWizard.state.step, caption = f.caption:GetText(),
    left = label(f.notNow), back = label(f.back), main = label(f.next) }`);

// A key on the wizard's keyboard: its chord, icon (false for none), whether greyed, label colour and alpha.
const cap = (addon, key) => addon.eval(`for _, c in ipairs(Vanguard_KeysWizard.steps.preview.board.caps) do if c.key == "${key}" then
  return { chord = c.chord, icon = c.icon:IsShown() and c.icon.__texture or false, grey = c.icon.__desaturated == true,
    color = ns.Theme.ColorToken(c.label), alpha = c:GetAlpha() } end end`);

// The preview's list lines and the line about the key pressed.
const preview = (addon) => addon.eval(`local s = Vanguard_KeysWizard.steps.preview
  local out = {} for _, fs in ipairs(s.lines) do if fs:GetText() ~= "" then out[#out + 1] = fs:GetText() end end
  return { lines = out, result = s.result:GetText() }`);

// Step 3's shown rows: a change as "[x] text" or "[ ] text", a key that stays as its text.
const ready = (addon) => addon.eval(`local s = Vanguard_KeysWizard.steps.ready local out = {}
  for _, r in ipairs(s.pools.check) do if r:IsShown() then out[#out + 1] = (r.get() and "[x] " or "[ ] ") .. r.label:GetText() end end
  for _, fs in ipairs(s.pools.line) do if fs:IsShown() then out[#out + 1] = fs:GetText() end end
  return out`);

// The default tooltip's lines, as one text.
const tipText = (addon) => JSON.stringify(addon.eval("return GameTooltip.__lines"));

// The keyboard's frame, and its first key (the pointer on any key lets the keyboard read keys).
const BOARD = "ns.KeybindsWizard.frame.steps.preview.board";
const KEY = `${BOARD}.caps[1]`;

// The commands of some keys.
const keys = (addon, list) => addon.eval(`local out = {} for i, k in ipairs({ ${list.map((k) => `"${k}"`).join(",")} }) do out[i] = GetBindingAction(k) end return out`);

it("step 1: the question for your class, your role and your mouse; Keep my keys closes and changes nothing", () => {
  const addon = warrior();
  expect(open(addon), "the Your keys card has a Set up keys button on WoW Forever").toBe(true);
  expect(win(addon)).toEqual({ shown: true, step: 1, caption: "Step 1 of 3: Your keys", left: "Keep my keys", back: false, main: "Show me" });
  expect(addon.texts("Set up recommended keys for your Warrior?").length).toBe(1);
  expect(addon.eval("local s = Vanguard_KeysWizard.steps.start return { s.role:IsShown(), s.sides:IsShown(), s.role.get() }")).toEqual([true, true, "levelling"]);
  expect(addon.eval('return __click("Keep my keys")') && win(addon).shown).toBe(false);
  expect(chatHas(addon, /Nothing has changed\. You can open key setup again from Action bars, Your keys\.$/)).toBe(true);
  expect(keys(addon, ["F", "G"])).toEqual(["", ""]);
});

it("step 2: the keyboard shows each proposed key with its new icon, and the list says what changes", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me")');
  expect(win(addon)).toEqual({ shown: true, step: 2, caption: "Step 2 of 3: Here's what changes", left: "Not now", back: "Back", main: "Next" });
  expect(cap(addon, "F")).toEqual({ chord: "F", icon: "TEST-ONLY-72", grey: false, color: "accentText", alpha: 1 });
  expect(cap(addon, "1"), "key 1 on the Battle Stance page").toMatchObject({ icon: "TEST-ONLY-78", color: "accentText" });
  expect(cap(addon, "Q"), "a key that doesn't change is faint").toMatchObject({ icon: false, color: "disabled", alpha: 0.55 });
  expect(cap(addon, "`"), "the stance key shows the form's icon").toMatchObject({ icon: "TEST-ONLY-BS", color: "accentText" });
  expect(preview(addon).lines).toEqual(["F: Shield Bash added to your bar", "T: Hamstring added to your bar", "G: Bloodrage added to your bar",
    "Mouse Button 4: Charge added to your bar", "and 5 more"]);
});

it("step 2: the bar page shows another stance's keys, and the tabs show the Shift keys", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me") local s = Vanguard_KeysWizard.steps.preview __choose(s.page, 2) __choose(s.tabs, "shift")');
  expect(addon.eval("return Vanguard_KeysWizard.steps.preview.page:IsShown()"), "a warrior has a page per stance").toBe(true);
  expect(cap(addon, "W")).toMatchObject({ chord: "SHIFT-W", icon: "TEST-ONLY-6673", color: "accentText" });
  expect(preview(addon).lines).toEqual(["SHIFT-W: Battle Shout added to your bar", "SHIFT-`: Defensive Stance"]);
  addon.eval('__choose(Vanguard_KeysWizard.steps.preview.tabs, "none")');
  expect(cap(addon, "1"), "key 1 on the Defensive Stance page").toMatchObject({ icon: "TEST-ONLY-7386" });
  addon.eval('__choose(Vanguard_KeysWizard.steps.preview.tabs, "ctrl")');
  expect(preview(addon).lines, "nothing changes on the Ctrl tab").toEqual(["No key changes here."]);
  addon.eval('__choose(Vanguard_KeysWizard.steps.preview.page, 3)');
  expect(preview(addon).lines, "the Berserker page waits for Berserker Stance").toEqual(["You haven't learned 2458 yet."]);
});

it("step 2: a key pressed over the keyboard lights up and says what it will do, and nothing is cast", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me")');
  addon.hover(KEY);
  expect(addon.eval(`return ${KEY}:IsKeyboardEnabled()`), "the keyboard reads keys while the pointer is over it").toBe(true);
  addon.key(KEY, "F");
  expect(preview(addon).result).toBe("F: Shield Bash added to your bar");
  expect(cap(addon, "F").color, "the key pressed is lit").toBe("accent");
  addon.keys({ shift: true });
  addon.key(KEY, "W");
  expect([preview(addon).result, cap(addon, "W").chord], "Shift-W shows the Shift tab").toEqual(["SHIFT-W: Battle Shout added to your bar", "SHIFT-W"]);
  addon.keys({ shift: true, ctrl: true });
  addon.key(KEY, "Q");
  expect([preview(addon).result, cap(addon, "Q").chord], "a chord no tab shows keeps the tab").toEqual(["CTRL-SHIFT-Q: stays as it is", "SHIFT-Q"]);
  addon.keys({ shift: true });
  addon.key(KEY, "-");
  expect(cap(addon, "-").chord, "Shift and the minus key show the Shift tab").toBe("SHIFT--");
  addon.keys({});
  addon.key(KEY, "ESCAPE");
  expect(addon.eval(`return ${KEY}.__propagate`), "Escape goes on to the game").toBe(true);
  addon.hover(null);
  expect(addon.eval(`return ${KEY}:IsKeyboardEnabled()`)).toBe(false);
  addon.hover(BOARD);
  expect(addon.eval(`return ${BOARD}.__mouse and ${BOARD}:IsKeyboardEnabled()`), "the gaps between keys read keys too").toBe(true);
  addon.hover(KEY);
  addon.eval("Vanguard_KeysWizard:Hide()");
  expect(addon.eval(`return ${KEY}:IsKeyboardEnabled()`), "a key hidden under the pointer lets the keyboard go").toBe(false);
});

it("step 2: Show what comes later greys in the spells the character will learn", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me")');
  expect(cap(addon, "X").icon, "Retaliation isn't learned yet").toBe(false);
  addon.eval('__click("Show what comes later")');
  expect(cap(addon, "X")).toMatchObject({ grey: true, color: "disabled", alpha: 0.55 });
  addon.eval(`for _, c in ipairs(${BOARD}.caps) do if c.key == "X" then c.__scripts.OnEnter(c) end end`);
  expect(tipText(addon)).toContain("Later: 20230, once you learn it");
  addon.eval(`for _, c in ipairs(${BOARD}.caps) do if c.key == "F" then c.__scripts.OnEnter(c) end end`);
  expect(tipText(addon)).toContain("F: Shield Bash added to your bar");
});

it("step 3: every change with a tick box, the keys that stay, and Apply in this character's own keys", () => {
  const addon = warrior("ns.KeybindsWizard.onApply[1] = function(p) __applied = p.class end");
  addon.world.setAction(62, { type: "macro", id: 3 });
  addon.eval('SetBinding("G", "TOGGLEBACKPACK") SaveBindings(1)');
  open(addon);
  addon.eval('__click("Show me") __click("Next")');
  expect(win(addon)).toMatchObject({ step: 3, caption: "Step 3 of 3: Ready", main: "Apply" });
  const rows = ready(addon);
  expect(rows).toContain("[x] F: Shield Bash added to your bar");
  expect(rows, "a key bound to something else says what it does now").toContain("[x] G: Bloodrage added to your bar (now TOGGLEBACKPACK)");
  expect(rows).toContain("[x] `: Battle Stance");
  expect(rows).toContain("T: unchanged, its button holds something key setup leaves alone (a macro, an item or a mount)");
  expect(addon.texts("Your keys are shared. Only this character: it gets its own key set, and your other characters keep theirs.").length).toBe(1);
  addon.eval('__click("G: Bloodrage")');
  expect(ready(addon)).toContain("[ ] G: Bloodrage added to your bar (now TOGGLEBACKPACK)");
  addon.eval('__click("Apply")');
  expect(win(addon).shown, "Apply closes the window").toBe(false);
  expect(keys(addon, ["F", "G", "1"])).toEqual(["MULTIACTIONBAR1BUTTON1", "TOGGLEBACKPACK", "ACTIONBUTTON1"]);
  expect(addon.eval("return { GetCurrentBindingSet(), select(2, GetActionInfo(61)), select(2, GetActionInfo(73)), __applied }"),
    "Only this character, pre-picked, gives the character its own keys").toEqual([2, 72, 78, "WARRIOR"]);
});

it("step 3: All my characters keeps the account's keys; a refused Apply leaves the window open", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me") __click("Next") __choose(Vanguard_KeysWizard.steps.ready.scope, "all")');
  expect(addon.texts("Your keys are shared: these keys change on all your characters.").length).toBe(1);
  addon.eval('__wfgWorld.cursor = { type = "item", id = 6948 } __click("Apply")');
  expect([win(addon).shown, chatHas(addon, /Put down what's on your cursor first\.$/)]).toEqual([true, true]);
  addon.eval("__wfgWorld.cursor = nil __click('Apply')");
  expect([win(addon).shown, addon.eval("return GetCurrentBindingSet()"), keys(addon, ["F"])[0]]).toEqual([false, 1, "MULTIACTIONBAR1BUTTON1"]);
});

it("step 3: a character with its own keys gets no scope choice; Back goes to the steps before", () => {
  const addon = warrior("__wfgWorld.bindingSet = 2");
  open(addon);
  addon.eval('__click("Show me") __click("Next")');
  expect(addon.eval("return Vanguard_KeysWizard.steps.ready.scope:IsShown()")).toBe(false);
  addon.eval('for _, r in ipairs(Vanguard_KeysWizard.steps.ready.pools.check) do if r:IsShown() and r.get() then r.__scripts.OnClick(r) end end __click("Apply")');
  expect([win(addon).shown, chatHas(addon, /Nothing is ticked, so no key changes\.$/)], "nothing ticked: it says so and stays").toEqual([true, true]);
  addon.eval('__click("Back")');
  expect(win(addon).step).toBe(2);
  addon.eval('__click("Not now")');
  expect([win(addon).shown, chatHas(addon, /Nothing has changed\./)]).toEqual([false, true]);
});

it("step 3: a bar that is off and a rogue without roles", () => {
  const addon = loggedIn(CLICK_LUA, { savedVariables: "VanguardDB.profiles.Default = { modules = {}, ActionBars = { bars = { [3] = { enabled = false } } } }" });
  addon.eval('__wfgWorld.setUnit("player", { class = "ROGUE", className = "Rogue", level = 10 })');
  addon.world.learn(1752, { name: "Sinister Strike" });
  open(addon);
  expect(addon.eval("return Vanguard_KeysWizard.steps.start.role:IsShown()"), "a rogue picks no role").toBe(false);
  expect(addon.eval("return select(5, Vanguard_KeysWizard.steps.start.sides:GetPoint(1))"), "the mouse switch moves up into the role's place").toBe(-92);
  addon.eval('__click("Show me")');
  expect(addon.eval("return Vanguard_KeysWizard.steps.preview.page:IsShown()"), "the stealth page shows once Stealth is known").toBe(true);
});

it("why it changes nothing: a bar addon, Vanguard's bars off, a gamepad; and retail offers nothing", () => {
  const bartender = warrior("__wfgStub.world.loaded.Bartender4 = true");
  open(bartender);
  expect(bartender.texts("You use Bartender4 for your bars, so Vanguard won't change your keys. Your keys on the Action bars page still shows what every key does.").length).toBe(1);
  expect(win(bartender)).toMatchObject({ left: "Close", main: false });
  bartender.eval('__click("Close")');
  expect([win(bartender).shown, chatHas(bartender, /Nothing has changed/)], "Close says nothing more").toEqual([false, false]);
  expect(bartender.eval("return ns.KeybindsWizard.Offered()")).toBe(false);
  const noBars = warrior("", { savedVariables: "VanguardDB.profiles.Default = { modules = { ActionBars = false } }" });
  expect(noBars.eval("return ns.KeybindsWizard.Blocked()")).toBe("Vanguard's action bars are off, so key setup has no bars to put spells on.");
  const pad = warrior("InputUtil = { IsGamepadUIEnabled = function() return true end }");
  expect(pad.eval("return ns.KeybindsWizard.Blocked()")).toBe("You play with a gamepad, so Vanguard won't change your keys.");
  const classless = warrior();
  classless.eval('__wfgWorld.setUnit("player", { class = "TEST-ONLY", className = "Tester" })');
  expect(classless.eval("return ns.KeybindsWizard.Blocked()")).toBe("Key setup has no layout for your class yet.");
  const retail = loggedIn(CLICK_LUA, { client: RETAIL });
  expect([open(retail), cardButton(retail, "Put everything back")], "no key setup buttons on retail").toEqual([false, false]);
  retail.eval("ns.KeybindsWizard.Open()");
  expect([retail.eval("return Vanguard_KeysWizard == nil"), chatHas(retail, /Vanguard's key setup is for WoW Forever only\.$/)]).toEqual([true, true]);
});

it("a fight: key setup steps aside and comes back on its step; opened in a fight it waits; not with the game's key windows open", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me")');
  addon.world.combat(true);
  expect([win(addon).shown, chatHas(addon, /Key setup steps aside for the fight and comes back after it\.$/)]).toEqual([false, true]);
  addon.world.combat(false);
  expect(win(addon)).toMatchObject({ shown: true, step: 2 });
  addon.eval("Vanguard_KeysWizard:Hide()");
  addon.world.combat(true);
  addon.eval("ns.KeybindsWizard.Open()");
  expect(win(addon).shown).toBe(false);
  addon.world.combat(false);
  expect(win(addon)).toMatchObject({ shown: true, step: 1 });
  addon.eval("Vanguard_KeysWizard:Hide() CreateFrame('Frame', 'QuickKeybindFrame', UIParent) ns.KeybindsWizard.Open()");
  expect([win(addon).shown, chatHas(addon, /Close the game's Settings, Quick Keybind and Click Casting windows first\.$/)]).toEqual([false, true]);
});

it("the offer: first-run setup leaves a note, and key setup opens once at the next login", () => {
  const first = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "VanguardDB = { version = 2, profiles = {} }\nVanguardCharDB = {}" });
  first.eval('__click("Skip setup")');
  expect(first.eval("return VanguardCharDB.keysOffer")).toBe(true);
  const next = warrior("", { savedVariables: "VanguardCharDB.keysOffer = true" });
  expect([win(next).shown, next.eval("return VanguardCharDB.keysOffer")]).toEqual([true, false]);
  const later = warrior("", { savedVariables: "VanguardCharDB.keysOffer = false" });
  expect(later.eval("return Vanguard_KeysWizard == nil"), "only once").toBe(true);
  const lost = warrior("ns.SettingsGuard.Lost = function() return true end", { savedVariables: "VanguardCharDB.keysOffer = true" });
  expect(lost.eval("return Vanguard_KeysWizard == nil"), "not while the settings guard asks to restore").toBe(true);
  const news = warrior("Vanguard_WhatsNew = CreateFrame('Frame') Vanguard_WhatsNew:Show()", { savedVariables: "VanguardCharDB.keysOffer = true" });
  expect([news.eval("return Vanguard_KeysWizard == nil"), news.eval("return VanguardCharDB.keysOffer")], "What's new first; the note waits").toEqual([true, true]);
});

it("the Your keys card: right-click a key key setup changed to put it back, and Put everything back", () => {
  const addon = warrior();
  open(addon);
  addon.eval('__click("Show me") __click("Next") __click("Apply")');
  addon.eval('ns.Options.Show("actionbars") ns.Options.ShowTab("Your keys")');
  // A Lua expression for the Your keys card's cap of a key.
  const cardCap = (key) => `(function() for _, w in ipairs(__wfgStub.frames) do if w.key == "${key}" and w.entry ~= nil and w:IsVisible() and w:GetParent() ~= ${BOARD} then return w end end end)()`;
  addon.eval(`local w = ${cardCap("F")} w.__scripts.OnEnter(w)`);
  expect(tipText(addon)).toContain("Right-click to put back what this key did before key setup.");
  addon.eval(`local w = ${cardCap("F")} w.__scripts.OnClick(w, "LeftButton") w.__scripts.OnClick(w, "RightButton")`);
  expect(addon.texts("Put back what F did before key setup changed it?").length).toBe(1);
  addon.eval('__click("Put back")');
  expect(keys(addon, ["F", "T"])).toEqual(["", "MULTIACTIONBAR1BUTTON2"]);
  cardButton(addon, "Put everything back");
  expect(addon.texts("Put back every key key setup changed, and the spells it moved?").length, "Put everything back asks first").toBe(1);
  addon.eval('__click("Put back")');
  expect(keys(addon, ["T", "G"])).toEqual(["", ""]);
});

it("a warlock: the pet keys are listed by what they press", () => {
  const addon = warrior();
  addon.eval('__wfgWorld.setUnit("player", { class = "WARLOCK", className = "Warlock", level = 4 })');
  addon.world.learn(686, { name: "Shadow Bolt" });
  open(addon);
  addon.eval('__click("Show me") __click("Next")');
  expect(ready(addon)).toEqual(expect.arrayContaining(["[x] `: Pet Attack", "[x] SHIFT-`: Pet Follow", "[x] 1: Shadow Bolt added to your bar"]));
});
