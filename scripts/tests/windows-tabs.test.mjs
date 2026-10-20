// windows-tabs: the tabs group of game windows (Modules/WindowsTabs.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { expectErrors, isTok, loggedIn, px, WINDOWS_ENV } from "./helpers.mjs";

// TEST-ONLY tab buttons shaped like the game's tab templates, and a reader for a tab's state:
// art = the alpha of its Left texture (-1 while the game's own), raised = whether it is the
// selected tab's raised fill (the last BACKGROUND texture T.Tab tints), icon = whether its icon was left alone.
const TABS_ENV = `
  function __tab(parent, name, keys, kind)
    local b = CreateFrame(kind or "Button", name, parent)
    for _, k in ipairs(keys or { "Left", "Middle", "Right", "LeftActive", "MiddleActive", "RightActive" }) do b[k] = b:CreateTexture(nil, "BACKGROUND") end
    b.Icon = b:CreateTexture(nil, "ARTWORK")
    return b
  end
  function __tabBg(b)
    local bg
    for _, r in ipairs({ b:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end end
    return bg
  end
  function __raised(b)
    local bg = __tabBg(b)
    if not bg then return false end
    local c = bg.__vertexColor
    local r, g, bl = ns.Theme.RGB("raised")
    return c[1] == r and c[2] == g and c[3] == bl
  end
  function __tabState(b)
    return { art = b.Left and b.Left.__alpha or -1, icon = b.Icon.__alpha == nil, raised = __raised(b) }
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
  ns.GetModule("Windows").Add("windows", { "TestOnlyFriends", "TestOnlySpells", "TestOnlyHeader", "TestOnlyMissing" })
`;

it("the tabs group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.tabs"), "its switch is on by default").toBe(true);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'")).toBe("none");
});

it("tab buttons on framed windows: named, array and tab-system tabs in the theme, the selected one raised", () => {
  const addon = loggedIn(WINDOWS_ENV + WINDOW_TABS_ENV);
  addon.eval("MerchantFrame:Show() TestOnlyFriends:Show() TestOnlySpells:Show() TestOnlyHeader:Show()");
  const states = addon.eval(`return {
    __tabState(MerchantFrameTab1), __tabState(MerchantFrameTab2), __tabState(TestOnlyFriends.Tabs[1]),
    __tabState(TestOnlySpells.TabSystem:GetTabButton(2)), __tabState(TestOnlyHeader.FriendsTabHeader.TabSystem:GetTabButton(1)) }`);
  expect(states.map((s) => s.art), "every kind of tab has its game art faded").toEqual([0, 0, 0, 0, 0]);
  expect(states.map((s) => s.icon), "and its icon left alone").toEqual([true, true, true, true, true]);
  expect(states.map((s) => s.raised), "only the disabled (selected) Merchant tab is raised").toEqual([false, true, false, false, false]);
  addon.eval("TestOnlySpells.TabSystem:GetTabButton(1):SetTabSelected(true)");
  expect(addon.eval("return __tabState(TestOnlySpells.TabSystem:GetTabButton(1)).raised"), "a tab system's selection raises its tab").toBe(true);
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
  expect(addon.eval("return { __tabState(MerchantFrameTab1).raised, __tabState(MerchantFrameTab2).raised }"), "the raised tab follows the game's selection").toEqual([true, false]);
});

it("tab buttons: a window whose tabs fail to dress on a later show is reported under its own name, and still opens", () => {
  expectErrors("show window tabs: TEST-ONLY: tab system broke");
  const addon = loggedIn(WINDOWS_ENV + WINDOW_TABS_ENV + `
    function TestOnlySpells.TabSystem:GetTabButton(id) if __broken then error("TEST-ONLY: tab system broke", 0) end return self.tabs[id] end`);
  addon.eval("TestOnlySpells:Show() TestOnlySpells:Hide() __broken = true TestOnlySpells:Show()");
  expect(addon.eval("return { TestOnlySpells:IsShown(), #ns.errors }"), "shown, the failure caught once").toEqual([true, 1]);
});

// TEST-ONLY icon tabs as the spellbook's category tab system adds them (TabSystemButtonTemplate's Init with an icon):
// a 44 x 32 tab, a 36 x 35 icon anchored at the tab's bottom and centre under the game's SquareMask, tabIcon set.
// __iconTab reads the tab's width, the icon's size, crop, masks and anchors, and whether it is greyed.
const ICON_TABS_ENV = TABS_ENV + `
  function __iconSystem(parent)
    local s = __system(parent)
    local addTab = s.AddTab
    function s:AddTab(_, icon)
      local b = self:GetTabButton(addTab(self))
      b.IconMask = b:CreateMaskTexture()
      b.Icon:AddMaskTexture(b.IconMask)
      b.Icon:SetSize(36, 35)
      b.Icon:SetPoint("BOTTOM") b.Icon:SetPoint("CENTER", b, "CENTER", 0, 0)
      b:SetSize(44, 32)
      b.tabIcon = icon
      return #self.tabs
    end
    return s
  end
  function __iconTab(b)
    local w, h = b.Icon:GetSize()
    return { width = b:GetWidth(), icon = { w, h }, crop = b.Icon.__texCoord, masks = #(b.Icon.__masks or {}),
      dim = b.Icon.__desaturated == true, anchor = b.Icon:GetNumPoints() .. " " .. b.Icon:GetPoint(1) }
  end
  __window("TestOnlyBook")
  TestOnlyBook.CategoryTabSystem = __iconSystem(TestOnlyBook)
  TestOnlyBook.CategoryTabSystem:AddTab(nil, 136243) TestOnlyBook.CategoryTabSystem:AddTab(nil, 135812)
  TestOnlyBook.CategoryTabSystem:GetTabButton(1):SetTabSelected(true)
  ns.GetModule("Windows").Add("windows", { "TestOnlyBook" })
`;

it("icon tabs: the spellbook's category tabs are squares with the icon filling them one pixel inside the border", () => {
  const addon = loggedIn(WINDOWS_ENV + ICON_TABS_ENV);
  addon.eval("TestOnlyBook:Show()");
  const inner = addon.eval("return 32 - 2 * ns.Theme.Pixel(TestOnlyBook.CategoryTabSystem:GetTabButton(1))");
  const tabs = addon.eval("local s = TestOnlyBook.CategoryTabSystem return { __iconTab(s:GetTabButton(1)), __iconTab(s:GetTabButton(2)) }");
  expect(tabs.map((t) => t.width), "each tab is as wide as it is tall").toEqual([32, 32]);
  expect(tabs.map((t) => t.icon), "its icon fills it one pixel in").toEqual([[inner, inner], [inner, inner]]);
  expect(tabs.map((t) => t.crop), "with the baked-in bevel cropped").toEqual([[0.08, 0.92, 0.08, 0.92], [0.08, 0.92, 0.08, 0.92]]);
  expect(tabs.map((t) => t.masks), "and the game's rounded mask off").toEqual([0, 0]);
  expect(tabs.map((t) => t.dim), "the unselected tab's icon is greyed").toEqual([false, true]);
  expect(tabs.map((t) => t.anchor), "anchored at the centre alone, so the bottom anchor no longer stretches it").toEqual(["1 CENTER", "1 CENTER"]);
  addon.eval("TestOnlyBook.CategoryTabSystem:AddTab(nil, 132089)");
  expect(addon.eval("return __iconTab(TestOnlyBook.CategoryTabSystem:GetTabButton(3)).width"), "a tab the game adds later is squared too").toBe(32);
  addon.eval("TestOnlyBook:Hide() TestOnlyBook:Show()");
  expect(addon.eval("return __iconTab(TestOnlyBook.CategoryTabSystem:GetTabButton(1)).masks"), "dressing again takes nothing more off").toBe(0);
  expect(addon.eval("return ns.errors[1] == nil")).toBe(true);
});

it("icon tabs: a tab with no height yet keeps the game's size and mask", () => {
  const addon = loggedIn(WINDOWS_ENV + ICON_TABS_ENV + "TestOnlyBook.CategoryTabSystem:GetTabButton(2):SetHeight(0)");
  expect(addon.eval("local t = __iconTab(TestOnlyBook.CategoryTabSystem:GetTabButton(2)) return { t.width, t.masks }")).toEqual([44, 1]);
});

it("tab buttons: windows that load later are dressed when their part of the game loads", () => {
  const addon = loggedIn(WINDOWS_ENV + TABS_ENV + `ns.GetModule("Windows").AddOnDemand("windows", "TestOnly_Later", { "TestOnlyLater" })`);
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
  expect(off.eval("return ns.FrameState('vgWindow')[MerchantFrame]"), "while the window itself is still skinned").toBe(true);
  const social = WINDOWS_ENV + TABS_ENV + `__window("TestOnlySocial") TestOnlySocial.Tabs = { __tab(TestOnlySocial) }
    ns.GetModule("Windows").Add("social", { "TestOnlySocial" })`;
  const gameOwn = loggedIn(social, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  gameOwn.eval("TestOnlySocial:Show()");
  expect(gameOwn.eval("return __tabState(TestOnlySocial.Tabs[1]).art"), "a window left to the game keeps its tabs").toBe(-1);
  expect(loggedIn(social).eval("return __tabState(TestOnlySocial.Tabs[1]).art"), "and with its group on they are dressed at login").toBe(0);
});

// TEST-ONLY side tabs: a LargeSideTabButtonTemplate one (a Frame: art keys, SelectedTexture,
// SetChecked from its mixin) and a RightSideTabTemplate one (a CheckButton with an unkeyed frame
// texture, an icon and its overlay). __sideState reads the raised state, the faded art and the icon:
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
    local raised = __raised(t)
    return { art = t.Background and t.Background.__alpha or (t.frameArt and t.frameArt.__alpha) or -1,
      icon = (t.Icon.__alpha == nil or t.Icon.__alpha > 0) and (t.IconOverlay == nil or t.IconOverlay.__alpha == nil),
      dim = t.Icon.__desaturated == true and t.Icon:GetAlpha() < 1, raised = raised }
  end
`;

it("side tabs: the character pane's mode tabs in the theme, the checked one raised from the start and as the game moves it", () => {
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
  expect(first.map((s) => s.raised), "the tab the game had checked before the skin hooked it is already raised").toEqual([true, false, false]);
  expect(first.map((s) => s.dim), "the other tabs' icons are greyed, the raised one's in color").toEqual([false, true, true]);
  addon.eval("local m = CharacterFrame.ModeTabs m.CharacterTab:SetChecked(false) m.ReputationTab:SetChecked(true)");
  expect(addon.eval(tabs).map((s) => s.raised), "the raised tab follows SetChecked, as the game's RefreshDisplay does").toEqual([false, true, false]);
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
  expect(state.map((s) => s.raised), "the checked tab is raised").toEqual([true, false]);
  addon.eval("CommunitiesFrame.RosterTab:SetChecked(true) CommunitiesFrame.ChatTab:SetChecked(false)");
  expect(addon.eval("return { __sideState(CommunitiesFrame.ChatTab).raised, __sideState(CommunitiesFrame.RosterTab).raised }"), "and it moves with SetChecked").toEqual([false, true]);
  expect(addon.eval("return { __sideState(CommunitiesFrame.ChatTab).dim, __sideState(CommunitiesFrame.RosterTab).dim }"), "the greyed icon moves with it").toEqual([true, false]);
  const registered = guild + `ns.GetModule("Windows").Add("social", { "CommunitiesFrame" })`;
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
  expect(addon.eval("return __tabState(InspectFrameTab2).raised"), "the inspect tab the game selects (disables) is raised").toBe(true);
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

it("character pane lists: bars panelled with their fill kept, headers flat with a chevron for their plus/minus, rows the game acquires later too", () => {
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
  expect(first.header, "header: banner faded, the plus/minus icon hidden (a chevron stands for it), a flat button").toEqual([0, 0, true]);
  expect(first.token, "currency headers too").toEqual([0, 0]);
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

it("character pane gear slots: each item button's bronze frame faded and a flat panel behind it, the shirt, tabard and ammo too", () => {
  const addon = loggedIn(PANE_ENV + `
    function __slot(name) local b = CreateFrame("Button", "Character" .. name .. "Slot", CharacterFrame) b.NormalTexture, b.IconBorder = __art(b), __art(b, "BORDER") return b end
    __slotHead, __slotShirt, __slotAmmo = __slot("Head"), __slot("Shirt"), __slot("Ammo")
  `);
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return { __a(__slotHead.NormalTexture), __a(__slotHead.IconBorder), __panel(__slotHead) }"), "a slot's frame faded, a flat panel behind its icon").toEqual([0, 0, true]);
  expect(addon.eval("return { __a(__slotShirt.NormalTexture), __panel(__slotAmmo) }"), "the shirt and ammo slots too").toEqual([0, true]);
  expect(addon.eval("return ns.errors[1] == nil"), "a slot the client lacks is skipped without an error").toBe(true);
});

it("character pane model area: the strip above the model and the model scene's backdrop faded, a flat panel behind the model", () => {
  const addon = loggedIn(PANE_ENV + `
    PaperDollFrame = CreateFrame("Frame", "PaperDollFrame", CharacterFrame)
    PaperDollFrame.TopBackgroundStripHost = CreateFrame("Frame", nil, PaperDollFrame)
    __strip = __art(PaperDollFrame.TopBackgroundStripHost)
    PaperDollFrame.CharacterModelScene = CreateFrame("Frame", nil, PaperDollFrame) -- the harness has no ModelScene type; the skin only reads regions
    __backdrop = __art(PaperDollFrame.CharacterModelScene)
  `);
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return { __a(__strip), __a(__backdrop), __panel(PaperDollFrame.CharacterModelScene) }"), "strip and backdrop faded, a panel behind the model").toEqual([0, 0, true]);
  expect(addon.eval("return ns.errors[1] == nil"), "nothing reported").toBe(true);
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
    EquipmentFlyoutFrame.NavigationFrame.PrevButton = CreateFrame("Button", nil, EquipmentFlyoutFrame.NavigationFrame)
    EquipmentFlyoutFrame.NavigationFrame.NextButton = CreateFrame("Button", nil, EquipmentFlyoutFrame.NavigationFrame)
    EquipmentFlyoutFrame:Hide()
    EquipmentFlyout_UpdateItems = function() end
  `);
  addon.eval("EquipmentFlyoutFrame:Show()");
  // The equipment flyout: its grid and page bar panelled, its first button skinned, its button count.
  const flyout = () => addon.eval(`local f = EquipmentFlyoutFrame
    return { __panel(f.buttonFrame), __panel(f.NavigationFrame), ns.FrameState('vgSkinned')[f.buttons[1]] == true, #f.buttons }`);
  expect(flyout(), "its grid and page bar panelled, its first button skinned").toEqual([true, true, true, 1]);
  expect(addon.eval("local n = EquipmentFlyoutFrame.NavigationFrame return { ns.Theme.ArrowParts(n.PrevButton) ~= nil, ns.Theme.ArrowParts(n.NextButton) ~= nil }"), "its page arrows theme arrow buttons").toEqual([true, true]);
  addon.eval(`table.insert(EquipmentFlyoutFrame.buttons, CreateFrame("Button", nil, EquipmentFlyoutFrame.buttonFrame))`);
  expect(addon.eval("return ns.FrameState('vgSkinned')[EquipmentFlyoutFrame.buttons[2]]"), "a button the game adds waits for the next fill").toBe(null);
  addon.eval("EquipmentFlyout_UpdateItems()");
  expect(addon.eval("return ns.FrameState('vgSkinned')[EquipmentFlyoutFrame.buttons[2]]"), "and is skinned when the game fills the flyout again").toBe(true);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("EquipmentFlyoutFrame:Hide() EquipmentFlyoutFrame:Show() EquipmentFlyout_UpdateItems()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "nothing is painted twice").toEqual([painted, 0]);
  const without = loggedIn(PANE_ENV + `EquipmentFlyoutFrame = CreateFrame("Frame", "EquipmentFlyoutFrame", UIParent)`);
  expect(without.eval("EquipmentFlyoutFrame:Show() return #ns.errors"), "a flyout without its parts or buttons").toBe(0);
});

it("equipment flyout: a flyout that fails to dress on a later show is reported under its own name, and still opens", () => {
  expectErrors("show equipment flyout: TEST-ONLY: flyout broke");
  const addon = loggedIn(PANE_ENV + `
    EquipmentFlyoutFrame = CreateFrame("Frame", "EquipmentFlyoutFrame", UIParent) EquipmentFlyoutFrame:Hide()
    EquipmentFlyoutFrame.buttonFrame = CreateFrame("Frame", nil, EquipmentFlyoutFrame)
    function EquipmentFlyoutFrame.buttonFrame:GetRegions() if __broken then error("TEST-ONLY: flyout broke", 0) end end`);
  addon.eval("EquipmentFlyoutFrame:Show() EquipmentFlyoutFrame:Hide() __broken = true EquipmentFlyoutFrame:Show()");
  expect(addon.eval("return { EquipmentFlyoutFrame:IsShown(), #ns.errors }"), "shown, the failure caught once").toEqual([true, 1]);
});

it("character pane: a list that loads later (the currencies' addon) is dressed when its part of the game loads", () => {
  const addon = loggedIn(PANE_ENV + "__tokenEarly, TokenFrame = TokenFrame, nil");
  addon.eval("TokenFrame = __tokenEarly");
  expect(addon.eval("return __a(__tokenHeader.banner)"), "not before the addon loads").toBe(-1);
  addon.fire("ADDON_LOADED", "Blizzard_TokenUI");
  expect(addon.eval("return { __a(__tokenHeader.banner), #ns.errors }"), "dressed once it has").toEqual([0, 0]);
});

// TEST-ONLY pane hosts, shaped like the Camelot CharacterFrame.xml's: the left host's wooden background, the right
// host's stat backdrop and stone plate and its child frame holding the divider line. The currency list's ScrollBox
// says how many rows it holds, as the game's does (GetDataProviderSize), and takes a new list (SetDataProvider).
const HOSTS_ENV = PANE_ENV + `
  CharacterFrame.LeftPaneHost = CreateFrame("Frame", "CharacterFrameLeftPaneHost", CharacterFrame)
  __woodBg = __art(CharacterFrame.LeftPaneHost)
  CharacterFrame.RightPaneHost = CreateFrame("Frame", "CharacterFrameRightPaneHost", CharacterFrame)
  __statBg, CharacterFrame.RightPaneHost.StoneBg = __art(CharacterFrame.RightPaneHost), __art(CharacterFrame.RightPaneHost, "ARTWORK")
  __divider = __art(CreateFrame("Frame", nil, CharacterFrame.RightPaneHost), "OVERLAY")
  CharacterFrame.RightPaneToggleButton = CreateFrame("Button", "CharacterFrameRightPaneToggleButton", CharacterFrame)
  CharacterFrame.RightPaneToggleButton:SetPoint("TOPRIGHT", CharacterFrame.LeftPaneHost, "TOPRIGHT", -6, -6)
  CharacterFrame.RightPaneToggleButton.art = __art(CharacterFrame.RightPaneToggleButton, "ARTWORK")
  __hidden = false
  function CharacterFrame:IsRightPaneCollapsed() return __hidden end
  function CharacterFrame:UpdateRightPaneToggleButton() end
  TokenFrame.ScrollBox.size = 0
  function TokenFrame.ScrollBox:GetDataProviderSize() return self.size end
  function TokenFrame.ScrollBox:SetDataProvider(n) self.size = n end
`;

it("character pane: the wooden and stone backdrops faded, each list on a flat inset panel, as on the other lists", () => {
  const addon = loggedIn(HOSTS_ENV);
  expect(addon.eval("return { __a(__woodBg), __a(__statBg), __a(CharacterFrame.RightPaneHost.StoneBg), __a(__divider) }"), "the hosts' art and the divider").toEqual([0, 0, 0, 0]);
  expect(addon.eval("return { __panel(ReputationFrame.ScrollBox), __panel(SkillsFrame.ScrollBox), __panel(TokenFrame.ScrollBox) }"), "reputation, skills and currency lists").toEqual([true, true, true]);
  const off = loggedIn(HOSTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  expect(off.eval("return { __a(__woodBg), __panel(TokenFrame.ScrollBox) }"), "tabs off: the game's backdrops").toEqual([-1, false]);
  const bare = loggedIn(PANE_ENV + "CharacterFrame.LeftPaneHost = true");
  expect(bare.eval("return #ns.errors"), "a host that is not a frame, and a currency list that cannot count its rows").toBe(0);
});

it("character pane: the right-pane toggle sits in the title row, beside the close button, a window control with the theme's chevron", () => {
  const addon = loggedIn(HOSTS_ENV);
  const toggle = addon.eval(`local b = CharacterFrame.RightPaneToggleButton local p = b.__points.CENTER
    return { p.rel == CharacterFrame.CloseButton, p.x, p.y, b.__points.TOPRIGHT == nil }`);
  expect(toggle, "CENTER on the close button, one control step left, its old corner anchor cleared").toEqual([true, -28, 0, true]);
  const look = addon.eval(`local b = CharacterFrame.RightPaneToggleButton local g = ns.Theme.ControlGlyph(b)
    return { __a(b.art), g.__texture == ns.Theme.Icon("Right"), g.__texCoord, ns.Theme.ControlGlyph(CharacterFrame) == nil, ns.Theme.ControlGlyph(UIParent) == nil }`);
  expect(look, "the gold page arrow faded, the theme's chevron pointing left while the stats half shows; a panel or a bare frame has no control glyph").toEqual([0, true, [1, 0, 0, 1], true, true]);
  // The chevron's texture coordinates after the game hides (or shows) the stats half and updates the button.
  const turned = (hidden) => addon.eval(`__hidden = ${hidden} CharacterFrame:UpdateRightPaneToggleButton() return ns.Theme.ControlGlyph(CharacterFrame.RightPaneToggleButton).__texCoord`);
  expect(turned(true), "stats half hidden: the chevron points right").toEqual([0, 1, 0, 1]);
  expect(turned(false), "shown again: left").toEqual([1, 0, 0, 1]);
  const off = loggedIn(HOSTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  expect(off.eval("return CharacterFrame.RightPaneToggleButton.__points.CENTER == nil"), "tabs off: where the game put it").toBe(true);
  const bare = loggedIn(HOSTS_ENV + "CharacterFrame.CloseButton = nil");
  expect(bare.eval("return { CharacterFrame.RightPaneToggleButton.__points.CENTER == nil, #ns.errors }"), "no close button to sit by: left alone").toEqual([true, 0]);
  const plain = loggedIn(HOSTS_ENV + "CharacterFrame.RightPaneToggleButton.CreateTexture = nil CharacterFrame.IsRightPaneCollapsed = nil");
  expect(plain.eval("return { CharacterFrame.RightPaneToggleButton.__points.CENTER ~= nil, #ns.errors }"), "a toggle that can't take textures is only moved").toEqual([true, 0]);
});

it("currency: an empty list says so, and the note follows the list the game sets", () => {
  const addon = loggedIn(HOSTS_ENV);
  // The currency list's note: its text and whether it shows.
  const note = () => addon.eval("local n = ns.FrameState('vgEmptyNote')[TokenFrame.ScrollBox] return { n:GetText(), n:IsShown() }");
  expect(note(), "no currencies yet").toEqual(["You have no currencies yet.", true]);
  addon.eval("TokenFrame.ScrollBox:SetDataProvider(3)");
  expect(note()[1], "a list with currencies").toBe(false);
  addon.eval("TokenFrame.ScrollBox:SetDataProvider(0) CharacterFrame:Hide() CharacterFrame:Show()");
  expect([note()[1], addon.eval("return #ns.errors")], "empty again, watched once").toEqual([true, 0]);
});

// TEST-ONLY collections window, shaped like Blizzard_Collections' Mainline Wardrobe.xml: the journal (a window) holding
// WardrobeCollectionFrame, whose item grid and sets preview are CollectionsBackgroundTemplate frames (a leather tile and
// shadows on an InsetFrameTemplate: a Bg and a NineSlice) with models on them, and whose sets list is an InsetFrameTemplate.
// Made when the game loads the part.
const COLLECTIONS_ENV = PANE_ENV + `
  function __backdrop(parent)
    local f = CreateFrame("Frame", nil, parent)
    f.BackgroundTile, f.ShadowCornerTop, f.Bg = __art(f), __art(f, "BORDER"), __art(f)
    f.NineSlice = CreateFrame("Frame", nil, f) __art(f.NineSlice)
    return f
  end
  function __collections()
    __window("CollectionsJournal")
    local w = CreateFrame("Frame", "WardrobeCollectionFrame", CollectionsJournal)
    w.ItemsCollectionFrame = __backdrop(w)
    w.ItemsCollectionFrame.Model = CreateFrame("Frame", nil, w.ItemsCollectionFrame) __art(w.ItemsCollectionFrame.Model, "ARTWORK")
    w.SetsCollectionFrame = CreateFrame("Frame", nil, w)
    w.SetsCollectionFrame.RightInset, w.SetsCollectionFrame.LeftInset = __backdrop(w.SetsCollectionFrame), __backdrop(w.SetsCollectionFrame)
    -- as WardrobeItemsCollectionMixin: the filtered list for the slot (nil until the game makes it), redrawn by UpdateItems
    local items = w.ItemsCollectionFrame
    function items:GetFilteredVisualsList() return self.filteredVisualsList end
    function items:UpdateItems() end
    function items:SetSlot(n) self.filteredVisualsList = {} for i = 1, n do self.filteredVisualsList[i] = { visualID = i } end self:UpdateItems() end
  end
`;

it("appearances: the item grid's and the sets tab's leather backdrops are faded, with a flat inset panel behind the content", () => {
  const addon = loggedIn(COLLECTIONS_ENV);
  addon.eval("__collections()");
  expect(addon.eval("return __a(WardrobeCollectionFrame.ItemsCollectionFrame.BackgroundTile)"), "not before the part loads").toBe(-1);
  addon.fire("ADDON_LOADED", "Blizzard_Collections");
  addon.eval("CollectionsJournal:Show()");
  // A backdrop's tile, shadow, background and edge alphas, and whether it is panelled.
  const backdrop = (path) => addon.eval(`local f = WardrobeCollectionFrame.${path} return { __a(f.BackgroundTile), __a(f.ShadowCornerTop), __a(f.Bg), f.NineSlice:GetAlpha(), __panel(f) }`);
  expect(backdrop("ItemsCollectionFrame"), "the item grid: tile, shadows, inset background and edge faded, an inset panel").toEqual([0, 0, 0, 0, true]);
  expect([backdrop("SetsCollectionFrame.RightInset"), backdrop("SetsCollectionFrame.LeftInset")], "the sets tab's preview and list too").toEqual([[0, 0, 0, 0, true], [0, 0, 0, 0, true]]);
  expect(addon.eval("local m = WardrobeCollectionFrame.ItemsCollectionFrame.Model return { m:GetAlpha(), __a((m:GetRegions())) }"), "the appearance models on it are the game's").toEqual([1, -1]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CollectionsJournal:Hide() CollectionsJournal:Show()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "showing it again paints nothing new").toEqual([painted, 0]);
  const bare = loggedIn(COLLECTIONS_ENV + `__window("CollectionsJournal") CreateFrame("Frame", "WardrobeCollectionFrame", CollectionsJournal).SetsCollectionFrame = {}`);
  bare.fire("ADDON_LOADED", "Blizzard_Collections");
  const none = loggedIn(COLLECTIONS_ENV + `__window("CollectionsJournal")`);
  none.fire("ADDON_LOADED", "Blizzard_Collections");
  expect([bare.eval("CollectionsJournal:Show() return #ns.errors"), none.eval("CollectionsJournal:Show() return #ns.errors")], "a wardrobe without backdrops, or no wardrobe: no errors").toEqual([0, 0]);
});

it("appearances: an empty grid says so, and the note follows the slot the game redraws", () => {
  const addon = loggedIn(COLLECTIONS_ENV);
  addon.eval("__collections()");
  addon.fire("ADDON_LOADED", "Blizzard_Collections");
  addon.eval("CollectionsJournal:Show()");
  // The grid's note: its text and whether it shows.
  const note = () => addon.eval("local n = ns.FrameState('vgEmptyNote')[WardrobeCollectionFrame.ItemsCollectionFrame] return { n:GetText(), n:IsShown() }");
  expect(note()[1], "before the game has listed a slot: no note").toBe(false);
  addon.eval("WardrobeCollectionFrame.ItemsCollectionFrame:SetSlot(0)");
  expect(note(), "a slot with nothing collected").toEqual(["No appearances to show for this slot.", true]);
  addon.eval("WardrobeCollectionFrame.ItemsCollectionFrame:SetSlot(5)");
  expect(note()[1], "a slot with appearances").toBe(false);
  addon.eval("CollectionsJournal:Hide() CollectionsJournal:Show() WardrobeCollectionFrame.ItemsCollectionFrame:SetSlot(0)");
  expect([note()[1], addon.eval("return #ns.errors")], "watched once, still right after another show").toEqual([true, 0]);
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
  function __barState(bar) return { __a(bar.Track.Begin), __a(bar.Track.Thumb.Middle), __panel(bar.Track.Thumb), ns.FrameState('vgArrow')[bar.Back] ~= nil } end
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
  ns.GetModule("Windows").Add("windows", { "TestOnlyList" })
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

it("tabs and the window's padding: a tab set outside the window moves out to the panel's edge, once", () => {
  const addon = loggedIn(WINDOWS_ENV + SIDE_ENV + `
    __window("CommunitiesFrame") CommunitiesFrame:SetSize(400, 300) CommunitiesFrame:SetPoint("CENTER")
    local chat = __right(CommunitiesFrame, "ChatTab", true) chat:SetSize(32, 32) chat:SetPoint("TOPLEFT", CommunitiesFrame, "TOPRIGHT", 2, -40)
    local roster = __right(CommunitiesFrame, "RosterTab") roster:SetSize(32, 32) roster:SetPoint("TOP", chat, "BOTTOM", 0, -8)
    __window("TestOnlyBottom") TestOnlyBottom:SetSize(300, 200) TestOnlyBottom:SetPoint("CENTER")
    local tab = __tab(TestOnlyBottom, "TestOnlyBottomTab1") tab:SetSize(80, 24) tab:SetPoint("TOPLEFT", TestOnlyBottom, "BOTTOMLEFT", 11, 2)
    ns.GetModule("Windows").Add("windows", { "TestOnlyBottom" })`);
  addon.eval("CommunitiesFrame:Show() TestOnlyBottom:Show() CommunitiesFrame:Hide() CommunitiesFrame:Show()");
  const out = addon.eval(`local px = ns.Theme.Pixel(CommunitiesFrame) local pad = ns.GetModule("Windows").PAD - px
    local c, r, b = CommunitiesFrame.ChatTab.__points.TOPLEFT, CommunitiesFrame.RosterTab.__points.TOP, TestOnlyBottomTab1.__points.TOPLEFT
    return { math.abs(c.x - pad) < 1e-9, c.y, r.rel == CommunitiesFrame.ChatTab, r.y, b.x, math.abs(b.y + pad) < 1e-9, ns.Theme.Padding(CommunitiesFrame) }`);
  expect(out, "the guild window's first side tab sits on the panel's padded edge (shown twice: moved once), the next still follows it; the bottom tab drops below the padding").toEqual([true, -40, true, -8, 11, true, 12]);
  expect(addon.eval("return ns.errors[1] == nil")).toBe(true);
});

it("window controls: the corner close button and the max/min box sit the same in every window's corner", () => {
  const addon = loggedIn(WINDOWS_ENV + `
    __window("TestOnlyControls") TestOnlyControls:SetSize(300, 200) TestOnlyControls:SetPoint("CENTER")
    TestOnlyControls.CloseButton:SetSize(24, 24) TestOnlyControls.CloseButton:SetPoint("TOPRIGHT", TestOnlyControls, "TOPRIGHT", 1, 0)
    local box = CreateFrame("Frame", nil, TestOnlyControls) box:SetSize(32, 32) box:SetPoint("RIGHT", TestOnlyControls.CloseButton, "LEFT", 8, 0)
    box.MaximizeButton, box.MinimizeButton = CreateFrame("Button", nil, box), CreateFrame("Button", nil, box)
    TestOnlyControls.MaximizeMinimizeButton = box
    __window("TestOnlyOdd") TestOnlyOdd.CloseButton:SetPoint("BOTTOM", TestOnlyOdd, "BOTTOM", 0, 8)
    ns.GetModule("Windows").Add("windows", { "TestOnlyControls", "TestOnlyOdd" })
    __window("TestOnlyBare") TestOnlyBare.CloseButton:SetPoint("TOPRIGHT", TestOnlyBare, "TOPRIGHT", -3, -2)`);
  addon.eval("TestOnlyControls:Show() TestOnlyOdd:Show() TestOnlyControls:Hide() TestOnlyControls:Show()");
  const out = addon.eval(`local c, b = TestOnlyControls.CloseButton.__points.CENTER, TestOnlyControls.MaximizeMinimizeButton.__points.CENTER
    local function glyph(x) for _, r in ipairs({ x:GetRegions() }) do if r.__layer == "OVERLAY" then return (r.__texture or ""):match("(%a+)$") end end end
    return { c.rel == TestOnlyControls, c.x, c.y, b.rel == TestOnlyControls.CloseButton, b.x, b.y, glyph(TestOnlyControls.MaximizeMinimizeButton.MaximizeButton),
      TestOnlyOdd.CloseButton.__points.BOTTOM ~= nil, ns.errors[1] == nil }`);
  expect(out, "close 12 in from the corner both ways (24 from the panel's padded edge), the max/min box (its plain glyph) 28 to its left; a close button the game put elsewhere stays there")
    .toEqual([true, -px(addon, 12), -px(addon, 12), true, -28, 0, "Maximize", true, true]);
  // A window painted without padding (the finder, the calendar): its close button 24 in from the frame's own corner.
  addon.eval("ns.Theme.Panel(TestOnlyBare) ns.GetModule('Windows').DressClose(TestOnlyBare, TestOnlyBare.CloseButton)");
  expect(addon.eval("local c = TestOnlyBare.CloseButton.__points.CENTER return { c.rel == TestOnlyBare, c.relPoint, c.x, c.y }"), "an unpadded window's close button: 24 in from its corner both ways")
    .toEqual([true, "TOPRIGHT", -px(addon, 24), -px(addon, 24)]);
});

it("flight map: its map art stays when the window's art is faded", () => {
  const addon = loggedIn(WINDOWS_ENV + `
    __window("TaxiFrame")
    TaxiMap = TaxiFrame:CreateTexture("TaxiMap", "ARTWORK")
    TaxiFrame.InsetBg = TaxiFrame:CreateTexture(nil, "BACKGROUND")`);
  addon.eval("TaxiFrame:Show() TaxiFrame:Hide() TaxiFrame:Show()");
  expect(addon.eval("return { TaxiMap:GetAlpha(), TaxiFrame.InsetBg:GetAlpha(), TaxiFrame.NineSlice.__alpha }"), "the map (either texture the client draws it on) shows, the frame art is faded").toEqual([1, 1, 0]);
});

// TEST-ONLY side tabs of windows the game builds with its own holders, shaped like the Camelot ones: a window's side tabs
// by key (ProfessionsFrame, CooldownViewerSettings, the inspect window's ModeTabs), the collections window's TabContainer
// (two anchors on the window, a Tabs array) and the paper doll's PaperDollSidebarTabs (CheckButtons with an Icon and an
// unkeyed plate). __padOf says whether a tab's first anchor sits on the panel's padded edge, one pixel in.
const HOLDERS_ENV = PANE_ENV + `
  function __padOf(tab, point) return math.abs(tab.__points[point or "TOPLEFT"].x - (ns.GetModule("Windows").PAD - ns.Theme.Pixel(tab))) < 1e-9 end
  function __sized(w) w:SetSize(400, 300) w:SetPoint("CENTER") return w end
`;

it("side tabs: the professions window's, the cooldown settings' and the inspect guild tab are side tabs, out past the padding", () => {
  const addon = loggedIn(HOLDERS_ENV + `
    local profs = __sized(__window("TestOnlyProfs"))
    local first = __side(profs, "ProfessionsOverviewTab") first:SetSize(40, 40) first:SetPoint("TOPLEFT", profs, "TOPRIGHT", 0, -60)
    local next = __side(profs, "Professions1Tab") next:SetSize(40, 40) next:SetPoint("TOPLEFT", first, "BOTTOMLEFT", 0, -2)
    __side(profs, "Professions7Tab")
    local cd = __window("TestOnlyCooldown") __side(cd, "SpellsTab") __side(cd, "AurasTab") __side(cd, "GroupBuffsTab")
    ns.GetModule("Windows").Add("windows", { "TestOnlyProfs", "TestOnlyCooldown" })
    __window("InspectFrame") InspectFrame.ModeTabs = CreateFrame("Frame", nil, InspectFrame) InspectFrame.ModeTabs.Tabs = {}
    table.insert(InspectFrame.ModeTabs.Tabs, __side(InspectFrame.ModeTabs, "GuildTab"))
  `);
  const state = addon.eval(`return { __sideState(TestOnlyProfs.ProfessionsOverviewTab), __sideState(TestOnlyProfs.Professions1Tab), __sideState(TestOnlyProfs.Professions7Tab),
    __sideState(TestOnlyCooldown.SpellsTab), __sideState(TestOnlyCooldown.GroupBuffsTab), __sideState(InspectFrame.ModeTabs.GuildTab) }`);
  expect(state.map((s) => s.art), "each tab's plate faded").toEqual([0, 0, 0, 0, 0, 0]);
  expect(state.map((s) => s.dim), "and its icon greyed while it is not the selected tab: they are side tabs").toEqual([true, true, true, true, true, true]);
  expect(addon.eval("return { __padOf(TestOnlyProfs.ProfessionsOverviewTab), TestOnlyProfs.Professions1Tab.__points.TOPLEFT.rel == TestOnlyProfs.ProfessionsOverviewTab }"), "the first tab moved out to the panel's edge, the next still hangs from it").toEqual([true, true]);
  expect(addon.eval("return #ns.errors"), "nothing reported").toBe(0);
});

it("side tabs: the collections window's TabContainer tabs are side tabs, the container moves out past the padding by both anchors", () => {
  const addon = loggedIn(HOLDERS_ENV + `
    __sized(__window("CollectionsJournal"))
    local box = CreateFrame("Frame", nil, CollectionsJournal) CollectionsJournal.TabContainer = box box.Tabs = {}
    box:SetPoint("TOPLEFT", CollectionsJournal, "TOPRIGHT") box:SetPoint("BOTTOMLEFT", CollectionsJournal, "BOTTOMRIGHT")
    for _, key in ipairs({ "MountsTab", "PetsTab", "WardrobeTab" }) do table.insert(box.Tabs, __side(box, key)) end
    box.MountsTab:SetChecked(true)
  `);
  addon.fire("ADDON_LOADED", "Blizzard_Collections");
  const tabs = addon.eval("local b = CollectionsJournal.TabContainer return { __sideState(b.MountsTab), __sideState(b.PetsTab), __sideState(b.WardrobeTab) }");
  expect(tabs.map((s) => s.art), "the five tabs' game art is faded").toEqual([0, 0, 0]);
  expect(tabs.map((s) => [s.raised, s.dim]), "the checked tab is raised, the others' icons greyed").toEqual([[true, false], [false, true], [false, true]]);
  expect(addon.eval("local p = CollectionsJournal.TabContainer.__points return { p.TOPLEFT.x == p.BOTTOMLEFT.x, __padOf(CollectionsJournal.TabContainer), p.BOTTOMLEFT.rel == CollectionsJournal }"), "both anchors of the container moved the same distance, still on the window").toEqual([true, true, true]);
  addon.eval("CollectionsJournal:Show() CollectionsJournal:Hide() CollectionsJournal:Show()");
  expect(addon.eval("return { __padOf(CollectionsJournal.TabContainer), #ns.errors }"), "moved once").toEqual([true, 0]);
});

it("side tabs: the paper doll's sidebar tabs are dressed on the character window only, the plate faded and the icon kept", () => {
  const addon = loggedIn(HOLDERS_ENV + `
    local holder = CreateFrame("Frame", "PaperDollSidebarTabs", CharacterFrame) holder.Tabs = {}
    for i = 1, 3 do
      local t = CreateFrame("CheckButton", "PaperDollSidebarTab" .. i, holder)
      t.Icon = t:CreateTexture(nil, "BACKGROUND") __art(t, "BORDER") t:SetChecked(i == 1)
      holder.Tabs[i] = t
    end
  `);
  const tabs = addon.eval(`local t = PaperDollSidebarTabs.Tabs local out = {}
    for i = 1, 3 do local plate for _, r in ipairs({ t[i]:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then plate = r.__alpha end end
      out[i] = { plate, __sideState(t[i]) } end
    return out`);
  expect(tabs.map((t) => t[0]), "the unkeyed plate behind each icon is faded").toEqual([0, 0, 0]);
  expect(tabs.map((t) => [t[1].icon, t[1].raised, t[1].dim]), "the icon stays, the checked tab is raised and the others' icons are greyed").toEqual([[true, true, false], [true, false, true], [true, false, true]]);
  expect(addon.eval(`return { ns.GetModule("Windows").TabButtons(CharacterFrame).seen[PaperDollSidebarTab1] == true, ns.GetModule("Windows").TabButtons(MerchantFrame).seen[PaperDollSidebarTab1] == true }`), "the character window lists them, no other window does").toEqual([true, false]);
});

it("appearances: the Items and Sets tabs (top tabs on the page) are in the theme, the one the game disables raised", () => {
  const addon = loggedIn(COLLECTIONS_ENV);
  addon.eval(`__collections() local w = WardrobeCollectionFrame w.ItemsTab, w.SetsTab = __tab(w), __tab(w) w.SetsTab:Disable()`);
  addon.fire("ADDON_LOADED", "Blizzard_Collections");
  expect(addon.eval("local w = WardrobeCollectionFrame return { __tabState(w.ItemsTab), __tabState(w.SetsTab) }").map((s) => [s.art, s.raised]), "art faded; the disabled (selected) tab raised").toEqual([[0, false], [0, true]]);
  addon.eval("WardrobeCollectionFrame.SetsTab:Enable() WardrobeCollectionFrame.ItemsTab:Disable()");
  expect(addon.eval("local w = WardrobeCollectionFrame return { __tabState(w.ItemsTab).raised, __tabState(w.SetsTab).raised }"), "the raised tab follows the game's selection").toEqual([true, false]);
  const odd = loggedIn(COLLECTIONS_ENV);
  odd.eval(`__collections() WardrobeCollectionFrame.ItemsTab = true`);
  odd.fire("ADDON_LOADED", "Blizzard_Collections");
  expect(odd.eval("return #ns.errors"), "a page whose tab is not a frame is left alone").toBe(0);
});

it("guild bank side tabs: the plate faded, the icon button a tab with its icon and search dimmer kept, out past the padding", () => {
  const addon = loggedIn(HOLDERS_ENV + `
    local bank = __sized(__window("GuildBankFrame"))
    for i = 1, 3 do
      local tab = CreateFrame("Frame", "GuildBankTab" .. i, bank) tab:SetSize(42, 50)
      tab:SetPoint("TOPLEFT", i == 1 and bank or _G["GuildBankTab" .. (i - 1)], i == 1 and "TOPRIGHT" or "BOTTOMLEFT", i == 1 and -1 or 0, i == 1 and -17 or 0)
      __art(tab)
      local b = CreateFrame("CheckButton", nil, tab) tab.Button = b
      b.IconTexture, b.NormalTexture, b.SearchOverlay = __art(b, "BORDER"), __art(b, "ARTWORK"), __art(b, "ARTWORK")
      b:SetChecked(i == 2)
    end
    GuildBankTab3.Button = nil
    ns.GetModule("Windows").Add("windows", { "GuildBankFrame" })
  `);
  const out = addon.eval(`local b = GuildBankTab2.Button
    return { __a((GuildBankTab1:GetRegions())), __a(b.NormalTexture), __a(b.IconTexture), __a(b.SearchOverlay), __raised(b), __raised(GuildBankTab1.Button),
      math.abs(GuildBankTab1.__points.TOPLEFT.x - (ns.GetModule("Windows").PAD - ns.Theme.Pixel(GuildBankTab1))) < 1e-9, __a((GuildBankTab3:GetRegions())) }`);
  expect(out.slice(0, 4), "the plate and the button's bronze frame faded; its icon and the search dimmer are the game's").toEqual([0, 0, -1, -1]);
  expect(out.slice(4, 6), "the selected tab's button is raised, the other's not").toEqual([true, false]);
  expect(out[6], "the first tab sits at the panel's edge").toBe(true);
  expect(out[7], "a tab without its button still has its plate faded").toBe(0);
  expect(addon.eval("return #ns.errors"), "nothing reported").toBe(0);
});

// TEST-ONLY side panes shaped like CharacterFrameSidePaneTemplate (Camelot CharacterFrame.lua): a Title and Subtitle, a
// Divider, a Content holding pooled rows, and the methods that add rows (each row numbered by layoutIndex, shown on
// acquire, hidden by ResetRows); the game paints a label gold unless the caller gives a colour. __text says whether a
// font string is in the text colour, __gold whether it still has the game's gold.
const SIDE_PANE_ENV = BARS_ENV + `
  NORMAL_FONT_COLOR = { GetRGB = function() return 1, 0.82, 0 end }
  GREEN_FONT_COLOR = { GetRGB = function() return 0.1, 1, 0.1 end }
  function __text(fs) local c, t = fs.__textColor, { ns.Theme.RGB("text") } return c ~= nil and c[1] == t[1] and c[2] == t[2] and c[3] == t[3] end
  function __gold(fs) local c = fs.__textColor return c ~= nil and c[1] == 1 and c[2] == 0.82 and c[3] == 0 end
  function __sidePane(parent, key)
    local p = CreateFrame("Frame", nil, parent)
    p.Title, p.Subtitle, p.Divider = p:CreateFontString(), p:CreateFontString(), __art(p, "BORDER")
    p.Content, p.pool, p.layoutIndex = CreateFrame("Frame", nil, p), {}, 0
    function p:SetPaneTitle(title) self.Title:SetText(title) end
    function p:SetPaneTitleColor(c) self.Title:SetTextColor(c:GetRGB()) end
    function p:ResetRows() for _, r in ipairs(self.pool) do r:Hide() end self.layoutIndex = 0 end
    function p:Acquire(kind, color)
      local row
      for _, r in ipairs(self.pool) do if not r:IsShown() and r.kind == kind then row = r end end
      if not row then
        row = CreateFrame("Frame", nil, self.Content) row.kind, row.Label = kind, row:CreateFontString()
        if kind == "category" then row.Background = __art(row) end
        if kind == "icon" then row.IconSlot, row.Icon = __art(row), row:CreateTexture(nil, "ARTWORK") end
        table.insert(self.pool, row)
      end
      self.layoutIndex = self.layoutIndex + 1 row.layoutIndex = self.layoutIndex row:Show()
      row.Label:SetTextColor((color or NORMAL_FONT_COLOR):GetRGB())
      return row
    end
    function p:AddRow(label, value, labelColor) return self:Acquire("row", labelColor) end
    function p:AddWrappedRow(text, color) return self:Acquire("wrapped", color) end
    function p:AddIconRow(icon, text, color) if not icon then return self:AddWrappedRow(text, color) end return self:Acquire("icon", color) end
    function p:AddCategory(text) return self:Acquire("category") end
    if key then parent[key] = p end
    return p
  end
  local rep = __sidePane(ReputationFrame, "ReputationDetailFrame")
  for _, key in ipairs({ "AtWarCheckbox", "MakeInactiveCheckbox", "WatchFactionCheckbox" }) do
    local box = CreateFrame("CheckButton", nil, rep) box.Label = box:CreateFontString() box.Label:SetTextColor(NORMAL_FONT_COLOR:GetRGB()) rep[key] = box
  end
  rep.AtWarCheckbox.Label:SetTextColor(1, 0, 0)
  rep.StandingBar = CreateFrame("Frame", nil, rep) rep.StandingBar.backdrop, rep.StandingBar.Fill = __art(rep.StandingBar), __art(rep.StandingBar, "BORDER")
  rep.ViewRenownButton = CreateFrame("Button", nil, rep)
  __bar(rep, "DescriptionScrollBar")
  __sidePane(SkillsFrame, "SkillDetailFrame")
  local tok = __sidePane(TokenFrame, "DetailFrame")
  for _, key in ipairs({ "InactiveCheckbox", "BackpackCheckbox" }) do
    local box = CreateFrame("CheckButton", nil, tok) box.Label = box:CreateFontString() box.Label:SetTextColor(NORMAL_FONT_COLOR:GetRGB()) tok[key] = box
  end
  tok.CurrencyTransferToggleButton = CreateFrame("Button", nil, tok)
  PVPRankFrame = CreateFrame("Frame", "PVPRankFrame", CharacterFrame)
  __sidePane(PVPRankFrame, "DetailFrame")
`;

it("side panes: heading in the heading role and the text colour (again after the game recolours it), the rule faded", () => {
  const addon = loggedIn(SIDE_PANE_ENV);
  // Reads whether each pane's heading is in the heading role and the text colour.
  const heads = () => addon.eval(`return { __headed(ReputationFrame.ReputationDetailFrame.Title), __headed(SkillsFrame.SkillDetailFrame.Title), __headed(TokenFrame.DetailFrame.Title), __headed(PVPRankFrame.DetailFrame.Title) }`);
  expect(heads(), "all four panes' headings").toEqual([true, true, true, true]);
  addon.eval(`local p = ReputationFrame.ReputationDetailFrame p:SetPaneTitle("Stormwind") p:SetPaneTitleColor(GREEN_FONT_COLOR) PVPRankFrame.DetailFrame:SetPaneTitleColor(GREEN_FONT_COLOR)`);
  expect(heads(), "the game sets the pane's colour on every refresh: the text colour goes back on").toEqual([true, true, true, true]);
  expect(addon.eval(`return { __a(ReputationFrame.ReputationDetailFrame.Divider), __a(PVPRankFrame.DetailFrame.Divider) }`), "the rule under the subtitle is faded").toEqual([0, 0]);
  expect(addon.eval("return #ns.errors"), "nothing reported").toBe(0);
});

it("side panes: each row the game adds is dressed: gold labels to the text colour, a colour the game gave stays, plates faded", () => {
  const addon = loggedIn(SIDE_PANE_ENV);
  addon.eval(`rep = ReputationFrame.ReputationDetailFrame
    rows = { rep:AddRow("Cap", "100"), rep:AddRow("Paid", "1", GREEN_FONT_COLOR), rep:AddWrappedRow("Hello", NORMAL_FONT_COLOR), rep:AddWrappedRow("Account", GREEN_FONT_COLOR),
      rep:AddCategory("Next reward"), rep:AddIconRow(134, "Reward", NORMAL_FONT_COLOR), rep:AddIconRow(nil, "No icon") }`);
  // Reads whether a row's label is in the text colour and the game's gold.
  const row = (i) => addon.eval(`return { __text(rows[${i}].Label), __gold(rows[${i}].Label) }`);
  expect([row(1), row(3), row(5), row(6), row(7)].map((r) => r[0]), "a label left gold, one given the game's gold, a category's, an icon row's and a wrapped row without an icon").toEqual([true, true, true, true, true]);
  expect([row(2), row(4)].map((r) => r[0]), "a colour the game chose (green) is content").toEqual([false, false]);
  expect(addon.eval("return { __a(rows[5].Background), __a(rows[6].IconSlot) }"), "the category's plate and the icon row's bronze plate are faded").toEqual([0, 0]);
  expect(addon.eval("return { ns.FrameState('vgSideSlot')[rows[6]] ~= nil, ns.FrameState('vgSideSlot')[rows[1]] == nil }"), "only the icon row gets a slot tile").toEqual([true, true]);
  const tile = addon.eval(`local slot = ns.FrameState('vgSideSlot')[rows[6]] local row = rows[6]
    return { slot:GetParent() == row, slot:GetFrameLevel() < row:GetFrameLevel(), slot.__points.TOPLEFT.rel == row.Icon, __panel(slot) }`);
  expect(tile, "a slot on a frame under the row, sized to the icon, painted").toEqual([true, true, true, true]);
  addon.eval(`rep:ResetRows() rows2 = { rep:AddIconRow(134, "Again"), rep:AddCategory("Back") }`);
  expect(addon.eval("return { rows2[1] == rows[6], select('#', rows2[1]:GetChildren()), __text(rows2[2].Label), __a(rows2[2].Background) }"), "a pooled row comes back dressed with its one slot").toEqual([true, 1, true, 0]);
  expect(addon.eval("return #ns.errors"), "nothing reported").toBe(0);
});

it("side panes: rows a pane already has when it is dressed get their art done; a pane without the methods or parts is left alone", () => {
  const addon = loggedIn(SIDE_PANE_ENV + `
    early = PVPRankFrame.DetailFrame
    earlyIcon, earlyCategory = early:AddIconRow(1, "Already"), early:AddCategory("Here")
    early.AddRow, early.SetPaneTitleColor = nil, nil
    SkillsFrame.SkillDetailFrame.Title = nil
    TokenFrame.DetailFrame.Content = nil
    ReputationFrame.ReputationDetailFrame.ViewRenownButton = true
  `);
  expect(addon.eval("return { __a(earlyIcon.IconSlot), __a(earlyCategory.Background), ns.FrameState('vgSideSlot')[earlyIcon] ~= nil }"), "faded and the slot made").toEqual([0, 0, true]);
  addon.eval("early:SetPaneTitle('Rank') early:AddWrappedRow('Note', GREEN_FONT_COLOR)");
  expect(addon.eval("return { __headed(early.Title), #ns.errors }"), "the pane's heading is dressed without the methods; no errors for a pane without Title, Content or a real button").toEqual([true, 0]);
});

it("side panes: the reputation and currency panes' check boxes, standing bar, push buttons and description scroll bar are in the theme", () => {
  const addon = loggedIn(SIDE_PANE_ENV);
  const parts = addon.eval(`local r, t = ReputationFrame.ReputationDetailFrame, TokenFrame.DetailFrame
    local function box(b) return ns.Theme.CheckParts(b) ~= nil end
    return { box(r.AtWarCheckbox), box(r.MakeInactiveCheckbox), box(r.WatchFactionCheckbox), box(t.InactiveCheckbox), box(t.BackpackCheckbox),
      __text(r.AtWarCheckbox.Label), __text(r.MakeInactiveCheckbox.Label), __text(r.WatchFactionCheckbox.Label), __text(t.InactiveCheckbox.Label), __text(t.BackpackCheckbox.Label),
      __a(r.StandingBar.backdrop), __a(r.StandingBar.Fill), __panel(r.StandingBar), __panel(r.ViewRenownButton), __panel(t.CurrencyTransferToggleButton) }`);
  expect(parts.slice(0, 5), "five check boxes as the theme's").toEqual([true, true, true, true, true]);
  expect(parts.slice(5, 10), "their labels go to the text colour, At war's red stays").toEqual([false, true, true, true, true]);
  expect(parts.slice(10), "the standing bar's backdrop faded with its fill kept and a panel behind, and the push buttons painted").toEqual([0, -1, true, true, true]);
  expect(addon.eval("return __barState(ReputationFrame.ReputationDetailFrame.DescriptionScrollBar)"), "the description's scroll bar is reached with the window's").toEqual([0, 0, true, true]);
  const bare = loggedIn(SIDE_PANE_ENV + `ReputationFrame.ReputationDetailFrame.MakeInactiveCheckbox = CreateFrame("Frame", nil, UIParent) TokenFrame.DetailFrame.ViewRenownButton = true`);
  expect(bare.eval("return #ns.errors"), "a part that is not a check button or a button is skipped").toBe(0);
});

it("side panes: each Refresh puts the reputation pane's gold check box labels back in the text colour; a grey one stays grey", () => {
  const addon = loggedIn(SIDE_PANE_ENV + `
    local rep = ReputationFrame.ReputationDetailFrame
    function rep:Refresh() self.MakeInactiveCheckbox.Label:SetTextColor((__canInactive and NORMAL_FONT_COLOR or { GetRGB = function() return 0.5, 0.5, 0.5 end }):GetRGB()) end`);
  addon.eval("__canInactive = true ReputationFrame.ReputationDetailFrame:Refresh()");
  const label = "ReputationFrame.ReputationDetailFrame.MakeInactiveCheckbox.Label";
  expect(addon.eval(`return __text(${label})`), "a faction you can make inactive: the text colour").toBe(true);
  addon.eval("__canInactive = false ReputationFrame.ReputationDetailFrame:Refresh()");
  expect(addon.eval(`return ${label}.__textColor[1]`), "one you can't: the game's grey").toBe(0.5);
});

it("a window that sets its own title colour (the character pane, after it shows) gets the light title back each time", () => {
  const addon = loggedIn(WINDOWS_ENV + `
    local f = __window("CharacterFrame")
    function f:SetTitleColor(c) self.TitleContainer.TitleText:SetTextColor(c.r, c.g, c.b) end`);
  addon.eval("CharacterFrame:Show() CharacterFrame:SetTitleColor({ r = 1, g = 0.82, b = 0 }) CharacterFrame:Hide() CharacterFrame:Show() CharacterFrame:SetTitleColor({ r = 1, g = 0.82, b = 0 })");
  expect(isTok(addon, addon.eval("return CharacterFrame.TitleContainer.TitleText.__textColor"), "text"), "the text colour after the game's gold, each show").toBe(true);
});

it("pane lists: the rules over and under each list are one pixel of divider, a header's name goes to the text colour", () => {
  const addon = loggedIn(PANE_ENV + `
    function __ruled(f) local line = CreateFrame("Frame", nil, f.ScrollBox) line.rule = __art(line, "OVERLAY") f.rule = line.rule end
    __ruled(ReputationFrame) __ruled(SkillsFrame) __ruled(TokenFrame)
    __text = function(fs) local c, t = fs.__textColor, { ns.Theme.RGB("text") } return c ~= nil and c[1] == t[1] and c[2] == t[2] and c[3] == t[3] end
    __repHeader.Name = __repHeader:CreateFontString() __repHeader.Name:SetTextColor(1, 0.82, 0)
  `);
  expect(addon.eval("return { __a(ReputationFrame.rule), __a(SkillsFrame.rule), __a(TokenFrame.rule) }"), "the rule lines of all three lists faded").toEqual([0, 0, 0]);
  expect(addon.eval("return { ns.Theme.DividerParts(ReputationFrame.rule) ~= nil, ns.Theme.DividerParts(SkillsFrame.rule) ~= nil, ns.Theme.DividerParts(TokenFrame.rule) ~= nil, ns.Theme.DividerParts(__repHeader.banner) == nil }"), "each drawn as one pixel of divider; a row's art is not").toEqual([true, true, true, true]);
  expect(addon.eval("return { __a(__repHeader.banner), ns.Theme.DividerParts(__repHeader.StateIcon) == nil }"), "a header row's own art is not taken for a rule line").toEqual([0, true]);
  const later = addon.eval(`local h = __header(ReputationFrame.ScrollBox) h.Name = h:CreateFontString() h.Name:SetTextColor(1, 0.82, 0) ReputationFrame.ScrollBox:Acquire(h) return { __text(__repHeader.Name), __text(h.Name) }`);
  expect(later, "the header's name in the text colour, a header acquired later too").toEqual([true, true]);
});

// TEST-ONLY list rows shaped like Camelot ReputationFrame.xml and StatisticsFrame.xml: a header whose StateIcon the
// game sets a plus or minus atlas on, entries whose Content holds the rounded BackgroundHighlight (three atlas pieces
// in TextureRegions) the game refreshes, and a sub-header with a ToggleCollapseButton whose normal texture shows the
// red plus or minus square. The statistics list loads with its own part of the game.
const FOLD_ENV = PANE_ENV + `
  function __glowEntry(box)
    local e = __entry(box, "ReputationBar")
    local glow = CreateFrame("Frame", nil, e.Content)
    glow.TextureRegions = { __art(glow), __art(glow), __art(glow) }
    e.Content.BackgroundHighlight, e.selected, e.atWar, e.elementData = glow, false, false, {}
    function e:IsSelected() return self.selected end
    function e:IsAtWar() return self.elementData.atWarWith or self.atWar end
    function e:RefreshBackgroundHighlight() self.Content.BackgroundHighlight:SetAlpha((self.atWar and 0.5) or (self.selected and 0.2) or 0.1) end
    return e
  end
  function __subHeader(box)
    local e = __glowEntry(box)
    local b = CreateFrame("Button", nil, e)
    b.normal, b.pushed = __art(b, "ARTWORK"), __art(b, "ARTWORK")
    b.GetNormalTexture = function(self) return self.normal end
    b.normal:SetAtlas("campaign_headericon_closed")
    e.ToggleCollapseButton = b
    return e
  end
  __repHeader.StateIcon:SetAtlas("common-button-list-minus")
  __faction, __sub = __glowEntry(ReputationFrame.ScrollBox), __subHeader(ReputationFrame.ScrollBox)
  __statsEarly = CreateFrame("Frame", nil, CharacterFrame) __statsEarly.ScrollBox = __box(__statsEarly)
  __statHeader, __statLine = __header(__statsEarly.ScrollBox), __glowEntry(__statsEarly.ScrollBox)
  __statLine.IsSelected, __statLine.IsAtWar = nil, nil
  function __fold(mark) return ns.FrameState("vgFold")[mark] end
  function __pointing(mark) return __fold(mark).__texture == ns.Theme.Icon("Right") and "right" or __fold(mark).__texture == ns.Theme.Icon("Down") and "down" or "?" end
`;

it("pane lists: a header's plus/minus and a sub-header's red square are the theme's chevron, following the game's fold", () => {
  const addon = loggedIn(FOLD_ENV);
  // The header and sub-header marks' alphas, and the way each chevron points.
  const marks = () => addon.eval(`return { __a(__repHeader.StateIcon), __pointing(__repHeader.StateIcon), __a(__sub.ToggleCollapseButton.normal), __a(__sub.ToggleCollapseButton.pushed), __pointing(__sub.ToggleCollapseButton.normal) }`);
  expect(marks(), "the game's marks hidden; the header open (Down), the sub-header folded (Right)").toEqual([0, "down", 0, 0, "right"]);
  addon.eval(`__repHeader.StateIcon:SetAtlas("common-button-list-plus") __sub.ToggleCollapseButton.normal:SetAtlas("campaign_headericon_open")`);
  expect(marks(), "each chevron turns as the game folds and opens its group").toEqual([0, "right", 0, 0, "down"]);
  addon.eval(`__sub.ToggleCollapseButton.normal:SetAtlas("campaign_headericon_openpressed") ReputationFrame.ScrollBox:Acquire(__repHeader)`);
  expect(addon.eval(`return { __pointing(__sub.ToggleCollapseButton.normal), __a(__repHeader.StateIcon), __fold(__repHeader.StateIcon):GetAlpha() ~= 0 }`), "a pressed atlas leaves it; a pooled header comes back with its chevron, not faded").toEqual(["down", 0, true]);
  expect(addon.eval(`local b = __fold(__repHeader.StateIcon) return { b:GetWidth(), b.__vertexColor ~= nil, #ns.errors }`)[0], "the section header's chevron size").toBe(addon.eval("return ns.Theme.PixelRound(UIParent, 12, true)"));
});

it("pane lists: an entry's rounded highlight gives way to the theme's row look, kept flat for a faction at war", () => {
  const addon = loggedIn(FOLD_ENV);
  // An entry's highlight frame alpha, whether its three pieces are flat, and its selected look.
  const row = (e) => addon.eval(`local g = ${e}.Content.BackgroundHighlight local s = ns.Theme.RowParts(${e})
    return { g:GetAlpha(), g.TextureRegions[1].__texture == ns.Theme.WHITE and g.TextureRegions[3].__texture == ns.Theme.WHITE, s.selected == true }`);
  addon.eval("__faction:RefreshBackgroundHighlight()");
  expect(row("__faction"), "hidden under the mouse, its pieces flat, a theme row").toEqual([0, true, false]);
  addon.eval("__faction.selected = true __faction:RefreshBackgroundHighlight()");
  expect(row("__faction"), "the selected faction shows the one selected look instead of the game's wash").toEqual([0, true, true]);
  addon.eval("__faction.atWar, __faction.selected = true, false __faction:RefreshBackgroundHighlight()");
  expect(row("__faction"), "at war: the game's red band stays, flat").toEqual([0.5, true, false]);
  expect(row("__sub"), "a sub-header is an entry too").toEqual([0, true, false]);
  const early = addon.eval(`local e = __entry(ReputationFrame.ScrollBox, "ReputationBar") e.Content.BackgroundHighlight = CreateFrame("Frame", nil, e.Content)
    e.Content.BackgroundHighlight.TextureRegions = {} e.IsAtWar = function(self) return self.elementData.atWarWith end e.RefreshBackgroundHighlight = function() end
    ReputationFrame.ScrollBox:Acquire(e) local before = { e.Content.BackgroundHighlight.__alpha == nil, #ns.errors }
    e.elementData = { atWarWith = false } e:RefreshBackgroundHighlight() return { before[1], before[2], e.Content.BackgroundHighlight:GetAlpha(), #ns.errors }`);
  expect(early, "a row acquired before the game fills it (no elementData yet) is left until its first refresh, with no error").toEqual([true, 0, 0, 0]);
  const bare = loggedIn(FOLD_ENV + "__plain = __entry(SkillsFrame.ScrollBox, 'SkillsBar') __noToggle = __glowEntry(SkillsFrame.ScrollBox) __noToggle.ToggleCollapseButton = true");
  expect(bare.eval("return { ns.Theme.RowParts(__plain) == nil, ns.Theme.RowParts(__noToggle) ~= nil, #ns.errors }"), "an entry without the game's highlight is left alone; a toggle that is not a button is skipped").toEqual([true, true, 0]);
});

it("statistics: the list that loads with its own part of the game gets the panel, flat headers and theme rows", () => {
  const addon = loggedIn(FOLD_ENV);
  expect(addon.eval("return __a(__statHeader.banner)"), "not before the statistics load").toBe(-1);
  addon.eval("StatisticsFrame = __statsEarly");
  addon.fire("ADDON_LOADED", "Blizzard_Statistics");
  addon.eval("__statLine:RefreshBackgroundHighlight()");
  const stats = addon.eval(`return { __panel(StatisticsFrame.ScrollBox), __a(__statHeader.banner), __a(__statHeader.StateIcon), __pointing(__statHeader.StateIcon),
    __statLine.Content.BackgroundHighlight:GetAlpha(), ns.Theme.RowParts(__statLine) ~= nil, #ns.errors }`);
  expect(stats, "an inset panel behind the list, a flat header with a chevron (open until the game sets an atlas), a statistic a theme row with the game's hover wash hidden").toEqual([true, 0, 0, "down", 0, true, 0]);
});

it("stat boxes: the bronze edge, class crest and rule are faded for an inset panel, stat lines lose their stripe and their names go to the text colour", () => {
  const addon = loggedIn(PANE_ENV + `
    __text = function(fs) local c, t = fs.__textColor, { ns.Theme.RGB("text") } return c ~= nil and c[1] == t[1] and c[2] == t[2] and c[3] == t[3] end
    CharacterStatsPane = CreateFrame("Frame", "CharacterStatsPane", CharacterFrame)
    CharacterStatsPane.ItemLevelFrame = CreateFrame("Frame", nil, CharacterStatsPane) CharacterStatsPane.ItemLevelFrame.Background = __art(CharacterStatsPane.ItemLevelFrame)
    local function box(name) local b = CreateFrame("Frame", name, CharacterFrame) b.Border, b.ClassBackground, b.rule = __art(b, "BORDER"), __art(b), __art(b, "BORDER") b.ScrollBox = __box(b) return b end
    box("CharacterStatsPaneScrollBox") box("CharacterStatsPanePetScrollBox")
    local function line(parent, withIcon)
      local r = CreateFrame("Frame", nil, parent) r.Background, r.Label = __art(r), r:CreateFontString() r.Label:SetTextColor(1, 0.82, 0)
      r.Value = r:CreateFontString() r.Value:SetTextColor(1, 1, 1)
      return parent:Acquire(r)
    end
    __line, __petLine = line(CharacterStatsPaneScrollBox.ScrollBox), line(CharacterStatsPanePetScrollBox.ScrollBox)
  `);
  // Reads whether a scroll box's parts are faded and its panel is there.
  const box = (name) => addon.eval(`local b = ${name} return { __a(b.Border), __a(b.ClassBackground), __a(b.rule), __panel(b) }`);
  expect([box("CharacterStatsPaneScrollBox"), box("CharacterStatsPanePetScrollBox")], "both boxes: edge, crest and rule faded, a panel in their place").toEqual([[0, 0, 0, true], [0, 0, 0, true]]);
  expect(addon.eval("return { __a(__line.Background), __text(__line.Label), __a(__petLine.Background), __text(__petLine.Label), __text(__line.Value) }"), "a stat line: stripe faded, name in the text colour, value untouched").toEqual([0, true, 0, true, false]);
  expect(addon.eval("local f = CharacterStatsPane.ItemLevelFrame return { __a(f.Background), __panel(f) }"), "the item level's plate faded with a panel behind the number").toEqual([0, true]);
  const later = addon.eval("local r = CharacterStatsPaneScrollBox.ScrollBox:Acquire(CreateFrame('Frame')) return #ns.errors");
  expect(later, "a row the game acquires without parts is left alone").toBe(0);
});

it("honor tab: the season timer, the season's name and the progress line go to the text colour", () => {
  const addon = loggedIn(PANE_ENV + `
    PVPRankFrame = CreateFrame("Frame", "PVPRankFrame", CharacterFrame)
    PVPRankFrame.SeasonTimerField = PVPRankFrame:CreateFontString() PVPRankFrame.MainInfoFrame = CreateFrame("Frame", nil, PVPRankFrame)
    PVPRankFrame.MainInfoFrame.CurrentSeasonField, PVPRankFrame.MainInfoFrame.CurrentRankProgressField = PVPRankFrame.MainInfoFrame:CreateFontString(), PVPRankFrame.MainInfoFrame:CreateFontString()
    __text = function(fs) local c, t = fs.__textColor, { ns.Theme.RGB("text") } return c ~= nil and c[1] == t[1] and c[2] == t[2] and c[3] == t[3] end
    PVPRankFrame.MainInfoFrame.CurrentRankField = PVPRankFrame.MainInfoFrame:CreateFontString()
  `);
  expect(addon.eval("local i = PVPRankFrame.MainInfoFrame return { __text(PVPRankFrame.SeasonTimerField), __text(i.CurrentSeasonField), __text(i.CurrentRankProgressField), i.CurrentRankField.__textColor == nil }"), "the three gold texts, not the rank name (white already)").toEqual([true, true, true, true]);
  const bare = loggedIn(PANE_ENV + `PVPRankFrame = CreateFrame("Frame", "PVPRankFrame", CharacterFrame) PVPRankFrame.SeasonTimerField = PVPRankFrame:CreateFontString()`);
  expect(bare.eval("return { __text and 1 or 0, #ns.errors }").slice(1), "a tab without its main frame").toEqual([0]);
});

it("GW.WatchRows: rows now and later, once per box, a failing skin reported and the others still done, boxes that are not lists skipped", () => {
  expectErrors(/^skin row: eval:\d+: TEST-ONLY: bad row$/);
  const addon = loggedIn(PANE_ENV + `
    __seen = {}
    __first = __box(UIParent) __first:Acquire(CreateFrame("Frame", nil, __first))
    local GW = ns.GetModule("Windows")
    GW.WatchRows(__first, function(row) table.insert(__seen, row) if #__seen == 2 then error("TEST-ONLY: bad row") end end)
    GW.WatchRows(__first, function() error("TEST-ONLY: watched twice") end)
    GW.WatchRows(nil, function() end) GW.WatchRows({}, function() end)
  `);
  expect(addon.eval("return #__seen"), "the row it had").toBe(1);
  addon.eval("__first:Acquire(CreateFrame('Frame', nil, __first)) __first:Acquire(CreateFrame('Frame', nil, __first))");
  expect(addon.eval("return { #__seen, #ns.errors }"), "rows acquired later, one failing is reported once and the next still done").toEqual([3, 1]);
  const noUtil = loggedIn(PANE_ENV + `ScrollUtil = nil local b = __box(UIParent) ns.GetModule("Windows").WatchRows(b, function() end)`);
  expect(noUtil.eval("return #ns.errors"), "a client without ScrollUtil").toBe(0);
});

// TEST-ONLY paper doll: the titles list and the equipment sets list (a pane each, with a ScrollBox of rows), the set
// buttons, and a reader for a gear set's missing-items count.
const PAPER_ENV = SIDE_PANE_ENV + `
  PaperDollFrame = CreateFrame("Frame", "PaperDollFrame", CharacterFrame)
  function __pane(key)
    local p = CreateFrame("Frame", nil, PaperDollFrame)
    p.Border, p.Line, p.ScrollBox = __art(p, "BORDER"), __art(p, "BORDER"), __box(p)
    PaperDollFrame[key] = p
    return p
  end
  __titles, __sets = __pane("TitleManagerPane"), __pane("EquipmentManagerPane")
  function __titleRow(selected)
    local r = CreateFrame("Button", nil, __titles.ScrollBox)
    r.Stripe, r.Check, r.SelectedBar = __art(r), __art(r, "BORDER"), __art(r, "OVERLAY")
    r.text = r:CreateFontString() r.text:SetTextColor(NORMAL_FONT_COLOR:GetRGB())
    r.SelectedBar:SetShown(selected == true)
    return __titles.ScrollBox:Acquire(r)
  end
  function __setRow(id, selected)
    local r = CreateFrame("Button", nil, __sets.ScrollBox)
    r.setID, r.plate, r.ring, r.SpecRing = id, __art(r), __art(r, "ARTWORK"), __art(r, "OVERLAY")
    r.icon, r.Check, r.SpecIcon, r.HighlightBar, r.SelectedBar = __art(r, "ARTWORK"), __art(r, "BORDER"), __art(r, "OVERLAY"), __art(r), __art(r)
    r.text = r:CreateFontString() r.text:SetTextColor(NORMAL_FONT_COLOR:GetRGB())
    r.SelectedBar:SetShown(selected == true)
    return __sets.ScrollBox:Acquire(r)
  end
  -- The game's selection functions, which its init and click run with the row and whether it is the selected one.
  function PaperDollTitlesPane_SetButtonSelected(button, selected) button.SelectedBar:SetShown(selected) end
  function PaperDollEquipmentManagerPane_SetButtonSelected(button, selected) button.SelectedBar:SetShown(selected) end
  function __lit(r) return ns.Theme.RowParts(r).rail:IsShown() end
  for _, key in ipairs({ "EquipSet", "SaveSet", "NewSet" }) do
    local b = CreateFrame("Button", nil, __sets) b.StateTexture, b.plus = __art(b), __art(b, "ARTWORK") b.label = b:CreateFontString()
    __sets[key] = b
  end
  C_EquipmentSet = { GetEquipmentSetInfo = function(id) return "Set", 1, id, false, 0, 0, 0, id == 2 and 3 or 0 end }
`;

it("paper doll lists: the titles and sets panes are flat insets, a title row loses its stripe, a set row its card plate and rings", () => {
  const addon = loggedIn(PAPER_ENV + `__titleRow() __setRow(1) __setRow(2)`);
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return { __a(__titles.Border), __panel(__titles), __a(__sets.Border), __a(__sets.Line), __panel(__sets) }"), "both panes: edge and rule faded, an inset panel").toEqual([0, true, 0, 0, true]);
  // A title row's stripe alpha, its tick and selected bar alphas (-1: the game's), and whether its text is in the text colour.
  const title = (i) => addon.eval(`local r = __titles.ScrollBox.rows[${i}] return { __a(r.Stripe), __a(r.Check), __a(r.SelectedBar), __text(r.text), __lit(r) }`);
  expect(title(1), "stripe and selected bar faded, tick the game's, text in the text colour, not lit").toEqual([0, -1, 0, true, false]);
  addon.eval("__titleRow()");
  expect(title(2), "a title row acquired later too").toEqual([0, -1, 0, true, false]);
  addon.eval("PaperDollTitlesPane_SetButtonSelected(__titles.ScrollBox.rows[2], true)");
  expect([title(1)[4], title(2)[4]], "the selected rail follows the game marking a title selected").toEqual([false, true]);
  addon.eval("PaperDollTitlesPane_SetButtonSelected(__titles.ScrollBox.rows[2], false) PaperDollTitlesPane_SetButtonSelected(__titles.ScrollBox.rows[1], true)");
  expect([title(1)[4], title(2)[4]], "and moves with the selection").toEqual([true, false]);
  // A set row's plate and rings, then what stays (icon, tick, spec icon, hover and selected card), then its name's colour.
  const set = (i) => addon.eval(`local r = __sets.ScrollBox.rows[${i}] return { __a(r.plate), __a(r.ring), __a(r.SpecRing), __a(r.icon), __a(r.Check), __a(r.SpecIcon), __a(r.HighlightBar), __a(r.SelectedBar), __text(r.text), ns.Theme.RowParts(r) ~= nil, __lit(r) }`);
  expect(set(1), "plate, rings and cards faded, icon, tick and spec icon the game's, name in the text colour, a theme row, not lit").toEqual([0, 0, 0, -1, -1, -1, 0, 0, true, true, false]);
  addon.eval("PaperDollEquipmentManagerPane_SetButtonSelected(__sets.ScrollBox.rows[2], true)");
  expect([set(1)[10], set(2)[10]], "the selected rail follows the game marking a set selected").toEqual([false, true]);
  addon.eval("PaperDollEquipmentManagerPane_SetButtonSelected(__sets.ScrollBox.rows[2], false)");
  expect(set(2)[10], "and clears with it").toBe(false);
  expect(addon.eval("return __gold(__sets.ScrollBox.rows[2].text)"), "a set with items missing keeps the game's name colour").toBe(true);
  addon.eval("__setRow(1, true) __titleRow(true)");
  expect(addon.eval("return { __lit(__sets.ScrollBox.rows[1]), __lit(__sets.ScrollBox.rows[3]), __lit(__titles.ScrollBox.rows[3]) }"), "a row the game already marked selected when dressed is lit at once").toEqual([false, true, true]);
  expect(set(3)[0], "a set row acquired later too").toBe(0);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("paper doll lists: the set buttons are theme buttons, the New set button keeps its plus", () => {
  const addon = loggedIn(PAPER_ENV);
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return { __a(__sets.EquipSet.StateTexture), __panel(__sets.EquipSet), __a(__sets.SaveSet.StateTexture), __panel(__sets.SaveSet) }"), "Equip and Save flat").toEqual([0, true, 0, true]);
  expect(addon.eval("return { __a(__sets.NewSet.StateTexture), __a(__sets.NewSet.plus), __panel(__sets.NewSet) }"), "New set: plate faded, plus kept, flat").toEqual([0, 1, true]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CharacterFrame:Hide() CharacterFrame:Show()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "a second show paints nothing more").toEqual([painted, 0]);
});

it("paper doll lists: a client without the equipment set API, or panes without parts, loads cleanly", () => {
  const bare = loggedIn(PAPER_ENV + `C_EquipmentSet = nil PaperDollTitlesPane_SetButtonSelected, PaperDollEquipmentManagerPane_SetButtonSelected = nil, nil __setRow(2) __sets.NewSet = {} __sets.EquipSet = nil __titles.ScrollBox = nil`);
  expect(bare.eval("CharacterFrame:Show() return { __text(__sets.ScrollBox.rows[1].text), #ns.errors }"), "no API: the name goes to the text colour").toEqual([true, 0]);
  const hollow = loggedIn(PAPER_ENV + `PaperDollFrame.TitleManagerPane = {} PaperDollFrame.EquipmentManagerPane = {}`);
  expect(hollow.eval("CharacterFrame:Show() return #ns.errors"), "panes that are not frames").toBe(0);
});

it("paper doll: each slot's BorderFrame and the ammo plate are faded, the pet bar and level lines are in the theme", () => {
  const addon = loggedIn(PANE_ENV + `
    PaperDollFrame = CreateFrame("Frame", "PaperDollFrame", CharacterFrame)
    function __slot(name) local b = CreateFrame("Button", "Character" .. name .. "Slot", CharacterFrame) b.BorderFrame = CreateFrame("Frame", nil, b) return b end
    __head = __slot("Head") __headFrame = __art(__head.BorderFrame)
    __ammo = __slot("Ammo") __ammo.BorderFrame = nil
    __plate, __icon, __ignore = __art(__ammo), __ammo:CreateTexture(nil, "BORDER"), __art(__ammo, "OVERLAY")
    CharacterAmmoSlotIconTexture, __ammo.ignoreTexture = __icon, __ignore
    PetPaperDollFrameExpBar = CreateFrame("Frame", "PetPaperDollFrameExpBar", PaperDollFrame)
    PetPaperDollFrameExpBar.backdrop, PetPaperDollFrameExpBar.Fill = __art(PetPaperDollFrameExpBar), __art(PetPaperDollFrameExpBar, "BORDER")
    CharacterLevelText, PetCharacterLevelText = PaperDollFrame:CreateFontString(), PaperDollFrame:CreateFontString()
  `);
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return __a(__headFrame)"), "a slot's bronze frame child faded").toBe(0);
  expect(addon.eval("return { __a(__plate), __a(__icon), __a(__ignore) }"), "the ammo plate faded, its icon and ignored mark kept").toEqual([0, -1, -1]);
  expect(addon.eval("local b = PetPaperDollFrameExpBar return { __a(b.backdrop), __a(b.Fill), __panel(b) }"), "the pet bar: backdrop faded, fill kept, panelled").toEqual([0, -1, true]);
  expect(addon.eval("return { __headed(CharacterLevelText), __headed(PetCharacterLevelText), #ns.errors }"), "the level lines in the heading role and the text colour").toEqual([true, true, 0]);
});

// TEST-ONLY appearances page parts: search box, dropdowns, page arrows and the sets tab's list and details.
const WARDROBE_ENV = COLLECTIONS_ENV + `
  function __text(fs) local c, t = fs.__textColor, { ns.Theme.RGB("text") } return c ~= nil and c[1] == t[1] and c[2] == t[2] and c[3] == t[3] end
  function __dropdown(parent) local d = CreateFrame("Button", nil, parent) d.Arrow = __art(d, "ARTWORK") d.Arrow:SetAlpha(0) return d end
  function __wardrobe()
    __collections()
    local w = WardrobeCollectionFrame
    w.SearchBox = CreateFrame("EditBox", nil, w) w.SearchBox.Left, w.SearchBox.searchIcon = __art(w.SearchBox), __art(w.SearchBox, "ARTWORK")
    w.SearchBox.searchIcon:SetAlpha(0)
    w.FilterButton, w.ClassDropdown = __dropdown(w), __dropdown(w)
    local items, sets = w.ItemsCollectionFrame, w.SetsCollectionFrame
    items.WeaponDropdown, items.PagingFrame = __dropdown(items), CreateFrame("Frame", nil, items)
    items.PagingFrame.PrevPageButton, items.PagingFrame.NextPageButton = CreateFrame("Button", nil, items.PagingFrame), CreateFrame("Button", nil, items.PagingFrame)
    sets.DetailsFrame = CreateFrame("Frame", nil, sets)
    sets.DetailsFrame.IconRowBackground, sets.DetailsFrame.ModelFadeTexture = __art(sets.DetailsFrame), __art(sets.DetailsFrame)
    sets.DetailsFrame.VariantSetsDropdown = __dropdown(sets.DetailsFrame)
    sets.ListContainer = CreateFrame("Frame", nil, sets) sets.ListContainer.ScrollBox = __box(sets.ListContainer)
    __setsRow = CreateFrame("Button", nil, sets.ListContainer.ScrollBox)
    __setsRow.Background, __setsRow.HighlightTexture, __setsRow.SelectedTexture, __setsRow.Name = __art(__setsRow), __art(__setsRow), __art(__setsRow), __setsRow:CreateFontString()
    __setsRow.ProgressBar, __setsRow.New = __art(__setsRow, "ARTWORK"), __art(__setsRow, "OVERLAY")
    __setsRow.Name:SetTextColor(0.5, 0.5, 0.5)
    __setsRow.SelectedTexture:Hide()
    function __setsRow:SetSelected(on) self.SelectedTexture:SetShown(on) end
    sets.ListContainer.ScrollBox:Acquire(__setsRow)
  end
`;

it("appearances: the search box, dropdowns, page arrows and the sets tab's rows and details are in the theme", () => {
  const addon = loggedIn(WARDROBE_ENV);
  addon.eval("__wardrobe()");
  addon.fire("ADDON_LOADED", "Blizzard_Collections");
  addon.eval("CollectionsJournal:Show()");
  expect(addon.eval("local b = WardrobeCollectionFrame.SearchBox return { __a(b.Left), b.searchIcon:GetAlpha(), __panel(b) }"), "the search box: art faded, its magnifier shown, flat").toEqual([0, 1, true]);
  // A dropdown's arrow alpha (shown again) and whether it is a flat button.
  const drop = (path) => addon.eval(`local d = ${path} return { d.Arrow:GetAlpha(), __panel(d) }`);
  const w = "WardrobeCollectionFrame";
  expect([drop(`${w}.FilterButton`), drop(`${w}.ClassDropdown`), drop(`${w}.ItemsCollectionFrame.WeaponDropdown`), drop(`${w}.SetsCollectionFrame.DetailsFrame.VariantSetsDropdown`)], "the filter, class, weapon and variant dropdowns have theme arrows")
    .toEqual([[0, true], [0, true], [0, true], [0, true]]);
  expect(addon.eval(`local p = ${w}.ItemsCollectionFrame.PagingFrame return { __panel(p.PrevPageButton), __panel(p.NextPageButton) }`), "the page arrows flat buttons").toEqual([true, true]);
  expect(addon.eval(`local d = ${w}.SetsCollectionFrame.DetailsFrame return { __a(d.IconRowBackground), __a(d.ModelFadeTexture) }`), "the icon row plate and the model fade gone").toEqual([0, 0]);
  // A sets row: its plate, hover and selected art alphas, the progress line and new glow alphas, whether it is a theme row,
  // whether its name is still the game's colour, and whether the selected rail is lit.
  const setsRow = (r) => addon.eval(`local r = ${r} return { __a(r.Background), __a(r.HighlightTexture), __a(r.SelectedTexture), __a(r.ProgressBar), __a(r.New), ns.Theme.RowParts(r) ~= nil, not __text(r.Name), ns.Theme.RowParts(r).rail:IsShown() }`);
  expect(setsRow("__setsRow"), "a sets row: plate, hover and selected art faded, progress and glow kept, a theme row, name colour the game's, not lit").toEqual([0, 0, 0, -1, -1, true, true, false]);
  addon.eval("__setsRow:SetSelected(true)");
  expect(setsRow("__setsRow")[7], "the selected rail follows the game's SetSelected").toBe(true);
  addon.eval("__setsRow:SetSelected(false)");
  expect(setsRow("__setsRow")[7], "and clears with it").toBe(false);
  addon.eval("local row = CreateFrame('Button', nil, __setsRow:GetParent()) row.Background, row.SelectedTexture = __art(row), __art(row) row.Name = row:CreateFontString() function row:SetSelected(on) self.SelectedTexture:SetShown(on) end __laterRow = WardrobeCollectionFrame.SetsCollectionFrame.ListContainer.ScrollBox:Acquire(row)");
  expect(addon.eval("return { __a(__laterRow.Background), ns.Theme.RowParts(__laterRow).rail:IsShown(), #ns.errors }"), "a row acquired later too, lit as the game shows its mark").toEqual([0, true, 0]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CollectionsJournal:Hide() CollectionsJournal:Show()");
  expect(addon.eval("return { ns.Theme.PaintedCount(), #ns.errors }"), "showing it again paints nothing new").toEqual([painted, 0]);
});
