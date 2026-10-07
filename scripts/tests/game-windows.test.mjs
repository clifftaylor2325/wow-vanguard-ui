// game-windows: the game's windows in the Vanguard look, the windows registry, and the AFK screen,
// in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { AFK_ENV, CLICK_LUA, FAKE_FADES, TIDY_ENV, UI_ENV, UNITS_ENV, WINDOWS_ENV, isTok, loggedIn, setCombat, windowState } from "./helpers.mjs";
import { painted } from "./more-env.mjs";

// TEST-ONLY quest and gossip windows that color their text for parchment (dark brown), as the game does.
const PARCHMENT_ENV = `
  hooksecurefunc = function(a, b, c)
    if type(a) == "table" then local orig = a[b] a[b] = function(...) local r = orig(...) c(...) return r end
    else local orig = _G[a] _G[a] = function(...) orig(...) b(...) end end
  end
  QuestFrame = CreateFrame("Frame", "QuestFrame", UIParent) QuestFrame:Hide()
  for _, name in ipairs({ "QuestInfoDescriptionText", "QuestInfoTitleHeader" }) do UIParent:CreateFontString(name) _G[name] = __wfgStub.frames[#__wfgStub.frames] end
  function QuestFrame_SetTextColor(fs) fs:SetTextColor(0.2, 0.1, 0) end
  function QuestFrame_SetTitleTextColor(fs) fs:SetTextColor(0.2, 0.1, 0) end
  function QuestInfo_Display() QuestInfoDescriptionText:SetTextColor(0.2, 0.1, 0) end
  GossipFrame = CreateFrame("Frame", "GossipFrame", UIParent) GossipFrame:Hide()
  GossipFrame.GreetingPanel = CreateFrame("Frame", nil, GossipFrame)
  local box = CreateFrame("Frame", nil, GossipFrame.GreetingPanel)
  GossipFrame.GreetingPanel.ScrollBox = box
  local greeting = CreateFrame("Frame", nil, box) greeting.GreetingText = greeting:CreateFontString()
  local option = CreateFrame("Button", nil, box) option.label = option:CreateFontString()
  option.GetFontString = function(self) return self.label end
  __lines = { greeting, option }
  function box:ForEachFrame(fn) for _, f in ipairs(__lines) do fn(f) end end
  function box:Update() for _, f in ipairs(__lines) do (f.GreetingText or f.label):SetTextColor(0.2, 0.1, 0) end end
`;

it("game windows: quest and gossip text stays readable on the dark panel", () => {
  const addon = loggedIn(PARCHMENT_ENV);
  addon.eval("QuestInfo_Display() QuestFrame_SetTitleTextColor(QuestInfoTitleHeader)");
  expect(isTok(addon, addon.eval("return QuestInfoDescriptionText.__textColor"), "text") && isTok(addon, addon.eval("return QuestInfoTitleHeader.__textColor"), "gold"), "quest text goes light and headings gold after the game colors them").toBe(true);
  addon.eval("local fs = UIParent:CreateFontString() QuestFrame_SetTextColor(fs) __fs = fs");
  expect(isTok(addon, addon.eval("return __fs.__textColor"), "text"), "any text the game colors for parchment is lightened").toBe(true);
  addon.eval("GossipFrame.GreetingPanel.ScrollBox:Update()");
  expect(addon.eval("return { __lines[1].GreetingText.__textColor[1] > 0.5, __lines[2].label.__textColor[1] > 0.5 }"), "the gossip greeting and options are light after each redraw").toEqual([true, true]);
  addon.eval("QuestInfoDescriptionText:SetTextColor(0, 0, 0) QuestFrame:Show()");
  expect(isTok(addon, addon.eval("return QuestInfoDescriptionText.__textColor"), "text"), "and when the window shows").toBe(true);
  const off = loggedIn(PARCHMENT_ENV, { savedVariables: "VanguardDB.profiles.Default = { Windows = { windows = false } }" });
  off.eval("QuestInfo_Display()");
  expect(off.eval("return QuestInfoDescriptionText.__textColor[1]"), "with game windows off, the game's colors stay").toBeCloseTo(0.2);
  expect(loggedIn("").eval("return ns.GetModule('Windows').LightGossip() == nil"), "a client without these windows is fine").toBe(true);
});

// TEST-ONLY quest tracker parts the game builds: headers with art, a title and a
// collapse button, a list of sections, an Update the game calls, and its font objects.
const TRACKER_ENV = `
  function __header(parent)
    local h = CreateFrame("Frame", nil, parent) h:SetSize(260, 26)
    h.Background = h:CreateTexture() h.Glow = h:CreateTexture() h.Text = h:CreateFontString()
    h.MinimizeButton = CreateFrame("Button", nil, h) h.MinimizeButton.normal = h.MinimizeButton:CreateTexture()
    h.MinimizeButton.GetNormalTexture = function(self) return self.normal end
    function h:SetCollapsed(collapsed) self.collapsed = collapsed end
    return h
  end
  ObjectiveTrackerFrame.Header = __header(ObjectiveTrackerFrame)
  ObjectiveTrackerFrame.modules = { { Header = __header(ObjectiveTrackerFrame) } }
  function ObjectiveTrackerFrame:Update() end
  ObjectiveTrackerLineFont = { SetFont = function(self, ...) self.font = { ... } end }
  ObjectiveTrackerHeaderFont = { SetFont = function(self, ...) self.font = { ... } end }
`;

it("the quest tracker in the Vanguard look: flat headers, brass lines, theme arrows and font", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV, { savedVariables: "VanguardDB.profiles.Default = { QuestTracker = { own = false } }" });
  const head = addon.eval(`local h = ObjectiveTrackerFrame.Header
    return { h.Background.__alpha, h.Glow.__alpha, h.MinimizeButton.normal.__alpha, h.Text.__font ~= nil, #ns.GetModule("MenuStrip").rules }`);
  expect(head, "header art and the game's button fade; the title takes the theme font; each header gets a brass line").toEqual([0, 0, 0, true, 2]);
  expect(isTok(addon, addon.eval("return ns.GetModule('MenuStrip').rules[1].__vertexColor"), "accent"), "the line is the accent").toBe(true);
  // The container header's arrow texture.
  const arrow = () => addon.eval("return ObjectiveTrackerFrame.Header.vgArrow.__texture");
  expect(/Icons\\Down$/.test(arrow()), "an open section shows the Down arrow").toBe(true);
  addon.eval("ObjectiveTrackerFrame.Header:SetCollapsed(true)");
  expect(/Icons\\Right$/.test(arrow()), "collapsed, it shows Right").toBe(true);
  expect(addon.eval("return { ObjectiveTrackerLineFont.font[2], ObjectiveTrackerHeaderFont.font[2], ObjectiveTrackerHeaderFont.font[1]:find('SemiBold') ~= nil }"), "the tracker's fonts are the theme's (headers bold)").toEqual([12, 13, true]);
  addon.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(addon.eval("return ns.GetModule('MenuStrip').rules[2].__vertexColor[3]"), "the lines follow the accent").toBe(0.3);
  addon.eval("ObjectiveTrackerFrame.modules[2] = { Header = __header(ObjectiveTrackerFrame) } ObjectiveTrackerFrame:Update()");
  expect(addon.eval("return ObjectiveTrackerFrame.modules[2].Header.vgHeader"), "a section the game adds later is styled on its next update").toBe(true);
  const own = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV);
  expect(own.eval("return { ObjectiveTrackerFrame.Header.vgHeader == nil, ObjectiveTrackerLineFont.font == nil, #ns.GetModule('MenuStrip').rules }"), "with Vanguard's own tracker on, the game's tracker is not skinned").toEqual([true, true, 0]);
  const off = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV, { savedVariables: "VanguardDB.profiles.Default = { QuestTracker = { own = false }, MenuStrip = { trackerLook = false } }" });
  expect(off.eval("return { ObjectiveTrackerFrame.Header.vgHeader == nil, ObjectiveTrackerLineFont.font == nil }"), "switched off, the tracker stays the game's").toEqual([true, true]);
  expect(loggedIn(UI_ENV).eval("return ns.GetModule('MenuStrip').rules ~= nil"), "a client without the tracker loads cleanly").toBe(true);
});

it("game windows in the Vanguard look: framed windows, popups, breath bar, and windows that load later", () => {
  const addon = loggedIn(WINDOWS_ENV);
  addon.eval("MerchantFrame:Show()");
  const first = windowState(addon, "MerchantFrame");
  expect(first, "the game's art is faded, a panel is painted, the title takes the theme font").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, panel: true, title: true });
  addon.eval("MerchantFrame:Hide() MerchantFrame:Show()");
  expect(windowState(addon, "MerchantFrame"), "showing it again keeps the panel and paints nothing new").toMatchObject({ panel: true, painted: first.painted });
  expect(windowState(addon, "StaticPopup1"), "popups too").toMatchObject({ art: 0, panel: true });
  expect(addon.eval("return MirrorTimer1.StatusBar:GetStatusBarTexture() ~= nil"), "the breath bar uses the theme's bar texture").toBe(true);
  addon.eval('__window("PlayerSpellsFrame")');
  addon.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  expect(windowState(addon, "PlayerSpellsFrame"), "the spellbook is skinned when it loads").toMatchObject({ art: 0, panel: true });
  addon.fire("ADDON_LOADED", "TEST-ONLY_SomethingElse");
});

it("game windows: one skin that fails is reported and the other windows, and those that load later, are still skinned", () => {
  const addon = loggedIn(WINDOWS_ENV + `__window("CharacterFrame").NineSlice.GetRegions = function() error("TEST-ONLY skin failure") end`);
  expect(addon.eval("return ns.errors[1].text:find('window CharacterFrame', 1, true) ~= nil"), "the failure is reported under the window's name").toBe(true);
  addon.eval("MerchantFrame:Show()");
  expect(windowState(addon, "MerchantFrame"), "windows after it are still skinned").toMatchObject({ art: 0, panel: true });
  addon.eval('__window("PlayerSpellsFrame")');
  addon.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  expect(windowState(addon, "PlayerSpellsFrame"), "and windows that load later too").toMatchObject({ art: 0, panel: true });
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return ns.errors[1].count"), "the failing skin is still tried on each show").toBe(2);
});

it("game windows: the quest and gossip windows are skinned only when Vanguard's quest dialog is off", () => {
  const env = WINDOWS_ENV + '__window("QuestFrame") __window("GossipFrame")';
  const on = loggedIn(env);
  on.eval("MerchantFrame:Show() QuestFrame:Show() GossipFrame:Show()");
  expect([windowState(on, "QuestFrame").panel, windowState(on, "GossipFrame").panel, windowState(on, "MerchantFrame").panel], "with the dialog on the game's never show: left alone, other windows skinned").toEqual([false, false, true]);
  expect(on.eval("return QuestFrame.vgWindow == nil and GossipFrame.vgWindow == nil"), "and not even hooked").toBe(true);
  for (const saved of ["VanguardDB.profiles = { Default = { QuestDialog = { dialog = false } } }", "VanguardDB.profiles = { Default = { modules = { QuestDialog = false } } }"]) {
    const off = loggedIn(env, { savedVariables: saved });
    off.eval("QuestFrame:Show() GossipFrame:Show()");
    expect([windowState(off, "QuestFrame"), windowState(off, "GossipFrame")], "with the dialog off they are the game's windows again, skinned").toMatchObject([{ art: 0, panel: true }, { art: 0, panel: true }]);
  }
});

it("game windows: switched off they stay the game's, and missing windows are fine", () => {
  const off = loggedIn(WINDOWS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false, popups = false, timers = false } } }" });
  off.eval("MerchantFrame:Show() StaticPopup1:Show()");
  expect([windowState(off, "MerchantFrame").art, windowState(off, "StaticPopup1").art].every((a) => a !== 0), "nothing is faded").toBe(true);
  const bare = loggedIn("");
  expect(bare.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), "a client without these windows loads cleanly").toBe("none");
  const plain = loggedIn(`local f = CreateFrame("Frame", "LootFrame", UIParent) f.ButtonContainer = { Buttons = { CreateFrame("Button", nil, f) } }
    t = CreateFrame("Frame", "MirrorTimer2", UIParent) CreateFrame("StatusBar", "MirrorTimer2StatusBar", t)`);
  expect(plain.eval("return { select('#', LootFrame.ButtonContainer.Buttons[1]:GetRegions()) > 0, MirrorTimer2StatusBar:GetStatusBarTexture() ~= nil }"), "a window with a button container, and a bar found by name").toEqual([true, true]);
});

it("game windows registry: a window added under a group is skinned, its group's switch keeps it the game's", () => {
  const reg = `__window("TestOnlySocialFrame") __window("TestOnlyLaterFrame")
    local GW = ns.GetModule("Windows")
    GW.Add("social", "framed", { "TestOnlySocialFrame" }, GW.SkinWith({ "TestOnlyExtra" }))
    TestOnlySocialFrame.TestOnlyExtra = TestOnlySocialFrame:CreateTexture()
    GW.AddButtons("TestOnlySocialFrame", { "TestOnlyLooseButton" }) CreateFrame("Button", "TestOnlyLooseButton", TestOnlySocialFrame)`;
  const on = loggedIn(WINDOWS_ENV + reg);
  on.eval("TestOnlySocialFrame:Show()");
  expect(windowState(on, "TestOnlySocialFrame"), "skinned like any window").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(on.eval("return { TestOnlySocialFrame.TestOnlyExtra.__alpha, select('#', TestOnlyLooseButton:GetRegions()) > 0 }"), "its extra art faded and its loose button themed").toEqual([0, true]);
  on.eval(`ns.GetModule("Windows").Add("map", "onDemand", "TestOnly_Part", { "TestOnlyLaterFrame" })`);
  expect(windowState(on, "TestOnlyLaterFrame").panel, "a late registration for a window that already exists is skinned at once").toBe(true);
  on.eval(`ns.GetModule("Windows").Add("map", "onDemand", "TestOnly_Later", { "TestOnlyLoadsLater" }) __window("TestOnlyLoadsLater")`);
  expect(on.eval("return TestOnlyLoadsLater.vgWindow == nil"), "a window that doesn't exist yet waits").toBe(true);
  on.fire("ADDON_LOADED", "TestOnly_Later");
  expect(on.eval("return TestOnlyLoadsLater.vgWindow == true"), "until its part of the game loads").toBe(true);
  const off = loggedIn(WINDOWS_ENV + reg, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  off.eval("TestOnlySocialFrame:Show()");
  expect([windowState(off, "TestOnlySocialFrame").art !== 0, off.eval("return TestOnlySocialFrame.vgWindow == nil")], "with its group off: not hooked, its art left").toEqual([true, true]);
  expect(windowState(off, "MerchantFrame").panel, "other groups still are").toBe(true);
  expect(on.eval("return ns.GetModule('Windows').ON_DEMAND.Blizzard_EncounterJournal == nil"), "the encounter journal (never on Forever) is not listed").toBe(true);
  expect(on.eval("local GW = ns.GetModule('Windows') return { GW.REGISTERED.PlayerSpellsFrame.group, GW.REGISTERED.StaticPopup1.group, GW.REGISTERED.MirrorTimer1.group }"), "the first groups").toEqual(["windows", "popups", "timers"]);
});

it("game windows registry: parts and named art faded, missing ones skipped", () => {
  const addon = loggedIn(`TestOnlyNamedArt = UIParent:CreateTexture()`);
  const out = addon.eval(`
    local GW = ns.GetModule("Windows")
    local f = CreateFrame("Frame", nil, UIParent)
    f.Tex, f.Box = f:CreateTexture(), CreateFrame("Frame", nil, f)
    local inner = f.Box:CreateTexture()
    GW.FadeParts(f, { "Tex", "Box", "Missing" })
    GW.FadeNamed({ "TestOnlyNamedArt", "TestOnlyNoSuchArt" })
    return { f.Tex.__alpha, inner.__alpha, TestOnlyNamedArt.__alpha }`);
  expect(out).toEqual([0, 0, 0]);
});

it("the AFK screen: a dimmed screen and a card while you're away", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // The AFK screen and its card's texts.
  const afk = () => addon.eval(`local f = Vanguard_AfkScreen
    return { shown = f:IsShown(), name = f.name:GetText(), who = f.who:GetText(), where = f.where:GetText(), away = f.away:GetText(), clock = f.clock:GetText(), xp = f.xp:IsShown() and f.xp.__value, color = f.name.__textColor }`);
  expect(afk().shown, "hidden while you're here").toBe(false);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const card = afk();
  expect(card, "your name, level and class, where you are, the time away and the clock, your XP").toMatchObject({ shown: true, name: "<name>", who: "Level 42 Class", where: "TEST-ONLY Vale  ·  TEST-ONLY Hamlet", away: "Away 0:00", clock: "21:04", xp: 300 });
  expect(card.color.slice(0, 3), "the name in your class color").toEqual([0.25, 0.78, 0.92]);
  expect(addon.eval("return { Vanguard_AfkScreen.__strata, Vanguard_AfkScreen.dim.__vertexColor[4] }"), "over the whole UI, dimmed").toEqual(["FULLSCREEN_DIALOG", 0.75]);
  addon.eval("__wfgStub.advance(65, 1)");
  expect(afk().away, "the time away ticks").toBe("Away 1:05");
  expect(addon.eval("return ns.GetModule('AfkScreen').AwayText(3725)"), "past an hour").toBe("Away 1:02:05");
  addon.fire("PLAYER_FLAGS_CHANGED", "party1");
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(afk().shown, "back: it goes").toBe(false);
});

it("the AFK screen fades in over 0.4 s and, when a fight starts, out in 0.15 s", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + FAKE_FADES);
  addon.eval("__fakeFader(Vanguard_AfkScreen) __afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("local d = __fades[1].duration __finishFades() return d"), "away: the screen fades in slowly").toBe(0.4);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval("return __fades[1].duration"), "a fight puts it away quickly (0.2 s outside one)").toBe(0.15);
});

it("the AFK screen: clicks, keys and fights put it away; what the client can't say is left out", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // Marks you away (or back) and says so.
  const away = (on) => { addon.eval(`__afk = ${on}`); addon.fire("PLAYER_FLAGS_CHANGED", "player"); return addon.eval("return Vanguard_AfkScreen:IsShown()"); };
  expect(away(true), "away").toBe(true);
  addon.eval("Vanguard_AfkScreen.__scripts.OnMouseDown(Vanguard_AfkScreen)");
  expect([addon.eval("return Vanguard_AfkScreen:IsShown()"), away(true)], "a click puts it away, and it stays away while you are").toEqual([false, false]);
  away(false);
  expect(away(true), "next time you're away it's back").toBe(true);
  addon.eval("Vanguard_AfkScreen.__scripts.OnKeyDown(Vanguard_AfkScreen, 'ENTER')");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a key puts it away too").toBe(false);
  away(false);
  away(true);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect([addon.eval("return Vanguard_AfkScreen:IsShown()"), away(true)], "a fight puts it away; it doesn't open in one").toEqual([false, false]);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "after the fight, still away: it's back").toBe(true);
  addon.eval("__level = 60 UnitClass = function() return { __secret = true }, { __secret = true } end GetSubZoneText = function() return 'TEST-ONLY Vale' end ns.GetModule('AfkScreen').Paint()");
  const capped = addon.eval("local f = Vanguard_AfkScreen return { f.xp:IsShown(), f.who:GetText(), f.where:GetText(), f.name.__textColor }");
  expect(capped.slice(0, 3), "at the cap no XP bar; a hidden class is left out; no spot within the zone").toEqual([false, "Level 60", "TEST-ONLY Vale"]);
  expect(isTok(addon, capped[3], "accent"), "the name in the accent when the class is hidden").toBe(true);
  addon.eval("UnitIsAFK = function() return { __secret = true } end");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a hidden away flag counts as here").toBe(false);
  const bare = loggedIn("UnitName = nil UnitLevel = nil UnitClass = nil UnitXP = nil");
  bare.eval("ns.GetModule('AfkScreen').Paint()");
  expect(bare.eval("local f = Vanguard_AfkScreen return { f.name:GetText(), f.who:GetText(), f.xp:IsShown() }"), "a client that can't say much gets a blank card, no errors").toEqual(["", "", false]);
});

it("the AFK screen's backdrop: your faction's passage under the card, in its heading font and crest color", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + CLICK_LUA + '__faction = "Alliance" UnitFactionGroup = function() return __faction end');
  // The passage's shown state, font file, opening words, attribution, color and wrap width.
  const passage = () => addon.eval(`local f = Vanguard_AfkScreen
    return { f.passage:IsShown(), f.passage.__font[1]:match("[^\\\\]+$"), f.passage:GetText():sub(1, 14), f.by:GetText(), f.passage.__textColor, f.passage:GetWidth() }`);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const ally = passage();
  expect(ally.slice(0, 4), "Alliance: Varian's letter, in Cinzel").toEqual([true, "Cinzel-SemiBold.ttf", "My son, a terr", "Varian Wrynn, to his son Anduin"]);
  expect([isTok(addon, ally[4], "allianceCrest"), ally[5]], "in Alliance gold, wrapped under the card").toEqual([true, 640]);
  expect(addon.eval("return Vanguard_AfkScreen.passage.__font[2] > ns.Theme.RoleSize('title')"), "a size over the title's").toBe(true);
  addon.eval('__faction = "Horde"');
  addon.fire("NEUTRAL_FACTION_SELECT_RESULT");
  const horde = passage();
  expect([horde[0], horde[1], horde[2], horde[3], isTok(addon, horde[4], "hordeCrest")], "Horde: the Blood Oath, in Metamorphous and Horde red").toEqual([true, "Metamorphous-Regular.ttf", "Lok'tar ogar! ", "The Blood Oath of the Horde", true]);
  addon.slash("");
  addon.eval('__click("Faction look: crest and heading font")');
  expect(addon.eval("local f = Vanguard_AfkScreen return { f.passage:IsShown(), f.by:IsShown() }"), "the faction look off: no passage").toEqual([false, false]);
  addon.eval('__click("Faction look: crest and heading font") __faction = "Neutral" ns.Theme.Refresh()');
  expect(addon.eval("return Vanguard_AfkScreen.passage:IsShown()"), "a neutral character: none").toBe(false);
});
