// windows-social: the social group of game windows (Modules/WindowsSocial.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

// The social group's switch turned off in the saved variables.
const OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" };

// Whether the addon recorded an error from the Windows module (none: "none").
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'");

it("the social group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.social"), "its switch is on by default").toBe(true);
  expect(windowErrors(addon)).toBe("none");
});

// Open mail ---------------------------------------------------------------------------------------

// A letter window the way the game builds it: stationery, a SimpleHTML-like body, push and item buttons.
const MAIL_ENV = WINDOWS_ENV + `
  __window("OpenMailFrame")
  OpenMailFrame.ReportSpamButton = CreateFrame("Button", "OpenMailReportSpamButton", OpenMailFrame)
  for _, n in ipairs({ "Reply", "Delete", "Cancel" }) do CreateFrame("Button", "OpenMail" .. n .. "Button", OpenMailFrame) end
  OpenStationeryBackgroundLeft = OpenMailFrame:CreateTexture() OpenStationeryBackgroundRight = OpenMailFrame:CreateTexture()
  OpenMailBodyText = { __colors = {}, SetTextColor = function(self, tag, r, g, b) self.__colors[tag] = { r, g, b } end }
  for _, n in ipairs({ "OpenMailLetterButton", "OpenMailMoneyButton", "OpenMailAttachmentButton1" }) do
    local b = CreateFrame("Button", n, OpenMailFrame) b.icon = b:CreateTexture() b.IconBorder = b:CreateTexture()
  end
  __updates = 0
  function OpenMailFrame:Update() __updates = __updates + 1 OpenStationeryBackgroundLeft:SetAlpha(1) OpenMailBodyText.__colors = {} end
`;

it("open mail: the letter window in the theme, its stationery faded, body text light, buttons and items dressed", () => {
  const addon = loggedIn(MAIL_ENV);
  addon.eval("OpenMailFrame:Show()");
  expect(windowState(addon, "OpenMailFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(addon.eval("return { OpenStationeryBackgroundLeft.__alpha, OpenStationeryBackgroundRight.__alpha }"), "the parchment faded").toEqual([0, 0]);
  expect(addon.eval(`local c = OpenMailBodyText.__colors
    return { c.P ~= nil and c.P[1] == ns.Theme.RGB("text"), c.H1 ~= nil and c.H1[1] == ns.Theme.RGB("gold") }`), "body light, headings gold").toEqual([true, true]);
  expect(addon.eval(`local n = 0 for _, name in ipairs({ "OpenMailReplyButton", "OpenMailReportSpamButton" }) do
      if select('#', _G[name]:GetRegions()) > 0 then n = n + 1 end end return n`), "its buttons themed").toBe(2);
  expect(addon.eval("return { OpenMailLetterButton.vgSkinned, OpenMailMoneyButton.vgSkinned, OpenMailAttachmentButton1.vgSkinned }"), "the item buttons get the bags' border").toEqual([true, true, true]);
});

it("open mail: a redraw puts the look back, a second show paints nothing more, the switch off leaves the game's", () => {
  const addon = loggedIn(MAIL_ENV);
  addon.eval("OpenMailFrame:Show()");
  const painted = windowState(addon, "OpenMailFrame").painted;
  addon.eval("OpenMailFrame:Update()");
  expect(addon.eval("return { __updates, OpenStationeryBackgroundLeft.__alpha, OpenMailBodyText.__colors.P ~= nil }"), "after Update: faded and light again").toEqual([1, 0, true]);
  addon.eval("OpenMailFrame:Hide() OpenMailFrame:Show() OpenMailFrame:Update()");
  expect(windowState(addon, "OpenMailFrame").painted, "painting again piles up nothing").toBe(painted);
  expect(addon.eval("OpenMailFrame:Update() return __updates"), "the hook went on once, the game's call still runs").toBe(3);
  const off = loggedIn(MAIL_ENV, OFF);
  off.eval("OpenMailFrame:Show()");
  expect([windowState(off, "OpenMailFrame").art !== 0, off.eval("return OpenMailFrame.vgWindow == nil and OpenStationeryBackgroundLeft.__alpha ~= 0")], "with the group off").toEqual([true, true]);
});

it("open mail: a client without the body text, the stationery, the items or the Update method loads cleanly", () => {
  const addon = loggedIn(WINDOWS_ENV + `__window("OpenMailFrame")`);
  addon.eval("OpenMailFrame:Show()");
  expect(windowState(addon, "OpenMailFrame").panel).toBe(true);
  const odd = loggedIn(WINDOWS_ENV + `__window("OpenMailFrame") OpenMailBodyText = {} OpenMailLetterButton = {}`);
  odd.eval("OpenMailFrame:Show()");
  expect([windowErrors(addon), windowErrors(odd), addon.eval("return #ns.errors")], "no errors").toEqual(["none", "none", 0]);
});

// Guild window -------------------------------------------------------------------------------------

// The guild window the way the game builds it: portrait overlay, panes with inset frames, a stream dropdown, a max/min pair.
const GUILD_ENV = WINDOWS_ENV + `
  local f = __window("CommunitiesFrame")
  f.PortraitOverlay = CreateFrame("Frame", nil, f) f.PortraitOverlay.Emblem = f.PortraitOverlay:CreateTexture()
  for _, key in ipairs({ "CommunitiesList", "MemberList", "Chat" }) do
    local pane = CreateFrame("Frame", nil, f) pane.Art = pane:CreateTexture() f[key] = pane
    pane.InsetFrame = CreateFrame("Frame", nil, pane) pane.InsetFrame.Bg = pane.InsetFrame:CreateTexture()
    pane.InsetFrame.NineSlice = CreateFrame("Frame", nil, pane.InsetFrame) pane.InsetFrame.NineSlice.Edge = pane.InsetFrame.NineSlice:CreateTexture()
  end
  for _, key in ipairs({ "GuildBenefitsFrame", "GuildDetailsFrame" }) do
    local pane = CreateFrame("Frame", nil, f) pane.Art = pane:CreateTexture() f[key] = pane
  end
  f.MaximizeMinimizeFrame = CreateFrame("Frame", nil, f)
  f.MaximizeMinimizeFrame.MaximizeButton = CreateFrame("Button", nil, f.MaximizeMinimizeFrame)
  f.MaximizeMinimizeFrame.MinimizeButton = CreateFrame("Button", nil, f.MaximizeMinimizeFrame)
  f.StreamDropdown = CreateFrame("Button", nil, f) f.StreamDropdown.Arrow = f.StreamDropdown:CreateTexture()
  __modes = 0
  function f:SetDisplayMode() __modes = __modes + 1 f.CommunitiesList.Art:SetAlpha(1) end
`;

it("guild window: panes faded and panelled, portrait art faded, dropdown and max/min dressed, skinned again on a page switch", () => {
  const addon = loggedIn(GUILD_ENV);
  addon.eval("CommunitiesFrame:Show()");
  expect(windowState(addon, "CommunitiesFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(addon.eval(`local f = CommunitiesFrame
    return { f.PortraitOverlay.Emblem.__alpha, f.CommunitiesList.Art.__alpha, f.CommunitiesList.InsetFrame.Bg.__alpha, f.MemberList.InsetFrame.NineSlice.Edge.__alpha,
      f.Chat.InsetFrame.Bg.__alpha, f.GuildBenefitsFrame.Art.__alpha, f.GuildDetailsFrame.Art.__alpha, f.StreamDropdown.Arrow.__alpha }`), "the game's art faded").toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect(addon.eval(`local f = CommunitiesFrame
    local function painted(x) for _, r in ipairs({ x:GetRegions() }) do if r.__alpha ~= 0 then return true end end return false end
    return { painted(f.CommunitiesList.InsetFrame), painted(f.MemberList.InsetFrame), painted(f.GuildBenefitsFrame), painted(f.StreamDropdown),
      painted(f.MaximizeMinimizeFrame.MaximizeButton), painted(f.MaximizeMinimizeFrame.MinimizeButton) }`), "inset panels, a themed dropdown and flat max/min buttons").toEqual([true, true, true, true, true, true]);
  addon.eval("CommunitiesFrame:SetDisplayMode(2)");
  expect(addon.eval("return { __modes, CommunitiesFrame.CommunitiesList.Art.__alpha }"), "a page switch is skinned again").toEqual([1, 0]);
});

it("guild window: a second show paints nothing more, the switch off leaves the game's, missing parts load cleanly", () => {
  const addon = loggedIn(GUILD_ENV);
  addon.eval("CommunitiesFrame:Show()");
  const painted = windowState(addon, "CommunitiesFrame").painted;
  addon.eval("CommunitiesFrame:Hide() CommunitiesFrame:Show() CommunitiesFrame:SetDisplayMode(3)");
  expect(windowState(addon, "CommunitiesFrame").painted, "painting again piles up nothing").toBe(painted);
  const off = loggedIn(GUILD_ENV, OFF);
  off.eval("CommunitiesFrame:Show()");
  expect([windowState(off, "CommunitiesFrame").art !== 0, off.eval("return CommunitiesFrame.vgWindow == nil")], "with the group off").toEqual([true, true]);
  const bare = loggedIn(WINDOWS_ENV + `__window("CommunitiesFrame") CommunitiesFrame.Chat = {} CommunitiesFrame.StreamDropdown = {} CommunitiesFrame.MaximizeMinimizeFrame = {}
    CommunitiesFrame.MemberList = CreateFrame("Frame", nil, CommunitiesFrame) CommunitiesFrame.MemberList.InsetFrame = {}`);
  bare.eval("CommunitiesFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "a client with parts missing").toEqual(["none", 0]);
});

// Guild dialogs --------------------------------------------------------------------------------------

// Builds the guild dialogs as the game has them: translucent frames (a NineSlice, Bg), a log with a text "Close"
// button named like a close button, a settings dialog with a dark border frame, edit boxes and push buttons.
const DIALOG_ENV = WINDOWS_ENV + `
  function __dialog(name)
    local f = CreateFrame("Frame", name, UIParent)
    f.Bg = f:CreateTexture() f.NineSlice = CreateFrame("Frame", nil, f) f.NineSlice.Edge = f.NineSlice:CreateTexture()
    f.Title = f:CreateFontString(nil, "ARTWORK")
    f:Hide()
    return f
  end
  local log = __dialog("CommunitiesGuildLogFrame")
  local text = CreateFrame("Button", "CommunitiesGuildLogFrameCloseButton", log) text:SetText("Close")
  local news = __dialog("CommunitiesGuildNewsFiltersFrame") news.CloseButton = CreateFrame("Button", nil, news)
  __dialog("CommunitiesGuildTextEditFrame") CreateFrame("Button", "CommunitiesGuildTextEditFrameAcceptButton", CommunitiesGuildTextEditFrame)
  __dialog("GuildInviteFrame")
  local set = __dialog("CommunitiesSettingsDialog")
  set.BG = CreateFrame("Frame", nil, set) set.BG.Edge = set.BG:CreateTexture() set.BG.NineSlice = CreateFrame("Frame", nil, set.BG) set.BG.NineSlice.Edge = set.BG.NineSlice:CreateTexture()
  set.NameEdit = CreateFrame("EditBox", nil, set) set.NameEdit.Art = set.NameEdit:CreateTexture()
  for _, k in ipairs({ "Accept", "Cancel", "Delete" }) do set[k] = CreateFrame("Button", nil, set) set[k].Art = set[k]:CreateTexture() end
  __dialog("CommunitiesAvatarPickerDialog")
  __dialog("CommunitiesTicketManagerDialog").Close = CreateFrame("Button", nil, CommunitiesTicketManagerDialog)
  __window("GuildRenameFrame")
`;

// The names of the guild dialogs.
const DIALOGS = ["CommunitiesGuildLogFrame", "CommunitiesGuildNewsFiltersFrame", "CommunitiesGuildTextEditFrame", "GuildInviteFrame",
  "CommunitiesSettingsDialog", "CommunitiesAvatarPickerDialog", "CommunitiesTicketManagerDialog"];

it("guild dialogs: every dialog's art faded and a panel painted, its buttons, boxes and close control themed", () => {
  const addon = loggedIn(DIALOG_ENV);
  for (const name of DIALOGS) {
    addon.eval(`${name}:Show()`);
    expect(addon.eval(`local f = ${name}
      local panel = false for _, r in ipairs({ f:GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 and r ~= f.Bg then panel = true end end
      return { f.Bg.__alpha, f.NineSlice.Edge.__alpha, panel, f.Title:GetFont() ~= nil }`), `${name} dressed`).toEqual([0, 0, true, true]);
  }
  expect(addon.eval(`local s = CommunitiesSettingsDialog
    local function themed(x) for _, r in ipairs({ x:GetRegions() }) do if r.__alpha ~= 0 then return true end end return false end
    return { s.BG.Edge.__alpha, s.BG.NineSlice.Edge.__alpha, s.NameEdit.Art.__alpha, s.Accept.Art.__alpha, s.Cancel.Art.__alpha, s.Delete.Art.__alpha,
      themed(s.Accept), themed(s.NameEdit), themed(CommunitiesGuildTextEditFrameAcceptButton), themed(CommunitiesTicketManagerDialog.Close) }`),
  "the dark border, boxes and buttons").toEqual([0, 0, 0, 0, 0, 0, true, true, true, true]);
  expect(addon.eval(`local function glyph(b) for _, r in ipairs({ b:GetRegions() }) do if r.__texture and tostring(r.__texture):find("Close") then return true end end return false end
    return { glyph(CommunitiesGuildLogFrameCloseButton), glyph(CommunitiesGuildNewsFiltersFrame.CloseButton) }`),
  "a text Close button stays a text button, an X button gets the close glyph").toEqual([false, true]);
});

it("guild dialogs: the rename window is skinned like any window; a second show paints nothing more; the switch off leaves them the game's", () => {
  const addon = loggedIn(DIALOG_ENV);
  addon.eval("GuildRenameFrame:Show()");
  expect(windowState(addon, "GuildRenameFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  for (const name of DIALOGS) addon.eval(`${name}:Show()`);
  const painted = windowState(addon, "GuildRenameFrame").painted;
  for (const name of DIALOGS) addon.eval(`${name}:Hide() ${name}:Show()`);
  expect(windowState(addon, "GuildRenameFrame").painted, "painting again piles up nothing").toBe(painted);
  const off = loggedIn(DIALOG_ENV, OFF);
  for (const name of [...DIALOGS, "GuildRenameFrame"]) off.eval(`${name}:Show()`);
  expect(off.eval(`local n = 0 for _, name in ipairs({ ${DIALOGS.map((d) => `"${d}"`).join(", ")} }) do if _G[name].vgWindow == nil and (_G[name].Bg.__alpha or 1) ~= 0 then n = n + 1 end end return n`), "all seven untouched").toBe(7);
});

it("guild dialogs: a client without them, or with their parts missing, loads cleanly", () => {
  const bare = loggedIn("");
  const odd = loggedIn(`CommunitiesSettingsDialog = CreateFrame("Frame", "CommunitiesSettingsDialog", UIParent) CommunitiesSettingsDialog.BG = {} CommunitiesSettingsDialog.Accept = {}
    CommunitiesSettingsDialog.Title = {} CommunitiesSettingsDialog.NameEdit = {} CommunitiesSettingsDialogCloseButton = {} CommunitiesSettingsDialogAcceptButton = {}`);
  odd.eval("CommunitiesSettingsDialog:Show()");
  expect([windowErrors(bare), windowErrors(odd), odd.eval("return #ns.errors")]).toEqual(["none", "none", 0]);
});
