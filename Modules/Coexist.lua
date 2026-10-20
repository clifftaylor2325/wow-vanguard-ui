-- Coexistence: other addons that do a job a Vanguard module also does (a bag
-- addon beside Vanguard's bags, a window skinner beside its window looks). At
-- login Vanguard looks for the loaded ones in CX.OVERLAPS; for each new overlap
-- it says so once in chat, and the Modules page of /vg shows a card that offers
-- to turn Vanguard's part off or keep both. Nothing changes without a click, and
-- an answer is kept in the profile, so it isn't asked again; while that addon is
-- still loaded the card keeps the answer, with a button to change it.
-- Folder names: Glass, Aurora, BlizzMove and MoveAny are from each one's
-- published .toc, MovableWindowsForever and ForevermoreClassicUI from their
-- published zip names; Platynator, Chattynator, Sorted, BetterFriendlist and
-- the older rows are unchecked on the Forever client. A wrong name only means
-- no card (SMOKE-TEST 18.1 and 18.1a check them). An addon names one target,
-- so the whole-UI addons ElvUI and Tukui ask about action bars only.

local ADDON, ns = ...

local CX = ns.Module("Coexist", { defaults = { answered = {}, told = {}, off = {} } })

-- Addon folder name -> { the Vanguard module it overlaps, what both do }, plus optional
-- keys (the module's settings to turn off instead of the whole module: a list, or the name
-- of a list on the module's table, read at click time), reload (those keys apply only after
-- a reload) and also (one more sentence for the card). One place for the list.
CX.OVERLAPS = {
  Bagnon = { "Bags", "bags" }, AdiBags = { "Bags", "bags" }, ArkInventory = { "Bags", "bags" },
  BetterBags = { "Bags", "bags" }, Baganator = { "Bags", "bags" }, Sorted = { "Bags", "bags" },
  Plater = { "Nameplates", "nameplates" }, Kui_Nameplates = { "Nameplates", "nameplates" },
  TidyPlates_ThreatPlates = { "Nameplates", "nameplates" }, Platynator = { "Nameplates", "nameplates" },
  Bartender4 = { "ActionBars", "action bars" }, Dominos = { "ActionBars", "action bars" },
  ShadowedUnitFrames = { "UnitFrames", "unit frames" }, PitBull4 = { "UnitFrames", "unit frames" },
  Grid2 = { "RaidFrames", "raid frames" }, VuhDo = { "RaidFrames", "raid frames" }, Cell = { "RaidFrames", "raid frames" },
  Clique = { "ClickCast", "click casting" }, Quartz = { "CastBars", "cast bars" },
  EllesmereUIUnitFrames = { "UnitFrames", "unit frames" }, EllesmereUIActionBars = { "ActionBars", "action bars" },
  EllesmereUINameplates = { "Nameplates", "nameplates" }, EllesmereUIRaidFrames = { "RaidFrames", "raid frames" },
  SexyMap = { "Minimap", "the minimap" }, TipTac = { "Tooltips", "tooltips" },
  ["Prat-3.0"] = { "Chat", "chat" }, Chattynator = { "Chat", "chat" }, Glass = { "Chat", "chat" },
  ElvUI = { "ActionBars", "action bars" }, Tukui = { "ActionBars", "action bars" },
  Auctionator = { "AuctionHelper", "auction house shopping and posting" },
  TradeSkillMaster = { "AuctionHelper", "auction house shopping and posting" },
  -- Window skinners restyle popups, menus and tabs too, so every look group goes; durability and moving stay.
  Aurora = { "Windows", "window looks", keys = "GROUPS", reload = true },
  ForevermoreClassicUI = { "Windows", "window looks", keys = "GROUPS", reload = true },
  BlizzMove = { "Windows", "window moving", keys = { "movable" }, reload = true },
  MoveAny = { "Windows", "window moving", keys = { "movable" }, reload = true },
  MovableWindowsForever = { "Windows", "window moving", keys = { "movable" }, reload = true },
  -- The social group: friends, guild, chat channels, the raid tab, letters and the social toasts.
  BetterFriendlist = { "Windows", "social window looks", keys = { "social" }, reload = true },
}

ns.Options.MODULE_INFO.Coexist = { "Other addons", "At login, notices addons that do a job a Vanguard module also does, and offers to turn that part of Vanguard off." }

-- Whether the client says the addon is loaded (a client without the call: no).
local function loaded(name)
  local fn = C_AddOns and C_AddOns.IsAddOnLoaded
  return type(fn) == "function" and fn(name) == true
end

-- The row's settings keys, or nil for a whole-module row. A named list is read off the module now.
local function keysOf(o)
  if type(o.keys) ~= "string" then return o.keys end
  local def = ns.GetModule(o.module)
  return def and def[o.keys] or {}
end

-- The keys of `keys` that are on (`want` true) or off (false) in the row's module; none without keys,
-- so a row naming a missing module reads no settings.
local function keysAt(o, keys, want)
  local found = {}
  if #keys == 0 then return found end
  local settings = ns.Settings(o.module)
  for _, key in ipairs(keys) do
    if (settings[key] ~= false) == want then found[#found + 1] = key end
  end
  return found
end

-- The keys of the row's list that are on in this profile.
local function keysOn(o)
  return keysAt(o, keysOf(o), true)
end

-- Whether Vanguard still does what the row names: its module is on, and with keys, at least one of them.
local function doing(o)
  if not ns.ModuleEnabled(o.module) then return false end
  return o.keys == nil or #keysOn(o) > 0
end

-- One overlap as the card and chat use it: the row's fields plus the addon's name and the profile's answer.
local function overlap(addon, row, answered)
  return { addon = addon, module = row[1], what = row[2], keys = row.keys, reload = row.reload, also = row.also, answer = answered[addon] }
end

-- The keys an "off" answer would turn back on: the ones the card turned off, or without that record the row's own.
local function keysToRestore(o)
  return ns.Settings("Coexist", CX.defaults).off[o.addon] or keysOf(o)
end

-- Whether an "off" answer has something to turn back on: its module, or (while the module is on) any of its keys
-- still off, even if another row or the Game windows page turned some back on.
local function restorable(o)
  if not o.keys then return not ns.ModuleEnabled(o.module) end
  return ns.ModuleEnabled(o.module) and #keysAt(o, keysToRestore(o), false) > 0
end

-- Whether the card has something to offer: a question or Vanguard's part still on after "kept", or after "off"
-- a part that can come back.
local function offered(o)
  if o.answer == "off" then return restorable(o) end
  return doing(o)
end

-- The loaded addons the card speaks for, as overlap() tables sorted by addon name.
local function collect()
  local out, answered = {}, ns.Settings("Coexist", CX.defaults).answered
  for addon, row in pairs(CX.OVERLAPS) do
    local o = loaded(addon) and overlap(addon, row, answered)
    if o and offered(o) then out[#out + 1] = o end
  end
  table.sort(out, function(a, b) return a.addon < b.addon end)
  return out
end

-- The overlaps to ask about: on the card and not yet answered.
function CX.Pending()
  local out = {}
  for _, o in ipairs(collect()) do
    if not o.answer then out[#out + 1] = o end
  end
  return out
end

-- The module's shown name (the Modules page's), or its own name.
local function moduleName(module)
  local info = ns.Options.MODULE_INFO[module]
  return info and info[1] or module
end

-- What the buttons name: the module by its Modules page name, or for a keys row "Vanguard's <what>".
local function targetName(o)
  if o.keys then return "Vanguard's " .. o.what end
  return moduleName(o.module)
end

-- The target as the sentences say it, always with "Vanguard's".
local function ownName(o)
  if o.keys then return targetName(o) end
  return "Vanguard's " .. moduleName(o.module)
end

-- Records the answer and builds the Modules page again (the card shows the new answer).
local function answer(o, choice)
  ns.Settings("Coexist", CX.defaults).answered[o.addon] = choice
  ns.Options.RebuildPage("modules")
end

-- Offers the reload a module change or a reload row needs; says what changed.
local function offerReload(o, said)
  if o.keys and not o.reload then return end
  ns.OfferReload(said)
end

-- Turns the row's keys off and keeps which ones were on, so turning back on restores just those.
local function turnKeysOff(o)
  local on, settings = keysOn(o), ns.Settings(o.module)
  for _, key in ipairs(on) do settings[key] = false end
  ns.Settings("Coexist", CX.defaults).off[o.addon] = on
end

-- Turns Vanguard's part off for this profile and offers the reload it needs.
function CX.TurnOff(o)
  if o.keys then turnKeysOff(o) else ns.SetModuleEnabled(o.module, false) end
  answer(o, "off")
  offerReload(o, string.format("Turned off %s; %s does that now.", ownName(o), o.addon))
end

-- Turns back on the keys this card turned off (all the row's keys if it doesn't know which).
local function turnKeysOn(o)
  local settings = ns.Settings(o.module)
  for _, key in ipairs(keysToRestore(o)) do settings[key] = true end
  ns.Settings("Coexist", CX.defaults).off[o.addon] = nil
end

-- Turns Vanguard's part back on beside the other addon; the answer becomes "kept".
function CX.TurnBackOn(o)
  if o.keys then turnKeysOn(o) else ns.SetModuleEnabled(o.module, true) end
  answer(o, "kept")
  offerReload(o, string.format("Turned %s back on beside %s.", ownName(o), o.addon))
end

-- Keeps both running; the question doesn't come back.
function CX.Keep(o)
  answer(o, "kept")
end

-- The card's sentence for one overlap: what both do, or the answer given, then the row's extra sentence.
local function overlapText(o)
  local said = string.format("%s is loaded and also does %s.", o.addon, o.what)
  if o.answer == "off" then said = string.format("%s is loaded; you turned off %s.", o.addon, ownName(o)) end
  if o.answer == "kept" then said = said .. " You kept both." end
  return o.also and said .. " " .. o.also or said
end

-- One overlap's rows on the card: its sentence, then the choices its answer leaves.
local function overlapRows(o, rows)
  rows[#rows + 1] = { "text", overlapText(o) }
  if o.answer == "off" then
    rows[#rows + 1] = { "button", "Turn " .. targetName(o) .. " back on", function() CX.TurnBackOn(o) end }
    return
  end
  rows[#rows + 1] = { "button", "Turn off " .. targetName(o), function() CX.TurnOff(o) end }
  if not o.answer then rows[#rows + 1] = { "button", "Keep both", function() CX.Keep(o) end } end
end

-- The Modules page's "Other addons" card, first on the page; nothing when no loaded addon applies.
function CX.Rows()
  local shown, rows = collect(), {}
  if #shown == 0 then return rows end
  rows[1] = { "header", "Other addons" }
  for _, o in ipairs(shown) do overlapRows(o, rows) end
  return rows
end
ns.Options.AddRows("modules", CX.Rows, true)

-- Says each new overlap in chat, once per profile; the card has the choice.
function CX.Tell()
  local told = ns.Settings("Coexist", CX.defaults).told
  for _, o in ipairs(CX.Pending()) do
    if not told[o.addon] then
      told[o.addon] = true
      ns.Chat(string.format("%s also does %s. Choose which one does under /vg > Modules (nothing changes until you do).", o.addon, o.what))
    end
  end
end

-- Module entry point (Core/Modules.lua): every addon has loaded by PLAYER_LOGIN.
function CX.Enable(settings)
  CX.settings = settings
  CX.Tell()
end
