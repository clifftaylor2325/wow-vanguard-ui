// windows-map: the map group of game windows (Modules/WindowsMap.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

// The switch off: the map group's windows stay the game's.
const MAP_OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { map = false } } }" };

// TEST-ONLY world map, shaped like Blizzard's (Blizzard_WorldMap.xml / .lua): a border over the whole map
// (ButtonFrameTemplate parts, plus Underlay, a Tutorial button with its Ring, and the Bg the game moves onto the map),
// the canvas, the overscroll art with its four vignettes, the nav bar the game builds in Lua (home, overflow and crumbs,
// rebuilt by Refresh), and the quest log toggle. SynchronizeDisplayState restores the art as the game does.
const WORLD_MAP_ENV = WINDOWS_ENV + `
  function __worldMap()
    local map = CreateFrame("Frame", "WorldMapFrame", UIParent)
    map:Hide()
    map.GetMapID = function() return 10 end
    map.ScrollContainer = CreateFrame("Frame", nil, map)
    map.ScrollContainer:CreateTexture():SetTexture("TEST-ONLY-CANVAS")
    map.ScrollContainer.GetNormalizedCursorPosition = function() return 0.4, 0.525 end
    local border = __window("TestOnlyMapBorder")
    border:SetParent(map)
    map.BorderFrame = border
    border.Underlay, border.InsetBorderTop = border:CreateTexture(), border:CreateTexture()
    border.Bg = map:CreateTexture()
    border.Tutorial = CreateFrame("Button", nil, border)
    border.Tutorial.Ring, border.Tutorial.I = border.Tutorial:CreateTexture(), border.Tutorial:CreateTexture()
    map.OverscrollBG = CreateFrame("Frame", nil, map)
    for _, key in ipairs({ "Texture", "TopLeftVignette", "TopRightVignette", "BottomLeftVignette", "BottomRightVignette" }) do
      map.OverscrollBG[key] = map.OverscrollBG:CreateTexture()
    end
    function map:SynchronizeDisplayState()
      border.NineSlice:SetAlpha(1) border.Underlay:SetAlpha(1)
      for _, r in ipairs({ border:GetRegions() }) do r:SetAlpha(1) end
    end
    return map
  end
  function __navBar(map)
    local nav = CreateFrame("Frame", nil, map)
    nav:CreateTexture()
    nav.overlay = CreateFrame("Frame", nil, nav) nav.overlay:CreateTexture()
    nav.home, nav.overflow = CreateFrame("Button", nil, nav), CreateFrame("Button", nil, nav)
    nav.homeButton, nav.overflowButton = nav.home, nav.overflow
    nav.home:CreateTexture() nav.overflow:CreateTexture()
    nav.navList = { nav.home }
    function nav:Refresh()
      local crumb = CreateFrame("Button", nil, nav) crumb:CreateTexture()
      nav.navList[#nav.navList + 1] = crumb
    end
    map.NavBar = nav
    return nav
  end
  function __sideToggle(map)
    local toggle = CreateFrame("Frame", nil, map)
    for _, key in ipairs({ "OpenButton", "CloseButton" }) do
      local b = CreateFrame("Button", nil, toggle)
      b.shadow, b.icon = b:CreateTexture(), b:CreateTexture()
      b.GetNormalTexture = function(self) return self.icon end
      toggle[key] = b
    end
    map.SidePanelToggle = toggle
    return toggle
  end
  __worldMap() __navBar(WorldMapFrame) __sideToggle(WorldMapFrame)
`;

// Alpha of a TEST-ONLY map part, by Lua expression.
const alpha = (addon, expr) => addon.eval(`return (${expr}):GetAlpha()`);

// How many textures of a frame (by Lua expression) are visible and stretch over the whole frame (a fill).
const fills = (addon, expr) => addon.eval(`local n = 0
  for _, r in ipairs({ (${expr}):GetRegions() }) do
    if r.__kind == "Texture" and r:GetAlpha() ~= 0 and r.__points.TOPLEFT and r.__points.BOTTOMRIGHT then n = n + 1 end
  end
  return n`);

it("the map group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.map"), "its switch is on by default").toBe(true);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'")).toBe("none");
});

it("world map: the border in the theme without a fill over the canvas, the overscroll art faded, the canvas untouched", () => {
  const addon = loggedIn(WORLD_MAP_ENV);
  addon.eval("WorldMapFrame:Show()");
  const first = windowState(addon, "TestOnlyMapBorder");
  expect(first, "the border's art is faded and its edge painted, the title in the theme font").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, panel: true, title: true });
  expect(fills(addon, "TestOnlyMapBorder"), "the border sits over the whole map, so it paints no fill").toBe(0);
  expect(fills(addon, "WorldMapFrame"), "the fill goes on the map itself, behind its canvas").toBe(1);
  expect([alpha(addon, "TestOnlyMapBorder.Underlay"), alpha(addon, "TestOnlyMapBorder.InsetBorderTop"), alpha(addon, "WorldMapFrame.BorderFrame.Bg")], "the underlay, inset line and the game's rock background are faded").toEqual([0, 0, 0]);
  expect(addon.eval("local o = WorldMapFrame.OverscrollBG return { o.Texture:GetAlpha(), o.TopLeftVignette:GetAlpha(), o.TopRightVignette:GetAlpha(), o.BottomLeftVignette:GetAlpha(), o.BottomRightVignette:GetAlpha() }"), "the overscroll tile and four vignettes").toEqual([0, 0, 0, 0, 0]);
  expect(addon.eval("local s = WorldMapFrame.ScrollContainer return { s:GetAlpha(), (select(1, s:GetRegions())):GetAlpha(), tostring(s.vgWindow) }"), "the canvas is left as the game made it").toEqual([1, 1, "nil"]);
  expect(addon.eval("local t = WorldMapFrame.BorderFrame.Tutorial return { t.Ring:GetAlpha(), t.I:GetAlpha() }"), "the tutorial button keeps its \"i\" and loses its ring").toEqual([0, 1]);
  addon.eval("WorldMapFrame:Hide() WorldMapFrame:Show()");
  expect(windowState(addon, "TestOnlyMapBorder"), "showing it again paints nothing new").toMatchObject({ panel: true, painted: first.painted });
});

it("world map: minimising or maximising rebuilds the border, and the skin goes back on", () => {
  const addon = loggedIn(WORLD_MAP_ENV);
  addon.eval("WorldMapFrame:Show() WorldMapFrame:SynchronizeDisplayState()");
  expect(windowState(addon, "TestOnlyMapBorder"), "faded again after the game restored its art").toMatchObject({ art: 0, nine: 0 });
  expect(addon.eval("return WorldMapFrame.BorderFrame.Underlay:GetAlpha()"), "parts the game restored too").toBe(0);
  const painted = windowState(addon, "TestOnlyMapBorder").painted;
  addon.eval("WorldMapFrame:SynchronizeDisplayState()");
  expect(windowState(addon, "TestOnlyMapBorder").painted, "and not painted twice").toBe(painted);
});

it("world map: the coordinate line Vanguard adds still shows along the bottom, at login and when the map loads later", () => {
  const addon = loggedIn(WORLD_MAP_ENV);
  addon.eval("WorldMapFrame:Show()");
  addon.update(0.2);
  expect(addon.eval("local h = Vanguard_MapCoords return { h:GetParent() == WorldMapFrame, h:IsVisible(), h:GetAlpha(), ns.GetModule('Waypoints').mapLine:GetAlpha() }"), "its holder is on the map, visible, and nothing faded it").toEqual([true, true, 1, 1]);
  expect(addon.eval("return ns.GetModule('Waypoints').mapLine:GetText()"), "it still says where the cursor is").toMatch(/Cursor 40\.0, 52\.5/);
  expect(addon.eval("local p = ns.GetModule('Waypoints').mapLine.__points.BOTTOM return { p.point, p.rel == Vanguard_MapCoords, p.y }"), "along the bottom of the canvas").toEqual(["BOTTOM", true, 6]);
  const late = loggedIn(WINDOWS_ENV + "__window('TestOnlyLate')");
  late.eval(WORLD_MAP_ENV.slice(WINDOWS_ENV.length));
  late.fire("ADDON_LOADED", "Blizzard_WorldMap");
  late.eval("WorldMapFrame:Show()");
  expect(late.eval("return { Vanguard_MapCoords ~= nil, WorldMapFrame.BorderFrame.vgWindow == nil }"), "a map that loads after login gets both the line and the skin").toEqual([true, true]);
  expect(windowState(late, "TestOnlyMapBorder"), "").toMatchObject({ art: 0, panel: true });
});

it("world map: the nav bar, its crumbs and the quest log toggle are dressed, and follow the map's changes", () => {
  const addon = loggedIn(WORLD_MAP_ENV);
  addon.eval("WorldMapFrame:Show()");
  // The nav bar's art alphas and how many of its buttons are painted.
  const nav = () => addon.eval(`local n = WorldMapFrame.NavBar
    local tex = (select(1, n:GetRegions())):GetAlpha()
    local flat = 0 for _, b in ipairs(n.navList) do if select('#', b:GetRegions()) > 1 then flat = flat + 1 end end
    return { tex, (select(1, n.overlay:GetRegions())):GetAlpha(), (select(1, n.home:GetRegions())):GetAlpha(), (select(1, n.overflow:GetRegions())):GetAlpha(), #n.navList, flat }`);
  expect(nav(), "the strip, the overlay and the buttons' art are faded; the home button is flat").toEqual([0, 0, 0, 0, 1, 1]);
  expect(fills(addon, "WorldMapFrame.NavBar"), "the nav bar has an inset panel").toBe(1);
  expect(addon.eval("local g = WorldMapFrame.NavBar.overflow.vgGlyph return g:GetText()"), "the overflow button gets a text glyph in place of its art").toBe("...");
  addon.eval("WorldMapFrame.NavBar:Refresh() WorldMapFrame.NavBar:Refresh()");
  expect(nav().slice(4), "two new crumbs, each a flat button as it is made").toEqual([3, 3]);
  const painted = windowState(addon, "TestOnlyMapBorder").painted;
  addon.eval("WorldMapFrame.NavBar:Refresh() WorldMapFrame:Hide() WorldMapFrame:Show()");
  expect(windowState(addon, "TestOnlyMapBorder").painted - painted, "one more crumb is one more painted frame, nothing painted twice").toBe(1);
  expect(addon.eval("local b = WorldMapFrame.SidePanelToggle.OpenButton return { b.shadow:GetAlpha(), b.icon:GetAlpha() }"), "the toggle's corner shadow is faded, its arrow kept").toEqual([0, 1]);
  expect(addon.eval("local b = WorldMapFrame.SidePanelToggle.CloseButton return { b.shadow:GetAlpha(), b.icon:GetAlpha() }"), "both buttons").toEqual([0, 1]);
});

it("world map: switched off it stays the game's; a client missing parts or the map loads cleanly", () => {
  const off = loggedIn(WORLD_MAP_ENV, MAP_OFF);
  off.eval("WorldMapFrame:Show()");
  expect([windowState(off, "TestOnlyMapBorder").art !== 0, off.eval("return WorldMapFrame.vgWindow == nil and WorldMapFrame.NavBar.overflow.vgGlyph == nil"), fills(off, "WorldMapFrame")], "not hooked, art left, nothing painted").toEqual([true, true, 0]);
  const bare = loggedIn(`WorldMapFrame = CreateFrame("Frame", "WorldMapFrame", UIParent)`);
  bare.eval("WorldMapFrame:Show()");
  const sparse = loggedIn(`local m = CreateFrame("Frame", "WorldMapFrame", UIParent) m.BorderFrame = {} m.NavBar = CreateFrame("Frame", nil, m) m.SidePanelToggle = {} m.SynchronizeDisplayState = true`);
  sparse.eval("WorldMapFrame:Show()");
  for (const addon of [bare, sparse]) expect(addon.eval("return #ns.errors"), "no errors without the parts").toBe(0);
});
