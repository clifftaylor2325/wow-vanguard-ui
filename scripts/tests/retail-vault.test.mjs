// retail-vault: the Great Vault's window and its info strip line (Modules/RetailVault.lua), and the expansion page, its
// minimap button, the transmog window and the Trading Post (Modules/RetailLanding.lua): the real Vanguard Lua in the
// TEST-ONLY headless client made Retail, each window built by scripts/lib/wow-retail-vault.lua as Blizzard's live XML
// has it.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { block, chatHas, expectErrors, INSIDES_LUA, isTok, loggedIn, setCombat, WINDOWS_ENV, windowState } from "./helpers.mjs";

// TEST-ONLY readers: __button(b) whether the theme made b a flat button, __box(b) whether a check box lost its art for
// the theme's box, __search(b) whether a search box lost its art and kept its magnifier, __control(b) whether a window
// control's glyph went on b.
const READERS = `${WINDOWS_ENV}${INSIDES_LUA}
  function __button(b) return ns.Theme.HoverParts(b) ~= nil end
  function __box(b) return __faded(b) and select("#", b:GetChildren()) > 0 end
  function __search(b) return __faded(b, b.searchIcon) and b.searchIcon.__alpha == 1 end
  function __control(b) return select("#", b:GetRegions()) > 0 end
`;

// TEST-ONLY vault slots: two of three raid slots unlocked (four bosses of six toward the third), one dungeon of
// three, none of the world's three (one delve of two toward the first), and rated PvP's, which the window hides
// while it has a world row.
const SLOTS = `__wfgRetailVault.slots = {
  { type = 3, progress = 4, threshold = 2 }, { type = 3, progress = 4, threshold = 4 }, { type = 3, progress = 4, threshold = 6 },
  { type = 1, progress = 1, threshold = 1 }, { type = 1, progress = 1, threshold = 4 }, { type = 1, progress = 1, threshold = 8 },
  { type = 6, progress = 1, threshold = 2 }, { type = 6, progress = 1, threshold = 4 }, { type = 6, progress = 1, threshold = 8 },
  { type = 2, progress = 0, threshold = 1 },
}`;

// The vault line switched on.
const LINE_ON = "VanguardDB.profiles = { Default = { InfoStrip = { vault = true } } }";

// A logged-in Retail addon with the readers, the vault's slots and the named windows built before login.
const retail = (names = [], savedVariables = "") => loggedIn(READERS + SLOTS + names.map((n) => `__wfgRetailVault.build("${n}")`).join("\n"),
  { client: RETAIL_CLIENT, savedVariables });

// A logged-in WoW Forever addon with the readers.
const forever = () => loggedIn(READERS);

// The vault line's tooltip, each line "label|value".
const vaultTip = (addon) => addon.eval(`local hit = ns.GetModule("InfoStrip").hits.vault hit.__scripts.OnEnter(hit)
  local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text .. (l.right and "|" .. l.right or "") end
  hit.__scripts.OnLeave(hit) return out`);

// Clicks the vault line.
const clickLine = (addon) => addon.eval(`local hit = ns.GetModule("InfoStrip").hits.vault hit.__scripts.OnClick(hit, "LeftButton")`);

// The Game windows page's row labels.
const windowLabels = (addon) => addon.eval(`local out = {}
  for _, page in ipairs(ns.Options.PAGES) do if page.key == "windows" then for _, r in ipairs(page.rows()) do out[#out + 1] = r[2] end end end
  return out`);

it("retail vault: the vault takes the window skin when its part of the game loads; its rows' pictures stay the game's", () => {
  const addon = retail(["WeeklyRewardsFrame"]);
  addon.eval(`__wfgStub.fire("ADDON_LOADED", "Blizzard_WeeklyRewards") WeeklyRewardsFrame:Show()`);
  expect(windowState(addon, "WeeklyRewardsFrame")).toMatchObject({ art: 0, panel: true });
  const state = addon.eval(`local v = WeeklyRewardsFrame
    return { border = v.BorderContainer.__alpha, divider = v.HeaderFrame.HeaderDivider.__alpha, edges = { v.RaidFrame.Border.__alpha, v.WorldFrame.Border.__alpha },
      picture = v.RaidFrame.Background.__alpha ~= 0, select = __button(v.SelectRewardButton),
      names = __looks(v.RaidFrame.Name, "heading", "text") and __looks(v.MythicFrame.Name, "heading", "text"), header = __looks(v.HeaderFrame.Text, "label", "text") }`);
  expect(state).toEqual({ border: 0, divider: 0, edges: [0, 0], picture: true, select: true, names: true, header: true });
});

it("retail vault: with its switch off the vault stays the game's; its switches are on Retail's Game windows page only", () => {
  const off = retail(["WeeklyRewardsFrame"], "VanguardDB.profiles = { Default = { Windows = { vault = false } } }");
  off.eval(`__wfgStub.fire("ADDON_LOADED", "Blizzard_WeeklyRewards") WeeklyRewardsFrame:Show()`);
  expect(off.eval("return WeeklyRewardsFrame.BorderContainer.__alpha ~= 0 and not __button(WeeklyRewardsFrame.SelectRewardButton)")).toBe(true);
  const labels = ["Great Vault window (reload)", "Great Vault progress on the info strip", "Expansion and transmog windows (reload)"];
  expect(windowLabels(off)).toEqual(expect.arrayContaining(labels));
  expect(windowLabels(forever()).filter((l) => labels.includes(l))).toEqual([]);
});

it("retail vault: the info strip's vault line is off until switched on, then counts the unlocked slots of the rows the vault shows", () => {
  expect(block(retail(), "vault").shown, "off by default").toBe(false);
  const addon = retail([], LINE_ON);
  const line = block(addon, "vault");
  expect([line.shown, line.text, isTok(addon, line.color, "text")], "3 of 9: rated PvP is left out beside the world row").toEqual([true, "Vault 3/9", true]);
  addon.eval("__wfgRetailVault.slots[7].progress = 2");
  addon.fire("WEEKLY_REWARDS_UPDATE");
  expect(block(addon, "vault").text, "the vault's update repaints it").toBe("Vault 4/9");
  addon.eval("__wfgRetailVault.reward = true");
  addon.fire("WEEKLY_REWARDS_UPDATE");
  const waiting = block(addon, "vault");
  expect([waiting.text, isTok(addon, waiting.color, "accent")], "last week's reward waiting, in the accent").toEqual(["Vault reward waiting", true]);
});

it("retail vault: rated PvP counts where the vault has no world row; a slot with hidden figures is left out; no slots, no line", () => {
  const addon = retail([], LINE_ON);
  addon.eval("for i = 9, 7, -1 do table.remove(__wfgRetailVault.slots, i) end __wfgRetailVault.slots[1].progress = { __secret = true }");
  addon.fire("WEEKLY_REWARDS_UPDATE");
  expect(block(addon, "vault").text, "raids 1 of 2 counted (the hidden one left out), dungeons 1 of 3, PvP 0 of 1").toBe("Vault 2/6");
  addon.eval("__wfgRetailVault.slots = {}");
  addon.fire("WEEKLY_REWARDS_UPDATE");
  expect(block(addon, "vault").shown, "no slots this week").toBe(false);
  addon.eval("C_WeeklyRewards = nil");
  addon.fire("WEEKLY_REWARDS_UPDATE");
  expect(block(addon, "vault").shown, "a client without the vault").toBe(false);
});

it("retail vault: the line's tooltip lists each row's slots and the progress to the next; a click opens the vault, out of a fight", () => {
  const addon = retail([], LINE_ON);
  addon.eval("__wfgRetailVault.reward = true");
  expect(vaultTip(addon)).toEqual([
    "Great Vault", "Raids|2/3 unlocked, next 4/6", "Dungeons|1/3 unlocked, next 1/4", "World|0/3 unlocked, next 1/2",
    "Last week's reward waits in the vault", "Click: the Great Vault",
  ]);
  addon.eval("__wfgRetailVault.slots = { { type = 3, progress = 2, threshold = 1 } }");
  expect(vaultTip(addon)[1], "a row with every slot unlocked").toBe("Raids|1/1 unlocked");
  clickLine(addon);
  expect(addon.eval("return __wfgRetailVault.opened")).toBe(1);
  setCombat(addon, true);
  clickLine(addon);
  expect([addon.eval("return __wfgRetailVault.opened"), chatHas(addon, /The Great Vault doesn't open from Vanguard in a fight/)]).toEqual([1, true]);
});

it("retail landing: the expansion page takes the window skin, and its overlay (made later) loses its border, its title and close button in the theme", () => {
  const addon = retail(["ExpansionLandingPage"]);
  addon.eval("__wfgRetailVault.overlay() ExpansionLandingPage:Show()");
  const state = addon.eval(`local o = ExpansionLandingPage.overlayFrame
    return { border = o.Border.__alpha, picture = o.Background.__alpha ~= 0, title = __looks(o.Header.Title, "heading", "text"),
      close = __control(o.CloseButton), panel = select("#", ExpansionLandingPage:GetRegions()) > 0 }`);
  expect(state).toEqual({ border: 0, picture: true, title: true, close: true, panel: true });
});

it("retail landing: the expansion page's minimap button stays on Retail, on the map's lower left corner", () => {
  const addon = retail();
  const state = addon.eval(`local b, MM = ExpansionLandingPageMinimapButton, ns.GetModule("Minimap")
    local point, rel = b:GetPoint(1)
    return { shown = b:IsShown() ~= false, parent = b:GetParent() == MM.overlay, point = point, rel = rel == MM.overlay, scale = b:GetScale() }`);
  expect(state).toEqual({ shown: true, parent: true, point: "BOTTOMLEFT", rel: true, scale: 0.6 });
  addon.eval(`ExpansionLandingPageMinimapButton:SetPoint("TOPLEFT", UIParent, "TOPLEFT", -3, -150)`);
  expect(addon.eval("return select(2, ExpansionLandingPageMinimapButton:GetPoint(1)) == ns.GetModule('Minimap').overlay"), "the game's own placing is undone").toBe(true);
});

it("retail landing: the transmog window is dressed when it loads; its character scene stays the game's", () => {
  const addon = retail(["TransmogFrame"]);
  addon.eval(`__wfgStub.fire("ADDON_LOADED", "Blizzard_Transmog") TransmogFrame:Show()`);
  expect(windowState(addon, "TransmogFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  const items = "TransmogFrame.WardrobeCollection.TabContent.ItemsFrame";
  const state = addon.eval(`local t, items, toggles = TransmogFrame, ${items}, TransmogFrame.CharacterPreview.ToggleOptions
    return { wells = __sunk(t.OutfitCollection) and __sunk(t.WardrobeCollection), frame = t.WardrobeCollection.TabContent.Border.__alpha,
      save = __button(t.OutfitCollection.SaveOutfitButton), dropdowns = __button(items.FilterButton) and __button(items.WeaponDropdown),
      search = __search(items.SearchBox), checks = __box(toggles.HideIgnoredToggle.Checkbox) and __box(items.SecondaryAppearanceToggle.Checkbox),
      label = __looks(toggles.HideIgnoredToggle.Text, "label", "text"), heading = __looks(items.ActiveSlotTitle, "heading", "text"),
      money = __themed(t.OutfitCollection.MoneyFrame.Money.GoldButton.Text), plate = t.OutfitCollection.MoneyFrame.Background.__alpha,
      scene = t.CharacterPreview.Background.__alpha ~= 0 }`);
  expect(state).toEqual({ wells: true, frame: 0, save: true, dropdowns: true, search: true, checks: true, label: true, heading: true, money: true, plate: 0, scene: true });
});

it("retail landing: the transmog window's Items / Sets tabs are theme tabs, the selected glow faded, the system left in place (H27-6-2)", () => {
  const addon = retail(["TransmogFrame"]);
  addon.eval(`local s = CreateFrame("Frame", nil, TransmogFrame.WardrobeCollection) TransmogFrame.WardrobeCollection.TabHeaders = s
    s:SetPoint("TOPLEFT", TransmogFrame.WardrobeCollection, "TOPLEFT", 32, -12)
    local b = CreateFrame("Button", nil, s) b.Left = b:CreateTexture() b.Icon = b:CreateTexture() b.SelectedHighlight = CreateFrame("Frame", nil, b)
    function s:GetTabButton(id) return id == 1 and b or nil end
    function b:SetTabSelected(on) self.SelectedHighlight:SetShown(on) end
    __wfgStub.fire("ADDON_LOADED", "Blizzard_Transmog") TransmogFrame:Show()
    b:SetTabSelected(true)`);
  expect(addon.eval(`local s = TransmogFrame.WardrobeCollection.TabHeaders local b = s:GetTabButton(1)
    local _, rel, _, x, y = s:GetPoint(1)
    return { b.Left.__alpha, b.SelectedHighlight.__alpha, rel == TransmogFrame.WardrobeCollection, x, y, #ns.errors }`), "tab art and glow faded, the system still anchored inside its page").toEqual([0, 0, true, 32, -12, 0]);
});

it("retail landing: the Trading Post's lists sit on flat insets and its plain buttons are themed; the price buttons stay the game's", () => {
  const addon = retail(["PerksProgramFrame"]);
  addon.eval(`__wfgStub.fire("ADDON_LOADED", "Blizzard_PerksProgram") PerksProgramFrame:Show()`);
  const state = addon.eval(`local p = PerksProgramFrame.ProductsFrame
    local list, cart = p.ProductsScrollBoxContainer, p.PerksProgramShoppingCartFrame
    return { frames = { list.Border.__alpha, cart.Background.__alpha }, wells = __sunk(list) and __sunk(cart),
      leave = __button(PerksProgramFrame.FooterFrame.LeaveButton), buy = __button(PerksProgramFrame.FooterFrame.PurchaseButton),
      filter = __button(p.PerksProgramFilter), title = __looks(cart.Title, "heading", "text"), panel = select("#", PerksProgramFrame:GetRegions()) }`);
  expect(state).toEqual({ frames: [0, 0], wells: true, leave: true, buy: false, filter: true, title: true, panel: 0 });
});

it("retail landing: a part of the expansion page this client draws another way is reported by its path, and the rest is dressed", () => {
  const addon = retail(["ExpansionLandingPage"]);
  expectErrors("retail window ExpansionLandingPage.overlayFrame.Header.Title: TEST-ONLY broken");
  addon.eval(`local o = __wfgRetailVault.overlay() o.Header.Title = { SetFont = function() error("TEST-ONLY broken", 0) end } ExpansionLandingPage:Show()`);
  expect(addon.eval("return ExpansionLandingPage.overlayFrame.Border.__alpha")).toBe(0);
});

it("retail vault: Retail drags the vault, the expansion page and the transmog window; WoW Forever's lists and strip never see them", () => {
  const read = `local GW, IS = ns.GetModule("Windows"), ns.GetModule("InfoStrip")
    local function has(list, name) for _, n in ipairs(list) do if n == name then return true end end return false end
    return { transmog = has(GW.MOVABLE, "TransmogFrame"), vault = has(GW.MOVABLE_TOP, "WeeklyRewardsFrame"), page = has(GW.MOVABLE_TOP, "ExpansionLandingPage"),
      groups = GW.defaults.vault ~= nil and GW.defaults.expansion ~= nil, line = IS.BLOCKS.vault ~= nil }`;
  expect(retail().eval(read)).toEqual({ transmog: true, vault: true, page: true, groups: true, line: true });
  expect(forever().eval(read)).toEqual({ transmog: false, vault: false, page: false, groups: false, line: false });
});
