-- Masque support. Masque is an addon that skins buttons; nothing of it is
-- bundled. When it is loaded (found through LibStub at runtime), Vanguard hands
-- it its action buttons, the game's pet, stance and extra action buttons, and
-- your buff and target/focus aura icons, each set in a Masque group of its own
-- (Masque's options pick a skin per group), and skips its own button skin for
-- them. Without Masque, or without LibStub, nothing changes.

local ADDON, ns = ...

local M = {}
ns.Masque = M

-- The groups Vanguard made, by name.
M.groups = {}

-- Masque, when it is loaded; nil without it (or without LibStub).
function M.Lib()
  local stub = _G.LibStub
  if stub == nil then return nil end
  return stub("Masque", true)
end

-- The Masque group named name (made on first use), or nil without Masque or a name.
function M.Group(name)
  local lib = name and M.Lib()
  if not lib then return nil end
  M.groups[name] = M.groups[name] or lib:Group("Vanguard", name)
  return M.groups[name]
end

-- Hands a button and its regions (Icon, Cooldown, Count, HotKey...; nil lets
-- Masque find a game button's own) to the named group, as kind ("Action",
-- "Pet", "Aura"...). True when Masque skins it, so Vanguard's skin is skipped.
function M.Add(name, button, regions, kind)
  local group = M.Group(name)
  if not group then return false end
  group:AddButton(button, regions, kind)
  return true
end
