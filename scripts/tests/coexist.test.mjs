// coexist: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/Coexist.lua: loaded addons that do a Vanguard module's job are named once in chat,
// and the Modules page offers to turn that module off or keep both. Nothing changes without a click.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY addon lists: the client says these addons are loaded (Vanguard too), through the harness's world.loaded.
const loadedEnv = (...names) => `
  for _, n in ipairs({ ${names.map((n) => JSON.stringify(n)).join(", ")} }) do __wfgStub.world.loaded[n] = true end
`;

// The "Other addons" card's texts on the Modules page, as the window draws them (empty when it has none).
const cardTexts = (addon) => addon.eval(`ns.Options.Show("modules")
  local out = {}
  for _, row in ipairs(ns.GetModule("Coexist").Rows()) do out[#out + 1] = row[2] end
  return out`);

it("coexist: EllesmereUI's unit frame, action bar, nameplate and raid frame addons are noticed", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("EllesmereUIUnitFrames", "EllesmereUIActionBars", "EllesmereUINameplates", "EllesmereUIRaidFrames"));
  expect(cardTexts(addon), "one question per overlap, sorted by addon name").toEqual([
    "Other addons",
    "EllesmereUIActionBars is loaded and also does action bars.", "Turn off Action bars", "Keep both",
    "EllesmereUINameplates is loaded and also does nameplates.", "Turn off Nameplates", "Keep both",
    "EllesmereUIRaidFrames is loaded and also does raid frames.", "Turn off Raid frames", "Keep both",
    "EllesmereUIUnitFrames is loaded and also does unit frames.", "Turn off Unit frames", "Keep both",
  ]);
});

it("coexist: a loaded bag and nameplate addon are named once in chat, and the Modules page asks", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Bagnon", "Plater", "TEST-ONLY Unknown"));
  expect(chatHas(addon, /^.*Bagnon also does bags\. Choose which one does under \/vg > Modules \(nothing changes until you do\)\.$/), "Bagnon in chat").toBe(true);
  expect(chatHas(addon, /Plater also does nameplates/), "Plater in chat").toBe(true);
  expect(cardTexts(addon), "the card, first on the page: each addon, then its two choices").toEqual([
    "Other addons", "Bagnon is loaded and also does bags.", "Turn off Bags", "Keep both",
    "Plater is loaded and also does nameplates.", "Turn off Nameplates", "Keep both",
  ]);
  expect(addon.eval('return { ns.ModuleEnabled("Bags"), ns.ModuleEnabled("Nameplates") }'), "nothing changed without a click").toEqual([true, true]);
  expect(addon.eval("return ns.Options.PAGES[2].rows()[1][2]"), "the card comes before the module list").toBe("Other addons");
});

it("coexist: Turn off switches the module off and offers a reload; Keep both just stops asking", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Bagnon", "Plater"));
  addon.eval('ns.Options.Show("modules")');
  expect(addon.eval('return __click("Turn off Bags")'), "the button is on the page").toBe(true);
  expect(addon.eval('return { ns.ModuleEnabled("Bags"), Vanguard_Reload:IsShown(), Vanguard_Reload.title:GetText() }'), "Bags off, with a reload offered").toEqual([
    false, true, "Turned off Vanguard's Bags; Bagnon does that now. Reload the UI now to apply it?"]);
  addon.eval('Vanguard_Reload:Hide() ns.Options.Show("modules")');
  expect(addon.eval('return __click("Keep both")'), "Keep both for Plater").toBe(true);
  expect(addon.eval('return ns.ModuleEnabled("Nameplates")'), "plates still on").toBe(true);
  expect(addon.eval("return ns.Settings('Coexist').answered"), "the answers are kept in the profile").toEqual({ Bagnon: "off", Plater: "kept" });
});

it("coexist: the next login says nothing new; a module already off, or a client without the call, asks nothing", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Dominos"));
  addon.clearChat();
  addon.eval('ns.GetModule("Coexist").Tell()');
  expect([chatHas(addon, /Dominos/), cardTexts(addon).length], "told once per profile; the card stays until answered").toEqual([false, 4]);
  addon.eval('ns.SetModuleEnabled("ActionBars", false)');
  expect(cardTexts(addon), "Vanguard's action bars already off: nothing to ask").toEqual({});
  const bare = loggedIn("C_AddOns.IsAddOnLoaded = nil");
  expect([bare.eval('return #ns.GetModule("Coexist").Pending()'), chatHas(bare, /also does/)], "no addon call: nothing pending").toEqual([0, false]);
});

it("coexist: the button names the module as the Modules page does, else by its own name", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Clique"));
  expect(cardTexts(addon)[2], "the Modules page's name").toBe("Turn off Click casting");
  addon.eval("ns.Options.MODULE_INFO.ClickCast = nil");
  expect(cardTexts(addon)[2], "the module's own name").toBe("Turn off ClickCast");
});

it("coexist: ElvUI and Tukui ask about the action bars, Auctionator and TradeSkillMaster about the Auction helper", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("ElvUI", "Tukui", "Auctionator", "TradeSkillMaster"));
  addon.eval('ns.SetModuleEnabled("ActionBars", true)'); // the scoped login leaves the action bars off
  const pending = addon.eval('local out = {} for i, o in ipairs(ns.GetModule("Coexist").Pending()) do out[i] = o.addon .. ">" .. o.module end return out');
  expect(pending, "each by its folder name, sorted").toEqual(["Auctionator>AuctionHelper", "ElvUI>ActionBars", "TradeSkillMaster>AuctionHelper", "Tukui>ActionBars"]);
  expect(cardTexts(addon).slice(1, 4), "the card says what both do and offers the module by its Modules page name").toEqual([
    "Auctionator is loaded and also does auction house shopping and posting.", "Turn off " + addon.eval('return ns.Options.MODULE_INFO.AuctionHelper[1]'), "Keep both"]);
});

it("coexist: an answer stays on the card while the addon is loaded, with a button to change it", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Bagnon", "Plater"));
  addon.eval('ns.Options.Show("modules") __click("Turn off Bags") Vanguard_Reload:Hide() ns.Options.Show("modules") __click("Keep both")');
  expect(cardTexts(addon), "each answer, and the one choice it leaves").toEqual([
    "Other addons",
    "Bagnon is loaded; you turned off Vanguard's Bags.", "Turn Bags back on",
    "Plater is loaded and also does nameplates. You kept both.", "Turn off Nameplates",
  ]);
  expect(addon.eval('return __click("Turn Bags back on")'), "the button is on the page").toBe(true);
  expect(addon.eval('return { ns.ModuleEnabled("Bags"), Vanguard_Reload.title:GetText(), ns.Settings("Coexist").answered.Bagnon }'), "Bags on again, reload offered, now kept").toEqual([
    true, "Turned Vanguard's Bags back on beside Bagnon. Reload the UI now to apply it?", "kept"]);
  addon.eval("__wfgStub.world.loaded.Bagnon = nil __wfgStub.world.loaded.Plater = nil");
  expect(cardTexts(addon), "neither addon loaded any more: no card").toEqual({});
});

it("coexist: a kept answer whose module was turned off elsewhere, and an off answer turned back on elsewhere, leave nothing to offer", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Bagnon", "Plater"));
  addon.eval('local s = ns.Settings("Coexist") s.answered.Bagnon = "off" s.answered.Plater = "kept" ns.SetModuleEnabled("Nameplates", false)');
  expect(cardTexts(addon), "Bags still on and Nameplates off: nothing to change").toEqual({});
});

it("coexist: the Forever add-ons people pair are noticed, each naming what it turns off", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Platynator", "Chattynator", "Glass", "Sorted", "BetterFriendlist"));
  const texts = cardTexts(addon);
  expect(texts.filter((t) => t.startsWith("Turn off")), "a module, or Vanguard's part, by name").toEqual([
    "Turn off Vanguard's social window looks", "Turn off Chat", "Turn off Chat", "Turn off Nameplates", "Turn off Bags"]);
  expect(texts[1], "the sentence says what both do").toBe("BetterFriendlist is loaded and also does social window looks.");
});

it("coexist: a window skinner turns off every window look group, read at click time; moving and durability stay", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Aurora"));
  addon.eval('ns.Settings("Windows").tabs = false ns.Options.Show("modules")');
  expect(addon.eval('return __click("Turn off Vanguard\'s window looks")'), "the button names its target").toBe(true);
  // The Windows module's look groups, moving and durability switches, by key.
  const windows = () => addon.eval('local s, out = ns.Settings("Windows"), {} for _, k in ipairs(ns.GetModule("Windows").GROUPS) do out[k] = s[k] end out.movable, out.durability = s.movable, s.durability return out');
  expect(windows(), "every group off, moving and durability on").toEqual({
    windows: false, popups: false, timers: false, social: false, town: false, system: false, map: false, menus: false, tabs: false, pvp: false,
    movable: true, durability: true });
  expect(addon.eval('return { ns.ModuleEnabled("Windows"), Vanguard_Reload:IsShown(), Vanguard_Reload.title:GetText() }'), "the module stays on; a reload is offered").toEqual([
    true, true, "Turned off Vanguard's window looks; Aurora does that now. Reload the UI now to apply it?"]);
  addon.eval('Vanguard_Reload:Hide() ns.Options.Show("modules") __click("Turn Vanguard\'s window looks back on")');
  expect(windows().tabs, "turning back on restores only what the card turned off").toBe(false);
  expect(windows().windows, "the rest come back").toBe(true);
});

it("coexist: a window mover turns off only Vanguard's window moving; with every key already off it asks nothing", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("BlizzMove"));
  expect(cardTexts(addon), "the card").toEqual([
    "Other addons", "BlizzMove is loaded and also does window moving.", "Turn off Vanguard's window moving", "Keep both"]);
  addon.eval('ns.Options.Show("modules") __click("Turn off Vanguard\'s window moving")');
  expect(addon.eval('local s = ns.Settings("Windows") return { s.movable, s.windows }'), "moving off, looks on").toEqual([false, true]);
  addon.eval('local s = ns.Settings("Coexist") s.answered.BlizzMove = nil s.off.BlizzMove = nil');
  expect(cardTexts(addon), "moving already off and no answer: nothing to ask").toEqual({});
  addon.eval('ns.Settings("Coexist").answered.BlizzMove = "off" ns.SetModuleEnabled("Windows", false)');
  expect(cardTexts(addon), "the Windows module off: turning moving back on would do nothing").toEqual({});
  addon.eval('ns.SetModuleEnabled("Windows", true) ns.Options.Show("modules") __click("Turn Vanguard\'s window moving back on")');
  expect(addon.eval('return ns.Settings("Windows").movable'), "without a record of what went off, the row's keys all come back").toBe(true);
});

it("coexist: a keys row that applies live offers no reload, and the also sentence follows the card's sentence", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Glass"));
  addon.eval('ns.GetModule("Coexist").OVERLAPS.Glass = { "Windows", "TEST-ONLY tabs", keys = { "tabs" }, also = "TEST-ONLY And more." }');
  expect(cardTexts(addon)[1], "the extra sentence").toBe("Glass is loaded and also does TEST-ONLY tabs. TEST-ONLY And more.");
  addon.eval('ns.Options.Show("modules") __click("Turn off Vanguard\'s TEST-ONLY tabs")');
  expect(addon.eval('return { ns.Settings("Windows").tabs, Vanguard_Reload and Vanguard_Reload:IsShown() or false }'), "off at once, no reload").toEqual([false, false]);
});

it("coexist: a keys row naming a module that isn't there asks nothing", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Aurora"));
  addon.eval('ns.GetModule("Coexist").OVERLAPS.Aurora = { "TEST-ONLY Missing", "looks", keys = "GROUPS" }');
  expect(cardTexts(addon), "nothing to turn off").toEqual({});
});

it("coexist: an off answer whose keys another row turned partly back on still offers the rest", () => {
  const addon = loggedIn(CLICK_LUA + loadedEnv("Aurora", "BetterFriendlist"));
  addon.eval('ns.Options.Show("modules") __click("Turn off Vanguard\'s social window looks") Vanguard_Reload:Hide()');
  addon.eval('ns.Options.Show("modules") __click("Turn off Vanguard\'s window looks") Vanguard_Reload:Hide()');
  addon.eval('ns.Options.Show("modules") __click("Turn Vanguard\'s social window looks back on") Vanguard_Reload:Hide()');
  expect(cardTexts(addon).includes("Turn Vanguard's window looks back on"), "Aurora's row still offers its groups back").toBe(true);
  addon.eval('ns.Options.Show("modules") __click("Turn Vanguard\'s window looks back on")');
  expect(addon.eval('return ns.Settings("Windows").windows'), "and they come back").toBe(true);
});
