// windows-social: the social group of game windows (Modules/WindowsSocial.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { WINDOWS_ENV, isTok, loggedIn, setCombat, windowState } from "./helpers.mjs";

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
  expect(addon.eval("return { ns.FrameState('vgSkinned')[OpenMailLetterButton], ns.FrameState('vgSkinned')[OpenMailMoneyButton], ns.FrameState('vgSkinned')[OpenMailAttachmentButton1] }"), "the item buttons get the bags' border").toEqual([true, true, true]);
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
  expect([windowState(off, "OpenMailFrame").art !== 0, off.eval("return ns.FrameState('vgWindow')[OpenMailFrame] == nil and OpenStationeryBackgroundLeft.__alpha ~= 0")], "with the group off").toEqual([true, true]);
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
  expect(addon.eval(`local box = CommunitiesFrame.MaximizeMinimizeFrame
    local function glyph(b) for _, r in ipairs({ b:GetRegions() }) do if r.__layer == "OVERLAY" then return r.__texture:match("(%a+)$") end end end
    return { glyph(box.MaximizeButton), glyph(box.MinimizeButton) }`), "the max/min buttons draw the theme's Maximize and Minimize glyphs").toEqual(["Maximize", "Minimize"]);
  addon.eval("CommunitiesFrame:SetDisplayMode(2)");
  expect(addon.eval("return { __modes, CommunitiesFrame.CommunitiesList.Art.__alpha }"), "a page switch is skinned again").toEqual([1, 0]);
});

it("guild window: the fill goes under the rows and the inset above them keeps only its border", () => {
  const addon = loggedIn(GUILD_ENV);
  addon.eval(`for _, key in ipairs({ "CommunitiesList", "MemberList", "Chat" }) do
    local pane = CommunitiesFrame[key] pane:SetFrameLevel(5) pane.InsetFrame:SetFrameLevel(100)
    pane.Rows = CreateFrame("Frame", nil, pane) pane.Rows:SetFrameLevel(6)
  end CommunitiesFrame:Show()`);
  expect(addon.eval(`local out, T = {}, ns.Theme
    for _, key in ipairs({ "CommunitiesList", "MemberList", "Chat" }) do
      local pane = CommunitiesFrame[key]
      local fill = ns.FrameState("vgInsetFill")[pane.InsetFrame]
      local function textures(f) local n = 0 for _, r in ipairs({ f:GetRegions() }) do if r.__alpha ~= 0 then n = n + 1 end end return n end
      out[#out + 1] = { fill ~= nil and fill:GetFrameLevel() < pane.Rows:GetFrameLevel(), fill:GetParent() == pane, textures(fill) == 1, textures(pane.InsetFrame) == 4 }
    end
    return out`), "the fill is below the rows (one texture), the inset has its four border lines and no fill").toEqual(Array(3).fill([true, true, true, true]));
  addon.eval("CommunitiesFrame:Hide() CommunitiesFrame:Show() CommunitiesFrame:SetDisplayMode(2)");
  expect(addon.eval("return { select('#', CommunitiesFrame.MemberList:GetChildren()) }"), "again makes no second fill").toEqual([3]);
});

it("guild window: a second show paints nothing more, the switch off leaves the game's, missing parts load cleanly", () => {
  const addon = loggedIn(GUILD_ENV);
  addon.eval("CommunitiesFrame:Show()");
  const painted = windowState(addon, "CommunitiesFrame").painted;
  addon.eval("CommunitiesFrame:Hide() CommunitiesFrame:Show() CommunitiesFrame:SetDisplayMode(3)");
  expect(windowState(addon, "CommunitiesFrame").painted, "painting again piles up nothing").toBe(painted);
  const off = loggedIn(GUILD_ENV, OFF);
  off.eval("CommunitiesFrame:Show()");
  expect([windowState(off, "CommunitiesFrame").art !== 0, off.eval("return ns.FrameState('vgWindow')[CommunitiesFrame] == nil")], "with the group off").toEqual([true, true]);
  const bare = loggedIn(WINDOWS_ENV + `__window("CommunitiesFrame") CommunitiesFrame.Chat = {} CommunitiesFrame.StreamDropdown = {} CommunitiesFrame.MaximizeMinimizeFrame = {}
    CommunitiesFrame.MemberList = CreateFrame("Frame", nil, CommunitiesFrame) CommunitiesFrame.MemberList.InsetFrame = {}`);
  bare.eval("CommunitiesFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "a client with parts missing").toEqual(["none", 0]);
});

// The guild window's pages as Blizzard_Communities builds them: the roster (rows take their methods from
// CommunitiesMemberListEntryMixin, which greys an offline member and sets a Rank cell to 75 on every layout; a
// ColumnDisplay lays out headers from the column table), the Guild Info page's Guild Information box (filled by
// CommunitiesGuildInfoFrame_UpdateText), and the Preferred Play Settings page with its Apply buttons (enabled by
// RefreshState only for the guild master). One row is made before login, as a roster shown already would have.
const PAGES_ENV = GUILD_ENV + `
  Enum.ClubMemberPresence = { Online = 1, Offline = 3 }
  __GUILD_COLUMNS = { { attribute = "level", width = 40 }, { attribute = "classID", width = 45 }, { attribute = "name", width = 100 },
    { attribute = "zone", width = 100 }, { attribute = "guildRankOrder", width = 85 }, { attribute = "memberNote", width = 0 } }
  __CLUB_COLUMNS = { { attribute = "name", width = 145 }, { attribute = "role", width = 85 }, { attribute = "memberNote", width = 0 } }
  local f, list = CommunitiesFrame, CommunitiesFrame.MemberList
  CommunitiesMemberListEntryMixin = {}
  function CommunitiesMemberListEntryMixin:UpdatePresence()
    local off = Enum.ClubMemberPresence and Enum.ClubMemberPresence.Offline
    local c = self.memberInfo and off ~= nil and self.memberInfo.presence == off and 0.5 or 1
    for _, fs in ipairs({ self.NameFrame.Name, self.Level, self.Zone, self.Rank, self.Note, self.GuildInfo }) do fs:SetTextColor(c, c, c) end
  end
  function CommunitiesMemberListEntryMixin:RefreshExpandedColumns() if self.Rank.SetWidth then self.Rank:SetWidth(75) end end
  function CommunitiesMemberListEntryMixin:GetMemberList() return list end
  list.columnInfo = __GUILD_COLUMNS
  list.ScrollBox = { rows = {} }
  function list.ScrollBox:ForEachFrame(fn) for _, row in ipairs(self.rows) do fn(row) end end
  function __row(presence)
    local row = CreateFrame("Button", nil, list)
    for k, v in pairs(CommunitiesMemberListEntryMixin) do row[k] = v end
    row.NameFrame = CreateFrame("Frame", nil, row) row.NameFrame.Name = row.NameFrame:CreateFontString()
    for _, k in ipairs({ "Level", "Zone", "Rank", "Note", "GuildInfo" }) do row[k] = row:CreateFontString() end
    row.memberInfo, row.expanded = { presence = presence }, true
    row.Note:SetWidth(93)
    table.insert(list.ScrollBox.rows, row)
    return row
  end
  __early = __row(Enum.ClubMemberPresence.Offline)
  local display = CreateFrame("Frame", nil, list) list.ColumnDisplay = display
  display.columnHeaders = { active = {} }
  function display.columnHeaders:EnumerateActive() return pairs(self.active) end
  function display:LayoutColumns(columns)
    self.columnHeaders.active = {}
    for i, info in ipairs(columns) do
      local header = CreateFrame("Button", nil, self) header:SetWidth(info.width) header:SetID(i)
      self.columnHeaders.active[header] = true
    end
  end
  function __header(id) for h in pairs(list.ColumnDisplay.columnHeaders.active) do if h:GetID() == id then return h:GetWidth() end end end

  local info = CreateFrame("Frame", nil, f.GuildDetailsFrame) f.GuildDetailsFrame.Info = info
  info.DetailsFrame = CreateFrame("ScrollFrame", nil, info)
  local child = CreateFrame("Frame", nil, info.DetailsFrame) info.DetailsFrame:SetScrollChild(child)
  child.Details = child:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  __infoText = ""
  function CommunitiesGuildInfoFrame_UpdateText(self, infoText) self.DetailsFrame:GetScrollChild().Details:SetText(infoText or __infoText) end

  local page = CreateFrame("Frame", "CommunitiesFrameGuildPreferredPlaySettingsFrame", f) f.GuildPreferredPlaySettingsFrame = page
  for _, k in ipairs({ "LocaleApplyButton", "DatacenterApplyButton" }) do page[k] = CreateFrame("Button", nil, page) page[k].Art = page[k]:CreateTexture() page[k]:SetFontString(page[k]:CreateFontString()) end
  __leader = false
  function page:RefreshState() for _, b in ipairs({ self.LocaleApplyButton, self.DatacenterApplyButton }) do if __leader then b:Enable() else b:Disable() end end end
`;

// A roster row's text colors, as { name, level, zone, rank, note, guildInfo } red values (rounded to 0.01).
const rowColors = (addon, row) => addon.eval(`local r = ${row} local out = {}
  for _, fs in ipairs({ r.NameFrame.Name, r.Level, r.Zone, r.Rank, r.Note, r.GuildInfo }) do out[#out + 1] = math.floor(fs.__textColor[1] * 100 + 0.5) / 100 end
  return out`);

it("guild roster: the Rank column wider (header and cells), the Note column giving the room, on rows made before and after", () => {
  const addon = loggedIn(PAGES_ENV);
  addon.eval("CommunitiesFrame:Show() CommunitiesFrame.MemberList.ColumnDisplay:LayoutColumns(__GUILD_COLUMNS)");
  expect(addon.eval("return { __header(5), __header(4), __header(6) }"), "the Rank header 85 + 40; the others the game's").toEqual([125, 100, 0]);
  addon.eval("__late = __row(Enum.ClubMemberPresence.Online) __early:RefreshExpandedColumns() __late:RefreshExpandedColumns()");
  expect(addon.eval("return { __early.Rank:GetWidth(), __late.Rank:GetWidth(), __late.Note:GetWidth() }"), "both rows' Rank cells 75 + 40; a filling note left alone").toEqual([115, 115, 93]);
  addon.eval("__late.guildColumnIndex = 2 __late:RefreshExpandedColumns()");
  expect(addon.eval("return __late.Note:GetWidth()"), "beside an extra column, the fixed note 93 - 40").toBe(53);
  addon.eval("CommunitiesFrame:SetDisplayMode(2) __late:RefreshExpandedColumns()");
  expect(addon.eval("return __late.Rank:GetWidth()"), "a page switch hooks no row twice").toBe(115);
});

it("guild roster: other clubs' columns, the chat-side list and a client without the parts keep the game's widths", () => {
  const addon = loggedIn(PAGES_ENV);
  addon.eval(`CommunitiesFrame:Show() CommunitiesFrame.MemberList.ColumnDisplay:LayoutColumns(__CLUB_COLUMNS)
    CommunitiesFrame.MemberList.columnInfo = __CLUB_COLUMNS __early:RefreshExpandedColumns()`);
  expect(addon.eval("return { __header(2), __early.Rank:GetWidth() }"), "a community's roster").toEqual([85, 75]);
  addon.eval("CommunitiesFrame.MemberList.columnInfo = nil __early:RefreshExpandedColumns()");
  expect(addon.eval("return __early.Rank:GetWidth()"), "no column table").toBe(75);
  addon.eval("CommunitiesFrame.MemberList.columnInfo = __GUILD_COLUMNS __early.expanded = false __early:RefreshExpandedColumns()");
  expect(addon.eval("return __early.Rank:GetWidth()"), "the collapsed list beside chat").toBe(75);
  addon.eval(`CommunitiesFrame.MemberList.ColumnDisplay.columnHeaders = {} CommunitiesFrame.MemberList.ColumnDisplay:LayoutColumns(__GUILD_COLUMNS)
    __early.expanded = true __early.Rank, __early.Note, __early.guildColumnIndex = {}, {}, 1 __early:RefreshExpandedColumns()`);
  expect([windowErrors(addon), addon.eval("return #ns.errors")], "a header pool or cells it can't size").toEqual(["none", 0]);
});

it("guild roster: an offline member's row in the theme's secondary text, an online row left as the game colors it", () => {
  const addon = loggedIn(PAGES_ENV);
  addon.eval("CommunitiesFrame:Show() __late = __row(Enum.ClubMemberPresence.Online) __early:UpdatePresence() __late:UpdatePresence()");
  const text2 = addon.eval("return math.floor(select(1, ns.Theme.RGB('text2')) * 100 + 0.5) / 100");
  expect(rowColors(addon, "__early"), "offline: every text the game greys, lighter").toEqual([text2, text2, text2, text2, text2, text2]);
  expect(text2, "lighter than the game's grey").toBeGreaterThan(0.5);
  expect(rowColors(addon, "__late"), "online: the game's").toEqual([1, 1, 1, 1, 1, 1]);
  addon.eval("__early.memberInfo = nil __early:UpdatePresence() __late.NameFrame = nil __late.memberInfo.presence = Enum.ClubMemberPresence.Offline __late.UpdatePresence = function() end");
  expect(rowColors(addon, "__early"), "a header row (no member) keeps the game's").toEqual([1, 1, 1, 1, 1, 1]);
  const noEnum = loggedIn(PAGES_ENV + "Enum.ClubMemberPresence = nil");
  noEnum.eval("CommunitiesFrame:Show() __early.memberInfo.presence = nil __early:UpdatePresence()");
  expect([rowColors(noEnum, "__early")[0], windowErrors(noEnum), noEnum.eval("return #ns.errors")], "a client without the presence enum").toEqual([1, "none", 0]);
});

it("guild info: a note in the empty Guild Information box, gone when the game fills it, back when it is emptied", () => {
  const addon = loggedIn(PAGES_ENV);
  addon.eval("CommunitiesFrame:Show()");
  const note = "ns.FrameState('vgEmptyNote')[CommunitiesFrame.GuildDetailsFrame.Info]";
  expect(addon.eval(`return { ${note}:GetText(), ${note}:IsShown(), ${note}:GetFont() ~= nil }`), "shown while the game has drawn nothing").toEqual(["No guild information yet.", true, true]);
  addon.eval("CommunitiesGuildInfoFrame_UpdateText(CommunitiesFrame.GuildDetailsFrame.Info, 'Raids on Tuesday')");
  expect(addon.eval(`return ${note}:IsShown()`), "hidden once the guild has information").toBe(false);
  addon.eval("CommunitiesGuildInfoFrame_UpdateText(CommunitiesFrame.GuildDetailsFrame.Info)");
  expect(addon.eval(`return ${note}:IsShown()`), "back when the information is emptied").toBe(true);
  addon.eval("CommunitiesFrame:Hide() CommunitiesFrame:Show()");
  expect(addon.eval("local n = 0 for _, r in ipairs({ CommunitiesFrame.GuildDetailsFrame.Info.DetailsFrame:GetScrollChild():GetRegions() }) do n = n + 1 end return n"), "made once").toBe(2);
});

it("preferred play settings: the page panelled, its Apply buttons flat and in the disabled look while the game disables them", () => {
  const addon = loggedIn(PAGES_ENV);
  addon.eval("CommunitiesFrame:Show()");
  const page = "CommunitiesFrame.GuildPreferredPlaySettingsFrame";
  expect(addon.eval(`local function painted(x) for _, r in ipairs({ x:GetRegions() }) do if r.__alpha ~= 0 then return true end end return false end
    return { painted(${page}), painted(${page}.LocaleApplyButton), ${page}.LocaleApplyButton.Art.__alpha, ${page}.DatacenterApplyButton.Art.__alpha }`),
  "an inset panel behind the page, flat buttons").toEqual([true, true, 0, 0]);
  // Each Apply button's label in the disabled tier, and its alpha (left alone: the flat button's own look).
  const dimmed = () => ["LocaleApplyButton", "DatacenterApplyButton"].map((k) =>
    [isTok(addon, addon.eval(`return ${page}.${k}:GetFontString().__textColor`), "disabled"), addon.eval(`return ${page}.${k}:GetAlpha()`)]);
  expect(dimmed(), "enabled: the normal look").toEqual([[false, 1], [false, 1]]);
  addon.eval(`${page}:RefreshState()`);
  expect(dimmed(), "not the guild master: the disabled look").toEqual([[true, 1], [true, 1]]);
  addon.eval(`__leader = true ${page}:RefreshState()`);
  expect(dimmed(), "the guild master: the normal look again").toEqual([[false, 1], [false, 1]]);
});

it("guild pages: with the group off the roster, info box and settings page stay the game's", () => {
  const off = loggedIn(PAGES_ENV, OFF);
  off.eval("CommunitiesFrame:Show() CommunitiesFrame.MemberList.ColumnDisplay:LayoutColumns(__GUILD_COLUMNS) __early:RefreshExpandedColumns() __early:UpdatePresence()");
  off.eval("CommunitiesFrame.GuildPreferredPlaySettingsFrame:RefreshState()");
  expect(off.eval(`return { __header(5), __early.Rank:GetWidth(), ns.FrameState('vgEmptyNote')[CommunitiesFrame.GuildDetailsFrame.Info] == nil,
    CommunitiesFrame.GuildPreferredPlaySettingsFrame.LocaleApplyButton:GetAlpha() }`)).toEqual([85, 75, true, 1]);
  expect(rowColors(off, "__early")).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
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
  expect(off.eval(`local n = 0 for _, name in ipairs({ ${DIALOGS.map((d) => `"${d}"`).join(", ")} }) do if ns.FrameState('vgWindow')[_G[name]] == nil and (_G[name].Bg.__alpha or 1) ~= 0 then n = n + 1 end end return n`), "all seven untouched").toBe(7);
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
  expect(off.eval(`local n = 0 for _, name in ipairs({ ${names.map((d) => `"${d}"`).join(", ")} }) do if ns.FrameState('vgWindow')[_G[name]] == nil then n = n + 1 end end return n`), "none hooked").toBe(5);
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
  expect(off.eval("return { ns.FrameState('vgWindow')[GuildRegistrarFrame] == nil, PetitionFrameCharterTitle.__textColor[1] }"), "left the game's, its texts dark").toEqual([true, 0.2]);
  const bare = loggedIn(WINDOWS_ENV + `__window("PetitionFrame") __window("TabardFrame") GuildRegistrarFrameEditBox = {}`);
  bare.eval("PetitionFrame:Show() TabardFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "no texts, no game functions, no buttons").toEqual(["none", 0]);
});

// Role poll and invite popups -----------------------------------------------------------------------------

// The role poll and dungeon invite popups: a dialog border, a close button, role buttons with an icon and a check, accept/decline.
const POPUP_ENV = WINDOWS_ENV + `
  for _, n in ipairs({ "RolePollPopup", "LFGInvitePopup" }) do
    local f = CreateFrame("Frame", n, UIParent) f:Hide()
    f.Border = CreateFrame("Frame", nil, f) f.Border.Art = f.Border:CreateTexture()
    f.Border.NineSlice = CreateFrame("Frame", nil, f.Border) f.Border.NineSlice.Edge = f.Border.NineSlice:CreateTexture()
    for _, role in ipairs({ "Tank", "Healer", "DPS" }) do
      local b = CreateFrame("Button", n .. "RoleButton" .. role, f) b.icon = b:CreateTexture() b:SetNormalTexture("TEST-ONLY-ICON")
      b.checkButton = CreateFrame("CheckButton", nil, b) b.checkButton.Check = b.checkButton:CreateTexture()
    end
    for _, k in ipairs({ "Accept", "Decline" }) do local b = CreateFrame("Button", n .. k .. "Button", f) b.Art = b:CreateTexture() end
  end
  RolePollPopup.CloseButton = CreateFrame("Button", "RolePollPopupCloseButton", RolePollPopup)
  RolePollPopup.acceptButton = RolePollPopupAcceptButton
`;

it("role poll and invite popups: border faded, panel painted, close and accept buttons themed, role buttons untouched", () => {
  const addon = loggedIn(POPUP_ENV);
  for (const name of ["RolePollPopup", "LFGInvitePopup"]) {
    addon.eval(`${name}:Show()`);
    expect(addon.eval(`local f = ${name}
      local panel = false for _, r in ipairs({ f:GetRegions() }) do if r.__alpha ~= 0 then panel = true end end
      local accept, decline = _G["${name}AcceptButton"], _G["${name}DeclineButton"]
      local tank = _G["${name}RoleButtonTank"]
      return { f.Border.Art.__alpha, f.Border.NineSlice.Edge.__alpha, panel, accept.Art.__alpha, decline.Art.__alpha,
        tank.icon.__alpha ~= 0, tank.checkButton.Check.__alpha ~= 0 }`), name).toEqual([0, 0, true, 0, 0, true, true]);
  }
  expect(addon.eval(`local glyph = false for _, r in ipairs({ RolePollPopupCloseButton:GetRegions() }) do if r.__texture and tostring(r.__texture):find("Close") then glyph = true end end return glyph`), "the close button wears the theme's X").toBe(true);
});

it("role poll and invite popups: a second show paints nothing more, the switch off leaves them the game's, missing parts load cleanly", () => {
  const addon = loggedIn(POPUP_ENV);
  addon.eval("RolePollPopup:Show() LFGInvitePopup:Show()");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("RolePollPopup:Hide() RolePollPopup:Show() LFGInvitePopup:Hide() LFGInvitePopup:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "painting again piles up nothing").toBe(painted);
  const off = loggedIn(POPUP_ENV, OFF);
  off.eval("RolePollPopup:Show() LFGInvitePopup:Show()");
  expect(off.eval("return { ns.FrameState('vgWindow')[RolePollPopup] == nil, LFGInvitePopup.Border.Art.__alpha ~= 0 }"), "left the game's").toEqual([true, true]);
  const bare = loggedIn(`CreateFrame("Frame", "RolePollPopup", UIParent) RolePollPopup.Border = {} RolePollPopup.CloseButton = {} RolePollPopupAcceptButton = {}`);
  bare.eval("RolePollPopup:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "a popup with parts missing").toEqual(["none", 0]);
});

// Raid tab -----------------------------------------------------------------------------------------------

// The raid tab's frames as Blizzard_RaidUI makes them: eight group boxes with a label, member buttons, push buttons.
const RAID_PARTS = `
  for i = 1, 8 do
    local g = CreateFrame("Frame", "RaidGroup" .. i, RaidFrame) g.Outline = g:CreateTexture()
    local l = CreateFrame("Button", "RaidGroup" .. i .. "Label", g) l.Art = l:CreateTexture()
  end
  for i = 1, 40 do
    local b = CreateFrame("Button", "RaidGroupButton" .. i, RaidFrame, "SecureUnitButtonTemplate") b.Art = b:CreateTexture()
    b.name = b:CreateFontString("RaidGroupButton" .. i .. "Name", "ARTWORK") b.name:SetTextColor(0.1, 0.8, 0.2)
  end
  for _, n in ipairs({ "RaidFrameRaidInfoButton", "RaidFrameConvertToRaidButton" }) do local b = CreateFrame("Button", n, RaidFrame) b.Art = b:CreateTexture() end
  RaidFrameAllAssistCheckButtonText = RaidFrame:CreateFontString("RaidFrameAllAssistCheckButtonText", "ARTWORK")
  local c = CreateFrame("CheckButton", "RaidFrameAllAssistCheckButton", RaidFrame) c.Art = c:CreateTexture() c.text = RaidFrameAllAssistCheckButtonText c:SetChecked(true)
`;
// RaidFrame exists at login (Blizzard_RaidFrame); the groups and buttons come with Blizzard_RaidUI.
const RAID_ENV = WINDOWS_ENV + `local rf = CreateFrame("Frame", "RaidFrame", UIParent) rf:Hide() ` + RAID_PARTS;

it("raid tab: group boxes faded and panelled, member buttons flat with the game's class color kept, push buttons themed", () => {
  const addon = loggedIn(RAID_ENV);
  addon.eval("RaidFrame:Show()");
  expect(addon.eval(`local function themed(x) for _, r in ipairs({ x:GetRegions() }) do if r.__alpha ~= 0 then return true end end return false end
    local g = {} for i = 1, 8 do g[#g + 1] = RaidGroup1.Outline.__alpha == 0 and RaidGroup8.Outline.__alpha == 0 and _G["RaidGroup" .. i .. "Label"].Art.__alpha == 0 and themed(_G["RaidGroup" .. i]) end
    return { #g, g[1] and g[8], RaidGroupButton1.Art.__alpha, RaidGroupButton40.Art.__alpha, themed(RaidGroupButton40), themed(RaidFrameRaidInfoButton), RaidFrameRaidInfoButton.Art.__alpha,
      RaidFrameConvertToRaidButton.Art.__alpha, RaidGroupButton1Name.__textColor[2] }`), "the whole tab dressed").toEqual([8, true, 0, 0, true, true, 0, 0, 0.8]);
  expect(addon.eval(`local c = RaidFrameAllAssistCheckButtonText.__textColor return c[1] == ns.Theme.RGB("text")`), "the checkbox label in the text color").toBe(true);
  expect(addon.eval("local c = ns.Theme.CheckParts(RaidFrameAllAssistCheckButton) return { RaidFrameAllAssistCheckButton.Art.__alpha, c ~= nil and c.mark:IsShown() }"), "the All assist check button is a themed box, its art faded, its mark shown").toEqual([0, true]);
});

it("raid tab: the All assist box disabled before the tab shows greys its label after the label is painted, on a second show too, and gives it back enabled", () => {
  const addon = loggedIn(RAID_ENV + " RaidFrameAllAssistCheckButton:Disable()");
  addon.eval("RaidFrame:Show()");
  // Whether the All assist label is in the disabled tier.
  const label = () => isTok(addon, addon.eval("return RaidFrameAllAssistCheckButtonText.__textColor"), "disabled");
  expect(label(), "disabled: the label in the disabled tier, not the text colour painted before it").toBe(true);
  addon.eval("RaidFrame:Hide() RaidFrame:Show()");
  expect(label(), "shown again: still the disabled tier").toBe(true);
  addon.eval("RaidFrameAllAssistCheckButton:Enable()");
  expect(isTok(addon, addon.eval("return RaidFrameAllAssistCheckButtonText.__textColor"), "text"), "enabled: the text colour back").toBe(true);
});

it("raid tab: skinned when Blizzard_RaidUI loads after the tab, never in combat, a second show paints nothing more, the switch off leaves it the game's", () => {
  const addon = loggedIn(WINDOWS_ENV + `local rf = CreateFrame("Frame", "RaidFrame", UIParent) rf:Hide()`);
  addon.eval(RAID_PARTS);
  setCombat(addon, true);
  addon.fire("ADDON_LOADED", "Blizzard_RaidUI");
  expect(addon.eval("return { RaidGroup3.Outline.__alpha, RaidGroupButton5.Art.__alpha == nil }"), "the boxes at once, the secure buttons waiting out the fight").toEqual([0, true]);
  setCombat(addon, false);
  expect(addon.eval("return RaidGroupButton5.Art.__alpha"), "the buttons after it").toBe(0);
  addon.fire("ADDON_LOADED", "Blizzard_SomethingElse");
  addon.eval("RaidFrame:Show()");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("RaidFrame:Hide() RaidFrame:Show()");
  addon.fire("ADDON_LOADED", "Blizzard_RaidUI");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "painting again piles up nothing").toBe(painted);
  const off = loggedIn(RAID_ENV, OFF);
  off.eval("RaidFrame:Show()");
  off.fire("ADDON_LOADED", "Blizzard_RaidUI");
  expect(off.eval("return { ns.FrameState('vgWindow')[RaidFrame] == nil, RaidGroup1.Outline.__alpha ~= 0, RaidGroupButton1.Art.__alpha ~= 0 }"), "left the game's").toEqual([true, true, true]);
});

it("raid tab: the parent window is skinned, and a client without the raid UI or some of its parts loads cleanly", () => {
  const addon = loggedIn(WINDOWS_ENV + `__window("RaidParentFrame")`);
  addon.eval("RaidParentFrame:Show()");
  expect(windowState(addon, "RaidParentFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  addon.fire("ADDON_LOADED", "Blizzard_RaidUI");
  const odd = loggedIn(`CreateFrame("Frame", "RaidFrame", UIParent) RaidGroup2 = {} RaidGroupButton3 = {} RaidFrameRaidInfoButton = {} RaidGroup4 = CreateFrame("Frame", nil, RaidFrame)`);
  odd.eval("RaidFrame:Show()");
  expect([windowErrors(addon), windowErrors(odd), addon.eval("return #ns.errors"), odd.eval("return #ns.errors")]).toEqual(["none", "none", 0, 0]);
});

// The social window (Forever's friends list) ------------------------------------------------------------

// The social window as Blizzard_SocialUI builds it: a portrait window with a Battle.net bar (plate, band, status
// dropdown, menu button with an icon), a friends pane (dividers, a search bar with a magnifier, a filter button,
// an action button, a list), a raid pane, side windows (a bordered broadcast dialog with an edit box and buttons,
// an ignore list that is a window) and side tabs from a pool, anchored again by every RefreshTabs.
const SOCIAL_ENV = WINDOWS_ENV + `
  local f = __window("SocialUIFrame")
  f.BattleNetBar = CreateFrame("Frame", nil, f) f.BattleNetBar.Background = f.BattleNetBar:CreateTexture()
  local box = CreateFrame("Frame", nil, f.BattleNetBar) f.BattleNetBar.ControlsContainer = box
  box.BattleNetBackground = box:CreateTexture()
  box.OnlineStatusDropdown = CreateFrame("Button", nil, box) box.OnlineStatusDropdown.Arrow = box.OnlineStatusDropdown:CreateTexture()
  box.BattleNetMenuButton = CreateFrame("Button", nil, box) box.BattleNetMenuButton.Icon = box.BattleNetMenuButton:CreateTexture()
  local function pane(key)
    local p = CreateFrame("Frame", nil, f) f[key] = p
    p.TopDivider = p:CreateTexture() p.BottomDivider = p:CreateTexture()
    p.FilterBar = CreateFrame("Frame", nil, p)
    p.FilterBar.SearchBar = CreateFrame("EditBox", nil, p.FilterBar)
    p.FilterBar.SearchBar.Background = p.FilterBar.SearchBar:CreateTexture() p.FilterBar.SearchBar.searchIcon = p.FilterBar.SearchBar:CreateTexture()
    p.FilterBar.SearchFilterDropdown = CreateFrame("Button", nil, p.FilterBar)
    p.ActionButton = CreateFrame("Button", nil, p)
    p.ScrollBox = CreateFrame("Frame", nil, p)
    return p
  end
  pane("FriendsList") pane("RecentAlliesList")
  f.RaidFrame = CreateFrame("Frame", nil, f) f.RaidFrame.RaidInfoButton = CreateFrame("Button", nil, f.RaidFrame) f.RaidFrame.ConvertToRaidButton = CreateFrame("Button", nil, f.RaidFrame)
  local cast = CreateFrame("Frame", nil, f) f.BattleNetBroadcastFrame = cast cast:Hide()
  cast.Border = CreateFrame("Frame", nil, cast) cast.Border.Edge = cast.Border:CreateTexture()
  cast.Title = cast:CreateFontString(nil, "OVERLAY")
  cast.EditBox = CreateFrame("EditBox", nil, cast) cast.EditBox.LeftBorder = cast.EditBox:CreateTexture()
  cast.UpdateButton = CreateFrame("Button", nil, cast) cast.CancelButton = CreateFrame("Button", nil, cast)
  f.IgnoreListFrame = __window("SocialUIIgnoreList") f.IgnoreListFrame:SetParent(f)
  f.IgnoreListFrame.BlockButton = CreateFrame("Button", nil, f.IgnoreListFrame)
  f.tabs, __refreshes = {}, 0
  function f:EnumerateTabs() local i = 0 return function() i = i + 1 return self.tabs[i] end end
  function f:RefreshTabs()
    __refreshes = __refreshes + 1
    for i = 1, 2 do
      local tab = self.tabs[i]
      if not tab then
        tab = CreateFrame("CheckButton", nil, self) self.tabs[i] = tab
        tab.Background = tab:CreateTexture() tab.SelectedTexture = tab:CreateTexture() tab.Icon = tab:CreateTexture() tab.Count = tab:CreateFontString(nil, "ARTWORK")
      end
      tab:ClearAllPoints()
      if i == 1 then tab:SetPoint("TOPLEFT", self, "TOPRIGHT", 0, -122) else tab:SetPoint("TOPLEFT", self.tabs[i - 1], "BOTTOMLEFT", 0, -3) end
      tab:Show()
    end
  end
  f:HookScript("OnShow", function(self) self:RefreshTabs() end)
`;

// Lua: whether a frame has a texture of its own that isn't the game's art and isn't faded (Vanguard painted it).
const PAINTED = `local function painted(x) for _, r in ipairs({ x:GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end return false end`;

it("social window: the window and its Battle.net bar, panes, side windows and tabs in the theme, the tabs again after the game makes them again", () => {
  const addon = loggedIn(SOCIAL_ENV);
  addon.eval("SocialUIFrame:Show()");
  expect(windowState(addon, "SocialUIFrame")).toMatchObject({ art: 0, nine: 0, portrait: 0, panel: true, title: true });
  expect(addon.eval(`local f, box = SocialUIFrame, SocialUIFrame.BattleNetBar.ControlsContainer ${PAINTED}
    return { f.BattleNetBar.Background.__alpha, box.BattleNetBackground.__alpha, painted(box.OnlineStatusDropdown), painted(box.BattleNetMenuButton), box.BattleNetMenuButton.Icon.__alpha }`),
  "the Battle.net bar: plate and band faded, dropdown and menu button flat, the menu icon kept").toEqual([0, 0, true, true, 1]);
  expect(addon.eval(`local p = SocialUIFrame.FriendsList ${PAINTED}
    return { p.TopDivider.__alpha, p.BottomDivider.__alpha, painted(p.FilterBar.SearchBar), p.FilterBar.SearchBar.Background.__alpha, p.FilterBar.SearchBar.searchIcon.__alpha,
      painted(p.FilterBar.SearchFilterDropdown), painted(p.ActionButton), painted(SocialUIFrame.RecentAlliesList.ActionButton), painted(SocialUIFrame.RaidFrame.RaidInfoButton), painted(SocialUIFrame.RaidFrame.ConvertToRaidButton) }`),
  "a pane: dividers faded, the search box themed with its magnifier, the filter and action buttons flat, the raid tab's buttons too").toEqual([0, 0, true, 0, 1, true, true, true, true, true]);
  expect(addon.eval(`local f = SocialUIFrame ${PAINTED}
    local function tab(i) local t = f.tabs[i] return { t.Background.__alpha, t.Icon.__alpha == ns.Theme.TAB_DIM, painted(t) } end
    local _, rel, _, x = f.tabs[1]:GetPoint(1)
    return { tab(1), tab(2), rel == f, x == ns.Theme.Padding(f) - ns.Theme.Pixel(f), __refreshes }`),
  "the side tabs: art faded, icons kept (greyed, none selected), flat, the first moved out past the padding").toEqual([[0, true, true], [0, true, true], true, true, 1]);
  addon.eval("SocialUIFrame:RefreshTabs()");
  expect(addon.eval(`local f = SocialUIFrame local _, _, _, x = f.tabs[1]:GetPoint(1) return { __refreshes, x == ns.Theme.Padding(f) - ns.Theme.Pixel(f), f.tabs[1].Background.__alpha }`), "made again: padded and skinned again").toEqual([2, true, 0]);
  addon.eval("SocialUIFrame.BattleNetBroadcastFrame:Show() SocialUIFrame.IgnoreListFrame:Show()");
  expect(addon.eval(`local cast, ignore = SocialUIFrame.BattleNetBroadcastFrame, SocialUIFrame.IgnoreListFrame ${PAINTED}
    return { cast.Border.Edge.__alpha, painted(cast), painted(cast.EditBox), cast.EditBox.LeftBorder.__alpha, painted(cast.UpdateButton), painted(cast.CancelButton), cast.Title:GetFont() ~= nil,
      ignore.NineSlice.__alpha, painted(ignore), painted(ignore.BlockButton) }`),
  "the side windows: the broadcast dialog's border faded, a panel, its box, buttons and title themed; the ignore list a window with its button flat").toEqual([0, true, true, 0, true, true, true, 0, true, true]);
  expect([windowErrors(addon), addon.eval("return #ns.errors")], "no errors").toEqual(["none", 0]);
});

it("social window: a second show paints nothing more, the switch off leaves it the game's, missing parts load cleanly", () => {
  const addon = loggedIn(SOCIAL_ENV);
  addon.eval("SocialUIFrame:Show() SocialUIFrame.BattleNetBroadcastFrame:Show()");
  const painted = windowState(addon, "SocialUIFrame").painted;
  addon.eval("SocialUIFrame:Hide() SocialUIFrame:Show() SocialUIFrame.BattleNetBroadcastFrame:Hide() SocialUIFrame.BattleNetBroadcastFrame:Show() SocialUIFrame:RefreshTabs()");
  expect(windowState(addon, "SocialUIFrame").painted, "painting again piles up nothing").toBe(painted);
  const off = loggedIn(SOCIAL_ENV, OFF);
  off.eval("SocialUIFrame:Show()");
  expect([windowState(off, "SocialUIFrame").art !== 0, off.eval("return ns.FrameState('vgWindow')[SocialUIFrame] == nil and SocialUIFrame.tabs[1].Background.__alpha ~= 0")], "with the group off").toEqual([true, true]);
  const bare = loggedIn(WINDOWS_ENV + `__window("SocialUIFrame") SocialUIFrame.BattleNetBar = {} SocialUIFrame.FriendsList = CreateFrame("Frame", nil, SocialUIFrame) SocialUIFrame.FriendsList.FilterBar = {}
    SocialUIFrame.RaidFrame = {} SocialUIFrame.IgnoreListFrame = {} SocialUIFrame.BattleNetBroadcastFrame = CreateFrame("Frame", nil, SocialUIFrame)`);
  bare.eval("SocialUIFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors")], "a client with parts missing").toEqual(["none", 0]);
});

// TEST-ONLY social toasts as the game builds them: a hidden backdrop frame with its art, glow and X button;
// the Battle.net toast's icon, four lines and hover tooltip; the time-played alert's one line. The toast's
// ShowToast does what the game's BNToastMixin:ShowToast does as far as the look goes: sets the lines, greys
// the bottom one and shows the frame (Show() on a frame already up fires no OnShow); __showToast calls it.
const TOAST_ENV = WINDOWS_ENV + `
  function __toast(name)
    local f = CreateFrame("Frame", name, UIParent, "BackdropTemplate")
    f:Hide()
    for _ = 1, 3 do f:CreateTexture(nil, "BACKGROUND"):SetTexture("TEST-ONLY-ART") end
    f.glow = f:CreateTexture(nil, "OVERLAY") f.glow:SetTexture("TEST-ONLY-ART") f.glow:Hide()
    f.CloseButton = CreateFrame("Button", nil, f)
    f.CloseButton:CreateTexture(nil, "ARTWORK"):SetTexture("TEST-ONLY-ART")
    f.CloseButton:SetPoint("TOPRIGHT", -4, -3)
    return f
  end
  local bn = __toast("BNToastFrame")
  bn.IconTexture = bn:CreateTexture(nil, "ARTWORK") bn.IconTexture:SetTexture("TEST-ONLY-ICON")
  for _, key in ipairs({ "TopLine", "MiddleLine", "BottomLine", "DoubleLine" }) do
    bn[key] = bn:CreateFontString(nil, "ARTWORK") bn[key]:SetFont("TEST-ONLY-FONT", 12, "")
  end
  bn.TooltipFrame = CreateFrame("Frame", nil, bn, "BackdropTemplate")
  bn.TooltipFrame.NineSlice = CreateFrame("Frame", nil, bn.TooltipFrame)
  bn.TooltipFrame.Text = bn.TooltipFrame:CreateFontString(nil, "ARTWORK") bn.TooltipFrame.Text:SetFont("TEST-ONLY-FONT", 10, "")
  local time = __toast("TimeAlertFrame")
  time.Text = time:CreateFontString(nil, "ARTWORK") time.Text:SetFont("TEST-ONLY-FONT", 12, "")
  function bn:ShowToast(online)
    self.TopLine:SetText("|cff82c5ffTEST-ONLY Friend|r")
    if online then self.BottomLine:SetText("|cff999999TEST-ONLY has come online|r")
    else self.BottomLine:SetText("TEST-ONLY has gone offline") self.BottomLine:SetTextColor(0.5, 0.5, 0.5) end
    self:Show()
  end
  function __showToast(online) BNToastFrame:ShowToast(online) end
`;
// What the toasts look like: the Battle.net toast's art alphas, icon alpha, panel, bottom line colour and text, top line
// text, top and bottom line sizes, close glyph, whether the X kept the game's anchor, its tooltip's NineSlice alpha, panel
// and text colour; the time-played alert's panel and line size; the painted count.
const toastLook = (addon) => addon.eval(`
  local function painted(f) for _, r in ipairs({ f:GetRegions() }) do if r:GetObjectType() == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__texture ~= "TEST-ONLY-ICON" and r:GetAlpha() ~= 0 then return true end end return false end
  local bn, time = BNToastFrame, TimeAlertFrame
  local art = {} for _, r in ipairs({ bn:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art[#art + 1] = r:GetAlpha() end end
  local glyph = false for _, r in ipairs({ bn.CloseButton:GetRegions() }) do if r.__layer == "OVERLAY" and type(r.__texture) == "string" then glyph = r.__texture:match("Icons\\\\(%w+)$") or glyph end end
  return { art = art, icon = bn.IconTexture:GetAlpha(), panel = painted(bn), bottom = bn.BottomLine.__textColor, bottomText = bn.BottomLine:GetText(), topText = bn.TopLine:GetText(), top = select(2, bn.TopLine:GetFont()), small = select(2, bn.BottomLine:GetFont()),
    glyph = glyph, anchored = bn.CloseButton.__points.TOPRIGHT ~= nil, tipNine = bn.TooltipFrame.NineSlice:GetAlpha(), tipPanel = painted(bn.TooltipFrame), tipText = bn.TooltipFrame.Text.__textColor,
    timePanel = painted(time), timeText = select(2, time.Text:GetFont()), painted = ns.Theme.PaintedCount() }`);

it("social toasts: the Battle.net and time-played toasts are flat tooltip panels, lines in theme roles, the X the close glyph where the game put it", () => {
  const addon = loggedIn(TOAST_ENV);
  addon.eval("__showToast() TimeAlertFrame:Show()");
  const t = toastLook(addon);
  expect([t.art, t.icon, t.panel, t.glyph, t.anchored], "backdrop and glow at alpha 0, the Battle.net icon kept, a panel, the close glyph on the X, which stays in the toast's corner").toEqual([[0, 0, 0, 0], 1, true, "CloseMark", true]);
  expect([isTok(addon, t.bottom, "text2"), t.bottomText, t.top, t.small], "the bottom line the game greyed by SetTextColor: in secondary text, its words kept; top line at label size, bottom at small").toEqual([true, "TEST-ONLY has gone offline", 12, 10]);
  expect([t.tipNine, t.tipPanel, isTok(addon, t.tipText, "text")], "its hover tooltip: NineSlice faded, a panel, light text").toEqual([0, true, true]);
  expect([t.timePanel, t.timeText], "the time-played alert: a panel, its line at label size").toEqual([true, 12]);
  addon.eval("__showToast(true)");
  const next = toastLook(addon);
  expect([addon.eval("return BNToastFrame:IsShown()"), next.painted, isTok(addon, next.bottom, "text2"), next.bottomText], "a friend coming online while the first toast is still up: the game sets the lines and shows the frame again with no OnShow, and the line is still re-dressed (from the ShowToast hook), the grey code stripped, nothing piling up")
    .toEqual([true, t.painted, true, "TEST-ONLY has come online"]);
  addon.eval("BNToastFrame:Hide() TimeAlertFrame:Hide() __showToast(true) TimeAlertFrame:Show()");
  const again = toastLook(addon);
  expect([again.painted, isTok(addon, again.bottom, "text2"), again.bottomText, again.topText], "the next toast, a friend coming online (the game writes the grey into the text): re-dressed without piling up, the grey code stripped so the line reads in secondary text, the name's Battle.net blue kept")
    .toEqual([t.painted, true, "TEST-ONLY has come online", "|cff82c5ffTEST-ONLY Friend|r"]);
  addon.eval("BNToastFrame:Hide() BNToastFrame.BottomLine:SetText(__wfgWorld.secret(1)) BNToastFrame:Show()");
  expect(addon.eval("return issecretvalue(BNToastFrame.BottomLine:GetText())"), "a line whose text the client hides is left as it is").toBe(true);
  expect([windowErrors(addon), addon.eval("return #ns.errors")], "no errors").toEqual(["none", 0]);
});

it("social toasts: the switch off leaves them the game's; a toast missing its parts shows cleanly", () => {
  const off = loggedIn(TOAST_ENV, OFF);
  off.eval("__showToast(true)");
  const t = toastLook(off);
  expect([t.art, t.panel, t.glyph, t.bottomText, off.eval("return ns.FrameState('vgWindow')[BNToastFrame] == nil")], "art kept, no panel, no glyph, the game's grey code left in the line, not watched").toEqual([[1, 1, 1, 1], false, false, "|cff999999TEST-ONLY has come online|r", true]);
  const bare = loggedIn(WINDOWS_ENV + 'local f = CreateFrame("Frame", "BNToastFrame", UIParent) f:Hide()');
  bare.eval("BNToastFrame:Show()");
  expect([windowErrors(bare), bare.eval("return #ns.errors"), bare.eval(`${PAINTED} return painted(BNToastFrame)`)], "a toast with no lines, icon, X or tooltip: a panel, no errors").toEqual(["none", 0, true]);
});
