-- Crafting queue (off until you switch it on): a list of crafts you mean to make (kept for each
-- character), a tracker for profession cooldowns, and a ranking of the recipes that pay best, all
-- from the costs the Auction helper already works out (Modules/AuctionCrafting.lua).
--   * /vg craft add [n]   queues n crafts (1 by default) of the recipe on display in the profession window;
--   * /vg craft           lists the queue, with the reagents it still needs from your bags;
--   * /vg craft next      opens the first recipe in the profession window with its count typed in; you press Create;
--   * /vg craft stock     raises Keep stocked to what the queue needs and makes the Restock list (you buy);
--   * /vg craft cd        profession cooldowns of your characters, and when each is ready;
--   * /vg craft top       the recipes you know that pay best per craft and per hour, from the prices;
--   * /vg craft done|clear  takes the first craft off, or empties the queue.
-- Forever documents neither a recipe list nor a recipe cooldown call: where the client lacks them, the
-- recipes met (on display, queued, or with a cooldown noted) are read, and a cooldown is the recipe
-- spell's own (C_Spell). That part is unverified in the game.
-- Nothing is bought, posted or crafted for you: each step is prepared and the click stays yours. A
-- craft you finish (your own cast of the recipe's spell, out of combat) comes off the queue.

local ADDON, ns = ...
local L = ns.L

local AH = ns.GetModule("AuctionHelper")
local AP, CR = ns.AuctionPrices, AH.Crafting

local CQ = ns.Module("CraftQueue", { defaults = { on = false, secs = 6, chars = {} } })

-- The most recipes read for a ranking or a cooldown scan, and how many lines the ranking prints.
CQ.SCAN, CQ.TOP = 300, 5

-- This character's part of the saved data: its queue (entries { id, n, name }) and cooldowns (by recipe, { name, ready }).
function CQ.Mine()
  local key = ns.SettingsGuard.CharKey() or "?"
  CQ.settings.chars[key] = CQ.settings.chars[key] or { queue = {}, cooldowns = {} }
  return CQ.settings.chars[key]
end

-- Now in seconds (the clock a cooldown is kept in).
local function now()
  return ns.PlainNumber(time()) or 0
end

-- The recipes Vanguard knows of without the profession window's list: the one on display, the queue's, and those with a cooldown noted.
local function knownIDs()
  local mine, out, seen = CQ.Mine(), {}, {}
  -- Adds the recipe to the list once.
  local function add(id) if id and not seen[id] then seen[id], out[#out + 1] = true, id end end
  add(CR.recipe)
  for _, e in ipairs(mine.queue) do add(e.id) end
  for id in pairs(mine.cooldowns) do add(id) end
  return out
end

-- The profession window's recipe list call, or nil where the client lacks it (Forever documents none).
local function listCall()
  local get = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.GetAllRecipeIDs
  return type(get) == "function" and get or nil
end

-- The profession window's recipe IDs, as many as the scan reads. Where the client has no list call,
-- the recipes Vanguard has met (knownIDs) stand in.
local function recipeIDs()
  local get = listCall()
  local ids = get and get()
  return { unpack(type(ids) == "table" and ids or knownIDs(), 1, CQ.SCAN) }
end

-- The queue ----------------------------------------------------------------------------------

-- A queued recipe's name ("recipe 123" while the client hasn't it).
local function recipeName(e)
  return e.name or ns.Format(L["recipe {id}"], { id = e.id })
end

-- Queues n crafts of a recipe (joining the entry it has) and says so.
function CQ.Add(id, n, name)
  local queue = CQ.Mine().queue
  local entry
  for _, e in ipairs(queue) do if e.id == id then entry = e end end
  if not entry then entry = { id = id, n = 0, name = name } queue[#queue + 1] = entry end
  entry.n = entry.n + n
  ns.Chat(ns.Format(L["Queued: {count} x {recipe} ({queued} in the queue)."], { count = entry.n, recipe = recipeName(entry), queued = #queue }))
end

-- /vg craft add [n]: queues the recipe on display.
function CQ.AddShown(arg)
  local id, n = CR.recipe, math.max(1, math.floor(tonumber(arg) or 1))
  if not id or not CR.Form() or not CR.Form():IsVisible() then return ns.Chat(L["Open a recipe in the profession window first, then /vg craft add [number]."]) end
  local data = CR.Read(id)
  CQ.Add(id, n, data and data.name)
end

-- The reagents the queue needs, by item ID (a count each), with the recipes' names for a line of chat.
local function needs()
  local total = {}
  for _, e in ipairs(CQ.Mine().queue) do
    for _, r in ipairs((CR.Read(e.id) or { reagents = {} }).reagents) do total[r.id] = (total[r.id] or 0) + r.qty * e.n end
  end
  return total
end

-- The reagents still short of what the queue needs: { id, short } in item order.
function CQ.Short()
  local out = {}
  for id, qty in pairs(needs()) do
    local have = ns.PlainNumber(C_Item.GetItemCount(id, true)) or 0
    if have < qty then out[#out + 1] = { id = id, short = qty - have } end
  end
  table.sort(out, function(a, b) return a.id < b.id end)
  return out
end

-- /vg craft: the queue and what it is short of.
function CQ.List()
  local queue = CQ.Mine().queue
  if #queue == 0 then return ns.Chat(L["The craft queue is empty. Open a recipe in the profession window and /vg craft add."]) end
  for i, e in ipairs(queue) do ns.Chat(string.format("%d. %d x %s", i, e.n, recipeName(e))) end
  local short = {}
  local itemName = ns.GetModule("Errands").ItemName
  for _, s in ipairs(CQ.Short()) do short[#short + 1] = string.format("%s x%d", itemName(s.id), s.short) end
  ns.Chat(#short == 0 and L["You have every reagent."] or ns.Format(L["Short of: {reagents}."], { reagents = table.concat(short, ", ") }))
end

-- Takes one craft off the first entry (the whole entry when it is the last craft); says what is left.
function CQ.Done(id)
  local queue = CQ.Mine().queue
  local entry = queue[1]
  if not entry or (id and entry.id ~= id) then return end
  entry.n = entry.n - 1
  if entry.n <= 0 then table.remove(queue, 1) end
  ns.Chat(ns.Format(L["Crafted {recipe}. {count} left in the queue."], { recipe = entry.name or L["a recipe"], count = #queue }))
end

-- /vg craft next: the first recipe opened in the profession window with its count typed in.
function CQ.Next()
  local e = CQ.Mine().queue[1]
  if not e then return ns.Chat(L["The craft queue is empty."]) end
  local open = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.OpenRecipe
  if type(open) == "function" then open(e.id) end
  if CR.frame then CR.frame.crafts:SetText(tostring(e.n)) end
  ns.Chat(ns.Format(L["Next: {count} x {recipe}. Press Create in the profession window."], { count = e.n, recipe = recipeName(e) }))
end

-- /vg craft stock: Keep stocked raised to what the queue needs, then the Restock list (a shopping list of the
-- Auction helper's, so only while that is on, as /vg ah restock and Instance prep's Buy list check too).
function CQ.Stock()
  local ER = ns.GetModule("Errands")
  if not ER.settings then return ns.Chat(L["Keep stocked is part of Errands, which is off (/vg > Modules)."]) end
  local list = ER.StockList()
  for id, qty in pairs(needs()) do list[id] = math.max(list[id] or 0, qty) end
  ER.StockWindow.Refresh()
  ns.Chat(L["Keep stocked now covers the queue."])
  if not AH.settings then return ns.Chat(L["The auction helper is off (/vg > Modules)."]) end
  AH.Restock()
end

-- Cooldowns ----------------------------------------------------------------------------------

-- Seconds left on a recipe's spell cooldown (C_Spell, which Forever documents); 0 for none, the global cooldown, or values the client hides.
local function spellCooldownOf(id)
  local get = type(C_Spell) == "table" and C_Spell.GetSpellCooldown
  local info = type(get) == "function" and get(id)
  if type(info) ~= "table" or ns.IsSecret(info) or (not ns.IsSecret(info.isOnGCD) and info.isOnGCD == true) then return 0 end
  local start, length = ns.PlainNumber(info.startTime), ns.PlainNumber(info.duration)
  if not (start and length) or length <= 3 then return 0 end
  return math.max(0, start + length - GetTime())
end

-- A recipe's cooldown in seconds (0 for none or where the client can't say): the game's recipe cooldown where it has
-- one, else the cooldown of the recipe's spell.
local function cooldownOf(id)
  local get = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.GetRecipeCooldown
  if type(get) == "function" then return ns.PlainNumber((get(id))) or 0 end
  return spellCooldownOf(id)
end

-- Notes the recipe's cooldown for this character (cleared when it has none). The schematic's
-- isRecraft argument is not optional on Forever, so it is passed, as the crafting panel does.
local function noteCooldown(cooldowns, id)
  local left = cooldownOf(id)
  local s = C_TradeSkillUI.GetRecipeSchematic(id, false)
  cooldowns[id] = left > 0 and { name = type(s) == "table" and s.name or ns.Format(L["recipe {id}"], { id = id }), ready = now() + left } or nil
end

-- Reads the open profession's recipe cooldowns (out of combat, while the tracker is on).
function CQ.Scan()
  if not CQ.settings.on or ns.InCombat() then return end
  local cooldowns = CQ.Mine().cooldowns
  for _, id in ipairs(recipeIDs()) do noteCooldown(cooldowns, id) end
end

-- "ready", or how long is left, as "2h 5m", "3d 4h" or "<1m" (not "0m", which reads as ready).
local function remaining(seconds)
  if seconds <= 0 then return L["ready"] end
  if seconds < 60 then return L["<1m"] end
  local time = { days = math.floor(seconds / 86400), hours = math.floor(seconds % 86400 / 3600), minutes = math.floor(seconds % 3600 / 60) }
  if time.days > 0 then return ns.Format(L["{days}d {hours}h"], time) end
  return ns.Format(time.hours > 0 and L["{hours}h {minutes}m"] or L["{minutes}m"], time)
end

-- Orders cooldown rows by character, then by recipe name.
local function byCharThenName(a, b)
  if a.char ~= b.char then return a.char < b.char end
  return a.name < b.name
end

-- Every noted cooldown as { char, name, line }, sorted, because pairs order is undefined.
local function cooldownRows()
  local rows = {}
  for char, c in pairs(CQ.settings.chars) do
    for _, cd in pairs(c.cooldowns) do
      local line = string.format("%s: %s, %s", char, cd.name, remaining(cd.ready - now()))
      rows[#rows + 1] = { char = char, name = cd.name, line = line }
    end
  end
  table.sort(rows, byCharThenName)
  return rows
end

-- /vg craft cd: every character's noted cooldowns and when each is ready.
function CQ.Cooldowns()
  if not listCall() then CQ.Scan() end
  local rows = cooldownRows()
  for _, row in ipairs(rows) do ns.Chat(row.line) end
  if #rows == 0 then ns.Chat(L["No profession cooldowns noted yet. Open a profession that has one and select its recipe."]) end
end

-- Ranking ------------------------------------------------------------------------------------

-- The recipes with every price known, as { name, profit }, best profit first (the profit of one craft, before the house's cut).
function CQ.Ranked()
  local out = {}
  for _, id in ipairs(recipeIDs()) do
    local d = CR.Read(id)
    if d and d.worth and d.unpriced == 0 then out[#out + 1] = { name = d.name or ns.Format(L["recipe {id}"], { id = id }), profit = d.worth - d.cost } end
  end
  table.sort(out, function(a, b) return a.profit > b.profit end)
  return out
end

-- /vg craft top: the best few, per craft and per hour at the pace set (seconds per craft).
function CQ.Top()
  local ranked = CQ.Ranked()
  if #ranked == 0 then return ns.Chat(L["Nothing to rank: open a profession, and the recipes need prices (visit the auction house)."]) end
  for i = 1, math.min(CQ.TOP, #ranked) do
    local r = ranked[i]
    local values = { rank = i, recipe = r.name, profit = AP.Money(r.profit), hourly = AP.Money(math.floor(r.profit * 3600 / CQ.settings.secs)), secs = CQ.settings.secs }
    ns.Chat(ns.Format(L["{rank}. {recipe}: {profit} a craft, {hourly} an hour at {secs}s a craft"], values))
  end
end

-- The command ---------------------------------------------------------------------------------

-- The subcommands that need no argument.
local PLAIN = { next = "Next", stock = "Stock", cd = "Cooldowns", top = "Top", done = "Done" }

-- /vg craft [add [n]|next|stock|cd|top|done|clear].
function CQ.Command(rest)
  local word, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  if not CQ.settings or not CQ.settings.on then return ns.Chat(L["The craft queue is off (/vg > Town and gear > Craft queue)."]) end
  if word == "add" then return CQ.AddShown(arg) end
  if word == "clear" then CQ.Mine().queue = {} return ns.Chat(L["Craft queue emptied."]) end
  if PLAIN[word] then return CQ[PLAIN[word]]() end
  CQ.List()
end

-- A craft finished: your cast of the first queued recipe's spell, out of combat, comes off the queue.
function CQ.OnCast(_, unit, _, spellID)
  if not CQ.settings.on or unit ~= "player" or ns.InCombat() then return end
  local id = ns.PlainNumber(spellID)
  local first = CQ.Mine().queue[1]
  if id and first and first.id == id then CQ.Done(id) end
end

-- Module entry point (Core/Modules.lua): every part checks its switch as it runs.
function CQ.Enable(settings)
  CQ.settings = settings
  ns.OnUnit("UNIT_SPELLCAST_SUCCEEDED", ns.Guard("craft queue", CQ.OnCast), "player")
  ns.On("TRADE_SKILL_LIST_UPDATE", ns.Guard("craft cooldowns", CQ.Scan))
end
