// windows-move: dragging the game's windows by their title bar (Modules/WindowsMove.lua) and the options
// window's remembered place (Core/OptionsWindow.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, WINDOWS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY game: the character pane (a ButtonFrameTemplate window with its 20-unit title bar), the combined
// bag (no title bar) and the two calls that place them, as Blizzard_UIParentPanelManager and ContainerFrame.lua
// do: every open left panel at UIParent's TOPLEFT 16, -116, and the bag scaled to fit and stacked from the
// bottom-right corner. __open(f) opens a panel the way ShowUIPanel does: placed first, then shown. The window
// methods the stub leaves as no-ops record what they were given.
const MOVE_ENV = `${WINDOWS_ENV}
  local c = __window("CharacterFrame") c:SetSize(384, 512)
  c.TitleContainer:SetPoint("TOPLEFT", c, "TOPLEFT", 58, -1) c.TitleContainer:SetPoint("TOPRIGHT", c, "TOPRIGHT", -24, -1) c.TitleContainer:SetHeight(20)
  local b = CreateFrame("Frame", "ContainerFrameCombinedBags", UIParent) b:SetSize(400, 300) b:Hide()
  for _, f in ipairs({ c, b }) do
    f.SetMovable = function(self, on) self.__testMovable = on end
    f.SetClampedToScreen = function(self, on) self.__testClamped = on end
    f.SetUserPlaced = function(self, on) self.__testUserPlaced = on end
  end
  __testBagScale = 1
  function UpdateUIPanelPositions() CharacterFrame:ClearAllPoints() CharacterFrame:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 16, -116) end
  function UpdateContainerFrameAnchors()
    local bag = ContainerFrameCombinedBags bag:SetScale(__testBagScale) bag:ClearAllPoints() bag:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -20, 40)
  end
  function __open(f) if f == ContainerFrameCombinedBags then UpdateContainerFrameAnchors() else UpdateUIPanelPositions(f) end f:Show() end
`;

// A window's top-left corner on the screen (pixels), rounded.
const corner = (addon, name) => {
  const r = addon.frame(name).rect;
  return [Math.round(r.left), Math.round(r.top)];
};

// Drags a window by its drag area to put its top-left corner at x, y (screen pixels): OnDragStart, the
// window following the mouse (StartMoving), then OnDragStop. Returns whether it was moving in between.
const drag = (addon, name, x, y) => addon.eval(`local h = ${name}.vgMoveHandle
  h:GetScript("OnDragStart")(h, "LeftButton")
  local moving = ${name}.__moving == true
  if moving then ${name}:ClearAllPoints() ${name}:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", ${x}, ${y}) end
  h:GetScript("OnDragStop")(h)
  return moving`);

// The places saved in the profile, by window name.
const saved = (addon) => addon.eval("return VanguardDB.profiles.Default.Windows.moved");

// Any error Vanguard reported, or "none".
const errors = (addon) => addon.eval("return ns.errors[1] and ns.errors[1].text or 'none'");

it("#201 the character pane: dragged by its title bar, its place is saved and put back after the game places it and on each show", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("__open(CharacterFrame)");
  expect(corner(addon, "CharacterFrame"), "opened where the panel manager puts it").toEqual([16, 964]);
  expect(addon.eval("return { CharacterFrame.__testMovable, CharacterFrame.__testClamped }"), "made movable and kept on the screen").toEqual([true, true]);
  const h = addon.frame("CharacterFrame.vgMoveHandle");
  expect([h.mouse, Math.round(h.rect.left), Math.round(h.rect.right), Math.round(h.rect.height)], "the drag area over the title bar, short of the close button").toEqual([true, 16 + 58, 16 + 384 - 24 - 40, 20]);
  expect(drag(addon, "CharacterFrame", 500, 700), "a drag moves it").toBe(true);
  expect([saved(addon).CharacterFrame, addon.eval("return { CharacterFrame.__moving, CharacterFrame.__testUserPlaced }")], "the drop saves its corner and keeps the game's layout cache out").toEqual([{ x: 500, y: 700 }, [false, false]]);
  addon.eval("UpdateUIPanelPositions()");
  expect(corner(addon, "CharacterFrame"), "the panel manager placed it again: put back").toEqual([500, 700]);
  addon.eval("CharacterFrame:Hide() __open(CharacterFrame)");
  expect(corner(addon, "CharacterFrame"), "opened again: put back").toEqual([500, 700]);
  addon.eval('local h = CharacterFrame.vgMoveHandle h:GetScript("OnDragStart")(h) CharacterFrame:ClearAllPoints() CharacterFrame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 300, 600) ns.GetModule("Windows").PlaceAll()');
  expect(corner(addon, "CharacterFrame"), "while being dragged it is left under the mouse").toEqual([300, 600]);
  addon.eval('CharacterFrame.vgMoveHandle:GetScript("OnDragStop")(CharacterFrame.vgMoveHandle)');
  expect(errors(addon)).toBe("none");
});

it("#201 the combined bag: a drag strip along its top, and its place kept when the game scales and stacks the bags again", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("__open(ContainerFrameCombinedBags)");
  const bag = addon.frame("ContainerFrameCombinedBags").rect;
  const h = addon.frame("ContainerFrameCombinedBags.vgMoveHandle").rect;
  expect([h.left - bag.left, bag.right - h.right, bag.top - h.top, h.height], "a strip 24 tall, clear of the portrait and the close button").toEqual([58, 64, 0, 24]);
  drag(addon, "ContainerFrameCombinedBags", 200, 800);
  addon.eval("__testBagScale = 0.8 UpdateContainerFrameAnchors()");
  expect(corner(addon, "ContainerFrameCombinedBags"), "scaled down by the game, its corner stays where it was dropped").toEqual([200, 800]);
  expect(saved(addon).ContainerFrameCombinedBags, "saved in UIParent's units").toEqual({ x: 200, y: 800 });
});

it("#201 nothing moves in combat: a drag doesn't start, putting back waits until the fight ends, and so does setting up a window that loads", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("__open(CharacterFrame)");
  drag(addon, "CharacterFrame", 500, 700);
  setCombat(addon, true);
  expect(drag(addon, "CharacterFrame", 900, 300), "no drag in combat").toBe(false);
  expect(saved(addon).CharacterFrame, "and nothing saved").toEqual({ x: 500, y: 700 });
  addon.eval("UpdateUIPanelPositions()");
  expect(corner(addon, "CharacterFrame"), "the game placed it in combat: left there for now").toEqual([16, 964]);
  addon.eval('__window("LFGParentFrame") LFGParentFrame:SetSize(300, 400)');
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  expect(addon.eval("return LFGParentFrame.vgMoveHandle == nil"), "a window that loads in combat is set up after it").toBe(true);
  setCombat(addon, false);
  expect(corner(addon, "CharacterFrame"), "put back when the fight ends").toEqual([500, 700]);
  expect(addon.eval("return LFGParentFrame.vgMoveHandle ~= nil and LFGParentFrame.vgMoveHandle.__mouse"), "the loaded window has its drag area").toBe(true);
  expect(errors(addon)).toBe("none");
});

it("#201 the switch off leaves the game's windows alone, saved places and all", () => {
  const addon = loggedIn(MOVE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { movable = false, moved = { CharacterFrame = { x = 500, y = 700 } } } } }" });
  addon.eval("__open(CharacterFrame) UpdateUIPanelPositions()");
  expect(corner(addon, "CharacterFrame"), "where the game puts it").toEqual([16, 964]);
  expect(addon.eval("return { CharacterFrame.vgMoveHandle == nil, CharacterFrame.__testMovable == nil }"), "no drag area, not made movable").toEqual([true, true]);
});

it("#201 options: the switch and Reset window positions under Bars, map, chat; the options window remembers where it was dropped", () => {
  const addon = loggedIn(MOVE_ENV + CLICK_LUA);
  addon.eval("ns.Options.PlaceWindow()");
  addon.eval("__open(CharacterFrame)");
  drag(addon, "CharacterFrame", 500, 700);
  addon.slash("");
  addon.eval(`local f = Vanguard_Options local h = f.header h:GetScript("OnDragStart")(h)
    f:ClearAllPoints() f:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 100, 900) h:GetScript("OnDragStop")(h)`);
  expect(saved(addon).Vanguard_Options, "the options window's drop is saved with the game windows'").toEqual({ x: 100, y: 900 });
  addon.eval("Vanguard_Options:ClearAllPoints() ns.Options.PlaceWindow()");
  expect(corner(addon, "Vanguard_Options"), "and it is put back there").toEqual([100, 900]);
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Drag game windows by their title bar")') && addon.eval("return VanguardDB.profiles.Default.Windows.movable"), "the switch turns dragging off (on reload)").toBe(false);
  addon.eval('__click("Reset window positions")');
  expect(saved(addon), "Reset window positions forgets every place").toEqual({});
  expect(corner(addon, "Vanguard_Options"), "the options window back in the middle at once").toEqual([570, 820]);
  const next = loggedIn(MOVE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { moved = { Vanguard_Options = { x = 100, y = 900 } } } } }" });
  next.slash("");
  expect(corner(next, "Vanguard_Options"), "after a reload it opens where it was dropped").toEqual([100, 900]);
});

it("#201 a client without the windows or the layout calls loads cleanly; windows that load later are set up, the game menu by its header", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.movable"), "on by default").toBe(true);
  addon.eval('local m = CreateFrame("Frame", "GameMenuFrame", UIParent) m:SetSize(200, 300) m:SetPoint("CENTER") m.Header = CreateFrame("Frame", nil, m) m.Header:SetSize(160, 30) m.Header:SetPoint("TOP", m, "TOP", 0, 10)');
  addon.fire("ADDON_LOADED", "TEST-ONLY");
  const header = addon.frame("GameMenuFrame.Header").rect;
  const h = addon.frame("GameMenuFrame.vgMoveHandle").rect;
  expect([h.left === header.left, header.right - h.right, h.top === header.top, h.height], "the drag area over the menu's header").toEqual([true, 40, true, 30]);
  const W = "ns.GetModule('Windows')";
  addon.eval(`${W}.SavePlace("TEST-ONLY", CreateFrame("Frame")) ${W}.Moved()["TEST-ONLY-JUNK"] = { x = "TEST-ONLY" } ${W}.PutBack("TEST-ONLY-JUNK", GameMenuFrame)`);
  expect([saved(addon)["TEST-ONLY"], corner(addon, "GameMenuFrame")], "a frame with no place yet saves nothing; a broken saved place is ignored").toEqual([undefined, [860, 690]]);
  expect(errors(addon)).toBe("none");
});
