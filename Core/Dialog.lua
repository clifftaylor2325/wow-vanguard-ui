-- Three themed dialogs: a text box for export/import strings (chat can't hold
-- them), a yes/no question, and a reload prompt. One of each is built on first use and reused.
-- Also the reload button itself: the WoW Forever client blocks ReloadUI()
-- from addon code, even inside a click, so a reload button carries a secure
-- action button overlay that runs a /reload macro (see ns.ReloadButton).

local ADDON, ns = ...

local T = ns.Theme

local box, reload, question

-- Where a dialog's contents start (units down): the title line (the close button's line) and a pad under it.
local HEAD = T.CONTROL.inset + T.SPACE.pad
-- The room a dialog's foot takes (units up): a pad, its buttons, and a gap over them.
local FOOT = T.SPACE.pad + T.BUTTON_H + T.SPACE.gap
-- The layout every dialog shares, for the windows built on ns.Dialog: head and foot as above.
---@type { head: number, foot: number }
ns.DIALOG = { head = HEAD, foot = FOOT }
-- The room a dialog's title leaves for the close button (units): its middle T.CONTROL.inset in, half its tile, a gap.
local CLOSE_ROOM = T.CONTROL.inset + T.CONTROL.tile / 2 + T.SPACE.gap
-- The text dialog's size, and the question and reload dialogs' width (their height fits their text).
local TEXT_W, TEXT_H, ASK_W = 520, 320, 400
-- How wide a dialog button is unless told otherwise (a label of a dozen letters fits).
local BUTTON_W = 120
-- The text's inset from an edit box's border (W.Input's).
local TEXT_INSET = 6

-- A themed button on a dialog: T.BUTTON_H tall, 120 wide unless told otherwise.
local function button(parent, label, width)
  local b = T.Button(CreateFrame("Button", nil, parent))
  b:SetSize(width or BUTTON_W, T.BUTTON_H)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "label")
  b.text:SetPoint("CENTER")
  b.text:SetText(label)
  T.Color(b.text, "text")
  return b
end
ns.DialogButton = button

-- Hides a dialog: what its close button does.
local function hide(frame)
  frame:Hide()
end

-- A centered, themed dialog frame at the dialog alpha, with the one window chrome (ns.WindowTitle: its title, set
-- by the caller unless given and kept short of the close X that hides it, and Escape), a layer above the options window (which is
-- on the dialog strata itself, its cards high in it, so a dialog there opened under them). The X is
-- frame.chrome.close; a dialog with a button of its own named close (the text dialog's) keeps that name for it.
---@param name string  the frame's global name (Escape needs it)
---@param w number
---@param h number
---@param title string|nil
---@return table frame  with title, chrome ({ title, close }) and the panel
local function dialog(name, w, h, title)
  local f = T.Panel(CreateFrame("Frame", name, UIParent), { alpha = T.ALPHA.dialog, shadow = true })
  f:SetSize(w, h)
  f:SetPoint("CENTER")
  f:SetFrameStrata("FULLSCREEN_DIALOG")
  f:EnableMouse(true)
  f.chrome = ns.WindowTitle(f, title or name, { onClose = hide, escape = true })
  f.title:SetWidth(w - T.SPACE.pad - CLOSE_ROOM)
  if not title then f.title:SetText("") end
  f:Hide()
  return f
end
ns.Dialog = dialog

-- A scroll view for a dialog (ns.ScrollView): it also re-reads its thumb and edges when its own size changes, as
-- it does when the client lays it out the first time its dialog shows (a view sized by its anchors has no height
-- before that, so a thumb worked out while the dialog was hidden would be missing).
---@param parent table
---@param opts table|nil  child, width
---@return table view  the ns.ScrollView
function ns.DialogView(parent, opts)
  local view = ns.ScrollView(parent, opts)
  view:HookScript("OnSizeChanged", ns.Guard("size dialog view", function() view:ScrollTo(view:GetVerticalScroll() or 0) end))
  return view
end

-- A scroll view around a multi-line edit box, painted as one input: it follows the cursor, and re-reads the box's
-- height (the client grows it with the text) as the cursor moves or the box is resized, so the thumb shows
-- while the text overflows.
---@param parent table
---@param edit table  a multi-line EditBox
---@return table view  the ns.ScrollView, with view.edit
local function textView(parent, edit)
  local view = T.EditBox(ns.DialogView(parent, { child = edit }))
  T.Tint(view.fadeTop, "inset")
  T.Tint(view.fadeBottom, "inset")
  view:FollowCursor(edit)
  for _, script in ipairs({ "OnCursorChanged", "OnSizeChanged" }) do
    edit:HookScript(script, ns.Guard("size text view", function() view:ScrollTo(view:GetVerticalScroll() or 0) end))
  end
  view.edit = edit
  return view
end
ns.TextView = textView

-- Text box ------------------------------------------------------------------------

-- The scrolling multi-line edit box inside the text dialog, under the title line and over the buttons. It needs
-- a font before any text: the game's SetText on an edit box without one is an error ("Font not set").
local function addEditBox(f)
  f.edit = T.Text(CreateFrame("EditBox", "Vanguard_TextEdit", f), "label")
  f.edit:SetMultiLine(true)
  f.edit:SetAutoFocus(false)
  f.edit:SetWidth(TEXT_W - 2 * T.SPACE.pad - T.SPACE.col)
  f.edit:SetTextInsets(TEXT_INSET, TEXT_INSET, T.SPACE.tight, T.SPACE.tight)
  f.edit:SetScript("OnEscapePressed", function() f:Hide() end)
  f.view = textView(f, f.edit)
  f.view:SetPoint("TOPLEFT", T.SPACE.pad, -HEAD)
  f.view:SetPoint("BOTTOMRIGHT", -(T.SPACE.pad + T.SPACE.col), FOOT)
end

-- Hangs a dialog's title from the top-left corner (T.SPACE.pad in and down, so its first line sits on the close
-- button's line and a second one goes down, not up under the panel's edge); the dialog sets its width.
local function hangTitle(f)
  f.title:ClearAllPoints()
  f.title:SetPoint("TOPLEFT", T.SPACE.pad, -T.SPACE.pad)
end

-- The text dialog's title: two lines at most (its words are the sentence that says what to do with the box,
-- "Ctrl+C to copy"), hung from the top.
local function limitTitle(f)
  hangTitle(f)
  f.title:SetMaxLines(2)
end

-- Sets the text dialog's title: the text area keeps a gap under it, so a title of two lines pushes the area
-- down by the second (one line leaves it at the head).
local function titleText(f, text)
  f.title:SetText(text)
  local below = T.SPACE.pad + f.title:GetStringHeight() + T.SPACE.gap
  f.view:SetPoint("TOPLEFT", T.SPACE.pad, -math.max(HEAD, below))
end

-- Puts text in the text dialog's box and shows its start (the thumb follows the new height as the client grows it).
local function boxText(f, text)
  f.edit:SetText(text)
  f.view:ScrollTo(0)
end

-- Builds the text dialog once: title, text area, the primary (accent) button and the one that
-- dismisses it, which reads Cancel beside the primary and Close when the box only shows text.
local function textBox()
  if box then return box end
  box = dialog("Vanguard_TextDialog", TEXT_W, TEXT_H)
  addEditBox(box)
  limitTitle(box)
  box.primary = ns.Widgets.Primary(box, "Import")
  box.primary:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  box.close = button(box, "Close")
  box.close:SetPoint("RIGHT", box.primary, "LEFT", -T.SPACE.gap, 0)
  box.close:SetScript("OnClick", ns.Guard("click close text box", function() box:Hide() end))
  return box
end

-- Shows text selected for copying (Ctrl+C); Close is the only button.
function ns.ShowText(title, text)
  local f = textBox()
  titleText(f, title)
  boxText(f, text)
  f.primary:Hide()
  f.close.text:SetText("Close")
  f:Show()
  f.edit:SetFocus()
  f.edit:HighlightText()
end

-- An empty box to type or paste into; onImport(text) runs when the primary button
-- (Import, or the label given) is clicked, and Cancel sits beside it.
function ns.AskText(title, onImport, label)
  local f = textBox()
  f.ownTitle = title
  titleText(f, title)
  boxText(f, "")
  f.primary.text:SetText(label or "Import")
  f.close.text:SetText("Cancel")
  f.primary:Show()
  f.primary:SetScript("OnClick", ns.Guard("click text box primary", function() onImport(f.edit:GetText()) end))
  f:Show()
  f.edit:SetFocus()
end

-- Shows work under way in the text dialog's title (as "Importing… 40%"), its primary
-- button hidden meanwhile; nil puts the title ns.AskText gave and the button back.
function ns.TextProgress(title)
  local f = textBox()
  titleText(f, title or f.ownTitle)
  f.primary:SetShown(title == nil)
end

-- Hides the text dialog.
function ns.HideText()
  if box then box:Hide() end
end

-- Question ----------------------------------------------------------------------------

-- Sizes a dialog whose title is its text to fit: a pad, the wrapped title, a section gap, its buttons, a pad.
local function fitTitle(f)
  f:SetHeight(T.SPACE.pad + f.title:GetStringHeight() + T.SPACE.section + T.BUTTON_H + T.SPACE.pad)
end

-- The question was hidden without Yes: by No, its X or Escape. That is a No (what waits on the answer, such as
-- the reload offered after it, goes on), run once. A hide that comes down from a parent (the whole UI put away
-- with Alt-Z) leaves the frame shown, and is no answer: the question is there when the UI comes back.
local function declined(f)
  if f:IsShown() then return end
  local onNo = f.waiting
  f.waiting = nil
  if onNo then onNo() end
end

-- Builds the question dialog once: the question, a Yes (plain: a confirm never takes the accent) and a No.
local function questionDialog()
  if question then return question end
  question = dialog("Vanguard_Question", ASK_W, 1)
  hangTitle(question)
  question:HookScript("OnHide", ns.Guard("decline question", function() declined(question) end))
  question.yes = button(question, "Yes")
  question.yes:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  question.no = button(question, "No")
  question.no:SetPoint("RIGHT", question.yes, "LEFT", -T.SPACE.gap, 0)
  return question
end

-- Asks a yes/no question: the yes button (labelled yes) runs onYes, No runs onNo; either closes it. Closing it
-- any other way (the X, Escape) answers No.
function ns.Ask(text, yes, onYes, onNo)
  local f = questionDialog()
  f.title:SetText(text)
  fitTitle(f)
  f.yes.text:SetText(yes)
  f.waiting = onNo
  f.yes:SetScript("OnClick", ns.Guard("click question yes", function() f.waiting = nil f:Hide() onYes() end))
  f.no:SetScript("OnClick", ns.Guard("click question no", function() f:Hide() end))
  f:Show()
end

-- Reload ------------------------------------------------------------------------------

-- Passes hover from an overlay to the button under it, so the button's hover look still shows.
local function forwardHover(overlay, btn)
  overlay:SetScript("OnEnter", function() local fn = btn:GetScript("OnEnter") if fn then fn(btn) end end)
  overlay:SetScript("OnLeave", function() local fn = btn:GetScript("OnLeave") if fn then fn(btn) end end)
end

-- Reload overlays and the buttons they cover (overlay -> button).
local overlays = setmetatable({}, { __mode = "k" })

-- Covers a button with its overlay, shown while the button is (out of combat only).
local function cover(o)
  local btn = overlays[o]
  o:ClearAllPoints()
  o:SetAllPoints(btn)
  o:SetFrameStrata(btn:GetFrameStrata())
  o:SetFrameLevel(btn:GetFrameLevel() + 5)
  o:SetShown(btn:IsVisible())
end

-- The button showed or hid: its overlay follows, out of combat (in combat it is put away).
local function follow(o)
  if not ns.InCombat() then cover(o) end
end

-- A fight starts (just before the lockdown): every overlay hides and lets go of its
-- button, so no frame of the addon holds or hangs on a protected one in combat (the
-- client would protect it too: the options window could not open or close). They come back after.
local function putAway()
  for o in pairs(overlays) do
    o:Hide()
    o:ClearAllPoints()
    ns.AfterCombat(function() cover(o) end, o)
  end
end

-- Lays an overlay over a button that runs the /reload macro when clicked.
-- Blizzard's own prompts call ReloadUI() from secure code (Blizzard_StaticPopup_Game);
-- an addon's nearest equivalent is a secure action button whose macro the client
-- runs on a hardware click, out of combat. The overlay is a protected frame, so it
-- hangs on UIParent, not on the button, and covers the button only out of combat.
local function addReloadOverlay(btn)
  local o = CreateFrame("Button", nil, UIParent, "SecureActionButtonTemplate")
  overlays[o] = btn
  o:RegisterForClicks("AnyDown", "AnyUp")
  o:SetAttribute("useOnKeyDown", false)
  o:SetAttribute("type", "macro")
  o:SetAttribute("macrotext", "/reload")
  forwardHover(o, btn)
  for _, script in ipairs({ "OnShow", "OnHide" }) do btn:HookScript(script, function() follow(o) end) end
  btn.reloadOverlay = o
  cover(o)
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
-- frame, so it is built out of combat; a button built in combat gets it when combat ends.
function ns.ReloadButton(btn)
  btn:SetScript("OnClick", ns.Guard("click reload by hand", reloadByHand))
  ns.OutOfCombat(function() addReloadOverlay(btn) end, btn)
  return btn
end
ns.On("PLAYER_REGEN_DISABLED", putAway)

-- Builds the reload dialog once: the reason, a primary (accent) Reload button and Later.
local function reloadDialog()
  if reload then return reload end
  reload = dialog("Vanguard_Reload", ASK_W, 1)
  hangTitle(reload)
  reload.accept = ns.ReloadButton(ns.Widgets.Primary(reload, "Reload"))
  reload.accept:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  reload.cancel = button(reload, "Later")
  reload.cancel:SetPoint("RIGHT", reload.accept, "LEFT", -T.SPACE.gap, 0)
  reload.cancel:SetScript("OnClick", ns.Guard("click reload later", function() reload:Hide() end))
  return reload
end

-- Offers a reload, for changes that apply after one; the dialog grows to fit its reason.
function ns.OfferReload(why)
  local f = reloadDialog()
  f.title:SetText(why .. " Reload the UI now to apply it?")
  fitTitle(f)
  f:Show()
end
