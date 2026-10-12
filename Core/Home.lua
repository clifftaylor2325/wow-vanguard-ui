-- Where this character's shared data lives. Vanguard keeps auction prices, the sales ledger and
-- other characters' items per "home": your realm, the ruleset when the client names one, and your
-- side, as "Realm-Faction" or "Realm-ruleset-Faction". On WoW Forever rulesets take the place of
-- realms, so the ruleset joins the key wherever the client says which one you're on; data kept
-- under an older key moves to the new one once (Adopt). /vg realm prints what the client says.
-- Read it inside functions only: FactionArt loads later in the TOC.

local ADDON, ns = ...

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
-- "hardcore" on Hardcore rules (C_GameRules). Neither is confirmed on Forever yet (/vg realm).
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
  return H.Realm() .. "-" .. (ruleset and (ruleset .. "-") or "") .. H.Side()
end

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

-- A player's name to show: "Name" for someone on your realm, else as the client gave it
-- ("Name-Realm"). Whispers and comparisons keep the full name.
function H.Display(name)
  local base, realm = name:match("^([^%-]+)%-(.+)$")
  if base and realm == H.Realm() then return base end
  return name
end

-- True when a sender's name ("Name" or "Name-Realm") is you: your name, alone or with your realm.
function H.IsMe(sender)
  local me = call("UnitName", "player")
  return me ~= nil and (sender == me or sender == me .. "-" .. H.Realm())
end

-- /vg realm: what the client says about where you are, and the key Vanguard keeps data under.
function H.Report()
  local me = call("UnitName", "player") or "?"
  ns.Chat(string.format("Realm: %s (as in names: %s)", H.RealmName(), H.Realm()))
  ns.Chat("Ruleset: " .. (H.Ruleset() or "none named by the client"))
  ns.Chat(string.format("Side: %s   Data key: %s", H.Side(), H.Key()))
  ns.Chat(string.format("Your name in chat: %s-%s (shown as %s)", me, H.Realm(), me))
end
