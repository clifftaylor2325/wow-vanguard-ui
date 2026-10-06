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
// texture, an icon and its overlay). __sideState reads the line, the faded art and the icon.
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
      icon = t.Icon.__alpha == nil and (t.IconOverlay == nil or t.IconOverlay.__alpha == nil), line = line ~= nil and line:IsShown() }
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
  expect(refuses.eval("return { __sideState(CommunitiesFrame.RosterTab).art, #ns.errors }"), "the failing tab is reported, the next one still dressed").toEqual([0, 1]);
});
