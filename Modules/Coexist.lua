-- Coexistence: other addons that do a job a Vanguard module also does (a bag
-- addon beside Vanguard's bags, a nameplate addon beside its plates). At login
-- Vanguard looks for the loaded ones in CX.OVERLAPS; for each new overlap it
-- says so once in chat, and the Modules page of /vg shows a card that offers to
-- turn Vanguard's module off or keep both. Nothing changes without a click, and
-- an answer is kept in the profile, so the card doesn't come back.
-- The addon names are the folder names other addons use on other clients; each
-- still needs checking on the WoW Forever client (ElvUI, Tukui, Auctionator and
-- TradeSkillMaster, added last, are as unchecked as the rest). An addon names one
-- module, so the whole-UI addons ElvUI and Tukui ask about action bars only.

local ADDON, ns = ...

local CX = ns.Module("Coexist", { defaults = { answered = {}, told = {} } })

-- Addon folder name -> { the Vanguard module it overlaps, what both do }. One place for the list.
CX.OVERLAPS = {
  Bagnon = { "Bags", "bags" }, AdiBags = { "Bags", "bags" }, ArkInventory = { "Bags", "bags" },
  BetterBags = { "Bags", "bags" }, Baganator = { "Bags", "bags" },
  Plater = { "Nameplates", "nameplates" }, Kui_Nameplates = { "Nameplates", "nameplates" },
  TidyPlates_ThreatPlates = { "Nameplates", "nameplates" },
  Bartender4 = { "ActionBars", "action bars" }, Dominos = { "ActionBars", "action bars" },
  ShadowedUnitFrames = { "UnitFrames", "unit frames" }, PitBull4 = { "UnitFrames", "unit frames" },
  Grid2 = { "RaidFrames", "raid frames" }, VuhDo = { "RaidFrames", "raid frames" }, Cell = { "RaidFrames", "raid frames" },
  Clique = { "ClickCast", "click casting" }, Quartz = { "CastBars", "cast bars" },
  SexyMap = { "Minimap", "the minimap" }, ["Prat-3.0"] = { "Chat", "chat" }, TipTac = { "Tooltips", "tooltips" },
  ElvUI = { "ActionBars", "action bars" }, Tukui = { "ActionBars", "action bars" },
  Auctionator = { "AuctionHelper", "auction house shopping and posting" },
  TradeSkillMaster = { "AuctionHelper", "auction house shopping and posting" },
}

ns.Options.MODULE_INFO.Coexist = { "Other addons", "At login, notices addons that do a job a Vanguard module also does, and offers to turn that module off." }

-- Whether the client says the addon is loaded (a client without the call: no).
local function loaded(name)
  local fn = C_AddOns and C_AddOns.IsAddOnLoaded
  return type(fn) == "function" and fn(name) == true
end

-- The overlaps to ask about: loaded addons whose Vanguard module is on and not yet answered,
-- as { addon, module, what }, sorted by addon name.
function CX.Pending()
  local out, answered = {}, ns.Settings("Coexist", CX.defaults).answered
  for addon, o in pairs(CX.OVERLAPS) do
    if not answered[addon] and ns.ModuleEnabled(o[1]) and loaded(addon) then out[#out + 1] = { addon = addon, module = o[1], what = o[2] } end
  end
  table.sort(out, function(a, b) return a.addon < b.addon end)
  return out
end

-- The module's shown name (the Modules page's), or its own name.
local function moduleName(module)
  local info = ns.Options.MODULE_INFO[module]
  return info and info[1] or module
end

-- Records the answer and builds the Modules page again (the card loses that row).
local function answer(o, choice)
  ns.Settings("Coexist", CX.defaults).answered[o.addon] = choice
  ns.Options.RebuildPage("modules")
end

-- Turns Vanguard's module off for this profile and offers the reload it needs.
function CX.TurnOff(o)
  ns.SetModuleEnabled(o.module, false)
  answer(o, "off")
  ns.OfferReload(string.format("Vanguard's %s is off; %s keeps them.", moduleName(o.module), o.addon))
end

-- Keeps both running; the question doesn't come back.
function CX.Keep(o)
  answer(o, "kept")
end

-- One overlap's rows on the card: what both do, then the two choices.
local function overlapRows(o, rows)
  rows[#rows + 1] = { "text", string.format("%s is loaded and also does %s.", o.addon, o.what) }
  rows[#rows + 1] = { "button", "Turn off " .. moduleName(o.module), function() CX.TurnOff(o) end }
  rows[#rows + 1] = { "button", "Keep both", function() CX.Keep(o) end }
end

-- The Modules page's "Other addons" card, first on the page; nothing when nothing is pending.
function CX.Rows()
  local pending, rows = CX.Pending(), {}
  if #pending == 0 then return rows end
  rows[1] = { "header", "Other addons" }
  for _, o in ipairs(pending) do overlapRows(o, rows) end
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
