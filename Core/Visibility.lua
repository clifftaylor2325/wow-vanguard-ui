-- When a frame is seen: Always, On mouseover, In combat, Hidden, or a checklist
-- of conditions (combat, mouseover, in a group, in a raid, in an instance, in a
-- vehicle, resting), shown while any checked one holds. Used by the action
-- bars, the info strip, the data bars and the menu strip.
--
-- A setting compiles to one macro-conditional string, its state:
--   "[combat] show; [group] show; hide"   shown in combat or in a group
--   "[combat] show; fade"                 also shown while the mouse is over it
-- The client runs it as a state driver (RegisterStateDriver), in combat too,
-- without secure snippets: secure frames get it as their "visibility" driver
-- (fade counts as shown), and every frame gets it as the "vgvis" state, whose
-- changes come back through OnAttributeChanged. "fade" fades the frame by
-- alpha until the mouse is over it, since mouseover is not a macro condition;
-- alpha is safe in combat. "In an instance" is not one either: it is read when
-- the driver is registered and again on every zone change (out of combat).

local ADDON, ns = ...
local L = ns.L

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgAutoHideCount = ns.FrameState("vgAutoHideCount")
local vgHover = ns.FrameState("vgHover")
local vgHoverOf = ns.FrameState("vgHoverOf")

local T, W = ns.Theme, ns.Widgets

local V = {}
ns.Visibility = V

-- Each condition: its key in a checklist, its chip's label, and its macro
-- condition (none for mouseover and instance, which are handled here).
V.CONDITIONS = {
  { "combat", L["Combat"], "[combat]" }, { "mouseover", L["Mouseover"] }, { "group", L["Group"], "[group]" },
  { "raid", L["Raid"], "[group:raid]" }, { "instance", L["Instance"] }, { "vehicle", L["Vehicle"], "[vehicleui]" },
  { "resting", L["Resting"], "[resting]" },
}
-- The choices of a visibility row; "custom" is the checklist.
V.MODES = { { "always", L["Always"] }, { "mouseover", L["On mouseover"] }, { "combat", L["In combat"] }, { "hidden", L["Hidden"] }, { "custom", L["When checked below"] } }
-- The menu bar's choices: those, and Auto-hide (shown at login and under the
-- mouse, then faded V.LINGER seconds after the mouse leaves).
V.MENU_MODES = { V.MODES[1], V.MODES[2], { "autohide", L["Auto-hide after 10 s"] }, V.MODES[3], V.MODES[4], V.MODES[5] }
-- The modes that are one condition of the checklist (Always is none; Hidden is
-- not a checklist). Auto-hide is On mouseover with a linger.
V.PRESETS = { mouseover = { mouseover = true }, combat = { combat = true }, autohide = { mouseover = true } }
-- How long an Auto-hide frame stays after the login and after the mouse leaves it (seconds).
V.LINGER = 10
-- Frames whose drivers are registered again on a zone change, -> how.
V.tracked = {}

-- Compiling -----------------------------------------------------------------------------------

-- A known mode, or "always" (unset and unknown values count as Always).
function V.Mode(mode)
  if mode == "custom" or mode == "hidden" or mode == "always" or V.PRESETS[mode] then return mode end
  return "always"
end

-- The conditions a setting shows on: its preset's, or its checklist's.
function V.Checked(mode, when)
  mode = V.Mode(mode)
  if mode == "custom" then return type(when) == "table" and when or {} end
  return V.PRESETS[mode] or {}
end

-- True when the client says you are in an instance.
function V.InInstance()
  return type(IsInInstance) == "function" and IsInInstance() == true
end

-- The checked conditions as clauses that show ("[combat] show; [group] show"), then rest.
local function compile(set, rest)
  if set.instance and V.InInstance() then return "show" end
  local out = {}
  for _, c in ipairs(V.CONDITIONS) do
    if set[c[1]] and c[3] then out[#out + 1] = c[3] .. " show" end
  end
  out[#out + 1] = rest
  return table.concat(out, "; ")
end

-- A setting's state: "show", "hide", or its conditions ending in "hide", or in
-- "fade" when Mouseover is checked. Nothing checked shows always.
function V.State(mode, when)
  if V.Mode(mode) == "hidden" then return "hide" end
  local set = V.Checked(mode, when)
  if not next(set) then return "show" end
  return compile(set, set.mouseover and "fade" or "hide")
end

-- The secure visibility driver for a state: a fading or dimmed frame is always shown (by alpha).
function V.Driver(state)
  return (state:find("fade") or state:find("dim")) and "show" or state
end

-- Whether a driver depends on conditions (rather than always showing or hiding).
function V.Conditional(driver)
  return driver:find("[", 1, true) ~= nil
end

-- What a state says right now: the client's answer, or (without the parser) its last clause.
function V.Parse(state)
  if type(SecureCmdOptionParse) == "function" then return SecureCmdOptionParse(state) end
  return state:match("(%a+)$")
end

-- Applying -------------------------------------------------------------------------------------

-- The states that fade a frame by alpha ("fade") or dim it ("dim"); the others show or hide it.
V.FADING = { fade = true, dim = true }

-- 1 unless the frame fades or dims and the mouse isn't over it (nor is it revealed, as
-- action bars are while you drag a spell, nor lingering after Auto-hide); then 0, or
-- the calm alpha for a dimmed frame (the Calm HUD's unit frames, which stay clickable).
function V.Alpha(frame)
  local state = frame.vgState
  local fading = V.FADING[state]
  if not fading or vgHover[frame] or frame.vgReveal or frame.vgLingering then return 1 end
  return state == "dim" and T.ALPHA.calm or 0
end

-- Keeps an Auto-hide frame shown for V.LINGER seconds from now (a later call
-- restarts the wait), then lets it fade. Without the client's timer it just fades.
function V.Linger(frame)
  local token = (frame.vgLingerCount or 0) + 1
  frame.vgLingerCount = token
  frame.vgLingering = ns.HasTimer() or nil
  if frame.vgLingering then C_Timer.After(V.LINGER, ns.Guard("timer end linger", function() V.EndLinger(frame, token) end)) end
  V.Refresh(frame)
end

-- The wait that started as `token` is over: the frame fades, unless a later wait replaced it.
function V.EndLinger(frame, token)
  if frame.vgLingerCount ~= token then return end
  frame.vgLingering = nil
  V.Refresh(frame)
end

-- Fades a plain (never secure) frame out `seconds` from now with T.FadeOut,
-- unless a later call restarted the wait (the token pattern of V.Linger), as
-- the Instance prep card and the Chat watch toast do each time they show.
-- Without the client's timer the frame stays until it is closed.
function ns.AutoHide(frame, seconds)
  local token = (vgAutoHideCount[frame] or 0) + 1
  vgAutoHideCount[frame] = token
  if not ns.HasTimer() then return end
  C_Timer.After(seconds, ns.Guard("timer auto hide", function()
    if vgAutoHideCount[frame] == token then T.FadeOut(frame) end
  end))
end

-- Where you are, as the client's instance type (IsInInstance's second
-- return): "party" (a dungeon), "raid", "pvp" (a battleground), "arena",
-- "scenario"; "none" outside an instance, and also when the client can't say
-- (no IsInInstance, a hidden or empty type). Never secret, never nil, so
-- callers compare it freely; Instance prep and Situations build on it.
function ns.Where()
  if type(IsInInstance) ~= "function" then return "none" end
  local inside, kind = IsInInstance()
  if inside ~= true or ns.IsSecret(kind) or type(kind) ~= "string" or kind == "" then return "none" end
  return kind
end

-- Whether the frame's state shows it, and whether it fades with the mouse.
function V.Shows(frame) return frame.vgState ~= "hide" end
function V.Fades(frame) return frame.vgStateString ~= nil and frame.vgStateString:find("fade") ~= nil end

-- Paints the frame's alpha and tells its owner the state (to show or hide it).
function V.Refresh(frame)
  frame:SetAlpha(V.Alpha(frame))
  if frame.vgOnState then frame.vgOnState(frame) end
end

-- The client changed the frame's "vgvis" state: note it and repaint.
local function onAttribute(frame, name, value)
  if name ~= "state-vgvis" then return end
  frame.vgState = value
  V.Refresh(frame)
end

-- Lets a frame feel the mouse (not its clicks) while it fades with it.
local function motion(frame)
  if frame.vgMotion or not V.Fades(frame) then return end
  frame.vgMotion = true
  frame:SetMouseMotionEnabled(true)
  frame:SetMouseClickEnabled(false)
end

-- Keeps the frame's instance and auto-hide flags for a setting (ApplyNow and ApplySecureNow read them back);
-- returns the setting's state.
local function noteMode(frame, mode, when)
  frame.vgInstance = V.Mode(mode) ~= "hidden" and V.Checked(mode, when).instance == true
  frame.vgAutoHide = V.Mode(mode) == "autohide"
  return V.State(mode, when)
end

-- Repaints a frame after its state is applied; an Auto-hide frame lingers first.
local function settle(frame)
  if frame.vgAutoHide then return V.Linger(frame) end
  V.Refresh(frame)
end

-- Registers a frame's state driver for a setting now (out of combat only), and repaints it.
function V.ApplyNow(frame, mode, when)
  V.ApplyState(frame, noteMode(frame, mode, when))
  settle(frame)
end

-- As V.ApplyNow, and also registers the frame's "visibility" driver (secure: out of combat only), which the
-- client uses to show and hide a protected frame such as the menu strip.
function V.ApplySecureNow(frame, mode, when)
  local state = noteMode(frame, mode, when)
  RegisterStateDriver(frame, "visibility", V.Driver(state))
  V.ApplyState(frame, state)
  settle(frame)
end

-- Registers a state string as the frame's "vgvis" driver (out of combat only); the caller repaints (V.Refresh).
function V.ApplyState(frame, state)
  if not frame.vgStateString then frame:HookScript("OnAttributeChanged", ns.Guard("visibility state", onAttribute)) end
  frame.vgStateString, frame.vgState = state, V.Parse(state)
  RegisterStateDriver(frame, "vgvis", state)
  if frame.vgHoverRoot then motion(frame) end
end

-- Registers the frame's drivers again with reapply() on every zone change while
-- its setting checks In an instance (out of combat; one entry per frame).
function V.Track(frame, reapply)
  V.tracked[frame] = reapply
end

-- A zone change: frames that check In an instance get their drivers again.
local function onZone()
  for frame, reapply in pairs(V.tracked) do
    if frame.vgInstance then ns.OutOfCombat(reapply, frame) end
  end
end
ns.On("PLAYER_ENTERING_WORLD", onZone)
ns.On("ZONE_CHANGED_NEW_AREA", onZone)

-- The mouse came over the frame or a frame in it.
local function hoverEnter(f)
  local frame = vgHoverOf[f]
  vgHover[frame] = true
  V.Refresh(frame)
end

-- The mouse left: the frame fades unless the mouse is still over it (moving
-- between its buttons crosses the frame itself); an Auto-hide frame lingers first.
local function hoverLeave(f)
  local frame = vgHoverOf[f]
  vgHover[frame] = frame.vgHoverRoot:IsMouseOver() == true
  if frame.vgAutoHide and not vgHover[frame] then return V.Linger(frame) end
  V.Refresh(frame)
end

-- Follows the mouse over a frame and every frame inside it (nothing polls).
local function hookHover(f, frame)
  vgHoverOf[f] = frame
  f:HookScript("OnEnter", ns.Guard("visibility hover", hoverEnter))
  f:HookScript("OnLeave", ns.Guard("visibility hover", hoverLeave))
  for _, child in ipairs({ f:GetChildren() }) do hookHover(child, frame) end
end

-- Watches the mouse over frame and the frames in it, for fading on mouseover.
function V.WatchHover(frame)
  frame.vgHoverRoot = frame
  hookHover(frame, frame)
end

-- Options --------------------------------------------------------------------------------------

-- The mode a checklist is saved as: none checked is Always, Mouseover or Combat
-- alone is that mode (as profiles saved before the checklist hold it), else custom.
function V.ModeOf(set)
  local only
  for key in pairs(set) do
    if only then return "custom" end
    only = key
  end
  if not only then return "always" end
  return V.PRESETS[only] and only or "custom"
end

-- Flips one condition of the setting in t (starting from what its mode shows on).
function V.Toggle(acc, key)
  local t, set = acc.tbl(), {}
  for k, on in pairs(V.Checked(t[acc.modeKey], t[acc.whenKey])) do set[k] = on or nil end
  set[key] = not set[key] or nil
  t[acc.whenKey], t[acc.modeKey] = set, V.ModeOf(set)
  acc.after()
end

-- The options rows for a visibility setting kept in tbl()[modeKey], its checklist in tbl()[whenKey]: the
-- mode (one of modes, V.MODES unless given), then the checklist. after() applies a change. opts =
-- { caption, tbl, modeKey, whenKey, after, initial, modes }; the checklist keeps opts for its own reads.
function V.Rows(opts)
  local tbl, modeKey, after = opts.tbl, opts.modeKey, opts.after
  return { "cycle", opts.caption, opts.modes or V.MODES, function() return V.Mode(tbl()[modeKey]) end,
    function(v) tbl()[modeKey] = v after() end, opts.initial }, { "showwhen", L["Show when"], opts }
end

-- Lights the chips of the conditions the setting shows on.
local function refreshChips(r)
  local t = r.acc.tbl()
  local set = V.Checked(t[r.acc.modeKey], t[r.acc.whenKey])
  for _, s in ipairs(r.chips) do
    s.fill:SetShown(set[s.key] == true)
    T.Tint(s.fill, "accent")
    T.Color(s.text, set[s.key] and "void" or "text2")
  end
end

-- A chip's height, its least width and the air either side of its label, and the room the row keeps at its
-- right (the same 8 as every other row's control, so the last chip stays clear of the card's border).
local CHIP = { h = 20, min = 44, air = 8, edge = 8 }

-- One condition's chip: its label, an accent fill while checked, as wide as its label as drawn; a click flips it.
local function chip(r, c)
  local s = T.Button(CreateFrame("Button", nil, r))
  s.key, s.fill = c[1], W.Flat(s, "ARTWORK", "accent")
  s.fill:SetAllPoints()
  s.text = T.Text(s:CreateFontString(nil, "OVERLAY"), "small")
  s.text:SetPoint("CENTER")
  s.text:SetText(c[2])
  s:SetSize(math.max(CHIP.min, math.ceil(s.text:GetStringWidth()) + 2 * CHIP.air), CHIP.h)
  s:SetScript("OnClick", ns.Guard("click visibility chip", function() V.Toggle(r.acc, c[1]) T.Sound("on") ns.Options.Refresh() end))
  return s
end

-- How wide the chips are side by side, one pixel apart.
local function chipsWidth(r)
  local width = -1
  for _, s in ipairs(r.chips) do width = width + s:GetWidth() + 1 end
  return width
end

-- Lines the chips up one pixel apart from the row's right edge, CHIP.edge in, beside the caption.
local function chipsBeside(r)
  for i, s in ipairs(r.chips) do
    local after = r.chips[i + 1]
    if after then s:SetPoint("RIGHT", after, "LEFT", -1, 0) else s:SetPoint("RIGHT", r, "RIGHT", -CHIP.edge, 0) end
  end
end

-- Lays the chips in lines under the caption, left to right, a new line when the next one would pass the row's
-- right edge; returns how far down the last line ends.
local function chipsUnder(r)
  local x, y, room = 0, -W.ROW_HEIGHT, r:GetWidth() - CHIP.edge
  for _, s in ipairs(r.chips) do
    if x > 0 and x + s:GetWidth() > room then x, y = 0, y - CHIP.h - 1 end
    s:SetPoint("TOPLEFT", r, "TOPLEFT", x, y)
    x = x + s:GetWidth() + 1
  end
  return CHIP.h - y
end

-- Places the chips: beside the caption when they fit there, else in lines under it (a translation often runs
-- longer than the English), the caption then on the first line and the row as tall as they need (row.grownHeight).
local function placeChips(r)
  if r.label:GetStringWidth() + T.SPACE.gap + chipsWidth(r) + CHIP.edge <= r:GetWidth() then return chipsBeside(r) end
  r.grownHeight = chipsUnder(r) + T.SPACE.tight
  r:SetHeight(r.grownHeight)
  r.label:ClearAllPoints()
  r.label:SetPoint("LEFT", r, "TOPLEFT", 0, -W.ROW_HEIGHT / 2)
end

-- The checklist row: its caption, then a chip per condition along the right edge.
local function checklistRow(parent, row, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width - 8, W.ROW_HEIGHT)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.label:SetPoint("LEFT", 0, 0)
  r.label:SetText(row[2])
  r.acc, r.chips, r.Refresh = row[3], {}, refreshChips
  for i = #V.CONDITIONS, 1, -1 do table.insert(r.chips, 1, chip(r, V.CONDITIONS[i])) end
  placeChips(r)
  r:Refresh()
  return r
end

ns.Options.AddRowKind("showwhen", checklistRow, 28)
