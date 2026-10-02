-- The options pages (/fui, or the addons button by the minimap): a page
-- per area, as tables of rows. Core/OptionsWindow.lua builds the window
-- from them. Most changes apply at once; the ones that rebuild frames
-- light up the reload notice.

local ADDON, ns = ...

local T = ns.Theme

local O = {}
ns.Options = O


-- Settings accessors ------------------------------------------------------------------

-- A module's settings in the active profile, with its defaults.
local function moduleSettings(name)
  local m = ns.GetModule(name)
  return ns.Settings(name, m and m.defaults or {})
end

-- A module's default for one setting (nil when it has none).
local function default(module, key)
  local m = ns.GetModule(module)
  return m and m.defaults and m.defaults[key]
end

-- get/set for one module setting, and its default (the window marks a changed
-- setting and can put it back); reload marks a change that needs one.
local function setting(module, key, reload)
  return function() return moduleSettings(module)[key] end,
    function(v) moduleSettings(module)[key] = v; if reload then O.NeedReload() end end,
    default(module, key)
end

-- get/set for a module setting that applies at once (after() runs on each change), and its default.
local function liveSetting(module, key, after)
  local get, set, initial = setting(module, key)
  return get, function(v) set(v); after() end, initial
end

-- get/set for a raid frame setting that repaints the raid frames at once (look, power bar).
local function raidSetting(key)
  local get, set, initial = setting("RaidFrames", key)
  return get, function(v)
    set(v)
    local RF = ns.GetModule("RaidFrames")
    if RF and RF.settings then RF.UpdateAll() end
  end, initial
end

-- get/set for whether action bar n is shown (applies on reload).
local function barSetting(n)
  return function() local b = moduleSettings("ActionBars").bars[n] return b and b.enabled end,
    function(v) moduleSettings("ActionBars").bars[n].enabled = v; O.NeedReload() end
end

-- Tells the action bars that bar n's `key` changed, if they are running.
local function barChanged(n, key)
  local AB = ns.GetModule("ActionBars")
  if AB and AB.enabled then AB.SettingChanged(n, key) end
end

-- get/set for one of action bar n's settings (button count, per row,
-- visibility); applies at once, or when combat ends.
local function barOption(n, key)
  return function() return moduleSettings("ActionBars").bars[n][key] end,
    function(v) moduleSettings("ActionBars").bars[n][key] = v; barChanged(n, key) end
end

-- get/set for action bar n's button size (the shared size until the bar has its own).
local function barSizeOption(n)
  local _, set = barOption(n, "size")
  return function() local s = moduleSettings("ActionBars") return s.bars[n].size or s.size end, set
end

-- get/set for an unlock-mode option (grid, snap), applied at once.
local function moverOption(key)
  return function() return ns.MoverOptions()[key] end, function(v) ns.MoverOptions()[key] = v end
end

-- Page rows ---------------------------------------------------------------------------

-- A check row: { "check", label, get, set, default }.
local function check(text, get, set, initial)
  return { "check", text, get, set, initial }
end

-- The rows of b appended to a; returns a.
local function append(a, b)
  for _, row in ipairs(b) do a[#a + 1] = row end
  return a
end

-- get/set for a theme setting; changes apply on reload.
local function themeSetting(key)
  return function() return T.Settings()[key] end, function(v) T.Settings()[key] = v; O.NeedReload() end
end

-- get/set for a theme setting that applies at once (font, text size): every
-- styled text is re-fonted. Setting the same value again does nothing, so
-- dragging a slider only re-fonts when the value moves.
local function liveThemeSetting(key)
  return function() return T.Settings()[key] end, function(v)
    if T.Settings()[key] == v then return end
    T.Settings()[key] = v
    T.Refresh()
  end
end

local FONT_CHOICES = { { "", "Fira Sans Condensed" }, { "client", "the game's font" } }
local BAR_TEXTURES = { { "forever", "Forever" }, { "soft", "Soft" }, { "flat", "Flat" } }
-- Text size: 70% to 130% in steps of 5.
local TEXT_SIZES = { min = 0.7, max = 1.3, step = 0.05, format = function(v) return string.format("%d%%", math.floor(v * 100 + 0.5)) end }

-- General, part one: accent, font, text size, scale and theme reset.
local function lookRows()
  return {
    { "header", "Look" },
    { "preview" },
    { "swatches" },
    { "cycle", "Font", FONT_CHOICES, liveThemeSetting("font") },
    { "slider", "Text size", TEXT_SIZES, liveThemeSetting("textScale") },
    check("Pixel-perfect scale (crisp 1-pixel lines)", function() return T.Settings().pixelScale end,
      function(v) T.SetPixelScale(v); if not v then O.NeedReload() end end),
    { "button", "Reset theme", function() T.Reset() end },
  }
end

-- General, part two: moving frames.
local function layoutRows()
  return {
    { "header", "Layout" },
    { "button", "Move frames", function() O.Hide(); ns.Unlock() end },
    check("Show a grid while moving", moverOption("grid")),
    check("Snap to other frames", moverOption("snap")),
    check("Show these handles in the game's Edit Mode too", moverOption("editMode")),
    { "text", "While moving frames, right-click one for its exact anchor and offsets." },
    { "button", "Reset all positions", function() ns.ResetMovers("all") end },
  }
end

-- General, bars: texture, smoothing and shadows under the HUD.
local function barRows()
  return {
    { "header", "Bars" },
    { "cycle", "Bar texture", BAR_TEXTURES, themeSetting("barTexture") },
    check("Smooth health and power bars", function() return T.Settings().smoothBars end, function(v) T.Settings().smoothBars = v end),
    check("Soft shadows under frames (reload)", themeSetting("hudShadow")),
  }
end

-- General, motion and sound.
local function motionRows()
  return {
    { "header", "Motion and sound" },
    check("Reduce motion (no fades or flashes)", function() return T.Settings().reduceMotion end, function(v) T.Settings().reduceMotion = v end),
    check("Interface sounds", function() return T.Settings().sounds end, function(v) T.Settings().sounds = v end),
  }
end

-- General: look, bars, motion and layout.
local function generalRows()
  return append(append(append(lookRows(), barRows()), motionRows()), layoutRows())
end

-- Each module's name in the window and what it does (and what it needs, if anything).
O.MODULE_INFO = {
  UnitFrames = { "Unit frames", "Player, target, target of target, focus, pet and party frames." },
  CastBars = { "Cast bars", "Your cast bar, and your target's and focus's." },
  FrameAuras = { "Target and focus auras", "Buffs and debuffs under the target and focus frames. Needs Unit frames." },
  PlayerAuras = { "Your buffs and debuffs", "Your own auras and weapon enchants, left of the minimap." },
  ComboPoints = { "Combo points", "Rogue and druid combo points above the player frame. Needs Unit frames." },
  ClassBars = { "Class bars", "Shaman totems, and druid mana in forms, under the player frame. Needs Unit frames." },
  PowerTicks = { "Power bar sparks", "The five-second rule and energy ticks on your power bar. Needs Unit frames." },
  SwingTimer = { "Swing timer", "A row per hand that swings, from WoW Forever's own swing events." },
  UnitExtras = { "Readouts", "Threat on your target, and your pet's happiness. Needs Unit frames." },
  RaidFrames = { "Raid frames", "Raid (and party) tiles sorted by group or role." },
  RaidAuras = { "Raid debuffs and HoTs", "Debuffs you can dispel, and your heals over time, on the tiles. Needs Raid frames." },
  RaidHealing = { "Raid heals and aggro", "Incoming heals, shields, aggro and missing raid buffs. Needs Raid frames." },
  RaidStatus = { "Raid marks", "Range fade, raid icons, ready check, resurrection, leader. Needs Raid frames." },
  MainTanks = { "Main tank frames", "In a raid, the main tanks and assists as small tiles at the top left, with what each is targeting." },
  PartyExtras = { "Party pets and targets", "Small tiles for each party member's pet and target, above the party (switch it on under Unit frames)." },
  RaidTools = { "Raid tools", "For the leader and assistants: ready check, pull timer, role check, target icons and world markers." },
  ClickCast = { "Click casting", "Cast on a frame with a click or a hover key." },
  ActionBars = { "Action bars", "Eight bars with their own size, layout and visibility." },
  SpecialBars = { "Pet, stance and extra buttons", "Restyles the game's special buttons, and the vehicle exit." },
  Minimap = { "Minimap", "A square minimap with the zone and coordinates." },
  InfoStrip = { "Info strip", "Durability, bag slots, fps, gold, ammo and the time, under the minimap, your XP and gold per hour while you level, and your DPS if you like." },
  AfkScreen = { "AFK screen", "While you're away, the screen dims to a card with your character, zone, time away and XP." },
  MenuStrip = { "Menu and quest tracker", "The game's menu buttons (as ForeverUI icons) and bag buttons in a corner strip, and the quest tracker under the info strip." },
  Chat = { "Chat", "Themed chat windows and tabs." },
  Bags = { "Bags", "One combined bag, with a Sort button." },
  Merchant = { "Merchant helpers", "Repair, sell gray items, and a quieter error line." },
  ChatExtras = { "Chat extras", "Clickable web links in chat, and a Copy button for the recent chat." },
  MinimapButtons = { "Minimap drawer", "Other addons' minimap buttons gathered into a drawer beside the map." },
  AutoAccept = { "Auto-accept", "Accept summons and resurrections, decline duels (each off until you switch it on)." },
  QuestDialog = { "Quest dialog", "Talking to quest givers in ForeverUI's own dialog: numbered lines, reward cards, keys 1-9 and Space." },
  QuestTracker = { "Quest tracker", "Your watched quests under the info strip: levels in difficulty colors, objectives, quest items, nearest first if you like." },
  QuestLog = { "Quest log", "Your quests by zone, each quest's text, objectives and rewards, with Track, Share, Abandon and Map." },
  QuestAuto = { "Quest automation", "Accept, turn in, pick the best-selling reward, skip chatter; each off until switched on." },
  GameAlerts = { "Game alerts", "Loss of control and the talking head in the ForeverUI look, each in a spot you can move." },
  Errands = { "Errands", "Train all at a trainer, keep items stocked from merchants, and time your flights." },
  GameTools = { "The game's tools", "The game's Cooldown Manager and damage meter, restyled and placed to fit the layout." },
  Windows = { "Game windows", "Character, merchant, quest, loot and other game windows, popups and the breath bar in the ForeverUI look." },
  DataBars = { "XP and reputation", "Thin experience and reputation bars." },
  Tooltips = { "Tooltips", "Themed tooltips in a movable corner." },
  Nameplates = { "Nameplates", "Flat plates with levels, your debuffs, casts and threat." },
}

-- One module's switch, with its name and what it does (applies on reload).
local function moduleRow(name)
  local info = O.MODULE_INFO[name] or { name, "" }
  return { "module", info[1], function() return ns.ModuleEnabled(name) end,
    function(v) ns.SetModuleEnabled(name, v); O.NeedReload() end, nil, info[2] }
end

-- Modules: one switch per module.
local function moduleRows()
  local rows = { { "header", "Modules" }, { "text", "A module that's off builds nothing and costs nothing." } }
  for _, name in ipairs(ns.ModuleNames()) do rows[#rows + 1] = moduleRow(name) end
  return rows
end

-- get/set for a unit frame setting that repaints the frames at once.
local function unitFrameSetting(key)
  return liveSetting("UnitFrames", key, function() ns.GetModule("UnitFrames").Refresh() end)
end

-- Unit frames, and the class bars under the player frame.
local function unitFrameRows()
  return {
    { "header", "Unit frames" },
    check("Replace the default unit frames", setting("UnitFrames", "hideBlizzard", true)),
    check("Show health numbers", unitFrameSetting("healthText")),
    { "cycle", "Health as", { { "value", "Value (42.8K)" }, { "percent", "Percent (84%)" } }, unitFrameSetting("healthFormat") },
    check("Show levels (reload)", setting("UnitFrames", "showLevel", true)),
    check("Boss frames, top left (reload)", setting("UnitFrames", "boss", true)), check("Party pets and targets, above the party (reload)", setting("PartyExtras", "show", true)),
    check("Shaman totems under the player frame (reload)", setting("ClassBars", "totems", true)),
    check("Druid mana under the player frame in bear and cat form (reload)", setting("ClassBars", "druidMana", true)),
  }
end

-- Cast bars and the target/focus aura rows.
local function castRows()
  return {
    { "header", "Cast bars" },
    check("Your cast bar", setting("CastBars", "player", true)),
    check("Target cast bar", setting("CastBars", "target", true)),
    check("Focus cast bar", setting("CastBars", "focus", true)),
    { "header", "Target and focus auras" },
    check("Only your debuffs (reload)", setting("FrameAuras", "onlyMine", true)),
    check("Timer numbers on the icons (reload)", setting("FrameAuras", "timers", true)),
  }
end

-- Small readouts on the unit frames: threat on your target, your pet's mood.
local function readoutRows()
  return {
    { "header", "Readouts" },
    check("Your threat on your target, above its frame (reload)", setting("UnitExtras", "threat", true)),
    check("Your pet's happiness, a dot on the pet frame (reload)", setting("UnitExtras", "happiness", true)),
  }
end

-- get/set for one power bar spark, which switches at once.
local function sparkSetting(key)
  return liveSetting("PowerTicks", key, function() local PT = ns.GetModule("PowerTicks") if PT.spark then PT.UpdateMode() end end)
end

-- Combat timers: the swing timer, and the sparks on your power bar.
local function timerRows()
  return {
    { "header", "Combat timers" },
    { "cycle", "Swing timer (reload)", { { "auto", "Warriors, rogues, hunters" }, { "always", "Always" }, { "never", "Never" } }, setting("SwingTimer", "show", true) },
    check("Five-second rule spark on your mana bar", sparkSetting("mana")),
    check("Energy tick spark on your energy bar", sparkSetting("energy")),
  }
end

-- get/set for restyling all three of the client's special bars at once (applies on reload).
local function skinSpecial()
  return function() return moduleSettings("SpecialBars").skinPet end, function(v)
    local s = moduleSettings("SpecialBars")
    s.skinPet, s.skinStance, s.skinExtra = v, v, v
    O.NeedReload()
  end
end

-- Action bars, shared: locking, range tint, the default bars, the client's special buttons.
local function actionBarRows()
  return {
    { "header", "Action bars" },
    check("Lock buttons (Shift-drag to move actions)", setting("ActionBars", "lockButtons")),
    check("Red when out of range", setting("ActionBars", "rangeTint")),
    check("Hide the default bars", setting("ActionBars", "hideBlizzard", true)),
    check("Restyle the pet, stance and extra action buttons (reload)", skinSpecial()),
    check("Vehicle exit button (reload)", setting("SpecialBars", "vehicleExit", true)),
    { "text", "Empty slots stay hidden until you drag a spell or item onto the bars." },
  }
end

-- When a bar is seen. "On mouseover" shows it only while the mouse is over it;
-- On mouseover and In combat bars also show while you drag a spell or item.
-- "Hidden" doesn't draw the bar, but its keys still cast (a keybind-only bar).
local BAR_VISIBILITY = { { "always", "Always" }, { "mouseover", "On mouseover" }, { "combat", "In combat" }, { "hidden", "Hidden" } }
-- Buttons on a bar, and per row: 1 to 12.
local BAR_BUTTONS = { min = 1, max = 12, step = 1 }
-- Button size: 24 to 48 px in steps of 2.
local BAR_SIZES = { min = 24, max = 48, step = 2, format = function(v) return string.format("%d px", v) end }

-- Bar n's card title ("Bar 4, right edge" for the bars on the right edge).
local function barTitle(n)
  local AB = ns.GetModule("ActionBars")
  return (AB and AB.RightEdge(n)) and ("Bar " .. n .. ", right edge") or ("Bar " .. n)
end

-- One action bar's card: on/off, visibility, button count, per row and size.
local function oneBarRows(n)
  return {
    { "header", barTitle(n) },
    check("Show bar " .. n, barSetting(n)),
    { "cycle", "Visibility", BAR_VISIBILITY, barOption(n, "visibility") },
    { "text", "Hidden bars keep their keys: a bound key still casts." },
    { "slider", "Buttons", BAR_BUTTONS, barOption(n, "buttons") },
    { "slider", "Buttons per row", BAR_BUTTONS, barOption(n, "perRow") },
    { "slider", "Button size", BAR_SIZES, barSizeOption(n) },
  }
end

-- The action bar page: the shared card, then one card per bar.
local function actionBarPageRows()
  local rows = actionBarRows()
  for n = 1, 8 do append(rows, oneBarRows(n)) end
  return rows
end

-- get/set for the chat text size, which chat windows take at once.
local function chatSizeSetting()
  return liveSetting("Chat", "textSize", function() local CH = ns.GetModule("Chat") if CH.settings then CH.Refresh() end end)
end

-- The game's own windows in the ForeverUI look (after a reload).
local function windowRows()
  return {
    { "header", "Game windows" },
    check("Character, merchant, quest, loot and other windows (reload)", setting("Windows", "windows", true)),
    check("Popups (reload)", setting("Windows", "popups", true)),
    check("Breath and fatigue bars (reload)", setting("Windows", "timers", true)),
    check("Durability on the character pane's gear (reload)", setting("Windows", "durability", true)),
  }
end

-- The game's own tools: the Cooldown Manager and the damage meter (after a reload).
local function gameToolRows()
  return {
    { "header", "The game's tools" },
    check("Cooldown Manager in the ForeverUI look (reload)", setting("GameTools", "cooldowns", true)),
    check("Damage meter in the ForeverUI look (reload)", setting("GameTools", "meter", true)),
    check("Place them to fit the layout; off leaves them to Edit Mode (reload)", setting("GameTools", "place", true)),
    check("Loss of control in the ForeverUI look, above your character (reload)", setting("GameAlerts", "lossOfControl", true)),
    { "cycle", "Talking head (reload)", { { "move", "ForeverUI look, top center" }, { "hide", "Hidden" }, { "game", "The game's" } }, setting("GameAlerts", "talkingHead", true) },
  }
end

-- The game's extras: minimap buttons, the menu strip and the quest tracker (after a reload).
local function gamePartRows()
  return {
    { "header", "The game's extras" },
    check("Tracking, mail and difficulty on the minimap's corners (reload)", setting("Minimap", "icons", true)),
    { "cycle", "Game menu buttons (reload)", { { "mouseover", "On mouseover" }, { "always", "Always" } }, setting("MenuStrip", "menu", true) },
    check("ForeverUI icons on the menu buttons (reload)", setting("MenuStrip", "glyphs", true)),
    check("Quest tracker under the info strip (reload)", setting("MenuStrip", "tracker", true)),
    check("Quest tracker in the ForeverUI look (reload)", setting("MenuStrip", "trackerLook", true)),
  }
end

-- XP and reputation bars, minimap, chat and bags.
local function moreRows()
  return {
    { "header", "XP and reputation" },
    check("Experience bar", setting("DataBars", "xp", true)), check("Reputation bar", setting("DataBars", "reputation", true)),
    { "cycle", "Numbers", { { "hover", "on hover" }, { "always", "always" } }, setting("DataBars", "text", true) },
    { "header", "Minimap, chat, bags" },
    check("Coordinates under the minimap", setting("Minimap", "coords", true)),
    check("Chat background", setting("Chat", "background", true)), check("Keep chat in its bottom-left spot (reload)", setting("Chat", "place", true)),
    { "cycle", "Chat text size (follows Text size)", ns.GetModule("Chat").SIZES, chatSizeSetting() },
    check("Combined bag", setting("Bags", "combined", true)), check("Bank in the ForeverUI look (reload)", setting("Bags", "bank", true)),
  }
end

-- get/set for the weapon enchant cells, which show or hide at once.
local function enchantSetting()
  return liveSetting("PlayerAuras", "enchants", function() ns.GetModule("PlayerAuras").UpdateEnchants() end)
end

-- Your own buffs and debuffs (by the minimap).
local function playerAuraRows()
  return {
    { "header", "Your buffs and debuffs" },
    check("Timer numbers on your buffs (reload)", setting("PlayerAuras", "timers", true)),
    check("Weapon enchants in front of your buffs", enchantSetting()),
    { "cycle", "Icon size (reload)", { { 26, "Small" }, { 30, "Medium" }, { 36, "Large" } }, setting("PlayerAuras", "size", true) },
  }
end

-- get/set for one info strip block, which shows or hides at once.
local function stripSetting(key)
  return liveSetting("InfoStrip", key, function() ns.GetModule("InfoStrip").UpdateAll() end)
end

-- The info strip under the minimap: one switch per block.
local function stripRows()
  return {
    { "header", "Strip under the minimap" },
    check("Durability", stripSetting("durability")), check("Free bag slots", stripSetting("bags")),
    check("Frame rate and latency", stripSetting("system")), check("Gold", stripSetting("gold")),
    check("Ammo (hunters, warriors, rogues)", stripSetting("ammo")), check("Clock", stripSetting("clock")),
    check("XP per hour this session", stripSetting("xprate")), check("Time to the next level", stripSetting("leveltime")),
    check("Gold per hour this session", stripSetting("goldrate")),
    check("Your DPS in the last fight (from the game's damage meter)", stripSetting("dps")),
  }
end

-- At a merchant, and the error line.
local function merchantRows()
  return {
    { "header", "Merchants and errors" },
    check("Repair with your own gold at a merchant", setting("Merchant", "repair")),
    check("Sell gray items at a merchant", setting("Merchant", "junk")),
    check("Hide errors the action bar already shows (reload)", setting("Merchant", "errors", true)),
  }
end

-- Chat extras, the minimap drawer and the auto-accept switches.
local function comfortRows()
  return {
    { "header", "Chat, minimap and prompts" },
    check("Clickable web links in chat (reload)", setting("ChatExtras", "links", true)),
    check("Copy button over the chat (reload)", setting("ChatExtras", "copy", true)),
    check("Gather addon minimap buttons into a drawer (reload)", setting("MinimapButtons", "drawer", true)),
    check("Accept summons (out of combat)", setting("AutoAccept", "summons")),
    check("Accept resurrections", setting("AutoAccept", "resurrect")), check("Decline duels", setting("AutoAccept", "duels")),
  }
end

-- Errands: training, stocking up and flight times.
local function errandRows()
  return {
    { "header", "Errands" },
    check("Train all button at trainers", setting("Errands", "trainAll")),
    check("Keep items stocked from merchants (/fui stock)", setting("Errands", "stock")),
    check("Flight timer (reload)", setting("Errands", "flightTimer", true)),
  }
end

-- Tooltips: where they sit and what they add.
local function tooltipRows()
  return {
    { "header", "Tooltips" },
    { "cycle", "Tooltip position", { { "corner", "corner (movable)" }, { "cursor", "at the cursor" }, { "default", "client default" } }, setting("Tooltips", "anchor") },
    check("Border in the unit's class color", setting("Tooltips", "classBorder")),
    check("Show who the unit is targeting", setting("Tooltips", "targetLine")),
    check("What an item sells for (when the game doesn't say)", setting("Tooltips", "sellPrice")),
    check("How many of an item you have", setting("Tooltips", "itemCount")), check("Item IDs", setting("Tooltips", "itemID")),
    check("Hide unit tooltips in combat", setting("Tooltips", "hideInCombat")),
  }
end

-- The Bars, map, chat page: your buffs, bars and map, the strip, merchants, tooltips.
local function morePageRows()
  local rows = append(playerAuraRows(), moreRows())
  append(rows, stripRows())
  append(rows, gamePartRows())
  append(rows, windowRows())
  append(rows, gameToolRows())
  append(rows, merchantRows())
  append(rows, errandRows())
  append(rows, comfortRows())
  return append(rows, tooltipRows())
end

-- "Spec 2 uses Healer." or why there's no spec profile.
local function specText()
  local spec = ns.SpecIndex()
  if not spec then return "No specialization yet." end
  return string.format("Spec %d uses %s.", spec, ns.SpecProfile(spec) or "the character's profile")
end

-- Every profile, with its buttons, then the box for a new one (Core/OptionsProfiles.lua).
local function profileListRows()
  local rows = { { "header", "Your profiles" } }
  for _, name in ipairs(ns.ProfileNames()) do rows[#rows + 1] = { "profile", name } end
  rows[#rows + 1] = { "newprofile" }
  return rows
end

-- Profiles, part one: which profile, export/import, reset.
local function currentProfileRows()
  return {
    { "header", "Profile" },
    { "text", function() return "This character uses " .. ns.ProfileName() .. "." end },
    { "button", "Export profile", function() ns.ShowText("ForeverUI export  Ctrl+C to copy", ns.ExportProfile()) end },
    { "button", "Import", function() ns.ImportDialog() end },
    { "button", "Reset profile", function() ns.ResetProfile(); O.NeedReload() end },
  }
end

-- Profiles, part two: the spec profile (nothing on a client with no specializations).
local function specRows()
  if not ns.HasSpecs() then return {} end
  return {
    { "header", "Specialization" },
    { "text", specText },
    { "button", "Use this profile for this spec", function() ns.SetSpecProfile(ns.ProfileName()); O.Refresh() end },
    { "button", "Stop spec switching", function() ns.SetSpecProfile(nil); O.Refresh() end },
  }
end

-- Profiles: export/import, reset, spec profiles, and every profile.
local function profileRows()
  return append(append(currentProfileRows(), specRows()), profileListRows())
end

-- Raid frames: party coverage, sorting, size.
local function raidRows()
  return {
    { "header", "Raid frames" },
    check("Use them for your party too", setting("RaidFrames", "showInParty", true)), check("Include yourself", setting("RaidFrames", "showPlayer", true)),
    check("Sort by role (tanks, healers, damage)", setting("RaidFrames", "sortByRole", true)),
    { "cycle", "Groups as (reload)", { { "columns", "Columns" }, { "rows", "Rows (wide, for big raids)" } }, setting("RaidFrames", "layout", true) },
    check("Hide the default raid frames", setting("RaidFrames", "hideBlizzard", true)),
    { "cycle", "Style", { { "soft", "Class colors, softened" }, { "dark", "Dark, class-colored names" }, { "class", "Class colors, bright" } }, raidSetting("look") },
    { "cycle", "Width", { { 72, "72" }, { 90, "90" }, { 100, "100" }, { 120, "120" } }, setting("RaidFrames", "width", true) },
    { "cycle", "Height", { { 36, "36" }, { 40, "40" }, { 48, "48" }, { 56, "56" } }, setting("RaidFrames", "height", true) },
  }
end

-- The raid frames' auras: debuffs, the dispel highlight and your HoTs (after a reload).
local function raidAuraRows()
  return {
    check("Highlight debuffs you can dispel (reload)", setting("RaidAuras", "dispel", true)),
    { "cycle", "Debuff icons (reload)", { { 0, "none" }, { 2, "2" }, { 3, "3" } }, setting("RaidAuras", "debuffs", true) },
    check("Show your HoTs (reload)", setting("RaidAuras", "hots", true)),
  }
end

-- Raid frames plus their indicators.
local function raidPageRows()
  return append(append(raidRows(), raidAuraRows()), {
    check("Power bar", raidSetting("showPower")),
    check("Fade players out of range", setting("RaidStatus", "rangeFade")),
    check("Raid target icons", setting("RaidStatus", "raidIcons")),
    check("Ready check answers", setting("RaidStatus", "readyCheck")),
    check("Mark players being resurrected", setting("RaidStatus", "resurrect")),
    check("Leader and assistant marks", setting("RaidStatus", "leader")),
  })
end

-- Pages: key, title, nav icon (Media/Icons) and order in the nav (groups: under 30, under 90, the rest).
-- Quests: the dialog, and the automation (each off until switched on).
local function questRows()
  return {
    { "header", "Quest windows" },
    check("ForeverUI's quest dialog at the bottom center (reload)", setting("QuestDialog", "dialog", true)),
    check("ForeverUI's quest log on the quest log key (reload)", setting("QuestLog", "own", true)),
    { "header", "Quest tracker" },
    check("ForeverUI's quest tracker under the info strip (reload)", setting("QuestTracker", "own", true)),
    { "cycle", "Order", { { "game", "As the game orders them" }, { "nearest", "Nearest first" } }, setting("QuestTracker", "order") },
  }
end

-- Quest automation (each off until switched on).
local function questAutoRows()
  return {
    { "header", "Automation (hold Shift while talking to skip it)" },
    check("Accept quests", setting("QuestAuto", "accept")), check("Turn in finished quests", setting("QuestAuto", "turnIn")),
    check("With a choice of rewards, take the one that sells for most", setting("QuestAuto", "bestReward")), check("Skip the chatter when an NPC has just one quest for you", setting("QuestAuto", "skipGossip")),
  }
end

local PAGES = {
  { key = "general", title = "General", icon = "General", order = 10, rows = generalRows },
  { key = "modules", title = "Modules", icon = "Modules", order = 20, rows = moduleRows },
  { key = "unitframes", title = "Unit frames", icon = "UnitFrames", order = 30, rows = function() return append(append(append(unitFrameRows(), readoutRows()), castRows()), timerRows()) end },
  { key = "raid", title = "Raid frames", icon = "RaidFrames", order = 40, rows = raidPageRows },
  { key = "actionbars", title = "Action bars", icon = "ActionBars", order = 60, rows = actionBarPageRows },
  { key = "quests", title = "Quests", icon = "Quests", order = 70, rows = function() return append(questRows(), questAutoRows()) end },
  { key = "more", title = "Bars, map, chat", icon = "Map", order = 80, rows = function() return morePageRows() end },
  { key = "profiles", title = "Profiles", icon = "Profiles", order = 90, rows = profileRows },
}
O.PAGES = PAGES

-- Adds a page from another file (e.g. a module's own options): key, title, icon, order, rows.
function O.AddPage(page)
  PAGES[#PAGES + 1] = page
end

-- The addons button by the minimap: left-click options, right-click move frames.
function ForeverUI_OnAddonCompartmentClick(_, button)
  if button == "RightButton" then
    if ns.Unlocked() then ns.Lock() else ns.Unlock() end
  else
    O.Toggle()
  end
end
