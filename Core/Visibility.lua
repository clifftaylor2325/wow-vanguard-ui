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
-- (fade counts as shown), and every frame gets it as the "fuivis" state, whose
-- changes come back through OnAttributeChanged. "fade" fades the frame by
-- alpha until the mouse is over it, since mouseover is not a macro condition;
-- alpha is safe in combat. "In an instance" is not one either: it is read when
-- the driver is registered and again on every zone change (out of combat).

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local V = {}
ns.Visibility = V

-- Each condition: its key in a checklist, its chip's label, and its macro
-- condition (none for mouseover and instance, which are handled here).
V.CONDITIONS = {
  { "combat", "Combat", "[combat]" }, { "mouseover", "Mouseover" }, { "group", "Group", "[group]" },
  { "raid", "Raid", "[group:raid]" }, { "instance", "Instance" }, { "vehicle", "Vehicle", "[vehicleui]" },
  { "resting", "Resting", "[resting]" },
}
-- The choices of a visibility row; "custom" is the checklist.
V.MODES = { { "always", "Always" }, { "mouseover", "On mouseover" }, { "combat", "In combat" }, { "hidden", "Hidden" }, { "custom", "When checked below" } }
-- The menu bar's choices: those, and Auto-hide (shown at login and under the
-- mouse, then faded V.LINGER seconds after the mouse leaves).
V.MENU_MODES = { V.MODES[1], V.MODES[2], { "autohide", "Auto-hide after 10 s" }, V.MODES[3], V.MODES[4], V.MODES[5] }
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

-- The secure visibility driver for a state: a fading frame is always shown (it fades by alpha).
function V.Driver(state)
  return state:find("fade") and "show" or state
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

-- 1 unless the frame fades and the mouse isn't over it (nor is it revealed, as
-- action bars are while you drag a spell, nor lingering after Auto-hide), else 0.
function V.Alpha(frame)
  if frame.fuiState ~= "fade" or frame.fuiHover or frame.fuiReveal or frame.fuiLingering then return 1 end
  return 0
end

-- Keeps an Auto-hide frame shown for V.LINGER seconds from now (a later call
-- restarts the wait), then lets it fade. Without the client's timer it just fades.
function V.Linger(frame)
  local token = (frame.fuiLingerCount or 0) + 1
  frame.fuiLingerCount = token
  frame.fuiLingering = type(C_Timer) == "table" and type(C_Timer.After) == "function" or nil
  if frame.fuiLingering then C_Timer.After(V.LINGER, function() V.EndLinger(frame, token) end) end
  V.Refresh(frame)
end

-- The wait that started as `token` is over: the frame fades, unless a later wait replaced it.
function V.EndLinger(frame, token)
  if frame.fuiLingerCount ~= token then return end
  frame.fuiLingering = nil
  V.Refresh(frame)
end

-- Whether the frame's state shows it, and whether it fades with the mouse.
function V.Shows(frame) return frame.fuiState ~= "hide" end
function V.Fades(frame) return frame.fuiStateString ~= nil and frame.fuiStateString:find("fade") ~= nil end

-- Paints the frame's alpha and tells its owner the state (to show or hide it).
function V.Refresh(frame)
  frame:SetAlpha(V.Alpha(frame))
  if frame.fuiOnState then frame.fuiOnState(frame) end
end

-- The client changed the frame's "fuivis" state: note it and repaint.
local function onAttribute(frame, name, value)
  if name ~= "state-fuivis" then return end
  frame.fuiState = value
  V.Refresh(frame)
end

-- Lets a frame feel the mouse (not its clicks) while it fades with it.
local function motion(frame)
  if frame.fuiMotion or not V.Fades(frame) then return end
  frame.fuiMotion = true
  frame:SetMouseMotionEnabled(true)
  frame:SetMouseClickEnabled(false)
end

-- Registers a frame's state driver for a setting now (out of combat only), and
-- with secure, its visibility driver too; onState(frame) runs on every change.
function V.ApplyNow(frame, mode, when, secure)
  local state = V.State(mode, when)
  if not frame.fuiStateString then frame:HookScript("OnAttributeChanged", onAttribute) end
  frame.fuiStateString, frame.fuiState = state, V.Parse(state)
  frame.fuiInstance = V.Mode(mode) ~= "hidden" and V.Checked(mode, when).instance == true
  frame.fuiAutoHide = V.Mode(mode) == "autohide"
  if secure then RegisterStateDriver(frame, "visibility", V.Driver(state)) end
  RegisterStateDriver(frame, "fuivis", state)
  if frame.fuiHoverRoot then motion(frame) end
  if frame.fuiAutoHide then return V.Linger(frame) end
  V.Refresh(frame)
end

-- Registers the frame's drivers again with reapply() on every zone change while
-- its setting checks In an instance (out of combat; one entry per frame).
function V.Track(frame, reapply)
  V.tracked[frame] = reapply
end

-- A zone change: frames that check In an instance get their drivers again.
local function onZone()
  for frame, reapply in pairs(V.tracked) do
    if frame.fuiInstance then ns.OutOfCombat(reapply, frame) end
  end
end
ns.On("PLAYER_ENTERING_WORLD", onZone)
ns.On("ZONE_CHANGED_NEW_AREA", onZone)

-- The mouse came over the frame or a frame in it.
local function hoverEnter(f)
  local frame = f.fuiHoverOf
  frame.fuiHover = true
  V.Refresh(frame)
end

-- The mouse left: the frame fades unless the mouse is still over it (moving
-- between its buttons crosses the frame itself); an Auto-hide frame lingers first.
local function hoverLeave(f)
  local frame = f.fuiHoverOf
  frame.fuiHover = frame.fuiHoverRoot:IsMouseOver() == true
  if frame.fuiAutoHide and not frame.fuiHover then return V.Linger(frame) end
  V.Refresh(frame)
end

-- Follows the mouse over a frame and every frame inside it (nothing polls).
local function hookHover(f, frame)
  f.fuiHoverOf = frame
  f:HookScript("OnEnter", hoverEnter)
  f:HookScript("OnLeave", hoverLeave)
  for _, child in ipairs({ f:GetChildren() }) do hookHover(child, frame) end
end

-- Watches the mouse over frame and the frames in it, for fading on mouseover.
function V.WatchHover(frame)
  frame.fuiHoverRoot = frame
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

-- The options rows for a visibility setting kept in tbl()[modeKey], its checklist
-- in tbl()[whenKey]: the mode (one of modes, V.MODES unless given), then the
-- checklist. after() applies a change.
function V.Rows(caption, tbl, modeKey, whenKey, after, initial, modes)
  local acc = { tbl = tbl, modeKey = modeKey, whenKey = whenKey, after = after }
  return { "cycle", caption, modes or V.MODES, function() return V.Mode(tbl()[modeKey]) end,
    function(v) tbl()[modeKey] = v after() end, initial }, { "showwhen", "Show when", acc }
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

-- One condition's chip: its label, an accent fill while checked; a click flips it.
local function chip(r, c)
  local s = T.Button(CreateFrame("Button", nil, r))
  s:SetSize(math.max(44, #c[2] * 7 + 16), 20)
  s.key, s.fill = c[1], W.Flat(s, "ARTWORK", "accent")
  s.fill:SetAllPoints()
  s.text = T.Text(s:CreateFontString(nil, "OVERLAY"), "small")
  s.text:SetPoint("CENTER")
  s.text:SetText(c[2])
  s:SetScript("OnClick", function() V.Toggle(r.acc, c[1]) T.Sound("on") ns.Options.Refresh() end)
  return s
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
  for i, s in ipairs(r.chips) do s:SetPoint("RIGHT", r.chips[i + 1] or r, r.chips[i + 1] and "LEFT" or "RIGHT", -1, 0) end
  r:Refresh()
  return r
end

ns.Options.AddRowKind("showwhen", checklistRow, 28)
