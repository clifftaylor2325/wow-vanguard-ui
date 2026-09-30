-- The widget API the test stub allows: real WoW (Retail / Midnight-era)
-- widget methods, script handlers, frame types and templates. Test-only.
--
-- wow-stub.lua resolves a widget method only if it is listed here for that
-- widget's type, so a misspelled or nonexistent method fails the tests the
-- way it fails in game ("attempt to call a nil value"). Add a name only after
-- checking it exists in the client, never to make a test pass.

-- One lookup set (name -> true) from any number of name lists.
local function set(...)
  local out = {}
  for _, list in ipairs({ ... }) do
    for _, name in ipairs(list) do
      out[name] = true
    end
  end
  return out
end

-- Every region (frames, textures, font strings).
local REGION = {
  "AdjustPointsOffset", "ClearAllPoints", "ClearPoint", "ClearPointsOffset",
  "CreateAnimationGroup", "EnableMouse", "EnableMouseMotion", "EnableMouseWheel",
  "GetAlpha", "GetAnimationGroups", "GetBottom", "GetCenter", "GetDebugName",
  "GetEffectiveAlpha", "GetEffectiveScale", "GetHeight", "GetLeft", "GetName",
  "GetNumPoints", "GetObjectType", "GetParent", "GetParentKey", "GetPoint",
  "GetPointByName", "GetRect", "GetRight", "GetScale", "GetScaledRect",
  "GetScript", "GetSize", "GetSourceLocation", "GetTop", "GetWidth",
  "HasScript", "Hide", "HookScript", "IsAnchoringRestricted", "IsDragging",
  "IsForbidden", "IsIgnoringParentAlpha", "IsIgnoringParentScale",
  "IsMouseClickEnabled", "IsMouseEnabled", "IsMouseMotionEnabled",
  "IsMouseMotionFocus", "IsMouseOver", "IsMouseWheelEnabled", "IsObjectType",
  "IsProtected", "IsRectValid", "IsShown", "IsVisible", "SetAllPoints",
  "SetAlpha", "SetAlphaFromBoolean", "SetHeight", "SetIgnoreParentAlpha", "SetIgnoreParentScale",
  "SetMouseClickEnabled", "SetMouseMotionEnabled", "SetParent", "SetParentKey",
  "SetPassThroughButtons", "SetPoint", "SetScale", "SetScript", "SetShown", "SetSize",
  "SetWidth", "Show", "StopAnimating",
}

-- Textures, font strings and lines.
local LAYERED = {
  "GetDrawLayer", "GetVertexColor", "SetDrawLayer", "SetVertexColor",
}

local TEXTURE = {
  "AddMaskTexture", "GetAtlas", "GetBlendMode", "GetRotation", "GetTexCoord",
  "GetTexture", "GetTextureFileID", "IsDesaturated", "RemoveMaskTexture",
  "SetAtlas", "SetBlendMode", "SetColorTexture", "SetDesaturated",
  "SetDesaturation", "SetGradient", "SetHorizTile", "SetMask", "SetRotation",
  "SetSnapToPixelGrid", "SetTexCoord", "SetTexelSnappingBias", "SetTexture",
  "SetVertTile", "SetVertexOffset",
}

-- Shared by font strings and edit boxes (FontInstance).
local FONT = {
  "GetFont", "GetFontObject", "GetJustifyH", "GetJustifyV", "GetShadowColor",
  "GetShadowOffset", "GetSpacing", "GetTextColor", "SetFont", "SetFontObject",
  "SetJustifyH", "SetJustifyV", "SetShadowColor", "SetShadowOffset",
  "SetSpacing", "SetTextColor",
}

local FONT_STRING = {
  "CanNonSpaceWrap", "CanWordWrap", "GetLineHeight", "GetMaxLines",
  "GetNumLines", "GetStringHeight", "GetStringWidth", "GetText", "GetTextScale",
  "GetUnboundedStringWidth", "IsTruncated", "SetFormattedText",
  "SetIndentedWordWrap", "SetMaxLines", "SetNonSpaceWrap", "SetText",
  "SetTextHeight", "SetTextScale", "SetWordWrap",
}

local FRAME = {
  "CreateFontString", "CreateLine", "CreateMaskTexture", "CreateTexture",
  "DisableDrawLayer", "DoesClipChildren", "EnableDrawLayer", "EnableKeyboard",
  "GetAttribute", "GetChildren", "GetFrameLevel", "GetFrameStrata", "GetID",
  "GetNumChildren", "GetRegions", "IsClampedToScreen", "IsEventRegistered",
  "IsKeyboardEnabled", "IsMovable", "IsResizable", "IsToplevel", "IsUserPlaced",
  "Lower", "Raise", "RegisterAllEvents", "RegisterEvent", "RegisterForDrag",
  "RegisterUnitEvent", "SetAttribute", "SetClampRectInsets",
  "SetClampedToScreen", "SetClipsChildren", "SetDontSavePosition",
  "SetFixedFrameLevel", "SetFixedFrameStrata", "SetFrameLevel",
  "SetFrameStrata", "SetHitRectInsets", "SetHyperlinksEnabled", "SetID",
  "SetMovable", "SetPropagateKeyboardInput", "SetResizable",
  "SetResizeBounds", "SetToplevel", "SetUserPlaced", "StartMoving",
  "StartSizing", "StopMovingOrSizing", "UnregisterAllEvents",
  "UnregisterEvent",
}

local BUTTON = {
  "Click", "Disable", "Enable", "GetButtonState", "GetDisabledTexture",
  "GetFontString", "GetHighlightTexture", "GetNormalTexture",
  "GetPushedTexture", "GetText", "IsEnabled", "LockHighlight",
  "RegisterForClicks", "SetButtonState", "SetDisabledTexture", "SetEnabled",
  "SetFontString", "SetHighlightTexture", "SetNormalFontObject",
  "SetNormalTexture", "SetPushedTexture", "SetText", "UnlockHighlight",
}

local SCROLL_FRAME = {
  "GetHorizontalScroll", "GetHorizontalScrollRange", "GetScrollChild",
  "GetVerticalScroll", "GetVerticalScrollRange", "SetHorizontalScroll",
  "SetScrollChild", "SetVerticalScroll", "UpdateScrollChildRect",
}

local EDIT_BOX = {
  "AddHistoryLine", "ClearFocus", "Disable", "Enable", "GetCursorPosition",
  "GetMaxBytes", "GetMaxLetters", "GetNumLetters", "GetText", "HasFocus",
  "HighlightText", "Insert", "IsAutoFocus", "IsEnabled", "IsMultiLine",
  "IsNumeric", "SetAutoFocus", "SetCountInvisibleLetters",
  "SetCursorPosition", "SetEnabled", "SetFocus", "SetHistoryLines",
  "SetMaxBytes", "SetMaxLetters", "SetMultiLine", "SetNumeric", "SetText",
  "SetTextInsets",
}

local STATUS_BAR = {
  "GetFillStyle", "GetMinMaxValues", "GetOrientation", "GetReverseFill",
  "GetRotatesTexture", "GetStatusBarColor", "GetStatusBarTexture", "GetValue",
  "SetFillStyle", "SetMinMaxValues", "SetOrientation", "SetReverseFill",
  "SetRotatesTexture", "SetStatusBarColor", "SetStatusBarTexture", "SetValue",
}

local CHECK_BUTTON = {
  "GetChecked", "GetCheckedTexture", "GetDisabledCheckedTexture",
  "SetChecked", "SetCheckedTexture", "SetDisabledCheckedTexture",
}

local COOLDOWN = {
  "Clear", "GetCooldownDuration", "GetCooldownTimes", "GetCountdownFontString",
  "IsPaused", "Pause", "Resume", "SetCooldown", "SetCooldownDuration",
  "SetCooldownFromDurationObject", "SetCountdownAbbrevThreshold",
  "SetCountdownFont", "SetCountdownFormatter", "SetDrawBling", "SetDrawEdge",
  "SetDrawSwipe", "SetHideCountdownNumbers", "SetMinimumCountdownDuration",
  "SetReverse", "SetSwipeColor", "SetSwipeTexture",
}

-- The client's aura container (12.1+, Blizzard_AuraContainer) and the aura
-- buttons it makes, as their public mixins define them.
local AURA_CONTAINER = {
  "AddAuraGroup", "AddAuraSlot", "AddItemEnchantment", "GetUnit",
  "SetAuraProcessingPolicy", "SetEnabled", "SetFlowLayoutAnchorPoint",
  "SetFlowLayoutAxis", "SetFlowLayoutGrowthDirection",
  "SetFlowLayoutMaximumLineSize", "SetFlowLayoutPadding", "SetUnit",
  "UpdateAllAuras",
}

local AURA_BUTTON = {
  "AddDispelTypeTexture", "AddPandemicRegion", "ClearDispelTypeTextures",
  "SetApplicationCount", "SetCancelAuraButtons", "SetDurationCooldown",
  "SetDurationText", "SetHideTooltipInCombat", "SetIcon",
  "SetTooltipAnchorPoint",
}

local MINIMAP = {
  "GetPingPosition", "GetZoom", "GetZoomLevels", "PingLocation",
  "SetArchBlobInsideTexture", "SetBlipTexture", "SetMaskTexture", "SetZoom",
}

local SCROLLING_MESSAGE_FRAME = {
  "AddMessage", "Clear", "GetFading", "GetMaxLines", "GetNumMessages",
  "ScrollDown", "ScrollToBottom", "ScrollUp", "SetFading", "SetMaxLines",
  "SetTimeVisible",
}

-- BackdropTemplateMixin. Only frames created with "BackdropTemplate" (or a
-- template that inherits it) have these since 9.0.
local BACKDROP = {
  "ApplyBackdrop", "ClearBackdrop", "GetBackdrop", "GetBackdropBorderColor",
  "GetBackdropColor", "SetBackdrop", "SetBackdropBorderColor",
  "SetBackdropColor",
}

local FRAME_SCRIPTS = {
  "OnAttributeChanged", "OnDragStart", "OnDragStop", "OnEnter", "OnEvent",
  "OnHide", "OnKeyDown", "OnKeyUp", "OnLeave", "OnLoad", "OnMouseDown",
  "OnMouseUp", "OnMouseWheel", "OnReceiveDrag", "OnShow", "OnSizeChanged", "OnUpdate",
}

return {
  methods = {
    Frame = set(REGION, FRAME),
    Button = set(REGION, FRAME, BUTTON),
    ScrollFrame = set(REGION, FRAME, SCROLL_FRAME),
    StatusBar = set(REGION, FRAME, STATUS_BAR),
    CheckButton = set(REGION, FRAME, BUTTON, CHECK_BUTTON),
    Minimap = set(REGION, FRAME, MINIMAP),
    ScrollingMessageFrame = set(REGION, FRAME, FONT, SCROLLING_MESSAGE_FRAME),
    Cooldown = set(REGION, FRAME, COOLDOWN),
    AuraContainer = set(REGION, FRAME, AURA_CONTAINER),
    AuraButton = set(REGION, FRAME, AURA_BUTTON),
    EditBox = set(REGION, FRAME, FONT, EDIT_BOX),
    Texture = set(REGION, LAYERED, TEXTURE),
    FontString = set(REGION, LAYERED, FONT, FONT_STRING),
  },
  scripts = {
    Frame = set(FRAME_SCRIPTS),
    Button = set(FRAME_SCRIPTS, { "OnClick", "OnDoubleClick", "PostClick", "PreClick" }),
    StatusBar = set(FRAME_SCRIPTS, { "OnMinMaxChanged", "OnValueChanged" }),
    Minimap = set(FRAME_SCRIPTS),
    ScrollingMessageFrame = set(FRAME_SCRIPTS, { "OnHyperlinkClick", "OnHyperlinkEnter", "OnHyperlinkLeave", "OnMessageScrollChanged" }),
    CheckButton = set(FRAME_SCRIPTS, { "OnClick", "OnDoubleClick", "PostClick", "PreClick" }),
    Cooldown = set(FRAME_SCRIPTS, { "OnCooldownDone" }),
    AuraContainer = set(FRAME_SCRIPTS),
    AuraButton = set(FRAME_SCRIPTS),
    ScrollFrame = set(FRAME_SCRIPTS, { "OnHorizontalScroll", "OnScrollRangeChanged", "OnVerticalScroll" }),
    EditBox = set(FRAME_SCRIPTS, {
      "OnChar", "OnCursorChanged", "OnEditFocusGained", "OnEditFocusLost",
      "OnEnterPressed", "OnEscapePressed", "OnTabPressed", "OnTextChanged",
      "OnTextSet",
    }),
  },
  backdrop = set(BACKDROP),
  -- Template -> whether it brings the backdrop mixin.
  templates = {
    BackdropTemplate = { backdrop = true },
    UIPanelButtonTemplate = { kind = "Button" },
    UIPanelCloseButton = { kind = "Button" },
    UIPanelScrollFrameTemplate = { kind = "ScrollFrame" },
    SecureUnitButtonTemplate = { kind = "Button" },
    SecureActionButtonTemplate = {},
    InsecureActionButtonTemplate = { kind = "Button" },
    SecureHandlerStateTemplate = {},
    SecureGroupHeaderTemplate = { kind = "Frame" },
    SecureHandlerBaseTemplate = {},
    CooldownFrameTemplate = { kind = "Cooldown" },
    CustomAuraContainerTemplate = { kind = "AuraContainer" },
  },
}
