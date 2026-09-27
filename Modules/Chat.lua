-- Chat: every chat window, tab and edit box in the ForeverUI look. The
-- windows get a flat panel and the theme font (same size), tabs lose their
-- art and show the accent on the selected one, and the edit box becomes a
-- themed input. Messages are never touched: in Midnight some chat text is
-- hidden from addons, so this module only skins.

local ADDON, ns = ...

local T = ns.Theme

local CH = ns.Module("Chat", {
  defaults = { background = true },
})

-- The chat window count on this client.
local function windowCount()
  return NUM_CHAT_WINDOWS or 10
end

-- A chat window's font string size, or 14.
local function fontSize(frame)
  local _, size = frame:GetFont()
  return ns.PlainNumber(size) or 14
end

-- Theme font on a chat window, keeping its size.
local function skinWindow(frame, settings)
  local path, outline = T.Font()
  frame:SetFont(path, fontSize(frame), outline)
  T.FadeRegions(frame)
  if settings.background then
    CH.backgrounds[frame] = CH.backgrounds[frame] or T.Panel(CreateFrame("Frame", nil, frame), { alpha = 0.55 })
    CH.backgrounds[frame]:SetPoint("TOPLEFT", -4, 4)
    CH.backgrounds[frame]:SetPoint("BOTTOMRIGHT", 4, -4)
    CH.backgrounds[frame]:SetFrameLevel(math.max(0, (frame:GetFrameLevel() or 1) - 1))
  end
end

-- Tab text: accent when selected, gray otherwise.
local function colorTab(tab, selected)
  local text = tab.Text or (tab.GetFontString and tab:GetFontString())
  if text then
    T.SetFont(text, 12)
    T.Color(text, selected and "accent" or "text2")
  end
end

-- A tab without its art.
local function skinTab(tab)
  T.FadeRegions(tab, { [tab.Text or false] = true })
  colorTab(tab, false)
end

-- The edit box as a themed input.
local function skinEditBox(box)
  T.EditBox(box)
  local path, outline = T.Font()
  box:SetFont(path, 13, outline)
end

-- Skins chat window i (and its tab and edit box) if this client has it.
local function skinIndex(i, settings)
  local frame = _G["ChatFrame" .. i]
  if not frame then
    return
  end
  skinWindow(frame, settings)
  local tab, box = _G["ChatFrame" .. i .. "Tab"], _G["ChatFrame" .. i .. "EditBox"]
  if tab then skinTab(tab) end
  if box then skinEditBox(box) end
end

-- Re-colors the tabs so the selected window's tab carries the accent.
function CH.UpdateTabs()
  local selected = SELECTED_CHAT_FRAME
  for i = 1, windowCount() do
    local tab = _G["ChatFrame" .. i .. "Tab"]
    if tab then colorTab(tab, _G["ChatFrame" .. i] == selected) end
  end
end

-- Skins every chat window this client has.
function CH.SkinAll()
  for i = 1, windowCount() do
    skinIndex(i, CH.settings)
  end
  CH.UpdateTabs()
end

-- Module entry point (Core/Modules.lua). Chat frames aren't protected, so
-- this runs at once; temporary windows (whispers) are skinned as they open.
function CH.Enable(settings)
  CH.settings = settings
  CH.backgrounds = {}
  CH.SkinAll()
  T.OnChanged(CH.UpdateTabs)
  if type(hooksecurefunc) == "function" and type(FCF_OpenTemporaryWindow) == "function" then
    hooksecurefunc("FCF_OpenTemporaryWindow", CH.SkinAll)
  end
  if type(hooksecurefunc) == "function" and type(FCF_Tab_OnClick) == "function" then
    hooksecurefunc("FCF_Tab_OnClick", CH.UpdateTabs)
  end
end
