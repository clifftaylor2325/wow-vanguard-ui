-- Pet stable: /vg pets lists your pets (the ones out first, then the stabled ones) with their level, family,
-- loyalty, happiness and how far they are to the next level, from Forever's C_StableInfo. At a stable master
-- one chat line says how many pets you have and what the next stable slot costs. Where the client has no
-- C_StableInfo, or returns nothing, the command says so and the stable line stays away.

local ADDON, ns = ...

local PS = ns.Module("PetStable", { defaults = { announce = true } })

-- Happiness by the game's level (1 unhappy, 2 content, 3 happy, as GetPetHappiness gives it).
PS.HAPPINESS = { "unhappy", "content", "happy" }

-- The pets one C_StableInfo list gives, added to `out` as { pet, active }.
local function collect(out, name, active)
  local fn = type(C_StableInfo) == "table" and C_StableInfo[name]
  local pets = type(fn) == "function" and fn()
  for _, pet in ipairs(type(pets) == "table" and pets or {}) do out[#out + 1] = { pet = pet, active = active } end
end

-- Your pets, active ones first: { { pet = PetInfo, active = bool }, ... }.
function PS.Pets()
  local out = {}
  collect(out, "GetActivePetList", true)
  collect(out, "GetStabledPetList", false)
  return out
end

-- A text field of a pet, "?" when it is missing or hidden.
local function word(value)
  return type(value) == "string" and not ns.IsSecret(value) and value ~= "" and value or "?"
end

-- "35%" of the way to the next level, or nil when the pet doesn't say.
local function progress(pet)
  local have, need = ns.PlainNumber(pet.experience), ns.PlainNumber(pet.experienceNeeded)
  if have and need and need > 0 then return math.floor(have / need * 100) .. "% to next level" end
end

-- One pet's line: "Rex, level 12 Cat · Loyal · happy · 35% to next level (out)".
function PS.Line(entry)
  local pet = entry.pet
  local parts = { word(pet.name) .. ", level " .. (ns.PlainNumber(pet.level) or "?") .. " " .. word(pet.familyName) }
  if type(pet.loyaltyName) == "string" and not ns.IsSecret(pet.loyaltyName) and pet.loyaltyName ~= "" then parts[#parts + 1] = pet.loyaltyName end
  parts[#parts + 1] = PS.HAPPINESS[ns.PlainNumber(pet.happinessLevel) or 0]
  parts[#parts + 1] = progress(pet)
  return table.concat(parts, " · ") .. (entry.active and " (out)" or "")
end

-- /vg pets: every pet, one line each.
function PS.Command()
  local pets = PS.Pets()
  if #pets == 0 then return ns.Chat("No pets to list (or the game doesn't list them here).") end
  ns.Chat("Your pets:")
  for _, entry in ipairs(pets) do ns.Chat(PS.Line(entry)) end
end

-- What the next stable slot costs, in copper, or nil when the game doesn't say.
local function slotCost()
  local fn = type(C_StableInfo) == "table" and C_StableInfo.GetNextStableSlotCost
  return type(fn) == "function" and ns.PlainNumber(fn()) or nil
end

-- At a stable master: "Stable: 3 pets (use /vg pets). Next slot: 5g."
function PS.Announce()
  local n = #PS.Pets()
  if n == 0 then return end
  local cost = slotCost()
  ns.Chat("Stable: " .. n .. (n == 1 and " pet" or " pets") .. " (/vg pets lists them)." .. (cost and cost > 0 and " Next slot: " .. ns.GetModule("InfoStrip").Money(cost) .. "." or ""))
end

-- Says the stable line when the stable master's window opens.
function PS.Enable(settings)
  ns.On("PET_STABLE_SHOW", function() if settings.announce then PS.Announce() end end)
end
