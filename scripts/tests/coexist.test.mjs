// coexist: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/Coexist.lua: loaded addons that do a Vanguard module's job are named once in chat,
// and the Modules page offers to turn that module off or keep both. Nothing changes without a click.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY addon lists: the client says these addons are loaded (Vanguard too).
const loadedEnv = (...names) => `
  __loaded = { Vanguard = true }
  for _, n in ipairs({ ${names.map((n) => JSON.stringify(n)).join(", ")} }) do __loaded[n] = true end
  C_AddOns.IsAddOnLoaded = function(name) return __loaded[name] == true end
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
    false, true, "Vanguard's Bags is off; Bagnon keeps them. Reload the UI now to apply it?"]);
  addon.eval('Vanguard_Reload:Hide() ns.Options.Show("modules")');
  expect(addon.eval('return __click("Keep both")'), "Keep both for Plater").toBe(true);
  expect([cardTexts(addon), addon.eval('return ns.ModuleEnabled("Nameplates")')], "both answered: no card, plates still on").toEqual([{}, true]);
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
