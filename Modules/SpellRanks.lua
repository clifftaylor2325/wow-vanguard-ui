-- Spell ranks, two helpers that start off:
--   * Bar notice: when a button on your bars holds an older rank of a spell you
--     have a higher rank of, chat says so once, out of combat. /vg ranks lists
--     the buttons and what each would become (nothing changes); /vg ranks swap
--     puts the newest rank there, out of combat only.
--   * Trainer memory: what each trainer you visit teaches and at what level,
--     remembered per class for the whole account, read only from what the
--     trainer's window shows. /vg trainers next lists what comes in the next
--     few levels and where to learn it; a level-up says the same.
-- No rank or level numbers are shipped; everything comes from your spellbook
-- and the trainers you opened. Nothing is read or changed in combat, and a
-- name, rank or level the client hides is skipped.

local ADDON, ns = ...

local SR = ns.Module("SpellRanks", { defaults = { barNotice = false, trainerMemory = false } })

-- Action slots scanned (12 on each of 15 pages: bar 1's pages and bonus bars, bars 2 to 5, and bars 6 to 8 up
-- to 180); services kept per class; levels ahead /vg trainers next and a level-up show; lines listed.
SR.SLOTS, SR.MAX_SERVICES, SR.AHEAD, SR.LINES = 180, 400, 5, 8

-- Helpers ------------------------------------------------------------------------------------

-- The settings in use (the defaults while the module is off).
local function settings()
  return SR.settings or SR.defaults
end

-- Bar notice ---------------------------------------------------------------------------------

-- Every catalog spell by the ID of each of its ranks: { [spellID] = spell } (ClickCastSpells folds the spellbook).
local function byID()
  local out = {}
  for _, s in ipairs(ns.ClickCastSpells.Catalog().spells) do
    for _, r in ipairs(s.ranks) do out[r.spellID] = { spell = s, rank = r.rank } end
  end
  return out
end

-- The buttons holding an older rank than the spellbook has, as { slot, name, from, to, old, new } (from and to are spell IDs).
function SR.Stale()
  local known, out = byID(), {}
  for slot = 1, SR.SLOTS do
    local kind, id = ns.Client.Call("GetActionInfo", slot)
    local have = kind == "spell" and known[ns.PlainNumber(id) or 0]
    if have and have.rank < have.spell.maxRank then
      out[#out + 1] = { slot = slot, name = have.spell.name, from = id, to = have.spell.spellID, old = have.rank, new = have.spell.maxRank }
    end
  end
  return out
end

-- Where a slot is, by the Vanguard bar button that shows it now ("Bar 2 button 5"), else "Action slot 14"
-- (a page bar 1 isn't on, a bar that is off, or Vanguard's bars off).
local function slotLabel(slot)
  for _, b in ipairs(ns.GetModule("ActionBars").buttons) do
    if b.action == slot then return string.format("Bar %d button %d", b.vgBar.vgIndex, b:GetAttribute("index")) end
  end
  return string.format("Action slot %d", slot)
end

-- "Bar 2 button 5: Frostbolt Rank 2 -> Rank 4".
function SR.Describe(s)
  return string.format("%s: %s Rank %d -> Rank %d", slotLabel(s.slot), s.name, s.old, s.new)
end

-- Picks the spell up onto the cursor; whether the cursor holds a spell now.
local function pickup(spellID)
  local api = type(C_Spell) == "table" and C_Spell.PickupSpell
  if type(api) == "function" then api(spellID) else ns.Client.Call("PickupSpell", spellID) end
  return ns.Client.Call("GetCursorInfo") == "spell"
end

-- Puts spellID on a button, leaving the cursor empty; whether it worked. Never with something already on the cursor.
local function place(slot, spellID)
  if ns.Client.Call("GetCursorInfo") then return false end
  local ok = pickup(spellID)
  if ok then ns.Client.Call("PlaceAction", slot) end
  ns.Client.Call("ClearCursor")
  return ok
end

-- /vg ranks swap: every older rank on the bars becomes the newest, out of combat.
function SR.Swap()
  if ns.InCombat() then return ns.Chat("Bars can't change in combat. Try again after the fight.") end
  local done = 0
  for _, s in ipairs(SR.Stale()) do
    if place(s.slot, s.to) then done = done + 1 end
  end
  ns.Chat(done > 0 and string.format("Put the newest rank on %d button(s).", done) or "No button changed.")
end

-- /vg ranks: the buttons with an older rank and what each would become; nothing changes.
function SR.List()
  local stale = SR.Stale()
  if #stale == 0 then return ns.Chat("Every spell on your bars is at your newest rank.") end
  for _, s in ipairs(stale) do ns.Chat(SR.Describe(s)) end
  ns.Chat("/vg ranks swap puts the newest rank on each (out of combat).")
end

-- Says once (until the list changes) that buttons hold older ranks.
function SR.Notice()
  local stale = SR.Stale()
  local key = #stale > 0 and table.concat({ #stale, stale[1].slot, stale[1].to }, ":") or nil
  local same = key == SR.noticed
  SR.noticed = key
  if not key or same then return end
  ns.Chat(string.format("%d button(s) on your bars hold an older spell rank. /vg ranks lists them, /vg ranks swap fixes them.", #stale))
end

-- Trainer memory -----------------------------------------------------------------------------

-- The account-wide store: VanguardDB.trainers = { [class token] = { count = n, list = { [name .. rank] = service } } }.
function SR.Store()
  VanguardDB.trainers = type(VanguardDB.trainers) == "table" and VanguardDB.trainers or {}
  return VanguardDB.trainers
end

-- The player's class token ("MAGE"), or nil when the client can't say.
local function classToken()
  return ns.ClickCastSpells.PlayerClass()
end

-- A trainer service's rank text ("Rank 3"): the client puts it among the later returns, by client.
local function rankText(i)
  local info = { ns.Client.Call("GetTrainerServiceInfo", i) }
  for k = 2, 6 do
    local v = ns.PlainText(info[k])
    if v and v:match("^Rank %d+") then return v end
  end
end

-- Where the trainer is: its name, zone and subzone (nil for any the client hides; the subzone drops when it is the zone).
local function whereNow()
  local zone, sub = ns.PlainText(ns.Client.Call("GetZoneText")), ns.PlainText(ns.Client.Call("GetSubZoneText"))
  return ns.PlainText(ns.Client.Call("UnitName", "npc")), zone, sub ~= zone and sub or nil
end

-- Service i as a record { name, rank, level, cost, trainer, zone, sub, t }, or nil (hidden name, already learned, no level to learn it at).
local function service(i, where)
  local name, kind = ns.Client.Call("GetTrainerServiceInfo", i)
  local level = ns.PlainNumber(ns.Client.Call("GetTrainerServiceLevelReq", i))
  if not ns.PlainText(name) or kind == "used" or not level or level < 1 then return nil end
  return { name = name, rank = rankText(i), level = level, cost = ns.PlainNumber(ns.Client.Call("GetTrainerServiceCost", i)) or 0,
    trainer = where[1], zone = where[2], sub = where[3], t = ns.PlainNumber(ns.Client.Call("time")) or 0 }
end

-- Keeps a service for this class (a new one only below the cap).
function SR.Remember(token, s)
  local store = SR.Store()
  local c = store[token] or { count = 0, list = {} }
  store[token] = c
  local key = s.name .. "\1" .. (s.rank or "")
  if c.list[key] == nil then
    if c.count >= SR.MAX_SERVICES then return end
    c.count = c.count + 1
  end
  c.list[key] = s
end

-- The open trainer's services, remembered (not in combat; only when the class and the trainer's name can be read).
function SR.Record()
  local token = classToken()
  if not settings().trainerMemory or ns.InCombat() or not token then return end
  local where = { whereNow() }
  if not where[1] then return end
  for i = 1, ns.PlainNumber(ns.Client.Call("GetNumTrainerServices")) or 0 do
    local s = service(i, where)
    if s then SR.Remember(token, s) end
  end
end

-- Sort order: lowest level first, then by name.
local function byLevel(a, b)
  if a.level ~= b.level then return a.level < b.level end
  return a.name < b.name
end

-- The remembered services for levels above fromLevel up to fromLevel + SR.AHEAD, lowest level first.
function SR.Upcoming(fromLevel)
  local c, out = SR.Store()[classToken() or ""], {}
  for _, s in pairs(c and c.list or {}) do
    if s.level > fromLevel and s.level <= fromLevel + SR.AHEAD then out[#out + 1] = s end
  end
  table.sort(out, byLevel)
  return out
end

-- "Level 12: Frostbolt Rank 3 (Archmage Vargoth, Stormwind City)".
function SR.Text(s)
  local place = ns.PlaceText(s.zone, s.sub)
  local from = ""
  if s.trainer and place then
    from = string.format(" (%s, %s)", s.trainer, place)
  elseif s.trainer then
    from = string.format(" (%s)", s.trainer)
  end
  return string.format("Level %d: %s%s%s", s.level, s.name, s.rank and (" " .. s.rank) or "", from)
end

-- Says the upcoming services after fromLevel, up to SR.LINES of them; header first.
local function sayUpcoming(fromLevel, header)
  local list = SR.Upcoming(fromLevel)
  if #list == 0 then return false end
  ns.Chat(header)
  for i = 1, math.min(#list, SR.LINES) do ns.Chat(SR.Text(list[i])) end
  return true
end

-- A level-up: what the trainers you've visited teach in the next few levels.
local function onLevelUp(_, level)
  if settings().trainerMemory and ns.PlainNumber(level) then
    sayUpcoming(ns.PlainNumber(level) - 1, "Trainers you've visited teach, from this level:")
  end
end

-- Commands -----------------------------------------------------------------------------------

-- How many services are remembered for this class.
local function remembered()
  local c = SR.Store()[classToken() or ""]
  return c and c.count or 0
end

-- /vg trainers [next|clear]: what's remembered, what the next levels bring, or forget it all.
function SR.TrainersCommand(rest)
  if rest == "clear" then VanguardDB.trainers = nil return ns.Chat("Forgot every trainer.") end
  if rest == "next" then
    local level = ns.PlainNumber(ns.Client.Call("UnitLevel", "player")) or 1
    return sayUpcoming(level, "Trainers you've visited teach, in the next levels:") or ns.Chat("Nothing remembered for the next levels. Visit your trainer with Trainer memory on (/vg > Town and gear).")
  end
  ns.Chat(string.format("%d trainer service(s) remembered for your class. /vg trainers next lists the next levels; clear forgets them.", remembered()))
end

-- /vg ranks [swap]: the older ranks on your bars, or put the newest on them.
function SR.RanksCommand(rest)
  if rest == "swap" then return SR.Swap() end
  SR.List()
end

-- The spellbook, level, world or a bar button changed: look at the bars once the burst of events is over, out of combat.
local function onSpells()
  ns.Soon("spellranks", function() ns.OutOfCombat(function() if settings().barNotice then SR.Notice() end end, "spellranks") end)
end

-- A trainer opened or its list changed: remember it once the burst of events is over.
local function onTrainer()
  ns.Soon("spellranks trainer", SR.Record)
end

-- Module entry point (Core/Modules.lua).
function SR.Enable(settingsTable)
  SR.settings = settingsTable
  SR.Store()
  for _, event in ipairs({ "SPELLS_CHANGED", "LEARNED_SPELL_IN_SKILL_LINE", "PLAYER_LEVEL_UP", "PLAYER_ENTERING_WORLD", "ACTIONBAR_SLOT_CHANGED" }) do ns.On(event, onSpells) end
  ns.On("TRAINER_SHOW", onTrainer)
  ns.On("TRAINER_UPDATE", onTrainer)
  ns.On("PLAYER_LEVEL_UP", onLevelUp)
end
