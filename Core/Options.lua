-- The options pages (/vg, or the addons button by the minimap): a page
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

-- The frame whose scale and opacity the Layout card's sliders set (the first mover until one is picked).
local function sizedMover()
  local list = ns.MoverList()
  return O.sizedMover or (list[1] and list[1].key)
end

-- Every movable frame as a { key, label } choice.
local function moverChoices()
  local out = {}
  for i, m in ipairs(ns.MoverList()) do out[i] = { m.key, m.label } end
  return out
end

-- get/set for which frame the sliders size; picking one re-reads the sliders.
local function pickMover()
  return sizedMover, function(key) O.sizedMover = key; O.Refresh() end
end

-- get/set for the picked frame's scale (look = 1) or opacity (look = 2), applied at once; the default is 1.
local function moverLook(look, setter)
  return function() return (select(look, ns.MoverLook(sizedMover()))) end,
    function(v) local key = sizedMover() if key then setter(key, v) end end, 1
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

-- get/set for a theme setting that applies on reload, shown at once in the General page's sample.
local function previewedSetting(key)
  local get, set = themeSetting(key)
  return get, function(v) set(v); T.Refresh() end
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

-- The built-in fonts and bar textures; the pickers add what LibSharedMedia shares.
local FONT_CHOICES = { { "", "Fira Sans Condensed" }, { "client", "the game's font" } }
-- The faction look: by your character's faction, or off.
local FACTION_LOOK = { { "auto", "By your faction" }, { "off", "Off" } }
local BAR_TEXTURES = { { "vanguard", "Vanguard" }, { "soft", "Soft" }, { "flat", "Flat" } }
-- A share as a percent.
local function percent(v)
  return string.format("%d%%", math.floor(v * 100 + 0.5))
end

-- A frame's scale (50% to 200%) and opacity (10% to 100%), in steps of 5.
local MOVER_SCALES = { min = ns.MOVER_SCALE.min, max = ns.MOVER_SCALE.max, step = 0.05, format = percent }
local MOVER_ALPHAS = { min = ns.MOVER_ALPHA.min, max = ns.MOVER_ALPHA.max, step = 0.05, format = percent }
-- Text size: 70% to 130% in steps of 5.
local TEXT_SIZES = { min = 0.7, max = 1.3, step = 0.05, format = function(v) return string.format("%d%%", math.floor(v * 100 + 0.5)) end }

-- General, part one: accent, font, text size, scale and theme reset.
local function lookRows()
  return {
    { "header", "Look" },
    { "preview" },
    { "swatches" },
    { "cycle", "Font", T.SharedChoices("font", FONT_CHOICES), liveThemeSetting("font") },
    { "slider", "Text size", TEXT_SIZES, liveThemeSetting("textScale") }, { "cycle", "Faction look: crest and heading font", FACTION_LOOK, liveThemeSetting("faction") },
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
    { "text", "While moving frames, right-click one for its exact anchor, offsets, scale and opacity." },
  }
end

-- General, part three: one frame's scale and opacity, and resetting every frame.
local function sizeRows()
  return {
    { "cycle", "Frame to size", moverChoices(), pickMover() },
    { "slider", "Its scale", MOVER_SCALES, moverLook(1, ns.SetMoverScale) },
    { "slider", "Its opacity", MOVER_ALPHAS, moverLook(2, ns.SetMoverAlpha) },
    { "button", "Reset all positions", function() ns.ResetMovers("all"); O.Refresh() end },
  }
end

-- General, bars: texture, smoothing and shadows under the HUD.
local function barRows()
  return {
    { "header", "Bars" },
    { "cycle", "Bar texture", T.SharedChoices("statusbar", BAR_TEXTURES), previewedSetting("barTexture") },
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

-- General: look, bars, motion, layout and frame sizes.
local function generalRows()
  return append(append(append(append(lookRows(), barRows()), motionRows()), layoutRows()), sizeRows())
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
  SpecialBars = { "Pet, stance and extra buttons", "Restyles the game's special buttons, places the pet and stance bars, and adds the vehicle exit." },
  Minimap = { "Minimap", "A square minimap with the zone and coordinates." },
  Waypoints = { "Waypoints", "/way puts a waypoint on the map for the game's arrow; your and the cursor's coordinates on the world map." },
  InfoStrip = { "Info strip", "Durability, bag slots, fps, gold, ammo or soul shards and the time, under the minimap, your XP and gold per hour while you level, and your DPS and its place if you like." },
  AfkScreen = { "AFK screen", "While you're away, the screen dims to a card with your character, zone, time away and XP." },
  MenuStrip = { "Menu and quest tracker", "The game's bag and menu buttons on framed slots in one corner bar, and the quest tracker under the info strip." },
  Chat = { "Chat", "Themed chat windows and tabs." },
  Bags = { "Bags", "One combined bag, in sections by kind of item, with a Sort button." },
  Merchant = { "Merchant helpers", "Repair, sell gray items, and a quieter error line." },
  ChatExtras = { "Chat extras", "Clickable web links in chat, and a Copy button for the recent chat." },
  ChatWatch = { "Chat watch", "A sound and a toast when a phrase you watch for is said in chat; click to whisper." },
  MinimapButtons = { "Minimap drawer", "Other addons' minimap buttons gathered into a drawer beside the map." },
  AutoAccept = { "Auto-accept", "Accept summons and resurrections, decline duels, loot faster (each off until you switch it on)." },
  QuestDialog = { "Quest dialog", "Talking to quest givers in Vanguard's own dialog: numbered lines, reward cards, keys 1-9 and Space." },
  QuestTracker = { "Quest tracker", "Your watched quests under the info strip: levels in difficulty colors, objectives, quest items, nearest first if you like." },
  QuestLog = { "Quest log", "Your quests by zone, each quest's text, objectives and rewards, with Track, Share, Abandon and Map." },
  QuestAuto = { "Quest automation", "Accept, turn in, pick the best-selling reward, skip chatter; each off until switched on." },
  GameAlerts = { "Game alerts", "Loss of control and the talking head in the Vanguard look, each in a spot you can move; Hardcore death notices restyled; a rare nearby announced if you like." },
  Errands = { "Errands", "Train all at a trainer, keep items stocked from merchants, and time your flights." },
  InstancePrep = { "Instance prep", "A checklist of what's low (ammo, reagents, food, bandages, potions, your stock list) when you enter an instance or a ready check starts." },
  GameTools = { "The game's tools", "The game's Cooldown Manager and damage meter, restyled and placed to fit the layout." },
  FightHistory = { "Fight history", "Your DPS and place in each fight this session, as a strip of bars under the damage meter (off until switched on)." },
  Windows = { "Game windows", "Character, merchant, quest, loot and other game windows, popups and the breath bar in the Vanguard look." },
  DataBars = { "XP and reputation", "Thin experience and reputation bars." },
  Tooltips = { "Tooltips", "Themed tooltips in a movable corner." },
  Inventory = { "Inventory", "Remembers your characters' bags and bank; item tooltips say who else has the item." },
  VendorMemory = { "Vendor memory", "Remembers what each merchant sells; tooltips and the stock list say where to buy." },
  AuctionHelper = { "Auction helper", "Shopping lists, a sell card that suggests an undercut and posts, prices in tooltips from your scans, and an undercut check on your auctions." },
  Nameplates = { "Nameplates", "Flat plates with levels, your debuffs, casts and threat." },
  Situations = { "Situations", "Different frame spots and settings for solo, party, raid, PvP, instance and resting, applied out of combat." },
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

-- Keybind mode (Modules/ActionBarKeybinds.lua): the options window steps aside for it.
local function keybindMode()
  O.Hide()
  ns.GetModule("ActionBars").KeybindMode(true)
end

-- Action bars, shared: locking, range tint, the default bars, the client's special buttons, keybind mode.
local function actionBarRows()
  return {
    { "header", "Action bars" },
    check("Lock buttons (Shift-drag to move actions)", setting("ActionBars", "lockButtons")),
    check("Red when out of range", setting("ActionBars", "rangeTint")),
    check("Hide the default bars", setting("ActionBars", "hideBlizzard", true)),
    check("Restyle the pet, stance and extra action buttons (reload)", skinSpecial()),
    check("Pet and stance bars in their own movable spots (reload)", setting("SpecialBars", "place", true)),
    check("Vehicle exit button (reload)", setting("SpecialBars", "vehicleExit", true)),
    { "text", "Empty slots stay hidden until you drag a spell or item onto the bars." }, { "button", "Keybind mode", keybindMode },
  }
end

-- Buttons on a bar, and per row: 1 to 12.
local BAR_BUTTONS = { min = 1, max = 12, step = 1 }
-- Button size: 24 to 48 px in steps of 2.
local BAR_SIZES = { min = 24, max = 48, step = 2, format = function(v) return string.format("%d px", v) end }

-- Bar n's card title ("Bar 4, right edge" for the bars on the right edge).
local function barTitle(n)
  local AB = ns.GetModule("ActionBars")
  return (AB and AB.RightEdge(n)) and ("Bar " .. n .. ", right edge") or ("Bar " .. n)
end

-- When bar n is seen (Core/Visibility.lua): Always, On mouseover (only while the
-- mouse is over it), In combat, Hidden, or while a condition checked below holds.
-- Bars shown on mouseover or on conditions also show while you drag a spell or
-- item. "Hidden" doesn't draw the bar, but its keys still cast (a keybind-only bar).
local function barVisibilityRows(n)
  return ns.Visibility.Rows("Visibility", function() return moduleSettings("ActionBars").bars[n] end,
    "visibility", "showWhen", function() barChanged(n, "visibility") end)
end

-- One action bar's card: on/off, visibility, button count, per row and size.
local function oneBarRows(n)
  local visibility, showWhen = barVisibilityRows(n)
  return {
    { "header", barTitle(n) }, check("Show bar " .. n, barSetting(n)),
    visibility,
    { "text", "Hidden bars keep their keys: a bound key still casts." },
    showWhen,
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

-- The game's own windows in the Vanguard look (after a reload).
local function windowRows()
  return {
    { "header", "Game windows" },
    check("Character, merchant, quest, loot and other windows (reload)", setting("Windows", "windows", true)),
    check("Popups (reload)", setting("Windows", "popups", true)),
    check("Breath and fatigue bars (reload)", setting("Windows", "timers", true)),
    check("Durability on the character pane's gear (reload)", setting("Windows", "durability", true)),
  }
end

-- The auction helper's scan, auction check, disenchant, crafting and deals rows.
local function auctionScanRows()
  return {
    check("Scan button (one scan every 15 minutes)", setting("AuctionHelper", "scanButton")),
    check("Check your auctions for undercuts again after each post and cancel", setting("AuctionHelper", "recheck")),
    check("Disenchant values in tooltips (on for enchanters until you choose)", ns.AuctionPrices.DisenchantSetting()),
    check("Crafting costs and profit beside the profession window", setting("AuctionHelper", "crafting")),
    check("Deals card: listings under the 7-day market or vendor price", liveSetting("AuctionHelper", "deals", function() ns.GetModule("AuctionHelper").PaintDeals() end)),
  }
end

-- The auction helper: its panel, tooltip prices, the sell card's undercut, length and vendor floor, then the scan rows.
local function auctionRows()
  return append({
    { "header", "Auction house" },
    check("Vanguard panel beside the auction house (lists, sell helper, scan)", setting("AuctionHelper", "panel")),
    check("Auction prices in tooltips (from your scans)", setting("AuctionHelper", "tooltip")),
    { "cycle", "Undercut by", { { "copper", "1 copper" }, { "silver", "1 silver" }, { "percent", "1 %" }, { "match", "Match" } }, setting("AuctionHelper", "undercut") },
    { "cycle", "Auction length", ns.GetModule("AuctionHelper").DurationChoices(true), setting("AuctionHelper", "duration") },
    check("Never post under vendor price", setting("AuctionHelper", "vendorFloor")),
  }, auctionScanRows())
end

-- get/set for showing the game's Cooldown Manager, which turns it on or off at once.
local function cooldownManagerSetting()
  return liveSetting("GameTools", "essential", function() ns.GetModule("GameTools").SetCooldownManager(moduleSettings("GameTools").essential) end)
end

-- The game's own tools: the Cooldown Manager and the damage meter (after a reload).
local function gameToolRows()
  return {
    { "header", "The game's tools" },
    check("Show the game's Cooldown Manager: its essential row between your frames", cooldownManagerSetting()), check("Cooldown Manager in the Vanguard look (reload)", setting("GameTools", "cooldowns", true)),
    check("Damage meter in the Vanguard look (reload)", setting("GameTools", "meter", true)),
    check("Place them to fit the layout; off leaves them to Edit Mode (reload)", setting("GameTools", "place", true)),
    check("Loss of control in the Vanguard look, above your character (reload)", setting("GameAlerts", "lossOfControl", true)),
    { "cycle", "Talking head (reload)", { { "move", "Vanguard look, top center" }, { "hide", "Hidden" }, { "game", "The game's" } }, setting("GameAlerts", "talkingHead", true) },
    check("Hardcore death notices in the Vanguard look (reload)", setting("GameAlerts", "hardcore", true)),
    check("A rare nearby: a sound and a chat line, out of combat", setting("GameAlerts", "rares")),
  }
end

-- The visibility rows (Core/Visibility.lua) of a module's frame, applied at once
-- (when the module runs); unset, the setting is Always. modes: its choices (V.MODES unless given).
local function visibilityRows(caption, module, modeKey, whenKey, modes)
  return ns.Visibility.Rows(caption, function() return moduleSettings(module) end, modeKey, whenKey, function()
    local m = ns.GetModule(module)
    if m.enabled then m.ApplyVisibility() end
  end, "always", modes)
end

-- The game's extras: minimap buttons, the menu strip and the quest tracker (after a reload).
local function gamePartRows()
  local menuVisibility, menuWhen = visibilityRows("Bags and game menu", "MenuStrip", "menu", "menuWhen", ns.Visibility.MENU_MODES)
  return {
    { "header", "The game's extras" },
    check("Tracking, mail and difficulty on the minimap's corners (reload)", setting("Minimap", "icons", true)),
    menuVisibility, menuWhen,
    check("Vanguard icons on the menu buttons (reload)", setting("MenuStrip", "glyphs", true)),
    check("Quest tracker under the info strip (reload)", setting("MenuStrip", "tracker", true)),
    check("Quest tracker in the Vanguard look (reload)", setting("MenuStrip", "trackerLook", true)),
  }
end

-- XP and reputation bars: which, their numbers, and when they're seen.
local function dataBarRows()
  local barsVisibility, barsWhen = visibilityRows("XP and reputation bars", "DataBars", "visibility", "showWhen")
  return {
    { "header", "XP and reputation" },
    check("Experience bar", setting("DataBars", "xp", true)), check("Reputation bar", setting("DataBars", "reputation", true)),
    { "cycle", "Numbers", { { "hover", "on hover" }, { "always", "always" } }, setting("DataBars", "text", true) },
    barsVisibility, barsWhen,
  }
end

-- Minimap, chat and bags.
local function moreRows()
  return {
    { "header", "Minimap, chat, bags" },
    check("Coordinates under the minimap", setting("Minimap", "coords", true)), check("Coordinates on the world map (reload)", setting("Waypoints", "mapCoords", true)),
    check("/way sets map waypoints, unless another addon has it (reload)", setting("Waypoints", "slash", true)),
    check("Chat background", setting("Chat", "background", true)), check("Keep chat in its bottom-left spot (reload)", setting("Chat", "place", true)),
    { "cycle", "Chat text size (follows Text size)", ns.GetModule("Chat").SIZES, chatSizeSetting() },
    check("Combined bag (reload)", setting("Bags", "combined", true)), check("Bank in the Vanguard look (reload)", setting("Bags", "bank", true)),
  }
end

-- The combined bag's sections, laid out (or back to the plain grid) at once.
local function bagRows()
  return { check("Combined bag in sections: equipment, consumables, quest items, junk",
    liveSetting("Bags", "sections", function() ns.GetModule("Bags").SectionsChanged() end)) }
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

-- Fight history under the damage meter: its switch (applied at once) and its visibility.
local function fightRows()
  local FH = ns.GetModule("FightHistory")
  local fightVisibility, fightWhen = visibilityRows("Fight history visibility", "FightHistory", "visibility", "showWhen")
  return {
    { "header", "Fight history" },
    check("Sparkline of your DPS in the last 20 fights, under the damage meter", liveSetting("FightHistory", "strip", function() if FH.enabled then FH.Paint() end end)),
    fightVisibility, fightWhen,
  }
end

-- The info strip's auction sales (the sales ledger, Modules/AuctionLedger.lua): off until switched on.
local function ledgerRows()
  return { check("Your auction sales this session", stripSetting("ahgold")) }
end

-- The info strip under the minimap: one switch per block, then Fight history.
local function stripRows()
  local stripVisibility, stripWhen = visibilityRows("Strip visibility", "InfoStrip", "visibility", "showWhen")
  return append({
    { "header", "Strip under the minimap" }, stripVisibility, stripWhen,
    check("Durability", stripSetting("durability")), check("Free bag slots", stripSetting("bags")),
    check("Frame rate and latency", stripSetting("system")), check("Gold", stripSetting("gold")),
    check("Ammo (hunters, warriors, rogues)", stripSetting("ammo")), check("Clock", stripSetting("clock")),
    check("Soul shards (warlocks)", stripSetting("shards")), check("XP per hour this session", stripSetting("xprate")),
    check("Time to the next level", stripSetting("leveltime")), check("Gold per hour this session", stripSetting("goldrate")),
    check("Your DPS in the last fight (from the game's damage meter)", stripSetting("dps")), check("Your place in the last fight's DPS, in a group", stripSetting("rank")),
  }, append(ledgerRows(), fightRows()))
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

-- The game's class-colored names in chat: always, never, or as each chat type is set.
local CLASS_NAMES = { { "0", "Always" }, { "1", "Never" }, { "2", "As each chat type is set" } }
-- chatClassColorOverride: "0" and "1" force class colors on or off; anything else leaves them to each chat type.
local function classNameChoice(v) return (v == "0" or v == "1") and v or "2" end
-- showTimestamps: "none" (or unset) is off, anything else a time format.
local function timestampChoice(v) return v or "none" end

-- Chat: the extras, and the game's own timestamp and class-color settings.
local function chatRows()
  local CX = ns.GetModule("ChatExtras")
  return {
    { "header", "Chat" },
    check("Clickable web links in chat (reload)", setting("ChatExtras", "links", true)),
    check("Copy button over the chat (reload)", setting("ChatExtras", "copy", true)),
    check("Short channel names: [2. Trade] shows as [T]", setting("ChatExtras", "shortChannels")),
    check("Ctrl + mouse wheel jumps to the top or bottom of chat", setting("ChatExtras", "ctrlScroll")),
    { "cycle", "Chat timestamps (the game's setting)", CX.TimestampChoices(), CX.CVarSetting("showTimestamps", timestampChoice) },
    { "cycle", "Class-colored names in chat (the game's setting)", CLASS_NAMES, CX.CVarSetting("chatClassColorOverride", classNameChoice) },
  }
end

-- Chat watch's switches: the channels it reads, its sound, its toast and the toast's auction price.
local function chatWatchSwitches(CW)
  return {
    check("Numbered channels (General, Trade, LFG)", CW.ChannelSetting("channel")),
    check("Say", CW.ChannelSetting("say")), check("Yell", CW.ChannelSetting("yell")), check("Guild", CW.ChannelSetting("guild")),
    check("Party and raid", CW.ChannelSetting("party", "raid")), check("Whispers", CW.ChannelSetting("whisper")),
    check("Sound", setting("ChatWatch", "sound")), check("Toast", setting("ChatWatch", "toast")),
    check("Auction price of a linked item on the toast", setting("ChatWatch", "prices")),
  }
end

-- Chat watch: add a phrase, a Remove button per phrase, then the switches.
local function chatWatchRows()
  local CW = ns.GetModule("ChatWatch")
  local rows = { { "header", "Chat watch" }, { "text", "Phrases to watch for: a sound and a toast when one is said; click the toast to whisper." },
    { "button", "Add a phrase", function() ns.AskText("Watch for", CW.AddFromDialog, "Add") end } }
  for _, p in ipairs(moduleSettings("ChatWatch").phrases) do rows[#rows + 1] = { "button", "Remove: " .. p, function() CW.Remove(p) end } end
  return append(rows, chatWatchSwitches(CW))
end

-- The minimap drawer and the auto-accept switches.
local function comfortRows()
  return {
    { "header", "Minimap and prompts" },
    check("Gather addon minimap buttons into a drawer (reload)", setting("MinimapButtons", "drawer", true)),
    check("Accept summons (out of combat)", setting("AutoAccept", "summons")),
    check("Accept resurrections", setting("AutoAccept", "resurrect")), check("Decline duels", setting("AutoAccept", "duels")),
    check("Faster auto-loot (when the game's auto-loot is on)", setting("AutoAccept", "loot")),
  }
end

-- Errands: training, stocking up and flight times.
local function errandRows()
  return {
    { "header", "Errands" },
    check("Train all button at trainers", setting("Errands", "trainAll")),
    check("Keep items stocked from merchants (/vg stock)", setting("Errands", "stock")),
    check("Flight timer (reload)", setting("Errands", "flightTimer", true)),
  }
end

-- Vendor memory: where items are sold, in their tooltips.
local function vendorRows()
  return {
    check("Where an item is sold (merchants you've visited)", setting("VendorMemory", "tooltip")),
    check("Remember what merchants sell", setting("VendorMemory", "remember")),
  }
end

-- Instance prep's sliders: how long the card stays (seconds), and the durability warning (percent).
local PREP_SECONDS = { min = 5, max = 60, step = 5, format = function(v) return string.format("%d s", v) end }
local PREP_PERCENT = { min = 10, max = 90, step = 5, format = function(v) return string.format("%d%%", v) end }

-- Instance prep: when the checklist card shows, how long it stays, and the durability warning.
local function prepRows()
  return {
    { "header", "Instance prep" },
    check("Checklist when you enter a dungeon or raid (only when something is low)", setting("InstancePrep", "onEnter")),
    check("Checklist on a ready check", setting("InstancePrep", "onReadyCheck")),
    { "slider", "Hide after", PREP_SECONDS, setting("InstancePrep", "hideAfter") },
    { "slider", "Durability warning under", PREP_PERCENT, setting("InstancePrep", "durability") },
    { "text", "Wanted amounts: /vg prep want <food|bandages|potions|ammo|shards> <n>; items from /vg stock are checked too." },
  }
end

-- Tooltips: where they sit and what they add.
local function tooltipRows()
  return append({
    { "header", "Tooltips" },
    { "cycle", "Tooltip position", { { "corner", "corner (movable)" }, { "cursor", "at the cursor" }, { "default", "client default" } }, setting("Tooltips", "anchor") },
    check("Border in the unit's class color", setting("Tooltips", "classBorder")),
    check("Show who the unit is targeting", setting("Tooltips", "targetLine")),
    check("What an item sells for (when the game doesn't say)", setting("Tooltips", "sellPrice")),
    check("How many of an item you have", setting("Tooltips", "itemCount")), check("Item IDs", setting("Tooltips", "itemID")),
    check("How many your other characters have (here, same side)", setting("Inventory", "alts")),
    check("Hide unit tooltips in combat", setting("Tooltips", "hideInCombat")),
  }, vendorRows())
end

-- The Bars, map, chat page: your buffs, bars and map, the strip, merchants, tooltips.
local function morePageRows()
  local rows = append(append(append(playerAuraRows(), dataBarRows()), moreRows()), bagRows())
  append(rows, stripRows())
  append(rows, gamePartRows())
  append(rows, windowRows())
  append(rows, auctionRows())
  append(rows, gameToolRows())
  append(rows, merchantRows())
  append(append(rows, errandRows()), prepRows())
  append(append(append(rows, chatRows()), chatWatchRows()), comfortRows())
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

-- "This character uses Default." or, with a switch staged, what it uses until the reload and after it.
local function currentProfileText()
  local later = ns.PendingProfileName()
  if not later then return "This character uses " .. ns.ProfileName() .. "." end
  return "This character uses " .. ns.ProfileName() .. " until you reload, then " .. later .. "."
end

-- Profiles, part one: which profile, export/import, reset.
local function currentProfileRows()
  return {
    { "header", "Profile" },
    { "text", currentProfileText },
    { "button", "Export profile", function() ns.ShowText("Vanguard export  Ctrl+C to copy", ns.ExportProfile()) end },
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
    { "button", "Use this profile for this spec", function() ns.SetSpecProfile(ns.SelectedProfileName()); O.Refresh() end },
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
    check("Vanguard's quest dialog at the bottom center (reload)", setting("QuestDialog", "dialog", true)),
    check("Vanguard's quest log on the quest log key (reload)", setting("QuestLog", "own", true)),
    { "header", "Quest tracker" },
    check("Vanguard's quest tracker under the info strip (reload)", setting("QuestTracker", "own", true)),
    { "cycle", "Order", { { "game", "As the game orders them" }, { "nearest", "Nearest first" } }, liveSetting("QuestTracker", "order", function() ns.GetModule("QuestTracker").ApplyOrder() end) },
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
function Vanguard_OnAddonCompartmentClick(_, button)
  if button == "RightButton" then
    if ns.Unlocked() then ns.Lock() else ns.Unlock() end
  else
    O.Toggle()
  end
end
