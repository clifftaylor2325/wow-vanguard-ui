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

// Channels and friends dialogs -------------------------------------------------------------------------

// The channels window and the friends dialogs as the game builds them: a button-frame window, dialogs with a
// border frame, headers, named edit boxes and buttons.
const FRIENDS_ENV = DIALOG_ENV + `
  __window("ChannelFrame")
  local pop = __dialog("CreateChannelPopup")
  pop.Header = CreateFrame("Frame", nil, pop) pop.Header.Art = pop.Header:CreateTexture()
  pop.BG = CreateFrame("Frame", nil, pop) pop.BG.Art = pop.BG:CreateTexture()
  pop.Name = CreateFrame("EditBox", nil, pop) pop.Name.Art = pop.Name:CreateTexture()
  pop.Password = CreateFrame("EditBox", nil, pop) pop.OKButton = CreateFrame("Button", nil, pop) pop.OKButton.Art = pop.OKButton:CreateTexture()
  pop.CloseButton = CreateFrame("Button", nil, pop)
  local ff = __dialog("FriendsFriendsFrame")
  ff.Border = CreateFrame("Frame", nil, ff) ff.Border.Art = ff.Border:CreateTexture()
  ff.ScrollFrameBorder = CreateFrame("Frame", nil, ff) ff.ScrollFrameBorder.Art = ff.ScrollFrameBorder:CreateTexture()
  ff.FriendsDropdown = CreateFrame("Button", nil, ff) ff.FriendsDropdown.Art = ff.FriendsDropdown:CreateTexture()
  ff.SendRequestButton = CreateFrame("Button", nil, ff)
  ff.CloseButton = CreateFrame("Button", nil, ff) ff.CloseButton:SetText("Close")
  local bn = __dialog("BattleNetInviteFrame") bn.SendButton = CreateFrame("Button", nil, bn) bn.CancelButton = CreateFrame("Button", nil, bn)
  local af = __dialog("AddFriendFrame") af.Border = CreateFrame("Frame", nil, af) af.Border.Art = af.Border:CreateTexture()
  af.CloseButton = CreateFrame("Button", nil, af)
  AddFriendNameEditBox = CreateFrame("EditBox", "AddFriendNameEditBox", af) AddFriendNameEditBox.Art = AddFriendNameEditBox:CreateTexture()
  for _, n in ipairs({ "AddFriendEntryFrameAcceptButton", "AddFriendEntryFrameCancelButton" }) do
    local b = CreateFrame("Button", n, af) b.Art = b:CreateTexture()
  end
`;

it("channels and friends dialogs: the window and each dialog skinned, borders faded, edit boxes and buttons themed", () => {
  const addon = loggedIn(FRIENDS_ENV);
  addon.eval("ChannelFrame:Show()");
  expect(windowState(addon, "ChannelFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  for (const name of ["CreateChannelPopup", "FriendsFriendsFrame", "BattleNetInviteFrame", "AddFriendFrame"]) addon.eval(`${name}:Show()`);
  expect(addon.eval(`local p, f, a = CreateChannelPopup, FriendsFriendsFrame, AddFriendFrame
    return { p.Header.Art.__alpha, p.BG.Art.__alpha, p.Name.Art.__alpha, p.OKButton.Art.__alpha, f.Border.Art.__alpha, f.ScrollFrameBorder.Art.__alpha,
      f.FriendsDropdown.Art.__alpha, a.Border.Art.__alpha, AddFriendNameEditBox.Art.__alpha, AddFriendEntryFrameAcceptButton.Art.__alpha, AddFriendEntryFrameCancelButton.Art.__alpha }`),
  "the game's art faded").toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(addon.eval(`local function themed(x) for _, r in ipairs({ x:GetRegions() }) do if r.__alpha ~= 0 then return true end end return false end
    return { themed(AddFriendNameEditBox), themed(AddFriendEntryFrameAcceptButton), themed(CreateChannelPopup.Name), themed(CreateChannelPopup.OKButton),
      themed(FriendsFriendsFrame.SendRequestButton), themed(FriendsFriendsFrame.CloseButton), themed(BattleNetInviteFrame.SendButton), themed(AddFriendFrame), themed(BattleNetInviteFrame) }`),
  "edit boxes and buttons themed, each dialog panelled").toEqual([true, true, true, true, true, true, true, true, true]);
});

it("channels and friends dialogs: a second show paints nothing more, the switch off leaves them the game's, missing parts load cleanly", () => {
  const addon = loggedIn(FRIENDS_ENV);
  const names = ["ChannelFrame", "CreateChannelPopup", "FriendsFriendsFrame", "BattleNetInviteFrame", "AddFriendFrame"];
  for (const name of names) addon.eval(`${name}:Show()`);
  const painted = windowState(addon, "ChannelFrame").painted;
  for (const name of names) addon.eval(`${name}:Hide() ${name}:Show()`);
  expect(windowState(addon, "ChannelFrame").painted, "painting again piles up nothing").toBe(painted);
  const off = loggedIn(FRIENDS_ENV, OFF);
  for (const name of names) off.eval(`${name}:Show()`);
  expect(off.eval(`local n = 0 for _, name in ipairs({ ${names.map((d) => `"${d}"`).join(", ")} }) do if _G[name].vgWindow == nil then n = n + 1 end end return n`), "none hooked").toBe(5);
  const bare = loggedIn(`AddFriendFrame = CreateFrame("Frame", "AddFriendFrame", UIParent) AddFriendNameEditBox = {} AddFriendEntryFrameAcceptButton = {}`);
  bare.eval("AddFriendFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "a client without the dialog's named parts").toEqual(["none", 0]);
});

// Guild creation ---------------------------------------------------------------------------------------

// The registrar, petition and tabard windows with their texts, buttons and game functions (the functions
// recolor the texts dark, as the game does for its parchment).
const CREATION_ENV = WINDOWS_ENV + `
  for _, n in ipairs({ "GuildRegistrarFrame", "PetitionFrame", "TabardFrame" }) do __window(n) end
  GuildRegistrarFrame.Bg = GuildRegistrarFrame:CreateTexture()
  __texts = { "GuildRegistrarText", "GuildRegistrarPurchaseText", "PetitionFrameCharterName", "PetitionFrameCharterTitle", "PetitionFrameMemberTitle", "PetitionFrameMemberName3" }
  for _, n in ipairs(__texts) do _G[n] = PetitionFrame:CreateFontString(n, "ARTWORK") end
  for _, n in ipairs({ "GuildRegistrarFrameGoodbyeButton", "GuildRegistrarFramePurchaseButton", "PetitionFrameSignButton", "TabardFrameAcceptButton" }) do
    local b = CreateFrame("Button", n, UIParent) b.Art = b:CreateTexture()
  end
  GuildRegistrarFrameEditBox = CreateFrame("EditBox", "GuildRegistrarFrameEditBox", GuildRegistrarFrame) GuildRegistrarFrameEditBox.Art = GuildRegistrarFrameEditBox:CreateTexture()
  __redraws = 0
  function __dark() for _, n in ipairs(__texts) do _G[n]:SetTextColor(0.2, 0.1, 0) end end
  function GuildRegistrar_OnShow() __redraws = __redraws + 1 __dark() end
  function PetitionFrame_Update() __redraws = __redraws + 1 __dark() end
`;

// The creation windows' names.
const CREATION = ["GuildRegistrarFrame", "PetitionFrame", "TabardFrame"];

it("guild creation: the three windows skinned, their texts light and gold, again after the game recolors them", () => {
  const addon = loggedIn(CREATION_ENV);
  for (const name of CREATION) {
    addon.eval(`${name}:Show()`);
    expect(windowState(addon, name), name).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  }
  expect(addon.eval("return GuildRegistrarFrame.Bg.__alpha"), "the parchment faded").toBe(0);
  // Whether a font string wears the theme color token (r, g, b of the text color).
  const color = (n) => addon.eval(`local c = ${n}.__textColor return { c[1], c[2], c[3] }`);
  const text = addon.eval('return { ns.Theme.RGB("text") }').slice(0, 3);
  const gold = addon.eval('return { ns.Theme.RGB("gold") }').slice(0, 3);
  expect(color("GuildRegistrarText"), "registrar text light").toEqual(text);
  expect(color("PetitionFrameCharterTitle"), "petition headings gold").toEqual(gold);
  addon.eval("GuildRegistrar_OnShow() PetitionFrame_Update()");
  expect([color("GuildRegistrarPurchaseText"), color("PetitionFrameMemberTitle"), color("PetitionFrameMemberName3")], "light again after the game's redraw").toEqual([text, gold, text]);
  expect(addon.eval("return __redraws"), "the game's functions still run").toBe(2);
  expect(addon.eval(`local function themed(x) for _, r in ipairs({ x:GetRegions() }) do if r.__alpha ~= 0 then return true end end return false end
    return { GuildRegistrarFrameGoodbyeButton.Art.__alpha, PetitionFrameSignButton.Art.__alpha, TabardFrameAcceptButton.Art.__alpha, GuildRegistrarFrameEditBox.Art.__alpha,
      themed(GuildRegistrarFramePurchaseButton), themed(GuildRegistrarFrameEditBox) }`), "buttons and the name box themed").toEqual([0, 0, 0, 0, true, true]);
});

it("guild creation: a second show paints nothing more, the switch off leaves them the game's, a client without the texts loads cleanly", () => {
  const addon = loggedIn(CREATION_ENV);
  for (const name of CREATION) addon.eval(`${name}:Show()`);
  const painted = windowState(addon, "PetitionFrame").painted;
  for (const name of CREATION) addon.eval(`${name}:Hide() ${name}:Show()`);
  addon.eval("PetitionFrame_Update()");
  expect(windowState(addon, "PetitionFrame").painted, "painting again piles up nothing").toBe(painted);
  const off = loggedIn(CREATION_ENV, OFF);
  for (const name of CREATION) off.eval(`${name}:Show()`);
  off.eval("PetitionFrame_Update()");
  expect(off.eval("return { GuildRegistrarFrame.vgWindow == nil, PetitionFrameCharterTitle.__textColor[1] }"), "left the game's, its texts dark").toEqual([true, 0.2]);
  const bare = loggedIn(WINDOWS_ENV + `__window("PetitionFrame") __window("TabardFrame") GuildRegistrarFrameEditBox = {}`);
  bare.eval("PetitionFrame:Show() TabardFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "no texts, no game functions, no buttons").toEqual(["none", 0]);
});
