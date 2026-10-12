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
    if r.__kind == "Texture" and r:GetAlpha() ~= 0 and r:IsShown() and r.__points.TOPLEFT and r.__points.BOTTOMRIGHT then n = n + 1 end
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

// Vanguard's own quest log switched off, so the game's quest panel is the one in use.
const OWN_LOG_OFF = "VanguardDB.profiles = { Default = { QuestLog = { own = false } } }";

// TEST-ONLY quest panel in the map, shaped like Blizzard's QuestMapFrame.xml: the list (QuestsFrame with its ornate
// BorderFrame and scroll background and edge) holding the details of one quest (its Bg, borders, rewards tile and
// buttons), and the pop-out QuestLogPopupDetailFrame (a ButtonFrameTemplate window with three push buttons).
const QUEST_MAP_ENV = WINDOWS_ENV + `
  local panel = CreateFrame("Frame", "QuestMapFrame", UIParent) panel:Hide()
  local list = CreateFrame("Frame", nil, panel) panel.QuestsFrame = list
  list.BorderFrame = CreateFrame("Frame", nil, list) list.BorderFrame:CreateTexture()
  list.ScrollFrame = CreateFrame("ScrollFrame", nil, list)
  list.ScrollFrame.Background, list.ScrollFrame.Edge = list.ScrollFrame:CreateTexture(), list.ScrollFrame:CreateTexture()
  local details = CreateFrame("Frame", nil, list) list.DetailsFrame = details
  details.Bg, details.SealMaterialBG = details:CreateTexture(), details:CreateTexture()
  details.BorderFrame = CreateFrame("Frame", nil, details) details.BorderFrame:CreateTexture()
  details.BackFrame = CreateFrame("Frame", nil, details) details.BackFrame:CreateTexture()
  details.BackFrame.BackButton = CreateFrame("Button", nil, details.BackFrame) details.BackFrame.BackButton:CreateTexture()
  details.RewardsFrameContainer = CreateFrame("Frame", nil, details)
  details.RewardsFrameContainer.RewardsFrame = CreateFrame("Frame", nil, details.RewardsFrameContainer)
  details.RewardsFrameContainer.RewardsFrame:CreateTexture()
  for _, key in ipairs({ "AbandonButton", "ShareButton", "TrackButton" }) do details[key] = CreateFrame("Button", nil, details) details[key]:CreateTexture() end
  __window("QuestLogPopupDetailFrame")
  for _, key in ipairs({ "Abandon", "Share", "Track" }) do CreateFrame("Button", "QuestLogPopupDetailFrame" .. key .. "Button", QuestLogPopupDetailFrame) end
`;

// The quest panel's parts' alphas, in a fixed order, and its painted count.
const questPanel = (addon) => addon.eval(`local p, d = QuestMapFrame, QuestMapFrame.QuestsFrame.DetailsFrame
  local function a(f) return (select(1, f:GetRegions())):GetAlpha() end
  return { list = p.QuestsFrame.BorderFrame:GetRegions():GetAlpha(), scroll = p.QuestsFrame.ScrollFrame.Background:GetAlpha(), edge = p.QuestsFrame.ScrollFrame.Edge:GetAlpha(),
    bg = d.Bg:GetAlpha(), seal = d.SealMaterialBG:GetAlpha(), border = a(d.BorderFrame), strip = a(d.BackFrame), rewards = a(d.RewardsFrameContainer.RewardsFrame),
    buttons = { a(d.AbandonButton), a(d.ShareButton), a(d.TrackButton), a(d.BackFrame.BackButton) }, painted = ns.Theme.PaintedCount() }`);

it("quest panel in the map: with Vanguard's quest log off, the list, the details and the pop-out window are in the theme", () => {
  const addon = loggedIn(QUEST_MAP_ENV, { savedVariables: OWN_LOG_OFF });
  addon.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  const first = questPanel(addon);
  expect(first, "the ornate borders, backgrounds, rewards tile and the buttons' art are faded").toMatchObject({
    list: 0, scroll: 0, edge: 0, bg: 0, seal: 0, border: 0, strip: 0, rewards: 0, buttons: [0, 0, 0, 0] });
  expect([fills(addon, "QuestMapFrame.QuestsFrame"), fills(addon, "QuestMapFrame.QuestsFrame.DetailsFrame")], "the list and the details each get an inset panel").toEqual([1, 1]);
  expect(windowState(addon, "QuestLogPopupDetailFrame"), "the pop-out is a window in the theme").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(["Abandon", "Share", "Track"].map((b) => fills(addon, `QuestLogPopupDetailFrame${b}Button`)), "its three buttons are themed (one fill each; the hover fill stays clear until the mouse comes over)").toEqual([1, 1, 1]);
  addon.eval("QuestMapFrame:Hide() QuestMapFrame:Show() QuestLogPopupDetailFrame:Hide() QuestLogPopupDetailFrame:Show()");
  expect(questPanel(addon).painted, "showing them again paints nothing new").toBe(first.painted);
});

it("quest panel in the map: left the game's while Vanguard's quest log is on, or the group is off", () => {
  const own = loggedIn(QUEST_MAP_ENV);
  own.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  expect([questPanel(own).bg, questPanel(own).list, windowState(own, "QuestLogPopupDetailFrame").panel], "Vanguard's log is the quest log: the game's panels are untouched").toEqual([1, 1, false]);
  const off = loggedIn(QUEST_MAP_ENV, { savedVariables: OWN_LOG_OFF.replace("QuestLog = { own = false }", "QuestLog = { own = false }, Windows = { map = false }") });
  off.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  expect([questPanel(off).bg, off.eval("return QuestMapFrame.vgWindow == nil and QuestLogPopupDetailFrame.vgWindow == nil")], "with the map group off they are not even hooked").toEqual([1, true]);
  const sparse = loggedIn(`CreateFrame("Frame", "QuestMapFrame", UIParent).QuestsFrame = {} CreateFrame("Frame", "QuestLogPopupDetailFrame", UIParent)`, { savedVariables: OWN_LOG_OFF });
  sparse.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  const partial = loggedIn(`local p = CreateFrame("Frame", "QuestMapFrame", UIParent) p.DetailsFrame = CreateFrame("Frame", nil, p) p.DetailsFrame.BackFrame = {}`, { savedVariables: OWN_LOG_OFF });
  partial.eval("QuestMapFrame:Show()");
  for (const addon of [sparse, partial]) expect(addon.eval("return #ns.errors"), "a client with fewer parts loads cleanly").toBe(0);
});

// TEST-ONLY battlefield map, shaped like Blizzard_BattlefieldMap.xml: the tab (three tab textures and its label), the map
// frame with its canvas and an ornate eight-piece BorderFrame holding a close button. Made when the game loads the part.
const BATTLEFIELD_ENV = `
  function __battlefieldMap()
    local tab = CreateFrame("Button", "BattlefieldMapTab", UIParent)
    for _, key in ipairs({ "Left", "Middle", "Right" }) do tab[key] = tab:CreateTexture() end
    tab.Text = tab:CreateFontString(nil, "OVERLAY")
    local map = CreateFrame("Frame", "BattlefieldMapFrame", UIParent) map:Hide()
    map.ScrollContainer = CreateFrame("Frame", nil, map) map.ScrollContainer:CreateTexture():SetTexture("TEST-ONLY-CANVAS")
    local border = CreateFrame("Frame", nil, map) map.BorderFrame = border
    for _, key in ipairs({ "TopLeft", "TopRight", "BottomLeft", "BottomRight", "Top", "Bottom", "Left", "Right" }) do border[key] = border:CreateTexture() end
    border.CloseButton = CreateFrame("Button", nil, border) border.CloseButton:CreateTexture()
  end
`;

it("battlefield map: its border and tab in the theme once the game loads it, the canvas left alone", () => {
  const addon = loggedIn(BATTLEFIELD_ENV);
  addon.fire("ADDON_LOADED", "TEST-ONLY_SomethingElse");
  addon.eval("__battlefieldMap()");
  expect(addon.eval("return BattlefieldMapFrame.vgWindow == nil"), "nothing is touched until the part of the game loads").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_BattlefieldMap");
  addon.eval("BattlefieldMapFrame:Show()");
  expect(addon.eval("local b = BattlefieldMapFrame.BorderFrame local out = {} for _, k in ipairs({ 'TopLeft', 'TopRight', 'BottomLeft', 'BottomRight', 'Top', 'Bottom', 'Left', 'Right' }) do out[#out + 1] = b[k]:GetAlpha() end return out"), "the ornate border's eight pieces are faded").toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect([fills(addon, "BattlefieldMapFrame.BorderFrame"), addon.eval("return select('#', BattlefieldMapFrame.BorderFrame:GetRegions()) > 8")], "an edge is painted over the map but no fill, which would hide it").toEqual([0, true]);
  expect(addon.eval("local c = BattlefieldMapFrame.BorderFrame.CloseButton return select('#', c:GetRegions()) > 1"), "the close button is the theme's").toBe(true);
  expect(addon.eval("local t = BattlefieldMapTab return { t.Left:GetAlpha(), t.Middle:GetAlpha(), t.Right:GetAlpha(), t.Text:GetAlpha() }"), "the tab's art is faded, its label kept").toEqual([0, 0, 0, 1]);
  expect([fills(addon, "BattlefieldMapTab"), alpha(addon, "BattlefieldMapFrame.ScrollContainer")], "the tab is a flat button (its hover clear at rest), the canvas the game's").toEqual([1, 1]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("BattlefieldMapFrame:Hide() BattlefieldMapFrame:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it again paints nothing new").toBe(painted);
});

it("battlefield map: switched off it stays the game's; a client without the tab or border is fine", () => {
  const off = loggedIn(BATTLEFIELD_ENV, MAP_OFF);
  off.eval("__battlefieldMap()");
  off.fire("ADDON_LOADED", "Blizzard_BattlefieldMap");
  off.eval("BattlefieldMapFrame:Show()");
  expect([off.eval("return BattlefieldMapFrame.vgWindow == nil"), off.eval("return BattlefieldMapTab.Left:GetAlpha()")], "not hooked, art left").toEqual([true, 1]);
  const bare = loggedIn(`CreateFrame("Frame", "BattlefieldMapFrame", UIParent)`);
  bare.fire("ADDON_LOADED", "Blizzard_BattlefieldMap");
  bare.eval("BattlefieldMapFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no border, no tab: no errors").toBe(0);
});

// TEST-ONLY group finder, shaped like Blizzard_GroupFinder_VanillaStyle's Mainline XML: the plain outer window with its
// close button and the eye (a static picture and an animation), the listing and browse pages (PortraitFrameTemplateNoCloseButton
// frames filling the window, with their extra art, buttons and the listing's comment box), and the browse tooltip.
// Made when the game loads the part.
const FINDER_ENV = WINDOWS_ENV + `
  function __button(parent, name) local b = CreateFrame("Button", name, parent) b:CreateTexture() return b end
  function __finder()
    local outer = CreateFrame("Frame", "LFGParentFrame", UIParent) outer:Hide()
    __button(outer, "LFGParentFrameCloseButton")
    local eye = __button(outer, "LFGParentFramePortrait")
    eye.texture = eye:CreateTexture() eye.Anim = CreateFrame("Frame", nil, eye) eye.Anim.Picture = eye.Anim:CreateTexture()
    local listing = __window("LFGListingFrame")
    listing.Inset.CustomBG = listing.Inset:CreateTexture()
    listing.RolesSection, listing.DividerFrame = CreateFrame("Frame", nil, listing), CreateFrame("Frame", nil, listing)
    listing.RolesSection:CreateTexture() listing.DividerFrame:CreateTexture()
    listing.BackButton, listing.PostButton = __button(listing), __button(listing)
    listing.GroupRoleButtons = CreateFrame("Frame", nil, listing) listing.GroupRoleButtons.RolePollButton = __button(listing.GroupRoleButtons)
    listing.ActivityView = CreateFrame("Frame", nil, listing) listing.ActivityView.BarTop = listing.ActivityView:CreateTexture()
    listing.ActivityView.Comment = CreateFrame("ScrollFrame", nil, listing.ActivityView) listing.ActivityView.Comment.TopLeftTex = listing.ActivityView.Comment:CreateTexture()
    listing.ActivityView.Comment.EditBox = CreateFrame("EditBox", nil, listing.ActivityView.Comment)
    local browse = __window("LFGBrowseFrame")
    browse.Bg, browse.BackgroundArt, browse.BarTop = browse:CreateTexture(), browse:CreateTexture(), browse:CreateTexture()
    browse.SendMessageButton, browse.GroupInviteButton = __button(browse), __button(browse)
    local tip = CreateFrame("Frame", "LFGBrowseSearchEntryTooltip", UIParent) tip:Hide()
    tip.NineSlice = CreateFrame("Frame", nil, tip) tip.NineSlice:CreateTexture()
  end
`;

it("group finder: the window, its listing and browse pages and the group tooltip in the theme once the game loads it", () => {
  const addon = loggedIn(FINDER_ENV);
  addon.eval("__finder()");
  expect(addon.eval("return LFGParentFrame.vgWindow == nil"), "nothing is touched until the part of the game loads").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  addon.eval("LFGParentFrame:Show() LFGListingFrame:Show() LFGBrowseFrame:Show() LFGBrowseSearchEntryTooltip:Show()");
  expect([fills(addon, "LFGParentFrame"), addon.eval("return select('#', LFGParentFrameCloseButton:GetRegions()) > 1")], "the window gets one panel, and the close button is the theme's").toEqual([1, true]);
  expect(addon.eval("local e = LFGParentFramePortrait return { e.texture:GetAlpha(), e.Anim.Picture:GetAlpha() }"), "the eye's static picture is faded, its animation kept").toEqual([0, 1]);
  const listing = windowState(addon, "LFGListingFrame");
  expect(listing, "the pages' template art is faded; they carry no panel of their own, the window does").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, panel: false, title: true });
  expect(windowState(addon, "LFGBrowseFrame"), "both pages").toMatchObject({ art: 0, nine: 0, portrait: 0, panel: false, title: true });
  expect(addon.eval("local l, b = LFGListingFrame, LFGBrowseFrame return { l.Inset.CustomBG:GetAlpha(), (l.RolesSection:GetRegions()):GetAlpha(), (l.DividerFrame:GetRegions()):GetAlpha(), l.ActivityView.BarTop:GetAlpha(), b.Bg:GetAlpha(), b.BackgroundArt:GetAlpha(), b.BarTop:GetAlpha() }"), "the insets, strips, dividers and scroll lines").toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect([fills(addon, "LFGListingFrame.Inset"), fills(addon, "LFGListingFrame.ActivityView.Comment")], "an inset panel on the page, and the comment box is the theme's edit box").toEqual([1, 1]);
  expect(addon.eval("local c = LFGListingFrame.ActivityView.Comment return { c.TopLeftTex:GetAlpha(), c.EditBox:GetAlpha() }"), "its border art is faded, the box inside kept").toEqual([0, 1]);
  expect(addon.eval("local l, b = LFGListingFrame, LFGBrowseFrame local out = {} for _, f in ipairs({ l.BackButton, l.PostButton, l.GroupRoleButtons.RolePollButton, b.SendMessageButton, b.GroupInviteButton }) do out[#out + 1] = (f:GetRegions()):GetAlpha() end return out"), "the buttons' art is faded").toEqual([0, 0, 0, 0, 0]);
  expect([fills(addon, "LFGListingFrame.PostButton"), fills(addon, "LFGBrowseFrame.GroupInviteButton")], "and they are flat buttons (one fill; the hover clear at rest)").toEqual([1, 1]);
  expect([addon.eval("return LFGBrowseSearchEntryTooltip.NineSlice:GetAlpha()"), fills(addon, "LFGBrowseSearchEntryTooltip")], "the tooltip's border is faded and a panel painted").toEqual([0, 1]);
  const painted = listing.painted;
  addon.eval("for _, n in ipairs({ 'LFGParentFrame', 'LFGListingFrame', 'LFGBrowseFrame', 'LFGBrowseSearchEntryTooltip' }) do _G[n]:Hide() _G[n]:Show() end");
  expect(windowState(addon, "LFGListingFrame").painted, "showing them again paints nothing new").toBe(painted);
});

it("group finder: switched off it stays the game's; a client missing parts of it loads cleanly", () => {
  const off = loggedIn(FINDER_ENV, MAP_OFF);
  off.eval("__finder()");
  off.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  off.eval("LFGParentFrame:Show() LFGListingFrame:Show()");
  expect([off.eval("return LFGParentFrame.vgWindow == nil and LFGListingFrame.vgWindow == nil"), windowState(off, "LFGListingFrame").art !== 0, fills(off, "LFGParentFrame")], "not hooked, art left").toEqual([true, true, 0]);
  const bare = loggedIn(`for _, n in ipairs({ "LFGParentFrame", "LFGListingFrame", "LFGBrowseFrame", "LFGBrowseSearchEntryTooltip" }) do CreateFrame("Frame", n, UIParent) end
    LFGListingFrame.ActivityView, LFGListingFrame.GroupRoleButtons, LFGBrowseFrame.TitleContainer, LFGBrowseFrame.Inset = {}, {}, {}, {}`);
  bare.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  bare.eval("LFGParentFrame:Show() LFGListingFrame:Show() LFGBrowseFrame:Show() LFGBrowseSearchEntryTooltip:Show()");
  expect(bare.eval("return #ns.errors"), "bare frames: no errors").toBe(0);
});

// TEST-ONLY Legacy system window, shaped like Blizzard_LegacySystem's XML: a portrait frame with three pages (each with its
// Background, the tree's divider frame and node button, the challenges' two panes and divider), the side tabs and their
// indicators. Made when the game loads the part.
const LEGACY_ENV = WINDOWS_ENV + `
  function __legacy()
    local f = __window("LegacySystemFrame")
    for _, key in ipairs({ "TreePage", "ChallengesPage", "RewardTrackPage" }) do
      local page = CreateFrame("Frame", nil, f) f[key] = page
      page.Background = page:CreateTexture()
    end
    local tree, chal = f.TreePage, f.ChallengesPage
    tree.VerticalDivider = CreateFrame("Frame", nil, tree) tree.VerticalDivider.VerticalDivider = tree.VerticalDivider:CreateTexture()
    tree.LegacyTreeTraitPanel = CreateFrame("Frame", nil, tree) tree.LegacyTreeTraitPanel.ButtonsParent = CreateFrame("Frame", nil, tree.LegacyTreeTraitPanel)
    tree.Node = CreateFrame("Button", nil, tree.LegacyTreeTraitPanel.ButtonsParent) tree.Node:CreateTexture()
    chal.VerticalDivider = CreateFrame("Frame", nil, chal) chal.VerticalDivider:CreateTexture()
    chal.CategoryList, chal.DetailPane = CreateFrame("Frame", nil, chal), CreateFrame("Frame", nil, chal)
    f.LegacyTreeTab = CreateFrame("Frame", nil, f) f.LegacyTreeTab:CreateTexture()
    f.TabIndicators = CreateFrame("Frame", nil, f) f.TabIndicators:CreateTexture()
  end
`;

it("legacy system: the window in the theme, its page backgrounds faded and its panes panelled, tabs and tree nodes untouched", () => {
  // The tabs group (Modules/WindowsTabs.lua) dresses the Legacy tabs and indicators; off here, so this case sees only the map group's skin.
  const addon = loggedIn(LEGACY_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  addon.eval("__legacy()");
  expect(addon.eval("return LegacySystemFrame.vgWindow == nil"), "nothing is touched until the part of the game loads").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  addon.eval("LegacySystemFrame:Show()");
  const first = windowState(addon, "LegacySystemFrame");
  expect(first, "the window's art is faded, a panel painted, the title in the theme font").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, panel: true, title: true });
  expect(addon.eval("local f = LegacySystemFrame return { f.TreePage.Background:GetAlpha(), f.ChallengesPage.Background:GetAlpha(), f.RewardTrackPage.Background:GetAlpha(), (f.TreePage.VerticalDivider:GetRegions()):GetAlpha(), (f.ChallengesPage.VerticalDivider:GetRegions()):GetAlpha() }"), "the three page backgrounds and both dividers are faded").toEqual([0, 0, 0, 0, 0]);
  expect([fills(addon, "LegacySystemFrame.ChallengesPage.CategoryList"), fills(addon, "LegacySystemFrame.ChallengesPage.DetailPane")], "the challenge panes are inset panels").toEqual([1, 1]);
  expect(addon.eval("local f = LegacySystemFrame return { (f.LegacyTreeTab:GetRegions()):GetAlpha(), (f.TabIndicators:GetRegions()):GetAlpha(), (f.TreePage.Node:GetRegions()):GetAlpha(), tostring(f.TreePage.Node.vgWindow) }"), "the tabs, their indicators and the tree's node buttons are left to the game").toEqual([1, 1, 1, "nil"]);
  expect(fills(addon, "LegacySystemFrame.TreePage.LegacyTreeTraitPanel"), "the tree's panel is not covered, so it does not hide the close button's corner").toBe(0);
  addon.eval("LegacySystemFrame:Hide() LegacySystemFrame:Show()");
  expect(windowState(addon, "LegacySystemFrame"), "showing it again paints nothing new").toMatchObject({ panel: true, painted: first.painted });
});

it("legacy system: switched off it stays the game's; a client missing its pages loads cleanly", () => {
  const off = loggedIn(LEGACY_ENV, MAP_OFF);
  off.eval("__legacy()");
  off.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  off.eval("LegacySystemFrame:Show()");
  expect([windowState(off, "LegacySystemFrame").art !== 0, off.eval("return LegacySystemFrame.TreePage.Background:GetAlpha()"), off.eval("return LegacySystemFrame.vgWindow == nil")], "not hooked, art left").toEqual([true, 1, true]);
  const bare = loggedIn(WINDOWS_ENV + `__window("LegacySystemFrame") LegacySystemFrame.TreePage = {} LegacySystemFrame.ChallengesPage = CreateFrame("Frame", nil, LegacySystemFrame)`);
  bare.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  bare.eval("LegacySystemFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no pages, or bare ones: no errors").toBe(0);
});

// TEST-ONLY queue status panel, shaped like Blizzard's QueueStatusFrame (a TooltipBackdropTemplate frame): its NineSlice, an entry
// pool holding one entry whose assigned spec has a gold ring, and an Update that takes another entry from the pool.
const QUEUE_ENV = `
  function __queueEntry(pool)
    local entry = CreateFrame("Frame", nil, QueueStatusFrame)
    entry.AssignedSpec = CreateFrame("Frame", nil, entry)
    entry.AssignedSpec.Icon, entry.AssignedSpec.Border = entry.AssignedSpec:CreateTexture(), entry.AssignedSpec:CreateTexture()
    entry.EntrySeparator = entry:CreateTexture()
    pool.items[#pool.items + 1] = entry
    return entry
  end
  local f = CreateFrame("Frame", "QueueStatusFrame", UIParent) f:Hide()
  f.NineSlice = CreateFrame("Frame", nil, f) f.NineSlice:CreateTexture()
  f.statusEntriesPool = { items = {} }
  function f.statusEntriesPool:EnumerateActive() local i = 0 return function() i = i + 1 return self.items[i] end end
  __queueEntry(f.statusEntriesPool)
  function f:Update() __queueEntry(self.statusEntriesPool) end
`;

it("queue status: the panel is a themed tooltip and the entries' rings are faded, now and when the game rebuilds them", () => {
  const addon = loggedIn(QUEUE_ENV);
  addon.eval("QueueStatusFrame:Show()");
  expect([addon.eval("return QueueStatusFrame.NineSlice:GetAlpha()"), fills(addon, "QueueStatusFrame")], "the game's border is faded and a panel painted").toEqual([0, 1]);
  // Queue entry n's spec ring, icon and separator alphas.
  const ring = (n) => addon.eval(`local e = QueueStatusFrame.statusEntriesPool.items[${n}] return { e.AssignedSpec.Border:GetAlpha(), e.AssignedSpec.Icon:GetAlpha(), e.EntrySeparator:GetAlpha() }`);
  expect(ring(1), "the ring is faded, the icon and the line between entries kept").toEqual([0, 1, 1]);
  addon.eval("QueueStatusFrame:Update()");
  expect(ring(2), "an entry the game makes on its next update is dressed too").toEqual([0, 1, 1]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("QueueStatusFrame:Hide() QueueStatusFrame:Show() QueueStatusFrame:Update()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it and updating again paints nothing new").toBe(painted);
});

it("queue status: switched off it stays the game's; a client without a pool, entries' parts or Update is fine", () => {
  const off = loggedIn(QUEUE_ENV, MAP_OFF);
  off.eval("QueueStatusFrame:Show() QueueStatusFrame:Update()");
  expect([off.eval("return QueueStatusFrame.NineSlice:GetAlpha()"), off.eval("return QueueStatusFrame.statusEntriesPool.items[1].AssignedSpec.Border:GetAlpha()")], "not hooked").toEqual([1, 1]);
  const bare = loggedIn(`CreateFrame("Frame", "QueueStatusFrame", UIParent)`);
  bare.eval("QueueStatusFrame:Show()");
  const sparse = loggedIn(`local f = CreateFrame("Frame", "QueueStatusFrame", UIParent) f.Update = function() end
    f.statusEntriesPool = { EnumerateActive = function() local done return function() if not done then done = true return CreateFrame("Frame") end end end }`);
  sparse.eval("QueueStatusFrame:Show() QueueStatusFrame:Update()");
  const noHook = loggedIn(QUEUE_ENV + "hooksecurefunc = nil");
  noHook.eval("QueueStatusFrame:Show()");
  for (const addon of [bare, sparse, noHook]) expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return ''"), "no errors").toBe("");
});

// TEST-ONLY calendar, shaped like Blizzard_Calendar's XML: the frame with its template edge, weekday and month textures
// (and the two it keeps: the selected weekday's glow and the last day's shadow), the close and month buttons, 42 day buttons (a parchment
// normal texture, an event texture and a date frame each), and the seven dialogs (a Border, a Header plate, their close
// and push buttons, the holiday's art, the create dialog's icon and its text boxes). Made when the game loads the part.
const CALENDAR_ENV = WINDOWS_ENV + `
  function __calendar()
    local f = CreateFrame("Frame", "CalendarFrame", UIParent)
    f:Hide()
    for _, name in ipairs({ "CalendarFrameTopLeftTexture", "CalendarWeekday1Background", "CalendarMonthBackground", "CalendarWeekdaySelectedTexture", "CalendarLastDayDarkTexture" }) do
      _G[name] = f:CreateTexture(nil, "BACKGROUND")
    end
    CreateFrame("Button", "CalendarCloseButton", f):CreateTexture()
    for _, name in ipairs({ "CalendarPrevMonthButton", "CalendarNextMonthButton" }) do
      local b = CreateFrame("Button", name, f)
      b.art, b.icon, b.off = b:CreateTexture(), b:CreateTexture(), b:CreateTexture()
      b.GetNormalTexture = function(self) return self.icon end
      b.GetDisabledTexture = function(self) return self.off end
    end
    for i = 1, 42 do
      local b = CreateFrame("Button", "CalendarDayButton" .. i, f)
      b.parchment, b.event = b:CreateTexture(), b:CreateTexture()
      b.GetNormalTexture = function(self) return self.parchment end
    end
  end
  function __calendarDialogs()
    for _, name in ipairs({ "CalendarViewHolidayFrame", "CalendarViewRaidFrame", "CalendarViewEventFrame", "CalendarCreateEventFrame", "CalendarMassInviteFrame", "CalendarEventPickerFrame", "CalendarTexturePickerFrame" }) do
      local d = __window(name)
      d.Border = CreateFrame("Frame", nil, d) d.Border:CreateTexture()
      d.Header = CreateFrame("Frame", nil, d)
      for _, key in ipairs({ "LeftBG", "RightBG", "CenterBG" }) do d.Header[key] = d.Header:CreateTexture() end
      d.Header.Text = d.Header:CreateFontString(nil, "OVERLAY")
    end
    CalendarViewHolidayFrame.Texture = CalendarViewHolidayFrame:CreateTexture() CalendarViewHolidayFrame.Texture:SetAlpha(0.4)
    _G.CalendarCreateEventIcon = CalendarCreateEventFrame:CreateTexture()
    for _, name in ipairs({ "CalendarViewHolidayCloseButton", "CalendarViewEventCloseButton", "CalendarCreateEventCloseButton", "CalendarMassInviteCloseButton",
      "CalendarViewEventAcceptButton", "CalendarCreateEventCreateButton", "CalendarEventPickerCloseButton", "CalendarTexturePickerAcceptButton" }) do
      local b = CreateFrame("Button", name, CalendarViewEventFrame) b:CreateTexture()
    end
    for _, name in ipairs({ "CalendarCreateEventTitleEdit", "CalendarMassInviteMinLevelEdit" }) do
      local e = CreateFrame("EditBox", name, CalendarCreateEventFrame) e:CreateTexture()
    end
  end
`;

// A calendar part's alpha (by Lua expression), or "nil" for a part this client lacks.
const calAlpha = (addon, expr) => addon.eval(`local p = ${expr} return p and p:GetAlpha() or "nil"`);
// Whether a close button carries the theme's close seal: its CloseMark glyph, drawn (the theme centers its control parts, so they are no fill).
const closeSeal = (addon, name) => addon.eval(`for _, r in ipairs({ ${name}:GetRegions() }) do if (r.__texture or ""):find("CloseMark") and r:GetAlpha() ~= 0 then return true end end return false`);

it("calendar: the window's art is faded but the weekday glow and last-day shadow, the month buttons and day grid are dressed, the event textures kept", () => {
  const addon = loggedIn(CALENDAR_ENV);
  addon.eval("__calendar()");
  addon.fire("ADDON_LOADED", "Blizzard_Calendar");
  addon.eval("CalendarFrame:Show()");
  expect(["CalendarFrameTopLeftTexture", "CalendarWeekday1Background", "CalendarMonthBackground"].map(n => calAlpha(addon, `_G.${n}`)), "the template textures are faded").toEqual([0, 0, 0]);
  expect(["CalendarWeekdaySelectedTexture", "CalendarLastDayDarkTexture"].map(n => calAlpha(addon, `_G.${n}`)), "the glow and the shadow stay").toEqual([1, 1]);
  expect(fills(addon, "CalendarFrame"), "the frame has a panel fill").toBe(1);
  expect(addon.eval("return CalendarCloseButton:GetRegions():GetAlpha()"), "the close button's art is gone").toBe(0);
  expect(addon.eval("local p, n = CalendarPrevMonthButton, CalendarNextMonthButton return { p.art:GetAlpha(), p.icon:GetAlpha(), p.off:GetAlpha(), n.art:GetAlpha(), n.icon:GetAlpha() }"), "the month buttons keep their icon and lose the template art").toEqual([0, 1, 1, 0, 1]);
  expect([fills(addon, "CalendarPrevMonthButton"), fills(addon, "CalendarNextMonthButton")], "and are flat tiles").toEqual([1, 1]);
  expect(addon.eval("local gone, event = 0, 0 for i = 1, 42 do local b = _G['CalendarDayButton' .. i] if b.parchment:GetAlpha() == 0 then gone = gone + 1 end if b.event:GetAlpha() == 1 then event = event + 1 end end return { gone, event }"), "all 42 days lose the parchment and keep the event texture").toEqual([42, 42]);
  expect([fills(addon, "CalendarDayButton1"), fills(addon, "CalendarDayButton42")], "each day is an inset panel").toEqual([1, 1]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CalendarFrame:Hide() CalendarFrame:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it again paints nothing new").toBe(painted);
});

it("calendar: the seven dialogs are skinned, with their headers, buttons and text boxes dressed and their pictures kept", () => {
  const addon = loggedIn(CALENDAR_ENV);
  addon.eval("__calendar() __calendarDialogs()");
  addon.fire("ADDON_LOADED", "Blizzard_Calendar");
  const names = ["CalendarViewHolidayFrame", "CalendarViewRaidFrame", "CalendarViewEventFrame", "CalendarCreateEventFrame", "CalendarMassInviteFrame", "CalendarEventPickerFrame", "CalendarTexturePickerFrame"];
  for (const name of names) addon.eval(`${name}:Show()`);
  for (const name of names) {
    expect(windowState(addon, name), `${name}: art faded, a panel painted`).toMatchObject({ art: 0, nine: 0, portrait: 0, panel: true, title: true });
    expect(addon.eval(`local d = ${name} return { d.Border:GetAlpha(), (d.Border:GetRegions()):GetAlpha(), d.Header.LeftBG:GetAlpha(), d.Header.RightBG:GetAlpha(), d.Header.CenterBG:GetAlpha(), d.Header.Text:GetFont() ~= nil }`), `${name}: the border and the header plate are faded, the title in the theme font`).toEqual([0, 0, 0, 0, 0, true]);
  }
  expect([calAlpha(addon, "CalendarViewHolidayFrame.Texture"), calAlpha(addon, "CalendarCreateEventIcon")], "the holiday's art and the create dialog's icon are left as the game has them").toEqual([0.4, 1]);
  expect(["CalendarViewHolidayCloseButton", "CalendarViewEventCloseButton", "CalendarCreateEventCloseButton", "CalendarMassInviteCloseButton"].map(n => closeSeal(addon, n)), "the close buttons are the theme's close seal").toEqual([true, true, true, true]);
  expect(["CalendarViewEventAcceptButton", "CalendarCreateEventCreateButton", "CalendarEventPickerCloseButton", "CalendarTexturePickerAcceptButton"].map(n => fills(addon, n)), "the push buttons are flat buttons (one fill; the hover clear at rest)").toEqual([1, 1, 1, 1]);
  expect(["CalendarCreateEventTitleEdit", "CalendarMassInviteMinLevelEdit"].map(n => calAlpha(addon, `(_G.${n}:GetRegions())`)), "the text boxes' template art is faded").toEqual([0, 0]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CalendarCreateEventFrame:Hide() CalendarCreateEventFrame:Show() CalendarViewHolidayFrame:Hide() CalendarViewHolidayFrame:Show()");
  expect([addon.eval("return ns.Theme.PaintedCount()"), calAlpha(addon, "CalendarViewHolidayFrame.Texture"), calAlpha(addon, "CalendarCreateEventIcon")], "a second show paints nothing new and keeps the pictures").toEqual([painted, 0.4, 1]);
});

it("calendar: switched off it stays the game's; a client missing the window, its buttons or its dialogs' parts loads cleanly", () => {
  const off = loggedIn(CALENDAR_ENV, MAP_OFF);
  off.eval("__calendar() __calendarDialogs()");
  off.fire("ADDON_LOADED", "Blizzard_Calendar");
  off.eval("CalendarFrame:Show() CalendarViewEventFrame:Show()");
  expect([calAlpha(off, "_G.CalendarFrameTopLeftTexture"), off.eval("return CalendarDayButton1.parchment:GetAlpha()"), off.eval("return CalendarViewEventFrame.Border:GetAlpha()"), off.eval("return CalendarFrame.vgWindow == nil")], "not hooked, art left").toEqual([1, 1, 1, true]);
  const bare = loggedIn(WINDOWS_ENV + `
    CreateFrame("Frame", "CalendarFrame", UIParent):Hide() CalendarPrevMonthButton = {} CalendarDayButton1 = CreateFrame("Button", "CalendarDayButton1", CalendarFrame)
    local d = CreateFrame("Frame", "CalendarViewRaidFrame", UIParent) d.Header = {} d:Hide()
    CreateFrame("Frame", "CalendarCreateEventFrame", UIParent):Hide() CalendarCreateEventTitleEdit = {} CalendarViewEventFrame = {}`);
  bare.fire("ADDON_LOADED", "Blizzard_Calendar");
  bare.eval("CalendarFrame:Show() CalendarViewRaidFrame:Show() CalendarCreateEventFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no month buttons, day textures, header parts or text boxes: no errors").toBe(0);
});
