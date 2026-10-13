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
-- Nothing is bought, posted or crafted for you: each step is prepared and the click stays yours. A
-- craft you finish (your own cast of the recipe's spell, out of combat) comes off the queue.

local ADDON, ns = ...

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

-- The profession window's recipe IDs, as many as the scan reads (none where the client lacks the call).
local function recipeIDs()
  local get = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.GetAllRecipeIDs
  local ids = type(get) == "function" and get() or {}
  return { unpack(ids, 1, CQ.SCAN) }
end

-- The queue ----------------------------------------------------------------------------------

-- Queues n crafts of a recipe (joining the entry it has) and says so.
function CQ.Add(id, n, name)
  local queue = CQ.Mine().queue
  local entry
  for _, e in ipairs(queue) do if e.id == id then entry = e end end
  if not entry then entry = { id = id, n = 0, name = name } queue[#queue + 1] = entry end
  entry.n = entry.n + n
  ns.Chat(string.format("Queued: %d x %s (%d in the queue).", entry.n, entry.name or "recipe " .. id, #queue))
end

-- /vg craft add [n]: queues the recipe on display.
function CQ.AddShown(arg)
  local id, n = CR.recipe, math.max(1, math.floor(tonumber(arg) or 1))
  if not id or not CR.Form() or not CR.Form():IsVisible() then return ns.Chat("Open a recipe in the profession window first, then /vg craft add [number].") end
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

-- An item's name as the client has it (else "item 123").
local function itemName(id)
  return (C_Item.GetItemInfo(id)) or ("item " .. id)
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
  if #queue == 0 then return ns.Chat("The craft queue is empty. Open a recipe in the profession window and /vg craft add.") end
  for i, e in ipairs(queue) do ns.Chat(string.format("%d. %d x %s", i, e.n, e.name or "recipe " .. e.id)) end
  local short = {}
  for _, s in ipairs(CQ.Short()) do short[#short + 1] = string.format("%s x%d", itemName(s.id), s.short) end
  ns.Chat(#short == 0 and "You have every reagent." or ("Short of: " .. table.concat(short, ", ") .. "."))
end

-- Takes one craft off the first entry (the whole entry when it is the last craft); says what is left.
function CQ.Done(id)
  local queue = CQ.Mine().queue
  local entry = queue[1]
  if not entry or (id and entry.id ~= id) then return end
  entry.n = entry.n - 1
  if entry.n <= 0 then table.remove(queue, 1) end
  ns.Chat(string.format("Crafted %s. %d left in the queue.", entry.name or "a recipe", #queue))
end

-- /vg craft next: the first recipe opened in the profession window with its count typed in.
function CQ.Next()
  local e = CQ.Mine().queue[1]
  if not e then return ns.Chat("The craft queue is empty.") end
  local open = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.OpenRecipe
  if type(open) == "function" then open(e.id) end
  if CR.frame then CR.frame.crafts:SetText(tostring(e.n)) end
  ns.Chat(string.format("Next: %d x %s. Press Create in the profession window.", e.n, e.name or "recipe " .. e.id))
end

-- /vg craft stock: Keep stocked raised to what the queue needs, then the Restock list.
function CQ.Stock()
  local ER = ns.GetModule("Errands")
  if not ER.settings then return ns.Chat("Keep stocked is part of Errands, which is off (/vg > Modules).") end
  for id, qty in pairs(needs()) do ER.settings.stockList[id] = math.max(ER.settings.stockList[id] or 0, qty) end
  ns.Chat("Keep stocked now covers the queue.")
  AH.Restock()
end

-- Cooldowns ----------------------------------------------------------------------------------

-- A recipe's cooldown in seconds (0 for none or where the client can't say), from the game's recipe cooldown.
local function cooldownOf(id)
  local get = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.GetRecipeCooldown
  return type(get) == "function" and ns.PlainNumber((get(id))) or 0
end

-- Notes the recipe's cooldown for this character (cleared when it has none).
local function noteCooldown(cooldowns, id)
  local left = cooldownOf(id)
  local s = C_TradeSkillUI.GetRecipeSchematic(id)
  cooldowns[id] = left > 0 and { name = type(s) == "table" and s.name or ("recipe " .. id), ready = now() + left } or nil
end

-- Reads the open profession's recipe cooldowns (out of combat, while the tracker is on).
function CQ.Scan()
  if not CQ.settings.on or ns.InCombat() then return end
  local cooldowns = CQ.Mine().cooldowns
  for _, id in ipairs(recipeIDs()) do noteCooldown(cooldowns, id) end
end

-- "ready", or how long is left, as "2h 5m" or "3d 4h".
local function remaining(seconds)
  if seconds <= 0 then return "ready" end
  local d, h, m = math.floor(seconds / 86400), math.floor(seconds % 86400 / 3600), math.floor(seconds % 3600 / 60)
  if d > 0 then return string.format("%dd %dh", d, h) end
  return h > 0 and string.format("%dh %dm", h, m) or string.format("%dm", m)
end

-- /vg craft cd: every character's noted cooldowns and when each is ready.
function CQ.Cooldowns()
  local any = false
  for char, c in pairs(CQ.settings.chars) do
    for _, cd in pairs(c.cooldowns) do
      any = true
      ns.Chat(string.format("%s: %s, %s", char, cd.name, remaining(cd.ready - now())))
    end
  end
  if not any then ns.Chat("No profession cooldowns noted yet. Open a profession that has one.") end
end

-- Ranking ------------------------------------------------------------------------------------

-- The recipes with every price known, as { name, profit }, best profit first (the profit of one craft, before the house's cut).
function CQ.Ranked()
  local out = {}
  for _, id in ipairs(recipeIDs()) do
    local d = CR.Read(id)
    if d and d.worth and d.unpriced == 0 then out[#out + 1] = { name = d.name or ("recipe " .. id), profit = d.worth - d.cost } end
  end
  table.sort(out, function(a, b) return a.profit > b.profit end)
  return out
end

-- /vg craft top: the best few, per craft and per hour at the pace set (seconds per craft).
function CQ.Top()
  local ranked = CQ.Ranked()
  if #ranked == 0 then return ns.Chat("Nothing to rank: open a profession, and the recipes need prices (visit the auction house).") end
  for i = 1, math.min(CQ.TOP, #ranked) do
    local r = ranked[i]
    ns.Chat(string.format("%d. %s: %s a craft, %s an hour at %ds a craft", i, r.name, AP.Money(r.profit), AP.Money(math.floor(r.profit * 3600 / CQ.settings.secs)), CQ.settings.secs))
  end
end

-- The command ---------------------------------------------------------------------------------

-- The subcommands that need no argument.
local PLAIN = { next = "Next", stock = "Stock", cd = "Cooldowns", top = "Top", done = "Done" }

-- /vg craft [add [n]|next|stock|cd|top|done|clear].
function CQ.Command(rest)
  local word, arg = (rest or ""):match("^(%S*)%s*(.-)$")
  if not CQ.settings or not CQ.settings.on then return ns.Chat("The craft queue is off (/vg > Town and gear > Craft queue).") end
  if word == "add" then return CQ.AddShown(arg) end
  if word == "clear" then CQ.Mine().queue = {} return ns.Chat("Craft queue emptied.") end
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
