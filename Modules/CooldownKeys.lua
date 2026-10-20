-- Key text on the Cooldown Manager: a small label in the corner of each icon in the
-- game's essential and utility rows saying the key you press for that spell, read
-- from Vanguard's own action bars (the first shown button that holds the spell, or a
-- macro that casts it). It decorates the game's own icon and copies nothing. Off by
-- default. The spell an icon stands for and a button's contents can be hidden from
-- addons, and the game's own bars are never read: where Vanguard's buttons don't hold
-- the spell, or the client won't say, the icon shows no label and nothing errors.
-- Nothing here is protected or fades, so it works the same in combat.

local ADDON, ns = ...

local T = ns.Theme

-- The labels, kept off the game's items (Core/Events.lua, ns.FrameState).
local vgKey = ns.FrameState("vgKey")

local CK = ns.Module("CooldownKeys", { defaults = { keys = false } })

-- The rows whose icons are cast from a bar (the buff row is not).
CK.VIEWERS = { "EssentialCooldownViewer", "UtilityCooldownViewer" }
-- Events that change which button holds which spell, or its key.
CK.EVENTS = { "ACTIONBAR_SLOT_CHANGED", "ACTIONBAR_PAGE_CHANGED", "UPDATE_BINDINGS", "SPELLS_CHANGED", "PLAYER_SPECIALIZATION_CHANGED" }
-- The calls on a manager item that name its spell, override first.
CK.SPELL_CALLS = { "GetSpellID", "GetBaseSpellID" }

-- Which spell a bar slot casts -------------------------------------------------------------

-- The spell an action slot casts (directly or through a macro), or nil when it is none or hidden.
function CK.SlotSpell(slot)
  local kind, id = GetActionInfo(slot)
  if ns.IsSecret(kind) or ns.IsSecret(id) then return nil end
  if kind == "macro" and type(GetMacroSpell) == "function" then id = GetMacroSpell(id) end
  if kind ~= "spell" and kind ~= "macro" then return nil end
  return ns.PlainNumber(id)
end

-- Every spell on a shown Vanguard button, with the short key of the first button that holds it.
function CK.Keys()
  local AB, keys = ns.GetModule("ActionBars"), {}
  for _, b in ipairs(AB.buttons or {}) do
    local spell = b:IsShown() and b.action and CK.SlotSpell(b.action)
    local key = spell and b.binding and GetBindingKey(b.binding)
    if key and not keys[spell] then keys[spell] = AB.ShortKey(key) end
  end
  return keys
end

-- The icon's label ---------------------------------------------------------------------------

-- The spells a manager item may stand for, override first; none when it can't say.
function CK.ItemSpells(item)
  local out = {}
  for _, name in ipairs(CK.SPELL_CALLS) do
    local get = item[name]
    local ok, id = false, nil
    if type(get) == "function" then ok, id = pcall(get, item) end
    out[#out + 1] = ok and ns.PlainNumber(id) or nil
  end
  return out
end

-- The key text for an item from a spell-to-key table, or "" when none of its spells has a key.
function CK.KeyFor(item, keys)
  for _, spell in ipairs(CK.ItemSpells(item)) do
    if keys[spell] then return keys[spell] end
  end
  return ""
end

-- The item's label text, made on first use on a small frame above the icon's sweep.
local function label(item)
  if vgKey[item] then return vgKey[item] end
  local holder = CreateFrame("Frame", nil, item)
  holder:SetAllPoints(item)
  holder:SetFrameLevel(item:GetFrameLevel() + 10)
  local fs = T.Text(holder:CreateFontString(nil, "OVERLAY"), "small")
  T.Color(fs, "text2")
  fs:SetPoint("TOPRIGHT", holder, "TOPRIGHT", -2, -2)
  vgKey[item] = fs
  return fs
end

-- Paints every icon of the rows from a spell-to-key table (a label already made is blanked when its key goes).
function CK.Paint(keys)
  for _, name in ipairs(CK.VIEWERS) do
    local viewer = _G[name]
    local items = type(viewer) == "table" and type(viewer.GetItemFrames) == "function" and viewer:GetItemFrames()
    for _, item in ipairs(type(items) == "table" and items or {}) do
      local text = CK.KeyFor(item, keys)
      if text ~= "" or vgKey[item] then label(item):SetText(text) end
    end
  end
end

-- Reads the bars again and repaints the rows; with the switch off, blanks them.
function CK.Refresh()
  CK.Paint(CK.settings.keys and CK.Keys() or {})
end

-- Repaints after a row lays itself out again (the game makes its items as you set what it tracks).
local function watch(name)
  local viewer = _G[name]
  if type(viewer) == "table" and type(viewer.RefreshLayout) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(viewer, "RefreshLayout", ns.Guard("hook RefreshLayout keys", CK.Refresh))
  end
end

-- Repaints on the next frame, once for however many buttons changed in this one.
local function refreshSoon()
  ns.Soon("cooldown keys", CK.Refresh)
end

-- Repaints after a Vanguard bar button is pointed at another slot. A stance, form or
-- Shift+number page lands a frame after its event (the secure state driver re-points
-- bar 1 on its next update), so the bar, not the event, says when the keys moved.
local function followButtons()
  if type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(ns.GetModule("ActionBars"), "UpdateButton", ns.Guard("hook UpdateButton keys", refreshSoon))
end

-- Module entry point (Core/Modules.lua): watch the events, the bars and the rows, then paint.
function CK.Enable(settings)
  CK.settings = settings
  for _, event in ipairs(CK.EVENTS) do ns.On(event, ns.Guard("cooldown keys", CK.Refresh)) end
  followButtons()
  for _, name in ipairs(CK.VIEWERS) do watch(name) end
  CK.Refresh()
end
