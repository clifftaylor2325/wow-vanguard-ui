-- Four themed dialogs: a text box for export/import strings (chat can't hold
-- them), a find box (a query field over the lines found), a yes/no question, and a reload
-- prompt. One of each is built on first use and reused.
-- Also the reload button itself: the WoW Forever client blocks ReloadUI()
-- from addon code, even inside a click, so a reload button carries a secure
-- action button overlay that runs a /reload macro (see ns.ReloadButton).

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme

local box, find, reload, question

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
local TEXT_INSET = T.SPACE.gap

-- The label of each button kind: { text role, colour token }. Secondary is the plain button; primary
-- is a SemiBold `void` label on the accent fill; danger is a secondary with a `bad` label.
local KIND_LABELS = { secondary = { "label", "text" }, primary = { "name", "void" }, danger = { "label", "bad" } }

-- A themed button on a dialog: T.BUTTON_H tall, 120 wide unless told otherwise, of a kind ("secondary"
-- unless given, "primary" or "danger").
local function button(parent, label, width, kind)
  local look = KIND_LABELS[kind or "secondary"]
  local b = T.Button(CreateFrame("Button", nil, parent), kind == "primary" and "primary" or nil)
  b:SetSize(width or BUTTON_W, T.BUTTON_H)
  b.kind = kind or "secondary"
  if kind == "primary" then b.fill = T.FillParts(b, "BACKGROUND", 1, "accent") end
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), look[1])
  b.text:SetPoint("CENTER")
  b.text:SetText(label)
  T.Color(b.text, look[2])
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

-- A scroll view around a multi-line edit box, painted as one input: it follows the cursor, and re-reads the box's
-- height (the client grows it with the text) as the cursor moves or the box is resized, so the thumb shows
-- while the text overflows.
---@param parent table
---@param edit table  a multi-line EditBox
---@return table view  the ns.ScrollView, with view.edit
local function textView(parent, edit)
  local view = T.EditBox(ns.ScrollView(parent, { child = edit }))
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

-- The scrolling multi-line edit box inside a text-sized dialog (named `name`), `top` units down (the title
-- line, unless given) and over the buttons. It needs a font before any text: the game's SetText on an edit
-- box without one is an error ("Font not set").
local function addEditBox(f, name, top)
  f.edit = T.Text(CreateFrame("EditBox", name or "Vanguard_TextEdit", f), "label")
  f.edit:SetMultiLine(true)
  f.edit:SetAutoFocus(false)
  f.edit:SetWidth(TEXT_W - 2 * T.SPACE.pad - T.SPACE.col)
  f.edit:SetTextInsets(TEXT_INSET, TEXT_INSET, T.SPACE.tight, T.SPACE.tight)
  f.edit:SetScript("OnEscapePressed", function() f:Hide() end)
  f.view = textView(f, f.edit)
  f.view:SetPoint("TOPLEFT", T.SPACE.pad, -(top or HEAD))
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
-- The errors window's Clear goes, so a window opened over it shows only its own buttons.
local function boxText(f, text)
  f.edit:SetText(text)
  f.view:ScrollTo(0)
  if f.clear then f.clear:Hide() end
end

-- The text dialog's buttons: the primary at the bottom right and, left of it, the one that closes the box.
local function addTextButtons(f)
  f.primary = ns.Widgets.Primary(f, L["Import"])
  f.primary:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  f.close = button(f, L["Close"])
  f.close:SetPoint("RIGHT", f.primary, "LEFT", -T.SPACE.gap, 0)
  f.close:SetScript("OnClick", ns.Guard("click close text box", function() f:Hide() end))
end

-- The text dialog's buttons in Tab order (the errors window's Clear once it exists; hidden ones are skipped).
local function textButtons()
  local list = { box.primary, box.close }
  if box.clear then list[#list + 1] = box.clear end
  return list
end

-- Builds the text dialog once: title, text area, the primary (accent) button and the one that
-- dismisses it, which reads Cancel beside the primary and Close when the box only shows text.
local function textBox()
  if box then return box end
  box = dialog("Vanguard_TextDialog", TEXT_W, TEXT_H)
  addEditBox(box)
  limitTitle(box)
  addTextButtons(box)
  ns.TabFocus(box, textButtons)
  return box
end

-- The text dialog and the find dialog share one spot on screen, so they never stack: the one opening takes the
-- other's place (where it was dragged to) and the other closes.
local function takePlace(f, other)
  if not (other and other:IsShown()) then return f end
  local point, rel, relPoint, x, y = other:GetPoint()
  f:ClearAllPoints()
  f:SetPoint(point, rel, relPoint, x, y)
  other:Hide()
  return f
end

-- Shows text selected for copying (Ctrl+C); Close is the only button.
function ns.ShowText(title, text)
  local f = takePlace(textBox(), find)
  titleText(f, title)
  boxText(f, text)
  f.primary:Hide()
  f.close.text:SetText(L["Close"])
  f:Show()
  f.edit:SetFocus()
  f.edit:HighlightText()
end

-- The errors window's Clear button, left of Close, made the first time; it hides with the box and when another
-- text fills it, so only ns.ShowErrors shows it.
local function clearButton(f)
  if f.clear then return f.clear end
  f.clear = button(f, L["Clear"])
  f.clear:SetPoint("RIGHT", f.close, "LEFT", -T.SPACE.gap, 0)
  f.clear:SetScript("OnClick", ns.Guard("click clear errors", function() ns.ClearErrors() f:Hide() ns.Chat(L["Errors cleared."]) end))
  f:HookScript("OnHide", ns.Guard("hide errors clear", function() f.clear:Hide() end))
  return f.clear
end

-- Shows the errors Vanguard caught, selected for copying, with Report a bug (the feedback form on a bug, which
-- attaches the report) and Clear (empties the list) beside Close.
function ns.ShowErrors(title, text)
  ns.ShowText(title, text)
  local f = box
  f.primary.text:SetText(L["Report a bug"])
  f.primary:SetScript("OnClick", ns.Guard("click report a bug", function() f:Hide() ns.Feedback.Open("bug") end))
  f.primary:Show()
  clearButton(f):Show()
end

-- Shows text selected for copying, as ns.ShowText, with the cursor at its end so the box opens on its last line
-- (the newest, for a chat copy); the view follows the cursor (ns.ScrollView's FollowCursor).
---@param title string
---@param text string
function ns.ShowTextAtEnd(title, text)
  local f = textBox()
  ns.ShowText(title, text)
  -- SetText may already leave the cursor at the end: move it away and back so the client reports the move.
  f.edit:SetCursorPosition(0)
  f.edit:SetCursorPosition(#text)
  f.edit:HighlightText()
end

-- An empty box to type or paste into; onImport(text) runs when the primary button
-- (Import, or the label given) is clicked, and Cancel sits beside it.
function ns.AskText(title, onImport, label)
  local f = takePlace(textBox(), find)
  f.ownTitle = title
  titleText(f, title)
  boxText(f, "")
  f.primary.text:SetText(label or L["Import"])
  f.close.text:SetText(L["Cancel"])
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

-- Find box ------------------------------------------------------------------------

-- Where the find dialog's lines start (units down): the query line and a gap under it.
local FIND_TOP = HEAD + T.BUTTON_H + T.SPACE.gap

-- Runs the find dialog's search on what is typed: onFind(query) gives the line that says what was found
-- and the lines themselves (nothing when there was nothing to look for), which go in the title and the box.
local function runFind(f)
  local summary, text = f.onFind(f.query:GetText())
  if not summary then return end
  f.title:SetText(summary)
  boxText(f, text)
end

-- The find dialog's query line across the top: a themed input with the Find button (the primary) at its
-- right end; Enter in the field finds too, Escape closes the dialog.
local function addQuery(f)
  f.go = ns.Widgets.Primary(f, L["Find"], function() runFind(f) end)
  f.go:SetPoint("TOPRIGHT", -T.SPACE.pad, -HEAD)
  f.query = ns.Widgets.Input(f, TEXT_W - 2 * T.SPACE.pad - BUTTON_W - T.SPACE.gap)
  f.query:SetPoint("RIGHT", f.go, "LEFT", -T.SPACE.gap, 0)
  f.query:SetScript("OnEnterPressed", ns.Guard("find box enter", function() runFind(f) end))
  f.query:SetScript("OnEscapePressed", ns.Guard("find box escape", function() f:Hide() end))
end

-- Builds the find dialog once: the query line at the top, the lines found under it (a text area like the
-- text dialog's, read for copying) and Close at the foot.
local function findBox()
  if find then return find end
  find = dialog("Vanguard_FindDialog", TEXT_W, TEXT_H)
  hangTitle(find)
  addQuery(find)
  addEditBox(find, "Vanguard_FindEdit", FIND_TOP)
  find.close = button(find, L["Close"])
  find.close:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  find.close:SetScript("OnClick", ns.Guard("click close find box", function() find:Hide() end))
  ns.TabFocus(find, function() return { find.go, find.close } end)
  return find
end

-- Shows the find dialog with its title and the query field focused (its last query selected, so typing
-- replaces it). onFind(query) runs on Enter or Find and returns the line that says what was found and the
-- lines to show, or nothing to leave the box as it is. The last lines found stay until the next search.
---@param title string
---@param onFind fun(query: string): string|nil, string|nil
function ns.ShowFind(title, onFind)
  local f = takePlace(findBox(), box)
  f.onFind = onFind
  f.title:SetText(title)
  f:Show()
  f.query:SetFocus()
  f.query:HighlightText()
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

-- What a key does on the question: Enter presses its confirm button unless that is a danger button (a delete is
-- never one key away); any other key goes on to the game. Only out of combat: the call that lets a key through is
-- barred in combat, so no key is caught there (the keys it was left passing on keep passing).
local function askKey(f, key)
  if ns.InCombat() or not ns.Client.Has("keyPropagate") then return end
  local confirm = f.confirm
  local used = ns.FocusKey(f, key)
  local enter = not used and (key == "ENTER" or key == "NUMPADENTER") and confirm.kind ~= "danger" and confirm:IsEnabled()
  f:SetPropagateKeyboardInput(not (used or enter))
  if enter then confirm:GetScript("OnClick")(confirm) end
end

-- Lets the question read keys while it is shown and out of combat (ns.HoldKeyboard), passing them all on until
-- askKey takes one. It holds the keyboard as it shows and hides, and lets it go when a fight starts.
local function listenForEnter(f)
  f:SetScript("OnKeyDown", ns.Guard("question key", askKey))
  f:HookScript("OnShow", ns.Guard("question keys", function(q) ns.HoldKeyboard(q) end))
  f:HookScript("OnHide", ns.Guard("question keys", function(q) ns.HoldKeyboard(q) end))
  ns.ReleaseKeyboardInCombat(f)
end

-- The question's buttons: the primary Yes and the danger Yes (one shows) at the bottom right, No left of them.
local function addQuestionButtons(f)
  f.yes, f.sure = button(f, L["Yes"], nil, "primary"), button(f, L["Yes"], nil, "danger")
  f.yes:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  f.sure:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  f.no = button(f, L["No"])
  f.no:SetPoint("RIGHT", f.yes, "LEFT", -T.SPACE.gap, 0)
end

-- Builds the question dialog once: the question, a Yes (the primary: the accent; or a danger button for a
-- destructive question, which Enter never presses) and a No.
local function questionDialog()
  if question then return question end
  question = dialog("Vanguard_Question", ASK_W, 1)
  hangTitle(question)
  question:HookScript("OnHide", ns.Guard("decline question", function() declined(question) end))
  addQuestionButtons(question)
  listenForEnter(question)
  ns.TabFocusOwnKeys(question, function() return { question.no, question.yes, question.sure } end)
  return question
end

-- Chooses which Yes the question shows: the danger one for kind "danger", else the primary.
local function pickConfirm(f, kind)
  f.confirm = kind == "danger" and f.sure or f.yes
  f.yes:SetShown(f.confirm == f.yes)
  f.sure:SetShown(f.confirm == f.sure)
end

-- Asks a yes/no question: the yes button (labelled yes) runs onYes, No runs onNo; either closes it. Closing it
-- any other way (the X, Escape) answers No. kind is "danger" for a question about something lost for good.
function ns.Ask(text, yes, onYes, onNo, kind)
  local f = questionDialog()
  f.title:SetText(text)
  fitTitle(f)
  pickConfirm(f, kind)
  f.confirm.text:SetText(yes)
  f.waiting = onNo
  f.confirm:SetScript("OnClick", ns.Guard("click question yes", function() f.waiting = nil f:Hide() onYes() end))
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
    ns.Chat(L["Type /reload in chat to apply the change (the game only lets addons reload out of combat)."])
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
  reload.accept = ns.ReloadButton(ns.Widgets.Primary(reload, L["Reload"]))
  reload.accept:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  reload.cancel = button(reload, L["Later"])
  reload.cancel:SetPoint("RIGHT", reload.accept, "LEFT", -T.SPACE.gap, 0)
  reload.cancel:SetScript("OnClick", ns.Guard("click reload later", function() reload:Hide() end))
  ns.TabFocus(reload, function() return { reload.cancel, reload.accept } end)
  return reload
end

-- Offers a reload, for changes that apply after one; the dialog grows to fit its reason.
function ns.OfferReload(why)
  local f = reloadDialog()
  f.title:SetText(ns.Format(L["{why} Reload the UI now to apply it?"], { why = why }))
  fitTitle(f)
  f:Show()
end
