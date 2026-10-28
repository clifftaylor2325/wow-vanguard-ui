-- The options pages (/vg, or the addons button by the minimap): a page
-- per area, as tables of rows. Core/OptionsWindow.lua builds the window
-- from them. Most changes apply at once; the ones that rebuild frames
-- light up the reload notice. This file holds the shared helpers, the
-- General, Modules, Profiles and Feedback pages, and the page list; the
-- other pages' rows are in their own files (Core/OptionsFrames.lua,
-- OptionsBars.lua, OptionsQuests.lua, OptionsBags.lua, OptionsMap.lua,
-- OptionsChat.lua, OptionsGameWindows.lua, OptionsCooldowns.lua, OptionsTools.lua, OptionsTown.lua), which add them
-- with O.AddPage. A new setting goes in its area's file.

local ADDON, ns = ...

local L = ns.L

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

-- Which setting a row's getter reads: get -> { module, key }. Weak keys, so a
-- page's rows can go. The window reads it (O.SettingOf) to tell what a row sets.
local settingOf = setmetatable({}, { __mode = "k" })

-- Notes that get reads `key` of `module` (a module's or another settings table's name); returns get.
function O.Tag(get, module, key)
  settingOf[get] = { module, key }
  return get
end

-- The module and key a tagged getter reads, or nil for anything else.
function O.SettingOf(get)
  local s = settingOf[get]
  if s then return s[1], s[2] end
end

-- get/set for one module setting, and its default (the window marks a changed
-- setting and can put it back).
local function setting(module, key)
  return O.Tag(function() return moduleSettings(module)[key] end, module, key),
    function(v) moduleSettings(module)[key] = v end,
    default(module, key)
end

-- get/set for a module setting that needs a reload: a change lights the reload notice.
local function reloadSetting(module, key)
  local get, set, initial = setting(module, key)
  return get, function(v) set(v) O.NeedReload() end, initial
end

-- True when a module was built this session, so its live callbacks have its settings to read.
local function moduleRunning(module)
  local def = ns.GetModule(module)
  return def ~= nil and def.enabled == true
end

-- get/set for a module setting that applies at once (after() runs on each change), and its default.
-- A module that is off only saves the value: it applies when the module next runs.
local function liveSetting(module, key, after)
  local get, set, initial = setting(module, key)
  return get, function(v) set(v); if moduleRunning(module) then after() end end, initial
end

-- get/set for a module setting that applies at once by calling method (no arguments) on the module, when it runs.
local function liveMethod(module, key, method)
  return liveSetting(module, key, function() ns.GetModule(module)[method]() end)
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

-- get/set for the picked frame's own width or height (dim), applied at once; locked (see
-- moverSizes) while it's matched to another frame's, or for a frame that sizes itself.
local function moverSize(dim)
  return function() return ns.MoverSize(sizedMover(), dim) end, function(v) ns.SetMoverSize(sizedMover(), dim, v) end
end

-- The slider for a frame's own width (up to 1200) or height (up to 80), in whole units; each frame keeps to its own range.
-- Locked, the slider says why (matched to another frame, or a frame that sizes itself).
local function moverSizes(dim, max, step)
  return { min = 2, max = max, step = step, locked = function() return ns.MoverSizeLock(sizedMover(), dim) end }
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

-- Applies a module's visibility now, when the module runs.
local function applyModuleVisibility(module)
  local m = ns.GetModule(module)
  if m.enabled then m.ApplyVisibility() end
end

-- The visibility rows (Core/Visibility.lua) of a module's frame, applied at once
-- (when the module runs); unset, the setting is Always. modes: its choices (V.MODES unless given).
local function visibilityRows(caption, module, modeKey, whenKey, modes)
  local mode, when = ns.Visibility.Rows({
    caption = caption,
    tbl = function() return moduleSettings(module) end,
    modeKey = modeKey, whenKey = whenKey,
    after = function() applyModuleVisibility(module) end,
    initial = "always", modes = modes,
  })
  O.Tag(mode[4], module, modeKey)
  return mode, when
end

-- The helpers the area files build their rows with.
O.VisibilityRows = visibilityRows
O.ModuleSettings, O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append = moduleSettings, setting, reloadSetting, liveSetting, liveMethod, check, append

-- get/set for a theme setting; changes apply on reload.
local function themeSetting(key)
  return O.Tag(function() return T.Settings()[key] end, "theme", key), function(v) T.Settings()[key] = v; O.NeedReload() end
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
  return O.Tag(function() return T.Settings()[key] end, "theme", key), function(v)
    if T.Settings()[key] == v then return end
    T.Settings()[key] = v
    T.Refresh()
  end
end

-- get/set for the theme variant, applied at once; when it turns Safer colours on or off (High contrast does),
-- the aura icons' type colours settle only after a reload, so the options notice shows.
local function variantSetting()
  local get, set = liveThemeSetting("variant")
  return get, function(v)
    local before = T.ColorAssist()
    set(v)
    if T.ColorAssist() ~= before then O.NeedReload() end
  end
end

-- The built-in fonts and bar textures; the bar picker adds what LibSharedMedia shares (the font picker only the one in use).
local FONT_CHOICES = { { "", "Fira Sans Condensed" }, { "client", L["the game's font"] } }
-- The faction look: your faction's crest only (the default), the crest and heading font, or off.
local FACTION_LOOK = { { "crest", L["Crest only"] }, { "auto", L["Crest and heading font"] }, { "off", L["Off"] } }
-- The theme variants (#237), in display order.
local VARIANT_CHOICES = { { "default", L["Slate and brass"] }, { "contrast", L["High contrast"] }, { "vellum", L["Vellum and ink"] }, { "classic", L["Classic look"] }, { "midnight", L["Midnight"] }, { "obsidian", L["Obsidian"] }, { "moss", L["Moss"] }, { "ember", L["Ash and ember"] } }
-- Panel corners: square (the default) or rounded.
local CORNER_CHOICES = { { "square", L["Square"] }, { "rounded", L["Rounded"] } }
local BAR_TEXTURES = { { "vanguard", "Vanguard" }, { "soft", L["Soft"] }, { "flat", L["Flat"] } }
-- A share as a percent.
local function percent(v)
  return string.format("%d%%", math.floor(v * 100 + 0.5))
end

-- A frame's scale (50% to 200%) and opacity (10% to 100%), in steps of 5.
local MOVER_SCALES = { min = ns.MOVER_SCALE.min, max = ns.MOVER_SCALE.max, step = 0.05, format = percent }
local MOVER_ALPHAS = { min = ns.MOVER_ALPHA.min, max = ns.MOVER_ALPHA.max, step = 0.05, format = percent }
-- Text size: 70% to 130% in steps of 5.
local TEXT_SIZES = { min = 0.7, max = 1.3, step = 0.05, format = function(v) return string.format("%d%%", math.floor(v * 100 + 0.5)) end }

-- Look, the shape of things: variant, corners, panel texture and ornament rows.
local function lookShapeRows()
  return {
    { "cycle", L["Theme variant"], VARIANT_CHOICES, variantSetting() },
    { "cycle", L["Corners"], CORNER_CHOICES, liveThemeSetting("corners") },
    { "cycle", L["Panel texture"], T.PanelTextureChoices(), liveThemeSetting("panelTexture") },
    check(L["Shield corners on unit frames"], liveThemeSetting("shield")),
    check(L["Window ornaments"], liveThemeSetting("ornaments")),
    { "text", L["A brass rule or corners on large windows."], "note" },
  }
end

-- Look, the font, text size and faction rows, then the shape rows. A caption is a noun; what it needs
-- saying beyond that is a note row under it.
local function lookTextRows()
  local rows = {
    { "cycle", L["Font"], T.FontChoices(FONT_CHOICES), liveThemeSetting("font") },
    { "slider", L["Text size"], TEXT_SIZES, liveThemeSetting("textScale") },
    { "cycle", L["Faction look"], FACTION_LOOK, liveThemeSetting("faction") },
  }
  for _, row in ipairs(lookShapeRows()) do rows[#rows + 1] = row end
  return rows
end

-- The theme settings that show fully only after a reload (pixel-perfect's scale stays on screen until then).
O.RELOAD_THEME = { "colorAssist", "colorAssistGame", "hudShadow", "pixelScale" }

-- The reload-only theme settings' values now, in O.RELOAD_THEME's order, then whether Safer colours apply
-- (a variant can turn them on, and Reset theme puts the variant back).
local function reloadThemeValues()
  local theme, out = T.Settings(), {}
  for i, key in ipairs(O.RELOAD_THEME) do out[i] = theme[key] end
  out[#out + 1] = T.ColorAssist()
  return out
end

-- Puts every theme setting back to its default (T.Reset); when that changed a reload-only one, the options
-- window shows its reload notice. Returns true then.
function O.ResetTheme()
  local before = reloadThemeValues()
  T.Reset()
  local after = reloadThemeValues()
  for i, value in ipairs(before) do
    if value ~= after[i] then O.NeedReload() return true end
  end
  return false
end

-- General, part one: accent, safer colours, font, text size, variant, ornaments, scale and theme reset.
local function lookRows()
  local rows = { { "header", L["Look"] }, { "preview" }, { "swatches" },
    check(L["Safer colours (reload)"], themeSetting("colorAssist")),
    { "text", L["Friendly blue, neutral yellow, hostile vermilion, and colours for Magic, Curse, Disease and Poison that stay apart."], "note" },
    check(L["Follow the game's colour-blind mode (reload)"], themeSetting("colorAssistGame")),
    { "text", L["Turns Safer colours on while the game's own colour-blind mode is on."], "note" } }
  for _, row in ipairs(lookTextRows()) do rows[#rows + 1] = row end
  rows[#rows + 1] = check(L["Pixel-perfect scale"], function() return T.Settings().pixelScale end,
    function(v) T.SetPixelScale(v); if not v then O.NeedReload() end end)
  rows[#rows + 1] = { "button", L["Reset theme"], function() O.ResetTheme() end }
  return rows
end

-- General, part two: setup again, and what's new in this version.
local function setupRows()
  return {
    { "header", L["Layout"] },
    { "text", L["Setup walks through layout, screen and look again; it starts on Keep, so it changes only what you pick (/vg setup)."] },
    { "button", L["Run setup"], function() O.Hide(); ns.Setup.Open() end },
    { "button", L["What's new"], function() O.Hide(); ns.WhatsNew.Open() end },
  }
end

-- General, part three: moving frames.
local function layoutRows()
  return append(setupRows(), {
    { "button", L["Move frames"], function() ns.UnlockFromOptions(O.current) end },
    check(L["Show a grid while moving"], moverOption("grid")),
    check(L["Snap to other frames"], moverOption("snap")),
    check(L["Show these handles in the game's Edit Mode too"], moverOption("editMode")),
    { "text", L["While moving frames, right-click one to anchor it to the screen or to another frame's side, for its exact offsets, scale and opacity, or to match its width or height to another frame's."] },
  })
end

-- General, part four: one frame's scale, opacity and size, and resetting every frame.
local function sizeRows()
  return {
    { "cycle", L["Frame to size"], moverChoices(), pickMover() },
    { "slider", L["Its scale"], MOVER_SCALES, moverLook(1, ns.SetMoverScale) },
    { "slider", L["Its opacity"], MOVER_ALPHAS, moverLook(2, ns.SetMoverAlpha) },
    { "slider", L["Its width"], moverSizes("width", 1200, 2), moverSize("width") },
    { "slider", L["Its height"], moverSizes("height", 80, 1), moverSize("height") },
    { "button", L["Reset all positions"], function() ns.ResetMovers("all"); O.Refresh() end },
  }
end

-- General, bars: texture, smoothing and shadows under the HUD.
local function barRows()
  return {
    { "header", L["Bars"] },
    { "cycle", L["Bar texture"], T.SharedChoices("statusbar", BAR_TEXTURES), previewedSetting("barTexture") },
    check(L["Smooth health and power bars"], function() return T.Settings().smoothBars end, function(v) T.Settings().smoothBars = v end),
    check(L["Soft shadows under frames (reload)"], themeSetting("hudShadow")),
  }
end

-- General, motion and sound.
local function motionRows()
  return {
    { "header", L["Motion and sound"] },
    check(L["Reduce motion (no fades or flashes)"], function() return T.Settings().reduceMotion end, function(v) T.Settings().reduceMotion = v end),
    check(L["Interface sounds"], function() return T.Settings().sounds end, function(v) T.Settings().sounds = v end),
  }
end

-- General: the settings-loss notice when there is one (Core/SettingsGuard.lua), look, bars, motion, layout and frame sizes.
local function generalRows()
  local rows = append(ns.SettingsGuard.Rows(), lookRows())
  return append(append(append(append(rows, barRows()), motionRows()), layoutRows()), sizeRows())
end

-- Each module's name in the window and what it does (and what it needs, if anything).
O.MODULE_INFO = {
  UnitFrames = { L["Unit frames"], L["Player, target, target of target, focus, pet and party frames."] },
  CastBars = { L["Cast bars"], L["Your cast bar, and your target's and focus's."] },
  FrameAuras = { L["Target and focus auras"], L["Buffs and debuffs under the target and focus frames. Needs Unit frames."] },
  PlayerAuras = { L["Your buffs and debuffs"], L["Your own auras and weapon enchants, left of the minimap."] },
  ComboPoints = { L["Combo points"], L["Rogue and druid combo points above the player frame. Needs Unit frames."] },
  ClassBars = { L["Class bars"], L["Shaman totems, and druid mana in forms, under the player frame. Needs Unit frames."] },
  PowerTicks = { L["Power bar sparks"], L["The five-second rule and energy ticks on your power bar. Needs Unit frames."] },
  SwingTimer = { L["Swing timer"], L["A row per hand that swings, from WoW Forever's own swing events."] },
  UnitExtras = { L["Readouts"], L["Threat on your target, your pet's happiness, and a status chip for eating, drinking and missing buffs. Needs Unit frames."] },
  RaidFrames = { L["Raid frames"], L["Raid (and party) tiles sorted by group or role."] },
  RaidAuras = { L["Raid debuffs and HoTs"], L["Debuffs you can dispel, your heals over time and three indicator icons on the tiles. Needs Raid frames."] },
  RaidHealing = { L["Raid heals and aggro"], L["Incoming heals, shields, aggro and missing raid buffs. Needs Raid frames."] },
  RaidStatus = { L["Raid marks"], L["Range fade, raid icons, ready check, resurrection, leader. Needs Raid frames."] },
  MainTanks = { L["Main tank frames"], L["In a raid, the main tanks and assists as small tiles at the top left, with what each is targeting."] },
  PartyExtras = { L["Party pets and targets"], L["Small tiles for each party member's pet and target, above the party (switch it on under Unit frames)."] },
  GroupThreat = { L["Group threat"], L["A small panel of who in your group has the most threat on your target. Off until you switch it on (Unit frames); hides itself while the game hides threat values."] },
  RaidTools = { L["Raid tools"], L["For the leader and assistants: ready check, pull timer, role check, target icons and world markers."] },
  ClickCast = { L["Click casting"], L["Cast on a frame with a click or a hover key."] },
  ActionBars = { L["Action bars"], L["Eight bars with their own size, layout and visibility."] },
  SpecialBars = { L["Pet, stance and extra buttons"], L["Restyles the game's special buttons, places the pet and stance bars, and adds the vehicle exit."] },
  Minimap = { L["Minimap"], L["A square minimap with the zone and coordinates."] },
  Waypoints = { L["Waypoints"], L["/way puts a waypoint on the map for the game's arrow; your and the cursor's coordinates on the world map."] },
  BrokerStrip = { L["Broker strip"], L["Other addons' data feeds (LibDataBroker) along the top edge, the ones you pick."] },
  InfoStrip = { L["Info strip"], L["Durability, bag slots, fps, gold, ammo or soul shards, the time and the day and date with a calendar button, under the minimap, your XP and gold per hour while you level, and your DPS and its place if you like."] },
  AfkScreen = { L["AFK screen"], L["While you're away, the screen dims to a card with your character, zone, time away and XP."] },
  MenuStrip = { L["Menu and quest tracker"], L["The game's bag and menu buttons on framed slots in one corner bar, and the quest tracker under the info strip."] },
  Chat = { L["Chat"], L["Themed chat windows and tabs."] },
  Bags = { L["Bags"], L["One combined bag, in sections by kind of item, with a Sort button."] },
  Merchant = { L["Merchant helpers"], L["Repair, sell gray items and your sell list, buy in stacks, and a quieter error line (its switch is under Game windows, Quiet the game)."] },
  ChatExtras = { L["Chat extras"], L["Clickable web links in chat, and a Copy button for the recent chat."] },
  ChatWatch = { L["Chat watch"], L["A sound and a toast when a phrase you watch for is said in chat; click to whisper."] },
  ChatFilter = { L["Chat filter"], L["Gold selling, boosting, guild recruiting and repeated lines in Trade and the other channels go to a Filtered tab. Off until you switch it on (Chat)."] },
  ChatBubbles = { L["Chat bubbles"], L["Speech bubbles in the world on a flat panel, in the theme font (the game's own inside instances)."] },
  ChatHistory = { L["Chat history"], L["Your chat comes back after a /reload or the next login, each window in its own tab. Off until you switch it on (Chat)."] },
  ChatWindows = { L["Chat windows"], L["Each chat window's width, height and lock from the Chat page, floating windows moved with /vg unlock, and Find in chat."] },
  MinimapButtons = { L["Minimap drawer"], L["Other addons' minimap buttons gathered into a drawer beside the map. Needs Minimap."] },
  AutoAccept = { L["Auto-accept"], L["Accept summons and resurrections, decline duels, guild invites, stranger group invites and friend requests, loot faster, release in battlegrounds (each off until you switch it on)."] },
  Quiet = { L["Quiet the game"], L["Hide the red error line and the zone names that fade in, and zoom the camera further out (each off until you switch it on)."] },
  QuestDialog = { L["Quest dialog"], L["Talking to quest givers in Vanguard's own dialog: numbered lines, reward cards, keys 1-9 and Space."] },
  QuestTracker = { L["Quest tracker"], L["Your watched quests under the info strip: levels in difficulty colors, objectives, quest items, nearest first if you like."] },
  QuestLog = { L["Quest log"], L["Your quests by zone, each quest's text, objectives and rewards, with Track, Share, Abandon and Map."] },
  QuestHistory = { L["Quest history"], L["Remembers which of your characters turned in each quest; the quest dialog and quest log say so, and /vg quests history lists the latest."] },
  QuestAuto = { L["Quest automation"], L["Accept, turn in, pick the best-selling reward, skip chatter; each off until switched on."] },
  GameAlerts = { L["Game alerts"], L["Loss of control and the talking head in the Vanguard look, each in a spot you can move; Hardcore death notices restyled; a rare nearby announced and a soft tint round the screen edge at low health if you like."] },
  Errands = { L["Errands"], L["Train all at a trainer, keep items stocked from merchants, and time your flights."] },
  InstancePrep = { L["Instance prep"], L["A checklist of what's low (ammo, reagents, food, bandages, potions, your stock list) when you enter an instance or a ready check starts."] },
  TalentPlanner = { L["Talent planner"], L["Plan your talent points on the talents window before you have them: planned ranks on each talent, the next pick ringed, Spend planned buys them in order."] },
  Legacy = { L["Legacy"], L["A probe of what the client has for the Legacy system and a 16-point perk plan list (the planner is off until switched on)."] },
  BossDocks = { L["Boss mod docks"], L["Two spots you can move for boss mods' timer bars; /vg dock lines up Deadly Boss Mods' bars with them."] },
  GameTools = { L["The game's tools"], L["The game's Cooldown Manager and damage meter, restyled and placed to fit the layout."] },
  CooldownGaps = { L["Cooldown gaps"], L["A small row of icons for what the game's Cooldown Manager misses: on-use trinkets, items and spells you choose, the manager's own cooldowns if you like, pet abilities and totems (off until switched on)."] },
  CooldownGlow = { L["Cooldown Manager glow"], L["A glow on a Cooldown Manager icon when its aura is in its last part (30 % by default), for spells without the game's own pandemic flag (off until switched on)."] },
  CooldownKeys = { L["Cooldown Manager keys"], L["The key you press for each spell in the Cooldown Manager's essential and utility rows, as small text on its icon, read from Vanguard's action bars (off until switched on)."] },
  CraftQueue = { L["Craft queue"], L["A list of crafts to make, profession cooldowns across your characters and the recipes that pay best, from the auction prices (off until switched on; /vg craft)."] },
  MailTools = { L["Mail tools"], L["Search and filter the inbox beside the mail window, and presets that fill the Send Mail tab for your alts (off until switched on; /vg mail)."] },
  Rolls = { L["Roll tracker"], L["A small panel with the group's /roll results, highest first, and, when the game's loot history lists the drop, who rolled what on the items being rolled for."] },
  FightHistory = { L["Fight history"], L["Your DPS and place in each fight this session, as a strip of bars under the damage meter (off until switched on)."] },
  Meter = { L["Vanguard meter"], L["A flat panel with the top lines of the game's damage meter, as damage or healing per second, in class colors (off until switched on)."] },
  Windows = { L["Game windows"], L["Character, merchant, quest, loot, mail, guild, map, options and other game windows, their tabs, menus, popups and the breath bar in the Vanguard look."] },
  DataBars = { L["XP and reputation"], L["Thin experience and reputation bars."] },
  Tooltips = { L["Tooltips"], L["Themed tooltips in a movable corner."] },
  Inventory = { L["Inventory"], L["Remembers your characters' bags and bank; item tooltips say who else has the item."] },
  Upgrades = { L["Gear upgrades"], L["Compares gear with what you wear by stat weights for your class and role: a tooltip line, arrows in the bag and on quest rewards, and the auction house's Upgrades list."] },
  PetStable = { L["Pet stable"], L["/vg pets lists your pets with level, loyalty, happiness and progress, and a stable master's window says how many you have and what the next slot costs."] },
  SpellRanks = { L["Spell ranks"], L["Notices older spell ranks on your bars and swaps them when you ask; remembers what trainers teach and at what level (both off until switched on)."] },
  VendorMemory = { L["Vendor memory"], L["Remembers what each merchant sells; tooltips and the stock list say where to buy."] },
  AuctionHelper = { L["Auction helper"], L["Shopping lists with Deals and Upgrades, a sell card that suggests an undercut and posts, prices in tooltips from your scans, and an undercut check on your auctions."] },
  Nameplates = { L["Nameplates"], L["Flat plates with levels, your debuffs, players' buffs, casts and threat."] },
  Situations = { L["Situations"], L["Different frame spots and settings for solo, party, raid, PvP, instance and resting, applied out of combat."] },
}

-- Modules with their own switch inside (off by default): its setting keys (on if any is) and the page it is on.
-- Kept apart from O.MODULE_INFO, whose two-item lines the website reads.
O.MODULE_LINKS = {
  PartyExtras = { keys = { "show" }, page = "unitframes" },
  GroupThreat = { keys = { "show" }, page = "unitframes" },
  OfficerLoot = { keys = { "on" }, page = "tools" },
  ChatFilter = { keys = { "on" }, page = "chat" },
  ChatHistory = { keys = { "on" }, page = "chat" },
  CooldownGaps = { keys = { "on" }, page = "cooldowns" },
  CooldownGlow = { keys = { "glow" }, page = "cooldowns" },
  CooldownKeys = { keys = { "keys" }, page = "cooldowns" },
  CraftQueue = { keys = { "on" }, page = "town" },
  MailTools = { keys = { "on" }, page = "town" },
  SpellRanks = { keys = { "barNotice", "trainerMemory" }, page = "town" },
  Legacy = { keys = { "planner" }, page = "town" },
  FightHistory = { keys = { "strip", "recap" }, page = "tools" },
  Meter = { keys = { "on" }, page = "tools" },
}

-- A page's title in the list on the left (its key until its file has added it).
local function pageTitle(key)
  local title = key
  for _, page in ipairs(O.PAGES) do
    if page.key == key and page.title then title = page.title end
  end
  return title
end

-- "On, but its own switch is off (Combat tools)" while a linked module is on and every one of its own switches is off.
function O.OwnSwitchNote(name)
  local link = O.MODULE_LINKS[name]
  if not (link and ns.ModuleEnabled(name)) then return nil end
  local settings = moduleSettings(name)
  for _, key in ipairs(link.keys) do
    if settings[key] then return nil end
  end
  return ns.Format(L["On, but its own switch is off ({page})"], { page = pageTitle(link.page) })
end

-- One module's switch, with its name and what it does; it applies on reload (Core/Modules.lua builds modules at login),
-- so it wears the reload tag.
local function moduleRow(name)
  local info = O.MODULE_INFO[name] or { name, "" }
  return { "module", info[1], function() return ns.ModuleEnabled(name) end,
    function(v) ns.SetModuleEnabled(name, v); O.NeedReload() end, nil, info[2], name, reload = true }
end

-- The Modules page's groups, in the nav's order: a title and the modules under it (a module in none is under "More").
O.MODULE_GROUPS = {
  { L["Unit frames"], { "UnitFrames", "CastBars", "FrameAuras", "PlayerAuras", "ComboPoints", "ClassBars", "PowerTicks", "SwingTimer", "UnitExtras", "PartyExtras", "GroupThreat", "MainTanks", "ClickCast", "Situations" } },
  { L["Raid frames"], { "RaidFrames", "RaidAuras", "RaidHealing", "RaidStatus", "RaidTools", "OfficerLoot" } },
  { L["Action bars"], { "ActionBars", "SpecialBars" } },
  { L["Map and info"], { "Minimap", "Waypoints", "BrokerStrip", "InfoStrip", "MenuStrip", "MinimapButtons", "DataBars" } },
  { L["Chat"], { "Chat", "ChatExtras", "ChatWatch", "ChatFilter", "ChatBubbles", "ChatHistory", "ChatWindows" } },
  { L["Quests"], { "QuestDialog", "QuestTracker", "QuestLog", "QuestAuto", "QuestArrow", "QuestGuide", "QuestMinimap", "QuestHistory" } },
  { L["Game windows"], { "Windows", "Tooltips", "GameAlerts", "GameTools", "AfkScreen", "Coexist", "Quiet", "CharacterExtras" } },
  { L["Town and gear"], { "Bags", "Merchant", "AutoAccept", "Errands", "Inventory", "Upgrades", "VendorMemory", "AuctionHelper", "CraftQueue", "PetStable", "MailTools", "SpellRanks", "TalentPlanner", "Legacy", "InstancePrep" } },
  { L["Combat tools"], { "Nameplates", "Rolls", "GroupBoard", "BossDocks", "CooldownGaps", "CooldownGlow", "CooldownKeys", "FightHistory", "Meter" } },
}

-- Which modules the Modules page lists: all, the ones that are on, or the ones that are off.
O.moduleFilter = "all"
local MODULE_FILTERS = { { "all", L["All"] }, { "on", L["On"] }, { "off", L["Off"] } }

-- Whether the Modules page lists a module under the filter in use.
local function shownModule(name)
  return O.moduleFilter == "all" or (O.moduleFilter == "on") == ns.ModuleEnabled(name)
end

-- The modules of a group that exist and pass the filter; `listed` is marked with each one.
local function groupModules(names, listed)
  local have, out = {}, {}
  for _, name in ipairs(ns.ModuleNames()) do have[name] = true end
  for _, name in ipairs(names) do
    if have[name] and not listed[name] then listed[name] = true if shownModule(name) then out[#out + 1] = name end end
  end
  return out
end

-- A group's header and its modules' switches (nothing when none pass the filter).
local function groupSection(title, names)
  local rows = {}
  if #names == 0 then return rows end
  rows[1] = { "header", title }
  for _, name in ipairs(names) do rows[#rows + 1] = moduleRow(name) end
  return rows
end

-- The modules in no group, in load order.
local function otherModules(listed)
  local out = {}
  for _, name in ipairs(ns.ModuleNames()) do
    if not listed[name] and shownModule(name) then out[#out + 1] = name end
  end
  return out
end

-- The top of the Modules page, above its tabs (no heading of its own): what off means, and the filter.
local function moduleTop()
  return {
    { "text", L["A module that's off builds nothing and costs nothing."] },
    { "cycle", L["Show"], MODULE_FILTERS, function() return O.moduleFilter end, function(v) O.moduleFilter = v O.RebuildPage("modules") end },
  }
end

-- Modules: a filter, then one switch per module under the group (a nav page's name) it belongs to.
local function moduleRows()
  local rows, listed = moduleTop(), {}
  for _, group in ipairs(O.MODULE_GROUPS) do rows = append(rows, groupSection(group[1], groupModules(group[2], listed))) end
  return append(rows, groupSection(L["More"], otherModules(listed)))
end

-- "Spec 2 uses Healer." or why there's no spec profile.
local function specText()
  local spec = ns.SpecIndex()
  if not spec then return L["No specialization yet."] end
  return ns.Format(L["Spec {spec} uses {profile}."], { spec = spec, profile = ns.SpecProfile(spec) or L["the character's profile"] })
end

-- Every profile, with its buttons, then the box for a new one (Core/OptionsProfiles.lua).
local function profileListRows()
  local rows = { { "header", L["Your profiles"] } }
  for _, name in ipairs(ns.ProfileNames()) do rows[#rows + 1] = { "profile", name } end
  rows[#rows + 1] = { "newprofile" }
  return rows
end

-- "This character uses Default." or, with a switch staged, what it uses until the reload and after it.
local function currentProfileText()
  local later = ns.PendingProfileName()
  if not later then return ns.Format(L["This character uses {profile}."], { profile = ns.ProfileName() }) end
  return ns.Format(L["This character uses {profile} until you reload, then {next}."], { profile = ns.ProfileName(), next = later })
end

-- Asks before a reset: what is lost (every setting in the profile in use, for every character
-- using it) and where its copy goes; yes backs it up, resets it and runs after().
local function confirmReset(what, yes, after)
  local name = ns.ProfileName()
  local q = L["{question} Every setting in profile {profile} goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile {backup}."]
  ns.Ask(ns.Format(q, { question = what, profile = name, backup = ns.BackupName(name) }), yes, function()
    ns.Chat(ns.Format(L["Profile {profile} as it was is saved as profile {backup}."], { profile = name, backup = ns.BackupProfile() }))
    ns.ResetProfile()
    after()
  end, function() end, "danger")
end

-- Reset profile: after asking, the profile back to defaults (backed up first), applied on reload.
local function resetProfile()
  confirmReset(L["Reset this profile?"], L["Reset"], O.ProfileReplaced)
end
O.AskResetProfile = resetProfile

-- Start over: after asking, the profile back to defaults (backed up first), and setup opens after the reload that applies it.
local function startOver()
  confirmReset(L["Start over?"], L["Start over"], function() VanguardCharDB.setupDone = false O.ProfileReplaced() end)
end

-- Profiles, part one: which profile, export/import, reset.
local function currentProfileRows()
  return {
    { "header", L["Profile"] },
    { "text", currentProfileText },
    { "button", L["Export profile"], function() ns.ShowText(L["Vanguard export  Ctrl+C to copy"], ns.ExportProfile()) end },
    { "button", L["Choose what to export"], function() ns.ExportDialog() end },
    { "button", L["Import"], function() ns.ImportDialog() end },
    { "button", L["Reset profile"], resetProfile },
    { "button", L["Start over: reset and run setup"], startOver },
  }
end

-- Profiles, part two: the spec profile (nothing on a client with no specializations).
local function specRows()
  if not ns.HasSpecs() then return {} end
  return {
    { "header", L["Specialization"] },
    { "text", specText },
    { "button", L["Use this profile for this spec"], function() ns.SetSpecProfile(ns.SelectedProfileName()); O.Refresh() end },
    { "button", L["Stop spec switching"], function() ns.SetSpecProfile(nil); O.Refresh() end },
  }
end

-- Profiles: the settings-loss notice when there is one, export/import, reset, spec profiles, and every profile.
local function profileRows()
  local rows = append(ns.SettingsGuard.Rows(), currentProfileRows())
  return append(append(rows, specRows()), profileListRows())
end

-- Opens the feedback form (Core/Feedback.lua) on a kind, with the options window out of the way.
local function openFeedback(kind)
  return function() O.Hide(); ns.Feedback.Open(kind) end
end

-- Shows one of Vanguard's community links (ns.Feedback.COMMUNITY) in the copy box, titled with how to use it.
local function copyLink(title, key)
  return function() ns.ShowText(title, ns.Feedback.COMMUNITY[key]) end
end

-- Feedback: the in-game form for a bug or an idea and the plain /vg report.
local function feedbackFormRows()
  return {
    { "header", L["Feedback"] },
    { "text", L["A bug or an idea? The form asks what vanguardui.com/feedback asks, then makes one block to paste there; the site's form fills itself from it (/vg feedback does the same)."] },
    { "button", L["Report a bug"], openFeedback("bug") },
    { "button", L["Request a feature"], openFeedback("feature") },
    { "header", L["Just the report"] },
    { "text", L["What /vg status and /vg errors say, in one block to paste into the site's report box by hand (/vg report)."] },
    { "button", L["Copy a report"], function() SlashCmdList.VANGUARD("report") end },
  }
end

-- Feedback, part two: the Discord server and the X account, each copied to paste into a browser.
local function communityRows()
  return {
    { "header", L["Community"] },
    { "text", ns.Format(L["News, help and other players: Vanguard's Discord server, and {handle} on X. Copy a link, then paste it into your browser."], { handle = ns.Feedback.COMMUNITY.handle }) },
    { "button", L["Copy Discord invite"], copyLink(L["Vanguard on Discord: Ctrl+C, then paste into your browser"], "discord") },
    { "button", L["Copy X link"], copyLink(L["Vanguard on X: Ctrl+C, then paste into your browser"], "x") },
  }
end

-- Feedback: the form and the report, then the community links.
local function feedbackRows()
  return append(feedbackFormRows(), communityRows())
end

-- Pages: key, title, nav icon (Media/Icons) and order in the nav (groups: under 30, under 90, the rest).
-- The pages that only name a key are filled in by their area's file (O.AddPage), in this order.
local PAGES = {
  { key = "general", title = L["General"], icon = "NavGeneral", order = 10, rows = generalRows },
  { key = "modules", title = L["Modules"], icon = "NavModules", order = 20, rows = moduleRows },
  { key = "unitframes" },
  { key = "raid" },
  { key = "actionbars" },
  { key = "quests" },
  { key = "bars" },
  { key = "map" },
  { key = "chat" },
  { key = "windows" },
  { key = "cooldowns" },
  { key = "tools" },
  { key = "town" },
  { key = "profiles", title = L["Profiles"], icon = "NavProfiles", order = 90, rows = profileRows },
  { key = "feedback", title = L["Feedback"], icon = "NavFeedback", order = 100, rows = feedbackRows },
}
O.PAGES = PAGES

-- Adds a page from another file (e.g. a module's own options): key, title, icon, order, rows.
-- A page whose key the list above names takes that place.
function O.AddPage(page)
  for i, p in ipairs(PAGES) do
    if p.key == page.key then PAGES[i] = page return end
  end
  PAGES[#PAGES + 1] = page
end

-- Adds rows from another file to a page: rowsFn() runs each time the page is built, its rows
-- after the page's own (first: before them). A key with no page is left alone.
function O.AddRows(key, rowsFn, first)
  for _, page in ipairs(PAGES) do
    if page.key == key then
      local own = page.rows
      -- The page's own rows with the added ones before or after them.
      page.rows = function() return first and append(rowsFn(), own()) or append(own(), rowsFn()) end
    end
  end
end

-- The addons button by the minimap: left-click options, right-click move frames.
function Vanguard_OnAddonCompartmentClick(_, button)
  if button == "RightButton" then
    if ns.Unlocked() then ns.Lock() else ns.Unlock() end
  else
    O.Toggle()
  end
end

-- The addons button's tooltip: Vanguard's version, what each click does, and the errors caught this session.
function Vanguard_OnAddonCompartmentEnter(_, button)
  if not GameTooltip then return end
  GameTooltip:SetOwner(button, "ANCHOR_LEFT")
  GameTooltip:SetText("Vanguard " .. ns.AddonVersion())
  GameTooltip:AddLine(L["Left-click: options · Right-click: move frames (out of combat)"], T.RGB("text2"))
  local n = #ns.errors
  local caught = n == 1 and L["1 error caught this session (/vg errors)"] or L["{count} errors caught this session (/vg errors)"]
  if n > 0 then GameTooltip:AddLine(ns.Format(caught, { count = n }), T.RGB("bad")) end
  GameTooltip:Show()
end

-- Hides the addons button's tooltip, only while it is still the button's (another addon may own it by now).
function Vanguard_OnAddonCompartmentLeave(_, button)
  if GameTooltip and GameTooltip:GetOwner() == button then GameTooltip:Hide() end
end
