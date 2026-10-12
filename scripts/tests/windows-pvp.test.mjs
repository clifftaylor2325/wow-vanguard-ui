// windows-pvp: the pvp group of game windows (Modules/WindowsPvP.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").
// The frames are built after Blizzard's Forever source (parentKeys and global names as the game has them).

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

// The pvp group's switch turned off in the saved variables.
const OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { pvp = false } } }" };

// Whether the addon recorded an error from the Windows module (none: "none").
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') or e.text:find('window') then return e.text end end return 'none'");

// TEST-ONLY helpers: a piece of game art (marked), a scroll bar shaped like MinimalScrollBar, and whether a
// frame has a texture of Vanguard's showing (a panel, a themed button) or what alpha a region has.
const PVP_ENV = WINDOWS_ENV + `
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
  function __match(name, content, strip, bar)
    local f = __window(name)
    local c = CreateFrame("Frame", nil, f) f[content] = c
    c.Background, c.InsetBorderTop = __art(c), __art(c, "OVERLAY")
    c.ScrollBox = CreateFrame("Frame", nil, c) c.ScrollBox.Background = __art(c.ScrollBox)
    local s = CreateFrame("Frame", nil, c) c[strip] = s s.InsetBorderTop = __art(s) s.MatchmakingText = s:CreateFontString()
    f[bar] = __scrollBar(c)
    f.__setups = 0
    function f:SetupArtwork() self.__setups = self.__setups + 1 self.__new = __art(self) end
    return f
  end
  function __matches()
    __match("PVPMatchScoreboard", "Content", "TabContainer", "ScrollBar")
    local r = __match("PVPMatchResults", "content", "tabContainer", "scrollBar")
    local e = CreateFrame("Frame", nil, r.content) r.content.earningsArt = e
    e.background, e.OrangeGlow, e.OrangeSmoke = __art(e), __art(e, "OVERLAY"), __art(e, "OVERLAY")
    r.requeueButton, r.leaveButton = CreateFrame("Button", nil, r), CreateFrame("Button", nil, r)
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
  CreateFrame("Button", "PVPReadyDialogCloseButton", d)
  CreateFrame("Button", "PVPReadyDialogEnterBattleButton", d) CreateFrame("Button", "PVPReadyDialogLeaveQueueButton", d)
  local r = __dialog("PVPRoleCheckPopup")
  r.TankIcon = CreateFrame("Button", "PVPRoleCheckPopupRoleButtonTank", r) r.TankIcon.icon = __art(r.TankIcon, "ARTWORK")
  CreateFrame("Button", "PVPRoleCheckPopupAcceptButton", r) CreateFrame("Button", "PVPRoleCheckPopupDeclineButton", r)
  local p = __dialog("PVPFramePopup") PVPFramePopupBackground = __art(p, "BORDER")
  p.ringIcon, PVPFramePopupRing = __art(p, "ARTWORK"), __art(p, "OVERLAY")
  p.minimizeButton = CreateFrame("Button", "PVPFramePopupMinimizeButton", p) __art(p.minimizeButton, "ARTWORK")
  CreateFrame("Button", "PVPFramePopupAcceptButton", p) CreateFrame("Button", "PVPFramePopupDeclineButton", p)
  local pop = CreateFrame("Frame", "PVPReadyPopup", UIParent) pop:Hide()
  local status = __dialog("ReadyStatus", pop) status:Show() status.CloseButton = CreateFrame("Button", nil, status)
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

it("S8.2 the ready popup is drawn on its ReadyStatus child; the group off leaves every dialog the game's", () => {
  const addon = loggedIn(DIALOG_ENV);
  addon.eval("PVPReadyPopup:Show()");
  expect(addon.eval("return { ReadyStatus.Border:GetAlpha(), __panel(ReadyStatus), select('#', ReadyStatus.CloseButton:GetRegions()) > 0, __panel(PVPReadyPopup) }"),
    "the child: border faded, a panel, its close button themed; the popup itself painted nothing").toEqual([0, true, true, false]);
  const off = loggedIn(DIALOG_ENV, OFF);
  off.eval("PVPReadyDialog:Show() PVPReadyPopup:Show()");
  expect(off.eval("return { PVPReadyDialog.Border:GetAlpha(), __panel(PVPReadyDialog), ReadyStatus.Border:GetAlpha(), PVPReadyDialog.vgWindow == nil }"), "with the group off").toEqual([1, false, 1, true]);
});
