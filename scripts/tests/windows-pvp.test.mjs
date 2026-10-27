// windows-pvp: the pvp group of game windows (Modules/WindowsPvP.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").
// The frames are built after Blizzard's Forever source (parentKeys and global names as the game has them).

import { expect, it } from "vitest";
import { INSIDES_LUA, WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

// The pvp group's switch turned off in the saved variables.
const OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { pvp = false } } }" };

// Whether the addon recorded an error from the Windows module (none: "none").
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') or e.text:find('window') then return e.text end end return 'none'");

// TEST-ONLY helpers: a piece of game art (marked), a scroll bar shaped like MinimalScrollBar, and whether a
// frame has a texture of Vanguard's showing (a panel, a themed button) or what alpha a region has.
const PVP_ENV = WINDOWS_ENV + INSIDES_LUA + `
  -- Whether a font string the skin put in the theme font, at the size it had, is in the colour of the theme token.
  function __kept(fs, size, token)
    local _, s = fs:GetFont()
    local c, t = fs.__textColor, { ns.Theme.RGB(token) }
    return __themed(fs) and s == size and c ~= nil and c[1] == t[1] and c[2] == t[2] and c[3] == t[3]
  end
  function __lit(fs, role, token) return __looks(fs, role, token) end
  -- Which glyph a window control carries: "Minimize", "CloseMark" or nothing.
  function __glyph(b)
    for _, r in ipairs({ b:GetRegions() }) do
      if r.__texture == ns.Theme.Icon("Minimize") then return "Minimize" end
      if r.__texture == ns.Theme.Icon("CloseMark") then return "CloseMark" end
    end
  end
  function __art(parent, layer) local t = parent:CreateTexture(nil, layer or "BACKGROUND") t:SetTexture("TEST-ONLY-ART") return t end
  function __scrollBar(parent)
    local b = CreateFrame("Frame", nil, parent) b.Track = CreateFrame("Frame", nil, b) b.Thumb = CreateFrame("Button", nil, b.Track)
    __art(b.Track) return b
  end
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__kind == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
`;

it("the pvp group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.pvp"), "its switch is on by default").toBe(true);
  expect(windowErrors(addon)).toBe("none");
});

// Scoreboards ------------------------------------------------------------------------------------

// The scoreboard (Content, TabContainer, ScrollBar) and the match results (the same in lower case, a reward band
// and two push buttons), each with a SetupArtwork that lays new art on the frame, as the game's does.
const MATCH_ENV = PVP_ENV + `
  function __match(name, content, strip, bar, mm)
    local f = __window(name)
    local c = CreateFrame("Frame", nil, f) f[content] = c
    c.Background, c.InsetBorderTop = __art(c), __art(c, "OVERLAY")
    c.ScrollBox = CreateFrame("Frame", nil, c) c.ScrollBox.Background = __art(c.ScrollBox)
    local s = CreateFrame("Frame", nil, c) c[strip] = s s.InsetBorderTop = __art(s) s[mm] = __text(s, "MMR 1500")
    f[bar] = __scrollBar(c)
    f.__setups = 0
    function f:SetupArtwork() self.__setups = self.__setups + 1 self.__new = __art(self) end
    return f
  end
  function __matches()
    __match("PVPMatchScoreboard", "Content", "TabContainer", "ScrollBar", "MatchmakingText")
    local r = __match("PVPMatchResults", "content", "tabContainer", "scrollBar", "matchmakingText")
    local e = CreateFrame("Frame", nil, r.content) r.content.earningsArt = e
    e.background, e.OrangeGlow, e.OrangeSmoke = __art(e), __art(e, "OVERLAY"), __art(e, "OVERLAY")
    r.requeueButton, r.leaveButton = CreateFrame("Button", nil, r), CreateFrame("Button", nil, r)
    r.header = r:CreateFontString() r.header:SetFont("TEST-ONLY-GAME", 42, "") r.header:SetText("Victory")
    r.overlay = CreateFrame("Frame", nil, r) r.overlay.decorator = __art(r.overlay, "ARTWORK")
    local box = CreateFrame("Frame", nil, r.content) r.content.earningsContainer = box
    for _, key in ipairs({ "rewardsContainer", "progressContainer" }) do
      box[key] = CreateFrame("Frame", nil, box) box[key].header = box[key]:CreateFontString() box[key].header:SetFont("TEST-ONLY-GAME", 13, "")
    end
    -- The reward tiles' pool and the game's call that fills it (PVPMatchResultsLoot buttons).
    r.itemPool = { active = {} }
    function r.itemPool:EnumerateActive() return pairs(self.active) end
    function r:AddItemReward()
      local b = CreateFrame("Button", nil, self)
      b.Icon, b.IconBorder, b.IconBorderDropShadow = __art(b, "BORDER"), __art(b, "ARTWORK"), __art(b, "BACKGROUND")
      b.SpecRing, b.SpecIcon, b.arrows = __art(b, "ARTWORK"), __art(b, "ARTWORK"), { __art(b, "ARTWORK") }
      self.itemPool.active[b] = true
    end
  end
`;

it("S8.1 scoreboard and match results: window skin, table panel, the team wash and the reward burst kept", () => {
  const addon = loggedIn(MATCH_ENV + "__matches()");
  addon.eval("PVPMatchScoreboard:Show() PVPMatchResults:Show()");
  for (const name of ["PVPMatchScoreboard", "PVPMatchResults"]) {
    expect(windowState(addon, name), `${name}: the window skin`).toMatchObject({ art: 0, nine: 0, panel: true });
  }
  expect(addon.eval(`local c, s = PVPMatchScoreboard.Content, PVPMatchScoreboard.Content.TabContainer
    return { c.Background:GetAlpha(), c.InsetBorderTop:GetAlpha(), __panel(c), c.ScrollBox.Background:GetAlpha(), s.InsetBorderTop:GetAlpha() }`),
  "scoreboard: backdrop and inset border faded, an inset panel, the team wash kept, the tab strip's line faded").toEqual([0, 0, true, 1, 0]);
  expect(addon.eval(`local e = PVPMatchResults.content.earningsArt
    return { e.background:GetAlpha(), e.OrangeGlow:GetAlpha(), e.OrangeSmoke:GetAlpha(), __panel(PVPMatchResults.content) }`),
  "results: the reward band's backdrop faded, its burst of light kept, the table panelled").toEqual([0, 1, 1, true]);
  expect(addon.eval(`return { __panel(PVPMatchScoreboard.ScrollBar.Thumb), __panel(PVPMatchResults.scrollBar.Thumb),
    __panel(PVPMatchResults.requeueButton), __panel(PVPMatchResults.leaveButton) }`), "both scroll bars and the push buttons themed").toEqual([true, true, true, true]);
});

it("R2.35 match results: faction banner faded, title and headings in the text colour at the game's size, reward tiles quiet slots after the game fills them", () => {
  const addon = loggedIn(MATCH_ENV + "__matches()");
  addon.eval("PVPMatchScoreboard:Show() PVPMatchResults:Show()");
  const r = "PVPMatchResults";
  expect(addon.eval(`local c = ${r}.content.earningsContainer return { ${r}.overlay.decorator:GetAlpha(), __kept(${r}.header, 42, "text"), __kept(c.rewardsContainer.header, 13, "text"), __kept(c.progressContainer.header, 13, "text") }`), "the decorator faded; the title, Rewards and Progress headings in the theme font and the text colour, sizes kept").toEqual([0, true, true, true]);
  expect(addon.eval(`return { __kept(${r}.content.tabContainer.matchmakingText, 12, "text"), __kept(PVPMatchScoreboard.Content.TabContainer.MatchmakingText, 12, "text") }`), "the matchmaking lines under both tables").toEqual([true, true]);
  expect(addon.eval(`local n = 0 for _ in pairs(${r}.itemPool.active) do n = n + 1 end return n`), "no reward tile yet").toBe(0);
  addon.eval(`${r}:AddItemReward() ${r}:AddItemReward()`);
  expect(addon.eval(`local out = {} for b in pairs(${r}.itemPool.active) do out[#out + 1] = { b.Icon:GetAlpha(), b.IconBorder:GetAlpha(), b.SpecIcon:GetAlpha(), b.arrows[1]:GetAlpha(), b.IconBorderDropShadow:GetAlpha(), b.SpecRing:GetAlpha(), __panel(b) } end return out`), "each tile: picture, ring, spec icon and arrows kept; drop shadow and spec ring faded; a slot behind")
    .toEqual([[1, 1, 1, 1, 0, 0, true], [1, 1, 1, 1, 0, 0, true]]);
  const painted = windowState(addon, r).painted;
  addon.eval(`${r}:Hide() ${r}:Show() ${r}:AddItemReward()`);
  expect(addon.eval(`local n = 0 for b in pairs(${r}.itemPool.active) do if __panel(b) then n = n + 1 end end return n`), "a third tile dressed too, the first two not again").toBe(3);
  expect(windowState(addon, r).painted - painted, "a third tile adds one slot's parts and the hook went on once").toBeGreaterThan(0);
  expect(windowErrors(addon)).toBe("none");
});

it("R2.35 match results: windows without the optional parts skip them", () => {
  const addon = loggedIn(MATCH_ENV + `__matches()
    PVPMatchResults.itemPool = {} PVPMatchResults.overlay = nil PVPMatchResults.header = {} PVPMatchResults.content.tabContainer.matchmakingText = {}
    PVPMatchResults.content.earningsContainer.rewardsContainer.header = {}`);
  addon.eval("PVPMatchResults:Show() PVPMatchScoreboard:Show()");
  expect(windowErrors(addon), "a pool without EnumerateActive, no overlay, headings that are no font strings").toBe("none");
});

it("S8.1 scoreboards: art the game lays on later is faded, the hook goes on once, nothing piles up", () => {
  const addon = loggedIn(MATCH_ENV + "__matches()");
  addon.eval("PVPMatchScoreboard:Show()");
  const painted = windowState(addon, "PVPMatchScoreboard").painted;
  addon.eval("PVPMatchScoreboard:SetupArtwork()");
  expect(addon.eval("return { PVPMatchScoreboard.__new:GetAlpha(), PVPMatchScoreboard.__setups }"), "the faction border faded after SetupArtwork").toEqual([0, 1]);
  addon.eval("PVPMatchScoreboard:Hide() PVPMatchScoreboard:Show() PVPMatchScoreboard:SetupArtwork()");
  expect([windowState(addon, "PVPMatchScoreboard").painted, addon.eval("return PVPMatchScoreboard.__setups")], "painted once, the game's call runs once per call").toEqual([painted, 2]);
});

it("S8.1 scoreboards: loaded later (on demand), switched off, or bare", () => {
  const later = loggedIn(MATCH_ENV);
  later.eval("__matches()");
  later.fire("ADDON_LOADED", "Blizzard_PVPMatch");
  later.eval("PVPMatchResults:Show()");
  expect(windowState(later, "PVPMatchResults"), "a client that loads Blizzard_PVPMatch later").toMatchObject({ art: 0, panel: true });
  const off = loggedIn(MATCH_ENV + "__matches()", OFF);
  off.eval("PVPMatchScoreboard:Show()");
  expect([windowState(off, "PVPMatchScoreboard").art !== 0, off.eval("return PVPMatchScoreboard.vgWindow == nil")], "with the group off").toEqual([true, true]);
  const bare = loggedIn(PVP_ENV + '__window("PVPMatchScoreboard") __window("PVPMatchResults")');
  bare.eval("PVPMatchScoreboard:Show() PVPMatchResults:Show()");
  expect([windowState(bare, "PVPMatchResults").panel, windowErrors(bare)], "windows without a table, bar or buttons").toEqual([true, "none"]);
});

// Queue dialogs -----------------------------------------------------------------------------------

// The four queue dialogs as the game builds them: a dialog border, own art, named push buttons; the invite's
// battleground icon, ring and hide button; the ready popup drawn on its ReadyStatus child.
const DIALOG_ENV = PVP_ENV + `
  function __dialog(name, parent)
    local f = CreateFrame("Frame", name, parent or UIParent) __art(f)
    f.Border = CreateFrame("Frame", nil, f) __art(f.Border)
    f:Hide() return f
  end
  local d = __dialog("PVPReadyDialog") d.background, d.bottomArt = __art(d), __art(d, "OVERLAY")
  d.instanceInfo = CreateFrame("Frame", nil, d) d.instanceInfo.underline = __art(d.instanceInfo)
  d.instanceInfo.name, d.instanceInfo.statusText, d.roleLabel = __text(d.instanceInfo, "Warsong Gulch"), __text(d.instanceInfo, "Expires in 1:00"), __text(d, "Healer")
  CreateFrame("Button", "PVPReadyDialogCloseButton", d)
  CreateFrame("Button", "PVPReadyDialogEnterBattleButton", d) CreateFrame("Button", "PVPReadyDialogLeaveQueueButton", d)
  local r = __dialog("PVPRoleCheckPopup")
  r.TankIcon = CreateFrame("Button", "PVPRoleCheckPopupRoleButtonTank", r) r.TankIcon.icon = __art(r.TankIcon, "ARTWORK")
  for _, key in ipairs({ "TankIcon", "HealerIcon", "DPSIcon" }) do
    r[key] = r[key] or CreateFrame("Button", nil, r)
    r[key].checkButton = CreateFrame("CheckButton", nil, r[key]) __art(r[key].checkButton)
  end
  CreateFrame("Button", "PVPRoleCheckPopupAcceptButton", r) CreateFrame("Button", "PVPRoleCheckPopupDeclineButton", r)
  local p = __dialog("PVPFramePopup") PVPFramePopupBackground = __art(p, "BORDER")
  p.ringIcon, PVPFramePopupRing = __art(p, "ARTWORK"), __art(p, "OVERLAY")
  p.minimizeButton = CreateFrame("Button", "PVPFramePopupMinimizeButton", p) __art(p.minimizeButton, "ARTWORK")
  CreateFrame("Button", "PVPFramePopupAcceptButton", p) CreateFrame("Button", "PVPFramePopupDeclineButton", p)
  local pop = CreateFrame("Frame", "PVPReadyPopup", UIParent) pop:Hide()
  local status = __dialog("ReadyStatus", pop) status:Show() status.CloseButton = CreateFrame("Button", nil, status) __art(status.CloseButton)
  pop.RolelessButton = CreateFrame("Frame", nil, pop) pop.RolelessButton.Texture = __art(pop.RolelessButton, "ARTWORK")
`;

it("S8.2 queue dialogs: border and art faded, content art kept, a panel, the close, hide and push buttons themed", () => {
  const addon = loggedIn(DIALOG_ENV);
  addon.eval("PVPReadyDialog:Show() PVPRoleCheckPopup:Show() PVPFramePopup:Show() PVPReadyPopup:Show()");
  expect(addon.eval(`local out = {} for i, n in ipairs({ "PVPReadyDialog", "PVPRoleCheckPopup", "PVPFramePopup" }) do
      local f = _G[n] out[i] = { f.Border:GetAlpha(), __panel(f) } end return out`), "each dialog: its border faded and a panel")
    .toEqual([[0, true], [0, true], [0, true]]);
  expect(addon.eval(`local d, p = PVPReadyDialog, PVPFramePopup
    return { d.background:GetAlpha(), d.bottomArt:GetAlpha(), p.ringIcon:GetAlpha(), PVPFramePopupRing:GetAlpha(), PVPFramePopupBackground:GetAlpha() }`),
  "the battleground picture, icon and ring kept; the divider and the invite's backdrop faded").toEqual([1, 0, 1, 1, 0]);
  expect(addon.eval(`local out = {} for i, n in ipairs({ "PVPReadyDialogCloseButton", "PVPReadyDialogEnterBattleButton", "PVPReadyDialogLeaveQueueButton",
      "PVPRoleCheckPopupAcceptButton", "PVPRoleCheckPopupDeclineButton", "PVPFramePopupAcceptButton", "PVPFramePopupDeclineButton" }) do
      out[i] = __panel(_G[n]) or select('#', _G[n]:GetRegions()) > 0 end return out`), "close and push buttons themed").toEqual(Array(7).fill(true));
  expect(addon.eval("return { (PVPFramePopupMinimizeButton:GetRegions()):GetAlpha(), select('#', PVPFramePopupMinimizeButton:GetRegions()) > 1 }"),
    "the invite's hide button: its art faded, the theme's glyph on it").toEqual([0, true]);
  expect(addon.eval("return { PVPRoleCheckPopup.TankIcon.icon:GetAlpha(), PVPReadyPopup.RolelessButton.Texture:GetAlpha() }"), "role icons keep their art").toEqual([1, 1]);
});

it("R2.35 ready dialog and role check: the rule and texts under the name, the hide buttons as Minimize controls, the role check boxes themed", () => {
  const addon = loggedIn(DIALOG_ENV);
  addon.eval("PVPReadyDialog:Show() PVPRoleCheckPopup:Show() PVPFramePopup:Show() PVPReadyPopup:Show()");
  expect(addon.eval(`local d = PVPReadyDialog return { d.instanceInfo.underline:GetAlpha(), __lit(d.instanceInfo.name, "heading", "text"), __lit(d.instanceInfo.statusText, "label", "text"), __lit(d.roleLabel, "name", "text") }`), "the battleground's rule faded; its name, the status line and your role in the text colour").toEqual([0, true, true, true]);
  expect(addon.eval("return { __glyph(PVPReadyDialogCloseButton), __glyph(ReadyStatus.CloseButton), __glyph(PVPFramePopupMinimizeButton) }"), "the ready dialog's and the ready popup's hide buttons carry the Minimize glyph, like the invite's").toEqual(["Minimize", "Minimize", "Minimize"]);
  expect(addon.eval(`local out = {} for i, key in ipairs({ "TankIcon", "HealerIcon", "DPSIcon" }) do
      local b = PVPRoleCheckPopup[key].checkButton out[i] = { ns.Theme.CheckParts(b) ~= nil, __faded(b) } end return out`), "the three role check boxes themed, the game's box art faded").toEqual([[true, true], [true, true], [true, true]]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("PVPReadyDialog:Hide() PVPReadyDialog:Show() PVPRoleCheckPopup:Hide() PVPRoleCheckPopup:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "a second show paints nothing more").toBe(painted);
  const odd = loggedIn(DIALOG_ENV + "PVPRoleCheckPopup.TankIcon.checkButton = {} PVPRoleCheckPopup.HealerIcon = {} PVPReadyDialog.instanceInfo = {}");
  odd.eval("PVPRoleCheckPopup:Show() PVPReadyDialog:Show()");
  expect(windowErrors(odd), "role buttons without a real check box and a ready dialog without its info: skipped").toBe("none");
});

it("S8.2 the ready popup is drawn on its ReadyStatus child; the group off leaves every dialog the game's", () => {
  const addon = loggedIn(DIALOG_ENV);
  addon.eval("PVPReadyPopup:Show()");
  expect(addon.eval("return { ReadyStatus.Border:GetAlpha(), __panel(ReadyStatus), select('#', ReadyStatus.CloseButton:GetRegions()) > 0, __panel(PVPReadyPopup) }"),
    "the child: border faded, a panel, its close button themed; the popup itself painted nothing").toEqual([0, true, true, false]);
  const off = loggedIn(DIALOG_ENV, OFF);
  off.eval("PVPReadyDialog:Show() PVPReadyPopup:Show()");
  expect(off.eval("return { PVPReadyDialog.Border:GetAlpha(), __panel(PVPReadyDialog), ReadyStatus.Border:GetAlpha(), PVPReadyDialog.vgWindow == nil }"), "with the group off").toEqual([1, false, 1, true]);
});

// Objectives and the match timer -------------------------------------------------------------------

// The top-center widget container with the game's mixin (a widget count, a layout call); the one under the
// minimap without it (a client whose container lacks the mixin: its children are counted).
const WIDGET_ENV = PVP_ENV + `
  local top = CreateFrame("Frame", "UIWidgetTopCenterContainerFrame", UIParent) top:SetSize(10, 10)
  top.numWidgetsShowing, top.__layouts = 0, 0
  function top:HasAnyWidgetsShowing() return self.numWidgetsShowing > 0 end
  function top:UpdateWidgetLayout() self.__layouts = self.__layouts + 1 end
  CreateFrame("Frame", "UIWidgetBelowMinimapContainerFrame", UIParent):SetSize(10, 10)
`;

it("S8.3 widget containers: a flat panel behind the widgets only while there are some, out of the layout", () => {
  const addon = loggedIn(WIDGET_ENV);
  const top = "UIWidgetTopCenterContainerFrame";
  expect(addon.eval(`local b = ns.FrameState('vgBackdrop')[${top}]
    return { b:IsShown(), __panel(b), b:GetParent() == UIParent, b.ignoreInLayout == nil, b:GetFrameLevel() == ${top}:GetFrameLevel() - 1, __vanguardPieces(${top}) }`),
    "an empty container: its panel made but hidden, on a backdrop of Vanguard's own on UIParent (never the container's child, so out of its layout), behind the widgets").toEqual([false, true, true, true, true, 0]);
  addon.eval(`${top}.numWidgetsShowing = 2 ${top}:UpdateWidgetLayout()`);
  expect(addon.eval(`return { ns.FrameState('vgBackdrop')[${top}]:IsShown(), ${top}.__layouts }`), "widgets laid out: the panel shows, the game's call ran").toEqual([true, 1]);
  addon.eval(`${top}.numWidgetsShowing = 0 ${top}.__scripts.OnSizeChanged(${top})`);
  expect(addon.eval(`return ns.FrameState('vgBackdrop')[${top}]:IsShown()`), "emptied: hidden again as it resizes").toBe(false);
  addon.eval(`${top}:Hide() ${top}:Show() ${top}:UpdateWidgetLayout()`);
  expect(addon.eval(`return { ${top}.__layouts, __vanguardPieces(${top}) }`), "showing again makes no second panel or hook").toEqual([2, 0]);
  addon.eval(`${top}.numWidgetsShowing = 2 ${top}:UpdateWidgetLayout() ${top}:Hide()`);
  expect(addon.eval(`return ns.FrameState('vgBackdrop')[${top}]:IsShown()`), "the container hidden with widgets in it: the panel hides with it").toBe(false);
  addon.eval(`${top}:Show()`);
  expect(addon.eval(`return ns.FrameState('vgBackdrop')[${top}]:IsShown()`), "and shows again with it").toBe(true);
});

it("S8.3 widget containers: a new backdrop is fitted once, and skinning the container again fits it again", () => {
  const addon = loggedIn(WIDGET_ENV);
  addon.eval(`fits = 0 local GW = ns.GetModule("Windows") local fit = GW.FitBackdrop
    GW.FitBackdrop = function(frame) fits = fits + 1 return fit(frame) end
    box = CreateFrame("Frame", nil, UIParent) box:SetSize(10, 10) GW.SkinWidgetBox(box)`);
  expect(addon.eval("return fits"), "a new backdrop: fitted as it is made, and not again by the skin").toBe(1);
  addon.eval('ns.GetModule("Windows").SkinWidgetBox(box)');
  expect(addon.eval("return fits"), "an existing backdrop: fitted again").toBe(2);
});

it("S8.3 widget containers: without the game's mixin the children are counted; the group off adds nothing", () => {
  const addon = loggedIn(WIDGET_ENV);
  const box = "UIWidgetBelowMinimapContainerFrame";
  expect(addon.eval(`return ns.FrameState('vgBackdrop')[${box}]:IsShown()`), "nothing in it").toBe(false);
  addon.eval(`CreateFrame("Frame", nil, ${box}) ${box}.__scripts.OnSizeChanged(${box})`);
  expect(addon.eval(`return ns.FrameState('vgBackdrop')[${box}]:IsShown()`), "a widget in it").toBe(true);
  const off = loggedIn(WIDGET_ENV, OFF);
  expect(off.eval("return ns.FrameState('vgBackdrop')[UIWidgetTopCenterContainerFrame] == nil and ns.FrameState('vgBackdrop')[UIWidgetBelowMinimapContainerFrame] == nil")).toBe(true);
});

// The match timer as the game builds it: TimerTracker with a timerList, each timer a frame holding a StatusBar
// (bar) with a backdrop and border and a time text; a START_TIMER makes another timer.
const TIMER_ENV = PVP_ENV + `
  local tt = CreateFrame("Frame", "TimerTracker", UIParent) tt.timerList = {}
  function __timer()
    local t = CreateFrame("Frame", "TimerTrackerTimer" .. (#tt.timerList + 1), tt)
    t.bar = CreateFrame("StatusBar", t:GetName() .. "StatusBar", t) t.bar.back, t.bar.border = __art(t.bar), __art(t.bar, "OVERLAY")
    t.bar.timeText = t.bar:CreateFontString() t.bar.timeText:SetFont("TEST-ONLY-FONT", 18)
    t.digit1 = __art(t, "OVERLAY")
    table.insert(tt.timerList, t) return t
  end
  __timer()
  tt:SetScript("OnEvent", function(self, event) if event == "START_TIMER" then __timer() end end)
`;

it("S8.3 the match timer: each bar in the theme as it is made, its numbers left alone", () => {
  const addon = loggedIn(TIMER_ENV);
  // The bar of the i-th timer.
  const bar = (i) => `TimerTracker.timerList[${i}].bar`;
  expect(addon.eval(`local b = ${bar(1)} local font, size = b.timeText:GetFont()
    return { b:GetStatusBarTexture():GetTexture() == ns.Theme.BarTexture(), b.back:GetAlpha(), b.border:GetAlpha(), __panel(b), font ~= "TEST-ONLY-FONT", size }`),
  "the bar there at login: theme texture, art faded, a panel, the time in the theme font at the game's size").toEqual([true, 0, 0, true, true, 18]);
  addon.eval('TimerTracker.__scripts.OnEvent(TimerTracker, "START_TIMER")');
  expect(addon.eval(`return { ${bar(2)}.border:GetAlpha(), __panel(${bar(2)}), TimerTracker.timerList[1].digit1:GetAlpha() }`), "a timer started later; the big numbers kept").toEqual([0, true, 1]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval('TimerTracker.__scripts.OnEvent(TimerTracker, "PLAYER_ENTERING_WORLD") TimerTracker:Hide() TimerTracker:Show()');
  expect([addon.eval("return #TimerTracker.timerList"), addon.eval("return ns.Theme.PaintedCount()")], "one hook, each bar once").toEqual([2, painted]);
  const bare = loggedIn('CreateFrame("Frame", "TimerTracker", UIParent).timerList = { CreateFrame("Frame") }');
  expect(windowErrors(bare), "a timer without a bar").toBe("none");
});

// The objective banner: its three texts in a large quest font, and its art.
const BANNER_ENV = PVP_ENV + `
  local b = CreateFrame("Frame", "PvPObjectiveBannerFrame", UIParent) b:Hide()
  for _, key in ipairs({ "Title", "TitleFlash", "BonusLabel" }) do b[key] = b:CreateFontString() b[key]:SetFont("TEST-ONLY-FONT", 30) end
  b.BG1 = __art(b, "BORDER")
`;

it("S8.3 the objective banner: its texts in the theme font at the game's size, its art left to its animation", () => {
  const addon = loggedIn(BANNER_ENV);
  addon.eval("PvPObjectiveBannerFrame:Show()");
  expect(addon.eval(`local out = {} for i, key in ipairs({ "Title", "TitleFlash", "BonusLabel" }) do
      local font, size = PvPObjectiveBannerFrame[key]:GetFont() out[i] = { font ~= "TEST-ONLY-FONT", size } end return out`))
    .toEqual([[true, 30], [true, 30], [true, 30]]);
  addon.eval("PvPObjectiveBannerFrame:Hide() PvPObjectiveBannerFrame:Show()");
  expect(addon.eval("local _, size = PvPObjectiveBannerFrame.Title:GetFont() return { size, PvPObjectiveBannerFrame.BG1:GetAlpha(), __panel(PvPObjectiveBannerFrame) }"),
    "shown again: the size holds; no panel, the art kept").toEqual([30, 1, false]);
  const off = loggedIn(BANNER_ENV, OFF);
  off.eval("PvPObjectiveBannerFrame:Show()");
  expect(off.eval("return (PvPObjectiveBannerFrame.Title:GetFont())"), "with the group off").toBe("TEST-ONLY-FONT");
});

// Honor tab ---------------------------------------------------------------------------------------

it("S8.4 honor tab: the rank details pane's divider faded and its scroll bar themed; a tab without the pane loads cleanly", () => {
  const addon = loggedIn(PVP_ENV + `
    local r = CreateFrame("Frame", "PVPRankFrame", UIParent) r:Hide()
    r.DetailFrame = CreateFrame("Frame", nil, r) r.DetailFrame.Divider = __art(r.DetailFrame, "BORDER")
    r.DetailFrame.DescriptionScrollBar = __scrollBar(r.DetailFrame) r.DetailFrame.Title = r.DetailFrame:CreateFontString()
  `);
  addon.eval("PVPRankFrame:Show()");
  expect(addon.eval("local d = PVPRankFrame.DetailFrame return { d.Divider:GetAlpha(), __panel(d.DescriptionScrollBar.Thumb), __panel(PVPRankFrame) }"),
    "divider faded, scroll bar themed, no panel of its own (the character pane has it)").toEqual([0, true, false]);
  const bare = loggedIn('CreateFrame("Frame", "PVPRankFrame", UIParent)');
  expect(windowErrors(bare)).toBe("none");
});
