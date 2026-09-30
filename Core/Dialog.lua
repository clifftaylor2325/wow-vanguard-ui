-- Two themed dialogs: a text box for export/import strings (chat can't hold
-- them), and a reload prompt. One of each is built on first use and reused.
-- Also the reload button itself: the WoW Forever client blocks ReloadUI()
-- from addon code, even inside a click, so a reload button carries a secure
-- /reload macro overlay (see ns.ReloadButton).

local ADDON, ns = ...

local T = ns.Theme

local box, reload

-- A themed button on a dialog.
local function button(parent, label, width)
  local b = T.Button(CreateFrame("Button", nil, parent))
  b:SetSize(width or 100, 24)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label")
  b.text:SetPoint("CENTER")
  b.text:SetText(label)
  T.Color(b.text, "text")
  return b
end
ns.DialogButton = button

-- A centered, movable, themed dialog frame with a title.
local function dialog(name, w, h)
  local f = T.Panel(CreateFrame("Frame", name, UIParent), { alpha = 0.98, shadow = true })
  f:SetSize(w, h)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading")
  f.title:SetPoint("TOPLEFT", 12, -10)
  f:Hide()
  return f
end

-- Text box ------------------------------------------------------------------------

-- The scrolling multi-line edit box inside the text dialog.
local function addEditBox(f)
  local scroll = CreateFrame("ScrollFrame", "ForeverUI_TextScroll", f, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 12, -34)
  scroll:SetPoint("BOTTOMRIGHT", -30, 44)
  f.edit = T.EditBox(CreateFrame("EditBox", "ForeverUI_TextEdit", scroll))
  f.edit:SetMultiLine(true)
  f.edit:SetAutoFocus(false)
  f.edit:SetWidth(460)
  f.edit:SetScript("OnEscapePressed", function() f:Hide() end)
  scroll:SetScrollChild(f.edit)
end

-- Builds the text dialog once: title, text area, primary and close buttons.
local function textBox()
  if box then return box end
  box = dialog("ForeverUI_TextDialog", 520, 320)
  addEditBox(box)
  box.primary = button(box, "Import")
  box.primary:SetPoint("BOTTOMRIGHT", -12, 12)
  box.close = button(box, "Close")
  box.close:SetPoint("RIGHT", box.primary, "LEFT", -8, 0)
  box.close:SetScript("OnClick", function() box:Hide() end)
  return box
end

-- Shows text selected for copying (Ctrl+C).
function ns.ShowText(title, text)
  local f = textBox()
  f.title:SetText(title)
  f.edit:SetText(text)
  f.primary:Hide()
  f:Show()
  f.edit:SetFocus()
  f.edit:HighlightText()
end

-- An empty box to paste into; onImport(text) runs when Import is clicked.
function ns.AskText(title, onImport)
  local f = textBox()
  f.title:SetText(title)
  f.edit:SetText("")
  f.primary:Show()
  f.primary:SetScript("OnClick", function() onImport(f.edit:GetText()) end)
  f:Show()
  f.edit:SetFocus()
end

-- Hides the text dialog.
function ns.HideText()
  if box then box:Hide() end
end

-- Reload ------------------------------------------------------------------------------

-- Passes hover from an overlay to the button under it, so the button's hover look still shows.
local function forwardHover(overlay, btn)
  overlay:SetScript("OnEnter", function() local fn = btn:GetScript("OnEnter") if fn then fn(btn) end end)
  overlay:SetScript("OnLeave", function() local fn = btn:GetScript("OnLeave") if fn then fn(btn) end end)
end

-- Lays an overlay over a button that runs the /reload macro when clicked.
-- A click on an action button running a macro is the one reload the Forever
-- client still allows an addon (Blizzard's own reload prompts work this way).
local function addReloadOverlay(btn)
  local o = CreateFrame("Button", nil, btn, "InsecureActionButtonTemplate")
  o:SetAllPoints(btn)
  o:SetFrameLevel(btn:GetFrameLevel() + 5)
  o:RegisterForClicks("AnyUp")
  o:SetAttribute("useOnKeyDown", false)
  o:SetAttribute("type", "macro")
  o:SetAttribute("macrotext", "/reload")
  forwardHover(o, btn)
  btn.reloadOverlay = o
end

-- A click on a reload button before its overlay exists (it was built in combat):
-- elsewhere ReloadUI() still works; on Forever, say how to reload by hand.
local function reloadByHand()
  if ns.IsForever() or type(ReloadUI) ~= "function" then
    ns.Chat("Type /reload in chat to apply the change (the game only lets addons reload out of combat).")
    return
  end
  ReloadUI()
end

-- Makes a button reload the UI when clicked. The overlay is a protected
-- setup, so a button built in combat gets it as soon as combat ends.
function ns.ReloadButton(btn)
  btn:SetScript("OnClick", reloadByHand)
  ns.OutOfCombat(function() addReloadOverlay(btn) end)
  return btn
end

-- Builds the reload dialog once: the reason, a Reload button and Later.
local function reloadDialog()
  if reload then return reload end
  reload = dialog("ForeverUI_Reload", 360, 110)
  reload.title:SetWidth(336)
  reload.accept = ns.ReloadButton(button(reload, "Reload"))
  reload.accept:SetPoint("BOTTOMRIGHT", -12, 12)
  reload.cancel = button(reload, "Later")
  reload.cancel:SetPoint("RIGHT", reload.accept, "LEFT", -8, 0)
  reload.cancel:SetScript("OnClick", function() reload:Hide() end)
  return reload
end

-- Offers a reload, for changes that apply after one.
function ns.OfferReload(why)
  local f = reloadDialog()
  f.title:SetText(why .. " Reload the UI now to apply it?")
  f:Show()
end
