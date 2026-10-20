-- Post-fight recap, part of the fight history (Modules/FightHistory.lua). After a fight the
-- game's damage meter is asked how many interrupts and dispels you landed, how much damage
-- you took and how many deaths there were. Out of combat only: the meter's figures are secret
-- in a fight, and anything it hides is left out of the line, not guessed. "Chat recap after
-- each fight" (off until switched on) puts the line in your own chat when a fight is
-- recorded; /vg recap shows it for the last fight, and /vg recap say|party|raid|instance|guild
-- sends it to that channel (your own command, out of combat; nothing is ever sent by itself).

local ADDON, ns = ...

local FH = ns.GetModule("FightHistory")

-- The meters read: the line's key, the Enum.DamageMeterType key, and its words. Deaths counts the
-- lines the meter lists (one per member who died).
FH.RECAP = {
  { key = "interrupts", meter = "Interrupts", label = "Interrupts" },
  { key = "dispels", meter = "Dispels", label = "Dispels" },
  { key = "taken", meter = "DamageTaken", label = "Damage taken" },
  { key = "deaths", meter = "Deaths", label = "Deaths", count = true },
}
-- The channels /vg recap sends to, by the word typed.
FH.CHANNELS = { say = "SAY", party = "PARTY", raid = "RAID", instance = "INSTANCE_CHAT", guild = "GUILD" }

-- Your line in a list, or nil.
local function mine(sources)
  for _, source in ipairs(sources) do
    if source.isLocalPlayer == true then return source end
  end
end

-- One meter's figure for the last fight: your total, or for a count meter how many lines it lists
-- (and whether one is yours); nil where the client has no such meter or hides it.
local function figure(meter)
  local sources = ns.GetModule("InfoStrip").MeterSources(meter.meter)
  if not sources then return nil end
  if meter.count then return #sources, mine(sources) ~= nil end
  local line = mine(sources)
  return line and ns.PlainNumber(line.totalAmount) or nil
end

-- The last fight's figures by key ({} when the meter shows none); died is true when your name is
-- among the deaths.
function FH.ReadRecap()
  local out = {}
  for _, meter in ipairs(FH.RECAP) do
    local value, you = figure(meter)
    out[meter.key] = value
    if meter.count and you then out.died = true end
  end
  return out
end

-- One part of the line: "Interrupts 3", with a short figure for the big ones.
local function part(meter, value)
  local text = value >= 1000 and ns.GetModule("DataBars").Short(math.floor(value)) or tostring(value)
  return meter.label .. " " .. text
end

-- The recap as one line, or nil when the meter gave nothing.
function FH.RecapText(recap)
  local parts = {}
  for _, meter in ipairs(FH.RECAP) do
    if recap[meter.key] then parts[#parts + 1] = part(meter, recap[meter.key]) end
  end
  if #parts == 0 then return nil end
  return table.concat(parts, "  ·  ") .. (recap.died and " (you died)" or "")
end

-- A fight was recorded: with the chat recap on, your own chat gets its line.
function FH.Announce()
  local text = FH.settings.recap and FH.RecapText(FH.ReadRecap())
  if text then ns.Chat("Fight recap: " .. text) end
end

-- /vg recap [channel]: the last fight's recap in your chat, or sent to that channel.
function FH.RecapCommand(rest)
  local word = (rest or ""):lower():match("^%s*(%S*)")
  if ns.InCombat() then return ns.Chat("Not in combat: the game's damage meter is hidden until the fight is over.") end
  local text = FH.RecapText(FH.ReadRecap())
  if not text then return ns.Chat("No recap to show: no fight yet, or the game's damage meter has nothing for it.") end
  if word == "" then return ns.Chat("Fight recap: " .. text) end
  if not FH.CHANNELS[word] then return ns.Chat("Send the recap to say, party, raid, instance or guild.") end
  ns.SendChat(text, FH.CHANNELS[word])
end
