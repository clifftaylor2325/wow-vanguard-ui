// actionflyout: a flyout on a Vanguard action bar opens Vanguard's own list, never the game's SpellFlyout.

import { expect, it } from "vitest";
import { RETAIL, loggedIn, setCombat } from "./helpers.mjs";

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
const run = (addon, snippet, { button = "Vanguard_Bar1Button1", rect = "900, 40, 40, 40", down = "false" } = {}) => addon.eval(`${RESTRICTED}
  local r = { ${rect} }
  local self = wrap(${button}, { GetRect = function() if r[1] then return unpack(r) end end, GetEffectiveScale = function() return 1 end })
  local env = { self = self, control = control, down = ${down}, ipairs = ipairs, newtable = function(...) return { ... } end, GetActionInfo = GetActionInfo }
  local first, second = load(${snippet}, "snippet", "t", env)()
  return { first == nil and "nil" or first, second == nil and "nil" or second }`);

// The list's state after a run: shown, who opened it, the spells and anchors of its first buttons.
const list = (addon) => addon.eval(`local f = Vanguard_Flyout local out = { f:IsShown(), f:GetAttribute("opened-by"), {}, {}, {} }
  for i = 1, 4 do local c = f.vgChildren[i] out[3][i] = c:IsShown() and c:GetAttribute("spell") or false end
  for i = 1, 2 do local c = f.vgChildren[i] local p = c.__points and next(c.__points) out[4][i] = p and c.__points[p].point or false end
  out[5] = f.vgChildren[1].__points and select(2, next(f.vgChildren[1].__points)).rel == Vanguard_Bar1Button1
  return out`);
const PRE = "ns.GetModule('ActionBars').FLYOUT_PRE";

it("a flyout on a bar makes the list once and wraps every bar button's click with it", () => {
  const addon = loggedIn(FLYOUTS);
  expect(addon.eval("return Vanguard_Flyout"), "with no flyout on a bar there is no list").toBe(null);
  place(addon, 1, 1);
  expect(addon.eval("local n = 0 for _, b in ipairs(ns.GetModule('ActionBars').buttons) do if b.__wraps and b.__wraps.OnClick == ns.GetModule('ActionBars').FLYOUT_PRE then n = n + 1 end end return n"), "every button is wrapped").toBe(36);
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
  expect(addon.eval("local f = Vanguard_Flyout return { f:GetAttribute('edge'), f:GetAttribute('screen-width') > 0, f:GetAttribute('screen-height') > 0 }"), "the click edge and the screen size are stored").toEqual(["up", true, true]);
  addon.eval("__wfgWorld.cvars.ActionButtonUseKeyDown = '1'");
  addon.fire("CVAR_UPDATE", "autoLootDefault", "1");
  nextFrame(addon);
  expect(addon.eval("return Vanguard_Flyout:GetAttribute('edge')"), "another setting's change reads nothing again").toBe("up");
  addon.fire("CVAR_UPDATE", "ActionButtonUseKeyDown", "1");
  nextFrame(addon);
  expect(addon.eval("return Vanguard_Flyout:GetAttribute('edge')"), "key down is read again when its setting changes").toBe("down");
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

it("a click on a flyout slot opens the list above a bottom bar's button and stops the game's click", () => {
  const addon = loggedIn(FLYOUTS);
  place(addon, 1, 1);
  expect(run(addon, PRE), "the click is stopped").toEqual([false, "nil"]);
  const state = list(addon);
  expect(state.slice(0, 3), "shown, opened by the button, the two known spells on the first two buttons and no more").toEqual([true, "Vanguard_Bar1Button1", [11, 13, false, false]]);
  expect([state[3], state[4]], "stacked upward from the button").toEqual([["BOTTOM", "BOTTOM"], true]);
  expect(addon.eval("return Vanguard_Flyout.vgChildren[1].icon.__texture"), "the buttons show their spells' icons").toBe("TEST-ONLY-ICON-11");
  expect(run(addon, PRE), "clicking the same button again").toEqual([false, "nil"]);
  expect(addon.eval("return Vanguard_Flyout:IsShown()"), "closes it").toBe(false);
});

it("the list opens toward the middle of the screen: down from the top, right from the left edge, left from the right edge", () => {
  const addon = loggedIn(FLYOUTS);
  place(addon, 1, 1);
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

it("a click on anything but a flyout closes the list, a flyout with no known spell opens nothing, and the click's other edge is ignored", () => {
  const addon = loggedIn(FLYOUTS);
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

it("a spell button of the list closes it after the click the game acts on, and shows its spell's tooltip", () => {
  const addon = loggedIn(FLYOUTS);
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
  const addon = loggedIn(RETAIL + FLYOUTS);
  place(addon, 1, 1);
  expect(addon.eval("return Vanguard_Bar3Button12.__wraps.OnClick == ns.GetModule('ActionBars').FLYOUT_PRE"), "wrapped").toBe(true);
  expect(run(addon, PRE), "and opens").toEqual([false, "nil"]);
});

it("on a client that can't run secure snippets a flyout wraps nothing, so every bar button still acts", () => {
  const addon = loggedIn('SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end\n' + FLYOUTS);
  place(addon, 1, 1);
  expect(addon.eval("return { Vanguard_Flyout == nil, Vanguard_Bar1Button1.__wraps == nil or Vanguard_Bar1Button1.__wraps.OnClick == nil }"), "no list and no wrap").toEqual([true, true]);
});
