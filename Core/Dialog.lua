-- Two themed dialogs: a text box for export/import strings (chat can't hold
-- them), and a confirm prompt (used to offer a reload). One of each is built
-- on first use and reused.

local ADDON, ns = ...

local T = ns.Theme

local box, confirm

-- A themed button on a dialog.
local function button(parent, label, width)
  local b = T.Button(CreateFrame("Button", nil, parent))
  b:SetSize(width or 100, 24)
  b.text = T.SetFont(b:CreateFontString(nil, "OVERLAY"), 12)
  b.text:SetPoint("CENTER")
  b.text:SetText(label)
  T.Color(b.text, "text")
  return b
end
ns.DialogButton = button

-- A centered, movable, themed dialog frame with a title.
local function dialog(name, w, h)
  local f = T.Panel(CreateFrame("Frame", name, UIParent), { accent = true, alpha = 0.98 })
  f:SetSize(w, h)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  f.title = T.SetFont(f:CreateFontString(nil, "OVERLAY"), 13)
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

-- Confirm -------------------------------------------------------------------------------

-- Builds the confirm dialog once: message, accept and cancel buttons.
local function confirmDialog()
  if confirm then return confirm end
  confirm = dialog("ForeverUI_Confirm", 360, 110)
  confirm.title:SetWidth(336)
  confirm.accept = button(confirm, "OK")
  confirm.accept:SetPoint("BOTTOMRIGHT", -12, 12)
  confirm.cancel = button(confirm, "Later")
  confirm.cancel:SetPoint("RIGHT", confirm.accept, "LEFT", -8, 0)
  confirm.cancel:SetScript("OnClick", function() confirm:Hide() end)
  return confirm
end

-- Asks a yes/no question; onAccept runs from the click (so it may reload the UI).
function ns.Confirm(text, acceptLabel, onAccept)
  local f = confirmDialog()
  f.title:SetText(text)
  f.accept.text:SetText(acceptLabel)
  f.accept:SetScript("OnClick", function() f:Hide(); onAccept() end)
  f:Show()
end

-- Offers a reload, for changes that apply after one.
function ns.OfferReload(why)
  ns.Confirm(why .. " Reload the UI now to apply it?", "Reload", function()
    if type(ReloadUI) == "function" then ReloadUI() end
  end)
end
