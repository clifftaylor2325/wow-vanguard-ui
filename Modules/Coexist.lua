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

local L = ns.L

local CX = ns.Module("Coexist", { defaults = { answered = {}, told = {}, off = {} } })

-- Addon folder name -> { the Vanguard module it overlaps, what both do }, plus optional
-- keys (the module's settings to turn off instead of the whole module: a list, or the name
-- of a list on the module's table, read at click time), reload (those keys apply only after
-- a reload) and also (one more sentence for the card). One place for the list.
CX.OVERLAPS = {
  Bagnon = { "Bags", L["bags"] }, AdiBags = { "Bags", L["bags"] }, ArkInventory = { "Bags", L["bags"] },
  BetterBags = { "Bags", L["bags"] }, Baganator = { "Bags", L["bags"] }, Sorted = { "Bags", L["bags"] },
  Plater = { "Nameplates", L["nameplates"] }, Kui_Nameplates = { "Nameplates", L["nameplates"] },
  TidyPlates_ThreatPlates = { "Nameplates", L["nameplates"] }, Platynator = { "Nameplates", L["nameplates"] },
  Bartender4 = { "ActionBars", L["action bars"] }, Dominos = { "ActionBars", L["action bars"] },
  ShadowedUnitFrames = { "UnitFrames", L["unit frames"] }, PitBull4 = { "UnitFrames", L["unit frames"] },
  Grid2 = { "RaidFrames", L["raid frames"] }, VuhDo = { "RaidFrames", L["raid frames"] }, Cell = { "RaidFrames", L["raid frames"] },
  Clique = { "ClickCast", L["click casting"], also = L["Vanguard's unit and raid frames aren't signed up with Clique, so its click bindings don't work on them."] }, Quartz = { "CastBars", L["cast bars"] },
  EllesmereUIUnitFrames = { "UnitFrames", L["unit frames"] }, EllesmereUIActionBars = { "ActionBars", L["action bars"] },
  EllesmereUINameplates = { "Nameplates", L["nameplates"] }, EllesmereUIRaidFrames = { "RaidFrames", L["raid frames"] },
  SexyMap = { "Minimap", L["the minimap"] }, TipTac = { "Tooltips", L["tooltips"] },
  ["Prat-3.0"] = { "Chat", L["chat"] }, Chattynator = { "Chat", L["chat"] }, Glass = { "Chat", L["chat"] },
  ElvUI = { "ActionBars", L["action bars"] }, Tukui = { "ActionBars", L["action bars"] },
  Auctionator = { "AuctionHelper", L["auction house shopping and posting"] },
  TradeSkillMaster = { "AuctionHelper", L["auction house shopping and posting"] },
  -- Window skinners restyle popups, menus and tabs too, so every look group goes; durability and moving stay.
  Aurora = { "Windows", L["window looks"], keys = "GROUPS", reload = true },
  ForevermoreClassicUI = { "Windows", L["window looks"], keys = "GROUPS", reload = true },
  BlizzMove = { "Windows", L["window moving"], keys = { "movable" }, reload = true },
  MoveAny = { "Windows", L["window moving"], keys = { "movable" }, reload = true },
  MovableWindowsForever = { "Windows", L["window moving"], keys = { "movable" }, reload = true },
  -- The social group: friends, guild, chat channels, the raid tab, letters and the social toasts.
  BetterFriendlist = { "Windows", L["social window looks"], keys = { "social" }, reload = true },
}

ns.Options.MODULE_INFO.Coexist = { L["Other addons"], L["At login, notices addons that do a job a Vanguard module also does, and offers to turn that part of Vanguard off."] }

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

-- The keys of `keys` whose value in the row's module passes `test`; none without keys,
-- so a row naming a missing module reads no settings.
local function keysWhere(o, keys, test)
  local found = {}
  if #keys == 0 then return found end
  local settings = ns.Settings(o.module)
  for _, key in ipairs(keys) do
    if test(settings[key]) then found[#found + 1] = key end
  end
  return found
end

-- A setting is on unless the profile has it false.
local function isOn(value) return value ~= false end

-- A setting is off when the profile has it false.
local function isOff(value) return value == false end

-- The keys of `keys` that are on in the row's module.
local function keysOn(o, keys) return keysWhere(o, keys, isOn) end

-- The keys of `keys` that are off in the row's module.
local function keysOff(o, keys) return keysWhere(o, keys, isOff) end

-- Whether Vanguard still does what the row names: its module is on, and with keys, at least one of them.
local function doing(o)
  if not ns.ModuleEnabled(o.module) then return false end
  return o.keys == nil or #keysOn(o, keysOf(o)) > 0
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
  return ns.ModuleEnabled(o.module) and #keysOff(o, keysToRestore(o)) > 0
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

-- The loaded addons that do a module's job, whatever the card's answer, as { addon, what } sorted by addon name (other
-- modules ask: the click-casting presets step aside for another addon's raid frames or click casting).
function CX.Overlaps(module)
  local out = {}
  for addon, row in pairs(CX.OVERLAPS) do
    if row[1] == module and loaded(addon) then out[#out + 1] = { addon = addon, what = row[2] } end
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
  if o.keys then return ns.Format(L["Vanguard's {part}"], { part = o.what }) end
  return moduleName(o.module)
end

-- The target as the sentences say it, always with "Vanguard's".
local function ownName(o)
  if o.keys then return targetName(o) end
  return ns.Format(L["Vanguard's {part}"], { part = moduleName(o.module) })
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
  local on, settings = keysOn(o, keysOf(o)), ns.Settings(o.module)
  for _, key in ipairs(on) do settings[key] = false end
  ns.Settings("Coexist", CX.defaults).off[o.addon] = on
end

-- Turns Vanguard's part off for this profile and offers the reload it needs.
function CX.TurnOff(o)
  if o.keys then turnKeysOff(o) else ns.SetModuleEnabled(o.module, false) end
  answer(o, "off")
  offerReload(o, ns.Format(L["Turned off {part}; {addon} does that now."], { part = ownName(o), addon = o.addon }))
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
  offerReload(o, ns.Format(L["Turned {part} back on beside {addon}."], { part = ownName(o), addon = o.addon }))
end

-- Keeps both running; the question doesn't come back.
function CX.Keep(o)
  answer(o, "kept")
end

-- The card's sentence for one overlap: what both do, or the answer given, then the row's extra sentence.
local function overlapText(o)
  local said = ns.Format(L["{addon} is loaded and also does {what}."], { addon = o.addon, what = o.what })
  if o.answer == "off" then said = ns.Format(L["{addon} is loaded; you turned off {part}."], { addon = o.addon, part = ownName(o) }) end
  if o.answer == "kept" then said = ns.Format(L["{addon} is loaded and also does {what}. You kept both."], { addon = o.addon, what = o.what }) end
  return o.also and said .. " " .. o.also or said
end

-- One overlap's rows on the card: its sentence, then the choices its answer leaves.
local function overlapRows(o, rows)
  rows[#rows + 1] = { "text", overlapText(o) }
  if o.answer == "off" then
    rows[#rows + 1] = { "button", ns.Format(L["Turn {part} back on"], { part = targetName(o) }), function() CX.TurnBackOn(o) end }
    return
  end
  rows[#rows + 1] = { "button", ns.Format(L["Turn off {part}"], { part = targetName(o) }), function() CX.TurnOff(o) end }
  if not o.answer then rows[#rows + 1] = { "button", L["Keep both"], function() CX.Keep(o) end } end
end

-- The Modules page's "Other addons" card, first on the page; nothing when no loaded addon applies.
function CX.Rows()
  local shown, rows = collect(), {}
  if #shown == 0 then return rows end
  rows[1] = { "header", L["Other addons"] }
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
      ns.Chat(ns.Format(L["{addon} also does {what}. Choose which one does under /vg > Modules (nothing changes until you do)."], { addon = o.addon, what = o.what }))
    end
  end
end

-- Module entry point (Core/Modules.lua): every addon has loaded by PLAYER_LOGIN.
function CX.Enable(settings)
  CX.settings = settings
  CX.Tell()
end
