// windows-move: dragging the game's windows by their title bar (Modules/WindowsMove.lua) and the options
// window's remembered place (Core/OptionsWindow.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, WINDOWS_ENV, chatHas, loggedIn, setCombat } from "./helpers.mjs";

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
  local cal = CreateFrame("Frame", "CalendarFrame", UIParent) cal:SetSize(540, 420) cal:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100, -100) cal:Hide()
  cal.SetMovable = function(self, on) self.__testMovable = on end
  cal.SetUserPlaced = function(self, on) self.__testUserPlaced = on end
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
const drag = (addon, name, x, y) => addon.eval(`local h = ns.FrameState('vgMoveHandle')[${name}]
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
  const h = addon.frame("ns.FrameState('vgMoveHandle')[CharacterFrame]");
  expect([h.mouse, Math.round(h.rect.left), Math.round(h.rect.right), Math.round(h.rect.height)], "the drag area over the title bar, short of the close button").toEqual([true, 16 + 58, 16 + 384 - 24 - 40, 20]);
  expect(drag(addon, "CharacterFrame", 500, 700), "a drag moves it").toBe(true);
  expect([saved(addon).CharacterFrame, addon.eval("return { CharacterFrame.__moving, CharacterFrame.__testUserPlaced }")], "the drop saves its corner and keeps the game's layout cache out").toEqual([{ x: 500, y: 700 }, [false, false]]);
  addon.eval("UpdateUIPanelPositions()");
  expect(corner(addon, "CharacterFrame"), "the panel manager placed it again: put back").toEqual([500, 700]);
  addon.eval("CharacterFrame:Hide() __open(CharacterFrame)");
  expect(corner(addon, "CharacterFrame"), "opened again: put back").toEqual([500, 700]);
  addon.eval('local h = ns.FrameState("vgMoveHandle")[CharacterFrame] h:GetScript("OnDragStart")(h) CharacterFrame:ClearAllPoints() CharacterFrame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 300, 600) ns.GetModule("Windows").PlaceAll()');
  expect(corner(addon, "CharacterFrame"), "while being dragged it is left under the mouse").toEqual([300, 600]);
  addon.eval('ns.FrameState("vgMoveHandle")[CharacterFrame]:GetScript("OnDragStop")(ns.FrameState("vgMoveHandle")[CharacterFrame])');
  expect(errors(addon)).toBe("none");
});

it("a window hidden mid-drag ends the drag: it is not stuck dragging, and its saved place is put back again", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("__open(CharacterFrame)");
  drag(addon, "CharacterFrame", 500, 700);
  addon.eval(`local h = ns.FrameState('vgMoveHandle')[CharacterFrame] h:GetScript("OnDragStart")(h, "LeftButton")
    CharacterFrame:ClearAllPoints() CharacterFrame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 320, 640) CharacterFrame:Hide()`);
  expect(addon.eval("return { ns.FrameState('vgDragging')[CharacterFrame] == true, CharacterFrame.__moving, CharacterFrame.__testUserPlaced }"), "hidden mid-drag: the drag is over").toEqual([false, false, false]);
  expect(saved(addon).CharacterFrame, "and the window is saved where it was let go").toEqual({ x: 320, y: 640 });
  addon.eval("__open(CharacterFrame)");
  expect(corner(addon, "CharacterFrame"), "the saved place is put back on the next show").toEqual([320, 640]);
  addon.eval('local h = ns.FrameState("vgMoveHandle")[CharacterFrame] h:GetScript("OnDragStop")(h)');
  addon.eval("CharacterFrame:Hide()");
  expect([saved(addon).CharacterFrame, errors(addon)], "a late drop after the hide, and a hide with no drag, change nothing").toEqual([{ x: 320, y: 640 }, "none"]);
});

it("#201 the combined bag: a drag strip along its top, and its place kept when the game scales and stacks the bags again", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("__open(ContainerFrameCombinedBags)");
  const bag = addon.frame("ContainerFrameCombinedBags").rect;
  const h = addon.frame("ns.FrameState('vgMoveHandle')[ContainerFrameCombinedBags]").rect;
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
  expect(addon.eval("return ns.FrameState('vgMoveHandle')[LFGParentFrame] == nil"), "a window that loads in combat is set up after it").toBe(true);
  setCombat(addon, false);
  expect(corner(addon, "CharacterFrame"), "put back when the fight ends").toEqual([500, 700]);
  expect(addon.eval("return ns.FrameState('vgMoveHandle')[LFGParentFrame] ~= nil and ns.FrameState('vgMoveHandle')[LFGParentFrame].__mouse"), "the loaded window has its drag area").toBe(true);
  expect(errors(addon)).toBe("none");
});

// TEST-ONLY: the character pane and the calendar each hold a protected button (as the collections window holds the
// toy box's secure buttons), so the client refuses addon code that starts or stops moving either in a fight.
const SECURE_MOVE_ENV = `${MOVE_ENV}
  __wfgStub.protect(CreateFrame("Button", nil, CharacterFrame)) __wfgStub.protect(CreateFrame("Button", nil, CalendarFrame))
`;

// Starts a title-bar drag on the character pane and a press-move on the calendar, and moves each to a new spot.
const holdBoth = (addon) => addon.eval(`local h = ns.FrameState('vgMoveHandle')[CharacterFrame] h:GetScript("OnDragStart")(h, "LeftButton")
  CharacterFrame:ClearAllPoints() CharacterFrame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 500, 700)
  __wfgStub.world.mouse.x, __wfgStub.world.mouse.y = 300, 970 CalendarFrame:GetScript("OnMouseDown")(CalendarFrame, "LeftButton")
  CalendarFrame:ClearAllPoints() CalendarFrame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 400, 500)`);

// Whether each window still follows the mouse: the character pane, then the calendar.
const following = (addon) => addon.eval("return { CharacterFrame.__moving == true, CalendarFrame.__moving == true }");

it("a drag still held as a fight starts ends before the lockdown, where the window is; letting go in the fight does nothing", () => {
  const addon = loggedIn(SECURE_MOVE_ENV);
  addon.eval("__open(CharacterFrame) CalendarFrame:Show()");
  holdBoth(addon);
  expect(following(addon), "both follow the mouse").toEqual([true, true]);
  addon.world.combat(true);
  expect(following(addon), "the fight starting lets go of both").toEqual([false, false]);
  expect(saved(addon), "each saved where it was let go").toMatchObject({ CharacterFrame: { x: 500, y: 700 }, CalendarFrame: { x: 400, y: 500 } });
  addon.eval(`local h = ns.FrameState('vgMoveHandle')[CharacterFrame] h:GetScript("OnDragStop")(h)
    CalendarFrame:GetScript("OnMouseUp")(CalendarFrame, "LeftButton") CharacterFrame:Hide() CalendarFrame:Hide()`);
  addon.world.combat(false);
  expect([following(addon), errors(addon)], "the drop, the release and the windows closing in the fight call nothing protected").toEqual([[false, false], "none"]);
});

it("a drop the fight caught waits for its end: the window is stopped and its place saved once the fight is over", () => {
  const addon = loggedIn(SECURE_MOVE_ENV);
  addon.eval("__open(CharacterFrame) CalendarFrame:Show()");
  holdBoth(addon);
  setCombat(addon, true);
  addon.eval('CharacterFrame:Hide() CalendarFrame:GetScript("OnMouseUp")(CalendarFrame, "LeftButton")');
  expect([following(addon), saved(addon).CharacterFrame, saved(addon).CalendarFrame], "nothing protected in the fight: both still follow the mouse").toEqual([[true, true], undefined, undefined]);
  setCombat(addon, false);
  expect(following(addon), "the fight over: both stopped").toEqual([false, false]);
  expect([saved(addon), errors(addon)], "and saved where they were let go").toEqual([{ CharacterFrame: { x: 500, y: 700 }, CalendarFrame: { x: 400, y: 500 } }, "none"]);
});

it("the group finder: its pages cover the window and carry the title, so each page's title bar drags the whole window", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval(`local w = __window("LFGParentFrame") w:SetSize(440, 520) w:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 100, -100)
    for _, k in ipairs({ "LFGListingFrame", "LFGBrowseFrame", "LFGWhoListFrame" }) do
      local p = CreateFrame("Frame", k, w) p:SetAllPoints(w)
      p.TitleContainer = CreateFrame("Frame", nil, p) p.TitleContainer:SetPoint("TOPLEFT", p, "TOPLEFT", 60, -4) p.TitleContainer:SetSize(300, 20)
    end`);
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  for (const page of ["LFGListingFrame", "LFGBrowseFrame", "LFGWhoListFrame"]) {
    const moved = addon.eval(`local bar = ${page}.TitleContainer local h
      for _, c in ipairs({ ${page}:GetChildren() }) do if c.window == LFGParentFrame and c ~= bar then h = c end end
      if not h then return false end
      h:GetScript("OnDragStart")(h, "LeftButton")
      local moving = LFGParentFrame.__moving == true
      LFGParentFrame:ClearAllPoints() LFGParentFrame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", 300, 600)
      h:GetScript("OnDragStop")(h)
      return moving`);
    expect(moved, `${page}'s title bar has a drag area that moves the finder`).toBe(true);
    expect(saved(addon).LFGParentFrame, "and its place is saved").toEqual({ x: 300, y: 600 });
  }
  expect(errors(addon)).toBe("none");
});

it("#201 the switch off leaves the game's windows alone, saved places and all", () => {
  const addon = loggedIn(MOVE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { movable = false, moved = { CharacterFrame = { x = 500, y = 700 } } } } }" });
  addon.eval("__open(CharacterFrame) UpdateUIPanelPositions()");
  expect(corner(addon, "CharacterFrame"), "where the game puts it").toEqual([16, 964]);
  expect(addon.eval("return { ns.FrameState('vgMoveHandle')[CharacterFrame] == nil, CharacterFrame.__testMovable == nil }"), "no drag area, not made movable").toEqual([true, true]);
});

it("#201 options: the switch and Reset window positions under Game windows; the options window remembers where it was dropped", () => {
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
  addon.eval('ns.Options.Show("windows")');
  expect(addon.eval('return __click("Drag game windows by their title bar")') && addon.eval("return VanguardDB.profiles.Default.Windows.movable"), "the switch turns dragging off (on reload)").toBe(false);
  addon.eval('__click("Reset window positions")');
  expect(saved(addon), "Reset window positions forgets every place").toEqual({});
  expect(corner(addon, "Vanguard_Options"), "the options window back in the middle at once").toEqual([570, 840]);
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
  const h = addon.frame("ns.FrameState('vgMoveHandle')[GameMenuFrame]").rect;
  expect([h.left === header.left, header.right - h.right, h.top === header.top, h.height], "the drag area over the menu's header").toEqual([true, 40, true, 30]);
  const W = "ns.GetModule('Windows')";
  addon.eval(`${W}.SavePlace("TEST-ONLY", CreateFrame("Frame")) ${W}.Moved()["TEST-ONLY-JUNK"] = { x = "TEST-ONLY" } ${W}.PutBack("TEST-ONLY-JUNK", GameMenuFrame)`);
  expect([saved(addon)["TEST-ONLY"], corner(addon, "GameMenuFrame")], "a frame with no place yet saves nothing; a broken saved place is ignored").toEqual([undefined, [860, 690]]);
  expect(errors(addon)).toBe("none");
});

it("a saved window place that is infinite or absurd is kept to ns.MAX_OFFSET when the window is put back", () => {
  const addon = loggedIn("");
  const W = "ns.GetModule('Windows')";
  addon.eval(`local m = CreateFrame("Frame", "GameMenuFrame", UIParent) m:SetSize(200, 300) m:SetPoint("CENTER")
    ${W}.Moved()["TEST-ONLY-FAR"] = { x = math.huge, y = -1e300 } ${W}.PutBack("TEST-ONLY-FAR", GameMenuFrame)`);
  expect(addon.eval("local _, _, _, x, y = GameMenuFrame:GetPoint(1) return { x, y }"), "the far edge, not infinity").toEqual([5000, -5000]);
});

// Presses the left button with the mouse at x, y (screen pixels), the window following the mouse to
// toX, toY when it was set moving, then lets go. Returns whether it was moving in between.
const pressDrag = (addon, name, [x, y], [toX, toY]) => addon.eval(`__wfgStub.world.mouse.x, __wfgStub.world.mouse.y = ${x}, ${y}
  ${name}:GetScript("OnMouseDown")(${name}, "LeftButton")
  local moving = ${name}.__moving == true
  if moving and ${toX} then ${name}:ClearAllPoints() ${name}:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", ${toX}, ${toY}) end
  ${name}:GetScript("OnMouseUp")(${name}, "LeftButton")
  return moving`);

it("a window with no title bar part (the calendar) is dragged by an empty spot along its top edge, never by a press lower down", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("CalendarFrame:Show()");
  expect(addon.eval("return ns.FrameState('vgMoveHandle')[CalendarFrame] == nil"), "no drag area laid over it: it would cover the month arrows").toBe(true);
  expect(addon.eval("return CalendarFrame.__testMovable"), "made movable").toBe(true);
  expect(pressDrag(addon, "CalendarFrame", [300, 600], [50, 50]), "a press 380 units down does nothing").toBe(false);
  expect(saved(addon).CalendarFrame, "and nothing is saved").toBeUndefined();
  expect(pressDrag(addon, "CalendarFrame", [300, 970], [400, 500]), "a press along the top edge moves it").toBe(true);
  expect([saved(addon).CalendarFrame, addon.eval("return { CalendarFrame.__moving, CalendarFrame.__testUserPlaced }")], "the drop saves its corner and keeps the game's layout cache out").toEqual([{ x: 400, y: 500 }, [false, false]]);
  addon.eval("CalendarFrame:Hide() CalendarFrame:ClearAllPoints() CalendarFrame:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 100, -100) CalendarFrame:Show()");
  expect(corner(addon, "CalendarFrame"), "opened again: put back").toEqual([400, 500]);
  expect(errors(addon)).toBe("none");
});

it("a click on a window's top edge saves nothing, a right press does nothing, and the window closing mid-drag lets go", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval("CalendarFrame:Show()");
  expect(pressDrag(addon, "CalendarFrame", [300, 970], []), "a press and release in place").toBe(true);
  expect(saved(addon).CalendarFrame, "is a click: no place saved").toBeUndefined();
  addon.eval('__wfgStub.world.mouse.y = 970 CalendarFrame:GetScript("OnMouseDown")(CalendarFrame, "RightButton")');
  expect(addon.eval("return CalendarFrame.__moving"), "a right press doesn't move it").toBeFalsy();
  addon.eval('CalendarFrame:GetScript("OnMouseDown")(CalendarFrame, "LeftButton") CalendarFrame:Hide()');
  expect(addon.eval("return CalendarFrame.__moving"), "hidden while held: it lets go").toBe(false);
  addon.eval("CalendarFrame:Show()");
  addon.eval("CalendarFrame:ClearAllPoints()");
  expect(pressDrag(addon, "CalendarFrame", [300, 970], []), "a window with no place yet is not moved").toBe(false);
  setCombat(addon, true);
  addon.eval("CalendarFrame:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 100, -100)");
  expect(pressDrag(addon, "CalendarFrame", [300, 970], [10, 10]), "no drag in combat").toBe(false);
  expect(errors(addon)).toBe("none");
});

it("the windows dragged by their top edge only are ones Vanguard skins, and the two lists share none", () => {
  const addon = loggedIn(MOVE_ENV);
  const lists = addon.eval(`local GW, bad, seen = ns.GetModule("Windows"), {}, {}
    for _, list in ipairs({ GW.MOVABLE, GW.MOVABLE_TOP }) do
      for _, name in ipairs(list) do
        if seen[name] or (list == GW.MOVABLE_TOP and not GW.REGISTERED[name]) then bad[#bad + 1] = name end
        seen[name] = true
      end
    end
    return table.concat(bad, " ")`);
  expect(lists, "windows that are not registered, or listed twice").toBe("");
});

// TEST-ONLY game for Reset: the character pane listed as a left panel (UIPanelWindows), the mailbox with an open
// letter anchored to its right edge as MailFrame.xml anchors it (the panel manager never places the letter), and
// a count of the panel manager's layout calls.
const RESET_ENV = `${MOVE_ENV}
  UIPanelWindows.CharacterFrame = { area = "left", pushable = 3 }
  local mail = __window("MailFrame") mail:SetSize(384, 512) mail:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 16, -116)
  local letter = CreateFrame("Frame", "OpenMailFrame", UIParent) letter:SetSize(340, 420) letter:SetPoint("TOPLEFT", mail, "TOPRIGHT", 0, 0) letter:Hide()
  letter.SetUserPlaced = function(self, on) self.__testUserPlaced = on end
  __testLayouts = 0
  local layout = UpdateUIPanelPositions
  function UpdateUIPanelPositions(...) __testLayouts = __testLayouts + 1 return layout(...) end
`;

// Opens the character pane, the bag and a letter and drags each away from where the game put it.
const moveAll = (addon) => {
  addon.eval("__open(CharacterFrame) __open(ContainerFrameCombinedBags) MailFrame:Show() OpenMailFrame:Show()");
  drag(addon, "CharacterFrame", 500, 700);
  drag(addon, "ContainerFrameCombinedBags", 200, 500);
  pressDrag(addon, "OpenMailFrame", [600, 960], [900, 600]);
};

// Clicks Reset window positions on the Game windows page.
const clickReset = (addon) => addon.eval('ns.Options.Show("windows") return __click("Reset window positions")');

it("H-04 Reset puts open windows back where the game puts them: a panel by one layout, the bag by its own, the letter beside the mailbox", () => {
  const addon = loggedIn(RESET_ENV + CLICK_LUA);
  moveAll(addon);
  expect(Object.keys(saved(addon)).sort(), "three places saved").toEqual(["CharacterFrame", "ContainerFrameCombinedBags", "OpenMailFrame"]);
  const before = addon.eval("return __testLayouts");
  expect(clickReset(addon), "the button is on the page").toBe(true);
  expect(saved(addon), "every place forgotten").toEqual({});
  expect(corner(addon, "CharacterFrame"), "the character pane where the panel manager puts it").toEqual([16, 964]);
  expect(addon.eval("return __testLayouts") - before, "the panels laid out once").toBe(1);
  expect(corner(addon, "ContainerFrameCombinedBags"), "the bag stacked from the bottom-right corner again").toEqual([1500, 340]);
  expect(corner(addon, "OpenMailFrame"), "the letter beside the mailbox, not where it was dragged").toEqual([400, 964]);
  expect(errors(addon)).toBe("none");
});

it("H-04 Reset leaves a closed panel to the game: no layout call, and it opens where the game puts it", () => {
  const addon = loggedIn(RESET_ENV + CLICK_LUA);
  addon.eval("__open(CharacterFrame)");
  drag(addon, "CharacterFrame", 500, 700);
  addon.eval("CharacterFrame:Hide()");
  const before = addon.eval("return __testLayouts");
  clickReset(addon);
  expect(addon.eval("return __testLayouts") - before, "nothing open to lay out").toBe(0);
  addon.eval("__open(CharacterFrame)");
  expect(corner(addon, "CharacterFrame"), "opened again: where the game puts it").toEqual([16, 964]);
});

it("H-04 Reset in a fight waits until it ends, says so, and then puts everything back", () => {
  const addon = loggedIn(RESET_ENV + CLICK_LUA);
  moveAll(addon);
  setCombat(addon, true);
  addon.clearChat();
  clickReset(addon);
  expect(chatHas(addon, /Moved windows go back once the fight ends\./), "it says when").toBe(true);
  expect([saved(addon), corner(addon, "CharacterFrame")], "places forgotten, but nothing moved in the fight").toEqual([{}, [500, 700]]);
  addon.clearChat();
  clickReset(addon);
  expect(chatHas(addon, /Moved windows go back/), "a second click with nothing left to forget says nothing").toBe(false);
  setCombat(addon, false);
  expect([saved(addon), corner(addon, "CharacterFrame"), corner(addon, "OpenMailFrame")], "after it, all back").toEqual([{}, [16, 964], [400, 964]]);
  expect(errors(addon)).toBe("none");
});

it("H-04 Reset moves only the windows that were dragged: one the game or another addon moved since stays put", () => {
  const addon = loggedIn(RESET_ENV + CLICK_LUA);
  addon.eval("CalendarFrame:Show() __open(CharacterFrame)");
  drag(addon, "CharacterFrame", 500, 700);
  addon.eval("CalendarFrame:ClearAllPoints() CalendarFrame:SetPoint('TOPLEFT', UIParent, 'BOTTOMLEFT', 700, 400)");
  clickReset(addon);
  expect([corner(addon, "CharacterFrame"), corner(addon, "CalendarFrame")], "the pane back, the calendar left where it was put").toEqual([[16, 964], [700, 400]]);
});

it("H-05 the clock, chat channels, game settings, chat settings and guild control windows can be dragged too", () => {
  const addon = loggedIn(MOVE_ENV);
  addon.eval(`for _, name in ipairs({ "TimeManagerFrame", "ChannelFrame", "SettingsPanel", "ChatConfigFrame", "GuildControlUI" }) do
    local f = __window(name) f:SetSize(300, 300) f:SetPoint("CENTER")
  end`);
  addon.fire("ADDON_LOADED", "Blizzard_TimeManager");
  const W = "ns.FrameState('vgMoveHandle')";
  expect(addon.eval(`return { ${W}[TimeManagerFrame] ~= nil, ${W}[ChannelFrame] ~= nil }`), "the clock and channels by their title bar").toEqual([true, true]);
  expect(addon.eval(`local m = ns.FrameState('vgMovable') return { m[SettingsPanel], m[ChatConfigFrame], m[GuildControlUI], ${W}[SettingsPanel] == nil }`), "the other three by their top edge only").toEqual([true, true, true, true]);
});
