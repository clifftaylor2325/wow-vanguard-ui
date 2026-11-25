// actionflyout: a flyout on a Vanguard action bar opens Vanguard's own list, never the game's SpellFlyout.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { loggedIn, pageBar1, setCombat } from "./helpers.mjs";

// TEST-ONLY flyouts in the world: 1 a three-spell Teleport (one spell not known), 2 a Call Pet (slot 1 without a
// pet), 3 a flyout bigger than the list, and the spell icons by id.
const FLYOUTS = `
  local function known(first, n) local out = {} for i = 1, n do out[i] = { spell = first + i } end return out end
  __wfgWorld.flyouts = {
    [1] = { name = "TEST-ONLY Teleport", slots = { { spell = 11 }, { spell = 12, known = false }, { spell = 13 } } },
    [2] = { name = "TEST-ONLY Call Pet", slots = { { spell = 100 }, { spell = 101 } } },
    [3] = { name = "TEST-ONLY Big", slots = known(1000, 25) },
  }
  C_Spell.GetSpellTexture = function(id) return "TEST-ONLY-ICON-" .. id end
`;

// TEST-ONLY: "Cast action keybinds on key down" off, so the game acts on a click's release (the edge the click
// cases below press with, run's default).
const KEY_UP = "__wfgWorld.cvars.ActionButtonUseKeyDown = '0'\n";

// One frame on, for the flyouts stored on the next frame after a change.
const nextFrame = (addon) => addon.update(0.01);

// Puts flyout id on an action slot (slot 1 is bar 1's first button), and lets the list store it.
const place = (addon, slot, id) => {
  addon.world.setAction(slot, { type: "flyout", id });
  nextFrame(addon);
};

// TEST-ONLY restricted environment: self and control are wrappers that hand back what the real frames answer
// (a frame given to a call by wrapper goes through as the real frame), with the button's rect and scale set.
const RESTRICTED = `
  local function wrap(frame, extra)
    local w = { __frame = frame }
    return setmetatable(w, { __index = function(_, k)
      if extra and extra[k] then return extra[k] end
      return function(_, ...)
        local args = { ... }
        for i = 1, select("#", ...) do if type(args[i]) == "table" and args[i].__frame then args[i] = args[i].__frame end end
        return frame[k](frame, unpack(args, 1, select("#", ...)))
      end
    end })
  end
  local flyout = Vanguard_Flyout
  local children = {}
  for i, c in ipairs(flyout.vgChildren) do children[i] = wrap(c) end
  local control = wrap(flyout, { GetChildren = function() return unpack(children) end })
`;

// Runs a snippet of the module as the client's restricted environment does, for a click on a bar button
// (down is the click's edge, rect the button's left, bottom, width and height). Returns what it returns.
// barRect is the button's bar's rect (default: the button's own).
const run = (addon, snippet, { button = "Vanguard_Bar1Button1", rect = "900, 40, 40, 40", barRect = rect, down = "false" } = {}) => addon.eval(`${RESTRICTED}
  local r, br = { ${rect} }, { ${barRect} }
  local bar = wrap(${button}:GetParent(), { GetRect = function() if br[1] then return unpack(br) end end, GetEffectiveScale = function() return 1 end })
  local self = wrap(${button}, { GetRect = function() if r[1] then return unpack(r) end end, GetEffectiveScale = function() return 1 end, GetParent = function() return bar end })
  local env = { self = self, control = control, down = ${down}, ipairs = ipairs, newtable = function(...) return { ... } end, GetActionInfo = GetActionInfo }
  local first, second = (setfenv and setfenv(loadstring(${snippet}, "snippet"), env) or load(${snippet}, "snippet", "t", env))()
  return { first == nil and "nil" or first, second == nil and "nil" or second }`);

// The list's state after a run: shown, who opened it, the spells and anchors of its first buttons.
const list = (addon) => addon.eval(`local f = Vanguard_Flyout local out = { f:IsShown(), f:GetAttribute("opened-by"), {}, {}, {} }
  for i = 1, 4 do local c = f.vgChildren[i] out[3][i] = c:IsShown() and c:GetAttribute("spell") or false end
  for i = 1, 2 do local c = f.vgChildren[i] local p = c.__points and next(c.__points) out[4][i] = p and c.__points[p].point or false end
  out[5] = f.vgChildren[1].__points and select(2, next(f.vgChildren[1].__points)).rel == Vanguard_Bar1Button1
  return out`);
const PRE = "ns.GetModule('ActionBars').FLYOUT_PRE";

it("the list is made once at login and every bar button's click is wrapped with it", () => {
  const addon = loggedIn(FLYOUTS);
  expect(addon.eval("return { Vanguard_Flyout:GetName(), Vanguard_Flyout:IsShown() }"), "with no flyout on a bar the list is there already, closed").toEqual(["Vanguard_Flyout", false]);
  place(addon, 1, 1);
  const wrapped = addon.eval(`local AB, n = ns.GetModule('ActionBars'), 0
    for _, b in ipairs(AB.buttons) do if b.__wraps and b.__wraps.OnClick == AB.FLYOUT_PRE and b.__wraps.OnHide == AB.FLYOUT_BUTTON_HIDE then n = n + 1 end end
    return n`);
  expect(wrapped, "every button's click and hiding are wrapped").toBe(36);
  const frame = addon.eval("local f = Vanguard_Flyout return { #f.vgChildren, f:GetAttribute('_onshow'), f:GetAttribute('_onhide'), f:GetAttribute('gap') }");
  expect(frame, "twenty spell buttons, Escape bound while it shows and freed when it hides").toEqual([20, 'self:SetBindingClick(true, "ESCAPE", "Vanguard_FlyoutClose")', "self:ClearBindings()", 2]);
  expect(addon.eval("local c = Vanguard_FlyoutClose return { c:GetAttribute('_onclick'), c.__frameRefs.flyout == Vanguard_Flyout }"), "the close button hides the list").toEqual(['self:GetFrameRef("flyout"):Hide()', true]);
  const placed = addon.eval("local f = Vanguard_Flyout local p, rel = f:GetPoint(1) local _, _, w, h = f:GetRect() return { p, rel == UIParent, w, h, f:GetFrameStrata() }");
  expect(placed, "the list has a rect of its own from the start: a button's size at the screen's middle").toEqual(["CENTER", true, 32, 32, "HIGH"]);
  place(addon, 2, 1);
  expect(addon.eval("return Vanguard_Flyout:GetName()"), "a second flyout does not make a second list").toBe("Vanguard_Flyout");
});

it("a flyout's known spells are stored for the snippet, a Call Pet slot without a pet and anything past the list's size left out", () => {
  const addon = loggedIn(FLYOUTS + "GetCallPetSpellInfo = function(spell) if spell == 100 then return 1, '' end if spell == 101 then return 2, 'TEST-ONLY Rex' end end");
  place(addon, 1, 1); place(addon, 2, 2); place(addon, 3, 3);
  // A flyout's stored count and its first n spells.
  const attrs = (id, n) => addon.eval(`local f = Vanguard_Flyout local out = { f:GetAttribute("flyout-${id}-count") } for i = 1, ${n} do out[#out + 1] = f:GetAttribute("flyout-${id}-" .. i) end return out`);
  expect(attrs(1, 2), "the unknown spell is skipped").toEqual([2, 11, 13]);
  expect(attrs(2, 1), "the empty pet slot is skipped").toEqual([1, 101]);
  expect(attrs(3, 1)[0], "a flyout of 25 is cut at the 20 buttons").toBe(20);
  expect(addon.eval("local f = Vanguard_Flyout return { f:GetAttribute('edge'), f:GetAttribute('screen-width') > 0, f:GetAttribute('screen-height') > 0 }"), "the click edge (key down, the world's default) and the screen size are stored").toEqual(["down", true, true]);
  addon.eval("__wfgWorld.cvars.ActionButtonUseKeyDown = '0'");
  addon.fire("CVAR_UPDATE", "autoLootDefault", "1");
  nextFrame(addon);
  expect(addon.eval("return Vanguard_Flyout:GetAttribute('edge')"), "another setting's change reads nothing again").toBe("down");
  addon.fire("CVAR_UPDATE", "ActionButtonUseKeyDown", "0");
  nextFrame(addon);
  expect(addon.eval("return Vanguard_Flyout:GetAttribute('edge')"), "key up is read again when its setting changes").toBe("up");
});

// TEST-ONLY flyout 7 with ranks, lowest first as the game gives them: two forms, then three ranks of one spell with an
// unknown one between them.
const RANKED = `
  __wfgWorld.flyouts = { [7] = { name = "TEST-ONLY Ranked", slots = {
    { spell = 5487, name = "TEST-ONLY Bear Form" }, { spell = 9634, name = "TEST-ONLY Dire Bear Form" }, { spell = 201, name = "TEST-ONLY Frost" },
    { spell = 202, name = "TEST-ONLY Frost", known = false }, { spell = 203, name = "TEST-ONLY Frost" } } } }
`;

// Flyout 7's stored count and its spells.
const ranked = (addon) => addon.eval(`local f = Vanguard_Flyout local n = f:GetAttribute("flyout-7-count") local out = { n } for i = 1, n do out[#out + 1] = f:GetAttribute("flyout-7-" .. i) end return out`);

it("on WoW Forever a flyout lists one button per spell, at the highest rank known, as the game's own flyout does", () => {
  const addon = loggedIn(RANKED);
  place(addon, 1, 7);
  expect(ranked(addon), "Frost's ranks are one button, its highest known rank").toEqual([3, 5487, 9634, 203]);
});

it("on Retail a flyout's slots are listed as they come, same names or not", () => {
  const addon = loggedIn(RANKED, { client: RETAIL_CLIENT });
  place(addon, 1, 7);
  expect(ranked(addon)).toEqual([4, 5487, 9634, 201, 203]);
});

it("a burst of slot changes in one frame stores the flyouts once, on the next frame", () => {
  const addon = loggedIn(FLYOUTS);
  place(addon, 1, 1);
  addon.eval("local AB = ns.GetModule('ActionBars') local show = AB.ShowFlyouts __stores = 0 AB.ShowFlyouts = function() __stores = __stores + 1 show() end");
  for (const slot of [4, 5, 6]) addon.world.setAction(slot, { type: "flyout", id: 2 });
  expect(addon.eval("return __stores"), "nothing is read in the frame of the changes").toBe(0);
  nextFrame(addon);
  expect(addon.eval("return { __stores, Vanguard_Flyout:GetAttribute('flyout-2-count') }"), "one store on the next frame, with the new flyout").toEqual([1, 2]);
});

it("a flyout stored in a fight waits for it to end, and a client without the Call Pet call lists every known spell", () => {
  const addon = loggedIn(FLYOUTS);
  place(addon, 1, 1);
  setCombat(addon, true);
  place(addon, 2, 2);
  expect(addon.eval("return Vanguard_Flyout:GetAttribute('flyout-2-count')"), "nothing is written in combat").toBe(null);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_Flyout:GetAttribute('flyout-2-count')"), "written after it, both spells (no Call Pet call to ask)").toBe(2);
});

it("a first flyout dragged onto a bar in a fight is the list's to open: the click is stopped until the fight ends", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  setCombat(addon, true);
  place(addon, 1, 1);
  expect(addon.eval("return { Vanguard_Bar1Button1.__wraps.OnClick == ns.GetModule('ActionBars').FLYOUT_PRE, Vanguard_Flyout:GetAttribute('flyout-1-count') == nil }"), "the button's click is wrapped; the spells wait for the fight's end").toEqual([true, true]);
  expect(run(addon, PRE), "the click is stopped, so the game's SpellFlyout is never asked").toEqual([false, "nil"]);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "with nothing stored the list stays closed").toBe(false);
  setCombat(addon, false);
  run(addon, PRE);
  expect([list(addon)[0], addon.eval("return #ns.errors")], "after the fight the click opens it").toEqual([true, 0]);
});

it("a click on a flyout slot opens the list above a bottom bar's button and stops the game's click", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1);
  expect(run(addon, PRE), "the click is stopped").toEqual([false, "nil"]);
  const state = list(addon);
  expect(state.slice(0, 3), "shown, opened by the button, the two known spells on the first two buttons and no more").toEqual([true, "Vanguard_Bar1Button1", [11, 13, false, false]]);
  expect([state[3], state[4]], "stacked upward from the button").toEqual([["BOTTOM", "BOTTOM"], true]);
  expect(addon.eval("return Vanguard_Flyout.vgChildren[1].icon.__texture"), "the buttons show their spells' icons").toBe("TEST-ONLY-ICON-11");
  expect(run(addon, PRE), "clicking the same button again").toEqual([false, "nil"]);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "closes it").toBe(false);
});

it("a bar with no stored orientation: the list opens toward the middle of the screen: down from the top, right from the left edge, left from the right edge", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1);
  addon.eval("Vanguard_Bar1:SetAttribute('orientation', nil)");
  // The first spell button's anchor point, after closing the list for the next run.
  const point = () => addon.eval("local c = Vanguard_Flyout.vgChildren[1] Vanguard_Flyout:Hide() return (next(c.__points))");
  run(addon, PRE, { rect: "900, 1000, 40, 40" });
  expect(point(), "a button high on the screen: the list hangs below it").toBe("TOP");
  run(addon, PRE, { rect: "20, 500, 40, 40" });
  expect(point(), "at the left edge: to its right").toBe("LEFT");
  run(addon, PRE, { rect: "1850, 500, 40, 40" });
  expect(point(), "at the right edge: to its left").toBe("RIGHT");
  run(addon, PRE, { rect: "nil" });
  expect(point(), "a button with no rect yet: above it").toBe("BOTTOM");
});

// H47-8-1. The game's rule: ActionBarMixin:UpdateSpellFlyoutDirection (Blizzard_ActionBar/Shared/ActionBar.lua): a horizontal
// bar opens UP below the screen's middle and DOWN above it, a vertical one LEFT right of the middle and RIGHT left of it,
// by the bar's centre, so the list never lies over the bar's own buttons.
it("H47-8-1 the list opens away from its bar: up or down from a horizontal bar, left or right from a vertical one", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1);
  // The first spell button's anchor point, after closing the list for the next run.
  const point = () => addon.eval("local c = Vanguard_Flyout.vgChildren[1] Vanguard_Flyout:Hide() return (next(c.__points))");
  expect(addon.eval("return Vanguard_Bar1:GetAttribute('orientation')"), "twelve to a row").toBe("horizontal");
  run(addon, PRE, { rect: "1850, 100, 40, 40", barRect: "900, 40, 1000, 40" });
  expect(point(), "a horizontal bar's rightmost button at the right edge: still above, not left over its neighbours").toBe("BOTTOM");
  run(addon, PRE, { rect: "20, 1000, 40, 40", barRect: "20, 1000, 1000, 40" });
  expect(point(), "a horizontal bar in the top half: below").toBe("TOP");
  addon.eval("local AB = ns.GetModule('ActionBars') AB.settings.bars[1].perRow = 1 AB.LayoutBar(1)");
  expect(addon.eval("return Vanguard_Bar1:GetAttribute('orientation')"), "one to a row").toBe("vertical");
  run(addon, PRE, { rect: "900, 500, 40, 40", barRect: "900, 100, 40, 900" });
  expect(point(), "a vertical bar in the screen's middle band, left half: to its right").toBe("LEFT");
  run(addon, PRE, { rect: "1200, 500, 40, 40", barRect: "1200, 100, 40, 900" });
  expect(point(), "right half: to its left").toBe("RIGHT");
  run(addon, PRE, { rect: "1200, 500, 40, 40", barRect: "nil" });
  expect(point(), "a bar with no rect yet: above the button").toBe("BOTTOM");
});

// H47-8-3. The game's list buttons run UpdateCooldown and UpdateUsable on SPELL_UPDATE_COOLDOWN, SPELL_UPDATE_USABLE
// and SPELL_FLYOUT_UPDATE (Blizzard_ActionBar/Shared/SpellFlyout.lua, SpellFlyoutMixin:OnEvent).
it("H47-8-3 the list's spell buttons show a cooldown sweep and dim a spell that can't be cast, and follow the events while open", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS + "__cd = {} C_Spell.GetSpellCooldownDuration = function(id) return __cd[id] end C_Spell.IsSpellUsable = function(id) return id ~= 13, id == 13 end");
  place(addon, 1, 1);
  run(addon, PRE);
  // Whether button i's icon wears the theme's token (by its vertex colour).
  const tinted = (i, token) => addon.eval(`local c = Vanguard_Flyout.vgChildren[${i}].icon.__vertexColor local r, g, b = ns.Theme.RGB("${token}") return c[1] == r and c[2] == g and c[3] == b`);
  expect(tinted(1, "white"), "a castable spell keeps its colour").toBe(true);
  expect(tinted(2, "noPower"), "a spell short of power wears the no-power tint").toBe(true);
  addon.eval("__cd[11] = { TEST_ONLY_DURATION = true }");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(addon.eval("return Vanguard_Flyout.vgChildren[1].cooldown.__durationObject ~= nil"), "a spell on cooldown sweeps").toBe(true);
  expect(addon.eval("return Vanguard_Flyout.vgChildren[2].cooldown.__durationObject == nil"), "its neighbour does not").toBe(true);
  addon.eval("C_Spell.IsSpellUsable = function() return false, false end");
  addon.fire("SPELL_UPDATE_USABLE");
  expect(tinted(1, "unusable"), "a spell that can't be cast now is dimmed on the usable event").toBe(true);
  addon.eval("Vanguard_Flyout:Hide() __cd[11] = nil");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(addon.eval("return Vanguard_Flyout.vgChildren[1].cooldown.__durationObject ~= nil"), "a shut list is left as it was").toBe(true);
});

it("H47-8-3 a client with no duration object sweeps from plain numbers, and a hidden cooldown or usable answer leaves a plain, castable button", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS + "C_Spell.GetSpellCooldownDuration = nil __info = { [11] = { startTime = 5, duration = 10 }, [13] = { startTime = __wfgWorld.secret(5), duration = __wfgWorld.secret(10) } } C_Spell.GetSpellCooldown = function(id) return __info[id] end C_Spell.IsSpellUsable = function() return __wfgWorld.secret(false), __wfgWorld.secret(false) end");
  place(addon, 1, 1);
  run(addon, PRE);
  expect(addon.eval("local c = Vanguard_Flyout.vgChildren[1].cooldown return c.__cooldown and c.__cooldown[2]"), "plain numbers go to the sweep").toBe(10);
  expect(addon.eval("local c = Vanguard_Flyout.vgChildren[2] local v = c.icon.__vertexColor local r, g, b = ns.Theme.RGB('white') return v[1] == r and v[2] == g and v[3] == b"), "a hidden usable answer counts as castable").toBe(true);
  addon.eval("C_Spell.GetSpellCooldown = nil C_Spell.IsSpellUsable = nil");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "a client with neither call paints without error").toBe(true);
});

// H47-8-2. The game closes its list on ACTIONBAR_PAGE_CHANGED (Blizzard_ActionBar/Shared/SpellFlyout.lua, SpellFlyoutMixin:OnEvent).
it("H47-8-2 a page change on the bar closes the list its button opened", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1);
  run(addon, PRE);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "open").toBe(true);
  pageBar1(addon, 7);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "a stance page closes it").toBe(false);
  pageBar1(addon, 1);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "a page change with the list shut leaves it shut").toBe(false);
});

it("a click on anything but a flyout closes the list, a flyout with no known spell opens nothing, and the click's other edge is ignored", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1); place(addon, 2, 2);
  run(addon, PRE);
  expect(run(addon, PRE, { button: "Vanguard_Bar1Button3" }), "a plain slot: the click goes on").toEqual(["nil", "nil"]);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "and the list closes").toBe(false);
  expect(run(addon, PRE, { down: "true" }), "the other edge of the click (the game acts on release): stopped").toEqual([false, "nil"]);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "and nothing opens").toBe(false);
  addon.eval("__wfgWorld.flyouts[1].slots = { { spell = 11, known = false } } ") ;
  place(addon, 1, 1);
  expect(run(addon, PRE), "a flyout with nothing to list").toEqual([false, "nil"]);
});

it("the list closes when the button that opened it hides (its bar going away too), not when another button does", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1);
  const HIDE = "ns.GetModule('ActionBars').FLYOUT_BUTTON_HIDE";
  run(addon, PRE);
  run(addon, HIDE, { button: "Vanguard_Bar1Button3" });
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "another button hiding leaves it open").toBe(true);
  run(addon, HIDE);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "its own button hiding closes it").toBe(false);
  run(addon, HIDE);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "and a closed list stays closed").toBe(false);
});

it("a spell button of the list closes it after the click the game acts on, and shows its spell's tooltip", () => {
  const addon = loggedIn(KEY_UP + FLYOUTS);
  place(addon, 1, 1);
  // The spell button's snippet for a click edge.
  const child = (down) => run(addon, "ns.GetModule('ActionBars').FLYOUT_CHILD_PRE", { down });
  expect(child("true"), "a press when the game acts on release: no close").toEqual(["nil", "nil"]);
  expect(child("false"), "the release: the close goes after it").toEqual(["nil", true]);
  expect(addon.eval("local c = Vanguard_Flyout1 return { c.__wraps.OnClick == ns.GetModule('ActionBars').FLYOUT_CHILD_PRE, c:GetAttribute('type') }"), "wrapped, casting a spell").toEqual([true, "spell"]);
  run(addon, PRE);
  addon.eval("local c = Vanguard_Flyout1 c.__scripts.OnEnter(c)");
  expect(addon.eval("return GameTooltip.__spellId"), "the tooltip is the spell's").toBe(11);
  addon.eval("local c = Vanguard_Flyout1 c.__scripts.OnLeave(c) Vanguard_Flyout3.__scripts.OnEnter(Vanguard_Flyout3)");
  expect(addon.eval("return GameTooltip:IsShown()"), "and goes when the mouse leaves; a button with no spell shows none").toBe(false);
});

it("on Retail the list is the same, and the bar buttons are wrapped the same way", () => {
  const addon = loggedIn(FLYOUTS, { client: RETAIL_CLIENT });
  place(addon, 1, 1);
  expect(addon.eval("return Vanguard_Bar3Button12.__wraps.OnClick == ns.GetModule('ActionBars').FLYOUT_PRE"), "wrapped").toBe(true);
  expect(run(addon, PRE), "and opens").toEqual([false, "nil"]);
});

it("on a client that can't run secure snippets a flyout wraps nothing, so every bar button still acts", () => {
  const addon = loggedIn('SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end\n' + FLYOUTS);
  place(addon, 1, 1);
  expect(addon.eval("return { Vanguard_Flyout == nil, Vanguard_Bar1Button1.__wraps == nil or Vanguard_Bar1Button1.__wraps.OnClick == nil }"), "no list and no wrap").toEqual([true, true]);
});
