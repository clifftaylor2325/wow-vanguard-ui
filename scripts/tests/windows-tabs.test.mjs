// windows-tabs: the tabs group of game windows (Modules/WindowsTabs.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { loggedIn, WINDOWS_ENV } from "./helpers.mjs";

// TEST-ONLY tab buttons shaped like the game's tab templates, and a reader for a tab's state:
// art = the alpha of its Left texture (-1 while the game's own), line = whether its accent
// line (the only OVERLAY texture T.Tab adds) shows, icon = whether its icon was left alone.
const TABS_ENV = `
  function __tab(parent, name, keys, kind)
    local b = CreateFrame(kind or "Button", name, parent)
    for _, k in ipairs(keys or { "Left", "Middle", "Right", "LeftActive", "MiddleActive", "RightActive" }) do b[k] = b:CreateTexture(nil, "BACKGROUND") end
    b.Icon = b:CreateTexture(nil, "ARTWORK")
    return b
  end
  function __line(b)
    for _, r in ipairs({ b:GetRegions() }) do if r.__layer == "OVERLAY" then return r end end
  end
  function __tabState(b)
    local line = __line(b)
    return { art = b.Left and b.Left.__alpha or -1, icon = b.Icon.__alpha == nil, line = line ~= nil and line:IsShown() }
  end
  -- A tab system as TabSystemMixin has it: tabs added one at a time, read back by GetTabButton.
  function __system(parent)
    local s = CreateFrame("Frame", nil, parent)
    s.tabs = {}
    function s:GetTabButton(id) return self.tabs[id] end
    function s:AddTab()
      local b = __tab(self, nil, { "Left", "Middle", "Right" })
      function b:SetTabSelected(on) self.isSelected = on end
      self.tabs[#self.tabs + 1] = b
      return #self.tabs
    end
    return s
  end
`;

// TEST-ONLY windows with tabs the ways the game makes them: named PanelTemplates tabs
// (Merchant, in WINDOWS_ENV already), a parentArray of tabs, and tab systems (a window's own,
// and the friends window's, inside its header).
const WINDOW_TABS_ENV = TABS_ENV + `
  __tab(MerchantFrame, "MerchantFrameTab1") __tab(MerchantFrame, "MerchantFrameTab2")
  MerchantFrameTab2:Disable()
  __window("TestOnlyFriends")
  TestOnlyFriends.Tabs = { __tab(TestOnlyFriends), __tab(TestOnlyFriends) }
  __window("TestOnlySpells")
  TestOnlySpells.TabSystem = __system(TestOnlySpells) TestOnlySpells.TabSystem:AddTab() TestOnlySpells.TabSystem:AddTab()
  __window("TestOnlyHeader")
  TestOnlyHeader.FriendsTabHeader = CreateFrame("Frame", nil, TestOnlyHeader)
  TestOnlyHeader.FriendsTabHeader.TabSystem = __system(TestOnlyHeader.FriendsTabHeader)
  TestOnlyHeader.FriendsTabHeader.TabSystem:AddTab()
  ns.GetModule("Windows").Add("windows", "framed", { "TestOnlyFriends", "TestOnlySpells", "TestOnlyHeader", "TestOnlyMissing" })
`;

it("the tabs group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.tabs"), "its switch is on by default").toBe(true);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'")).toBe("none");
});

it("tab buttons on framed windows: named, array and tab-system tabs in the theme, the selected one lit", () => {
  const addon = loggedIn(WINDOWS_ENV + WINDOW_TABS_ENV);
  addon.eval("MerchantFrame:Show() TestOnlyFriends:Show() TestOnlySpells:Show() TestOnlyHeader:Show()");
  const states = addon.eval(`return {
    __tabState(MerchantFrameTab1), __tabState(MerchantFrameTab2), __tabState(TestOnlyFriends.Tabs[1]),
    __tabState(TestOnlySpells.TabSystem:GetTabButton(2)), __tabState(TestOnlyHeader.FriendsTabHeader.TabSystem:GetTabButton(1)) }`);
  expect(states.map((s) => s.art), "every kind of tab has its game art faded").toEqual([0, 0, 0, 0, 0]);
  expect(states.map((s) => s.icon), "and its icon left alone").toEqual([true, true, true, true, true]);
  expect(states.map((s) => s.line), "only the disabled (selected) Merchant tab shows the accent line").toEqual([false, true, false, false, false]);
  addon.eval("TestOnlySpells.TabSystem:GetTabButton(1):SetTabSelected(true)");
  expect(addon.eval("return __tabState(TestOnlySpells.TabSystem:GetTabButton(1)).line"), "a tab system's selection lights its tab").toBe(true);
  expect(addon.eval("return ns.errors[1] == nil"), "nothing failed, a window this client lacks included").toBe(true);
});

it("tab buttons: a second show paints nothing more, and tabs a tab system adds later are dressed", () => {
  const addon = loggedIn(WINDOWS_ENV + WINDOW_TABS_ENV);
  addon.eval("TestOnlySpells:Show()");
  const before = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("TestOnlySpells:Hide() TestOnlySpells:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "painted once, then only repainted").toBe(before);
  addon.eval("TestOnlySpells.TabSystem:AddTab()");
  expect(addon.eval("return __tabState(TestOnlySpells.TabSystem:GetTabButton(3)).art"), "a tab the game adds after the window was dressed").toBe(0);
  addon.eval("MerchantFrameTab2:Enable() MerchantFrameTab1:Disable()");
  expect(addon.eval("return { __tabState(MerchantFrameTab1).line, __tabState(MerchantFrameTab2).line }"), "the line follows the game's selection").toEqual([true, false]);
});

it("tab buttons: windows that load later are dressed when their part of the game loads", () => {
  const addon = loggedIn(WINDOWS_ENV + TABS_ENV + `ns.GetModule("Windows").Add("windows", "onDemand", "TestOnly_Later", { "TestOnlyLater" })`);
  addon.eval(`__window("TestOnlyLater") TestOnlyLater.Tabs = { __tab(TestOnlyLater) }`);
  expect(addon.eval("return __tabState(TestOnlyLater.Tabs[1]).art"), "not before its addon loads").toBe(-1);
  addon.fire("ADDON_LOADED", "TestOnly_Other");
  expect(addon.eval("return __tabState(TestOnlyLater.Tabs[1]).art"), "nor when another part does").toBe(-1);
  addon.fire("ADDON_LOADED", "TestOnly_Later");
  expect(addon.eval("return __tabState(TestOnlyLater.Tabs[1]).art"), "dressed once it has").toBe(0);
  expect(addon.eval("return ns.errors[1] == nil")).toBe(true);
});

it("tab buttons: the tabs switch off, or a window's own group off, leaves the game's tabs", () => {
  const off = loggedIn(WINDOWS_ENV + WINDOW_TABS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  off.eval("MerchantFrame:Show() TestOnlySpells:Show()");
  expect(off.eval("return { __tabState(MerchantFrameTab1).art, __tabState(TestOnlySpells.TabSystem:GetTabButton(1)).art }"), "tabs off: the art is the game's").toEqual([-1, -1]);
  expect(off.eval("return MerchantFrame.vgWindow"), "while the window itself is still skinned").toBe(true);
  const social = WINDOWS_ENV + TABS_ENV + `__window("TestOnlySocial") TestOnlySocial.Tabs = { __tab(TestOnlySocial) }
    ns.GetModule("Windows").Add("social", "framed", { "TestOnlySocial" })`;
  const gameOwn = loggedIn(social, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  gameOwn.eval("TestOnlySocial:Show()");
  expect(gameOwn.eval("return __tabState(TestOnlySocial.Tabs[1]).art"), "a window left to the game keeps its tabs").toBe(-1);
  expect(loggedIn(social).eval("return __tabState(TestOnlySocial.Tabs[1]).art"), "and with its group on they are dressed at login").toBe(0);
});

// TEST-ONLY side tabs: a LargeSideTabButtonTemplate one (a Frame: art keys, SelectedTexture,
// SetChecked from its mixin) and a RightSideTabTemplate one (a CheckButton with an unkeyed frame
// texture, an icon and its overlay). __sideState reads the line, the faded art and the icon:
// icon = the icon still shows (never faded out) and its overlay is the game's; dim = greyed and faded.
const SIDE_ENV = TABS_ENV + `
  function __side(parent, key)
    local t = CreateFrame("Frame", nil, parent)
    for _, k in ipairs({ "Background", "SelectedTexture", "HighlightTexture", "Mask", "TabGlow" }) do t[k] = t:CreateTexture(nil, "BACKGROUND") end
    t.Icon = t:CreateTexture(nil, "ARTWORK")
    function t:SetChecked(on) self.SelectedTexture:SetShown(on) end
    t.SelectedTexture:Hide()
    if key then parent[key] = t end
    return t
  end
  function __right(parent, key, checked)
    local t = CreateFrame("CheckButton", nil, parent)
    t.frameArt = t:CreateTexture(nil, "BORDER")
    t.Icon, t.IconOverlay = t:CreateTexture(nil, "ARTWORK"), t:CreateTexture(nil, "ARTWORK")
    t:SetChecked(checked == true)
    parent[key] = t
    return t
  end
  function __sideState(t)
    local line = __line(t)
    return { art = t.Background and t.Background.__alpha or (t.frameArt and t.frameArt.__alpha) or -1,
      icon = (t.Icon.__alpha == nil or t.Icon.__alpha > 0) and (t.IconOverlay == nil or t.IconOverlay.__alpha == nil),
      dim = t.Icon.__desaturated == true and t.Icon:GetAlpha() < 1, line = line ~= nil and line:IsShown() }
  end
`;

it("side tabs: the character pane's mode tabs in the theme, the checked one lit from the start and as the game moves it", () => {
  const addon = loggedIn(WINDOWS_ENV + SIDE_ENV + `
    __window("CharacterFrame")
    CharacterFrame.ModeTabs = CreateFrame("Frame", nil, CharacterFrame)
    CharacterFrame.ModeTabs.Tabs = {}
    for _, key in ipairs({ "CharacterTab", "ReputationTab", "SkillsTab" }) do
      local t = __side(CharacterFrame.ModeTabs, key)
      table.insert(CharacterFrame.ModeTabs.Tabs, t)
    end
    CharacterFrame.ModeTabs.CharacterTab:SetChecked(true)
    CharacterFrame.TabIndicators = CreateFrame("Frame", nil, CharacterFrame)
    CharacterFrame.TabIndicators.Glyph = CharacterFrame.TabIndicators:CreateTexture()
  `);
  const tabs = "local m = CharacterFrame.ModeTabs return { __sideState(m.CharacterTab), __sideState(m.ReputationTab), __sideState(m.SkillsTab) }";
  const first = addon.eval(`${tabs}`);
  expect(first.map((s) => s.art), "the side art is faded").toEqual([0, 0, 0]);
  expect(first.map((s) => s.icon), "the icons are the game's").toEqual([true, true, true]);
  expect(first.map((s) => s.line), "the tab the game had checked before the skin hooked it is already lit").toEqual([true, false, false]);
  expect(first.map((s) => s.dim), "the other tabs' icons are greyed, the lit one's in color").toEqual([false, true, true]);
  addon.eval("local m = CharacterFrame.ModeTabs m.CharacterTab:SetChecked(false) m.ReputationTab:SetChecked(true)");
  expect(addon.eval(tabs).map((s) => s.line), "the line follows SetChecked, as the game's RefreshDisplay does").toEqual([false, true, false]);
  expect(addon.eval("return CharacterFrame.TabIndicators.Glyph.__alpha"), "the gamepad tab indicators' art is faded").toBe(0);
  addon.eval("CharacterFrame:Show()");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CharacterFrame:Hide() CharacterFrame:Show()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), ns.errors[1] == nil }"), "a second show paints nothing more").toEqual([painted, true]);
});

it("side tabs: the guild window's, whether or not another group registered it, unless its group is off", () => {
  const guild = WINDOWS_ENV + SIDE_ENV + `
    __window("CommunitiesFrame")
    __right(CommunitiesFrame, "ChatTab", true) __right(CommunitiesFrame, "RosterTab") __right(CommunitiesFrame, "GuildInfoTab")`;
  const addon = loggedIn(guild);
  const state = addon.eval("return { __sideState(CommunitiesFrame.ChatTab), __sideState(CommunitiesFrame.RosterTab) }");
  expect(state.map((s) => s.art), "its frame texture (no key) is faded").toEqual([0, 0]);
  expect(state.map((s) => s.icon), "its icon and the icon's overlay are kept").toEqual([true, true]);
  expect(state.map((s) => s.line), "the checked tab is lit").toEqual([true, false]);
  addon.eval("CommunitiesFrame.RosterTab:SetChecked(true) CommunitiesFrame.ChatTab:SetChecked(false)");
  expect(addon.eval("return { __sideState(CommunitiesFrame.ChatTab).line, __sideState(CommunitiesFrame.RosterTab).line }"), "and it moves with SetChecked").toEqual([false, true]);
  expect(addon.eval("return { __sideState(CommunitiesFrame.ChatTab).dim, __sideState(CommunitiesFrame.RosterTab).dim }"), "the greyed icon moves with it").toEqual([true, false]);
  const registered = guild + `ns.GetModule("Windows").Add("social", "framed", { "CommunitiesFrame" })`;
  expect(loggedIn(registered).eval("return __sideState(CommunitiesFrame.ChatTab).art"), "registered by the social group, still dressed").toBe(0);
  const off = loggedIn(registered, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  expect(off.eval("return __sideState(CommunitiesFrame.ChatTab).art"), "with that group off the window and its tabs are the game's").toBe(-1);
});

it("side tabs: Legacy, inspect and group finder windows are dressed when their part of the game loads", () => {
  const addon = loggedIn(WINDOWS_ENV + SIDE_ENV);
  addon.eval(`
    __window("LegacySystemFrame")
    LegacySystemFrame.Tabs = {}
    for _, key in ipairs({ "LegacyRewardTrackTab", "LegacyChallengeTab", "LegacyTreeTab" }) do table.insert(LegacySystemFrame.Tabs, __side(LegacySystemFrame, key)) end
    LegacySystemFrame.TabIndicators = CreateFrame("Frame", nil, LegacySystemFrame)
    __window("LFGParentFrame")
    __tab(LFGParentFrame, "LFGParentFrameTab1") __tab(LFGParentFrame, "LFGParentFrameTab2") __tab(LFGParentFrame, "LFGParentFrameTab3")
    __side(LFGParentFrame, "ListingTab") __side(LFGParentFrame, "BrowsingTab")
    __window("InspectFrame") __tab(InspectFrame, "InspectFrameTab1") __tab(InspectFrame, "InspectFrameTab2")`);
  expect(addon.eval("return __sideState(LegacySystemFrame.LegacyTreeTab).art"), "not before the part loads").toBe(-1);
  addon.fire("ADDON_LOADED", "Blizzard_LegacySystem");
  const out = addon.eval(`return { __sideState(LegacySystemFrame.LegacyTreeTab).art, __sideState(LegacySystemFrame.Tabs[1]).art,
    __tabState(LFGParentFrameTab3).art, __sideState(LFGParentFrame.BrowsingTab).art, __tabState(InspectFrameTab2).art }`);
  expect(out, "the Legacy side tabs, the group finder's tabs and side tabs and the inspect tabs").toEqual([0, 0, 0, 0, 0]);
  addon.eval("InspectFrameTab2:Disable()");
  expect(addon.eval("return __tabState(InspectFrameTab2).line"), "the inspect tab the game selects (disables) is lit").toBe(true);
  expect(addon.eval("return ns.errors[1] == nil")).toBe(true);
});

it("side tabs: a window without the parts, or a tab the client refuses, loads cleanly", () => {
  const bare = loggedIn(WINDOWS_ENV + SIDE_ENV + `__window("CharacterFrame") __window("CommunitiesFrame") __window("LFGParentFrame")
    CommunitiesFrame.ChatTab = CreateFrame("CheckButton", nil, CommunitiesFrame)`);
  bare.eval("CharacterFrame:Show() CommunitiesFrame:Show() LFGParentFrame:Show()");
  expect(bare.eval("return ns.errors[1] == nil"), "no ModeTabs, no tabs, an icon-less check button").toBe(true);
  const refuses = loggedIn(WINDOWS_ENV + SIDE_ENV + `__window("CommunitiesFrame") __right(CommunitiesFrame, "RosterTab")
    CommunitiesFrame.ChatTab = __right(CommunitiesFrame, "ChatTab") CommunitiesFrame.ChatTab.HookScript = function() error("TEST-ONLY: no such script") end`);
  expect(refuses.eval("return { __sideState(CommunitiesFrame.ChatTab).art, __sideState(CommunitiesFrame.RosterTab).art, #ns.errors }"), "a tab whose HookScript refuses a script is still dressed (T.Tab guards its hooks), so is the next, nothing reported").toEqual([0, 0, 0]);
});

// TEST-ONLY character pane parts, shaped like the Camelot pane's: scroll boxes of list rows (a header
// with a StateIcon, an entry whose Content holds a ColoredProgressBar: a frame with a Fill texture),
// stat category boxes, the honor tab and the equipment flyout. __art makes the game's art (a texture
// that reads as art); __panel says whether Vanguard painted something on a frame.
const PANE_ENV = WINDOWS_ENV + SIDE_ENV + `
  function __art(f, layer) local t = f:CreateTexture(nil, layer or "BACKGROUND") t:SetTexture("TEST-ONLY-ART") return t end
  function __a(t) return t.__alpha or -1 end
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do
      if r:GetObjectType() == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end
    end
    return false
  end
  -- A ScrollBox as the game keeps it: its rows, ForEachFrame, and the acquire callbacks ScrollUtil registers.
  ScrollUtil = { AddAcquiredFrameCallback = function(box, cb, owner) table.insert(box.callbacks, function(row) cb(owner, row) end) end }
  function __box(parent)
    local box = CreateFrame("Frame", nil, parent)
    box.rows, box.callbacks = {}, {}
    function box:ForEachFrame(fn) for _, row in ipairs(self.rows) do if fn(row, {}) then return end end end
    function box:Acquire(row) table.insert(self.rows, row) for _, cb in ipairs(self.callbacks) do cb(row) end return row end
    return box
  end
  function __header(box)
    local h = CreateFrame("Button", nil, box)
    h.banner, h.StateIcon = __art(h), __art(h, "BORDER")
    return box:Acquire(h)
  end
  function __entry(box, key, kind)
    local e = CreateFrame("Button", nil, box)
    e.Content = CreateFrame("Frame", nil, e)
    local bar = CreateFrame(kind or "Frame", nil, e.Content)
    bar.backdrop, bar.Fill = __art(bar), __art(bar, "BORDER")
    e.Content[key], e.bar = bar, bar
    return box:Acquire(e)
  end
  __window("CharacterFrame")
  for _, name in ipairs({ "ReputationFrame", "SkillsFrame", "TokenFrame" }) do
    local f = CreateFrame("Frame", name, CharacterFrame)
    f.ScrollBox = __box(f)
  end
  SkillsFrame.SkillDetailFrame = CreateFrame("Frame", nil, SkillsFrame)
  SkillsFrame.SkillDetailFrame.RankBar = CreateFrame("StatusBar", nil, SkillsFrame.SkillDetailFrame)
  SkillsFrame.SkillDetailFrame.RankBar.Fill = __art(SkillsFrame.SkillDetailFrame.RankBar, "BORDER")
  __repHeader, __repEntry = __header(ReputationFrame.ScrollBox), __entry(ReputationFrame.ScrollBox, "ReputationBar")
  __skillEntry = __entry(SkillsFrame.ScrollBox, "SkillsBar", "StatusBar")
  __tokenHeader = __header(TokenFrame.ScrollBox)
`;

it("character pane lists: bars panelled with their fill kept, headers flat with their icon kept, rows the game acquires later too", () => {
  const addon = loggedIn(PANE_ENV);
  // The character pane lists' bars and headers: alphas and whether each is panelled.
  const state = () => addon.eval(`return {
    repBar = { __a(__repEntry.bar.backdrop), __a(__repEntry.bar.Fill), __panel(__repEntry.bar) },
    skillBar = { __a(__skillEntry.bar.backdrop), __a(__skillEntry.bar.Fill), __panel(__skillEntry.bar) },
    rank = { __a(SkillsFrame.SkillDetailFrame.RankBar.Fill), __panel(SkillsFrame.SkillDetailFrame.RankBar) },
    header = { __a(__repHeader.banner), __a(__repHeader.StateIcon), __panel(__repHeader) },
    token = { __a(__tokenHeader.banner), __a(__tokenHeader.StateIcon) } }`);
  const first = state();
  expect(first.repBar, "reputation bar: backdrop faded, Fill the game's (its colour is the standing), a panel behind").toEqual([0, -1, true]);
  expect(first.skillBar, "skill bar (a StatusBar with a Fill) the same").toEqual([0, -1, true]);
  expect(first.rank, "the skill detail's rank bar").toEqual([-1, true]);
  expect(first.header, "header: banner faded, the plus/minus icon kept visible, a flat button").toEqual([0, 1, true]);
  expect(first.token, "currency headers too").toEqual([0, 1]);
  const later = addon.eval(`local e = __entry(ReputationFrame.ScrollBox, "ReputationBar") local h = __header(TokenFrame.ScrollBox)
    return { __a(e.bar.backdrop), __panel(e.bar), __a(h.banner) }`);
  expect(later, "rows acquired after the pane was dressed").toEqual([0, true, 0]);
  addon.eval("CharacterFrame:Show()");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CharacterFrame:Hide() CharacterFrame:Show()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "a second show paints nothing more").toEqual([painted, 0]);
});

it("character pane lists: a bar that is a real StatusBar gets the theme's texture, and the lists are the game's with the tabs switch off", () => {
  const addon = loggedIn(PANE_ENV);
  expect(addon.eval(`local bar = CreateFrame("StatusBar", nil, UIParent) ns.GetModule("Windows").SkinBar(bar) return bar.__barTexture ~= nil`)).toBe(true);
  expect(addon.eval(`local bar = CreateFrame("Frame", nil, UIParent) ns.GetModule("Windows").SkinBar(bar) ns.GetModule("Windows").SkinBar(nil) return __panel(bar)`), "a frame that is neither is left alone").toBe(false);
  const off = loggedIn(PANE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  expect(off.eval("return { __a(__repEntry.bar.backdrop), __a(__repHeader.banner) }"), "tabs off: the pane's lists are the game's").toEqual([-1, -1]);
  const gameOwn = loggedIn(PANE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  expect(gameOwn.eval("return __a(__repEntry.bar.backdrop)"), "and so are they when the character window itself is the game's").toBe(-1);
});

it("character pane stat boxes: the title plate faded and an inset panel, whether plain frames or scroll box rows", () => {
  const addon = loggedIn(PANE_ENV + `
    CharacterStatsPane = CreateFrame("Frame", "CharacterStatsPane", CharacterFrame)
    local function category(parent) local c = CreateFrame("Frame", nil, parent) c.Background = __art(c) c.Title = c:CreateFontString() return c end
    __cat1 = category(CharacterStatsPane)
    __statLine = CreateFrame("Frame", nil, CharacterStatsPane) __statLine.Background = __art(__statLine) __statLine.Value = __statLine:CreateFontString()
    CharacterStatsPaneScrollBox = CreateFrame("Frame", "CharacterStatsPaneScrollBox", CharacterFrame)
    CharacterStatsPaneScrollBox.ScrollBox = __box(CharacterStatsPaneScrollBox)
    __cat2 = CharacterStatsPaneScrollBox.ScrollBox:Acquire(category(CharacterStatsPaneScrollBox.ScrollBox))
  `);
  expect(addon.eval("return { __cat1.Background.__alpha, __panel(__cat1), __cat2.Background.__alpha, __panel(__cat2) }"), "both kinds of category box").toEqual([0, true, 0, true]);
  expect(addon.eval("return { __a(__statLine.Background), __panel(__statLine) }"), "a stat line (no title) is left alone").toEqual([-1, false]);
  expect(addon.eval("return ns.errors[1] == nil")).toBe(true);
});

it("character pane honor tab: the line and glow faded, the ring, badge and texts kept", () => {
  const addon = loggedIn(PANE_ENV + `
    PVPRankFrame = CreateFrame("Frame", "PVPRankFrame", CharacterFrame)
    PVPRankFrame.MainInfoFrame = CreateFrame("Frame", nil, PVPRankFrame)
    PVPRankFrame.MainInfoFrame.Line = __art(PVPRankFrame.MainInfoFrame, "ARTWORK")
    local ring = CreateFrame("Frame", nil, PVPRankFrame.MainInfoFrame)
    PVPRankFrame.MainInfoFrame.RankProgressBarDisplay = ring
    ring.glow, ring.Background, ring.Bar, ring.FactionBadge = __art(ring), __art(ring), __art(ring, "BORDER"), __art(ring, "ARTWORK")
  `);
  expect(addon.eval(`local m = PVPRankFrame.MainInfoFrame local r = m.RankProgressBarDisplay
    return { __a(m.Line), __a(r.glow), __a(r.Background), __a(r.Bar), __a(r.FactionBadge) }`)).toEqual([0, 0, -1, -1, -1]);
  const bare = loggedIn(PANE_ENV + `PVPRankFrame = CreateFrame("Frame", "PVPRankFrame", CharacterFrame)`);
  expect(bare.eval("return ns.errors[1] == nil"), "a client whose honor tab has no main frame").toBe(true);
});

it("equipment flyout: panels behind its grid and page bar, its buttons skinned like the bags', again after the game refills it", () => {
  const addon = loggedIn(PANE_ENV + `
    EquipmentFlyoutFrame = CreateFrame("Frame", "EquipmentFlyoutFrame", UIParent)
    EquipmentFlyoutFrame.buttonFrame, EquipmentFlyoutFrame.NavigationFrame = CreateFrame("Frame", nil, EquipmentFlyoutFrame), CreateFrame("Frame", nil, EquipmentFlyoutFrame)
    __art(EquipmentFlyoutFrame.buttonFrame) __art(EquipmentFlyoutFrame.NavigationFrame)
    EquipmentFlyoutFrame.buttons = { CreateFrame("Button", nil, EquipmentFlyoutFrame.buttonFrame) }
    EquipmentFlyoutFrame:Hide()
    EquipmentFlyout_UpdateItems = function() end
  `);
  addon.eval("EquipmentFlyoutFrame:Show()");
  // The equipment flyout: its grid and page bar panelled, its first button skinned, its button count.
  const flyout = () => addon.eval(`local f = EquipmentFlyoutFrame
    return { __panel(f.buttonFrame), __panel(f.NavigationFrame), f.buttons[1].vgSkinned == true, #f.buttons }`);
  expect(flyout(), "its grid and page bar panelled, its first button skinned").toEqual([true, true, true, 1]);
  addon.eval(`table.insert(EquipmentFlyoutFrame.buttons, CreateFrame("Button", nil, EquipmentFlyoutFrame.buttonFrame))`);
  expect(addon.eval("return EquipmentFlyoutFrame.buttons[2].vgSkinned"), "a button the game adds waits for the next fill").toBe(null);
  addon.eval("EquipmentFlyout_UpdateItems()");
  expect(addon.eval("return EquipmentFlyoutFrame.buttons[2].vgSkinned"), "and is skinned when the game fills the flyout again").toBe(true);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("EquipmentFlyoutFrame:Hide() EquipmentFlyoutFrame:Show() EquipmentFlyout_UpdateItems()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "nothing is painted twice").toEqual([painted, 0]);
  const without = loggedIn(PANE_ENV + `EquipmentFlyoutFrame = CreateFrame("Frame", "EquipmentFlyoutFrame", UIParent)`);
  expect(without.eval("EquipmentFlyoutFrame:Show() return #ns.errors"), "a flyout without its parts or buttons").toBe(0);
});

it("character pane: a list that loads later (the currencies' addon) is dressed when its part of the game loads", () => {
  const addon = loggedIn(PANE_ENV + "__tokenEarly, TokenFrame = TokenFrame, nil");
  addon.eval("TokenFrame = __tokenEarly");
  expect(addon.eval("return __a(__tokenHeader.banner)"), "not before the addon loads").toBe(-1);
  addon.fire("ADDON_LOADED", "Blizzard_TokenUI");
  expect(addon.eval("return { __a(__tokenHeader.banner), #ns.errors }"), "dressed once it has").toEqual([0, 0]);
});

// TEST-ONLY scroll bars shaped like the game's MinimalScrollBar (a Track holding the Thumb, arrow
// buttons), and a reader for a bar's state: track art and thumb art faded, a panel on the thumb.
const BARS_ENV = PANE_ENV + `
  function __bar(parent, key)
    local bar = CreateFrame("Frame", nil, parent)
    bar.Track = CreateFrame("Frame", nil, bar)
    bar.Track.Begin = __art(bar.Track)
    bar.Track.Thumb = CreateFrame("Button", nil, bar.Track)
    bar.Track.Thumb.Middle = __art(bar.Track.Thumb)
    bar.Back, bar.Forward = CreateFrame("Button", nil, bar), CreateFrame("Button", nil, bar)
    if key then parent[key] = bar end
    return bar
  end
  function __barState(bar) return { __a(bar.Track.Begin), __a(bar.Track.Thumb.Middle), __panel(bar.Track.Thumb), bar.Back.vgArrow ~= nil } end
  __window("TestOnlyList")
  __bar(TestOnlyList, "ScrollBar")
  TestOnlyList.Pane = CreateFrame("Frame", nil, TestOnlyList)
  TestOnlyList.Pane.ScrollBox = CreateFrame("Frame", nil, TestOnlyList.Pane)
  __bar(TestOnlyList.Pane, "ScrollBar")
  -- a ScrollBox whose paired bar sits on the box's own parent, outside the window's frames
  __holder = CreateFrame("Frame", nil, UIParent) __bar(__holder, "ScrollBar")
  TestOnlyList.Mapped = CreateFrame("Frame", nil, TestOnlyList)
  TestOnlyList.Mapped.ScrollBox = CreateFrame("Frame", nil, __holder)
  TestOnlyList.Far = CreateFrame("Frame", nil, TestOnlyList)
  TestOnlyList.Far.One = CreateFrame("Frame", nil, TestOnlyList.Far)
  TestOnlyList.Far.One.Two = CreateFrame("Frame", nil, TestOnlyList.Far.One)
  TestOnlyList.Far.One.Two.Three = CreateFrame("Frame", nil, TestOnlyList.Far.One.Two)
  TestOnlyList.Far.One.Two.Three.Four = CreateFrame("Frame", nil, TestOnlyList.Far.One.Two.Three)
  __bar(TestOnlyList.Far.One.Two.Three.Four, "ScrollBar")
  ns.GetModule("Windows").Add("windows", "framed", { "TestOnlyList" })
`;

it("scroll bars: a window's ScrollBar key and the bar paired with a ScrollBox are in the theme, a second show paints nothing more", () => {
  const addon = loggedIn(BARS_ENV);
  // The window's and the pane's scroll bar states.
  const bars = () => addon.eval("return { __barState(TestOnlyList.ScrollBar), __barState(TestOnlyList.Pane.ScrollBar) }");
  expect(bars(), "the window's own bar and the pane's, paired with its ScrollBox: track and thumb art faded, the thumb panelled, arrows drawn").toEqual([[0, 0, true, true], [0, 0, true, true]]);
  expect(addon.eval("return __barState(__holder.ScrollBar)"), "and the bar on a ScrollBox's own parent").toEqual([0, 0, true, true]);
  expect(addon.eval("return __barState(TestOnlyList.Far.One.Two.Three.Four.ScrollBar)[1]"), "a bar nested deeper than the search goes is the game's").toBe(-1);
  addon.eval("TestOnlyList:Show()");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("TestOnlyList:Hide() TestOnlyList:Show()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "painted once").toEqual([painted, 0]);
});

it("scroll bars: a frame the game keeps from addons is skipped, and so is the inside of one that holds such a frame", () => {
  const addon = loggedIn(BARS_ENV + `
    TestOnlyList.Pane.IsForbidden = function() return true end
    TestOnlyList.Far.GetChildren = function() error("Attempt to access forbidden object from code tainted by an AddOn") end
  `);
  addon.eval("TestOnlyList:Show()");
  const state = addon.eval("return { __barState(TestOnlyList.ScrollBar)[1], __barState(TestOnlyList.Pane.ScrollBar)[1], #ns.errors }");
  expect(state, "the window's own bar is dressed, the forbidden pane's is the game's, and nothing errors").toEqual([0, -1, 0]);
});

it("scroll bars: only on registered windows whose groups are on; a bar that isn't one of the game's is left alone", () => {
  const env = BARS_ENV;
  const off = loggedIn(env, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  expect(off.eval("return __barState(TestOnlyList.ScrollBar)[1]"), "tabs off: the game's bars").toBe(-1);
  const gameOwn = loggedIn(env, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  expect(gameOwn.eval("return __barState(TestOnlyList.ScrollBar)[1]"), "the window left to the game keeps them").toBe(-1);
  const odd = loggedIn(env + `TestOnlyList.ScrollBar = CreateFrame("Frame", nil, TestOnlyList)`);
  expect(odd.eval("TestOnlyList:Show() return #ns.errors"), "a ScrollBar with no thumb (an old scroll frame's) is left alone").toBe(0);
  const groupOff = loggedIn(env + `__window("CommunitiesFrame") __bar(CommunitiesFrame, "ScrollBar")`, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  expect(groupOff.eval("CommunitiesFrame:Show() return __barState(CommunitiesFrame.ScrollBar)[1]"), "a window whose own group is off (the guild window, social) keeps the game's bars").toBe(-1);
});

it("tabs and the window's padding: a tab set outside the window moves out to the panel's edge, once, with its bar on its outer edge", () => {
  const addon = loggedIn(WINDOWS_ENV + SIDE_ENV + `
    __window("CommunitiesFrame") CommunitiesFrame:SetSize(400, 300) CommunitiesFrame:SetPoint("CENTER")
    local chat = __right(CommunitiesFrame, "ChatTab", true) chat:SetSize(32, 32) chat:SetPoint("TOPLEFT", CommunitiesFrame, "TOPRIGHT", 2, -40)
    local roster = __right(CommunitiesFrame, "RosterTab") roster:SetSize(32, 32) roster:SetPoint("TOP", chat, "BOTTOM", 0, -8)
    __window("TestOnlyBottom") TestOnlyBottom:SetSize(300, 200) TestOnlyBottom:SetPoint("CENTER")
    local tab = __tab(TestOnlyBottom, "TestOnlyBottomTab1") tab:SetSize(80, 24) tab:SetPoint("TOPLEFT", TestOnlyBottom, "BOTTOMLEFT", 11, 2)
    ns.GetModule("Windows").Add("windows", "framed", { "TestOnlyBottom" })`);
  addon.eval("CommunitiesFrame:Show() TestOnlyBottom:Show() CommunitiesFrame:Hide() CommunitiesFrame:Show()");
  const out = addon.eval(`local px = ns.Theme.Pixel(CommunitiesFrame) local pad = ns.GetModule("Windows").PAD - px
    local c, r, b = CommunitiesFrame.ChatTab.__points.TOPLEFT, CommunitiesFrame.RosterTab.__points.TOP, TestOnlyBottomTab1.__points.TOPLEFT
    return { math.abs(c.x - pad) < 1e-9, c.y, r.rel == CommunitiesFrame.ChatTab, r.y, b.x, math.abs(b.y + pad) < 1e-9, ns.Theme.Padding(CommunitiesFrame) }`);
  expect(out, "the guild window's first side tab sits on the panel's padded edge (shown twice: moved once), the next still follows it; the bottom tab drops below the padding").toEqual([true, -40, true, -8, 11, true, 6]);
  const bars = addon.eval(`local function bar(t) for _, r in ipairs({ t:GetRegions() }) do if r.__layer == "OVERLAY" then return r end end end
    local side, bottom = bar(CommunitiesFrame.ChatTab), bar(TestOnlyBottomTab1)
    return { side.__points.TOPRIGHT ~= nil and side.__points.BOTTOMRIGHT ~= nil, bottom.__points.BOTTOMLEFT ~= nil and bottom.__points.BOTTOMRIGHT ~= nil }`);
  expect(bars, "the accent bar runs along the edge away from the window: the side tab's right, the bottom tab's bottom").toEqual([true, true]);
  expect(addon.eval("return ns.errors[1] == nil")).toBe(true);
});

it("window controls in a padded window: the corner close button and the max/min box sit evenly in its corner", () => {
  const addon = loggedIn(WINDOWS_ENV + `
    __window("TestOnlyControls") TestOnlyControls:SetSize(300, 200) TestOnlyControls:SetPoint("CENTER")
    TestOnlyControls.CloseButton:SetSize(24, 24) TestOnlyControls.CloseButton:SetPoint("TOPRIGHT", TestOnlyControls, "TOPRIGHT", 1, 0)
    local box = CreateFrame("Frame", nil, TestOnlyControls) box:SetSize(32, 32) box:SetPoint("RIGHT", TestOnlyControls.CloseButton, "LEFT", 8, 0)
    box.MaximizeButton, box.MinimizeButton = CreateFrame("Button", nil, box), CreateFrame("Button", nil, box)
    TestOnlyControls.MaximizeMinimizeButton = box
    __window("TestOnlyOdd") TestOnlyOdd.CloseButton:SetPoint("BOTTOM", TestOnlyOdd, "BOTTOM", 0, 8)
    ns.GetModule("Windows").Add("windows", "framed", { "TestOnlyControls", "TestOnlyOdd" })`);
  addon.eval("TestOnlyControls:Show() TestOnlyOdd:Show() TestOnlyControls:Hide() TestOnlyControls:Show()");
  const out = addon.eval(`local c, b = TestOnlyControls.CloseButton.__points.CENTER, TestOnlyControls.MaximizeMinimizeButton.__points.CENTER
    local function gem(x) for _, r in ipairs({ x:GetRegions() }) do if (r.__texture or ""):find("ControlGem") then return true end end return false end
    return { c.rel == TestOnlyControls, c.x, c.y, b.rel == TestOnlyControls.CloseButton, b.x, b.y, gem(TestOnlyControls.MaximizeMinimizeButton.MaximizeButton),
      TestOnlyOdd.CloseButton.__points.BOTTOM ~= nil, ns.errors[1] == nil }`);
  expect(out, "close 12 in from the corner both ways (18 from the panel's padded edge), the max/min box (with its gem) 28 to its left; a close button the game put elsewhere stays there")
    .toEqual([true, -12, -12, true, -28, 0, true, true, true]);
});

it("flight map: its map art stays when the window's art is faded", () => {
  const addon = loggedIn(WINDOWS_ENV + `
    __window("TaxiFrame")
    TaxiMap = TaxiFrame:CreateTexture("TaxiMap", "ARTWORK")
    TaxiFrame.InsetBg = TaxiFrame:CreateTexture(nil, "BACKGROUND")`);
  addon.eval("TaxiFrame:Show() TaxiFrame:Hide() TaxiFrame:Show()");
  expect(addon.eval("return { TaxiMap:GetAlpha(), TaxiFrame.InsetBg:GetAlpha(), TaxiFrame.NineSlice.__alpha }"), "the map (either texture the client draws it on) shows, the frame art is faded").toEqual([1, 1, 0]);
});
