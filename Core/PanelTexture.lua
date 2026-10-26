-- Panel textures (#647, General -> Look -> Panel texture): an optional surface drawn over a
-- floating window's fill (the options window, dialogs, bags, tooltips, skinned game windows),
-- never on the HUD. Flat, the default, draws nothing. Vanguard's own surfaces are faint white
-- art that lightens any variant's panel by a few shades; the game's backgrounds and any a
-- LibSharedMedia addon shares are drawn faint over the fill, so text stays readable. High
-- contrast (a flat variant) keeps every panel flat.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme

-- Where the surface sits: over the fill (BACKGROUND 0) and under the sheen and border; how faint a
-- texture another addon shares is drawn.
T.PANEL_SURFACE = { sublevel = 1, sharedAlpha = 0.25 }

-- The built-in textures: setting value -> its path and the alpha it is drawn at. Vanguard's own are drawn
-- whole (their art is already faint); the game's are drawn faint over the fill, each by how bright it is.
T.PANEL_TEXTURES = {
  grain = { path = T.Texture("PanelGrain"), alpha = 1 },
  stone = { path = T.Texture("PanelStone"), alpha = 1 },
  leather = { path = T.Texture("PanelLeather"), alpha = 1 },
  rock = { path = "Interface\\FrameGeneral\\UI-Background-Rock", alpha = 0.25 },
  marble = { path = "Interface\\FrameGeneral\\UI-Background-Marble", alpha = 0.3 },
  dialog = { path = "Interface\\DialogFrame\\UI-DialogBox-Background", alpha = 0.5 },
}

-- The picker's built-ins, in display order.
T.PANEL_TEXTURE_CHOICES = {
  { "flat", L["Flat"] }, { "grain", L["Fine grain"] }, { "stone", L["Carved stone"] }, { "leather", L["Dark leather"] },
  { "rock", L["Rock (the game's)"] }, { "marble", L["Marble (the game's)"] }, { "dialog", L["Dialog (the game's)"] },
}

-- Backgrounds LibSharedMedia lists that the picker leaves out: no texture, a plain fill, the game's
-- full-screen effects, and the game's backgrounds already built in above.
local NOT_PANELS = {
  ["None"] = true, ["Solid"] = true, ["Blizzard Low Health"] = true, ["Blizzard Out of Control"] = true,
  ["Blizzard Rock"] = true, ["Blizzard Marble"] = true, ["Blizzard Dialog Background"] = true,
}

-- The picker's choices: the built-ins, then every background another addon shares.
function T.PanelTextureChoices()
  return T.SharedChoices("background", T.PANEL_TEXTURE_CHOICES, NOT_PANELS)
end

-- The path and alpha of the texture the setting picks, or nil for flat: the setting is Flat, the
-- variant is flat, or the shared texture it names is no longer shared.
function T.PanelSurface()
  local pick = T.Settings().panelTexture
  if pick == "flat" or (T.Variant() or {}).flat then return nil end
  local own = T.PANEL_TEXTURES[pick]
  if own then return own.path, own.alpha end
  local path = T.SharedPath("background", pick)
  return path, path and T.PANEL_SURFACE.sharedAlpha
end

-- Each painted window's surface texture (weak; kept off the frame, which may be one of the game's).
local surfaceOf = setmetatable({}, { __mode = "k" })

-- Places the surface over the fill, `pad` units out past the frame and `r` units in from it, so a
-- rounded panel's corners (r 0 when square) stay the fill's own.
local function place(t, frame, pad, r)
  local d = pad - r
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", frame, "TOPLEFT", -d, d)
  t:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", d, -d)
end

-- The window's surface, made once, tiled both ways.
local function surface(frame)
  local t = surfaceOf[frame] or frame:CreateTexture(nil, "BACKGROUND", nil, T.PANEL_SURFACE.sublevel)
  surfaceOf[frame] = t
  t:SetHorizTile(true)
  t:SetVertTile(true)
  return t
end

-- Draws the panel texture over a painted window's fill (one with a shadow, or opts.gradient, and
-- without opts.noSurface: the HUD's panels and slots), or hides the one it drew when the setting goes
-- back to flat. Core/Theme.lua calls it on every repaint.
---@param frame table a painted frame
---@param entry table its paint entry: opts, and the radius it was painted at
function T.PaintPanelSurface(frame, entry)
  local opts, path, alpha = entry.opts, T.PanelSurface()
  if opts.noSurface or not (opts.shadow or opts.gradient) or not (path or surfaceOf[frame]) then return end
  local t = surface(frame)
  t:SetShown(path ~= nil)
  if not path then return end
  t:SetTexture(path, "REPEAT", "REPEAT")
  t:SetAlpha(alpha * (opts.alpha or 1))
  place(t, frame, opts.pad or 0, entry.radius or 0)
end
