// windows-retail: the game windows only Retail has, or draws another way (Modules/RetailWindows.lua), and the
// per-client frame lists of the shared Windows files: the real Vanguard Lua in the TEST-ONLY headless client made
// Retail, each window built by scripts/lib/wow-retail-windows.lua as Blizzard's Mainline XML has it.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { expectErrors, INSIDES_LUA, loggedIn, WINDOWS_ENV, windowState } from "./helpers.mjs";

// TEST-ONLY readers: __button(b) whether the theme made b a flat button, __box(b) whether a search box lost its art
// and kept its magnifier, __plate(b) whether a control tile went behind b, __card(b, icon, name) whether a category
// card lost its plate and ring, kept its icon, sits on an inset panel and has its name light.
const READERS = `${WINDOWS_ENV}${INSIDES_LUA}
  function __button(b) return ns.Theme.HoverParts(b) ~= nil end
  function __box(b) return __faded(b, b.searchIcon) and b.searchIcon.__alpha == 1 end
  function __plate(b) return select("#", b:GetRegions()) > 2 end
  function __card(b, icon, name) return __faded(b, icon) and icon:GetAlpha() == 1 and __sunk(b) and __looks(name, "name", "text") end
  function __well(f) return __faded(f) and f.NineSlice.__alpha == 0 and __sunk(f) end
`;

// A logged-in Retail addon with the readers and the named windows built before login.
const retail = (names = [], savedVariables = "") => loggedIn(READERS + names.map((n) => `__wfgRetailWindows.build("${n}")`).join("\n"),
  { client: RETAIL_CLIENT, savedVariables });

// A logged-in WoW Forever addon with the readers.
const forever = () => loggedIn(READERS);

it("windows-retail: the group finder takes the window skin, and its pages' wells, cards, buttons, dropdowns and boxes the theme", () => {
  const addon = retail(["PVEFrame"]);
  addon.eval("PVEFrame:Show()");
  expect(windowState(addon, "PVEFrame")).toMatchObject({ art: 0, nine: 0, portrait: 0, inset: true, panel: true, title: true });
  const state = addon.eval(`local list, make = LFGListFrame.SearchPanel, LFGListFrame.EntryCreation
    local card = GroupFinderFrame.groupButton1
    return { role = LFDParentFrameRoleBackground.__alpha, raidRole = RaidFinderFrameRoleBackground.__alpha,
      wells = __well(LFDParentFrameInset) and __well(RaidFinderFrameBottomInset) and __well(list.ResultsInset),
      card = __card(card, card.icon, card.name), buttons = __button(LFDQueueFrameFindGroupButton) and __button(make.ListGroupButton),
      dropdowns = __button(LFDQueueFrameTypeDropdown) and __button(list.FilterButton), plate = __plate(list.RefreshButton),
      search = __box(list.SearchBox), edit = __faded(make.Name), label = __looks(make.NameLabel, "label", "text") }`);
  expect(state).toEqual({ role: 0, raidRole: 0, wells: true, card: true, buttons: true, dropdowns: true, plate: true, search: true, edit: true, label: true });
});

it("windows-retail: the dungeon and raid finders' reward pages keep the game's parchment (their text is the game's dark quest text)", () => {
  const addon = retail(["PVEFrame"]);
  addon.eval("PVEFrame:Show()");
  expect(addon.eval("return { LFDQueueFrameBackground:GetAlpha(), RaidFinderQueueFrameBackground:GetAlpha() }")).toEqual([1, 1]);
});

it("windows-retail: the PvP tab is dressed when its part of the game loads, inside the group finder", () => {
  const addon = retail(["PVEFrame"]);
  addon.eval(`__wfgRetailWindows.build("PVPUIFrame") __wfgStub.fire("ADDON_LOADED", "Blizzard_PVPUI")`);
  const state = addon.eval(`local card = PVPQueueFrame.CategoryButton2
    return { card = __card(card, card.Icon, card.Name), wells = __well(PVPQueueFrame.HonorInset) and __well(HonorFrame.Inset) and __well(ConquestFrame.Inset),
      buttons = __button(HonorFrame.QueueButton) and __button(ConquestFrame.JoinButton), dropdown = __button(HonorFrame.TypeDropdown) }`);
  expect(state).toEqual({ card: true, wells: true, buttons: true, dropdown: true });
});

it("windows-retail: the premade groups' invite dialog takes the window skin and flat buttons, and keeps its role picture", () => {
  const addon = retail(["LFGListInviteDialog"]);
  addon.eval("LFGListInviteDialog:Show()");
  const state = addon.eval(`local f = LFGListInviteDialog
    local panel = 0 for _, r in ipairs({ __panelHost(f):GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then panel = panel + 1 end end
    return { role = f.RoleIcon:GetAlpha(), border = f.Border.__alpha, panel = panel > 0, errors = #ns.errors,
      buttons = __button(f.AcceptButton) and __button(f.DeclineButton) and __button(f.AcknowledgeButton) }`);
  expect(state, "the border faded, the role picture kept, a panel painted, the three buttons flat")
    .toEqual({ role: 1, border: 0, panel: true, errors: 0, buttons: true });
});

it("windows-retail: the Adventure Guide is dressed when it loads; its tabs are theme tabs and its pages keep the game's parchment and pictures", () => {
  const addon = retail();
  addon.eval(`__wfgRetailWindows.build("EncounterJournal") __wfgStub.fire("ADDON_LOADED", "Blizzard_EncounterJournal") EncounterJournal:Show()`);
  expect(windowState(addon, "EncounterJournal")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  const state = addon.eval(`local ej = EncounterJournal
    return { wells = __well(ej.inset) and __well(ej.navBar), search = __box(ej.searchBox),
      dropdowns = __button(ej.instanceSelect.ExpansionDropdown) and __button(ej.encounter.info.difficulty),
      tab = ej.Tabs[1].Left.__alpha == 0 and ej.Tabs[3].Right.__alpha == 0,
      pages = { ej.instanceSelect.bg:GetAlpha(), ej.encounter.info.BG:GetAlpha() } }`);
  expect(state).toEqual({ wells: true, search: true, dropdowns: true, tab: true, pages: [1, 1] });
});

it("windows-retail: the friends window's Who tab: its list on a well, its column headers flat, its buttons, dropdown and search box themed", () => {
  const addon = retail(["FriendsFrame"]);
  addon.eval("FriendsFrame:Show()");
  const state = addon.eval(`local h = WhoFrameColumnHeader1
    return { well = __well(WhoFrameListInset), header = __faded(h) and __looks(h.Text, "small", "text2"),
      buttons = __button(WhoFrameWhoButton) and __button(WhoFrameAddFriendButton), dropdown = __button(WhoFrameDropdown), search = __box(WhoFrameEditBox) }`);
  expect(state).toEqual({ well: true, header: true, buttons: true, dropdown: true, search: true });
});

it("windows-retail: the mainline character pane: its stats well, class picture, model backdrop and stat lines, as the game updates them", () => {
  const addon = retail(["CharacterFrame"]);
  addon.eval("CharacterFrame:Show()");
  const lineLit = `local l = CharacterStatsPane.statsFramePool.active[%] return l.Background.__alpha == 0 and l.Label.__textColor[1] == ns.Theme.RGB("text")`;
  const state = addon.eval(`local scene = CharacterModelScene
    scene.BackgroundOverlay:SetAlpha(0.8)
    return { well = __well(CharacterFrameInsetRight), picture = CharacterStatsPane.ClassBackground.__alpha,
      scene = __faded(scene) and __sunk(scene), overlay = scene.BackgroundOverlay.__alpha }`);
  expect(state).toEqual({ well: true, picture: 0, scene: true, overlay: 0 });
  expect(addon.eval(lineLit.replace("%", "1")), "the line the pane had").toBe(true);
  addon.eval("PaperDollFrame_UpdateStats()");
  expect(addon.eval(lineLit.replace("%", "2")), "a line the game's update made").toBe(true);
});

it("windows-retail: with the Retail windows' switch off the group finder stays the game's; the switch is on Retail's Game windows page only", () => {
  const off = retail(["PVEFrame"], "VanguardDB.profiles = { Default = { Windows = { finder = false } } }");
  off.eval("PVEFrame:Show()");
  expect(windowState(off, "PVEFrame").art, "the window's art stays").not.toBe(0);
  expect(off.eval("return __button(LFDQueueFrameFindGroupButton)"), "its buttons stay the game's").toBe(false);
  // The Game windows page's row labels.
  const labels = (addon) => addon.eval(`local out = {}
    for _, page in ipairs(ns.Options.PAGES) do if page.key == "windows" then for _, r in ipairs(page.rows()) do out[#out + 1] = r[2] end end end
    return out`);
  const label = "Group finder, PvP and Adventure Guide windows (reload)";
  expect(labels(off)).toContain(label);
  expect(labels(forever())).not.toContain(label);
});

it("windows-retail: WoW Forever never loads the Retail file: no group, default or parts of its own", () => {
  const addon = forever();
  const state = addon.eval(`local GW = ns.GetModule("Windows") local finder = false
    for _, g in ipairs(GW.GROUPS) do if g == "finder" then finder = true end end
    return { finder = finder, default = GW.defaults.finder == nil, parts = GW.RETAIL_PARTS == nil }`);
  expect(state).toEqual({ finder: false, default: true, parts: true });
});

it("windows-retail: each client's frame lists: Retail drags its group finder and the Adventure Guide, WoW Forever's lists are today's", () => {
  const read = `local GW = ns.GetModule("Windows")
    local function has(list, name) for _, n in ipairs(list) do if n == name then return true end end return false end
    return { finder = has(GW.MOVABLE, "PVEFrame"), guide = has(GW.MOVABLE, "EncounterJournal"), legacy = has(GW.MOVABLE, "LegacySystemFrame"),
      stable = has(GW.MOVABLE_TOP, "PetStableFrame"), hang = GW.MOVE_SIDE_HANG.CharacterFrame, pages = GW.MOVE_PAGES.LFGParentFrame ~= nil,
      tabs = has(GW.TAB_WINDOWS, "LFGParentFrame"), ranged = has(GW.SLOTS, "Ranged"), ammo = has(GW.EQUIP_SLOTS, "Ammo") }`;
  expect(retail().eval(read)).toEqual({ finder: true, guide: true, legacy: false, stable: false, pages: false, tabs: false, ranged: false, ammo: false });
  expect(forever().eval(read)).toEqual({ finder: false, guide: false, legacy: true, stable: true, hang: 64, pages: true, tabs: true, ranged: true, ammo: true });
});

it("windows-retail: a part this client draws another way is reported by its path, and the rest of the window is dressed", () => {
  const addon = retail(["PVEFrame"]);
  expectErrors("retail window LFDQueueFrameTypeDropdown: TEST-ONLY broken");
  addon.eval(`LFDQueueFrameTypeDropdown = { CreateTexture = function() error("TEST-ONLY broken", 0) end } PVEFrame:Show()`);
  expect(addon.eval("return __button(RaidFinderQueueFrameSelectionDropdown) and __button(LFDQueueFrameFindGroupButton)")).toBe(true);
});

it("windows-retail: a window the game keeps from addons is never hooked, and the encounter timeline's parts loading touch nothing", () => {
  const addon = retail();
  addon.eval(`__wfgRetailWindows.build("EncounterJournal") function EncounterJournal:IsForbidden() return true end
    __wfgStub.fire("ADDON_LOADED", "Blizzard_EncounterJournal")
    __wfgStub.fire("ADDON_LOADED", "Blizzard_EncounterTimeline") __wfgStub.fire("ADDON_LOADED", "Blizzard_EncounterWarnings")`);
  expect(addon.eval("return ns.FrameState('vgWindow')[EncounterJournal] == nil and EncounterJournal.inset.NineSlice.__alpha ~= 0")).toBe(true);
  expect(addon.eval("return #ns.errors")).toBe(0);
});
