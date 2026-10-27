-- Where this character's shared data lives. Vanguard keeps auction prices, the sales ledger and
-- other characters' items per "home": your realm, the ruleset when the client names one, and your
-- side, as "Realm-Faction" or "Realm-ruleset-Faction". On WoW Forever rulesets take the place of
-- realms, so the ruleset joins the key wherever the client says which one you're on; data kept
-- under an older key moves to the new one once (Adopt). /vg realm prints what the client says.
-- Read it inside functions only: FactionArt loads later in the TOC.

local ADDON, ns = ...
local L = ns.L

local H = {}
ns.Home = H

-- A string or number the client shows plainly, as a string; nil when hidden, empty or neither.
local function plain(v)
  if ns.IsSecret(v) then return nil end
  if type(v) == "number" then return tostring(v) end
  if type(v) == "string" and v ~= "" then return v end
end

-- The first answer of _G[space][fn](...) when the client has it; nil when not, or on an error.
local function ask(space, fn, ...)
  local t = _G[space]
  if type(t) ~= "table" or type(t[fn]) ~= "function" then return nil end
  local ok, v = pcall(t[fn], ...)
  if ok and not ns.IsSecret(v) then return v end
end

-- The first answer of the global function `name` as plain text, else nil.
local function call(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  local ok, v = pcall(fn, ...)
  return ok and plain(v) or nil
end

-- Your realm's name as the client shows it ("Forever Test"), else "?".
function H.RealmName()
  return call("GetRealmName") or "?"
end

-- Your realm's normalized name (no spaces or hyphens, as in "Name-Realm"), else its shown name.
function H.Realm()
  return call("GetNormalizedRealmName") or H.RealmName()
end

-- The ruleset the client names, else nil: "season<N>" while a season is on (C_Seasons), else
-- "hardcore" on Hardcore rules (C_GameRules). Forever documents C_GameRules but has no C_Seasons, which
-- is asked only where a client has it. The Classic or Modern preset is shown by /vg realm, not part of the
-- key: a key that gains a part orphans the data kept under the old one, so it waits on a probe paste.
function H.Ruleset()
  if ask("C_Seasons", "HasActiveSeason") == true then
    local id = plain(ask("C_Seasons", "GetActiveSeason"))
    if id then return "season" .. id end
  end
  if ask("C_GameRules", "IsHardcoreActive") == true then return "hardcore" end
end

-- Your side: "Alliance", "Horde" or "none".
function H.Side()
  return ns.FactionArt.Faction()
end

-- This home's key: "Realm-Faction", or "Realm-ruleset-Faction" when the client names a ruleset.
function H.Key()
  local ruleset = H.Ruleset()
  H.last = H.Realm() .. "-" .. (ruleset and (ruleset .. "-") or "") .. H.Side()
  return H.last
end

-- The game's rules changed (GAME_RULES_CHANGED): says so once when that moves the data key.
-- Every reader asks for the key as it needs it, so they follow without a reload.
function H.OnRules()
  local before = H.last
  local now = H.Key()
  if before and before ~= now then ns.Chat(ns.Format(L["The game's rules changed: Vanguard now keeps prices and characters under {key}."], { key = now })) end
end
-- Only WoW Forever has GAME_RULES_CHANGED (its GameRules docs; Retail's lack it), and ns.On reports an event
-- the client lacks as an error, so Retail skips it: its only ruleset read that moves the key is Forever's too.
if ns.IsForever() then ns.On("GAME_RULES_CHANGED", ns.Guard("game rules", H.OnRules)) end

-- The keys older versions used for this home: "Realm-Faction" (prices and the sales ledger) and
-- "Realm Name - Faction" with the faction as the client gives it (other characters' items).
function H.OldKeys()
  local raw = call("UnitFactionGroup", "player") or "?"
  return { H.Realm() .. "-" .. H.Side(), H.RealmName() .. " - " .. raw }
end

-- This home's key in a store kept by home. Once, while the store has nothing under it, an entry
-- under an older key (H.OldKeys) moves to it, so data from before the ruleset joined follows.
function H.Adopt(store)
  local key = H.Key()
  for _, old in ipairs(store[key] == nil and H.OldKeys() or {}) do
    if old ~= key and store[old] ~= nil and store[key] == nil then
      store[key], store[old] = store[old], nil
    end
  end
  return key
end

-- The realm your own name carries (UnitFullName's second answer), else nil. On the Forever beta
-- (probe, 2026-10-19) it differs from the realm's own name: "Hearthvale" on "ClassicBetaPvE2".
function H.NameRealm()
  local fn = _G.UnitFullName
  if type(fn) ~= "function" then return nil end
  local ok, _, realm = pcall(fn, "player")
  return ok and plain(realm) or nil
end

-- Whether a "-Realm" ending is yours: the realm in names, or the one your own name carries.
local function isMyRealm(realm)
  return realm == H.Realm() or realm == H.NameRealm()
end

-- A player's name to show: "Name" for someone on your realm, else as the client gave it
-- ("Name-Realm"). Whispers and comparisons keep the full name.
function H.Display(name)
  local base, realm = name:match("^([^%-]+)%-(.+)$")
  if base and isMyRealm(realm) then return base end
  return name
end

-- True when a sender's name ("Name" or "Name-Realm") is you: your name, alone or with your realm.
function H.IsMe(sender)
  local me = call("UnitName", "player")
  if me == nil or type(sender) ~= "string" or ns.IsSecret(sender) then return false end
  local base, realm = sender:match("^([^%-]+)%-(.+)$")
  return sender == me or (base == me and isMyRealm(realm))
end

-- The name of an Enum[space] value ("Classic" for the preset 0), its number as text when the enum lacks it; nil when the answer is hidden or missing.
local function enumName(space, value)
  local n = ns.PlainNumber(value)
  for key, v in pairs(n and type(_G.Enum) == "table" and type(_G.Enum[space]) == "table" and _G.Enum[space] or {}) do
    if v == n then return key end
  end
  return n and tostring(n) or nil
end

-- "allowed" or "not allowed" for a plain yes or no, else nil.
local function allowed(v)
  if type(v) == "boolean" then return v and "allowed" or "not allowed" end
end

-- The rules the client names, as "preset Classic · self-found allowed · game mode 3"; nil when it names none.
function H.Rules()
  local parts = {}
  -- Adds "label value" to the parts when there is a value.
  local function add(label, value) if value then parts[#parts + 1] = label .. " " .. value end end
  add("preset", enumName("ForeverExperiencePreset", ask("C_GameRules", "GetForeverExperiencePreset")))
  add("self-found", allowed(ask("C_GameRules", "IsSelfFoundAllowed")))
  add("game mode", plain(ask("C_GameRules", "GetCurrentGameModeRecordID")))
  return #parts > 0 and table.concat(parts, "  ·  ") or nil
end

-- /vg realm: what the client says about where you are, and the key Vanguard keeps data under.
function H.Report()
  local me = call("UnitName", "player") or "?"
  ns.Chat(string.format("Realm: %s (as in names: %s)", H.RealmName(), H.Realm()))
  ns.Chat("Ruleset: " .. (H.Ruleset() or "none named by the client"))
  ns.Chat("Rules: " .. (H.Rules() or "none named by the client"))
  ns.Chat(string.format("Side: %s   Data key: %s", H.Side(), H.Key()))
  ns.Chat(string.format("Your name in chat: %s-%s (shown as %s)", me, H.NameRealm() or H.Realm(), me))
end

-- Data from the beta ----------------------------------------------------------------------------
-- The beta's prices, sales and remembered characters stay in the saved file and could sit under the
-- same key as the live game's. They are told apart by their time stamps: launch was 4 November 2026,
-- 15:00 PST (UTC seconds). Nothing is removed unasked; /vg launch clear and the Town and gear page do it.

H.LAUNCH = 1793833200

-- Whether a time stamp is a plain number from before launch (no stamp, or a hidden one, is kept).
local function early(t)
  return type(t) == "number" and not ns.IsSecret(t) and t < H.LAUNCH
end

-- Whether the clock says launch has passed.
function H.Launched()
  local clock = _G.time
  return (type(clock) == "function" and ns.PlainNumber(clock()) or 0) >= H.LAUNCH
end

-- The keys of a map's entries stamped before launch under `field`.
local function staleKeys(map, field)
  local old = {}
  for key, entry in pairs(type(map) == "table" and map or {}) do
    if type(entry) == "table" and early(entry[field]) then old[#old + 1] = key end
  end
  return old
end

-- A list's records not stamped before launch (field t), in their order.
local function keptRecords(list)
  local kept = {}
  for _, r in ipairs(type(list) == "table" and list or {}) do
    if not (type(r) == "table" and early(r.t)) then kept[#kept + 1] = r end
  end
  return kept
end

-- How many records a list loses to the sweep: none when it is not a list.
local function goneCount(list, kept)
  return type(list) == "table" and #list - #kept or 0
end

-- The beta-era prices of each home's house: the house, and the keys of its prices stamped before launch.
local function findPrices(houses)
  local found = {}
  for _, house in pairs(type(houses) == "table" and houses or {}) do
    if type(house) == "table" then found[#found + 1] = { house = house, keys = staleKeys(house.prices, "t") } end
  end
  return found
end

-- The beta-era sales of each ledger: the book, its records to keep, how many go, and its auctions open from then.
local function findSales(books)
  local found = {}
  for _, book in pairs(type(books) == "table" and books or {}) do
    if type(book) == "table" then
      local kept = keptRecords(book.records)
      found[#found + 1] = { book = book, kept = kept, gone = goneCount(book.records, kept), openKeys = staleKeys(book.open, "t") }
    end
  end
  return found
end

-- The beta-era characters of each home: the home's table, and the keys of its characters stamped before launch.
local function findCharacters(homes)
  local found = {}
  for _, chars in pairs(type(homes) == "table" and homes or {}) do
    found[#found + 1] = { chars = chars, keys = staleKeys(chars, "updated") }
  end
  return found
end

-- What the saved data holds from before launch, found without changing it: { prices, sales, characters }.
local function findBeta()
  local db = type(VanguardDB) == "table" and VanguardDB or {}
  local ah = type(db.ah) == "table" and db.ah or {}
  return { prices = findPrices(ah.houses), sales = findSales(ah.ledgers), characters = findCharacters(db.inventory) }
end

-- How many prices, sales and characters a found set lists: { prices, sales, characters }.
local function countsOf(found)
  local n = { prices = 0, sales = 0, characters = 0 }
  for _, item in ipairs(found.prices) do n.prices = n.prices + #item.keys end
  for _, item in ipairs(found.sales) do n.sales = n.sales + item.gone + #item.openKeys end
  for _, item in ipairs(found.characters) do n.characters = n.characters + #item.keys end
  return n
end

-- Removes the listed keys from a map.
local function dropKeys(map, keys)
  for _, key in ipairs(keys) do map[key] = nil end
end

-- Puts the kept records back at the front of a list, so its old end is removed.
local function keepOnly(list, kept)
  for i = 1, #list do list[i] = kept[i] end
end

-- Sets a house's count to the prices it holds; a house with no price table counts none.
local function recount(house)
  house.count = 0
  for _ in pairs(type(house.prices) == "table" and house.prices or {}) do house.count = house.count + 1 end
end

-- Removes what a found set lists from the saved data, and recounts the houses whose prices went.
local function removeFound(found)
  for _, item in ipairs(found.prices) do dropKeys(item.house.prices, item.keys) recount(item.house) end
  for _, item in ipairs(found.sales) do
    if item.gone > 0 then keepOnly(item.book.records, item.kept) end
    dropKeys(item.book.open, item.openKeys)
  end
  for _, item in ipairs(found.characters) do dropKeys(item.chars, item.keys) end
end

-- How many prices, sales and characters were last noted before launch: { prices, sales, characters }.
function H.Beta()
  return countsOf(findBeta())
end

-- Removes what was noted before launch, and returns the counts removed: { prices, sales, characters }.
function H.ClearBeta()
  local found = findBeta()
  removeFound(found)
  return countsOf(found)
end

-- How each kind of beta data is counted in a sentence.
local BETA_KINDS = { { "prices", L["{count} prices"] }, { "sales", L["{count} sales"] }, { "characters", L["{count} characters"] } }

-- "12 prices, 3 sales, 2 characters" (the ones there are), or nil when there are none.
local function betaText(n)
  local parts = {}
  for _, kind in ipairs(BETA_KINDS) do
    if n[kind[1]] > 0 then parts[#parts + 1] = ns.Format(kind[2], { count = n[kind[1]] }) end
  end
  return #parts > 0 and table.concat(parts, ", ") or nil
end

-- /vg launch [clear]: what is saved from before launch, or (clear, once launch has passed) removes it.
function H.Launch(arg)
  if arg == "clear" and not H.Launched() then return ns.Chat(L["Launch is on 4 November 2026; nothing is cleared before then."]) end
  local text = betaText(arg == "clear" and H.ClearBeta() or H.Beta())
  if not text then return ns.Chat(L["No prices, sales or characters saved from before launch."]) end
  local said = arg == "clear" and L["Cleared what was saved from before launch: {saved}."] or L["Saved from before launch (the beta): {saved}. /vg launch clear removes them."]
  ns.Chat(ns.Format(said, { saved = text }))
end

-- The Clear button on the Town and gear page: asks first, naming what would go.
function H.AskClear()
  local text = betaText(H.Beta())
  if not text then return ns.Chat(L["No prices, sales or characters saved from before launch."]) end
  local question = ns.Format(L["Clear what was saved before launch ({saved})? Prices, sales and characters you saw after launch stay."], { saved = text })
  ns.Ask(question, L["Clear"], function() H.Launch("clear") end, function() end)
end

-- Once per account, after launch: says when beta data is still saved and where to clear it.
function H.LaunchNotice()
  if not H.Launched() or type(VanguardDB) ~= "table" or VanguardDB.launchNoticed then return end
  VanguardDB.launchNoticed = true
  local text = betaText(H.Beta())
  if text then ns.Chat(ns.Format(L["Still saved from the beta: {saved}. Clear them under /vg > Town and gear if the live game starts fresh."], { saved = text })) end
end
ns.On("PLAYER_LOGIN", ns.Guard("launch notice", H.LaunchNotice))
