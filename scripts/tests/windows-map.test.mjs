// windows-map: the map group of game windows (Modules/WindowsMap.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { INSIDES_LUA, WINDOWS_ENV, isTok, loggedIn, windowState } from "./helpers.mjs";

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
  expect(addon.eval("local s = WorldMapFrame.ScrollContainer return { s:GetAlpha(), (select(1, s:GetRegions())):GetAlpha(), tostring(ns.FrameState('vgWindow')[s]) }"), "the canvas is left as the game made it").toEqual([1, 1, "nil"]);
  expect(addon.eval("local t = WorldMapFrame.BorderFrame.Tutorial return { t.Ring:GetAlpha(), t.I:GetAlpha() }"), "the tutorial button keeps its \"i\" and loses its ring").toEqual([0, 1]);
  addon.eval("WorldMapFrame:Hide() WorldMapFrame:Show()");
  expect(windowState(addon, "TestOnlyMapBorder"), "showing it again paints nothing new").toMatchObject({ panel: true, painted: first.painted });
});

it("world map: its close button sits level with the map's higher title, the usual windows' 24 down", () => {
  const addon = loggedIn(WORLD_MAP_ENV + `
    local b = WorldMapFrame.BorderFrame
    b.CloseButton = CreateFrame("Button", nil, b) b.CloseButton:CreateTexture()
    b.CloseButton:SetPoint("TOPRIGHT", b, "TOPRIGHT", 5, 5)`);
  addon.eval("WorldMapFrame:Show()");
  expect(addon.eval("local p = WorldMapFrame.BorderFrame.CloseButton.__points.CENTER return { p.x, p.y }"), "24 in from the right, 14 down").toEqual([expect.closeTo(-24, 0), expect.closeTo(-14, 0)]);
});

it("spellbook: its title stays where the game sets it and its controls sit the usual T.CONTROL.inset in, however often it is skinned", () => {
  const addon = loggedIn(WINDOWS_ENV + `
    local f = __window("PlayerSpellsFrame") local bar = f.TitleContainer
    bar:SetPoint("TOPLEFT", f, "TOPLEFT", 58, -1) bar:SetPoint("TOPRIGHT", f, "TOPRIGHT", -24, -1)
    f.CloseButton:CreateTexture() f.CloseButton:SetPoint("TOPRIGHT", f, "TOPRIGHT", 5, 5)`);
  addon.eval(`local GW = ns.GetModule("Windows") GW.Skin(PlayerSpellsFrame) GW.Skin(PlayerSpellsFrame)`);
  expect(addon.eval("local p = PlayerSpellsFrame.TitleContainer.__points return { p.TOPLEFT.y, p.TOPRIGHT.y, p.TOPLEFT.x }"), "title anchors untouched").toEqual([-1, -1, 58]);
  expect(addon.eval("return PlayerSpellsFrame.CloseButton.__points.CENTER.y"), "controls the usual 24 down, less the panel's padding").toBeLessThan(-10);
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
  expect(late.eval("return { Vanguard_MapCoords ~= nil, ns.FrameState('vgWindow')[WorldMapFrame.BorderFrame] == nil }"), "a map that loads after login gets both the line and the skin").toEqual([true, true]);
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
  expect(addon.eval("local g = ns.FrameState('vgGlyph')[WorldMapFrame.NavBar.overflow] return g:GetText()"), "the overflow button gets a text glyph in place of its art").toBe("...");
  addon.eval("WorldMapFrame.NavBar:Refresh() WorldMapFrame.NavBar:Refresh()");
  expect(nav().slice(4), "two new crumbs, each a flat button as it is made").toEqual([3, 3]);
  const painted = windowState(addon, "TestOnlyMapBorder").painted;
  addon.eval("WorldMapFrame.NavBar:Refresh() WorldMapFrame:Hide() WorldMapFrame:Show()");
  expect(windowState(addon, "TestOnlyMapBorder").painted - painted, "one more crumb is one more painted frame, nothing painted twice").toBe(1);
  // One toggle button's shadow and icon alphas and its theme glyph's texture.
  const toggle = (key) => addon.eval(`local b = WorldMapFrame.SidePanelToggle.${key} local g = ns.FrameState('vgMapGlyph')[b] return { b.shadow:GetAlpha(), b.icon:GetAlpha(), g:GetTexture() }`);
  expect(toggle("OpenButton"), "the toggle's corner shadow and yellow icon are faded, a theme quests icon in their place").toEqual([0, 0, expect.stringContaining("Quests")]);
  expect(toggle("CloseButton"), "the close button gets a theme chevron").toEqual([0, 0, expect.stringContaining("Right")]);
});

it("world map: switched off it stays the game's; a client missing parts or the map loads cleanly", () => {
  const off = loggedIn(WORLD_MAP_ENV, MAP_OFF);
  off.eval("WorldMapFrame:Show()");
  expect([windowState(off, "TestOnlyMapBorder").art !== 0, off.eval("return ns.FrameState('vgWindow')[WorldMapFrame] == nil and ns.FrameState('vgGlyph')[WorldMapFrame.NavBar.overflow] == nil"), fills(off, "WorldMapFrame")], "not hooked, art left, nothing painted").toEqual([true, true, 0]);
  const bare = loggedIn(`WorldMapFrame = CreateFrame("Frame", "WorldMapFrame", UIParent)`);
  bare.eval("WorldMapFrame:Show()");
  const sparse = loggedIn(`local m = CreateFrame("Frame", "WorldMapFrame", UIParent) m.BorderFrame = {} m.NavBar = CreateFrame("Frame", nil, m) m.SidePanelToggle = {} m.SynchronizeDisplayState = true`);
  sparse.eval("WorldMapFrame:Show()");
  for (const addon of [bare, sparse]) expect(addon.eval("return #ns.errors"), "no errors without the parts").toBe(0);
});


// TEST-ONLY extras on the world map (Blizzard_WorldMap, NavigationBar.xml): the home crumb's label and dropdown arrow
// (a button whose Art is the arrow), the floor dropdown the game makes without a key (it carries the template's mixin
// method), the tracking filter and pin buttons, and a toggle whose buttons also have a pushed arrow.
const MAP_PARTS_ENV = WORLD_MAP_ENV + `
  local map, nav = WorldMapFrame, WorldMapFrame.NavBar
  nav.home.text = nav.home:CreateFontString(nil, "OVERLAY") nav.home.text:SetFont("TEST-ONLY-GAME", 12, "")
  local arrow = CreateFrame("Button", nil, nav.home) nav.home.MenuArrowButton = arrow
  arrow.back, arrow.Art, arrow.box, arrow.boxDown = arrow:CreateTexture(), arrow:CreateTexture(), arrow:CreateTexture(), arrow:CreateTexture()
  arrow.box:SetTexture("TEST-ONLY-GOLD-SQUARE") arrow.boxDown:SetTexture("TEST-ONLY-GOLD-SQUARE-DOWN")
  arrow.GetNormalTexture = function(self) return self.box end
  arrow.GetPushedTexture = function(self) return self.boxDown end
  CreateFrame("Frame", nil, map)
  local floor = CreateFrame("Button", nil, map) floor.ShouldShowTrackingIconOnFloor = function() end
  floor.Plate, floor.Arrow = floor:CreateTexture(), floor:CreateTexture()
  map.WorldMapTrackingOptionsButton = CreateFrame("Button", nil, map) map.WorldMapTrackingOptionsButton.Icon = map.WorldMapTrackingOptionsButton:CreateTexture()
  local pin = CreateFrame("Button", nil, map) map.WorldMapTrackingPinButton = pin
  pin.Background, pin.Border, pin.Icon = pin:CreateTexture(), pin:CreateTexture(), pin:CreateTexture()
  for _, key in ipairs({ "OpenButton", "CloseButton" }) do
    local b = map.SidePanelToggle[key] b.pushed = b:CreateTexture() b.GetPushedTexture = function(self) return self.pushed end
  end
`;

it("world map: the crumbs' labels are light and their dropdown arrows keep the arrow, the floor dropdown has a theme arrow, the tracking buttons sit on control tiles", () => {
  const addon = loggedIn(MAP_PARTS_ENV);
  addon.eval("WorldMapFrame:Show()");
  expect(addon.eval("local h = WorldMapFrame.NavBar.home return { h.text.__textColor[1] == ns.Theme.RGB('text'), __looks(h.text, 'label', 'text') }"), "the crumb's label is the label role in the text colour, not the game's gold").toEqual([true, true]);
  expect(addon.eval("local a = WorldMapFrame.NavBar.home.MenuArrowButton return { a.back:GetAlpha(), a.Art:GetAlpha(), ns.Theme.HoverParts(a) ~= nil }"), "the arrow button is a theme button, the game's yellow Art replaced by the theme arrow").toEqual([0, 0, true]);
  expect(addon.eval("local a = WorldMapFrame.NavBar.home.MenuArrowButton return { a.box:GetTexture() == nil, a.boxDown:GetTexture() == nil }"), "the gold-edged square the game shows on mouse-over is emptied, not shown as a picture").toEqual([true, true]);
  expect(addon.eval("return ns.FrameState('vgDropArrow')[WorldMapFrame.NavBar.home.MenuArrowButton] ~= nil"), "and the theme arrow sits where it was").toBe(true);
  expect(addon.eval("local f for _, c in ipairs({ WorldMapFrame:GetChildren() }) do if c.ShouldShowTrackingIconOnFloor then f = c end end return { f.Plate:GetAlpha(), f.Arrow:GetAlpha(), ns.Theme.HoverParts(f) ~= nil }"), "the floor dropdown found by its mixin: plate faded, arrow replaced, a theme button").toEqual([0, 0, true]);
  expect(addon.eval("local o, p = WorldMapFrame.WorldMapTrackingOptionsButton, WorldMapFrame.WorldMapTrackingPinButton return { o.Icon:GetAlpha(), p.Icon:GetAlpha(), p.Background:GetAlpha(), p.Border:GetAlpha() }"), "the game's yellow tracking icons, the pin's disc and gold ring are faded").toEqual([0, 0, 0, 0]);
  expect(["WorldMapTrackingOptionsButton", "WorldMapTrackingPinButton"].map((k) => addon.eval(`return ns.FrameState('vgMapGlyph')[WorldMapFrame.${k}]:GetTexture()`)), "each with a theme icon, a filter and a pin").toEqual([expect.stringContaining("MinimapTracking"), expect.stringContaining("Pin")]);
  expect(["WorldMapTrackingOptionsButton", "WorldMapTrackingPinButton"].map((k) => addon.eval(`local n = 0 for _, r in ipairs({ WorldMapFrame.${k}:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__alpha ~= 0 then n = n + 1 end end return n`)), "each on the window controls' resting tile").toEqual([1, 1]);
  expect(addon.eval("local b = WorldMapFrame.SidePanelToggle.OpenButton return { b.shadow:GetAlpha(), b.icon:GetAlpha(), b.pushed:GetAlpha(), ns.Theme.HoverParts(b) ~= nil }"), "the quest toggle is a theme button with its normal and pushed pictures faded").toEqual([0, 0, 0, true]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("WorldMapFrame:SynchronizeDisplayState() WorldMapFrame.NavBar:Refresh()");
  expect(addon.eval("return { #ns.errors, ns.Theme.PaintedCount() - " + painted + " }"), "the game's redraws add only the new crumb").toEqual([0, 1]);
});

it("world map: a client without the floor dropdown, the tracking buttons or the crumbs' arrows loads cleanly", () => {
  const bare = loggedIn(WORLD_MAP_ENV + "WorldMapFrame.WorldMapTrackingPinButton = {} WorldMapFrame.NavBar.home.MenuArrowButton = {} WorldMapFrame.SidePanelToggle.OpenButton.GetPushedTexture = nil");
  bare.eval("WorldMapFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no errors").toBe(0);
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
  list.ScrollFrame.BorderFrame = CreateFrame("Frame", nil, list.ScrollFrame) list.ScrollFrame.BorderFrame:CreateTexture()
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
  return { list = p.QuestsFrame.BorderFrame:GetRegions():GetAlpha(), scroll = p.QuestsFrame.ScrollFrame.Background:GetAlpha(), edge = p.QuestsFrame.ScrollFrame.Edge:GetAlpha(), ornate = p.QuestsFrame.ScrollFrame.BorderFrame:GetRegions():GetAlpha(),
    bg = d.Bg:GetAlpha(), seal = d.SealMaterialBG:GetAlpha(), border = a(d.BorderFrame), strip = a(d.BackFrame), rewards = a(d.RewardsFrameContainer.RewardsFrame),
    buttons = { a(d.AbandonButton), a(d.ShareButton), a(d.TrackButton), a(d.BackFrame.BackButton) }, painted = ns.Theme.PaintedCount() }`);

it("quest panel in the map: with Vanguard's quest log off, the list, the details and the pop-out window are in the theme", () => {
  const addon = loggedIn(QUEST_MAP_ENV, { savedVariables: OWN_LOG_OFF });
  addon.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  const first = questPanel(addon);
  expect(first, "the ornate borders (the list's is a child of its scroll frame), backgrounds, rewards tile and the buttons' art are faded").toMatchObject({
    list: 0, scroll: 0, edge: 0, ornate: 0, bg: 0, seal: 0, border: 0, strip: 0, rewards: 0, buttons: [0, 0, 0, 0] });
  expect([fills(addon, "QuestMapFrame.QuestsFrame"), fills(addon, "QuestMapFrame.QuestsFrame.DetailsFrame")], "the list and the details each get an inset panel").toEqual([1, 1]);
  expect(windowState(addon, "QuestLogPopupDetailFrame"), "the pop-out is a window in the theme").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(["Abandon", "Share", "Track"].map((b) => fills(addon, `QuestLogPopupDetailFrame${b}Button`)), "its three buttons are themed (one fill each; the hover fill stays clear until the mouse comes over)").toEqual([1, 1, 1]);
  addon.eval("QuestMapFrame:Hide() QuestMapFrame:Show() QuestLogPopupDetailFrame:Hide() QuestLogPopupDetailFrame:Show()");
  expect(questPanel(addon).painted, "showing them again paints nothing new").toBe(first.painted);
});

// TEST-ONLY zone headers in the quest list, shaped like the client's (from /vg frame on the live list): a button with
// ButtonText, a full-width collapseExpand texture, a highlight copy and a CollapseButton; questLogIndex names its entry.
const HEADERS_ENV = QUEST_MAP_ENV + `
  local contents = CreateFrame("Frame", nil, QuestMapFrame.QuestsFrame.ScrollFrame)
  QuestMapFrame.QuestsFrame.ScrollFrame.Contents = contents
  function __header(index)
    local h = CreateFrame("Button", nil, contents)
    h.ButtonText = h:CreateFontString(nil, "ARTWORK") h.bar = h:CreateTexture(nil, "ARTWORK")
    h.CollapseButton = CreateFrame("Button", nil, h) h.CollapseButton.art = h.CollapseButton:CreateTexture()
    h.questLogIndex = index
    return h
  end
  CreateFrame("Button", nil, contents):CreateTexture()
  __header(1) __header(2) __header("none")
  local getInfo = C_QuestLog.GetInfo
  C_QuestLog.GetInfo = function(i) local info = getInfo(i) or {} info.isCollapsed = i == 2 return info end
  function QuestLogQuests_Update() __header(3) end
`;

// Each TEST-ONLY header's bar and button art alpha, and the icon its chevron shows (nil without one).
const headers = (addon) => addon.eval(`local out = {}
  for _, h in ipairs({ QuestMapFrame.QuestsFrame.ScrollFrame.Contents:GetChildren() }) do
    if h.ButtonText then local g = ns.FrameState("vgHeaderGlyph")[h]
      out[#out + 1] = { h.bar:GetAlpha(), h.CollapseButton.art:GetAlpha(), g and g:GetTexture() or "none" } end
  end
  return out`);

it("quest panel in the map: the zone headers lose the game's yellow bar for a chevron, open or folded, as the list redraws", () => {
  const addon = loggedIn(HEADERS_ENV, { savedVariables: OWN_LOG_OFF });
  addon.eval("QuestMapFrame:Show()");
  const down = addon.eval('return ns.Theme.Icon("Down")'), right = addon.eval('return ns.Theme.Icon("Right")');
  expect(headers(addon), "bar and button art faded; Down while open, Right while folded, Down when the entry is unknown").toEqual([[0, 0, down], [0, 0, right], [0, 0, down]]);
  addon.eval("QuestLogQuests_Update()");
  expect(isTok(addon, addon.eval(`for _, h in ipairs({ QuestMapFrame.QuestsFrame.ScrollFrame.Contents:GetChildren() }) do
    local g = h.ButtonText and ns.FrameState("vgHeaderGlyph")[h] if g then return g.__vertexColor end end`), "text"), "the chevron is light text, not gold").toBe(true);
  expect(headers(addon).length, "a header the game makes on a redraw is dressed too").toBe(4);
  expect(headers(addon)[3], "the new one").toEqual([0, 0, down]);
  expect(addon.eval("return { #ns.errors, ns.Theme.PaintedCount() > 0 }"), "and nothing failed").toEqual([0, true]);
});

it("quest panel in the map: dressed even while Vanguard's quest log is on (its Map button opens it); the pop-out is left, and the group off leaves both", () => {
  const own = loggedIn(QUEST_MAP_ENV);
  own.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  expect([questPanel(own).bg, questPanel(own).list, windowState(own, "QuestLogPopupDetailFrame").panel], "the map's quest panel is in the theme; the pop-out stays the game's").toEqual([0, 0, false]);
  const off = loggedIn(QUEST_MAP_ENV, { savedVariables: OWN_LOG_OFF.replace("QuestLog = { own = false }", "QuestLog = { own = false }, Windows = { map = false }") });
  off.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  expect([questPanel(off).bg, off.eval("return ns.FrameState('vgWindow')[QuestMapFrame] == nil and ns.FrameState('vgWindow')[QuestLogPopupDetailFrame] == nil")], "with the map group off they are not even hooked").toEqual([1, true]);
  const sparse = loggedIn(`CreateFrame("Frame", "QuestMapFrame", UIParent).QuestsFrame = {} CreateFrame("Frame", "QuestLogPopupDetailFrame", UIParent)`, { savedVariables: OWN_LOG_OFF });
  sparse.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  const partial = loggedIn(`local p = CreateFrame("Frame", "QuestMapFrame", UIParent) p.DetailsFrame = CreateFrame("Frame", nil, p) p.DetailsFrame.BackFrame = {}`, { savedVariables: OWN_LOG_OFF });
  partial.eval("QuestMapFrame:Show()");
  for (const addon of [sparse, partial]) expect(addon.eval("return #ns.errors"), "a client with fewer parts loads cleanly").toBe(0);
});


// TEST-ONLY reward tiles of the quest details (QuestInfoItem1-2 with a name plate and an icon, and the XP tile with a
// ReputationBG plate), made by the game as QuestInfo_Display runs.
const QUEST_REWARDS_ENV = QUEST_MAP_ENV + `
  for i = 1, 2 do
    local tile = CreateFrame("Button", "QuestInfoItem" .. i, UIParent) tile.NameFrame, tile.Icon = tile:CreateTexture(), tile:CreateTexture()
    tile.NameFrame:SetAlpha(1)
  end
  QuestInfoXPFrame = CreateFrame("Frame", "QuestInfoXPFrame", UIParent) QuestInfoXPFrame.ReputationBG = QuestInfoXPFrame:CreateTexture()
  for _, key in ipairs({ "AbandonButton", "TrackButton" }) do
    local b = QuestMapFrame.QuestsFrame.DetailsFrame[key] local fs = b:CreateFontString(nil, "OVERLAY") fs:SetFont("TEST-ONLY-GAME", 12, "") b:SetFontString(fs)
  end
  __made = false
  function QuestInfo_Display() if not __made then __made = true CreateFrame("Button", "QuestInfoItem3", UIParent).NameFrame = UIParent:CreateTexture() end end
`;

it("quest panel in the map: the reward tiles lose their plates and the buttons' labels are in the theme (Abandon in the danger colour)", () => {
  const addon = loggedIn(QUEST_REWARDS_ENV);
  addon.eval("QuestMapFrame:Show()");
  expect(addon.eval("return { QuestInfoItem1.NameFrame:GetAlpha(), QuestInfoItem2.NameFrame:GetAlpha(), QuestInfoXPFrame.ReputationBG:GetAlpha() }"), "the name plates and the XP plate are faded").toEqual([0, 0, 0]);
  addon.eval("QuestInfo_Display()");
  expect(addon.eval("return QuestInfoItem3.NameFrame:GetAlpha()"), "a tile the game makes as a quest is shown is dressed after QuestInfo_Display").toBe(0);
  const d = "QuestMapFrame.QuestsFrame.DetailsFrame";
  expect(addon.eval(`return { __looks(${d}.AbandonButton:GetFontString(), 'label', 'bad'), __looks(${d}.TrackButton:GetFontString(), 'label', 'text') }`), "Abandon is the danger kind, the others light").toEqual([true, true]);
  addon.eval("QuestMapFrame:Hide() QuestMapFrame:Show()");
  expect(addon.eval("return #ns.errors"), "showing it again is clean").toBe(0);
});

// TEST-ONLY extras on the quest panel (QuestMapFrame.xml): the list's search box (with its magnifier), settings gear and
// the quest count frame with its figure; the Rewards heading; the rule between groups; quest title rows (a button with a
// Checkbox frame whose CheckMark the game shows, tag, storyline and task pictures and the yellow hover glow); and the
// pop-out's text area and Show Map button.
const QUEST_TOOLS_ENV = HEADERS_ENV + `
  local list, details = QuestMapFrame.QuestsFrame, QuestMapFrame.QuestsFrame.DetailsFrame
  local scroll = list.ScrollFrame
  scroll.SearchBox = CreateFrame("EditBox", nil, scroll) scroll.SearchBox.art, scroll.SearchBox.searchIcon = scroll.SearchBox:CreateTexture(), scroll.SearchBox:CreateTexture()
  scroll.SettingsDropdown = CreateFrame("Button", nil, scroll) scroll.SettingsDropdown.Icon = scroll.SettingsDropdown:CreateTexture()
  QuestLogCount = CreateFrame("Frame", "QuestLogCount", scroll) QuestLogCount.Left = QuestLogCount:CreateTexture()
  QuestLogQuestCount = QuestLogCount:CreateFontString("QuestLogQuestCount", "ARTWORK") QuestLogQuestCount:SetFont("TEST-ONLY-GAME", 10, "")
  details.RewardsFrameContainer.RewardsFrame.Label = details.RewardsFrameContainer.RewardsFrame:CreateFontString(nil, "OVERLAY")
  details.RewardsFrameContainer.RewardsFrame.Label:SetFont("TEST-ONLY-GAME", 20, "")
  local sep = CreateFrame("Frame", nil, scroll.Contents) scroll.Contents.Separator = sep sep.Divider = sep:CreateTexture()
  function __titleRow()
    local row = CreateFrame("Button", nil, scroll.Contents)
    row.Checkbox = CreateFrame("Frame", nil, row) row.Checkbox:CreateTexture() row.Checkbox.CheckMark = row.Checkbox:CreateTexture() row.Checkbox.CheckMark:Hide()
    row.TagTexture, row.StorylineTexture, row.TaskIcon = row:CreateTexture(), row:CreateTexture(), row:CreateTexture()
    row.HighlightTexture = row:CreateTexture()
    return row
  end
  __titleRow() __titleRow()
  local pop = QuestLogPopupDetailFrame
  pop.ScrollFrame = CreateFrame("ScrollFrame", nil, pop)
  pop.ShowMapButton = CreateFrame("Button", nil, pop) pop.ShowMapButton.Texture, pop.ShowMapButton.back = pop.ShowMapButton:CreateTexture(), pop.ShowMapButton:CreateTexture()
  pop.ShowMapButton.Text = pop.ShowMapButton:CreateFontString(nil, "OVERLAY") pop.ShowMapButton.Text:SetFont("TEST-ONLY-GAME", 12, "")
`;

it("quest panel in the map: the search box, settings gear, count box, Rewards heading, title rows and the group rule are in the theme", () => {
  const addon = loggedIn(QUEST_TOOLS_ENV, { savedVariables: OWN_LOG_OFF });
  addon.eval("QuestMapFrame:Show()");
  const scroll = "QuestMapFrame.QuestsFrame.ScrollFrame";
  expect(addon.eval(`local s = ${scroll}.SearchBox return { s.art:GetAlpha(), s.searchIcon:GetAlpha() }`), "the search box's border art is faded, its magnifier kept").toEqual([0, 1]);
  expect([fills(addon, `${scroll}.SearchBox`), fills(addon, "QuestLogCount")], "the search box and the count box are theme edit boxes").toEqual([1, 1]);
  expect(addon.eval(`local g = ${scroll}.SettingsDropdown return { g.Icon:GetAlpha(), ns.Theme.HoverParts(g) == nil }`), "the gear keeps its icon on a control tile (not a button)").toEqual([1, true]);
  expect(addon.eval("return { QuestLogCount.Left:GetAlpha(), __looks(QuestLogQuestCount, 'small', 'text2') }"), "the count box's art faded, its figure small and light").toEqual([0, true]);
  expect(addon.eval("return __looks(QuestMapFrame.QuestsFrame.DetailsFrame.RewardsFrameContainer.RewardsFrame.Label, 'heading', 'text')"), "the Rewards heading is the heading role in the text colour").toBe(true);
  addon.eval("QuestLogQuests_Update()");
  // Title row n's state: a theme row, its glow, tag, storyline and task alphas, its track box a theme check box, its mark's alpha.
  const row = (n) => addon.eval(`local i = 0 for _, r in ipairs({ ${scroll}.Contents:GetChildren() }) do if r.Checkbox then i = i + 1 if i == ${n} then
    local parts = ns.Theme.RowParts(r)
    return { parts ~= nil, r.HighlightTexture:GetAlpha(), r.TagTexture:GetAlpha(), r.StorylineTexture:GetAlpha(), r.TaskIcon:GetAlpha(), ns.Theme.CheckParts(r.Checkbox) ~= nil, r.Checkbox.CheckMark:GetAlpha() } end end end`);
  expect(row(1), "a title row is a theme row: its glow faded, its tag, storyline and task pictures kept; its track box a theme check box").toEqual([true, 0, 1, 1, 1, true, 0]);
  expect(row(2), "every title row").toEqual(row(1));
  addon.eval(`local c = ${scroll}.Contents for _, r in ipairs({ c:GetChildren() }) do if r.Checkbox then r.Checkbox.CheckMark:Show() end end`);
  expect(addon.eval(`local n = 0 for _, r in ipairs({ ${scroll}.Contents:GetChildren() }) do if r.Checkbox and ns.Theme.CheckParts(r.Checkbox).mark:IsShown() then n = n + 1 end end return n`), "the box follows the mark the game shows").toBe(2);
  expect(addon.eval(`local d = ${scroll}.Contents.Separator.Divider return { d:GetAlpha(), ns.Theme.DividerParts(d) ~= nil }`), "the rule between groups is faded under one pixel of divider").toEqual([0, true]);
  addon.eval("QuestLogQuests_Update()");
  expect(addon.eval("return { #ns.errors, ns.Theme.PaintedCount() > 0 }"), "and nothing failed").toEqual([0, true]);
});

it("quest panel in the map: the pop-out's text sits on an inset and its Show Map button keeps its glyph; sparse clients load cleanly", () => {
  const addon = loggedIn(QUEST_TOOLS_ENV, { savedVariables: OWN_LOG_OFF });
  addon.eval("QuestLogPopupDetailFrame:Show()");
  expect(fills(addon, "QuestLogPopupDetailFrame.ScrollFrame"), "an inset panel behind the quest text").toBe(1);
  expect(addon.eval("local b = QuestLogPopupDetailFrame.ShowMapButton return { b.back:GetAlpha(), b.Texture:GetAlpha(), __looks(b.Text, 'label', 'text') }"), "the Show Map button: its art faded, its map glyph kept, its label light").toEqual([0, 1, true]);
  const bare = loggedIn(QUEST_MAP_ENV + `QuestLogPopupDetailFrame.ScrollFrame, QuestLogPopupDetailFrame.ShowMapButton = {}, {}
    local contents = CreateFrame("Frame", nil, QuestMapFrame.QuestsFrame.ScrollFrame) QuestMapFrame.QuestsFrame.ScrollFrame.Contents = contents
    local row = CreateFrame("Button", nil, contents) row.Checkbox, row.TagTexture = {}, {}`, { savedVariables: OWN_LOG_OFF });
  bare.eval("QuestMapFrame:Show() QuestLogPopupDetailFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no search box, gear, count, label or a track box that is no frame: no errors").toBe(0);
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
  expect(addon.eval("return ns.FrameState('vgWindow')[BattlefieldMapFrame] == nil"), "nothing is touched until the part of the game loads").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_BattlefieldMap");
  addon.eval("BattlefieldMapFrame:Show()");
  expect(addon.eval("local b = BattlefieldMapFrame.BorderFrame local out = {} for _, k in ipairs({ 'TopLeft', 'TopRight', 'BottomLeft', 'BottomRight', 'Top', 'Bottom', 'Left', 'Right' }) do out[#out + 1] = b[k]:GetAlpha() end return out"), "the ornate border's eight pieces are faded").toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect([fills(addon, "BattlefieldMapFrame.BorderFrame"), addon.eval("return select('#', BattlefieldMapFrame.BorderFrame:GetRegions()) > 8")], "an edge is painted over the map but no fill, which would hide it").toEqual([0, true]);
  expect(addon.eval("local c = BattlefieldMapFrame.BorderFrame.CloseButton return select('#', c:GetRegions()) > 1"), "the close button is the theme's").toBe(true);
  expect(addon.eval("local t = BattlefieldMapTab return { t.Left:GetAlpha(), t.Middle:GetAlpha(), t.Right:GetAlpha(), t.Text:GetAlpha() }"), "the tab's art is faded, its label kept").toEqual([0, 0, 0, 1]);
  expect([fills(addon, "BattlefieldMapTab"), alpha(addon, "BattlefieldMapFrame.ScrollContainer")], "the tab is a flat button (its hover clear at rest), the canvas the game's").toEqual([1, 1]);
  expect(addon.eval("return { BattlefieldMapTab.Text.__textColor[1] == ns.Theme.RGB('text'), select(2, BattlefieldMapTab.Text:GetFont()) == ns.Theme.RoleSize('small') }"), "the tab's label is small and light, not the game's gold").toEqual([true, true]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("BattlefieldMapFrame:Hide() BattlefieldMapFrame:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it again paints nothing new").toBe(painted);
});

it("battlefield map: switched off it stays the game's; a client without the tab or border is fine", () => {
  const off = loggedIn(BATTLEFIELD_ENV, MAP_OFF);
  off.eval("__battlefieldMap()");
  off.fire("ADDON_LOADED", "Blizzard_BattlefieldMap");
  off.eval("BattlefieldMapFrame:Show()");
  expect([off.eval("return ns.FrameState('vgWindow')[BattlefieldMapFrame] == nil"), off.eval("return BattlefieldMapTab.Left:GetAlpha()")], "not hooked, art left").toEqual([true, 1]);
  const bare = loggedIn(`CreateFrame("Frame", "BattlefieldMapFrame", UIParent)`);
  bare.fire("ADDON_LOADED", "Blizzard_BattlefieldMap");
  bare.eval("BattlefieldMapFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no border, no tab: no errors").toBe(0);
});

// TEST-ONLY group finder, shaped like Blizzard_GroupFinder_VanillaStyle's Mainline XML: the plain outer window with its
// close button and the eye (a static picture and an animation), the listing and browse pages (PortraitFrameTemplateNoCloseButton
// frames filling the window, with their extra art, buttons and the listing's comment box), the browse tooltip, and the
// who list page (WhoList.xml: no Inset, its own backdrop, header stone, inside frame and lines, and a list). Made when
// the game loads the part.
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
    local who = __window("LFGWhoListFrame")
    who.Inset = nil
    who.BackgroundArt, who.headerBackground, who.insideFrame = who:CreateTexture(), who:CreateTexture(), who:CreateTexture()
    who.BarTop, who.BarMiddle = who:CreateTexture(), who:CreateTexture()
    who.ScrollBox = CreateFrame("Frame", nil, who)
    who.ScrollBox.rows = 0
    function who.ScrollBox:GetDataProviderSize() return self.rows end
    function who.ScrollBox:SetDataProvider(n) self.rows = n end
    browse.OptionsButton = __button(browse)
    browse.OptionsButton:SetPoint("TOPRIGHT", browse, "TOPRIGHT", -12, -32)
  end
  LFG_LIST_NO_RESULTS_FOUND = "TEST-ONLY No groups found."
`;

it("group finder: the window, its listing and browse pages and the group tooltip in the theme once the game loads it", () => {
  const addon = loggedIn(FINDER_ENV);
  addon.eval("__finder()");
  expect(addon.eval("return ns.FrameState('vgWindow')[LFGParentFrame] == nil"), "nothing is touched until the part of the game loads").toBe(true);
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

it("group finder: the who list page (the search view) loses the brass border and portrait badge and gets an inset panel like the other pages", () => {
  const addon = loggedIn(FINDER_ENV);
  addon.eval("__finder()");
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  addon.eval("LFGParentFrame:Show() LFGWhoListFrame:Show()");
  // The who page's art: its marked template art, border, badge, and its own backdrop, header stone, frame and lines.
  const art = () => addon.eval(`local w = LFGWhoListFrame local a
    for _, r in ipairs({ w:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then a = r:GetAlpha() end end
    return { a, w.NineSlice:GetAlpha(), w.PortraitContainer:GetAlpha(), w.BackgroundArt:GetAlpha(), w.headerBackground:GetAlpha(), w.insideFrame:GetAlpha(), w.BarTop:GetAlpha(), w.BarMiddle:GetAlpha() }`);
  expect(art(), "the template art, the brass border, the round badge and the page's own art are faded").toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect([fills(addon, "LFGWhoListFrame.ScrollBox"), addon.eval("return __titled(LFGWhoListFrame.TitleContainer.TitleText)")], "with no Inset, its list gets the inset panel; the title is in the theme font").toEqual([1, true]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("LFGWhoListFrame:Hide() LFGWhoListFrame:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it again paints nothing new").toBe(painted);
});

it("group finder: the who list says the game's no-results line while empty, and the settings gear sits in the close button's row", () => {
  const addon = loggedIn(FINDER_ENV);
  addon.eval("__finder()");
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  addon.eval("LFGParentFrame:Show() LFGWhoListFrame:Show() LFGBrowseFrame:Show()");
  // The who list's note: its text and whether it shows.
  const note = () => addon.eval("local n = ns.FrameState('vgEmptyNote')[LFGWhoListFrame.ScrollBox] return { n:GetText(), n:IsShown() }");
  expect(note(), "an empty who list (before any search) shows the browse page's empty-result line").toEqual(["TEST-ONLY No groups found.", true]);
  addon.eval("LFGWhoListFrame.ScrollBox:SetDataProvider(3)");
  expect(note()[1], "rows from a search hide it").toBe(false);
  addon.eval("LFGWhoListFrame.ScrollBox:SetDataProvider(0) LFGWhoListFrame:Hide() LFGWhoListFrame:Show()");
  expect(note()[1], "an empty result shows it again, once").toBe(true);
  expect(addon.eval("local n, c = 0, LFGWhoListFrame.ScrollBox for _, r in ipairs({ c:GetRegions() }) do if r.__kind == 'FontString' then n = n + 1 end end return n"), "made once").toBe(1);
  const gear = addon.eval(`local p = LFGBrowseFrame.OptionsButton.__points.CENTER
    return { p.rel == LFGParentFrameCloseButton, p.x, p.y, LFGBrowseFrame.OptionsButton.__points.TOPRIGHT == nil }`);
  expect(gear, "the gear is T.CONTROL.step left of the close button and level with it, its old anchor gone").toEqual([true, -28, 0, true]);
  expect(addon.eval(`local n = 0 for _, r in ipairs({ LFGBrowseFrame.OptionsButton:GetRegions() }) do if r.__layer == "BACKGROUND" then n = n + 1 end end return n`),
    "the gear sits on the window controls' resting tile, like the close button beside it").toBe(1);
  const plain = addon.eval(`local box = CreateFrame("Frame", nil, UIParent) local GW = ns.GetModule("Windows")
    GW.WatchEmpty(box, "TEST-ONLY") GW.WatchEmpty(nil, "TEST-ONLY") return { GW.BoxEmpty(box), ns.FrameState('vgEmptyNote')[box]:IsShown() }`);
  expect(plain, "a list that can't say how many rows it has gets no note shown").toEqual([false, false]);
});

it("group finder: switched off it stays the game's; a client missing parts of it loads cleanly", () => {
  const off = loggedIn(FINDER_ENV, MAP_OFF);
  off.eval("__finder()");
  off.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  off.eval("LFGParentFrame:Show() LFGListingFrame:Show()");
  expect([off.eval("return ns.FrameState('vgWindow')[LFGParentFrame] == nil and ns.FrameState('vgWindow')[LFGListingFrame] == nil"), windowState(off, "LFGListingFrame").art !== 0, fills(off, "LFGParentFrame")], "not hooked, art left").toEqual([true, true, 0]);
  const bare = loggedIn(`for _, n in ipairs({ "LFGParentFrame", "LFGListingFrame", "LFGBrowseFrame", "LFGBrowseSearchEntryTooltip", "LFGWhoListFrame" }) do CreateFrame("Frame", n, UIParent) end
    LFGListingFrame.ActivityView, LFGListingFrame.GroupRoleButtons, LFGBrowseFrame.TitleContainer, LFGBrowseFrame.Inset = {}, {}, {}, {}
    LFGBrowseFrame.OptionsButton = CreateFrame("Button", nil, LFGBrowseFrame)`);
  bare.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  bare.eval("LFGParentFrame:Show() LFGListingFrame:Show() LFGBrowseFrame:Show() LFGBrowseSearchEntryTooltip:Show() LFGWhoListFrame:Show()");
  expect(bare.eval("return #ns.errors"), "bare frames (a gear but no close button, a who page without a list): no errors").toBe(0);
});


// TEST-ONLY helpers for windows with scrolling lists and dropdowns: a ScrollBox model (rows it holds, callbacks ScrollUtil hands the
// rows the game acquires later; __acquire adds a row as the game would), a check button, a dropdown (a plate, an arrow, an
// optional label) and an icon button (a plate and a picture).
const SCROLL_HELPERS = `
  ScrollUtil = { AddAcquiredFrameCallback = function(box, cb, owner) table.insert(box.callbacks, function(row) cb(owner, row) end) end }
  function __acquire(box, row) table.insert(box.items, row) for _, cb in ipairs(box.callbacks) do cb(row) end return row end
  function __box(parent)
    local b = CreateFrame("Frame", nil, parent) b.items, b.callbacks = {}, {}
    function b:ForEachFrame(fn) for _, r in ipairs(self.items) do fn(r) end end
    return b
  end
  function __check(parent) local c = CreateFrame("CheckButton", nil, parent) c:CreateTexture() return c end
  function __dropdown(parent, withText)
    local d = CreateFrame("Button", nil, parent) d.Plate, d.Arrow = d:CreateTexture(), d:CreateTexture()
    if withText then d.Text = d:CreateFontString(nil, "OVERLAY") d.Text:SetFont("TEST-ONLY-GAME", 12, "") end
    return d
  end
  function __iconButton(parent) local b = CreateFrame("Button", nil, parent) b.Plate, b.Icon = b:CreateTexture(), b:CreateTexture() return b end
`;

// TEST-ONLY parts inside the group finder's pages (Blizzard_LFGVanilla_Listing.xml, _Browse.xml, WhoList.xml) on top of FINDER_ENV:
// the listing's role buttons (a plate, a role icon as the normal texture, a dimming cover, a check box), the group's role icon
// and dropdown, the newcomer check box, the category pickers the game makes one at a time, the activity view's dropdowns, label,
// level box and rows with a check box, the divider; the browse page's dropdowns, refresh button and rows (a plate, a selected and
// a hover glow, a leader mark, a delist button); the who page's search box, search button, filter, total line and rows.
const FINDER_PARTS_ENV = FINDER_ENV + SCROLL_HELPERS + `
  function __activityRow() local r = CreateFrame("Frame", nil, LFGListingFrame.ActivityView.ScrollBox) r.CheckButton = __check(r) return r end
  function __role(parent, withCheck)
    local b = CreateFrame("Button", nil, parent)
    b.Background, b.icon, b.cover = b:CreateTexture(), b:CreateTexture(), b:CreateTexture()
    b.GetNormalTexture = function(self) return self.icon end
    if withCheck then b.CheckButton = __check(b) end
    return b
  end
  function __browseRow(selected)
    local r = CreateFrame("Button", nil, LFGBrowseFrame.ScrollBox)
    r.ResultBG, r.Selected, r.Highlight, r.PartyIcon = r:CreateTexture(), r:CreateTexture(), r:CreateTexture(), r:CreateTexture()
    r.Selected:SetShown(selected == true)
    r.DataDisplay = CreateFrame("Frame", nil, r) r.DataDisplay.DelistButton = __iconButton(r.DataDisplay)
    return r
  end
  function __whoRow()
    local r = CreateFrame("Button", nil, LFGWhoListFrame.ScrollBox)
    r.Background, r.Selected = r:CreateTexture(), r:CreateTexture() r.Selected:Hide()
    function r:SetSelected(on) self.Selected:SetShown(on) end
    r.InviteButton = __iconButton(r)
    return r
  end
  function LFGListingCategorySelection_UpdateCategoryButtons(view)
    local b = CreateFrame("Button", nil, view) b.Icon, b.Cover = b:CreateTexture(), b:CreateTexture()
    b.Label = b:CreateFontString(nil, "OVERLAY") b.Label:SetFont("TEST-ONLY-GAME", 16, "")
    view.CategoryButtons[#view.CategoryButtons + 1] = b
  end
  function LFGBrowseSearchEntry_SetSelection(row, selected) row.Selected:SetShown(selected) end
  function __finderParts()
    local l, b, w = LFGListingFrame, LFGBrowseFrame, LFGWhoListFrame
    l.SoloRoleButtons = CreateFrame("Frame", nil, l)
    l.SoloRoleButtons.RoleButtons = { __role(l.SoloRoleButtons, true), __role(l.SoloRoleButtons, true) }
    l.GroupRoleButtons.RoleIcon, l.GroupRoleButtons.RoleDropdown = __role(l.GroupRoleButtons), __dropdown(l.GroupRoleButtons)
    l.NewPlayerFriendlyButton = CreateFrame("Button", nil, l) l.NewPlayerFriendlyButton.CheckButton = __check(l.NewPlayerFriendlyButton)
    l.CategoryView = CreateFrame("Frame", nil, l) l.CategoryView.CategoryButtons = {}
    l.DividerFrame.Divider = l.DividerFrame:CreateTexture()
    local view = l.ActivityView
    view.PlayStyleDropdown, view.VoiceChatDropdown = __dropdown(view), __dropdown(view)
    view.VoiceChatLabel = view:CreateFontString(nil, "OVERLAY") view.VoiceChatLabel:SetFont("TEST-ONLY-GAME", 10, "")
    view.LevelRangesCheckbox = CreateFrame("Frame", nil, view) view.LevelRangesCheckbox.Checkbox = __check(view.LevelRangesCheckbox)
    view.ScrollBox = __box(view)
    local bar = CreateFrame("Frame", nil, view.Comment) view.Comment.ScrollBar = bar
    bar.Top, bar.ThumbTexture = bar:CreateTexture(), bar:CreateTexture() bar.ScrollUpButton = CreateFrame("Button", nil, bar)
    b.CategoryDropdown, b.ActivityDropdown, b.RefreshButton = __dropdown(b), __dropdown(b), __iconButton(b)
    b.ScrollBox = __box(b)
    w.EditBox = CreateFrame("EditBox", nil, w) w.EditBox.art, w.EditBox.searchIcon = w.EditBox:CreateTexture(), w.EditBox:CreateTexture()
    w.WhoSearch, w.FilterDropdown = __iconButton(w), __dropdown(w, true)
    w.WhoFrameTotals = w:CreateFontString(nil, "OVERLAY") w.WhoFrameTotals:SetFont("TEST-ONLY-GAME", 12, "")
    w.ScrollBox.items, w.ScrollBox.callbacks = {}, {}
    function w.ScrollBox:ForEachFrame(fn) for _, r in ipairs(self.items) do fn(r) end end
  end
`;

it("group finder listing: the role buttons keep their icons on raised tiles with theme check boxes, the dropdowns have theme arrows, the category pickers are dressed as the game makes them", () => {
  const addon = loggedIn(FINDER_PARTS_ENV);
  // One activity row and one category picker exist when the page is skinned; the game makes more afterwards.
  addon.eval("__finder() __finderParts() __acquire(LFGListingFrame.ActivityView.ScrollBox, __activityRow()) LFGListingCategorySelection_UpdateCategoryButtons(LFGListingFrame.CategoryView)");
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  addon.eval("LFGParentFrame:Show() LFGListingFrame:Show() __acquire(LFGListingFrame.ActivityView.ScrollBox, __activityRow())");
  // A role button's plate, icon and cover alphas, and whether its check box is a theme check box.
  const role = (expr) => addon.eval(`local r = ${expr} return { r.Background:GetAlpha(), r.icon:GetAlpha(), r.cover:GetAlpha(), ns.Theme.CheckParts(r.CheckButton or r) ~= nil }`);
  expect(role("LFGListingFrame.SoloRoleButtons.RoleButtons[1]"), "a solo role: the plate faded, the icon and the cover kept, its check box a theme check box").toEqual([0, 1, 1, true]);
  expect(role("LFGListingFrame.SoloRoleButtons.RoleButtons[2]"), "all of them").toEqual([0, 1, 1, true]);
  expect([fills(addon, "LFGListingFrame.SoloRoleButtons.RoleButtons[1]"), fills(addon, "LFGListingFrame.GroupRoleButtons.RoleIcon")], "each on a raised tile, the group's too").toEqual([1, 1]);
  expect(addon.eval("local g = LFGListingFrame.GroupRoleButtons return { g.RoleIcon.Background:GetAlpha(), g.RoleDropdown.Plate:GetAlpha(), g.RoleDropdown.Arrow:GetAlpha() }"), "the group's role icon plate faded; the role dropdown's plate faded, its arrow replaced").toEqual([0, 0, 0]);
  expect(addon.eval("return ns.Theme.CheckParts(LFGListingFrame.NewPlayerFriendlyButton.CheckButton) ~= nil"), "the newcomer box is a theme check box").toBe(true);
  expect(addon.eval("local v = LFGListingFrame.ActivityView return { v.PlayStyleDropdown.Plate:GetAlpha(), v.PlayStyleDropdown.Arrow:GetAlpha(), v.VoiceChatDropdown.Arrow:GetAlpha(), __looks(v.VoiceChatLabel, 'small', 'text'), ns.Theme.CheckParts(v.LevelRangesCheckbox.Checkbox) ~= nil }"), "the activity view's dropdowns have theme arrows; the voice chat label is small and light; the level box a theme check box").toEqual([0, 0, 0, true, true]);
  expect(addon.eval("local items = LFGListingFrame.ActivityView.ScrollBox.items return { ns.Theme.CheckParts(items[1].CheckButton) ~= nil, ns.Theme.CheckParts(items[2].CheckButton) ~= nil }"), "each activity row's check box is a theme check box, the one the page had and the one it acquired").toEqual([true, true]);
  addon.eval("LFGListingCategorySelection_UpdateCategoryButtons(LFGListingFrame.CategoryView)");
  // Category picker n: its picture, cover and name.
  const category = (n) => addon.eval(`local b = LFGListingFrame.CategoryView.CategoryButtons[${n}] return { b.Icon:GetAlpha(), b.Cover:GetAlpha(), __looks(b.Label, 'heading', 'text') }`);
  expect(category(1), "a picker the page had: its picture kept, its cover faded, its name a heading").toEqual([1, 0, true]);
  expect([fills(addon, "LFGListingFrame.CategoryView.CategoryButtons[1]"), addon.eval("return #LFGListingFrame.CategoryView.CategoryButtons")], "on a raised tile").toEqual([1, 2]);
  expect(category(2), "a picker the game made after the skin").toEqual([1, 0, true]);
  expect(addon.eval("local d = LFGListingFrame.DividerFrame.Divider return { d:GetAlpha(), ns.Theme.DividerParts(d) ~= nil }"), "the divider is one pixel of divider").toEqual([0, true]);
  expect(addon.eval("local bar = LFGListingFrame.ActivityView.Comment.ScrollBar return { bar.Top:GetAlpha(), bar.ThumbTexture:GetAlpha(), bar.ScrollUpButton:GetAlpha(), ns.FrameState('vgThumb')[bar] ~= nil }"), "the description's old scroll bar: art and thumb picture faded, the arrow buttons away, the one scroll line drawn").toEqual([0, 0, 0, true]);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("group finder browse page: the dropdowns and refresh button keep their pictures, the rows are theme rows following the game's selection, the delist button keeps its X", () => {
  const addon = loggedIn(FINDER_PARTS_ENV);
  addon.eval("__finder() __finderParts() __acquire(LFGBrowseFrame.ScrollBox, __browseRow(true))");
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  addon.eval("LFGParentFrame:Show() LFGBrowseFrame:Show() __acquire(LFGBrowseFrame.ScrollBox, __browseRow(false))");
  expect(addon.eval("local b = LFGBrowseFrame return { b.CategoryDropdown.Plate:GetAlpha(), b.CategoryDropdown.Arrow:GetAlpha(), b.ActivityDropdown.Arrow:GetAlpha(), b.RefreshButton.Plate:GetAlpha(), b.RefreshButton.Icon:GetAlpha() }"), "dropdown plates faded, arrows kept; the refresh button's plate faded, its picture kept").toEqual([0, 0, 0, 0, 1]);
  // Browse row n: a theme row, the alphas of its plate, glows, leader mark and delist button, and whether its rail shows.
  const row = (n) => addon.eval(`local r = LFGBrowseFrame.ScrollBox.items[${n}] local d = r.DataDisplay.DelistButton
    return { ns.Theme.RowParts(r) ~= nil, r.ResultBG:GetAlpha(), r.Selected:GetAlpha(), r.Highlight:GetAlpha(), r.PartyIcon:GetAlpha(), d.Plate:GetAlpha(), d.Icon:GetAlpha(), ns.Theme.RowParts(r).rail:IsShown() }`);
  expect(row(1), "a row the page had: a theme row, plate and glows faded, the leader mark and the delist X kept, the selected look on (its Selected glow was shown)").toEqual([true, 0, 0, 0, 1, 0, 1, true]);
  expect(row(2), "a row the box acquires later: dressed, not selected").toEqual([true, 0, 0, 0, 1, 0, 1, false]);
  addon.eval("LFGBrowseSearchEntry_SetSelection(LFGBrowseFrame.ScrollBox.items[2], true) LFGBrowseSearchEntry_SetSelection(LFGBrowseFrame.ScrollBox.items[1], false)");
  expect([row(1)[7], row(2)[7]], "the selected look follows the game's selection").toEqual([false, true]);
  addon.eval("LFGBrowseSearchEntry_SetSelection({ Selected = LFGBrowseFrame.ScrollBox.items[1].Selected }, true)");
  expect(addon.eval("return #ns.errors"), "a row that is not dressed is left alone").toBe(0);
});

it("group finder who page: the search box, search button, filter and total line are in the theme, the rows are theme rows following SetSelected", () => {
  const addon = loggedIn(FINDER_PARTS_ENV);
  addon.eval("__finder() __finderParts() __acquire(LFGWhoListFrame.ScrollBox, __whoRow())");
  addon.fire("ADDON_LOADED", "Blizzard_GroupFinder_VanillaStyle");
  addon.eval("LFGParentFrame:Show() LFGWhoListFrame:Show() __acquire(LFGWhoListFrame.ScrollBox, __whoRow())");
  expect(addon.eval("local w = LFGWhoListFrame return { w.EditBox.art:GetAlpha(), w.EditBox.searchIcon:GetAlpha(), w.WhoSearch.Plate:GetAlpha(), w.WhoSearch.Icon:GetAlpha(), w.FilterDropdown.Plate:GetAlpha(), __looks(w.FilterDropdown.Text, 'label', 'text'), __looks(w.WhoFrameTotals, 'small', 'text2') }"),
    "the search box's art faded, its magnifier kept; the search button's picture kept; the filter's plate faded and its label light; the total line small and grey").toEqual([0, 1, 0, 1, 0, true, true]);
  expect(addon.eval("local w = LFGWhoListFrame local ok = false for i = 1, w.EditBox:GetNumPoints() do local p, rel, rp, x = w.EditBox:GetPoint(i) if p == 'RIGHT' and rel == w.WhoSearch and rp == 'LEFT' and x == -ns.Theme.SPACE.tight then ok = true end end return ok"),
    "the who search box ends a gap before the search button").toBe(true);
  // Who row n: a theme row, the alphas of its plate, glow, invite plate and picture, and whether its rail shows.
  const row = (n) => addon.eval(`local r = LFGWhoListFrame.ScrollBox.items[${n}] return { ns.Theme.RowParts(r) ~= nil, r.Background:GetAlpha(), r.Selected:GetAlpha(), r.InviteButton.Plate:GetAlpha(), r.InviteButton.Icon:GetAlpha(), ns.Theme.RowParts(r).rail:IsShown() }`);
  expect([row(1), row(2)], "rows, those the page had and those it acquired: plates faded, the invite picture kept, not selected").toEqual([[true, 0, 0, 0, 1, false], [true, 0, 0, 0, 1, false]]);
  addon.eval("LFGWhoListFrame.ScrollBox.items[2]:SetSelected(true)");
  expect([row(1)[5], row(2)[5]], "the selected look follows the game's SetSelected").toEqual([false, true]);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
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
    local box = CreateFrame("Frame", nil, chal.DetailPane) chal.DetailPane.ScrollBox = box
    box.rows = 0
    function box:GetDataProviderSize() return self.rows end
    function box:SetDataProvider(n) self.rows = n end
    -- as LegacyChallengeDetailPaneMixin:GenerateDataProvider: the picked category kept as info, then the rows
    function chal.DetailPane:SelectCategory(info, n) self.info = info self.ScrollBox:SetDataProvider(n) end
    f.LegacyTreeTab = CreateFrame("Frame", nil, f) f.LegacyTreeTab:CreateTexture()
    f.TabIndicators = CreateFrame("Frame", nil, f) f.TabIndicators:CreateTexture()
  end
`;

// TEST-ONLY parts inside the Legacy window's pages (Blizzard_LegacyTree.xml, _LegacyChallenges.xml, _LegacyChallengeCategoryList.xml,
// _LegacySystemTemplates.xml, _LegacyRewardTrack.xml) on top of LEGACY_ENV: the tree picker's cards (a plate, a glow, a masked icon with
// its ring) and the game's RefreshTreeButtons; the points badge and the trait panel's buttons and search box; the challenge list's
// filter, search box, no-challenges line and category rows (flag set by SetSelected, a chevron button); challenge cards (plates,
// a Track box, IsSelected and RefreshStateArt) and the shared objectives frame with its pooled criteria; the points bar; the reward
// bar and track, which holds no cards until Init.
const LEGACY_PARTS_ENV = LEGACY_ENV + SCROLL_HELPERS + INSIDES_LUA + `
  function __bar(parent) local b = CreateFrame("StatusBar", nil, parent) b.Frame = b:CreateTexture() b:SetStatusBarTexture("TEST-ONLY-ART") b.Text = b:CreateFontString(nil, "OVERLAY") b.Text:SetFont("TEST-ONLY-GAME", 12, "") return b end
  function __fs(parent) local f = parent:CreateFontString(nil, "OVERLAY") f:SetFont("TEST-ONLY-GAME", 12, "") f:SetAlpha(0.4) return f end
  function __search(parent) local s = CreateFrame("EditBox", nil, parent) s.art, s.searchIcon = s:CreateTexture(), s:CreateTexture() return s end
  function __treeCard(picker)
    local c = CreateFrame("CheckButton", nil, picker.TreeSelections)
    for _, key in ipairs({ "Background", "SelectedGlow", "NormalTexture", "HighlightTexture", "PushedTexture", "Ring" }) do c[key] = c:CreateTexture() end
    function c:RefreshSelectionVisuals() end
    return c
  end
  function __categoryRow(selected)
    local r = CreateFrame("Button", nil, LegacySystemFrame.ChallengesPage.CategoryList)
    r.NormalTexture, r.HighlightTexture, r.NotificationIcon = r:CreateTexture(), r:CreateTexture(), r:CreateTexture()
    r.CollapseButton = CreateFrame("Button", nil, r) r.CollapseButton.Icon, r.CollapseButton.Glow = r.CollapseButton:CreateTexture(), r.CollapseButton:CreateTexture()
    r.Text = __fs(r)
    r.selected = selected
    function r:SetSelected(on) self.selected = on end
    return r
  end
  function __challenge(selected)
    local c = CreateFrame("Button", nil, LegacySystemFrame.ChallengesPage.DetailPane)
    for _, key in ipairs({ "Background", "BackgroundTop", "BackgroundMiddle", "BackgroundBottom", "SelectedOverlay", "TitleBar", "PlusMinus" }) do c[key] = c:CreateTexture() end
    c.Tracked, c.selected = __check(c), selected
    c.Title, c.Description, c.Icon, c.IconBorder, c.Shield = __fs(c), __fs(c), c:CreateTexture(), c:CreateTexture(), c:CreateTexture()
    function c:IsSelected() return self.selected end
    function c:RefreshStateArt() end
    return c
  end
  function __criteria(parent, counted)
    local r = CreateFrame("Frame", nil, parent) r.Background, r.ProgressBarBackground = r:CreateTexture(), r:CreateTexture()
    if counted then r.ProgressBar = __bar(r) end
    return r
  end
  function __rewardCard(track)
    local c = CreateFrame("Frame", nil, track)
    for _, key in ipairs({ "RewardCardBG", "LevelSquare", "IconBorder", "Icon", "EarnedCheckmark" }) do c[key] = c:CreateTexture() end
    c.RewardName, c.Level = __fs(c), __fs(c)
    return c
  end
  function __legacyParts()
    local tree, chal, reward = LegacySystemFrame.TreePage, LegacySystemFrame.ChallengesPage, LegacySystemFrame.RewardTrackPage
    local picker = CreateFrame("Frame", nil, tree) tree.LegacyTreeSelectionPanel = picker
    picker.TreeSelections = CreateFrame("Frame", nil, picker)
    picker.cards = { __treeCard(picker), __treeCard(picker) }
    picker.cards[2]:SetChecked(true)
    function picker:RefreshTreeButtons() self.cards[#self.cards + 1] = __treeCard(self) end
    tree.LegacyTreePointSummary = CreateFrame("Frame", nil, tree) tree.LegacyTreePointSummary.Border, tree.LegacyTreePointSummary.Shield = tree.LegacyTreePointSummary:CreateTexture(), tree.LegacyTreePointSummary:CreateTexture()
    local trait = tree.LegacyTreeTraitPanel
    trait.ApplyButton = CreateFrame("Button", nil, trait) trait.ApplyButton.art = trait.ApplyButton:CreateTexture()
    trait.ResetButton, trait.UndoButton, trait.SearchBox = __iconButton(trait), __iconButton(trait), __search(trait)
    local list = chal.CategoryList
    list.FilterDropdown, list.SearchBox, list.ScrollBox = __dropdown(list, true), __search(list), __box(list)
    list.NoResultsText = list:CreateFontString(nil, "OVERLAY") list.NoResultsText:SetFont("TEST-ONLY-GAME", 12, "")
    local cards = chal.DetailPane.ScrollBox
    cards.items, cards.callbacks = {}, {}
    function cards:ForEachFrame(fn) for _, r in ipairs(self.items) do fn(r) end end
    chal.LegacyChallengePointSummary = CreateFrame("Frame", nil, chal) chal.LegacyChallengePointSummary.ProgressBarBackground = chal.LegacyChallengePointSummary:CreateTexture()
    chal.LegacyChallengePointSummary.PointsBar = __bar(chal.LegacyChallengePointSummary)
    LegacyChallengeObjectives = CreateFrame("Frame", nil, UIParent)
    local pool = { active = {} } LegacyChallengeObjectives.criteriaPool = pool
    function pool:EnumerateActive() return pairs(self.active) end
    pool.active[__criteria(LegacyChallengeObjectives, true)] = true
    function LegacyChallengeObjectives:Display() pool.active[__criteria(self, false)] = true pool.active[__criteria(self, true)] = true end
    reward.ProgressBarBackground, reward.LegacyRewardProgressBar = reward:CreateTexture(), __bar(reward)
    local track = CreateFrame("Frame", nil, reward) reward.LegacyRewardProgressFrame = track
    function track:GetElements() return self.Elements end
    function track:Init() self.Elements = { __rewardCard(self), __rewardCard(self) } end
  end
`;

it("legacy system: the window in the theme, its page backgrounds faded and its panes panelled, tabs and tree nodes untouched", () => {
  // The tabs group (Modules/WindowsTabs.lua) dresses the Legacy tabs and indicators; off here, so this case sees only the map group's skin.
  const addon = loggedIn(LEGACY_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  addon.eval("__legacy()");
  expect(addon.eval("return ns.FrameState('vgWindow')[LegacySystemFrame] == nil"), "nothing is touched until the part of the game loads").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  addon.eval("LegacySystemFrame:Show()");
  const first = windowState(addon, "LegacySystemFrame");
  expect(first, "the window's art is faded, a panel painted, the title in the theme font").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, panel: true, title: true });
  expect(addon.eval("local f = LegacySystemFrame return { f.TreePage.Background:GetAlpha(), f.ChallengesPage.Background:GetAlpha(), f.RewardTrackPage.Background:GetAlpha(), (f.TreePage.VerticalDivider:GetRegions()):GetAlpha(), (f.ChallengesPage.VerticalDivider:GetRegions()):GetAlpha() }"), "the three page backgrounds and both dividers are faded").toEqual([0, 0, 0, 0, 0]);
  expect(addon.eval("local f = LegacySystemFrame return { ns.Theme.DividerParts(f.TreePage.VerticalDivider) ~= nil, ns.Theme.DividerParts(f.ChallengesPage.VerticalDivider) ~= nil }"), "the tree's is one pixel of divider in its place, the challenges' (its panes have edges) is faded with none").toEqual([true, false]);
  expect([fills(addon, "LegacySystemFrame.ChallengesPage.CategoryList"), fills(addon, "LegacySystemFrame.ChallengesPage.DetailPane")], "the challenge panes are inset panels").toEqual([1, 1]);
  expect(addon.eval("local f = LegacySystemFrame return { (f.LegacyTreeTab:GetRegions()):GetAlpha(), (f.TabIndicators:GetRegions()):GetAlpha(), (f.TreePage.Node:GetRegions()):GetAlpha(), tostring(ns.FrameState('vgWindow')[f.TreePage.Node]) }"), "the tabs, their indicators and the tree's node buttons are left to the game").toEqual([1, 1, 1, "nil"]);
  expect(fills(addon, "LegacySystemFrame.TreePage.LegacyTreeTraitPanel"), "the tree's panel is not covered, so it does not hide the close button's corner").toBe(0);
  addon.eval("LegacySystemFrame:Hide() LegacySystemFrame:Show()");
  expect(windowState(addon, "LegacySystemFrame"), "showing it again paints nothing new").toMatchObject({ panel: true, painted: first.painted });
});

it("legacy system: the challenge detail pane prompts for a category while nothing is picked, and says when a category has none", () => {
  const addon = loggedIn(LEGACY_ENV);
  addon.eval("__legacy()");
  addon.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  addon.eval("LegacySystemFrame:Show()");
  // The detail pane's note: its text and whether it shows.
  const note = () => addon.eval("local n = ns.FrameState('vgEmptyNote')[LegacySystemFrame.ChallengesPage.DetailPane.ScrollBox] return { n:GetText(), n:IsShown() }");
  expect(note(), "nothing picked: a prompt").toEqual(["Select a category to view its challenges.", true]);
  addon.eval("LegacySystemFrame.ChallengesPage.DetailPane:SelectCategory({ id = 1 }, 4)");
  expect(note()[1], "a category with challenges: no note").toBe(false);
  addon.eval("LegacySystemFrame.ChallengesPage.DetailPane:SelectCategory({ id = 2 }, 0)");
  expect(note(), "a category whose challenges are all filtered out: Vanguard's line when the game has none").toEqual(["No challenges to show here.", true]);
  addon.eval("LEGACY_NO_CHALLENGES = 'TEST-ONLY No challenges' LegacySystemFrame.ChallengesPage.DetailPane:SelectCategory({ id = 2 }, 0)");
  expect(note(), "else the game's own no-challenges line").toEqual(["TEST-ONLY No challenges", true]);
});

// A Legacy window with the parts of LEGACY_PARTS_ENV, skinned and shown (the Legacy tabs group is off, as in the first case).
const legacyParts = () => {
  const addon = loggedIn(LEGACY_PARTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  addon.eval("__legacy() __legacyParts()");
  addon.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  addon.eval("LegacySystemFrame:Show()");
  return addon;
};

it("legacy system tree page: the cards are raised tiles keeping their icons and losing the bronze ring, the picked tree shows the selected look, the badge and controls are in the theme", () => {
  const addon = legacyParts();
  // Tree card n: the alphas of its plate, glow, icon, highlight, pushed picture and ring, and whether its selected rail shows.
  const card = (n) => addon.eval(`local c = LegacySystemFrame.TreePage.LegacyTreeSelectionPanel.cards[${n}]
    return { c.Background:GetAlpha(), c.SelectedGlow:GetAlpha(), c.NormalTexture:GetAlpha(), c.HighlightTexture:GetAlpha(), c.PushedTexture:GetAlpha(), c.Ring:GetAlpha(),
      ns.Theme.RowParts(c).rail:IsShown() }`);
  expect(card(1), "a card: the plate and glow faded, the icon, highlight and pushed picture kept, the ring faded; not picked, no rail").toEqual([0, 0, 1, 1, 1, 0, false]);
  expect(card(2), "the picked tree's card shows the selected rail").toEqual([0, 0, 1, 1, 1, 0, true]);
  expect([fills(addon, "LegacySystemFrame.TreePage.LegacyTreeSelectionPanel.cards[1]"), fills(addon, "LegacySystemFrame.TreePage.LegacyTreeSelectionPanel.cards[2]")], "each a tile").toEqual([1, 1]);
  addon.eval("local p = LegacySystemFrame.TreePage.LegacyTreeSelectionPanel p.cards[1]:SetChecked(true) p.cards[2]:SetChecked(false) p.cards[1]:RefreshSelectionVisuals() p.cards[2]:RefreshSelectionVisuals()");
  expect([card(1)[6], card(2)[6]], "the selected look follows the game's selection").toEqual([true, false]);
  addon.eval("LegacySystemFrame.TreePage.LegacyTreeSelectionPanel:RefreshTreeButtons()");
  expect([card(3), addon.eval("return #LegacySystemFrame.TreePage.LegacyTreeSelectionPanel.cards")], "a card the game makes when it rebuilds the picker is dressed at once").toEqual([[0, 0, 1, 1, 1, 0, false], 3]);
  expect(addon.eval("local s = LegacySystemFrame.TreePage.LegacyTreePointSummary return { s.Border:GetAlpha() }"), "the points badge's plate is faded").toEqual([0]);
  expect(fills(addon, "LegacySystemFrame.TreePage.LegacyTreePointSummary"), "and the badge is an inset panel").toBe(1);
  expect(addon.eval("local t = LegacySystemFrame.TreePage.LegacyTreeTraitPanel return { t.ApplyButton.art:GetAlpha(), t.ResetButton.Plate:GetAlpha(), t.ResetButton.Icon:GetAlpha(), t.UndoButton.Plate:GetAlpha(), t.UndoButton.Icon:GetAlpha(), t.SearchBox.art:GetAlpha(), t.SearchBox.searchIcon:GetAlpha() }"),
    "Apply, Reset and Undo lose their plates (the pictures stay), the search box loses its art and keeps its magnifier").toEqual([0, 0, 1, 0, 1, 0, 1]);
  expect(["ApplyButton", "ResetButton", "UndoButton"].map(k => fills(addon, `LegacySystemFrame.TreePage.LegacyTreeTraitPanel.${k}`)), "the three are flat buttons").toEqual([1, 1, 1]);
  expect(fills(addon, "LegacySystemFrame.TreePage.LegacyTreeTraitPanel"), "the trait panel itself stays uncovered").toBe(0);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("legacy system challenges page: the filter, search box and category rows are in the theme, the cards are panels with a theme Track box, the objectives and bars are theme tracks", () => {
  const addon = legacyParts();
  const list = "LegacySystemFrame.ChallengesPage.CategoryList";
  expect(addon.eval(`local l = ${list} return { l.FilterDropdown.Plate:GetAlpha(), l.FilterDropdown.Arrow:GetAlpha(), __looks(l.FilterDropdown.Text, 'label', 'text'), l.SearchBox.art:GetAlpha(), l.SearchBox.searchIcon:GetAlpha(), __looks(l.NoResultsText, 'label', 'text2') }`),
    "the filter's plate faded, its theme arrow and its label light; the search box's art faded, its magnifier kept; the no-challenges line grey").toEqual([0, 0, true, 0, 1, true]);
  // The list's row n: a theme row, the alphas of its bars, dot, chevron and the chevron button's other art, and whether its rail shows.
  const row = (n) => addon.eval(`local r = ${list}.ScrollBox.items[${n}] local c = r.CollapseButton
    return { ns.Theme.RowParts(r) ~= nil, r.NormalTexture:GetAlpha(), r.HighlightTexture:GetAlpha(), r.NotificationIcon:GetAlpha(), c.Icon:GetAlpha(), c.Glow:GetAlpha(), ns.Theme.RowParts(r).rail:IsShown() }`);
  addon.eval(`__acquire(${list}.ScrollBox, __categoryRow(true)) __acquire(${list}.ScrollBox, __categoryRow(false))`);
  expect(row(1), "a category row: a theme row, the bars faded, the unseen dot and the chevron kept, lit while selected").toEqual([true, 0, 0, 1, 1, 0, true]);
  expect(row(2), "another, not selected").toEqual([true, 0, 0, 1, 1, 0, false]);
  expect(addon.eval(`return ${list}.ScrollBox.items[1].CollapseButton.Icon.__vertexColor ~= nil`), "the chevron is tinted in the text colour").toBe(true);
  addon.eval(`${list}.ScrollBox.items[2]:SetSelected(true) ${list}.ScrollBox.items[1]:SetSelected(false)`);
  expect([row(1)[6], row(2)[6]], "the selected look follows the game's SetSelected").toEqual([false, true]);
  const cards = "LegacySystemFrame.ChallengesPage.DetailPane.ScrollBox";
  // Challenge card n: its plates, ribbon, plus sign, whether it is a panel, its Track box a theme check box, and whether its selected rail shows.
  const challenge = (n) => addon.eval(`local c = ${cards}.items[${n}]
    return { c.Background:GetAlpha(), c.BackgroundTop:GetAlpha(), c.BackgroundMiddle:GetAlpha(), c.BackgroundBottom:GetAlpha(), c.SelectedOverlay:GetAlpha(), c.TitleBar:GetAlpha(), c.PlusMinus:GetAlpha(),
      ns.Theme.CheckParts(c.Tracked) ~= nil, ns.Theme.RowParts(c).rail:IsShown() }`);
  addon.eval(`__acquire(${cards}, __challenge(false)) __acquire(${cards}, __challenge(true))`);
  expect(challenge(1), "a challenge card: plates, tiles, glow and ribbon faded, the plus sign kept, a theme Track box, no rail").toEqual([0, 0, 0, 0, 0, 0, 1, true, false]);
  expect(challenge(2), "the open one shows the selected rail").toEqual([0, 0, 0, 0, 0, 0, 1, true, true]);
  expect([fills(addon, `${cards}.items[1]`), fills(addon, `${cards}.items[2]`)], "each a panel; the open one also has the selected fill showing").toEqual([1, 2]);
  addon.eval(`${cards}.items[1].selected = true ${cards}.items[2].selected = false ${cards}.items[1]:RefreshStateArt() ${cards}.items[2]:RefreshStateArt()`);
  expect([challenge(1)[8], challenge(2)[8]], "the selected look follows the game's RefreshStateArt").toEqual([true, false]);
  // The shared objectives frame's active rows: [background, track plate, has a bar, bar art faded, bar texture kept, bar is a track] for each, in creation order.
  const criteria = () => addon.eval(`local out = {} for r in LegacyChallengeObjectives.criteriaPool:EnumerateActive() do
    local b = r.ProgressBar out[#out + 1] = { r.Background:GetAlpha(), r.ProgressBarBackground:GetAlpha(), b ~= nil, b and b.Frame:GetAlpha() or 0, b and b:GetStatusBarTexture():GetAlpha() or 1, b and __sunk(b) or true } end
    return out`);
  expect(criteria(), "the objective rows open at skin time: bar art faded, the counted one a sunk track keeping its fill").toEqual([[0, 0, true, 0, 1, true]]);
  addon.eval("LegacyChallengeObjectives:Display(1)");
  expect(criteria().length, "the game fills the frame again").toBe(3);
  expect(criteria().every(r => r[0] === 0 && r[1] === 0 && r[3] === 0 && r[4] === 1 && r[5] === true), "each new row is dressed as the game adds it").toBe(true);
  expect(addon.eval("local s = LegacySystemFrame.ChallengesPage.LegacyChallengePointSummary return { s.ProgressBarBackground:GetAlpha(), s.PointsBar.Frame:GetAlpha(), s.PointsBar:GetStatusBarTexture():GetAlpha(), __sunk(s.PointsBar) }"), "the points bar: its track art faded, its fill kept, a sunk track").toEqual([0, 0, 1, true]);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("legacy system reward page: the progress bar is a theme track and the cards the track makes are raised tiles keeping their icons", () => {
  const addon = legacyParts();
  const page = "LegacySystemFrame.RewardTrackPage";
  expect(addon.eval(`local p = ${page} return { p.ProgressBarBackground:GetAlpha(), p.LegacyRewardProgressBar.Frame:GetAlpha(), p.LegacyRewardProgressBar:GetStatusBarTexture():GetAlpha(), __sunk(p.LegacyRewardProgressBar) }`), "the bar's track art faded, its fill kept, a sunk track").toEqual([0, 0, 1, true]);
  expect(addon.eval(`return ${page}.LegacyRewardProgressFrame.Elements == nil`), "the track holds no cards until the game sets it up").toBe(true);
  addon.eval(`${page}.LegacyRewardProgressFrame:Init()`);
  // Reward card n: the alphas of its plate, diamond, icon ring, icon and earned tick, and whether it is a tile.
  const card = (n) => addon.eval(`local c = ${page}.LegacyRewardProgressFrame.Elements[${n}] return { c.RewardCardBG:GetAlpha(), c.LevelSquare:GetAlpha(), c.IconBorder:GetAlpha(), c.Icon:GetAlpha(), c.EarnedCheckmark:GetAlpha() }`);
  expect([card(1), card(2)], "each card the track made: plate, diamond and ring faded, the icon and tick kept").toEqual([[0, 0, 0, 1, 1], [0, 0, 0, 1, 1]]);
  expect([fills(addon, `${page}.LegacyRewardProgressFrame.Elements[1]`), fills(addon, `${page}.LegacyRewardProgressFrame.Elements[2]`)], "each a raised tile").toEqual([1, 1]);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("legacy system: crests lose the bronze, card icons are cropped flat and the cards' texts and bars read clearly", () => {
  const addon = legacyParts();
  const list = "LegacySystemFrame.ChallengesPage.CategoryList";
  const cards = "LegacySystemFrame.ChallengesPage.DetailPane.ScrollBox";
  addon.eval(`__acquire(${list}.ScrollBox, __categoryRow(false)) __acquire(${cards}, __challenge(false))`);
  // A crest's desaturated flag and whether it was tinted.
  const tint = (expr) => addon.eval(`local r = ${expr} return { r.__desaturated, r.__vertexColor ~= nil }`);
  expect(addon.eval(`return __looks(${list}.ScrollBox.items[1].Text, 'label', 'text')`), "a category's name is in the text colour, not the game's yellow").toBe(true);
  expect(addon.eval(`local c = ${cards}.items[1] return { __looks(c.Title, 'label', 'text'), __looks(c.Description, 'small', 'text2'), c.Title:GetAlpha(), c.Description:GetAlpha(), c.IconBorder:GetAlpha() }`), "a challenge card's title and description in the text tiers at full strength, the icon frame faded").toEqual([true, true, 1, 1, 0]);
  expect(addon.eval(`return ${cards}.items[1].Icon.__texCoord ~= nil`), "its icon is cropped").toBe(true);
  // A card whose icon is a button and whose crest is a frame holding a texture (and a font string, which is left alone).
  addon.eval(`local c = __challenge(false) c.Icon = CreateFrame("Button", nil, c) c.Icon.Icon = c.Icon:CreateTexture() c.PointsBadge = CreateFrame("Frame", nil, c)
    c.PointsBadge.tex = c.PointsBadge:CreateTexture() c.PointsBadge.num = __fs(c.PointsBadge) __acquire(${cards}, c)`);
  expect(addon.eval(`local c = ${cards}.items[2] return { c.Icon.Icon.__texCoord ~= nil, c.PointsBadge.tex.__desaturated }`), "a button icon is dressed like the spellbook's, a crest frame's textures are flattened").toEqual([true, true]);
  // The game's challenge icon is a frame holding its picture as texture and a ring as frame: the picture stays.
  addon.eval(`local c = __challenge(false) c.Icon = CreateFrame("Frame", nil, c) c.Icon.texture, c.Icon.frame = c.Icon:CreateTexture(), c.Icon:CreateTexture() __acquire(${cards}, c)`);
  expect(addon.eval(`local i = ${cards}.items[3].Icon return { i.texture:GetAlpha(), i.texture.__texCoord ~= nil, i.frame:GetAlpha() }`), "a frame icon keeps and crops its picture, its ring is faded").toEqual([1, true, 0]);
  expect([tint(`${cards}.items[1].Shield`), tint("LegacySystemFrame.TreePage.LegacyTreePointSummary.Shield")], "the crests are desaturated and tinted").toEqual([[true, true], [true, true]]);
  expect(addon.eval("local b = LegacySystemFrame.ChallengesPage.LegacyChallengePointSummary.PointsBar return { __looks(b.Text, 'label', 'text'), b:GetStatusBarTexture().__vertexColor ~= nil }"), "the points bar's figures are in the text colour over an accent fill").toEqual([true, true]);
  addon.eval("LegacySystemFrame.RewardTrackPage.LegacyRewardProgressFrame:Init()");
  expect(addon.eval("local c = LegacySystemFrame.RewardTrackPage.LegacyRewardProgressFrame.Elements[1] return { __looks(c.RewardName, 'label', 'text'), __looks(c.Level, 'small', 'text2'), c.RewardName:GetAlpha(), c.Icon.__texCoord ~= nil }"), "a locked reward's name and level are in the text tiers at full strength, its icon cropped").toEqual([true, true, 1, true]);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("legacy system: switched off it stays the game's; a client missing its pages loads cleanly", () => {
  const off = loggedIn(LEGACY_ENV, MAP_OFF);
  off.eval("__legacy()");
  off.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  off.eval("LegacySystemFrame:Show()");
  expect([windowState(off, "LegacySystemFrame").art !== 0, off.eval("return LegacySystemFrame.TreePage.Background:GetAlpha()"), off.eval("return ns.FrameState('vgWindow')[LegacySystemFrame] == nil")], "not hooked, art left").toEqual([true, 1, true]);
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
  expect(ring(1), "the ring is faded, the icon kept, the grey line between entries replaced by a divider").toEqual([0, 1, 0]);
  expect(addon.eval("local e = QueueStatusFrame.statusEntriesPool.items[1] return ns.Theme.DividerParts(e.EntrySeparator) ~= nil"), "one pixel of divider along it").toBe(true);
  addon.eval("QueueStatusFrame:Update()");
  expect(ring(2), "an entry the game makes on its next update is dressed too").toEqual([0, 1, 0]);
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
const CALENDAR_ENV = WINDOWS_ENV + SCROLL_HELPERS + `
  function __calendar()
    local f = CreateFrame("Frame", "CalendarFrame", UIParent)
    f:Hide()
    for _, name in ipairs({ "CalendarFrameTopLeftTexture", "CalendarWeekday1Background", "CalendarMonthBackground", "CalendarWeekdaySelectedTexture", "CalendarLastDayDarkTexture" }) do
      _G[name] = f:CreateTexture(nil, "BACKGROUND")
    end
    local close = CreateFrame("Button", "CalendarCloseButton", f) close:CreateTexture()
    close:SetPoint("TOPRIGHT", f, "TOPRIGHT", 1, -17)
    for _, name in ipairs({ "CalendarPrevMonthButton", "CalendarNextMonthButton" }) do
      local b = CreateFrame("Button", name, f)
      b.art, b.icon, b.off, b.push = b:CreateTexture(), b:CreateTexture(), b:CreateTexture(), b:CreateTexture()
      b.GetNormalTexture = function(self) return self.icon end
      b.GetDisabledTexture = function(self) return self.off end
      b.GetPushedTexture = function(self) return self.push end
    end
    for i = 1, 7 do _G["CalendarWeekday" .. i .. "Name"] = f:CreateFontString(nil, "OVERLAY") _G["CalendarWeekday" .. i .. "Name"]:SetFont("TEST-ONLY-GAME", 12, "") end
    _G.CalendarYearName = f:CreateFontString(nil, "OVERLAY") _G.CalendarYearName:SetFont("TEST-ONLY-GAME", 10, "")
    local filter = CreateFrame("Button", "CalendarFilterButton", f) filter.art = filter:CreateTexture()
    filter.Text = filter:CreateFontString(nil, "OVERLAY") filter.Text:SetFont("TEST-ONLY-GAME", 12, "")
    filter:SetSize(106, 22) filter:SetPoint("TOPRIGHT", f, "TOPRIGHT", -27, -20)
    for _, name in ipairs({ "CalendarClassTotalsButton", "CalendarClassButton1", "CalendarClassButton11" }) do
      local b = CreateFrame("Button", name, f)
      b.art, b.icon = b:CreateTexture(), b:CreateTexture()
      b.GetNormalTexture = function(self) return self.icon end
    end
    local today = CreateFrame("Frame", "CalendarTodayFrame", f) today.art = today:CreateTexture() today:SetSize(145, 140)
    function CalendarFrame_SetToday(day) today:SetParent(day) today:ClearAllPoints() today:SetPoint("CENTER", day, "CENTER") end
    for i = 1, 42 do
      local b = CreateFrame("Button", "CalendarDayButton" .. i, f) b:SetSize(91, 91)
      b.overlay = CreateFrame("Frame", "CalendarDayButton" .. i .. "OverlayFrame", b)
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
    for _, box in ipairs({ { "CalendarViewEventDescriptionContainer", CalendarViewEventFrame }, { "CalendarViewEventInviteList", CalendarViewEventFrame },
      { "CalendarCreateEventDescriptionContainer", CalendarCreateEventFrame }, { "CalendarCreateEventInviteList", CalendarCreateEventFrame } }) do
      local f = CreateFrame("Frame", box[1], box[2]) f.NineSlice = CreateFrame("Frame", nil, f) f.NineSlice:CreateTexture()
    end
    _G.CalendarViewEventDivider = CalendarViewEventFrame:CreateTexture()
    _G.CalendarCreateEventDivider = CalendarCreateEventFrame:CreateTexture()
  end
  function __gold(parent, name) local fs = parent:CreateFontString(name, "OVERLAY") fs:SetFont("TEST-ONLY-GAME", 12, "") return fs end
  function __sortButton(list, name, withText)
    local b = CreateFrame("Button", name, list)
    if withText then b.fs = __gold(b) b.GetFontString = function(self) return self.fs end end
    return b
  end
  function __inviteRow(list)
    local r = CreateFrame("Button", nil, list.ScrollBox)
    r.ModIcon, r.PartyIcon, r.Bar = r:CreateTexture(), r:CreateTexture(), r:CreateTexture()
    return r
  end
  function __pickerRow(box)
    local r = CreateFrame("Button", nil, box)
    r.Icon, r.Bar, r.Title = r:CreateTexture(), r:CreateTexture(), __gold(r)
    return r
  end
  function __calendarParts()
    for _, name in ipairs({ "CalendarViewHolidayFrame", "CalendarViewRaidFrame" }) do _G[name].ScrollingFont = CreateFrame("Frame", nil, _G[name]) end
    for _, name in ipairs({ "CalendarViewEventTitle", "CalendarViewEventCommunityName", "CalendarViewEventTypeName", "CalendarViewEventCreatorName" }) do __gold(CalendarViewEventFrame, name) end
    for _, name in ipairs({ "CalendarCreateEventCommunityName", "CalendarCreateEventTextureName", "CalendarCreateEventCreatorName" }) do __gold(CalendarCreateEventFrame, name) end
    for _, name in ipairs({ "CalendarMassInviteLevelText", "CalendarMassInviteFrameLevelDivider", "CalendarMassInviteRankText" }) do __gold(CalendarMassInviteFrame, name) end
    for _, key in ipairs({ "EventTypeDropdown", "HourDropdown", "MinuteDropdown", "AMPMDropdown", "DifficultyOptionDropdown", "CommunityDropdown" }) do CalendarCreateEventFrame[key] = __dropdown(CalendarCreateEventFrame) end
    for _, key in ipairs({ "CommunityDropdown", "RankDropdown" }) do CalendarMassInviteFrame[key] = __dropdown(CalendarMassInviteFrame) end
    _G.CalendarCreateEventAutoApproveCheck, _G.CalendarCreateEventLockEventCheck = __check(CalendarCreateEventFrame), __check(CalendarCreateEventFrame)
    for _, name in ipairs({ "CalendarViewEventInviteList", "CalendarCreateEventInviteList" }) do
      local list = _G[name] list.ScrollBox = __box(list)
      __sortButton(list, name .. "NameSortButton", true) __sortButton(list, name .. "ClassSortButton", true) __sortButton(list, name .. "StatusSortButton", false)
    end
    CalendarEventPickerFrame.ScrollBox, CalendarTexturePickerFrame.ScrollBox = __box(CalendarEventPickerFrame), __box(CalendarTexturePickerFrame)
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
  expect(addon.eval("local p, rel, rp, x, y = CalendarFilterButton:GetPoint(1) return { CalendarFilterButton:GetNumPoints(), p, rel == CalendarCloseButton, rp, x, y }"),
    "the filter button sits level with the close button, its right edge where a maximize box's plate would end (clear of the close plate)").toEqual([1, "RIGHT", true, "CENTER", -addon.eval("return ns.Theme.PixelRound(CalendarCloseButton, 18)"), 0]);
  expect(addon.eval("local p, n = CalendarPrevMonthButton, CalendarNextMonthButton return { p.art:GetAlpha(), p.icon:GetAlpha(), p.off:GetAlpha(), p.push:GetAlpha(), n.art:GetAlpha(), n.icon:GetAlpha() }"), "the month buttons lose the template art (the theme arrow replaces it)").toEqual([0, 0, 0, 0, 0, 0]);
  expect(addon.eval("local p, n = ns.Theme.ArrowParts(CalendarPrevMonthButton), ns.Theme.ArrowParts(CalendarNextMonthButton) return { p ~= nil, n ~= nil, true }"), "and are theme arrows").toEqual([true, true, true]);
  expect(addon.eval("return { CalendarTodayFrame.art:GetAlpha(), ns.Theme.PaintedCount() > 0 }")[0], "today's ornate frame art is faded").toBe(0);
  expect(addon.eval("return { CalendarTodayFrame:GetWidth(), CalendarTodayFrame:GetHeight() }"), "a today marker still on the window keeps the game's size").toEqual([145, 140]);
  expect(addon.eval("CalendarFrame_SetToday(CalendarDayButton19) return { CalendarTodayFrame:GetWidth(), CalendarTodayFrame:GetHeight(), CalendarTodayFrame:GetParent() == CalendarDayButton19 }"), "the marker is sized to the day cell the game puts it on").toEqual([91, 91, true]);
  expect(addon.eval("CalendarFrame_SetToday(CalendarDayButton3) return { CalendarTodayFrame:GetWidth(), CalendarTodayFrame:GetHeight() }"), "and follows it to another cell").toEqual([91, 91]);
  expect(addon.eval("local o = CalendarDayButton1OverlayFrame return o:GetAlpha()"), "a day's holiday overlay art is faded").toBe(0);
  expect(addon.eval("local out = {} for i = 1, 7 do out[i] = __looks(_G['CalendarWeekday' .. i .. 'Name'], 'label', 'text') end return { out, __looks(CalendarYearName, 'small', 'text2'), __looks(CalendarFilterButton.Text, 'label', 'text') }"),
    "the weekday headings and the filter's label are light label text, the year small and grey").toEqual([[true, true, true, true, true, true, true], true, true]);
  expect(addon.eval("local t, c = CalendarClassTotalsButton, CalendarClassButton11 return { CalendarFilterButton.art:GetAlpha(), t.art:GetAlpha(), t.icon:GetAlpha(), c.art:GetAlpha(), c.icon:GetAlpha() }"), "the filter button and the class buttons lose the template art and keep the class icons").toEqual([0, 0, 1, 0, 1]);
  expect([fills(addon, "CalendarFilterButton"), fills(addon, "CalendarClassTotalsButton"), fills(addon, "CalendarClassButton1")], "and are flat").toEqual([1, 1, 1]);
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
    expect(addon.eval(`local d = ${name} return { d.Border:GetAlpha(), (d.Border:GetRegions()):GetAlpha(), d.Header.LeftBG:GetAlpha(), d.Header.RightBG:GetAlpha(), d.Header.CenterBG:GetAlpha(), __titled(d.Header.Text) }`), `${name}: the border and the header plate are faded, the title in the theme font`).toEqual([0, 0, 0, 0, 0, true]);
  }
  expect([calAlpha(addon, "CalendarViewHolidayFrame.Texture"), calAlpha(addon, "CalendarCreateEventIcon")], "the holiday's backdrop art is faded and the create dialog's icon is left as the game has it").toEqual([0, 1]);
  expect(addon.eval("return CalendarViewHolidayFrame.Border:GetAlpha()"), "the dialog's border art is faded").toBe(0);
  expect(["CalendarViewHolidayCloseButton", "CalendarViewEventCloseButton", "CalendarCreateEventCloseButton", "CalendarMassInviteCloseButton"].map(n => closeSeal(addon, n)), "the close buttons are the theme's close seal").toEqual([true, true, true, true]);
  expect(["CalendarViewEventAcceptButton", "CalendarCreateEventCreateButton", "CalendarEventPickerCloseButton", "CalendarTexturePickerAcceptButton"].map(n => fills(addon, n)), "the push buttons are flat buttons (one fill; the hover clear at rest)").toEqual([1, 1, 1, 1]);
  expect(["CalendarCreateEventTitleEdit", "CalendarMassInviteMinLevelEdit"].map(n => calAlpha(addon, `(_G.${n}:GetRegions())`)), "the text boxes' template art is faded").toEqual([0, 0]);
  const boxes = ["CalendarViewEventDescriptionContainer", "CalendarViewEventInviteList", "CalendarCreateEventDescriptionContainer", "CalendarCreateEventInviteList"];
  expect(boxes.map(n => [fills(addon, n), calAlpha(addon, `${n}.NineSlice`)]), "the event dialogs' description and invite boxes are inset panels, their backdrop art faded").toEqual(boxes.map(() => [1, 0]));
  expect(["CalendarViewEventDivider", "CalendarCreateEventDivider"].map(n => [calAlpha(addon, `_G.${n}`), addon.eval(`return ns.Theme.DividerParts(_G.${n}) ~= nil`)]), "and their dividers are one pixel of divider in place of the faded art").toEqual([[0, true], [0, true]]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CalendarCreateEventFrame:Hide() CalendarCreateEventFrame:Show() CalendarViewHolidayFrame:Hide() CalendarViewHolidayFrame:Show()");
  expect([addon.eval("return ns.Theme.PaintedCount()"), calAlpha(addon, "CalendarViewHolidayFrame.Texture"), calAlpha(addon, "CalendarCreateEventIcon")], "a second show paints nothing new and keeps the pictures").toEqual([painted, 0, 1]);
});

it("calendar dialogs: the holiday and raid text areas are inset panels, the event dialogs' texts, dropdowns, check boxes and invite lists are in the theme, the pickers' rows follow the game's highlight", () => {
  const addon = loggedIn(CALENDAR_ENV);
  addon.eval("__calendar() __calendarDialogs() __calendarParts()");
  // Rows the lists hold when the dialog is first skinned, and the pickers' too.
  addon.eval("__acquire(CalendarViewEventInviteList.ScrollBox, __inviteRow(CalendarViewEventInviteList)) __acquire(CalendarEventPickerFrame.ScrollBox, __pickerRow(CalendarEventPickerFrame.ScrollBox))");
  addon.fire("ADDON_LOADED", "Blizzard_Calendar");
  const names = ["CalendarViewHolidayFrame", "CalendarViewRaidFrame", "CalendarViewEventFrame", "CalendarCreateEventFrame", "CalendarMassInviteFrame", "CalendarEventPickerFrame", "CalendarTexturePickerFrame"];
  for (const name of names) addon.eval(`${name}:Show()`);
  expect(["CalendarViewHolidayFrame", "CalendarViewRaidFrame"].map(n => fills(addon, `${n}.ScrollingFont`)), "the holiday and raid text areas are inset panels").toEqual([1, 1]);
  expect(addon.eval("return { __looks(CalendarViewEventTitle, 'name', 'text'), __looks(CalendarViewEventCommunityName, 'small', 'text2'), __looks(CalendarViewEventTypeName, 'small', 'text2'), __looks(CalendarViewEventCreatorName, 'small', 'text2') }"),
    "the event's name is a name in the text colour, the community, type and creator lines small and grey").toEqual([true, true, true, true]);
  expect(addon.eval("return { __looks(CalendarCreateEventCommunityName, 'small', 'text2'), __looks(CalendarCreateEventTextureName, 'small', 'text2'), __looks(CalendarCreateEventCreatorName, 'small', 'text2') }"), "the create dialog's labels beside the icon are small and grey").toEqual([true, true, true]);
  expect(addon.eval("return { __looks(CalendarMassInviteLevelText, 'small', 'text'), __looks(CalendarMassInviteFrameLevelDivider, 'small', 'text'), __looks(CalendarMassInviteRankText, 'small', 'text') }"), "the mass invite labels are small and light").toEqual([true, true, true]);
  expect(addon.eval(`local out = {} for _, key in ipairs({ "EventTypeDropdown", "HourDropdown", "MinuteDropdown", "AMPMDropdown", "DifficultyOptionDropdown", "CommunityDropdown" }) do
    local d = CalendarCreateEventFrame[key] out[#out + 1] = d.Plate:GetAlpha() * 10 + d.Arrow:GetAlpha() end
    for _, key in ipairs({ "CommunityDropdown", "RankDropdown" }) do local d = CalendarMassInviteFrame[key] out[#out + 1] = d.Plate:GetAlpha() * 10 + d.Arrow:GetAlpha() end return out`),
    "the six create dropdowns and the two mass invite ones lose their plates and swap their arrows for the theme arrow").toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect(addon.eval("return { ns.Theme.CheckParts(CalendarCreateEventAutoApproveCheck) ~= nil, ns.Theme.CheckParts(CalendarCreateEventLockEventCheck) ~= nil }"), "the auto approve and lock boxes are theme check boxes").toEqual([true, true]);
  // The two lists' sort buttons: the label of each that has one, in small grey cell text.
  expect(addon.eval("local out = {} for _, n in ipairs({ 'CalendarViewEventInviteList', 'CalendarCreateEventInviteList' }) do out[#out + 1] = __looks(_G[n .. 'NameSortButton'].fs, 'cell', 'text2') out[#out + 1] = __looks(_G[n .. 'ClassSortButton'].fs, 'cell', 'text2') end return out"),
    "the column headings are cell text, grey (the status button without a label is skipped)").toEqual([true, true, true, true]);
  // An invite row (by list name and position): a theme row, its bar faded, its marks kept, and whether its rail shows.
  const invite = (list, n) => addon.eval(`local r = ${list}.ScrollBox.items[${n}] return { ns.Theme.RowParts(r) ~= nil, r.Bar:GetAlpha(), r.ModIcon:GetAlpha(), r.PartyIcon:GetAlpha(), ns.Theme.RowParts(r).rail:IsShown() }`);
  addon.eval("__acquire(CalendarViewEventInviteList.ScrollBox, __inviteRow(CalendarViewEventInviteList)) __acquire(CalendarCreateEventInviteList.ScrollBox, __inviteRow(CalendarCreateEventInviteList))");
  expect([invite("CalendarViewEventInviteList", 1), invite("CalendarViewEventInviteList", 2), invite("CalendarCreateEventInviteList", 1)], "invite rows, the one the list held and those it was given: theme rows, bar faded, marks kept, not picked").toEqual(Array(3).fill([true, 0, 1, 1, false]));
  addon.eval("CalendarViewEventInviteList.ScrollBox.items[2]:LockHighlight()");
  expect([invite("CalendarViewEventInviteList", 1)[4], invite("CalendarViewEventInviteList", 2)[4]], "the picked invite is lit while the game holds its highlight").toEqual([false, true]);
  addon.eval("CalendarViewEventInviteList.ScrollBox.items[2]:UnlockHighlight()");
  expect(invite("CalendarViewEventInviteList", 2)[4], "and not once the game lets it go").toBe(false);
  expect(["CalendarEventPickerFrame", "CalendarTexturePickerFrame"].map(n => fills(addon, `${n}.ScrollBox`)), "each picker's list sits on an inset panel").toEqual([1, 1]);
  addon.eval("__acquire(CalendarTexturePickerFrame.ScrollBox, __pickerRow(CalendarTexturePickerFrame.ScrollBox))");
  // A picker row (by dialog and position): a theme row, its bar faded, its picture kept, its title light, and whether its rail shows.
  const pick = (dialog, n) => addon.eval(`local r = ${dialog}.ScrollBox.items[${n}] return { ns.Theme.RowParts(r) ~= nil, r.Bar:GetAlpha(), r.Icon:GetAlpha(), __looks(r.Title, 'label', 'text'), ns.Theme.RowParts(r).rail:IsShown() }`);
  expect([pick("CalendarEventPickerFrame", 1), pick("CalendarTexturePickerFrame", 1)], "picker rows, one the list held and one it was given").toEqual(Array(2).fill([true, 0, 1, true, false]));
  addon.eval("CalendarTexturePickerFrame.ScrollBox.items[1]:LockHighlight()");
  expect(pick("CalendarTexturePickerFrame", 1)[4], "the picked picture is lit while the game holds its highlight").toBe(true);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("calendar: switched off it stays the game's; a client missing the window, its buttons or its dialogs' parts loads cleanly", () => {
  const off = loggedIn(CALENDAR_ENV, MAP_OFF);
  off.eval("__calendar() __calendarDialogs()");
  off.fire("ADDON_LOADED", "Blizzard_Calendar");
  off.eval("CalendarFrame:Show() CalendarViewEventFrame:Show()");
  expect([calAlpha(off, "_G.CalendarFrameTopLeftTexture"), off.eval("return CalendarDayButton1.parchment:GetAlpha()"), off.eval("return CalendarViewEventFrame.Border:GetAlpha()"), off.eval("return ns.FrameState('vgWindow')[CalendarFrame] == nil"), calAlpha(off, "_G.CalendarViewEventDivider")], "not hooked, art left").toEqual([1, 1, 1, true, 1]);
  const bare = loggedIn(WINDOWS_ENV + `
    CreateFrame("Frame", "CalendarFrame", UIParent):Hide() CalendarPrevMonthButton = {} CalendarDayButton1 = CreateFrame("Button", "CalendarDayButton1", CalendarFrame)
    local d = CreateFrame("Frame", "CalendarViewRaidFrame", UIParent) d.Header = {} d:Hide()
    CreateFrame("Frame", "CalendarCreateEventFrame", UIParent):Hide() CalendarCreateEventTitleEdit = {} CalendarViewEventFrame = {}`);
  bare.fire("ADDON_LOADED", "Blizzard_Calendar");
  bare.eval("CalendarFrame:Show() CalendarViewRaidFrame:Show() CalendarCreateEventFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no month buttons, day textures, header parts or text boxes: no errors").toBe(0);
});
