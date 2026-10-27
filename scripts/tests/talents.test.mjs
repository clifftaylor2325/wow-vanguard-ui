// talents: the Talent planner (Modules/TalentPlanner.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { WINDOWS_ENV, chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY trait API: one tree (1) with two groups, Discipline (10) and Holy (20). Nodes by ID: their group,
// place (x, y in the game's units, 600 a row), ranks bought and possible, the points their row needs in the group
// (gate), and the edges out of them (a requirement edge, type 3, into the node named). Spells are node ID x 10.
// PurchaseRank buys a rank and takes a point; the class talents' commit counts its calls.
const TRAITS_ENV = `
  __nodes = {
    [101] = { g = 10, x = 0, y = 0, max = 5, rank = 0 }, [102] = { g = 10, x = 600, y = 0, max = 2, rank = 0 },
    [103] = { g = 10, x = 0, y = 600, max = 3, rank = 0, gate = 5, edges = { { targetNode = 104, type = 3 } } },
    [104] = { g = 10, x = 0, y = 1200, max = 1, rank = 0, gate = 10 },
    [201] = { g = 20, x = 1800, y = 0, max = 5, rank = 2 },
  }
  __points, __bought, __commits, __hash = 3, {}, 0, { 1, 2, 3 }
  __names = { [1010] = "Unbreakable Will", [1020] = "Wand Specialization", [1030] = "Silent Resolve", [1040] = "Inner Focus", [2010] = "Healing Focus" }
  C_SpecializationInfo.GetActiveSpecGroup = function() return 1 end
  C_SpecializationInfo.GetCombatConfigIDForSpecGroup = function(group) return 500 + group end
  C_Spell.GetSpellName = function(id) return __names[id] end
  C_Traits = {
    GetConfigInfo = function(id) return id == 501 and { treeIDs = { 1 } } or nil end,
    GetTreeHash = function() return __hash end,
    GetGroupDisplayInfoByTreeID = function() return { { groupID = 10, displayName = "Discipline", orderIndex = 1 }, { groupID = 20, displayName = "Holy", orderIndex = 2 } } end,
    GetTreeCurrencyInfo = function() return { { quantity = __points } } end,
    GetTreeNodes = function() local out = {} for id in pairs(__nodes) do out[#out + 1] = id end table.sort(out) return out end,
    GetNodeInfo = function(_, id)
      local n = __nodes[id]
      if not n then return nil end
      return { posX = n.x, posY = n.y, ranksPurchased = n.rank, maxRanks = n.max, groupIDs = { n.g }, visibleEdges = n.edges or {},
        conditionIDs = n.gate and { id * 100 } or {}, entryIDs = { id * 10 }, isVisible = true }
    end,
    GetConditionInfo = function(_, condID) return { isGate = true, spentAmountRequired = __nodes[math.floor(condID / 100)].gate } end,
    GetEntryInfo = function(_, entryID) return { definitionID = entryID } end,
    GetDefinitionInfo = function(defID) return { spellID = defID } end,
    PurchaseRank = function(_, id) __bought[#__bought + 1] = id __nodes[id].rank = __nodes[id].rank + 1 __points = __points - 1 return true end,
  }
  C_ClassTalents = { CommitConfig = function() __commits = __commits + 1 return true end }
`;

// TEST-ONLY talents window as Forever keeps it: the spellbook window's TalentsFrame, its talent buttons two frames
// down (TestOnlyTalent<node>), each knowing its node by a nodeID field.
const WINDOW_ENV = WINDOWS_ENV + `
  local spells = __window("PlayerSpellsFrame")
  spells.TalentsFrame = CreateFrame("Frame", nil, spells)
  local holder = CreateFrame("Frame", nil, spells.TalentsFrame)
  for id in pairs(__nodes) do
    local b = CreateFrame("Button", "TestOnlyTalent" .. id, holder)
    b:SetSize(40, 40)
    b.nodeID = id
  end
  function __open() PlayerSpellsFrame:Show() PlayerSpellsFrame.TalentsFrame:Show() end
  -- The planner's mark on a talent button: its only child.
  function __mark(id) return (_G["TestOnlyTalent" .. id]:GetChildren()) end
  function __click(id, mouse) local m = __mark(id) m.__scripts.OnClick(m, mouse or "LeftButton") end
`;

const TP = "ns.GetModule('TalentPlanner')";
// A planner that has the window open and painted.
const open = (extra = "", opts) => {
  const addon = loggedIn(TRAITS_ENV + WINDOW_ENV + extra, opts);
  addon.eval("__open()");
  addon.update(0.01);
  return addon;
};
// The summary line on the bar.
const summary = (addon) => addon.eval("return Vanguard_TalentPlan.summary:GetText()");
// A mark's state: its badge text and whether it shows, its ring, and whether it takes the mouse.
const mark = (addon, id) => addon.eval(`local m = __mark(${id}) return { badge = m.badge:GetText(), shown = m.badge:IsShown(), ring = m.ring[1]:IsShown(), mouse = m.__mouse == true, color = m.badge.__textColor }`);

it("talent planner: the bar on the talents window, and plan mode's clicks set planned ranks", () => {
  const addon = open();
  expect(addon.eval("return { Vanguard_TalentPlan:GetParent() == PlayerSpellsFrame.TalentsFrame, Vanguard_TalentPlan.plan.label:GetText(), Vanguard_TalentPlan.spend:IsEnabled(), #ns.errors }"), "the bar sits on the talents window with Plan and Spend planned (nothing planned: Spend greyed), without errors").toEqual([true, "Plan", false, 0]);
  expect(summary(addon), "the summary counts the plan (what is bought counts as planned) and the points waiting").toBe("2 planned, 2 bought, 0 to buy; 3 points to spend");
  expect(mark(addon, 101), "a mark on each talent, quiet and letting clicks through to the game").toMatchObject({ shown: false, ring: false, mouse: false });
  addon.eval(`${TP}.SetPlanning(true)`);
  expect(mark(addon, 101).mouse, "plan mode: the marks take the mouse").toBe(true);
  addon.eval("__click(101) __click(101)");
  const planned = mark(addon, 101);
  expect([planned.badge, planned.shown, isTok(addon, planned.color, "accentText"), planned.ring], "two left-clicks plan two ranks: the badge shows 2 in the accent's text colour, and it is the next pick").toEqual(["2", true, true, true]);
  expect(addon.eval("return VanguardCharDB.talentPlans[1].ranks[101]"), "the plan is saved per character and spec group").toBe(2);
  addon.eval("__click(101, 'RightButton')");
  expect(mark(addon, 101).badge, "a right-click takes one back").toBe("1");
  expect(summary(addon), "the summary follows").toBe("3 planned, 2 bought, 1 to buy; next: Unbreakable Will; 3 points to spend");
  addon.eval("__click(101, 'RightButton')");
  expect(addon.eval("return { __mark(101).badge:IsShown(), VanguardCharDB.talentPlans[1].ranks[101] == nil }"), "back to what is bought removes it from the plan").toEqual([false, true]);
  addon.eval("for _ = 1, 7 do __click(102) end");
  expect(mark(addon, 102).badge, "a plan never goes past the talent's ranks").toBe("2");
  expect(addon.eval("return __bought[1] == nil and PlayerSpellsFrame.TalentsFrame:IsVisible()"), "nothing was bought by planning").toBe(true);
  addon.eval(`${TP}.SetPlanning(false)`);
  expect(mark(addon, 102), "plan mode off: the badge stays, the mouse goes back to the game").toMatchObject({ badge: "2", shown: true, mouse: false });
});

it("talent planner: buying order, rows' gates, prerequisites and unreachable ranks", () => {
  const addon = open();
  // Puts a plan in (the ranks as Lua), repaints, and reads the result back: the order, what is stuck, points planned.
  const plan = (lua) => addon.eval(`local TP = ${TP} VanguardCharDB.talentPlans = { { ranks = { ${lua} }, hash = "1-2-3" } } TP.Refresh() local r = TP.result return { order = r.order, stuck = r.stuck, planned = r.planned }`);
  const deep = plan("[104] = 1");
  expect([deep.order, deep.stuck, deep.planned], "a talent whose row and prerequisite the plan lacks can't be reached: nothing to buy, marked stuck").toEqual([{}, { 104: true }, 3]);
  const m = mark(addon, 104);
  expect([m.shown, isTok(addon, m.color, "bad"), m.ring], "its badge is red, no ring").toEqual([true, true, false]);
  expect(summary(addon), "and the summary says so").toBe("3 planned, 2 bought, 1 to buy; 1 unreachable; 3 points to spend");
  const full = plan("[101] = 5, [102] = 2, [103] = 3, [104] = 1");
  expect(full.order, "with the rows above planned, the order goes top row left to right, then down, the gate (5 then 10 in the tree) and the prerequisite (Silent Resolve full) met as it goes").toEqual([101, 101, 101, 101, 101, 102, 102, 103, 103, 103, 104]);
  expect(full.stuck, "nothing stuck").toEqual({});
  expect(mark(addon, 101).ring, "the ring is on the first pick").toBe(true);
  const gated = plan("[101] = 4, [103] = 1");
  expect([gated.order, gated.stuck], "four points in the tree don't open its second row").toEqual([[101, 101, 101, 101], { 103: true }]);
  const other = plan("[201] = 3");
  expect(other.order, "a plan under or at what is bought counts for nothing; the third rank is one point").toEqual([201]);
});

it("talent planner: Spend planned buys the next picks in order and applies them; chat says what", () => {
  const addon = open();
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 5, [102] = 2 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  expect(addon.eval("return Vanguard_TalentPlan.spend:IsEnabled()"), "with points and a plan, Spend planned is live").toBe(true);
  addon.eval("Vanguard_TalentPlan.spend:GetScript('OnClick')()");
  expect(addon.eval("return { __bought, __commits, __points }"), "the three points go on the first pick, then the game's commit applies them").toEqual([[101, 101, 101], 1, 0]);
  expect(chatHas(addon, /Talent planner: spent 3 points on Unbreakable Will x3\./), "chat says what was spent").toBe(true);
  addon.update(0.01);
  expect(mark(addon, 101), "the badge still shows the rank to reach").toMatchObject({ badge: "5", shown: true });
  expect(summary(addon), "the summary counts the bought ranks and no points").toBe("9 planned, 5 bought, 4 to buy; next: Unbreakable Will");
  addon.eval(`${TP}.SpendPlanned()`);
  expect(chatHas(addon, /Talent planner: no points to spend\./), "no points: says so").toBe(true);
  addon.eval(`__points = 2 ${TP}.SpendPlanned(1)`);
  expect(addon.eval("return { #__bought, __nodes[101].rank }"), "a count buys that many").toEqual([4, 4]);
  addon.eval("__points = 1 InCombatLockdown = function() return true end");
  addon.eval(`${TP}.SpendPlanned()`);
  expect([addon.eval("return #__bought"), chatHas(addon, /Talents can't be changed in combat\./)], "nothing in combat").toEqual([4, true]);
  addon.eval("InCombatLockdown = function() return false end __points = 1 VanguardCharDB.talentPlans[1].ranks = {}");
  addon.eval(`${TP}.SpendPlanned()`);
  expect(chatHas(addon, /nothing planned that can be bought now\./), "points but no plan: says so").toBe(true);
  addon.eval("C_ClassTalents.CommitConfig = function() return false end __points = 1 VanguardCharDB.talentPlans[1].ranks = { [101] = 5 }");
  addon.eval(`${TP}.SpendPlanned()`);
  expect(chatHas(addon, /the game refused to apply talents just now/), "a refused commit (the game's throttle) is said").toBe(true);
});

it("talent planner: Spend planned stops at a rank the game refuses, says which, and applies only what it bought", () => {
  const addon = open();
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 5 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  addon.eval("local buy = C_Traits.PurchaseRank C_Traits.PurchaseRank = function(c, id) if #__bought >= 1 then return false end return buy(c, id) end");
  addon.eval(`${TP}.SpendPlanned()`);
  expect(addon.eval("return { __bought, __commits }"), "one rank bought, then applied").toEqual([[101], 1]);
  expect(chatHas(addon, /Talent planner: spent 1 point on Unbreakable Will\./), "chat counts only the rank bought").toBe(true);
  expect(chatHas(addon, /Talent planner: the game refused Unbreakable Will; nothing after it was bought\./), "and names the refused pick").toBe(true);
  addon.eval(`${TP}.SpendPlanned()`);
  expect(addon.eval("return __commits"), "nothing bought: nothing to apply").toBe(1);
});

it("talent planner: at a level-up chat names the next pick, or Spend by itself buys it", () => {
  const addon = open();
  addon.eval(`__points = 0 VanguardCharDB.talentPlans = { { ranks = { [101] = 5 }, hash = "1-2-3" } }`);
  addon.fire("PLAYER_LEVEL_UP", 61);
  addon.eval("__points = 1");
  addon.update(1.1);
  expect(chatHas(addon, /1 talent point to spend; your plan's next pick is Unbreakable Will \(\/vg talents spend buys it\)\./), "a second after the level-up, the point is read and the next pick named").toBe(true);
  expect(addon.eval("return #__bought"), "nothing bought by itself").toBe(0);
  addon.eval(`${TP}.settings.autoSpend = true`);
  addon.fire("PLAYER_LEVEL_UP", 62);
  addon.update(1.1);
  expect(addon.eval("return { __bought, __commits }"), "Spend by itself buys and applies").toEqual([[101], 1]);
  const quiet = open(`${TP}.defaults.levelPrompt = false`, { savedVariables: "VanguardDB.profiles = { Default = { TalentPlanner = { levelPrompt = false } } }" });
  quiet.eval(`__points = 1 VanguardCharDB.talentPlans = { { ranks = { [101] = 5 }, hash = "1-2-3" } }`);
  quiet.fire("PLAYER_LEVEL_UP", 61);
  quiet.update(1.1);
  expect(chatHas(quiet, /talent point to spend/), "the prompt switched off says nothing").toBe(false);
});

it("talent planner: export and import share a plan as a string, for your class; clear empties it", () => {
  const addon = open();
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 5, [103] = 2 }, hash = "1-2-3" } } ${TP}.ExportDialog()`);
  const text = addon.eval("return Vanguard_TextEdit:GetText()");
  expect(text.startsWith("VG1:talents:"), "the export is a VG1 string in the talents scope").toBe(true);
  addon.eval(`${TP}.Clear()`);
  expect(addon.eval("return { next(VanguardCharDB.talentPlans[1].ranks) == nil, __mark(101).badge:IsShown() }"), "clear empties the plan and the badges go").toEqual([true, false]);
  expect(addon.eval(`return { ${TP}.Import(${JSON.stringify(text)}) }`), "importing it brings the plan back, with its points").toEqual([true, 7]);
  expect(addon.eval("return { VanguardCharDB.talentPlans[1].ranks[101], VanguardCharDB.talentPlans[1].ranks[103], __mark(101).badge:GetText() }"), "ranks and badges are back").toEqual([5, 2, "5"]);
  const priest = addon.eval(`return ns.Serialize.Encode("talents", { class = "PRIEST", ranks = { [101] = 1 } })`);
  expect(addon.eval(`return { ${TP}.Import(${JSON.stringify(priest)}) }`), "another class's plan is refused").toEqual([false, "that plan is for a Priest"]);
  expect(addon.eval(`return { ${TP}.Import(ns.Serialize.Encode("profile", {})) }`), "a profile string is not a plan").toEqual([false, "that is not a talent plan"]);
  expect(addon.eval(`return { ${TP}.Import("hello") }`), "junk is refused with the serializer's reason").toEqual([false, "not a Vanguard profile string"]);
  addon.eval(`${TP}.Clear() ${TP}.ExportDialog()`);
  expect(chatHas(addon, /Nothing to export: this spec's plan is empty\./), "an empty plan has nothing to export").toBe(true);
});

it("talent planner: /vg talents clear and the Talents page's Clear button ask first; No keeps the plan", () => {
  const addon = open();
  // The yes/no question: whether it shows, and its text.
  const question = () => addon.eval("local f = Vanguard_Question return { f:IsShown(), f.title:GetText() }");
  // The ranks planned on talent 101 (0 when none).
  const planned = () => addon.eval("return VanguardCharDB.talentPlans[1].ranks[101] or 0");
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 5, [103] = 2 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  addon.slash("talents clear");
  expect(question(), "the command asks, naming what goes").toEqual([true, "Clear this spec's talent plan (7 points planned)? This can't be undone."]);
  addon.click("Vanguard_Question.no");
  expect(planned(), "No keeps the plan").toBe(5);
  addon.eval(`VanguardCharDB.talentPlans[1].ranks = { [101] = 1 } local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "talents" then page = p end end
    for _, row in ipairs(page.rows()) do if row[2] == "Clear this spec's plan" then row[3]() end end`);
  expect([question()[1], planned()], "the button asks too (one point), and nothing is cleared yet").toEqual(["Clear this spec's talent plan (1 point planned)? This can't be undone.", 1]);
  addon.click("Vanguard_Question.confirm");
  expect([planned(), chatHas(addon, /Talent plan cleared\./)], "Clear empties it").toEqual([0, true]);
});

it("talent planner: a plan made on another tree keeps the talents still there and says what was dropped", () => {
  const addon = open();
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 9, [104] = 1, [999] = 2 }, hash = "old" } } ${TP}.Refresh()`);
  expect(addon.eval("return { VanguardCharDB.talentPlans[1].ranks[101], VanguardCharDB.talentPlans[1].ranks[104], VanguardCharDB.talentPlans[1].ranks[999] == nil, VanguardCharDB.talentPlans[1].hash }"), "ranks capped, the missing talent dropped, the hash taken").toEqual([5, 1, true, "1-2-3"]);
  expect(chatHas(addon, /dropped 1 planned talent it no longer has\./), "chat says one was dropped").toBe(true);
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 2 } } } ${TP}.Refresh()`);
  expect(addon.eval("return VanguardCharDB.talentPlans[1].hash"), "a plan with no hash yet (older, or imported without one) takes the tree's quietly").toBe("1-2-3");
});

it("talent planner: the window's own button lookup and enumerator are used where the client has them", () => {
  const lookup = open("function PlayerSpellsFrame.TalentsFrame:GetTalentButtonByNodeID(id) return id == 101 and TestOnlyTalent101 or nil end");
  lookup.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 2, [102] = 1 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  expect(lookup.eval("return { __mark(101) ~= nil, __mark(102) == nil }"), "only the buttons the lookup gives are marked").toEqual([true, true]);
  const listed = open(`function PlayerSpellsFrame.TalentsFrame:EnumerateAllTalentButtons() return pairs({ [TestOnlyTalent102] = true }) end
    function TestOnlyTalent102:GetNodeID() return 102 end TestOnlyTalent102.nodeID = nil`);
  listed.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 2, [102] = 1 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  expect(listed.eval("return { __mark(102) ~= nil, __mark(101) == nil }"), "the enumerator's buttons, each asked its node ID").toEqual([true, true]);
});

it("talent planner: /vg talents, the summary and plan mode; a client without the trait API; the module off", () => {
  const addon = open();
  addon.slash("talents");
  expect(chatHas(addon, /Talent plan: 2 planned, 2 bought, 0 to buy; 3 points to spend\.$/), "/vg talents prints the summary").toBe(true);
  addon.slash("talents plan");
  expect(addon.eval(`return { ${TP}.planning, __mark(101).__mouse == true, Vanguard_TalentPlan.plan.knob ~= nil }`), "plan flips plan mode (the marks take the mouse)").toEqual([true, true, true]);
  addon.slash("talents export");
  expect(chatHas(addon, /Nothing to export/), "export with nothing planned says so").toBe(true);
  const bare = loggedIn(WINDOW_ENV.replace("for id in pairs(__nodes) do", "for id in pairs({}) do") + "C_Traits = nil");
  bare.eval("__open()");
  bare.update(0.01);
  expect(bare.eval("return { Vanguard_TalentPlan ~= nil, Vanguard_TalentPlan.summary:GetText() or \"\", #ns.errors }"), "without the trait API the bar is there, blank, and nothing errors").toEqual([true, "", 0]);
  bare.slash("talents");
  expect(chatHas(bare, /this client has no talent tree to read/), "/vg talents says why").toBe(true);
  const off = loggedIn(TRAITS_ENV + WINDOW_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { TalentPlanner = false } } }" });
  off.eval("__open()");
  off.update(0.01);
  expect(off.eval("return { Vanguard_TalentPlan == nil, (TestOnlyTalent101:GetChildren()) == nil, #ns.errors }"), "off: no bar, no marks").toEqual([true, true, 0]);
  off.slash("talents");
  expect(chatHas(off, /The Talent planner is off/), "/vg talents says it is off").toBe(true);
  expect(loggedIn(TRAITS_ENV).eval("return { #ns.errors, Vanguard_TalentPlan == nil }"), "no talents window yet: nothing built, no errors").toEqual([0, true]);
});

it("talent planner: a mark's tooltip, the import box, /vg talents spend, and the game's other ways in", () => {
  // TEST-ONLY: a talent sharing 101's spot whose spell has no name, one in a group the tree doesn't list, and a spec lookup that throws.
  const addon = open(`__nodes[105] = { g = 10, x = 0, y = 0, max = 1, rank = 0 } __nodes[301] = { g = 99, x = 0, y = 0, max = 1, rank = 0 }
    C_SpecializationInfo.GetActiveSpecGroup = function() error("TEST-ONLY") end`);
  // The tooltip's lines (a Lua list comes back as an object keyed 1, 2, ...).
  const tip = () => Object.values(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out") || {});
  expect(addon.eval(`return { ${TP}.SpecGroup(), ${TP}.ReadTree().nodes[301] == nil, #ns.errors }`), "a lookup that throws reads as none (spec group 1), and a talent outside the tree's groups is left out").toEqual([1, true, 0]);
  addon.eval(`${TP}.SetPlanning(true) __click(101)`);
  addon.eval("local m = __mark(101) m.__scripts.OnEnter(m)");
  expect([addon.eval("return { GameTooltip:IsShown(), GameTooltip.__spellId }"), tip().slice(-2)], "hovering a planned talent: its spell, then its plan and how to change it").toEqual([[true, 1010], ["Planned: 1 of 5 (0 bought)", "Left-click plans a point, right-click takes one back."]]);
  addon.eval("local m = __mark(102) m.__scripts.OnEnter(m)");
  expect(tip().slice(-2)[0], "a talent not in the plan says so").toBe("Not in your plan (0 of 2 bought)");
  addon.eval("local m = __mark(102) m.__scripts.OnLeave(m)");
  expect(addon.eval(`return { GameTooltip:IsShown(), ${TP}.hovered == nil }`), "leaving puts the tooltip away").toEqual([false, true]);
  // A client with no class talents applies the bought points through the trait API's own commit.
  addon.eval(`C_ClassTalents = nil C_Traits.CommitConfig = function(id) __traitCommit = id return true end
    VanguardCharDB.talentPlans = { { ranks = { [101] = 1, [105] = 1 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  addon.slash("talents spend");
  expect(addon.eval("return { __bought, __traitCommit }"), "/vg talents spend buys talents in the same spot by ID, and commits the config").toEqual([[101, 105], 501]);
  expect(chatHas(addon, /talent 105/), "a talent whose spell has no name is called by its ID").toBe(true);
  addon.slash("talents import");
  expect(addon.eval("return { Vanguard_TextDialog:IsShown(), Vanguard_TextDialog.title:GetText() }"), "/vg talents import opens a box to paste into").toEqual([true, "Paste a talent plan, then Import"]);
  addon.eval('Vanguard_TextEdit:SetText("garbage") Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)');
  expect(chatHas(addon, /Import failed: not a Vanguard profile string./), "a bad paste says why").toBe(true);
  const text = addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 2 }, hash = "1-2-3" } } ${TP}.ExportDialog() return Vanguard_TextEdit:GetText()`);
  addon.eval(`${TP}.Clear() ${TP}.ImportDialog() Vanguard_TextEdit:SetText(${JSON.stringify(text)}) Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
  expect([addon.eval("return Vanguard_TextDialog:IsShown()"), chatHas(addon, /Talent plan imported: 2 points./)], "a good paste imports the plan, closes the box and says how many points").toEqual([false, true]);
});

// TEST-ONLY talents window at Forever's size (Camelot Blizzard_PlayerSpellsFrame.xml: the window 1618 x 883,
// its TalentsFrame 1212 x 681 at its foot) with the game's Apply Changes button (ApplyButton, 164 x 22, centred 8 px up).
const APPLY_ENV = `
  PlayerSpellsFrame:SetSize(1618, 883) PlayerSpellsFrame:SetPoint("TOP", UIParent, "TOP", 0, -41)
  local tf = PlayerSpellsFrame.TalentsFrame
  tf:SetSize(1212, 681) tf:ClearAllPoints() tf:SetPoint("BOTTOM", PlayerSpellsFrame, "BOTTOM", 0, 4)
  tf.ApplyButton = CreateFrame("Button", nil, tf) tf.ApplyButton:SetSize(164, 22) tf.ApplyButton:SetPoint("BOTTOM", tf, "BOTTOM", 0, 8)
`;

it("talent planner: the summary stops short of the game's Apply Changes button, the whole of it in a tooltip", () => {
  const addon = open(APPLY_ENV);
  addon.eval(`VanguardCharDB.talentPlans = { { ranks = { [101] = 1, [104] = 1 }, hash = "1-2-3" } } ${TP}.Refresh()`);
  const full = "4 planned, 2 bought, 2 to buy; next: Unbreakable Will; 1 unreachable; 3 points to spend";
  expect(summary(addon), "a long summary").toBe(full);
  const room = addon.eval(`local s, a = Vanguard_TalentPlan.summary, PlayerSpellsFrame.TalentsFrame.ApplyButton
    return { a:GetLeft() - s:GetRight(), s:GetLeft() - Vanguard_TalentPlan.spend:GetRight() }`);
  expect(room, "it ends 12 px short of Apply Changes, 10 px after Spend planned").toEqual([12, 10]);
  addon.eval("local t = Vanguard_TalentPlan.tip t:GetScript('OnEnter')(t)");
  const lines = addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out");
  expect([addon.eval("return GameTooltip:IsShown()"), Object.values(lines).slice(-2)], "hovering it shows the whole summary").toEqual([true, [full, "Unreachable: a talent or row it needs is not in the plan."]]);
  addon.eval("local t = Vanguard_TalentPlan.tip t:GetScript('OnLeave')(t)");
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving puts it away").toBe(false);
  const plain = open();
  expect(plain.eval("local b = Vanguard_TalentPlan local point, rel, at = b.summary:GetPoint(2) return { point, rel == b, at }"), "a window without Apply Changes: the summary ends with the bar").toEqual(["RIGHT", true, "RIGHT"]);
  plain.eval("Vanguard_TalentPlan.summary:SetText('') local t = Vanguard_TalentPlan.tip t:GetScript('OnEnter')(t)");
  expect(plain.eval("return GameTooltip:IsShown()"), "no summary (a client without the trait API): no tooltip").toBe(false);
});

// The planner bar opened in a language at a Text size, in the text-fit client (the fonts' real widths and the real translations).
function barIn(locale, textScale) {
  const saved = `VanguardDB = { version = 2, profiles = { Default = { theme = { textScale = ${textScale} } } }, setupDone = true }\nVanguardCharDB = {}\n`;
  const addon = createAddon({ savedVariables: saved, textFit: true, client: `GetLocale = function() return "${locale}" end` });
  addon.eval(TRAITS_ENV + WINDOW_ENV);
  addon.login();
  addon.eval("__open()");
  addon.update(0.01);
  return addon;
}

for (const [locale, textScale] of [["frFR", 1], ["frFR", 1.3], ["deDE", 1.3]]) {
  it(`talent planner: in ${locale} at Text size ${textScale * 100}% the Plan caption is one line (B7-1)`, () => {
    const addon = barIn(locale, textScale);
    const [labelHeight, barHeight] = addon.eval("return { Vanguard_TalentPlan.plan.label:GetStringHeight(), Vanguard_TalentPlan:GetHeight() }");
    expect(labelHeight, "the Plan caption is one line: shorter than the 24-tall bar, which two lines fill").toBeLessThan(barHeight);
  });
}

for (const [locale, textScale] of [["deDE", 1.3], ["esES", 1.3], ["ruRU", 1], ["ruRU", 1.3]]) {
  it(`talent planner: in ${locale} at Text size ${textScale * 100}% Spend planned shows its whole label (B7-2)`, () => {
    const addon = barIn(locale, textScale);
    const [natural, room] = addon.eval("local b = Vanguard_TalentPlan.spend return { ns.Theme.FullWidth(b.text), b:GetWidth() - 2 * ns.Theme.SPACE.gap }");
    expect(natural, "the label at full size fits inside the button").toBeLessThanOrEqual(room + 1e-6);
  });
}
