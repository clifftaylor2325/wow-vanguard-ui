-- Delves on WoW Retail (the TOC keeps this file off WoW Forever, which has no delves):
--   * the delve windows in the Vanguard look, under the Game windows switch for the character, merchant and other
--     windows: the companion window (Brann's role, curios and level), its ability list, and the picker a delve's
--     door opens (its tier, rewards and Enter button). The companion window and the picker frame a painted scene,
--     which stays: only their dialog border goes, for the theme's edge, shadow and corners round the scene;
--   * the tracker's scenario block (Modules/RetailQuests.lua) names the delve you are in with its tier
--     ("Fungal Folly · Tier 8"), through RQ.HEADINGS, and lists the game's delve header under its stage (counters
--     such as lives, affixes, the reward chest), through RQ.EXTRAS.
-- WoW Retail 12.1.5 has no delves page in the group finder: delves are chosen at their door, so the picker stands in.
-- Frame names and parentKeys are read from Blizzard's live source (wow-ui-source, live branch, 12.1.5):
-- Blizzard_DelvesCompanionConfiguration (it loads with the game on Retail) and Blizzard_DelvesDifficultyPicker (on
-- demand, at the door). Every part is optional: a client without one skips it. The delve calls are C_DelvesUI's
-- (DelvesUIDocumentation.lua); a value the client hides counts as none.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local GW = ns.GetModule("Windows")
local QT = ns.GetModule("QuestTracker")
local RQ = ns.RetailQuests

local RD = {}
ns.RetailDelves = RD

-- The tracker's delve heading -------------------------------------------------------------------

-- The tier of the delve you are in, or nil outside one (or while the client hides it).
function RD.Tier()
  if not ns.IsTrue(ns.CallIf(C_DelvesUI, "HasActiveDelve")) then return nil end
  local info = ns.CallIf(C_DelvesUI, "GetActiveDelveTier")
  local tier = not ns.IsSecret(info) and type(info) == "table" and ns.PlainNumber(info.tier)
  return tier and tier > 0 and tier or nil
end

-- A delve's heading, its name and tier ("Fungal Folly · Tier 8"); nil in any other scenario.
function RD.Heading(name)
  local tier = RD.Tier()
  return tier and ns.Format(L["{delve} · Tier {tier}"], { delve = name, tier = tier }) or nil
end

table.insert(RQ.HEADINGS, RD.Heading)

-- The delve header the game draws in its own tracker (Blizzard_UIWidgetTemplateScenarioHeaderDelves), which Vanguard's
-- tracker replaces: read from the step's widget set (C_UIWidgetManager, UIWidgetManagerDocumentation.lua) and shown as
-- plain objectives under the stage: its counters (such as lives), its affixes and the reward chest.
RD.WIDGET_TYPE = 29 -- Enum.UIWidgetVisualizationType.ScenarioHeaderDelves
RD.SHOWN = 1 -- Enum.WidgetShownState.Shown
RD.REWARD_EARNED, RD.REWARD_UNEARNED = 1, 2 -- Enum.UIWidgetRewardShownState

-- A table the client gives plainly (a hidden one counts as none).
local function plainTable(v)
  return not ns.IsSecret(v) and type(v) == "table" and v or nil
end

-- The delve header's info when this widget is one and it is shown, else nil.
function RD.HeaderOf(widget)
  widget = plainTable(widget)
  local id = widget and ns.PlainNumber(widget.widgetType) == RD.WIDGET_TYPE and ns.PlainNumber(widget.widgetID)
  local info = id and plainTable(ns.CallIf(C_UIWidgetManager, "GetScenarioHeaderDelvesWidgetVisualizationInfo", id))
  return info and ns.PlainNumber(info.shownState) == RD.SHOWN and info or nil
end

-- The header of the delve you are in, from the widget set of the scenario's step; nil outside a delve, with no set,
-- or while the client hides it.
function RD.HeaderInfo(step)
  local set = RD.Tier() and ns.PlainNumber(step.widgetSetID)
  if not set then return nil end
  for _, widget in ipairs(plainTable(ns.CallIf(C_UIWidgetManager, "GetAllWidgetsBySetID", set)) or {}) do
    local info = RD.HeaderOf(widget)
    if info then return info end
  end
end

-- One counter of the header ("Lives 3") as an objective; nil while the client hides its text.
function RD.CurrencyLine(currency)
  currency = plainTable(currency)
  local count = currency and ns.PlainText(currency.text)
  if not count then return nil end
  local name = ns.PlainText(currency.leadingText)
  return { text = name and ns.Format(L["{name} {count}"], { name = name, count = count }) or count }
end

-- The ids of the header's affix spells that the client shows plainly.
function RD.SpellIDs(spells)
  local ids = {}
  for _, spell in ipairs(plainTable(spells) or {}) do
    local id = plainTable(spell) and ns.PlainNumber(spell.spellID)
    if id then ids[#ids + 1] = id end
  end
  return ids
end

-- The header's affixes as one objective ("Affixes: Overgrowth, Rotting"); nil when it has none the client names.
function RD.AffixLine(spells)
  local names = ns.SpellNames(RD.SpellIDs(spells))
  if #names == 0 then return nil end
  return { text = ns.Format(L["Affixes: {spells}"], { spells = table.concat(names, ", ") }) }
end

-- The reward chest's state as an objective, done once earned; nil while the header shows no chest.
function RD.RewardLine(reward)
  local state = plainTable(reward) and ns.PlainNumber(reward.shownState)
  if state == RD.REWARD_EARNED then return { text = L["Reward chest earned"], done = true } end
  if state == RD.REWARD_UNEARNED then return { text = L["Reward chest not earned"] } end
end

-- The delve header as objectives under the stage: a row per counter, the affixes, the reward chest. None outside a delve.
function RD.HeaderLines(step)
  local info = RD.HeaderInfo(step)
  local lines = {}
  if not info then return lines end
  for _, currency in ipairs(plainTable(info.currencies) or {}) do
    lines[#lines + 1] = RD.CurrencyLine(currency)
  end
  lines[#lines + 1] = RD.AffixLine(info.spells)
  lines[#lines + 1] = RD.RewardLine(info.rewardInfo)
  return lines
end

table.insert(RQ.EXTRAS, RD.HeaderLines)
-- The game's header widget redraws on this event (a lives counter changes), so does Vanguard's tracker.
table.insert(QT.EVENTS, "UPDATE_UI_WIDGET")
-- The game's own tracker redraws its scenario block on this event in a delve.
table.insert(QT.EVENTS, "ACTIVE_DELVE_DATA_UPDATE")

-- The windows -------------------------------------------------------------------------------------

-- The dialog border (DialogBorderTemplate) round the companion window's and the picker's painted scenes.
RD.SCENE_ART = { "Border" }
-- The companion's four slots (role, flavour and the two curios), each a label over the game's coloured value.
RD.SLOTS = { "CompanionCombatRoleSlot", "CompanionFlavorSlot", "CompanionCombatTrinketSlot", "CompanionUtilityTrinketSlot" }

-- A window round a painted scene: its dialog border faded, the theme's edge with a shadow and corners round it (no
-- fill: the scene, and the game's dark fill where there is none, stay) and the close button in the theme.
function RD.SkinScene(frame)
  GW.FadeParts(frame, RD.SCENE_ART)
  T.Panel(frame, { noBg = true, shadow = true })
  T.Ornament(frame, "corners")
  GW.DressClose(frame, frame.CloseButton)
end

-- The companion window: the scene skin, each slot's label in the light text colour (its value keeps the game's
-- colour: a curio's rarity) and the View abilities button.
function RD.SkinCompanion(frame)
  RD.SkinScene(frame)
  for _, key in ipairs(RD.SLOTS) do GW.SkinText(GW.Part(frame, "CompanionSlots." .. key .. ".Label"), "label", "text") end
  GW.SkinButton(frame.CompanionConfigShowAbilitiesButton)
end

-- The companion's ability list: the window skin, its role dropdown and its pager.
function RD.SkinAbilities(frame)
  GW.Skin(frame)
  GW.SkinDropdown(frame.DelvesCompanionRoleDropdown)
  GW.SkinPaging(frame.DelvesCompanionAbilityListPagingControls)
end

-- The picker at a delve's door: the scene skin, its tier dropdown, the Enter button and the rewards' scroll bar.
function RD.SkinPicker(frame)
  RD.SkinScene(frame)
  GW.SkinDropdown(frame.Dropdown)
  GW.SkinButton(frame.EnterDelveButton)
  local bar = GW.Part(frame, "DelveRewardsContainerFrame.ScrollBar")
  if bar then T.ScrollBar(bar) end
end

GW.AddOnDemand("windows", "Blizzard_DelvesCompanionConfiguration", { "DelvesCompanionConfigurationFrame" }, RD.SkinCompanion)
GW.AddOnDemand("windows", "Blizzard_DelvesCompanionConfiguration", { "DelvesCompanionAbilityListFrame" }, RD.SkinAbilities)
GW.AddOnDemand("windows", "Blizzard_DelvesDifficultyPicker", { "DelvesDifficultyPickerFrame" }, RD.SkinPicker)

-- The ability list is dragged by its title bar, the companion window (which has none) by its top edge, like the
-- other game windows (Modules/WindowsMove.lua). The picker stays where the game puts it, as a talk window does.
table.insert(GW.MOVABLE, "DelvesCompanionAbilityListFrame")
table.insert(GW.MOVABLE_TOP, "DelvesCompanionConfigurationFrame")
