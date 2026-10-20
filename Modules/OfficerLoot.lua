-- Officer loot tools (off until switched on): a loot-rules / soft-reserve list kept on this
-- character, and a roster of the group (Modules/OfficerRoster.lua). A reserve is a player's
-- name and an item (typed, or a link shift-clicked into /vg loot add). Next to the roll
-- tracker (Modules/Rolls.lua), a roll by a player who reserved the item being rolled for is
-- flagged "[SR]", and an item in the loot history lists who reserved it. The item a round is
-- for is the newest one the loot history says is still rolling, or the one /vg loot focus names.
-- Nothing is synced: addon messages are limited in instances, so the list is shared by hand.
-- A button puts it in the chat box (/p or /raid) for you to read and send with Enter; nothing
-- is sent for you, and nothing rolls, assigns or trades for anyone.

local ADDON, ns = ...

local OL = ns.Module("OfficerLoot", { defaults = { on = false } })

ns.Options.MODULE_INFO.OfficerLoot = { "Officer loot tools", "A soft-reserve list shown next to the roll tracker, and a roster of the group; shared by hand, never synced (off until switched on)." }

-- The longest chat line the game takes, kept under with room for the /p or /raid prefix.
OL.CHUNK = 230

-- The text between two names on one line, and between two lines of one chat part.
OL.NAME_SEP = ", "
OL.PART_SEP = " | "

-- Names and items -----------------------------------------------------------------------------

-- A player's name as compared: lower-case, without the "-Realm" the game adds across realms.
function OL.Norm(name)
  return (tostring(name):lower():gsub("%-.*$", ""))
end

-- Whether two names are the same player.
function OL.Same(a, b)
  return OL.Norm(a) == OL.Norm(b)
end

-- The item text read as { id, name, lname }: a link gives its id and bracketed name, plain text its name. Nil when empty or secret.
function OL.Item(text)
  if type(text) ~= "string" or ns.IsSecret(text) then return nil end
  text = text:match("^%s*(.-)%s*$")
  if text == "" then return nil end
  local name = text:match("|h%[(.-)%]|h") or text
  return { id = tonumber(text:match("item:(%d+)")), name = name, lname = name:lower() }
end

-- Whether a stored reserve is for the item read by OL.Item: the same id, else the same name.
function OL.Match(entry, item)
  return (item.id ~= nil and entry.id == item.id) or entry.lname == item.lname
end

-- The reserves kept on this character, a list of { player, item, id, lname }; made on first use.
function OL.Store()
  if type(VanguardCharDB) ~= "table" then return {} end
  if type(VanguardCharDB.lootReserves) ~= "table" then VanguardCharDB.lootReserves = {} end
  return VanguardCharDB.lootReserves
end

-- Whether the tools are on: the module is running and its one switch is on.
function OL.On()
  return OL.enabled == true and OL.settings ~= nil and OL.settings.on == true
end

-- The list changed: the next chat-box part starts over and the roll tracker is drawn again.
function OL.Changed()
  OL.part = 0
  local R = ns.GetModule("Rolls")
  if R and R.frame then R.Paint() end
end

-- The list --------------------------------------------------------------------------------------

-- Adds a reserve; returns the entry, and true when it was there already. Nil when the player or item is empty.
function OL.Add(player, itemText)
  local item, list = OL.Item(itemText), OL.Store()
  if not item or type(player) ~= "string" or player == "" then return nil end
  for _, e in ipairs(list) do
    if OL.Same(e.player, player) and OL.Match(e, item) then return e, true end
  end
  local entry = { player = player, item = item.name, id = item.id, lname = item.lname }
  list[#list + 1] = entry
  OL.Changed()
  return entry, false
end

-- Removes the player's reserve on the item; returns how many went.
function OL.Remove(player, itemText)
  local item, list, gone = OL.Item(itemText), OL.Store(), 0
  if not item then return 0 end
  for i = #list, 1, -1 do
    if OL.Same(list[i].player, player) and OL.Match(list[i], item) then table.remove(list, i) gone = gone + 1 end
  end
  if gone > 0 then OL.Changed() end
  return gone
end

-- Forgets every reserve; returns how many there were.
function OL.Clear()
  local list = OL.Store()
  local n = #list
  for i = n, 1, -1 do list[i] = nil end
  OL.Changed()
  return n
end

-- The names that reserved the item (a link or a name), in the order they were added.
function OL.Holders(itemText)
  local item, out = OL.Item(itemText), {}
  if not item then return out end
  for _, e in ipairs(OL.Store()) do
    if OL.Match(e, item) then out[#out + 1] = e.player end
  end
  return out
end

-- Whether the player reserved the item (a link or a name).
function OL.Reserved(name, itemText)
  for _, holder in ipairs(OL.Holders(itemText)) do
    if OL.Same(holder, name) then return true end
  end
  return false
end

-- The reserves grouped by item, in the order each item was first added: { { item, names } }.
function OL.Groups()
  local out, at = {}, {}
  for _, e in ipairs(OL.Store()) do
    local key = e.id or e.lname
    if not at[key] then out[#out + 1] = { item = e.item, names = {} } at[key] = out[#out] end
    table.insert(at[key].names, e.player)
  end
  return out
end

-- The list as lines: "Item: name, name".
function OL.Lines()
  local out = {}
  for _, g in ipairs(OL.Groups()) do out[#out + 1] = g.item .. ": " .. table.concat(g.names, ", ") end
  return out
end

-- Sharing -----------------------------------------------------------------------------------------

-- A shared line's head: "Item: " on an item's first line, "Item (cont.): " on the lines after it.
local function lineHead(item, n)
  return (n == 1 and item or item .. " (cont.)") .. ": "
end

-- One item's reserves as lines of at most OL.CHUNK bytes, cut between names (many reserves on one
-- item would not fit the chat box's 255 bytes on one line).
local function groupLines(g)
  local out, names = {}, {}
  for _, name in ipairs(g.names) do
    local now = lineHead(g.item, #out + 1) .. table.concat(names, OL.NAME_SEP)
    if #names > 0 and #now + #OL.NAME_SEP + #name > OL.CHUNK then out[#out + 1] = now names = {} end
    names[#names + 1] = name
  end
  out[#out + 1] = lineHead(g.item, #out + 1) .. table.concat(names, OL.NAME_SEP)
  return out
end

-- The list cut into parts that each fit one chat line, the first starting "Soft reserves: ".
function OL.Chunks()
  local parts, now = {}, ""
  for _, g in ipairs(OL.Groups()) do
    for _, line in ipairs(groupLines(g)) do
      if now ~= "" and #now + #OL.PART_SEP + #line > OL.CHUNK then parts[#parts + 1] = now now = "" end
      now = now == "" and (#parts == 0 and "Soft reserves: " or "") .. line or now .. OL.PART_SEP .. line
    end
  end
  if now ~= "" then parts[#parts + 1] = now end
  return parts
end

-- Puts the next part of the list in the chat box behind prefix ("/p " or "/raid "); you read it and press Enter.
-- Without the game's call to open the chat box it prints the part to your own chat instead.
function OL.Share(prefix)
  local parts = OL.Chunks()
  if #parts == 0 then return ns.Chat("No reserves to share.") end
  OL.part = (OL.part or 0) % #parts + 1
  local open = type(ChatFrameUtil) == "table" and ChatFrameUtil.OpenChat
  if type(open) ~= "function" then return ns.Chat(parts[OL.part]) end
  open(prefix .. parts[OL.part])
  if #parts > 1 then ns.Chat("Part " .. OL.part .. " of " .. #parts .. " is in the chat box; click again for the next.") end
end

-- Prints the list to your own chat.
function OL.Print()
  local lines = OL.Lines()
  if #lines == 0 then return ns.Chat("No reserves yet. /vg loot add <player> <item>") end
  ns.Chat("Soft reserves:")
  for _, line in ipairs(lines) do ns.Chat(line) end
end

-- Commands --------------------------------------------------------------------------------------

-- /vg loot add <player> <item>.
function OL.CmdAdd(arg)
  local player, item = arg:match("^(%S+)%s+(.+)$")
  local entry, had = OL.Add(player, item)
  if not entry then return ns.Chat("Use /vg loot add <player> <item or item link>.") end
  ns.Chat(had and (entry.player .. " already reserves " .. entry.item .. ".") or ("Reserved: " .. entry.item .. " for " .. entry.player .. "."))
end

-- /vg loot remove <player> <item>.
function OL.CmdRemove(arg)
  local player, item = arg:match("^(%S+)%s+(.+)$")
  local gone = player and OL.Remove(player, item) or 0
  ns.Chat(gone > 0 and ("Removed the reserve for " .. player .. ".") or "No such reserve. /vg loot list shows them.")
end

-- /vg loot focus <item>: the item the roll tracker flags reserves for; with nothing, goes back to following the loot history.
function OL.CmdFocus(arg)
  OL.focus = arg ~= "" and arg or nil
  OL.Changed()
  ns.Chat(OL.focus and ("Rolls are flagged for " .. (OL.Item(arg) or {}).name .. ".") or "Rolls follow the item the loot history says is rolling.")
end

-- /vg loot clear.
function OL.CmdClear()
  ns.Chat("Forgot " .. OL.Clear() .. " reserve(s).")
end

-- /vg loot with nothing, or with something it doesn't know: how to use it.
function OL.Usage()
  ns.Chat("Officer loot tools are on. /vg loot add <player> <item>, remove <player> <item>, list, clear, focus [item], roster, off.")
end

-- The subcommands, by name.
OL.SUB = {
  add = OL.CmdAdd, remove = OL.CmdRemove, list = OL.Print, clear = OL.CmdClear, focus = OL.CmdFocus,
  roster = function() OL.ToggleRoster() end,
}

-- Switches the tools on or off (the roster goes with them).
function OL.SetOn(on)
  if not OL.enabled then return ns.Chat("Officer loot tools are off in /vg > Modules.") end
  OL.settings.on = on
  OL.Apply()
  ns.Chat(on and "Officer loot tools on. /vg loot for what they do." or "Officer loot tools off.")
end

-- /vg loot ...
function OL.Command(rest)
  local sub, arg = (rest or ""):match("^(%S*)%s*(.-)%s*$")
  sub = sub:lower()
  if sub == "on" or sub == "off" then return OL.SetOn(sub == "on") end
  if not OL.On() then return ns.Chat("Officer loot tools are off. /vg loot on switches them on.") end
  local fn = OL.SUB[sub] or OL.Usage
  fn(arg)
end

-- Options ---------------------------------------------------------------------------------------

-- Asks for "<player> <item>" in a box and adds it.
function OL.AskAdd()
  ns.AskText("Reserve: player, then item (or shift-click a link)", OL.CmdAdd, "Add")
end

-- The share and clear buttons of the card.
function OL.ShareRows()
  return {
    { "button", "Print the reserve list to my chat", OL.Print },
    { "button", "Put the list in the chat box for the party", function() OL.Share("/p ") end },
    { "button", "Put the list in the chat box for the raid", function() OL.Share("/raid ") end },
    { "button", "Clear every reserve", OL.CmdClear },
  }
end

-- The card on the Combat tools page.
function OL.Rows()
  local get, set, default = ns.Options.LiveSetting("OfficerLoot", "on", function() OL.Apply() end)
  local rows = {
    { "header", "Officer loot tools" },
    { "text", "A soft-reserve list next to the roll tracker and a roster of the group, for a raid leader or officer. Kept on this character and shared by hand; nothing is synced, sent or rolled for you (/vg loot)." },
    { "check", "Turn on the soft-reserve list and the roster", get, set, default },
    { "button", "Add a reserve", OL.AskAdd },
    { "button", "Show or hide the roster", function() OL.ToggleRoster() end },
  }
  return ns.Options.Append(rows, OL.ShareRows())
end
ns.Options.AddRows("tools", OL.Rows)

-- Follows the switch: the roll tracker and the roster are drawn again.
function OL.Apply()
  OL.Changed()
  OL.PaintRoster()
end

-- Module entry point (Core/Modules.lua): hands the roll tracker the list.
function OL.Enable(settings)
  OL.settings = settings
  ns.GetModule("Rolls").reserve = OL
  OL.WatchRoster()
end
