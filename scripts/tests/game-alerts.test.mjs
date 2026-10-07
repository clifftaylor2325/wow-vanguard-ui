// game-alerts: more game windows, the loss of control and talking head alerts, death notices and
// rare announcements, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, borderOf, isTok, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY extra windows: friends, a book (its page text records the colors it's given), and
// the game's loss of control and talking head alerts with their parts.
const ALERTS_ENV = `
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then return end local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  FriendsFrame = CreateFrame("Frame", "FriendsFrame", UIParent) FriendsFrame:Hide()
  ItemTextFrame = CreateFrame("Frame", "ItemTextFrame", UIParent) ItemTextFrame:Hide()
  ItemTextFrame:SetScript("OnEvent", function() end)
  ItemTextMaterialTopLeft = ItemTextFrame:CreateTexture("ItemTextMaterialTopLeft")
  ItemTextPageText = { __colors = {}, SetTextColor = function(self, tag, r, g, b) self.__colors[tag] = { r, g, b, 1 } end }
  LossOfControlFrame = CreateFrame("Frame", "LossOfControlFrame", UIParent)
  LossOfControlFrame.blackBg = LossOfControlFrame:CreateTexture()
  LossOfControlFrame.Icon = LossOfControlFrame:CreateTexture()
  LossOfControlFrame.AbilityName = LossOfControlFrame:CreateFontString()
  LossOfControlFrame.TimeLeft = CreateFrame("Frame", nil, LossOfControlFrame)
  LossOfControlFrame.TimeLeft.NumberText = LossOfControlFrame.TimeLeft:CreateFontString()
  TalkingHeadFrame = CreateFrame("Frame", "TalkingHeadFrame", UIParent)
  TalkingHeadFrame.BackgroundFrame = CreateFrame("Frame", nil, TalkingHeadFrame)
  TalkingHeadFrame.MainFrame = CreateFrame("Frame", nil, TalkingHeadFrame)
  TalkingHeadFrame.MainFrame.Name = TalkingHeadFrame.MainFrame:CreateFontString()
  TalkingHeadFrame.MainFrame.Text = TalkingHeadFrame.MainFrame:CreateFontString()
`;

it("more game windows: friends, books and letters, and windows that load later", () => {
  const addon = loggedIn(ALERTS_ENV);
  addon.eval("FriendsFrame:Show()");
  expect(borderOf(addon, "FriendsFrame") !== undefined, "friends in the Vanguard look").toBe(true);
  addon.eval('ItemTextFrame:Show() ItemTextFrame.__scripts.OnEvent(ItemTextFrame, "ITEM_TEXT_READY")');
  const page = addon.eval("return { ItemTextPageText.__colors.P, ItemTextPageText.__colors.H1, ItemTextMaterialTopLeft.__alpha }");
  expect([isTok(addon, page[0], "text"), isTok(addon, page[1], "gold"), page[2]], "a book's page in light text, gold headings, its parchment faded").toEqual([true, true, 0]);
  addon.eval('AuctionHouseFrame = CreateFrame("Frame", "AuctionHouseFrame", UIParent)');
  addon.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  expect(borderOf(addon, "AuctionHouseFrame") !== undefined, "the auction house, when it loads").toBe(true);
  addon.eval("ItemTextPageText = { }");
  addon.eval('ItemTextFrame.__scripts.OnEvent(ItemTextFrame, "ITEM_TEXT_READY")');
  expect(addon.eval("return ItemTextMaterialTopLeft.__alpha"), "a page without colors to set is left alone").toBe(0);
});

it("game alerts: loss of control and the talking head, styled and placed (or hidden)", () => {
  const addon = loggedIn(ALERTS_ENV);
  const loc = addon.eval(`local f = LossOfControlFrame
    return { f.blackBg:IsShown(), f.Icon.__texCoord ~= nil, f.AbilityName.__font ~= nil, f.TimeLeft.NumberText.__font ~= nil, f.__points.CENTER.rel == Vanguard_LossOfControlFrameSpot }`);
  expect(loc, "loss of control: its black band hidden, icon cropped, theme text, centered on its spot").toEqual([false, true, true, true, true]);
  expect(addon.eval("return { ns.MoverPoint('lossofcontrol') }"), "a little above your character").toEqual(["CENTER", "CENTER", 0, 140]);
  const head = addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.MainFrame.Name.__font ~= nil, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }");
  expect([head, addon.eval("return (ns.MoverPoint('talkinghead'))")], "the talking head: parchment faded, theme text, at the top center").toEqual([[0, true, true], "TOP"]);
  const hide = loggedIn(ALERTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { talkingHead = 'hide', lossOfControl = false } } }" });
  hide.eval("TalkingHeadFrame:Show()");
  expect(hide.eval("return { TalkingHeadFrame:IsShown(), Vanguard_TalkingHeadFrameSpot == nil, LossOfControlFrame.blackBg.__alpha == nil }"), "hidden, if you'd rather; loss of control off stays the game's").toEqual([false, true, true]);
  const game = loggedIn(ALERTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { talkingHead = 'game' } } }" });
  expect(game.eval("return { TalkingHeadFrame:IsShown(), Vanguard_TalkingHeadFrameSpot == nil }"), "or left to the game").toEqual([true, true]);
  const partial = loggedIn("LossOfControlFrame = CreateFrame('Frame', 'LossOfControlFrame', UIParent) TalkingHeadFrame = CreateFrame('Frame', 'TalkingHeadFrame', UIParent)");
  expect(partial.eval("return Vanguard_LossOfControlFrameSpot ~= nil and Vanguard_TalkingHeadFrameSpot ~= nil"), "frames without their usual parts are still placed").toBe(true);
  expect(loggedIn("").eval("return Vanguard_LossOfControlFrameSpot == nil"), "a client without them loads cleanly").toBe(true);
});

it("game alerts: the loss of control band stays hidden when the game's animation resets its alpha", () => {
  const addon = loggedIn(ALERTS_ENV + "LossOfControlFrame.RedLineTop = LossOfControlFrame:CreateTexture() LossOfControlFrame.RedLineBottom = LossOfControlFrame:CreateTexture()");
  expect(addon.eval("local f = LossOfControlFrame return { f.blackBg:IsShown(), f.RedLineTop:IsShown(), f.RedLineBottom:IsShown() }"), "the band and both red lines are hidden").toEqual([false, false, false]);
  addon.eval("local f = LossOfControlFrame f.blackBg:SetAlpha(0.6) f.RedLineTop:SetAlpha(1) f.RedLineBottom:SetAlpha(1)");
  expect(addon.eval("local f = LossOfControlFrame return { f.blackBg:IsShown(), f.RedLineTop:IsShown(), f.RedLineBottom:IsShown() }"), "restoring their alpha shows nothing").toEqual([false, false, false]);
});

it("game alerts: a talking head that loads later is restyled once when its part of the game loads", () => {
  const addon = loggedIn(ALERTS_ENV.replace(/TalkingHeadFrame/g, "TEST_ONLY_Unloaded"));
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == nil"), "nil at login: nothing placed yet").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_Something");
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == nil"), "another part loading changes nothing").toBe(true);
  addon.eval(`TalkingHeadFrame = CreateFrame("Frame", "TalkingHeadFrame", UIParent) TalkingHeadFrame.BackgroundFrame = CreateFrame("Frame", nil, TalkingHeadFrame)`);
  addon.fire("ADDON_LOADED", "Blizzard_TalkingHeadUI");
  expect(addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }"), "loaded: parchment faded, on its spot").toEqual([0, true]);
  addon.eval("__spot = Vanguard_TalkingHeadFrameSpot");
  addon.fire("ADDON_LOADED", "Blizzard_TalkingHeadUI");
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == __spot"), "a second load event makes no second spot").toBe(true);
});

// TEST-ONLY raid warning frame: one message line the game reuses (as its pool does), numbered as messages come.
const WARNING_ENV = `
  GameFontNormalHuge = "GameFontNormalHuge"
  RaidWarningFrame = CreateFrame("Frame", "RaidWarningFrame", UIParent)
  RaidWarningFrame.line, RaidWarningFrame.counter = RaidWarningFrame:CreateFontString(), 0
  function RaidWarningFrame:AddMessage(text) self.counter = self.counter + 1 self.line:SetText(text) self.line:SetTextColor(1, 0.2, 0.2) self.line.messageOrder = self.counter end
  function RaidWarningFrame:GetSortedMessages() return { self:CreateFontString(), self.line } end
  RaidWarningFrame:RegisterEvent("HARDCORE_DEATHS") RaidWarningFrame:RegisterEvent("CHAT_MSG_RAID_WARNING")
  RaidWarningFrame:SetScript("OnEvent", function(self, event, text) self:AddMessage(text) end)
`;

it("game alerts: Hardcore death notices take the theme font and red; a reused line gets the game's font back", () => {
  const addon = loggedIn(WARNING_ENV);
  // The message line: its font face, color, the game font object it was given, and the death mark.
  const line = () => addon.eval("local l = RaidWarningFrame.line return { font = l.__font and l.__font[1], color = l.__textColor, template = l.__template or false, death = l.vgDeath or false }");
  addon.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  const death = line();
  expect([death.font, isTok(addon, death.color, "bad"), death.death], "a death notice: the theme's title font, the theme's red").toEqual([addon.eval('local f = UIParent:CreateFontString() ns.Theme.ApplyRole(f, "title") return f.__font[1]'), true, true]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Pull in 5");
  expect([line().template, line().death], "the next raid warning on that line: the game's font again").toEqual(["GameFontNormalHuge", false]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Again");
  expect(line().template, "a line that was never a death notice is left as it is").toBe("GameFontNormalHuge");
  const off = loggedIn(WARNING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { hardcore = false } } }" });
  off.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  expect(off.eval("return RaidWarningFrame.line.__font == nil"), "switched off: the game's own look").toBe(true);
  expect(loggedIn("RaidWarningFrame = CreateFrame('Frame', 'RaidWarningFrame', UIParent)").eval("return ns.GetModule('GameAlerts').settings.hardcore"), "a frame without the game's message list is left alone").toBe(true);
});

// TEST-ONLY minimap marks: a rare, a treasure, a dead rare, a rare with a hidden name, a rare elite.
const VIGNETTE_ENV = `
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  __vignettes = {
    rare = { name = "TEST-ONLY Rare", atlasName = "VignetteKill", isDead = false }, chest = { name = "TEST-ONLY Chest", atlasName = "VignetteLoot" },
    dead = { name = "TEST-ONLY Dead", atlasName = "VignetteKill", isDead = true }, hidden = { name = { __secret = true }, atlasName = "VignetteKill" },
    elite = { name = "TEST-ONLY Elite", atlasName = "VignetteKillElite" },
  }
  C_VignetteInfo = { GetVignetteInfo = function(guid) return __vignettes[guid] end }
`;

it("game alerts: a rare nearby is announced with a sound and a chat line, out of combat, once (off until switched on)", () => {
  const addon = loggedIn(VIGNETTE_ENV + CLICK_LUA);
  // Rare lines in chat so far.
  const rares = () => addon.chat().filter((l) => /Rare nearby/.test(l));
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  expect(rares(), "off until you switch it on").toEqual([]);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("A rare nearby")'), "the switch is under Bars, map, chat").toBe(true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  expect([rares().length, /Rare nearby: TEST-ONLY Rare$/.test(rares()[0]), addon.eval("return __wfgWorld.sounds[#__wfgWorld.sounds]")], "one line and the raid warning sound, once per rare").toEqual([1, true, "RAID_WARNING"]);
  for (const guid of ["chest", "dead", "hidden", "nothing"]) addon.fire("VIGNETTE_MINIMAP_UPDATED", guid, true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", false);
  addon.eval('__wfgStub.fire("VIGNETTE_MINIMAP_UPDATED", { __secret = true }, true)');
  expect(rares().length, "a treasure, a dead rare, a hidden name, an unknown mark, one leaving the map, a hidden mark: nothing").toBe(1);
  setCombat(addon, true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", true);
  expect(rares().length, "not in a fight").toBe(1);
  setCombat(addon, false);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", true);
  expect(rares().length, "a rare elite after the fight").toBe(2);
});
