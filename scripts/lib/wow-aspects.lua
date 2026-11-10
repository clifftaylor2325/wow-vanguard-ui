-- Secret aspects for the TEST-ONLY client: what a widget does once it has been given a secret.
-- Loads after wow-taint.lua and before the addon. Never shipped in game.
--
-- The rules are the client's API documentation (Blizzard_APIDocumentationGenerated, both the forever
-- branch and Retail 12.1.5 carry the same flags for every method below):
--  * SecretArguments: who may hand a method a secret. "AllowedWhenTainted" methods take one from the
--    addon (TAINTED_OK below); "AllowedWhenUntainted" and "NotAllowed" ones (REFUSED) raise the client's
--    error when the addon's code passes one ("bad argument #1 to 'SetShown' (Secret values are only
--    allowed during untainted execution for this argument.)", as Cliff saw it in game).
--  * SecretArgumentsAddAspect: a secret given to such a setter, by the addon where it may or by the
--    game's own code, gives the widget that aspect (SetShown -> Shown, SetAlpha -> Alpha, SetText ->
--    Text, SetValue -> BarValue ...), and nothing clears it (warcraft.wiki.gg Secret aspects: only
--    SetToDefaults does, which the harness does not model).
--  * SecretReturnsForAspect: from then on the matching getters (GETTERS) answer the addon with fresh
--    secrets (IsShown, GetAlpha, GetText, GetValue ...). IsVisible, GetEffectiveAlpha and
--    GetEffectiveScale are secret when the widget or any parent holds the aspect.
--  * A secret given to a setter with no aspect (SetTexture, or SetPoint and SetSize from the game's
--    code) marks the object as having secret values and its anchoring secret: its geometry getters
--    (SecretWhenAnchoringSecret, wow-taint.lua's GEOMETRY) answer with secrets, and so do those of
--    anything anchored to it, until ClearAllPoints ("Clearing anchor points can reset this state").
--
-- The game's own code may hand any setter a secret, so a secret from the harness's files (the client's
-- C side) or from a test's Lua (standing in for Blizzard's) gives the aspect without an error; the value
-- the stub keeps is the plain one it hides. world.holdSecret(widget, aspect, ...) says "the client holds
-- this widget's Shown (Alpha, Text, BarValue, Anchoring...) secret" without changing it, and
-- world.secretAspects("strict") makes every frame of the game's (UIParent aside) hold Shown, Alpha, Text
-- and BarValue secret, the smoke run's worst case.
--
-- Only the addon's own code gets a secret back from a getter: untainted code may use a secret as the
-- value it hides, so the harness's and the tests' code read the plain value. Game Lua that the addon
-- calls is not treated as tainted (the addon's direct calls are; ShowUIPanel's rule is the exception).

local stub = __wfgStub
local type = __wfgRawType
local methods = stub.methods
local world = stub.world
local callerOf, byAddon, where = stub.callerOf, stub.byAddon, stub.where

-- Enum.SecretAspect (SecretAspectConstantsDocumentation.lua:6-43; the object aspects share the value 1).
Enum.SecretAspect = {
  ObjectDebug = 1, ObjectName = 1, ObjectType = 1, ObjectSecrets = 1, ObjectSecurity = 1, Attributes = 1, Hierarchy = 1,
  ID = 2, Toplevel = 4, Text = 8, SecureText = 16, Shown = 32, Scale = 64, Alpha = 128, FrameLevel = 256,
  ScrollRange = 512, Cursor = 1024, VertexColor = 2048, Desaturation = 4096, TexCoords = 8192, BarValue = 16384,
  Cooldown = 32768, Rotation = 65536, MinimumWidth = 131072, Padding = 262144, CooldownStyle = 524288,
  TooltipTexture = 1048576, ButtonState = 2097152, ScrollOffset = 4194304, RadialProgress = 8388608, FrameStrata = 16777216,
}

-- The aspect name for each Enum.SecretAspect value (the object aspects' shared 1 reads as Hierarchy).
local ASPECT_NAME = {}
for name, value in pairs(Enum.SecretAspect) do ASPECT_NAME[value] = ASPECT_NAME[value] or name end
ASPECT_NAME[1] = "Hierarchy"

-- The setters the addon may hand a secret, by widget kind ("*" any kind), with the aspects a secret adds (none:
-- the object then has secret values and secret anchoring). SimpleFrameAPIDocumentation.lua:1134-1150 (SetAlpha,
-- SetAlphaFromBoolean), :1271 (SetID); SimpleRegionAPIDocumentation.lua:123-145, :191-216; SimpleFontStringAPIDocumentation.lua
-- :664-690 (SetText, SetFormattedText, SetTextColor); SimpleStatusBarAPIDocumentation.lua:229, :282, :355;
-- SimpleTextureBaseAPIDocumentation.lua:417-580; FrameAPICooldownDocumentation.lua (SetDraw*, SetSwipeColor).
local COLOR = { "VertexColor", "Alpha" }
local TAINTED_OK = {
  SetAlpha = { ["*"] = { "Alpha" } }, SetAlphaFromBoolean = { ["*"] = { "Alpha" } }, SetID = { ["*"] = { "ID" } },
  SetVertexColor = { Texture = COLOR, FontString = COLOR }, SetTextColor = { FontString = COLOR },
  SetText = { FontString = { "Text" } }, SetFormattedText = { FontString = { "Text" } },
  SetValue = { StatusBar = { "BarValue" } }, SetMinMaxValues = { StatusBar = { "BarValue" } }, SetStatusBarColor = { StatusBar = COLOR },
  SetTexCoord = { Texture = { "TexCoords" } }, SetRotation = { Texture = { "Rotation" } },
  SetDesaturated = { Texture = { "Desaturation" } }, SetDesaturation = { Texture = { "Desaturation" } },
  SetTexture = { Texture = {} }, SetAtlas = { Texture = {} }, SetColorTexture = { Texture = {} },
  SetDrawSwipe = { Cooldown = { "CooldownStyle" } }, SetDrawEdge = { Cooldown = { "CooldownStyle" } },
  SetDrawBling = { Cooldown = { "CooldownStyle" } }, SetSwipeColor = { Cooldown = { "CooldownStyle" } },
}

-- The aspect a secret from the game's code adds through a setter that refuses the addon's (SecretArgumentsAddAspect on
-- an "AllowedWhenUntainted" method: SimpleScriptRegionAPIDocumentation.lua:725-728 SetShown, SimpleFrameAPIDocumentation.lua
-- :1281 SetFrameLevel, :1472 SetScale, :1484 SetShown; SimpleButtonAPIDocumentation.lua:336 SetEnabled, :476 SetText;
-- SimpleEditBoxAPIDocumentation.lua SetText, Insert, SetCursorPosition; FrameAPICooldownDocumentation.lua SetCooldown).
-- Any other refused setter given a secret by the game's code leaves the object with secret values and secret anchoring.
local GAME_ASPECTS = {
  SetShown = { "Shown" }, SetScale = { "Scale" }, SetFrameLevel = { "FrameLevel" }, SetFrameStrata = { "FrameStrata" },
  SetToplevel = { "Toplevel" }, SetEnabled = { "ButtonState" }, SetButtonState = { "ButtonState" }, SetText = { "Text" },
  Insert = { "Text" }, SetCursorPosition = { "Cursor" }, SetCooldown = { "Cooldown" }, SetCooldownDuration = { "Cooldown" },
  SetVerticalScroll = { "ScrollOffset" }, SetHorizontalScroll = { "ScrollOffset" },
}

-- The widget methods that take arguments and refuse a secret from the addon's code (SecretArguments = "AllowedWhenUntainted"
-- or "NotAllowed" in the docs files above, for the kinds wow-widget-api.lua lists them on; a name TAINTED_OK allows on a
-- kind is allowed there). Methods whose arguments are never values (Create*, scripts, events) are left out.
local REFUSED = {
  "AddHistoryLine", "AddMaskTexture", "AdjustPointsOffset", "ClearPoint", "Click", "DisableDrawLayer", "EnableDrawLayer",
  "EnableKeyboard", "EnableMouse", "EnableMouseMotion", "EnableMouseWheel", "GetAttribute", "GetHeight", "GetPoint",
  "GetPointByName", "GetSize", "GetWidth", "HighlightText", "Insert", "IsMouseOver", "RemoveMaskTexture", "SetAllPoints",
  "SetAttribute", "SetAutoFocus", "SetBlendMode", "SetButtonState", "SetChecked", "SetCheckedTexture", "SetClampRectInsets",
  "SetClampedToScreen", "SetClipsChildren", "SetCooldown", "SetCooldownDuration", "SetCooldownFromDurationObject",
  "SetCountInvisibleLetters", "SetCountdownAbbrevThreshold", "SetCountdownFont", "SetCountdownFormatter", "SetCursorPosition",
  "SetDisabledCheckedTexture", "SetDisabledFontObject", "SetDisabledTexture", "SetDontSavePosition", "SetDrawLayer",
  "SetEnabled", "SetFadeDuration", "SetFading", "SetFillStyle", "SetFixedFrameLevel", "SetFixedFrameStrata", "SetFont",
  "SetFontObject", "SetFontString", "SetFrameLevel", "SetFrameStrata", "SetGradient", "SetHeight", "SetHideCountdownNumbers",
  "SetHighlightFontObject", "SetHighlightTexture", "SetHistoryLines", "SetHitRectInsets", "SetHorizTile", "SetHorizontalScroll",
  "SetHyperlinksEnabled", "SetIgnoreParentAlpha", "SetIgnoreParentScale", "SetIndentedWordWrap", "SetIsFrameBuffer",
  "SetJustifyH", "SetJustifyV", "SetMask", "SetMaxBytes", "SetMaxLetters", "SetMaxLines", "SetMinMaxValues",
  "SetMinimumCountdownDuration", "SetMotionScriptsWhileDisabled", "SetMouseClickEnabled", "SetMouseMotionEnabled",
  "SetMovable", "SetMultiLine", "SetNonSpaceWrap", "SetNormalFontObject", "SetNormalTexture", "SetNumeric",
  "SetObeyStepOnDrag", "SetOrientation", "SetParent", "SetPassThroughButtons", "SetPoint", "SetPropagateKeyboardInput",
  "SetPushedTexture", "SetResizable", "SetResizeBounds", "SetReverse", "SetReverseFill", "SetRotatesTexture", "SetScale",
  "SetScrollChild", "SetShadowColor", "SetShadowOffset", "SetShown", "SetSize", "SetSnapToPixelGrid", "SetSpacing",
  "SetStatusBarTexture", "SetStepsPerPage", "SetSwipeTexture", "SetTexelSnappingBias", "SetText", "SetTextColor",
  "SetTextHeight", "SetTextInsets", "SetTextScale", "SetTextureSliceMargins", "SetThumbTexture", "SetTimeVisible",
  "SetToplevel", "SetUserPlaced", "SetValue", "SetValueStep", "SetVertTile", "SetVertexOffset", "SetVerticalScroll",
  "SetWidth", "SetWordWrap", "StartMoving", "StartSizing",
}

-- The getters that answer the addon with secrets while the widget holds one of the aspects (SecretReturnsForAspect:
-- SimpleScriptRegionAPIDocumentation.lua:568-570 IsShown; SimpleRegionAPIDocumentation.lua GetAlpha, GetVertexColor, GetScale;
-- SimpleFrameAPIDocumentation.lua GetAlpha, GetFrameLevel, GetFrameStrata, GetID, GetChildren, GetRegions, IsShown;
-- SimpleFontStringAPIDocumentation.lua GetText, GetTextColor; SimpleStatusBarAPIDocumentation.lua GetValue, GetMinMaxValues,
-- GetStatusBarColor; SimpleButtonAPIDocumentation.lua GetText, IsEnabled, GetButtonState; SimpleTextureBaseAPIDocumentation.lua
-- GetTexCoord, GetRotation, IsDesaturated; FrameAPICooldownDocumentation.lua GetCooldownTimes, GetCooldownDuration;
-- SimpleScrollFrameAPIDocumentation.lua the scroll offsets; SimpleObjectAPIDocumentation.lua GetParent).
local GETTERS = {
  IsShown = { "Shown" }, GetAlpha = { "Alpha" }, GetVertexColor = COLOR, GetTextColor = COLOR, GetStatusBarColor = COLOR,
  GetText = { "Text" }, GetValue = { "BarValue" }, GetMinMaxValues = { "BarValue" }, GetScale = { "Scale" },
  GetFrameLevel = { "FrameLevel" }, GetFrameStrata = { "FrameStrata" }, GetID = { "ID" }, IsToplevel = { "Toplevel" },
  IsEnabled = { "ButtonState" }, GetButtonState = { "ButtonState" }, GetCooldownTimes = { "Cooldown" },
  GetCooldownDuration = { "Cooldown" }, GetTexCoord = { "TexCoords" }, GetRotation = { "Rotation" },
  IsDesaturated = { "Desaturation" }, GetVerticalScroll = { "ScrollOffset" }, GetHorizontalScroll = { "ScrollOffset" },
  GetChildren = { "Hierarchy" }, GetRegions = { "Hierarchy" }, GetNumChildren = { "Hierarchy" }, GetParent = { "Hierarchy" },
  GetCursorPosition = { "Cursor", "Text" },
}

-- The getters whose answer folds in every parent's: secret when the widget or any parent holds the aspect.
local INHERITED = { IsVisible = "Shown", GetEffectiveAlpha = "Alpha", GetEffectiveScale = "Scale" }

-- What world.secretAspects("strict") makes every frame of the game's hold.
local STRICT = { Shown = true, Alpha = true, Text = true, BarValue = true }

-- Which aspects any widget holds (so a getter on a parentless chain skips the walk when none does).
local anyHeld = {}

-- Holding ------------------------------------------------------------------------------------------

-- Gives a widget aspects (a list of names).
local function hold(w, aspects)
  local held = rawget(w, "__aspects")
  if not held then
    held = {}
    rawset(w, "__aspects", held)
  end
  for _, name in ipairs(aspects) do held[name], anyHeld[name] = true, true end
end

-- Marks a widget as having secret values: its anchoring is secret too (wow-taint.lua's geometry getters).
local function holdValues(w)
  rawset(w, "__secretValues", true)
  rawset(w, "__anchorSecret", true)
  stub.anchorSecrets = true
end

-- Whether a widget holds an aspect: its own, or (strict) as one of the game's frames.
local function holds(w, name)
  local held = rawget(w, "__aspects")
  if held and held[name] then return true end
  return stub.clientAspects ~= nil and stub.clientAspects[name] == true and rawget(w, "__byGame") == true and w ~= UIParent
end

-- Whether a widget holds any of the aspects in a list.
local function holdsAny(w, aspects)
  for _, name in ipairs(aspects) do
    if holds(w, name) then return true end
  end
  return false
end

-- Whether the widget or any parent holds an aspect.
local function chainHolds(w, name)
  local p = w
  while type(p) == "table" do
    if holds(p, name) then return true end
    p = rawget(p, "__parent")
  end
  return false
end

-- The client holds a widget's aspects secret, as its own code would by handing their setters secrets: "Shown",
-- "Alpha", "Text", "BarValue" (any Enum.SecretAspect name), or "Anchoring" for secret anchoring. The values stay.
function world.holdSecret(w, ...)
  for _, name in ipairs({ ... }) do
    if name == "Anchoring" then holdValues(w) else hold(w, { name }) end
  end
end

-- "strict": every frame of the game's (UIParent aside) holds Shown, Alpha, Text and BarValue secret; nil turns it off.
function world.secretAspects(mode)
  assert(mode == nil or mode == false or mode == "strict", "secretAspects: strict or off")
  stub.clientAspects = mode and STRICT or nil
end

-- Values ---------------------------------------------------------------------------------------------

-- Whether a value is a secret (world.secret's, or a test's plain { __secret = true }).
local function marked(v)
  return type(v) == "table" and rawget(v, "__secret") == true
end

-- The position (1-based, self not counted) of the first secret argument, or nil.
local function secretAt(...)
  for i = 1, select("#", ...) do
    if marked((select(i, ...))) then return i end
  end
  return nil
end

-- Each value as a secret, a secret left as it is; nil stays nil.
local function asSecrets(...)
  local out = table.pack(...)
  for i = 1, out.n do
    if out[i] ~= nil and not marked(out[i]) then out[i] = world.secret(out[i]) end
  end
  return table.unpack(out, 1, out.n)
end

-- Each secret as the plain value it hides (what the stub keeps when the game's code sets one).
local function plainValues(...)
  local out = table.pack(...)
  for i = 1, out.n do
    if marked(out[i]) then out[i] = rawget(out[i], "n") end
  end
  return table.unpack(out, 1, out.n)
end

-- Wrapping -------------------------------------------------------------------------------------------

-- Wraps methods[name] when the stub has it, or gives a listed name the stub leaves to its no-op one of its own.
-- The wrappers are pass-throughs for wow-taint.lua's callerOf, so the combat and ownership rules still read the caller.
local function wrap(name, make)
  local orig = methods[name] or function() end
  local wrapped = make(orig, name)
  stub.transparent[wrapped] = true
  methods[name] = wrapped
end

-- The client's error for a secret handed to a method that refuses the addon's, raised at the addon's line.
local function refuse(at, name, i)
  error(string.format("%s: bad argument #%d to '%s' (Secret values are only allowed during untainted execution for this argument.)", where(at), i, name), 0)
end

-- The aspects a secret given to `name` on this widget adds from addon code, or nil when the addon may not give one.
local function taintedAspects(name, w)
  local kinds = TAINTED_OK[name]
  return kinds and (kinds[rawget(w, "__kind")] or kinds["*"])
end

-- Gives a widget what a secret through `name` gives it: the aspects in the list, or secret values when there are none.
local function take(w, aspects)
  if aspects and #aspects > 0 then hold(w, aspects) else holdValues(w) end
end

-- A setter called from `at` with a secret argument at position i: the addon's code is refused unless the method
-- allows it there; an allowed secret is kept as it is, and one from the game's code gives its aspect and is kept as
-- the plain value it hides.
local function secretSet(orig, name, at, self, i, ...)
  local allowed = taintedAspects(name, self)
  if allowed then
    take(self, allowed)
    return orig(self, ...)
  end
  if byAddon(at) then refuse(at, name, i) end
  take(self, GAME_ASPECTS[name])
  return orig(self, plainValues(...))
end

-- A setter: checked only when an argument is a secret.
local function setter(orig, name)
  -- The method as the client runs it.
  return function(self, ...)
    local i = secretAt(...)
    if not i then return orig(self, ...) end
    return secretSet(orig, name, callerOf(1), self, i, ...)
  end
end
local refusedSet = {}
for _, name in ipairs(REFUSED) do
  refusedSet[name] = true
  wrap(name, setter)
end
for name in pairs(TAINTED_OK) do
  if not refusedSet[name] then wrap(name, setter) end
end

-- A getter that answers the addon's code with secrets while the widget holds one of its aspects.
local function getter(aspects)
  return function(orig)
    -- The method as the client runs it.
    return function(self, ...)
      if (rawget(self, "__aspects") == nil and stub.clientAspects == nil) or not byAddon(callerOf(1)) then return orig(self, ...) end
      if not holdsAny(self, aspects) then return orig(self, ...) end
      return asSecrets(orig(self, ...))
    end
  end
end
for name, aspects in pairs(GETTERS) do wrap(name, getter(aspects)) end

-- A getter that folds in its parents (IsVisible): secret for the addon when any of the chain holds the aspect.
local function inherited(name)
  return function(orig)
    -- The method as the client runs it.
    return function(self, ...)
      if not (anyHeld[name] or stub.clientAspects) or not byAddon(callerOf(1)) then return orig(self, ...) end
      if not chainHolds(self, name) then return orig(self, ...) end
      return asSecrets(orig(self, ...))
    end
  end
end
for method, name in pairs(INHERITED) do wrap(method, inherited(name)) end

-- Clearing a region's points resets the secret anchoring its own setters gave it.
wrap("ClearAllPoints", function(orig)
  -- The method, then the anchoring flag off.
  return function(self, ...)
    rawset(self, "__anchorSecret", nil)
    return orig(self, ...)
  end
end)

-- The client's checks ---------------------------------------------------------------------------------
-- SimpleFrameScriptObjectAPIDocumentation.lua:197 (HasAnySecretAspect), :211 (HasSecretAspect), :228 (HasSecretValues);
-- SimpleScriptRegionAPIDocumentation.lua:414 (IsAnchoringSecret).

-- Whether the widget holds an aspect (an Enum.SecretAspect value).
function methods:HasSecretAspect(aspect)
  local name = ASPECT_NAME[aspect]
  return name ~= nil and holds(self, name)
end

-- Whether the widget holds any aspect.
function methods:HasAnySecretAspect()
  for name in pairs(Enum.SecretAspect) do
    if holds(self, name) then return true end
  end
  return false
end

-- Whether the widget was given a secret by a setter with no aspect.
function methods:HasSecretValues() return rawget(self, "__secretValues") == true end

-- Whether the widget's position and size are secret (wow-taint.lua's secret geometry, the flags above included).
function methods:IsAnchoringSecret() return stub.secretGeometryOf(self) end
