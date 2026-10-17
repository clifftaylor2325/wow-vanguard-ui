-- The options pages (/vg, or the addons button by the minimap): a page
-- per area, as tables of rows. Core/OptionsWindow.lua builds the window
-- from them. Most changes apply at once; the ones that rebuild frames
-- light up the reload notice. This file holds the shared helpers, the
-- General, Modules, Profiles and Feedback pages, and the page list; the
-- other pages' rows are in their own files (Core/OptionsFrames.lua,
-- OptionsBars.lua, OptionsQuests.lua, OptionsBags.lua, OptionsMap.lua,
-- OptionsChat.lua, OptionsGameWindows.lua, OptionsTools.lua, OptionsTown.lua), which add them
-- with O.AddPage. A new setting goes in its area's file.

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
-- setting and can put it back); reload marks a change that needs one.
local function setting(module, key, reload)
  return O.Tag(function() return moduleSettings(module)[key] end, module, key),
    function(v) moduleSettings(module)[key] = v; if reload then O.NeedReload() end end,
    default(module, key)
end

-- get/set for a module setting that applies at once (after() runs on each change), and its default.
local function liveSetting(module, key, after)
  local get, set, initial = setting(module, key)
  return get, function(v) set(v); after() end, initial
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

-- The visibility rows (Core/Visibility.lua) of a module's frame, applied at once
-- (when the module runs); unset, the setting is Always. modes: its choices (V.MODES unless given).
local function visibilityRows(caption, module, modeKey, whenKey, modes)
  local mode, when = ns.Visibility.Rows(caption, function() return moduleSettings(module) end, modeKey, whenKey, function()
    local m = ns.GetModule(module)
    if m.enabled then m.ApplyVisibility() end
  end, "always", modes)
  O.Tag(mode[4], module, modeKey)
  return mode, when
end

-- The helpers the area files build their rows with.
O.VisibilityRows = visibilityRows
O.ModuleSettings, O.Setting, O.LiveSetting, O.Check, O.Append = moduleSettings, setting, liveSetting, check, append

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

-- The built-in fonts and bar textures; the pickers add what LibSharedMedia shares.
local FONT_CHOICES = { { "", "Fira Sans Condensed" }, { "client", "the game's font" } }
-- The faction look: your faction's crest only (the default), the crest and heading font, or off.
local FACTION_LOOK = { { "crest", "Crest only" }, { "auto", "Crest and heading font" }, { "off", "Off" } }
-- The theme variants (#237), in display order.
local VARIANT_CHOICES = { { "default", "Slate and brass" }, { "contrast", "High contrast" }, { "vellum", "Vellum and ink" }, { "classic", "Classic look" }, { "midnight", "Midnight" }, { "obsidian", "Obsidian" }, { "moss", "Moss" }, { "ember", "Ash and ember" } }
-- Panel corners: square (the default) or rounded.
local CORNER_CHOICES = { { "square", "Square" }, { "rounded", "Rounded" } }
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

-- Look, the font, text size, faction, variant, corners and ornament rows.
local function lookTextRows()
  return {
    { "cycle", "Font", T.SharedChoices("font", FONT_CHOICES), liveThemeSetting("font") },
    { "slider", "Text size", TEXT_SIZES, liveThemeSetting("textScale") },
    { "cycle", "Faction look", FACTION_LOOK, liveThemeSetting("faction") },
    { "cycle", "Theme variant: surfaces and text", VARIANT_CHOICES, liveThemeSetting("variant") },
    { "cycle", "Corners: square or rounded panels", CORNER_CHOICES, liveThemeSetting("corners") },
    check("Window ornaments: a brass rule or corners on large windows", previewedSetting("ornaments")),
  }
end

-- General, part one: accent, color assist, font, text size, variant, ornaments, scale and theme reset.
local function lookRows()
  local rows = { { "header", "Look" }, { "preview" }, { "swatches" },
    check("Color assist: friendly blue, neutral yellow, hostile vermilion (reload)", themeSetting("colorAssist")) }
  for _, row in ipairs(lookTextRows()) do rows[#rows + 1] = row end
  rows[#rows + 1] = check("Pixel-perfect scale (crisp 1-pixel lines)", function() return T.Settings().pixelScale end,
    function(v) T.SetPixelScale(v); if not v then O.NeedReload() end end)
  rows[#rows + 1] = { "button", "Reset theme", function() T.Reset() end }
  return rows
end

-- General, part two: setup again, and what's new in this version.
local function setupRows()
  return {
    { "header", "Layout" },
    { "text", "Setup walks through layout, screen and look again; it starts on Keep, so it changes only what you pick (/vg setup)." },
    { "button", "Run setup", function() O.Hide(); ns.Setup.Open() end },
    { "button", "What's new", function() O.Hide(); ns.WhatsNew.Open() end },
  }
end

-- General, part three: moving frames.
local function layoutRows()
  return append(setupRows(), {
    { "button", "Move frames", function() O.Hide(); ns.Unlock() end },
    check("Show a grid while moving", moverOption("grid")),
    check("Snap to other frames", moverOption("snap")),
    check("Show these handles in the game's Edit Mode too", moverOption("editMode")),
    { "text", "While moving frames, right-click one to anchor it to the screen or to another frame's side, for its exact offsets, scale and opacity, or to match its width or height to another frame's." },
  })
end

-- General, part four: one frame's scale, opacity and size, and resetting every frame.
local function sizeRows()
  return {
    { "cycle", "Frame to size", moverChoices(), pickMover() },
    { "slider", "Its scale", MOVER_SCALES, moverLook(1, ns.SetMoverScale) },
    { "slider", "Its opacity", MOVER_ALPHAS, moverLook(2, ns.SetMoverAlpha) },
    { "slider", "Its width", moverSizes("width", 1200, 2), moverSize("width") },
    { "slider", "Its height", moverSizes("height", 80, 1), moverSize("height") },
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

-- General: the settings-loss notice when there is one (Core/SettingsGuard.lua), look, bars, motion, layout and frame sizes.
local function generalRows()
  local rows = append(ns.SettingsGuard.Rows(), lookRows())
  return append(append(append(append(rows, barRows()), motionRows()), layoutRows()), sizeRows())
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
  GroupThreat = { "Group threat", "A small panel of who in your group has the most threat on your target. Off until you switch it on (Unit frames); hides itself while the game hides threat values." },
  RaidTools = { "Raid tools", "For the leader and assistants: ready check, pull timer, role check, target icons and world markers." },
  ClickCast = { "Click casting", "Cast on a frame with a click or a hover key." },
  ActionBars = { "Action bars", "Eight bars with their own size, layout and visibility." },
  SpecialBars = { "Pet, stance and extra buttons", "Restyles the game's special buttons, places the pet and stance bars, and adds the vehicle exit." },
  Minimap = { "Minimap", "A square minimap with the zone and coordinates." },
  Waypoints = { "Waypoints", "/way puts a waypoint on the map for the game's arrow; your and the cursor's coordinates on the world map." },
  BrokerStrip = { "Broker strip", "Other addons' data feeds (LibDataBroker) along the top edge, the ones you pick." },
  InfoStrip = { "Info strip", "Durability, bag slots, fps, gold, ammo or soul shards, the time and the day and date with a calendar button, under the minimap, your XP and gold per hour while you level, and your DPS and its place if you like." },
  AfkScreen = { "AFK screen", "While you're away, the screen dims to a card with your character, zone, time away and XP." },
  MenuStrip = { "Menu and quest tracker", "The game's bag and menu buttons on framed slots in one corner bar, and the quest tracker under the info strip." },
  Chat = { "Chat", "Themed chat windows and tabs." },
  Bags = { "Bags", "One combined bag, in sections by kind of item, with a Sort button." },
  Merchant = { "Merchant helpers", "Repair, sell gray items, and a quieter error line." },
  ChatExtras = { "Chat extras", "Clickable web links in chat, and a Copy button for the recent chat." },
  ChatWatch = { "Chat watch", "A sound and a toast when a phrase you watch for is said in chat; click to whisper." },
  ChatBubbles = { "Chat bubbles", "Speech bubbles in the world on a flat panel, in the theme font (the game's own inside instances)." },
  MinimapButtons = { "Minimap drawer", "Other addons' minimap buttons gathered into a drawer beside the map." },
  AutoAccept = { "Auto-accept", "Accept summons and resurrections, decline duels, loot faster (each off until you switch it on)." },
  QuestDialog = { "Quest dialog", "Talking to quest givers in Vanguard's own dialog: numbered lines, reward cards, keys 1-9 and Space." },
  QuestTracker = { "Quest tracker", "Your watched quests under the info strip: levels in difficulty colors, objectives, quest items, nearest first if you like." },
  QuestLog = { "Quest log", "Your quests by zone, each quest's text, objectives and rewards, with Track, Share, Abandon and Map." },
  QuestAuto = { "Quest automation", "Accept, turn in, pick the best-selling reward, skip chatter; each off until switched on." },
  GameAlerts = { "Game alerts", "Loss of control and the talking head in the Vanguard look, each in a spot you can move; Hardcore death notices restyled; a rare nearby announced if you like." },
  Errands = { "Errands", "Train all at a trainer, keep items stocked from merchants, and time your flights." },
  InstancePrep = { "Instance prep", "A checklist of what's low (ammo, reagents, food, bandages, potions, your stock list) when you enter an instance or a ready check starts." },
  TalentPlanner = { "Talent planner", "Plan your talent points on the talents window before you have them: planned ranks on each talent, the next pick ringed, Spend planned buys them in order." },
  Legacy = { "Legacy", "A probe of what the client has for the Legacy system and a 16-point perk plan list (the planner is off until switched on)." },
  BossDocks = { "Boss mod docks", "Two spots you can move for boss mods' timer bars; /vg dock lines up Deadly Boss Mods' bars with them." },
  GameTools = { "The game's tools", "The game's Cooldown Manager and damage meter, restyled and placed to fit the layout." },
  CooldownGaps = { "Cooldown gaps", "A small row of icons for what the game's Cooldown Manager misses: on-use trinkets, items and spells you choose, the manager's own cooldowns if you like, pet abilities and totems (off until switched on)." },
  CooldownGlow = { "Cooldown Manager glow", "A glow on a Cooldown Manager icon when its aura is in its last part (30 % by default), for spells without the game's own pandemic flag (off until switched on)." },
  CraftQueue = { "Craft queue", "A list of crafts to make, profession cooldowns across your characters and the recipes that pay best, from the auction prices (off until switched on; /vg craft)." },
  MailTools = { "Mail tools", "Search and filter the inbox beside the mail window, and presets that fill the Send Mail tab for your alts (off until switched on; /vg mail)." },
  Rolls = { "Roll tracker", "A small panel with the group's /roll results, highest first, and (where the client has the loot history) who rolled what on the items being rolled for." },
  FightHistory = { "Fight history", "Your DPS and place in each fight this session, as a strip of bars under the damage meter (off until switched on)." },
  Meter = { "Vanguard meter", "A flat panel with the top lines of the game's damage meter, as damage or healing per second, in class colors (off until switched on)." },
  Windows = { "Game windows", "Character, merchant, quest, loot, mail, guild, map, options and other game windows, their tabs, menus, popups and the breath bar in the Vanguard look." },
  DataBars = { "XP and reputation", "Thin experience and reputation bars." },
  Tooltips = { "Tooltips", "Themed tooltips in a movable corner." },
  Inventory = { "Inventory", "Remembers your characters' bags and bank; item tooltips say who else has the item." },
  Upgrades = { "Gear upgrades", "Compares gear with what you wear by stat weights for your class and role: a tooltip line, arrows in the bag and on quest rewards, and the auction house's Upgrades list." },
  SpellRanks = { "Spell ranks", "Notices older spell ranks on your bars and swaps them when you ask; remembers what trainers teach and at what level (both off until switched on)." },
  VendorMemory = { "Vendor memory", "Remembers what each merchant sells; tooltips and the stock list say where to buy." },
  AuctionHelper = { "Auction helper", "Shopping lists with Deals and Upgrades, a sell card that suggests an undercut and posts, prices in tooltips from your scans, and an undercut check on your auctions." },
  Nameplates = { "Nameplates", "Flat plates with levels, your debuffs, players' buffs, casts and threat." },
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

-- Asks before a reset: what is lost (every setting in the profile in use, for every character
-- using it) and where its copy goes; yes backs it up, resets it and runs after().
local function confirmReset(what, yes, after)
  local name = ns.ProfileName()
  local q = "%s Every setting in profile %s goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile %s."
  ns.Ask(string.format(q, what, name, ns.BackupName(name)), yes, function()
    ns.Chat(string.format("Profile %s as it was is saved as profile %s.", name, ns.BackupProfile()))
    ns.ResetProfile()
    after()
  end, function() end)
end

-- Reset profile: after asking, the profile back to defaults (backed up first), applied on reload.
local function resetProfile()
  confirmReset("Reset this profile?", "Reset", O.NeedReload)
end

-- Start over: after asking, the profile back to defaults (backed up first), and setup opens after the reload that applies it.
local function startOver()
  confirmReset("Start over?", "Start over", function() VanguardCharDB.setupDone = false O.NeedReload() end)
end

-- Profiles, part one: which profile, export/import, reset.
local function currentProfileRows()
  return {
    { "header", "Profile" },
    { "text", currentProfileText },
    { "button", "Export profile", function() ns.ShowText("Vanguard export  Ctrl+C to copy", ns.ExportProfile()) end },
    { "button", "Choose what to export", function() ns.ExportDialog() end },
    { "button", "Import", function() ns.ImportDialog() end },
    { "button", "Reset profile", resetProfile },
    { "button", "Start over: reset and run setup", startOver },
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

-- Profiles: the settings-loss notice when there is one, export/import, reset, spec profiles, and every profile.
local function profileRows()
  local rows = append(ns.SettingsGuard.Rows(), currentProfileRows())
  return append(append(rows, specRows()), profileListRows())
end

-- Opens the feedback form (Core/Feedback.lua) on a kind, with the options window out of the way.
local function openFeedback(kind)
  return function() O.Hide(); ns.Feedback.Open(kind) end
end

-- Feedback: the in-game form for a bug or an idea, and the plain /vg report.
local function feedbackRows()
  return {
    { "header", "Feedback" },
    { "text", "A bug or an idea? The form asks what vanguardui.com/feedback asks, then makes one block to paste there; the site's form fills itself from it (/vg feedback does the same)." },
    { "button", "Report a bug", openFeedback("bug") },
    { "button", "Request a feature", openFeedback("feature") },
    { "header", "Just the report" },
    { "text", "What /vg status and /vg errors say, in one block to paste into the site's report box by hand (/vg report)." },
    { "button", "Copy a report", function() SlashCmdList.VANGUARD("report") end },
  }
end

-- Pages: key, title, nav icon (Media/Icons) and order in the nav (groups: under 30, under 90, the rest).
-- The pages that only name a key are filled in by their area's file (O.AddPage), in this order.
local PAGES = {
  { key = "general", title = "General", icon = "NavGeneral", order = 10, rows = generalRows },
  { key = "modules", title = "Modules", icon = "NavModules", order = 20, rows = moduleRows },
  { key = "unitframes" },
  { key = "raid" },
  { key = "actionbars" },
  { key = "quests" },
  { key = "bars" },
  { key = "map" },
  { key = "chat" },
  { key = "windows" },
  { key = "tools" },
  { key = "town" },
  { key = "profiles", title = "Profiles", icon = "NavProfiles", order = 90, rows = profileRows },
  { key = "feedback", title = "Feedback", icon = "NavFeedback", order = 100, rows = feedbackRows },
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
