// windows-system: the system group of game windows (Modules/WindowsSystem.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { TITLE_LUA, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY builders for the game's system windows: a frame with a piece of template art, parts
// added by parentKey, and readers for what the skin did (art alpha, a painted panel, themed text).
const SYSTEM_ENV = TITLE_LUA + `
  function __art(f) local t = f:CreateTexture(nil, "BACKGROUND") t:SetTexture("TEST-ONLY-ART") return t end
  function __frame(name) local f = CreateFrame("Frame", name, UIParent) __art(f) f:Hide() return f end
  function __sub(parent, key, kind)
    local c = CreateFrame(kind or "Frame", nil, parent) c.__piece = __art(c) parent[key] = c
    return c
  end
  function __text(parent, key) parent[key] = parent:CreateFontString(nil, "OVERLAY") return parent[key] end
  function __faded(f) for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then return r.__alpha end end end
  function __panelled(f)
    for _, r in ipairs({ f:GetRegions() }) do
      if r:GetObjectType() == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end
    end
    return false
  end
  -- A font string with a font (the game's have one from their template), and text when given.
  function __label(parent, text, name)
    local fs = parent:CreateFontString(name, "ARTWORK") fs:SetFont("Fonts/FRIZQT__.TTF", 12, "")
    if text then fs:SetText(text) end
    return fs
  end
  function __errors(word) for _, e in ipairs(ns.errors) do if e.text:find(word) then return e.text end end return "none" end
  -- A scroll bar shaped like the game's MinimalScrollBar (the thumb in the track), and whether the skin faded its thumb art.
  function __bar(parent)
    local bar = CreateFrame("Frame", nil, parent)
    bar.Track = CreateFrame("Frame", nil, bar) bar.Track.Thumb = CreateFrame("Button", nil, bar.Track)
    bar.Track.Thumb.Middle = bar.Track.Thumb:CreateTexture()
    return bar
  end
  function __barred(bar) return bar.Track.Thumb.Middle.__alpha == 0 end
  -- A scroll box that keeps its rows; Take adds one, as the game's pool does, and tells the callbacks.
  ScrollUtil = { AddAcquiredFrameCallback = function(box, cb, owner) table.insert(box.callbacks, function(row) cb(owner, row) end) end }
  function __box(parent)
    local box = CreateFrame("Frame", nil, parent) box.rows, box.callbacks = {}, {}
    function box:ForEachFrame(fn) for _, r in ipairs(self.rows) do fn(r) end end
    function box:Take(row) table.insert(self.rows, row) for _, cb in ipairs(self.callbacks) do cb(row) end return row end
    return box
  end
  -- A slider with its thumb, and a MinimalSliderWithSteppers-shaped frame holding one with two steppers.
  function __slider(parent)
    local s = CreateFrame("Slider", nil, parent) s:SetSize(120, 16) s:SetThumbTexture("TEST-ONLY-THUMB") s.Art = s:CreateTexture()
    return s
  end
  function __stepped(parent)
    local m = CreateFrame("Frame", nil, parent) m.Slider = __slider(m)
    m.Back, m.Forward = CreateFrame("Button", nil, m), CreateFrame("Button", nil, m)
    return m
  end
  function __stepper(m) return ns.Theme.SliderParts(m.Slider) ~= nil and ns.Theme.ArrowParts(m.Back) ~= nil and ns.Theme.ArrowParts(m.Forward) ~= nil end
`;

// TEST-ONLY: a ButtonFrameTemplate-shaped system window (art, NineSlice, close button, title) with push buttons by parentKey.
const BUTTON_FRAME_ENV = SYSTEM_ENV + `
  function __buttonFrame(name, keys)
    local f = __frame(name)
    __sub(f, "NineSlice") __sub(f, "Bg") __sub(f, "Inset") __sub(f, "Border")
    __sub(f, "CloseButton", "Button") __sub(f, "TitleContainer") __text(f.TitleContainer, "TitleText")
    for _, k in ipairs(keys or {}) do __sub(f, k, "Button") end
    return f
  end
`;

// TEST-ONLY: the game's options window, shaped like SettingsPanel (Blizzard_Settings_Shared).
const SETTINGS_ENV = SYSTEM_ENV + `
  local f = __frame("SettingsPanel")
  __sub(f, "NineSlice") __text(f.NineSlice, "Text") __sub(f, "Bg")
  for _, k in ipairs({ "ClosePanelButton", "CloseButton", "ApplyButton" }) do __sub(f, k, "Button") end
  __sub(f, "SearchBox", "EditBox")
  for _, k in ipairs({ "GameTab", "AddOnsTab" }) do
    local tab = __sub(f, k, "Button") __sub(tab, "Left")
    function tab:OnSelected() end
  end
  __sub(f, "CategoryList") __sub(f, "Container") __sub(f.Container, "SettingsList") __sub(f.Container, "SettingsCanvas")
`;

// The options window's state: its art, its parts dressed, how many frames are painted.
const settings = (addon) => addon.eval(`local f = SettingsPanel
  return { art = __faded(f), nine = __faded(f.NineSlice), bg = f.Bg.__alpha, panel = __panelled(f),
    titleFont = __titled(f.NineSlice.Text), apply = __panelled(f.ApplyButton), close = __panelled(f.CloseButton),
    x = f.ClosePanelButton.__piece.__alpha, search = __panelled(f.SearchBox), tab = __panelled(f.GameTab),
    list = __panelled(f.CategoryList), settings = __panelled(f.Container.SettingsList), canvas = __panelled(f.Container.SettingsCanvas),
    painted = ns.Theme.PaintedCount() }`);

it("the system group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.system"), "its switch is on by default").toBe(true);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'")).toBe("none");
});

it("game options: the window in the theme, its art faded, buttons, search box, tabs and lists dressed", () => {
  const addon = loggedIn(SETTINGS_ENV);
  addon.eval("SettingsPanel:Show()");
  const first = settings(addon);
  expect(first, "art and Bg faded, a panel, title in the theme font, the push buttons, search box, tab and category list themed").toMatchObject({
    art: 0, nine: 0, bg: 0, panel: true, titleFont: true, apply: true, close: true, x: 0, search: true, tab: true, list: true, settings: true,
  });
  expect(first.canvas, "the settings canvas is left to its pages").toBe(false);
  // The Apply button carries the secondary kind's inset fill (the window frame is not read as the button's kind).
  expect(addon.eval(`local c = { ns.Theme.PanelColor(true) }
    for _, r in ipairs({ SettingsPanel.ApplyButton:GetRegions() }) do
      local v = r.__vertexColor
      if v and v[1] == c[1] and v[2] == c[2] and v[3] == c[3] then return true end
    end
    return false`), "the window's buttons are the one game button look: the secondary inset").toBe(true);
  addon.eval("SettingsPanel:Hide() SettingsPanel:Show()");
  expect(settings(addon).painted, "showing it again paints nothing new").toBe(first.painted);
});

it("game options: the selected tab is raised and the raised tab follows the game's selection, the title text stays visible", () => {
  const addon = loggedIn(SETTINGS_ENV);
  addon.eval("SettingsPanel:Show()");
  // Whether a settings tab is raised: its fill (the last BACKGROUND texture T.Tab tints) is the theme's raised colour.
  const raised = (tab) => addon.eval(`local bg for _, r in ipairs({ SettingsPanel.${tab}:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end end local c = bg.__vertexColor local r, g, b = ns.Theme.RGB("raised") return c[1] == r and c[2] == g and c[3] == b`);
  addon.eval("SettingsPanel.GameTab:OnSelected(true)");
  expect([raised("GameTab"), raised("AddOnsTab")], "the selected tab is raised").toEqual([true, false]);
  addon.eval("SettingsPanel.GameTab:OnSelected(false) SettingsPanel.AddOnsTab:OnSelected(true)");
  expect([raised("GameTab"), raised("AddOnsTab")], "and it moves with the selection").toEqual([false, true]);
  expect(addon.eval("return SettingsPanel.NineSlice.__alpha ~= 0"), "the NineSlice frame itself is not faded: its title text is a child").toBe(true);
});

it("game options: switched off it stays the game's, and a client missing parts loads cleanly", () => {
  const off = loggedIn(SETTINGS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { system = false } } }" });
  off.eval("SettingsPanel:Show()");
  const state = settings(off);
  expect([state.art, state.panel, state.apply], "nothing faded or painted").toEqual([undefined, false, false]);
  const bare = loggedIn(SYSTEM_ENV + '__frame("SettingsPanel")');
  bare.eval("SettingsPanel:Show()");
  expect([bare.eval("return __faded(SettingsPanel)"), bare.eval("return __panelled(SettingsPanel)"), bare.eval("return __errors('Windows')")], "a window with none of the parts").toEqual([0, true, "none"]);
});

// A button frame's state: its art, panel, close button, title font and the named parts' panels.
const frameState = (addon, name, parts = []) => addon.eval(`local f = ${name}
  local out = { art = __faded(f), nine = f.NineSlice.__alpha, panel = __panelled(f), x = f.CloseButton.__piece.__alpha,
    title = __titled(f.TitleContainer.TitleText), painted = ns.Theme.PaintedCount(), parts = {} }
  for _, k in ipairs({ ${parts.map((k) => `"${k}"`).join(", ")} }) do out.parts[k] = __panelled(f[k]) end
  return out`);

// Shows a window twice and checks the second show paints nothing new, then that its switch off leaves it the game's.
const sameOnReshow = (addon, name) => {
  const first = frameState(addon, name);
  addon.eval(`${name}:Hide() ${name}:Show()`);
  expect(frameState(addon, name).painted, `${name}: showing it again paints nothing new`).toBe(first.painted);
};
const SWITCH_OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { system = false } } }" };

it("addon list: the window skin plus its push buttons and search box, nothing else of the rows", () => {
  const env = BUTTON_FRAME_ENV + '__buttonFrame("AddonList", { "CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton", "SearchBox" })';
  const addon = loggedIn(env);
  addon.eval("AddonList:Show()");
  expect(frameState(addon, "AddonList", ["CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton", "SearchBox"]),
    "art faded, panel, close button and title themed, buttons and search box themed").toMatchObject({
    art: 0, nine: 0, panel: true, x: 0, title: true, parts: { CancelButton: true, OkayButton: true, EnableAllButton: true, DisableAllButton: true, SearchBox: true },
  });
  sameOnReshow(addon, "AddonList");
  const off = loggedIn(env, SWITCH_OFF);
  off.eval("AddonList:Show()");
  expect(frameState(off, "AddonList").panel, "switched off: the game's window").toBe(false);
  const bare = loggedIn(BUTTON_FRAME_ENV + '__buttonFrame("AddonList")');
  bare.eval("AddonList:Show()");
  expect([frameState(bare, "AddonList").panel, bare.eval("return __errors('Windows')")], "without the buttons: skinned, no error").toEqual([true, "none"]);
});

it("nameplates tutorial: the window skin, the four picture cards kept visible", () => {
  const env = BUTTON_FRAME_ENV + `local f = __buttonFrame("NamePlatesTutorial")
    for _, k in ipairs({ "StyleOptions", "Aggro", "BuffsDebuffs", "EnemyVsFriendly" }) do f[k] = f:CreateTexture(nil, "ARTWORK") end`;
  const addon = loggedIn(env);
  addon.eval("NamePlatesTutorial:Show()");
  expect(frameState(addon, "NamePlatesTutorial"), "background faded, panel painted").toMatchObject({ art: 0, panel: true });
  expect(addon.eval("local f = NamePlatesTutorial return { f.StyleOptions.__alpha, f.Aggro.__alpha, f.BuffsDebuffs.__alpha, f.EnemyVsFriendly.__alpha }"), "the cards are shown").toEqual([1, 1, 1, 1]);
  sameOnReshow(addon, "NamePlatesTutorial");
  const off = loggedIn(env, SWITCH_OFF);
  off.eval("NamePlatesTutorial:Show()");
  expect(frameState(off, "NamePlatesTutorial").art, "switched off: the game's art is not faded").toBeUndefined();
  const bare = loggedIn(BUTTON_FRAME_ENV + '__buttonFrame("NamePlatesTutorial")');
  bare.eval("NamePlatesTutorial:Show()");
  expect(bare.eval("return __errors('Windows')"), "a client without the cards").toBe("none");
});

// TEST-ONLY: the chat settings window: a Border, a Header with a plate and title, two boxes (one with a NineSlice, one named ...Backdrop), a plain child, and the named buttons.
const CHAT_ENV = BUTTON_FRAME_ENV + `
  local f = __buttonFrame("ChatConfigFrame")
  __sub(f, "Header") __text(f.Header, "Text")
  local box = __sub(f, "CategoryBox") __sub(box, "NineSlice")
  local named = CreateFrame("Frame", "TestOnlyChatBackdrop", f) __art(named)
  local plain = CreateFrame("Frame", nil, f) __art(plain) f.Plain = plain
  for _, n in ipairs({ "ChatConfigFrameDefaultButton", "ChatConfigFrameCancelButton", "ChatConfigFrameOkayButton", "CombatLogDefaultButton", "TextToSpeechDefaultButton" }) do
    CreateFrame("Button", n, f):CreateTexture()
  end
`;

it("chat settings: the outer window, its header plate, the boxes under it and the named buttons", () => {
  const addon = loggedIn(CHAT_ENV);
  addon.eval("ChatConfigFrame:Show()");
  expect(frameState(addon, "ChatConfigFrame", ["CategoryBox", "Plain"]), "window skinned; the box with a NineSlice is an inset panel, a plain child is not").toMatchObject({
    art: 0, panel: true, x: 0, title: true, parts: { CategoryBox: true, Plain: false },
  });
  expect(addon.eval(`return { __faded(ChatConfigFrame.Header), __titled(ChatConfigFrame.Header.Text), __faded(ChatConfigFrame.CategoryBox.NineSlice),
    __faded(TestOnlyChatBackdrop), __panelled(TestOnlyChatBackdrop), __panelled(ChatConfigFrameOkayButton), __panelled(TextToSpeechDefaultButton) }`),
    "header art faded and its title in the theme font; the box art faded; a child named ...Backdrop treated as a box; named buttons themed").toEqual([0, true, 0, 0, true, true, true]);
  sameOnReshow(addon, "ChatConfigFrame");
  const off = loggedIn(CHAT_ENV, SWITCH_OFF);
  off.eval("ChatConfigFrame:Show()");
  expect(frameState(off, "ChatConfigFrame").panel, "switched off").toBe(false);
  const bare = loggedIn(BUTTON_FRAME_ENV + '__buttonFrame("ChatConfigFrame")');
  bare.eval("ChatConfigFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "a window without a header, boxes or buttons").toBe("none");
});

// TEST-ONLY: Edit Mode's windows (Blizzard_EditMode): the manager (Border, Title, LayoutLabel, buttons), the system
// settings dialog (a Buttons box the game adds extra buttons to), and the four layout dialogs.
const EDIT_ENV = SYSTEM_ENV + `
  local manager = __frame("EditModeManagerFrame")
  __sub(manager, "Border") __text(manager, "Title") __text(manager, "LayoutLabel")
  for _, k in ipairs({ "CloseButton", "SaveChangesButton", "RevertAllChangesButton" }) do __sub(manager, k, "Button") end
  local dialog = __frame("EditModeSystemSettingsDialog")
  __sub(dialog, "Border") __text(dialog, "Title") __sub(dialog, "CloseButton", "Button") __sub(dialog, "Buttons")
  __sub(dialog.Buttons, "RevertChangesButton", "Button")
  function dialog:UpdateExtraButtons() __sub(self.Buttons, "Extra" .. (self.extras or 0), "Button") self.extras = (self.extras or 0) + 1 end
  for _, name in ipairs({ "EditModeLayoutDialog", "EditModeImportLayoutDialog", "EditModeImportLayoutLinkDialog", "EditModeUnsavedChangesDialog" }) do
    local d = __frame(name) __sub(d, "Border") __text(d, "Title")
    for _, k in ipairs({ "AcceptButton", "CancelButton", "SaveAndProceedButton", "ProceedButton" }) do __sub(d, k, "Button") end
    __sub(d, "LayoutNameEditBox", "EditBox")
    if name == "EditModeImportLayoutDialog" then
      d.EditBoxLabel, d.NameEditBoxLabel = __label(d, "Paste"), __label(d, "Name")
      __sub(__sub(d, "CharacterSpecificLayoutCheckButton"), "Button", "CheckButton")
      __sub(d, "ImportBox", "ScrollFrame") d.ImportBox.ScrollBar = __bar(d.ImportBox)
    end
  end
  -- The manager's own parts (all optional in the bare cases below): the layout dropdown, the three switches, the grid slider, the options well and the expander.
  manager.LayoutDropdown = CreateFrame("Button", nil, manager) manager.LayoutDropdown.Arrow = manager.LayoutDropdown:CreateTexture() manager.LayoutDropdown.Arrow:SetAlpha(0)
  for _, k in ipairs({ "ShowGridCheckButton", "EnableSnapCheckButton", "EnableAdvancedOptionsCheckButton" }) do __sub(__sub(manager, k), "Button", "CheckButton") end
  manager.GridSpacingSlider = CreateFrame("Frame", nil, manager) manager.GridSpacingSlider.Slider = __stepped(manager.GridSpacingSlider)
  local account = CreateFrame("Frame", nil, manager) manager.AccountSettings = account
  local well = __sub(account, "SettingsContainer", "ScrollFrame") __sub(well, "BorderArt") well.ScrollBar = __bar(well)
  local advanced = CreateFrame("Frame", nil, CreateFrame("Frame", nil, well)) well.ScrollChild = advanced:GetParent() advanced:GetParent().AdvancedOptionsContainer = advanced
  for _, k in ipairs({ "FramesTitle", "CombatTitle", "MiscTitle" }) do advanced[k] = CreateFrame("Frame", nil, advanced) advanced[k].Title = __label(advanced[k], k) end
  local rows = CreateFrame("Frame", nil, advanced) local row = CreateFrame("Frame", nil, rows) row.Button = CreateFrame("CheckButton", nil, row) row.Button.Art = row.Button:CreateTexture()
  account.Expander = CreateFrame("Frame", nil, account) account.Expander.Divider = account.Expander:CreateTexture(nil, "ARTWORK")
  dialog.Settings = CreateFrame("Frame", nil, dialog)
  dialog.Buttons.Divider = dialog.Buttons:CreateTexture(nil, "ARTWORK")
  -- UpdateSettings: the game takes a check box, a dropdown and a slider from its pools each time.
  function dialog:UpdateSettings()
    self.updates = (self.updates or 0) + 1
    local check = CreateFrame("Frame", nil, self.Settings) check.Button = CreateFrame("CheckButton", nil, check) check.Button.Art = check.Button:CreateTexture()
    local drop = CreateFrame("Frame", nil, self.Settings) drop.Dropdown = CreateFrame("Button", nil, drop) drop.Dropdown.Arrow = drop.Dropdown:CreateTexture() drop.Dropdown.Arrow:SetAlpha(0)
    local slide = CreateFrame("Frame", nil, self.Settings) slide.Slider = __stepped(slide)
    CreateFrame("Frame", nil, self.Settings)
    self.made = { check, drop, slide }
  end
`;

// A part's state in the Edit Mode windows: art faded, panelled, title in the theme font.
const editState = (addon, name) => addon.eval(`local f = ${name}
  return { art = __faded(f), border = f.Border.__alpha, panel = __panelled(f), title = __titled(f.Title), painted = ns.Theme.PaintedCount() }`);

it("Edit Mode window: skinned, its panel kept out of the game's layout, and Vanguard's note still shows", () => {
  const addon = loggedIn(EDIT_ENV);
  addon.eval("EditModeManagerFrame:Show()");
  const first = editState(addon, "EditModeManagerFrame");
  expect(first, "Border and art faded, a panel, title in the theme font").toMatchObject({ art: 0, border: 0, panel: true, title: true });
  expect(addon.eval(`local m = EditModeManagerFrame
    return { __looks(m.LayoutLabel, "label", "text"), __panelled(m.SaveChangesButton), __panelled(m.RevertAllChangesButton), m.CloseButton.__piece.__alpha }`),
    "the layout label, Save and Revert buttons and close button themed").toEqual([true, true, true, 0]);
  expect(addon.eval(`local m, marked, own = EditModeManagerFrame, 0, 0
    for _, piece in ipairs({ m.Border, m.SaveChangesButton, m.CloseButton }) do if piece.ignoreInLayout then own = own + 1 end end
    for _, r in ipairs({ m:GetRegions() }) do if r.ignoreInLayout then marked = marked + 1 end end
    return { marked > 0, own }`), "the panel's pieces are marked ignoreInLayout; the game's own parts are not").toEqual([true, 0]);
  expect(addon.eval("return { Vanguard_EditModeNote ~= nil and Vanguard_EditModeNote:IsShown(), Vanguard_EditModeNote.text:GetText() == ns.EDIT_NOTE, Vanguard_EditModeNote.__points.TOP.rel == EditModeManagerFrame, Vanguard_EditModeNote.ignoreInLayout == nil }"),
    "Vanguard's Edit Mode note still shows under the window, with its text, and is left alone").toEqual([true, true, true, true]);
  addon.eval("EditModeManagerFrame:Hide() EditModeManagerFrame:Show()");
  expect(editState(addon, "EditModeManagerFrame").painted, "showing it again paints nothing new").toBe(first.painted);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(addon.eval("return Vanguard_EditModeNote:IsShown()"), "and the note hides with the window").toBe(false);
});

it("Edit Mode window: switched off it stays the game's (the note still shows), and a bare client is fine", () => {
  const off = loggedIn(EDIT_ENV, SWITCH_OFF);
  off.eval("EditModeManagerFrame:Show()");
  expect([editState(off, "EditModeManagerFrame").art, off.eval("return Vanguard_EditModeNote:IsShown()")], "the game's art; Vanguard's note is independent of the skin").toEqual([undefined, true]);
  const bare = loggedIn(SYSTEM_ENV + '__frame("EditModeManagerFrame") __frame("EditModeSystemSettingsDialog")');
  bare.eval("EditModeManagerFrame:Show() EditModeSystemSettingsDialog:Show()");
  expect([bare.eval("return __faded(EditModeManagerFrame)"), bare.eval("return __errors('Windows')")], "windows without their parts: skinned, no error").toEqual([0, "none"]);
});

it("Edit Mode system settings: the dialog, its Revert button, and the extra buttons the game adds later", () => {
  const addon = loggedIn(EDIT_ENV);
  addon.eval("EditModeSystemSettingsDialog:Show()");
  expect(editState(addon, "EditModeSystemSettingsDialog"), "skinned like the manager").toMatchObject({ art: 0, border: 0, panel: true, title: true });
  const d = "EditModeSystemSettingsDialog";
  expect(addon.eval(`return { __panelled(${d}.Buttons.RevertChangesButton), ${d}.CloseButton.__piece.__alpha }`), "Revert and close themed").toEqual([true, 0]);
  addon.eval(`${d}:UpdateExtraButtons()`);
  expect(addon.eval(`return __panelled(${d}.Buttons.Extra0)`), "an extra button the game adds is themed as it is added").toBe(true);
  addon.eval(`${d}:Hide() ${d}:Show()`);
  addon.eval(`${d}:UpdateExtraButtons()`);
  expect(addon.eval(`return { __panelled(${d}.Buttons.Extra1), #({ ${d}:GetChildren() }) > 0 }`), "a second show hooks once, a later button is still themed").toEqual([true, true]);
});

it("Edit Mode dialogs: layout, import, import link and unsaved changes get the panel, buttons and name box", () => {
  const addon = loggedIn(EDIT_ENV);
  for (const name of ["EditModeLayoutDialog", "EditModeImportLayoutDialog", "EditModeImportLayoutLinkDialog", "EditModeUnsavedChangesDialog"]) {
    addon.eval(`${name}:Show()`);
    expect(editState(addon, name), `${name}: art faded, panel, title`).toMatchObject({ art: 0, border: 0, panel: true, title: true });
    expect(addon.eval(`return { __panelled(${name}.AcceptButton), __panelled(${name}.CancelButton), __panelled(${name}.LayoutNameEditBox) }`), `${name}: buttons and name box themed`).toEqual([true, true, true]);
    const painted = editState(addon, name).painted;
    addon.eval(`${name}:Hide() ${name}:Show()`);
    expect(editState(addon, name).painted, `${name}: a second show paints nothing new`).toBe(painted);
  }
  const off = loggedIn(EDIT_ENV, SWITCH_OFF);
  off.eval("EditModeLayoutDialog:Show()");
  expect(editState(off, "EditModeLayoutDialog").panel, "switched off: the game's dialog").toBe(false);
});

// TEST-ONLY: the quick keybind banner (a protected Button in the game): its dialog border (BG), header plate and the three buttons.
const KEYBIND_ENV = SYSTEM_ENV + `
  local f = CreateFrame("Button", "QuickKeybindFrame", UIParent) __art(f) f:Hide()
  __sub(f, "BG") __sub(f, "Header") __text(f.Header, "Text") __text(f, "InstructionText")
  for _, k in ipairs({ "DefaultsButton", "CancelButton", "OkayButton" }) do __sub(f, k, "Button") end
  __sub(f, "UseCharacterBindingsButton", "CheckButton")
`;

it("quick keybind banner: a panel behind it, plate faded, buttons themed, and nothing touched in combat", () => {
  const addon = loggedIn(KEYBIND_ENV);
  addon.eval("QuickKeybindFrame:Show()");
  // The quick keybind banner's skin state: art, header, panel, buttons, texts and the paint count.
  const read = () => addon.eval(`local f = QuickKeybindFrame
    return { art = __faded(f), bg = f.BG.__alpha, header = __faded(f.Header), panel = __panelled(f), title = __titled(f.Header.Text),
      buttons = __panelled(f.DefaultsButton) and __panelled(f.CancelButton) and __panelled(f.OkayButton), text = f.InstructionText:GetFont() == nil,
      check = ns.Theme.CheckParts(f.UseCharacterBindingsButton) ~= nil, painted = ns.Theme.PaintedCount() }`);
  const first = read();
  expect(first, "BG and header plate faded, a panel, title and buttons themed, the white instruction text untouched").toMatchObject({
    art: 0, bg: 0, header: 0, panel: true, title: true, buttons: true, text: true, check: true,
  });
  addon.eval("QuickKeybindFrame:Hide() QuickKeybindFrame:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
  const late = loggedIn(SYSTEM_ENV + 'local b = CreateFrame("Button", "TestOnlyBanner", UIParent) __art(b) __sub(b, "UseCharacterBindingsButton", "CheckButton")');
  setCombat(late, true);
  late.eval('ns.GetModule("Windows").SkinQuickKeybind(TestOnlyBanner)');
  expect(late.eval("return { __panelled(TestOnlyBanner), ns.Theme.CheckParts(TestOnlyBanner.UseCharacterBindingsButton) == nil }"), "in combat the banner and its check box are left alone").toEqual([false, true]);
  setCombat(late, false);
  expect(late.eval("return { __panelled(TestOnlyBanner), ns.Theme.CheckParts(TestOnlyBanner.UseCharacterBindingsButton) ~= nil }"), "and skinned right after combat").toEqual([true, true]);
  const off = loggedIn(KEYBIND_ENV, SWITCH_OFF);
  off.eval("QuickKeybindFrame:Show()");
  expect(off.eval("return __panelled(QuickKeybindFrame)"), "switched off").toBe(false);
  const bare = loggedIn(SYSTEM_ENV + 'CreateFrame("Button", "QuickKeybindFrame", UIParent)');
  bare.eval("QuickKeybindFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "a banner without its parts").toBe("none");
});

// TEST-ONLY: the Cooldown Manager's settings window and its two layout dialogs, and the click-casting window (built when its addon loads).
const COOLDOWN_ENV = BUTTON_FRAME_ENV + `
  local cd = __buttonFrame("CooldownViewerSettings", { "SearchBox", "UndoButton" })
  cd.CooldownScroll = __sub(cd, "CooldownScroll", "ScrollFrame") cd.CooldownScroll.ScrollBar = __bar(cd.CooldownScroll)
  cd.LayoutDropdown = CreateFrame("Button", nil, cd) cd.LayoutDropdown.Arrow = cd.LayoutDropdown:CreateTexture() cd.LayoutDropdown.Arrow:SetAlpha(0)
  cd.SettingsDropdown = CreateFrame("Button", nil, cd) cd.SettingsDropdown.Art = cd.SettingsDropdown:CreateTexture() cd.SettingsDropdown.Icon = cd.SettingsDropdown:CreateTexture()
  cd.CooldownScroll.Content = CreateFrame("Frame", nil, cd.CooldownScroll)
  function cd:RefreshLayout()
    self.refreshes = (self.refreshes or 0) + 1
    local category = CreateFrame("Frame", nil, self.CooldownScroll.Content) category.Header = CreateFrame("Button", nil, category) category.Header.Art = category.Header:CreateTexture()
    CreateFrame("Frame", nil, self.CooldownScroll.Content)
  end
  cd:RefreshLayout()
  for _, name in ipairs({ "CooldownViewerLayoutDialog", "CooldownViewerImportLayoutDialog" }) do
    local d = __frame(name) __sub(d, "Border") __text(d, "Title") __sub(d, "AcceptButton", "Button") __sub(d, "CancelButton", "Button")
  end
  function __clickBinding()
    local f = __buttonFrame("ClickBindingFrame", { "SaveButton", "AddBindingButton", "ResetButton" })
    __sub(f, "ScrollBoxBackground") __sub(f.ScrollBoxBackground, "NineSlice")
    f.ScrollBar = __bar(f) f.ScrollBox = __box(f)
    __sub(f, "EnableMouseoverCastCheckbox", "CheckButton")
    f.MouseoverCastKeyDropdown = CreateFrame("Button", nil, f) f.MouseoverCastKeyDropdown.Arrow = f.MouseoverCastKeyDropdown:CreateTexture() f.MouseoverCastKeyDropdown.Arrow:SetAlpha(0)
    f.MouseoverCastKeyDropdown.Label = __label(f.MouseoverCastKeyDropdown, "Key")
    local card = __sub(f, "TutorialFrame") __sub(card, "NineSlice") __sub(card, "CloseButton", "Button") __text(card, "TitleText") card.Tutorial = card:CreateTexture(nil, "BACKGROUND")
    return f
  end
  -- A binding row: a button with its plate, icon, gold hover glow, a mark that says it is new, and the delete button.
  function __bindingRow()
    local row = CreateFrame("Button", nil, ClickBindingFrame)
    row.Background, row.Icon, row.FrameHighlight, row.NewOutline = row:CreateTexture(), row:CreateTexture(), row:CreateTexture(), row:CreateTexture()
    row.DeleteButton = CreateFrame("Button", nil, row) row.DeleteButton.Icon = row.DeleteButton:CreateTexture() row.DeleteButton.Art = row.DeleteButton:CreateTexture()
    return row
  end
`;

it("Cooldown Manager settings and its layout dialogs: the window skin, search box and dialog buttons", () => {
  const addon = loggedIn(COOLDOWN_ENV);
  addon.eval("CooldownViewerSettings:Show() CooldownViewerLayoutDialog:Show() CooldownViewerImportLayoutDialog:Show()");
  expect(frameState(addon, "CooldownViewerSettings", ["SearchBox"]), "the settings window and its search box").toMatchObject({ art: 0, panel: true, x: 0, title: true, parts: { SearchBox: true } });
  for (const name of ["CooldownViewerLayoutDialog", "CooldownViewerImportLayoutDialog"]) {
    expect(editState(addon, name), `${name}: art faded, panel, title`).toMatchObject({ art: 0, border: 0, panel: true, title: true });
    expect(addon.eval(`return __panelled(${name}.AcceptButton)`), `${name}: buttons themed`).toBe(true);
  }
  sameOnReshow(addon, "CooldownViewerSettings");
  expect(addon.eval(`local cd = CooldownViewerSettings
    return { __barred(cd.CooldownScroll.ScrollBar), __panelled(cd.LayoutDropdown), cd.LayoutDropdown.Arrow.__alpha, __panelled(cd.SettingsDropdown), cd.SettingsDropdown.Icon.__alpha ~= 0,
      __panelled(cd.UndoButton), __panelled(({ cd.CooldownScroll.Content:GetChildren() })[1].Header) }`),
    "scroll bar, layout dropdown (arrow kept), the gear dropdown on a control tile with its icon, Revert, and the category header that was there").toEqual([true, true, 1, true, true, true, true]);
  addon.eval("CooldownViewerSettings:RefreshLayout()");
  expect(addon.eval("return { CooldownViewerSettings.refreshes, __panelled(({ CooldownViewerSettings.CooldownScroll.Content:GetChildren() })[3].Header) }"),
    "a category the game makes in RefreshLayout gets its header themed, the game's function still run").toEqual([2, true]);
  const off = loggedIn(COOLDOWN_ENV, SWITCH_OFF);
  off.eval("CooldownViewerSettings:Show() CooldownViewerLayoutDialog:Show()");
  expect([frameState(off, "CooldownViewerSettings").panel, editState(off, "CooldownViewerLayoutDialog").panel], "switched off").toEqual([false, false]);
  const bare = loggedIn(SYSTEM_ENV);
  expect(bare.eval("return __errors('Windows')"), "a client without the Cooldown Manager").toBe("none");
});

// TEST-ONLY: the Cooldown Manager's two alert dialogs, built on one base template (dark border, title, close, Add button, labels, dropdowns).
const ALERT_ENV = BUTTON_FRAME_ENV + `
  function __alert(name, dropdowns)
    local f = __frame(name) __sub(f, "BG") __sub(f, "CloseButton", "Button") __sub(f, "AddButton", "Button")
    f.Icon = f:CreateTexture() f.Icon:SetAlpha(1)
    f.Title, f.Name = __label(f, "Alert"), __label(f, "Fireball")
    for _, key in ipairs({ "PrimaryLabel", "EventLabel", "PayloadLabel" }) do f[key] = __label(f, "Sound") end
    for _, key in ipairs(dropdowns) do
      f[key] = CreateFrame("Button", nil, f) f[key].Arrow = f[key]:CreateTexture() f[key].Arrow:SetAlpha(0)
    end
    return f
  end
  __alert("CooldownViewerSettingsEditAlert", { "TypeDropdown", "EventDropdown", "PayloadDropdown" })
  __alert("GroupBuffFilterEditVisualAlert", { "VisualDropdown" })
`;

it("Cooldown Manager alert dialogs: border faded, title, close, name, group labels as section heads, dropdowns and Add button", () => {
  const addon = loggedIn(ALERT_ENV);
  addon.eval("CooldownViewerSettingsEditAlert:Show() GroupBuffFilterEditVisualAlert:Show()");
  for (const [name, drops] of [["CooldownViewerSettingsEditAlert", ["TypeDropdown", "EventDropdown", "PayloadDropdown"]], ["GroupBuffFilterEditVisualAlert", ["VisualDropdown"]]]) {
    expect(addon.eval(`local f = ${name}
      return { __faded(f), f.BG:GetAlpha(), __panelled(f), __titled(f.Title), __looks(f.Name, "label", "text"), f.CloseButton.__piece.__alpha, __panelled(f.AddButton),
        ns.Theme.RoleSize("section") == select(2, f.PrimaryLabel:GetFont()), f.PrimaryLabel:GetText(), f.Icon.__alpha }`),
      `${name}: art faded, panel, title, name light, close and Add themed, the group label a section head in capitals, the icon kept`).toEqual([0, 0, true, true, true, 0, true, true, "SOUND", 1]);
    expect(addon.eval(`local n = 0 for _, key in ipairs({ ${drops.map((d) => `"${d}"`).join(", ")} }) do if __panelled(${name}[key]) then n = n + 1 end end return n`), `${name}: dropdowns themed`).toBe(drops.length);
  }
  expect(addon.eval("return { ns.Theme.RoleSize('section') == select(2, CooldownViewerSettingsEditAlert.EventLabel:GetFont()), ns.Theme.RoleSize('section') == select(2, CooldownViewerSettingsEditAlert.PayloadLabel:GetFont()) }"), "the other two labels").toEqual([true, true]);
  const first = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("CooldownViewerSettingsEditAlert:Hide() CooldownViewerSettingsEditAlert:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it again paints nothing new").toBe(first);
  const off = loggedIn(ALERT_ENV, SWITCH_OFF);
  off.eval("CooldownViewerSettingsEditAlert:Show()");
  expect(off.eval("return __titled(CooldownViewerSettingsEditAlert.Title)"), "switched off").toBe(false);
  const bare = loggedIn(ALERT_ENV + 'CreateFrame("Frame", "CooldownViewerSettingsEditAlert", UIParent)');
  bare.eval("CooldownViewerSettingsEditAlert:Show()");
  expect(bare.eval("return __errors('Windows')"), "a dialog without its parts").toBe("none");
});

it("click bindings: skinned when their addon loads, with the three buttons and the list backdrop", () => {
  const addon = loggedIn(COOLDOWN_ENV);
  addon.eval("__clickBinding()");
  expect(addon.eval("return ns.FrameState('vgWindow')[ClickBindingFrame]"), "not hooked before its part of the game loads").toBeNull();
  addon.fire("ADDON_LOADED", "Blizzard_ClickBindingUI");
  addon.eval("ClickBindingFrame:Show()");
  expect(frameState(addon, "ClickBindingFrame", ["SaveButton", "AddBindingButton", "ResetButton", "ScrollBoxBackground"]), "window skin, buttons, backdrop as an inset panel").toMatchObject({
    art: 0, panel: true, x: 0, parts: { SaveButton: true, AddBindingButton: true, ResetButton: true, ScrollBoxBackground: true },
  });
  expect(addon.eval("return ClickBindingFrame.ScrollBoxBackground.NineSlice.__piece.__alpha"), "the backdrop's border art faded").toBe(0);
  expect(addon.eval(`local f = ClickBindingFrame local card = f.TutorialFrame
    return { __barred(f.ScrollBar), ns.Theme.CheckParts(f.EnableMouseoverCastCheckbox) ~= nil, __panelled(f.MouseoverCastKeyDropdown), f.MouseoverCastKeyDropdown.Arrow.__alpha,
      __looks(f.MouseoverCastKeyDropdown.Label, "label", "text"), __panelled(card), __faded(card), card.Tutorial.__alpha, card.NineSlice.__alpha, card.CloseButton.__piece.__alpha }`),
    "scroll bar, the mouseover check box, key dropdown (arrow kept) and its light label; the tutorial card a panel with its art faded and its picture kept").toEqual([true, true, true, 1, true, true, 0, 1, 0, 0]);
  addon.eval("local box = ClickBindingFrame.ScrollBox box:Take(__bindingRow())");
  expect(addon.eval(`local row = ClickBindingFrame.ScrollBox.rows[1]
    return { ns.Theme.RowParts(row) ~= nil, row.Background.__alpha, row.FrameHighlight.__alpha, row.Icon.__alpha ~= 0, row.NewOutline.__alpha ~= 0, #({ row.DeleteButton:GetRegions() }), row.DeleteButton.Icon.__alpha ~= 0 }`),
    "a binding row the game takes: a theme row, its plate and gold glow faded, its icon and new mark kept, the delete button with a control tile added to its icon and art").toEqual([true, 0, 0, true, true, 3, true]);
  sameOnReshow(addon, "ClickBindingFrame");
  const off = loggedIn(COOLDOWN_ENV, SWITCH_OFF);
  off.eval("__clickBinding()");
  off.fire("ADDON_LOADED", "Blizzard_ClickBindingUI");
  off.eval("ClickBindingFrame:Show()");
  expect(frameState(off, "ClickBindingFrame").panel, "switched off").toBe(false);
  const bare = loggedIn(BUTTON_FRAME_ENV + "__buttonFrame('ClickBindingFrame')");
  bare.fire("ADDON_LOADED", "Blizzard_ClickBindingUI");
  bare.eval("ClickBindingFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "a window without the buttons or the backdrop").toBe("none");
});

// TEST-ONLY: the help window, the report window (a layout frame with an inset plate and a screenshot box), and the help
// ticket status (with its icon, and a button with a backdrop).
const HELP_ENV = BUTTON_FRAME_ENV + `
  local help = __buttonFrame("HelpFrame") __sub(help, "Browser") __sub(help.Browser, "BrowserInset") __sub(help.Browser.BrowserInset, "NineSlice")
  local report = __frame("ReportFrame") __sub(report, "Border") __text(report, "TitleText") __sub(report, "CloseButton", "Button")
  __sub(report, "ReportButton", "Button") __sub(report, "ScreenshotReportingFrame") __sub(report.ScreenshotReportingFrame, "TakeScreenshotButton", "Button")
  local ticket = __frame("TicketStatusFrame")
  TicketStatusFrameIcon = ticket:CreateTexture(nil, "ARTWORK")
  TicketStatusFrameButton = CreateFrame("Button", "TicketStatusFrameButton", ticket) __sub(TicketStatusFrameButton, "NineSlice")
  TicketStatusTitleText = __label(ticket, "Ticket", "TicketStatusTitleText")
  -- The report window's other parts: the reason dropdown with its label, the details and screenshot texts, the comment box, and the pool of minor-category buttons the game anchors.
  report.ReportingMajorCategoryDropdown = CreateFrame("Button", nil, report) report.ReportingMajorCategoryDropdown.Arrow = report.ReportingMajorCategoryDropdown:CreateTexture() report.ReportingMajorCategoryDropdown.Arrow:SetAlpha(0)
  report.ReportingMajorCategoryDropdown.Label = __label(report.ReportingMajorCategoryDropdown, "Reason")
  report.MinorReportDescription = __label(report, "Details")
  report.ScreenshotReportingFrame.ScreenshotDescription, report.ScreenshotReportingFrame.ScreenshotEmptyText = __label(report.ScreenshotReportingFrame, "Shot"), __label(report.ScreenshotReportingFrame, "Empty")
  __sub(report, "Comment", "ScrollFrame") report.Comment.ScrollBar = __bar(report.Comment)
  local live = {}
  report.MinorCategoryButtonPool = { EnumerateActive = function() local i = 0 return function() i = i + 1 return live[i] end end }
  function report:AnchorMinorCategory()
    local b = CreateFrame("CheckButton", nil, self) b.Normal, b.Checked = b:CreateTexture(), b:CreateTexture() b.Text = __label(b, "Minor")
    live[#live + 1] = b self.anchored = (self.anchored or 0) + 1
  end
  report:AnchorMinorCategory()
`;

it("help window, report window and ticket status in the theme, the ticket icon kept", () => {
  const addon = loggedIn(HELP_ENV);
  addon.eval("HelpFrame:Show() ReportFrame:Show() TicketStatusFrame:Show()");
  expect(frameState(addon, "HelpFrame"), "help: the window skin").toMatchObject({ art: 0, nine: 0, panel: true, x: 0, title: true });
  expect(addon.eval(`local r = ReportFrame
    return { __faded(r), r.Border.__alpha, __panelled(r), __titled(r.TitleText), r.CloseButton.__piece.__alpha, __panelled(r.ReportButton), __panelled(r.ScreenshotReportingFrame.TakeScreenshotButton) }`),
    "report: art and Border faded, panel, title, close, Report and screenshot buttons").toEqual([0, 0, true, true, 0, true, true]);
  expect(addon.eval(`local marked = 0 for _, r in ipairs({ ReportFrame:GetRegions() }) do if r.ignoreInLayout then marked = marked + 1 end end
    return { marked > 0, ReportFrame.Border.ignoreInLayout == nil }`), "the report window's panel pieces stay out of its layout").toEqual([true, true]);
  expect(addon.eval(`return { __faded(TicketStatusFrame), TicketStatusFrameIcon.__alpha ~= 0, __panelled(TicketStatusFrame), TicketStatusFrameButton.NineSlice.__piece.__alpha, __looks(TicketStatusTitleText, "small", "text") }`),
    "ticket status: art faded, the ticket icon kept, a panel, its button's backdrop faded, its title light").toEqual([0, true, true, 0, true]);
  expect(addon.eval(`local well = HelpFrame.Browser.BrowserInset
    return { __panelled(well), well.NineSlice.__alpha, __faded(well) }`), "help: the ring round the browser a faded well under an inset panel").toEqual([true, 0, 0]);
  expect(addon.eval(`local r = ReportFrame
    return { __panelled(r.ReportingMajorCategoryDropdown), r.ReportingMajorCategoryDropdown.Arrow.__alpha, __looks(r.ReportingMajorCategoryDropdown.Label, "label", "text"), __looks(r.MinorReportDescription, "label", "text"),
      __looks(r.ScreenshotReportingFrame.ScreenshotDescription, "label", "text"), __looks(r.ScreenshotReportingFrame.ScreenshotEmptyText, "label", "text"),
      __panelled(r.Comment), __faded(r.Comment), __barred(r.Comment.ScrollBar) }`),
    "report: the reason dropdown (arrow kept), the four labels light, the comment box faded under an inset panel with its scroll bar themed").toEqual([true, 1, true, true, true, true, true, 0, true]);
  // The state of the report window's minor-category button i: dressed as a row, its plate faded, the rail shown.
  const minor = (i) => addon.eval(`local b = ({ ReportFrame:GetChildren() })[1] local live = {}
    for _, c in ipairs({ ReportFrame:GetChildren() }) do if c.Normal then live[#live + 1] = c end end
    b = live[${i}] local p = ns.Theme.RowParts(b)
    return { p ~= nil, b.Normal.__alpha, p.rail:IsShown() }`);
  expect(minor(1), "a minor-category button that was there: a theme row, its art faded, not selected").toEqual([true, 0, false]);
  addon.eval("local b = ({ ReportFrame:GetChildren() })[1] for _, c in ipairs({ ReportFrame:GetChildren() }) do if c.Normal then c:SetChecked(true) end end");
  expect(minor(1)[2], "ticking it lights the rail").toBe(true);
  addon.eval("ReportFrame:AnchorMinorCategory()");
  expect([minor(2), addon.eval("return ReportFrame.anchored")], "one the game anchors later is dressed too, the game's function still run").toEqual([[true, 0, false], 2]);
  const painted = frameState(addon, "HelpFrame").painted;
  addon.eval("HelpFrame:Hide() HelpFrame:Show() ReportFrame:Hide() ReportFrame:Show() TicketStatusFrame:Hide() TicketStatusFrame:Show()");
  expect(frameState(addon, "HelpFrame").painted, "showing them again paints nothing new").toBe(painted);
  const off = loggedIn(HELP_ENV, SWITCH_OFF);
  off.eval("HelpFrame:Show() ReportFrame:Show() TicketStatusFrame:Show()");
  expect([frameState(off, "HelpFrame").panel, off.eval("return __panelled(ReportFrame)"), off.eval("return __faded(TicketStatusFrame)")], "switched off").toEqual([false, false, null]);
  const bare = loggedIn(SYSTEM_ENV + '__frame("HelpFrame") __frame("ReportFrame") __frame("TicketStatusFrame")');
  bare.eval("HelpFrame:Show() ReportFrame:Show() TicketStatusFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "windows without their parts").toBe("none");
});

// TEST-ONLY: the report-cheating dialog (a named title, a comment box, a named Cancel button), the splash window (art, a
// header, two close buttons) and the colour picker with the opacity window (a wheel and swatch that must stay as they are).
const DIALOGS_ENV = BUTTON_FRAME_ENV + `
  local cheat = __frame("ReportCheatingDialog") __sub(cheat, "Border") __sub(cheat, "reportButton", "Button") __sub(cheat, "CommentFrame")
  ReportCheatingDialogTitle = cheat:CreateFontString("ReportCheatingDialogTitle", "ARTWORK")
  CreateFrame("Button", "ReportCheatingDialogCancelButton", cheat):CreateTexture()
  local splash = __frame("SplashFrame") __sub(splash, "TopCloseButton", "Button") __sub(splash, "BottomCloseButton", "Button")
  splash.LeftTexture = splash:CreateTexture(nil, "BACKGROUND")
  local picker = __frame("ColorPickerFrame") __sub(picker, "Border") __sub(picker, "Header") __text(picker.Header, "Text")
  __sub(picker, "Footer") __sub(picker.Footer, "CancelButton", "Button") __sub(picker.Footer, "OkayButton", "Button")
  __sub(picker, "Content") __sub(picker.Content, "HexBox", "EditBox") __sub(picker.Content, "ColorPicker") __sub(picker.Content, "Swatch")
  picker.Content.HexBox.Hash = __label(picker.Content.HexBox, "#")
  local opacity = __frame("OpacityFrame") __sub(opacity, "Border")
  -- The opacity window's global slider: a vertical slider with its thumb, a named OPACITY label and two unnamed marks.
  OpacityFrameSlider = __slider(opacity) OpacityFrameSlider:SetOrientation("VERTICAL")
  OpacityFrameSliderText = __label(OpacityFrameSlider, "Opacity", "OpacityFrameSliderText")
  OpacityFrameSlider.Plus, OpacityFrameSlider.Minus = __label(OpacityFrameSlider, "+"), __label(OpacityFrameSlider, "-")
`;

it("report-cheating dialog, splash window, colour picker and opacity window", () => {
  const addon = loggedIn(DIALOGS_ENV);
  addon.eval("ReportCheatingDialog:Show() SplashFrame:Show() ColorPickerFrame:Show() OpacityFrame:Show()");
  expect(addon.eval(`local d = ReportCheatingDialog
    return { __faded(d), d.Border.__alpha, __panelled(d), __titled(ReportCheatingDialogTitle), __panelled(d.reportButton), __panelled(ReportCheatingDialogCancelButton), __panelled(d.CommentFrame) }`),
    "report cheating: art and Border faded, panel, named title themed, report and Cancel buttons, comment box an inset panel").toEqual([0, 0, true, true, true, true, true]);
  expect(addon.eval(`local s = SplashFrame
    return { s.LeftTexture.__alpha ~= 0, __faded(s) ~= 0, ns.FrameState('vgBack')[s] ~= nil and __panelled(ns.FrameState('vgBack')[s]), __panelled(s.BottomCloseButton), s.TopCloseButton.__piece.__alpha }`),
    "splash: its art is kept (nothing faded), the panel is on a frame behind it, the buttons themed").toEqual([true, true, true, true, 0]);
  expect(addon.eval(`local c = ColorPickerFrame
    return { __faded(c), c.Border.__alpha, __faded(c.Header), __titled(c.Header.Text), __panelled(c), __panelled(c.Footer.CancelButton), __panelled(c.Footer.OkayButton), __panelled(c.Content.HexBox) }`),
    "colour picker: art, Border and header plate faded, a panel, title, buttons and hex box themed").toEqual([0, 0, 0, true, true, true, true, true]);
  expect(addon.eval(`local c = ColorPickerFrame.Content return { c.ColorPicker.__piece.__alpha ~= 0, c.Swatch.__piece.__alpha ~= 0 }`), "the wheel and swatch are untouched").toEqual([true, true]);
  expect(addon.eval("return { OpacityFrame.Border.__alpha, __panelled(OpacityFrame) }"), "opacity window: Border faded, a panel").toEqual([0, true]);
  expect(addon.eval(`local s = OpacityFrameSlider
    return { ns.Theme.SliderParts(s) ~= nil, s.Art.__alpha, __looks(OpacityFrameSliderText, "label", "text") }`),
    "the opacity slider in the theme (its art faded), the OPACITY label light").toEqual([true, 0, true]);
  expect(addon.eval(`local p, m = OpacityFrameSlider.Plus.__textColor, OpacityFrameSlider.Minus.__textColor
    local r, g, b = ns.Theme.RGB("text2") return { p[1] == r and p[2] == g and p[3] == b, m[1] == r and m[2] == g and m[3] == b, OpacityFrameSliderText.__textColor[1] ~= r }`),
    "the + and - marks quiet (text2), the named label not").toEqual([true, true, true]);
  expect(addon.eval(`local h = ColorPickerFrame.Content.HexBox.Hash local r, g, b = ns.Theme.RGB("text2") local c = h.__textColor
    return { ns.Theme.RoleSize("label") == select(2, h:GetFont()), c[1] == r and c[2] == g and c[3] == b }`), "the # beside the hex box a quiet hint").toEqual([true, true]);
});

// The report-cheating, splash and picker windows with their switch off, and with parts missing.
it("report-cheating dialog, splash window and colour picker: switched off, and a client without their parts", () => {
  const off = loggedIn(DIALOGS_ENV, SWITCH_OFF);
  off.eval("ReportCheatingDialog:Show() SplashFrame:Show() ColorPickerFrame:Show() OpacityFrame:Show()");
  expect(off.eval("return { __faded(ReportCheatingDialog) ~= 0, ns.FrameState('vgBack')[SplashFrame] == nil, __faded(ColorPickerFrame) ~= 0, __faded(OpacityFrame) ~= 0 }"), "the game's own windows").toEqual([true, true, true, true]);
  const bare = loggedIn(SYSTEM_ENV + '__frame("ReportCheatingDialog") __frame("SplashFrame") __frame("ColorPickerFrame") __frame("OpacityFrame")');
  bare.eval("ReportCheatingDialog:Show() SplashFrame:Show() ColorPickerFrame:Show() OpacityFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "windows without their parts load cleanly").toBe("none");
  const twice = loggedIn(DIALOGS_ENV);
  twice.eval("SplashFrame:Show() ColorPickerFrame:Show()");
  const before = twice.eval("return ns.Theme.PaintedCount()");
  twice.eval("SplashFrame:Hide() SplashFrame:Show() ColorPickerFrame:Hide() ColorPickerFrame:Show()");
  expect(twice.eval("return ns.Theme.PaintedCount()"), "a second show paints nothing new (the splash's back panel is made once)").toBe(before);
});

// TEST-ONLY: the death recap window (its border pieces and background, X close, Close button), and the combat log's filter bar
// (a black strip, with filter buttons the game makes later).
const RECAP_ENV = SYSTEM_ENV + `
  function __recap()
    local f = __frame("DeathRecapFrame") __sub(f, "CloseXButton", "Button") __sub(f, "CloseButton", "Button") __text(f, "Title")
    f.ScrollBox = CreateFrame("Frame", nil, f) f.ScrollBox.__row = __art(f.ScrollBox) f.ScrollBar = __bar(f)
    f.Divider = f:CreateTexture(nil, "ARTWORK") f.Unavailable = __label(f, "Recap unavailable")
  end
  function __logBar()
    local f = __frame("CombatLogQuickButtonFrame_Custom")
    function __quickButton(i) local b = CreateFrame("Button", "CombatLogQuickButtonFrameButton" .. i, f) __art(b) return b end
    function Blizzard_CombatLog_QuickButton_OnClick(id) __quickButton(4) end
    local filter = CreateFrame("Button", "CombatLogQuickButtonFrame_CustomAdditionalFilterButton", f) filter.Art = filter:CreateTexture()
    local bar = CreateFrame("StatusBar", "CombatLogQuickButtonFrame_CustomProgressBar", f) bar:SetStatusBarTexture("TEST-ONLY-ART")
    return f
  end
`;

it("death recap: skinned when its addon loads, the rows left as the game draws them", () => {
  const addon = loggedIn(RECAP_ENV);
  addon.eval("__recap()");
  expect(addon.eval("return ns.FrameState('vgWindow')[DeathRecapFrame]"), "not hooked before its part of the game loads").toBeNull();
  addon.fire("ADDON_LOADED", "Blizzard_DeathRecap");
  addon.eval("DeathRecapFrame:Show()");
  expect(addon.eval(`local f = DeathRecapFrame
    return { __faded(f), __panelled(f), __titled(f.Title), f.CloseXButton.__piece.__alpha, __panelled(f.CloseButton), f.ScrollBox.__row.__alpha ~= 0 }`),
    "art faded, panel, title, the X close and the Close button themed, the list's rows untouched").toEqual([0, true, true, 0, true, true]);
  expect(addon.eval(`local f = DeathRecapFrame
    local c, r, g, b = f.Unavailable.__textColor, ns.Theme.RGB("text2")
    return { __panelled(f.ScrollBox), __barred(f.ScrollBar), ns.Theme.DividerParts(f.Divider) ~= nil, f.Divider.__alpha, c[1] == r and c[2] == g and c[3] == b }`),
    "the list on an inset panel, its scroll bar themed, the line under the title one pixel of divider, the unavailable message quiet").toEqual([true, true, true, 0, true]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("DeathRecapFrame:Hide() DeathRecapFrame:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "a second show paints nothing new").toBe(painted);
  const off = loggedIn(RECAP_ENV, SWITCH_OFF);
  off.eval("__recap()");
  off.fire("ADDON_LOADED", "Blizzard_DeathRecap");
  off.eval("DeathRecapFrame:Show()");
  expect(off.eval("return __faded(DeathRecapFrame)"), "switched off").toBeNull();
  const bare = loggedIn(SYSTEM_ENV + '__frame("DeathRecapFrame")');
  bare.fire("ADDON_LOADED", "Blizzard_DeathRecap");
  bare.eval("DeathRecapFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "a window without its parts").toBe("none");
});

it("combat log bar: a panel, its filter buttons themed as the game makes them", () => {
  const addon = loggedIn(RECAP_ENV);
  addon.eval("__logBar() __quickButton(1) __quickButton(2)");
  addon.fire("ADDON_LOADED", "Blizzard_CombatLog");
  const bar = "CombatLogQuickButtonFrame_Custom";
  expect(addon.eval(`return { __faded(${bar}), __panelled(${bar}), __panelled(CombatLogQuickButtonFrameButton1), __panelled(CombatLogQuickButtonFrameButton2) }`),
    "strip faded, an inset panel, the buttons that exist themed").toEqual([0, true, true, true]);
  expect(addon.eval(`local bar = CombatLogQuickButtonFrame_CustomProgressBar local r, g, b = ns.Theme.RGB("accent") local c = bar.__barColor
    return { ns.Theme.ArrowParts(CombatLogQuickButtonFrame_CustomAdditionalFilterButton) ~= nil, bar:GetStatusBarTexture().__texture ~= "TEST-ONLY-ART", c ~= nil and c[1] == r and c[2] == g and c[3] == b }`),
    "the additional filters button a theme arrow button, the progress bar in the bar texture and the accent").toEqual([true, true, true]);
  addon.eval(`__quickButton(3) ${bar}:Hide() ${bar}:Show()`);
  expect(addon.eval("return __panelled(CombatLogQuickButtonFrameButton3)"), "a button made later is themed when the bar shows").toBe(true);
  addon.eval(`Blizzard_CombatLog_QuickButton_OnClick(1)`);
  expect(addon.eval("return __panelled(CombatLogQuickButtonFrameButton4)"), "and when a filter is picked").toBe(true);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval(`${bar}:Hide() ${bar}:Show()`);
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing again paints nothing new").toBe(painted);
  const off = loggedIn(RECAP_ENV, SWITCH_OFF);
  off.eval("__logBar() __quickButton(1)");
  off.fire("ADDON_LOADED", "Blizzard_CombatLog");
  expect(off.eval(`return { __faded(${bar}) ~= 0, __faded(CombatLogQuickButtonFrameButton1) ~= 0 }`), "switched off").toEqual([true, true]);
  const bare = loggedIn(SYSTEM_ENV + '__frame("CombatLogQuickButtonFrame_Custom")');
  bare.fire("ADDON_LOADED", "Blizzard_CombatLog");
  bare.eval("CombatLogQuickButtonFrame_Custom:Show()");
  expect(bare.eval("return __errors('Windows')"), "a bar without buttons or the click function").toBe("none");
});

// TEST-ONLY: the addon list with a scroll box of rows (each with an Enabled check button) that the game's AddonList_Update makes as it draws.
const ADDON_ROWS_ENV = BUTTON_FRAME_ENV + `__buttonFrame("AddonList", { "CancelButton", "OkayButton" })
  local box = CreateFrame("Frame", nil, AddonList) AddonList.ScrollBox = box box.ScrollTarget = CreateFrame("Frame", nil, box)
  __rows = 0
  function AddonList_InitButton(r) r.Enabled = CreateFrame("CheckButton", nil, r) r.Enabled.Art = r.Enabled:CreateTexture() r.Enabled:SetChecked(__rows == 1) end
  function AddonList_Update() __rows = __rows + 1 AddonList_InitButton(CreateFrame("Button", "TestOnlyAddonRow" .. __rows, box.ScrollTarget)) end
  AddonList_Update()`;

it("addon list: each row's check button is a themed check box, the rows the game makes while drawing too; never with the group off", () => {
  const addon = loggedIn(ADDON_ROWS_ENV);
  addon.eval("AddonList:Show()");
  // Row i's check button: { art faded, themed, mark shown }.
  const row = (a, i) => a.eval(`local b = TestOnlyAddonRow${i}.Enabled local c = ns.Theme.CheckParts(b) return { b.Art.__alpha, c ~= nil, c ~= nil and c.mark:IsShown() }`);
  expect(row(addon, 1), "the row made before the window showed: dressed on show, checked").toEqual([0, true, true]);
  addon.eval("AddonList_Update()");
  expect(row(addon, 2), "a row made as the list draws: dressed after AddonList_Update, unchecked").toEqual([0, true, false]);
  addon.eval('__rows = 9 AddonList_InitButton(CreateFrame("Button", "TestOnlyAddonRow9", AddonList.ScrollBox.ScrollTarget))');
  expect(row(addon, 9), "a row the scroll box takes into view: dressed after AddonList_InitButton alone").toEqual([0, true, false]);
  sameOnReshow(addon, "AddonList");
  const off = loggedIn(ADDON_ROWS_ENV, SWITCH_OFF);
  off.eval("AddonList:Show() AddonList_Update()");
  expect([frameState(off, "AddonList").panel, off.eval("return ns.Theme.CheckParts(TestOnlyAddonRow1.Enabled) == nil and ns.Theme.CheckParts(TestOnlyAddonRow2.Enabled) == nil")], "switched off: the game's window and rows").toEqual([false, true]);
});

// TEST-ONLY: the chat settings with a section whose boxes (a frame holding a Check button, four frames down, and a sub check button beside it) the game's ChatConfig_CreateCheckboxes makes under the frame it is handed.
const CHAT_CHECKS_ENV = CHAT_ENV + `
  local section = CreateFrame("Frame", "ChatConfigChatSettings", f) local left = CreateFrame("Frame", "ChatConfigChatSettingsLeft", section)
  __boxes = 0
  function ChatConfig_CreateCheckboxes(frame) __boxes = __boxes + 1 local cb = CreateFrame("Frame", "TestOnlyChatCheckBox" .. __boxes, frame or left) cb.Check = CreateFrame("CheckButton", nil, cb) cb.Check.Art = cb.Check:CreateTexture() cb.Sub = CreateFrame("CheckButton", nil, cb) end
  ChatConfig_CreateCheckboxes()`;

it("chat settings: the check buttons inside its boxes are themed check boxes, those made as a category draws too", () => {
  const addon = loggedIn(CHAT_CHECKS_ENV);
  addon.eval("ChatConfigFrame:Show()");
  expect(addon.eval("local b = TestOnlyChatCheckBox1.Check return { b.Art.__alpha, ns.Theme.CheckParts(b) ~= nil }"), "the box made before the window showed").toEqual([0, true]);
  addon.eval("ChatConfig_CreateCheckboxes(ChatConfigChatSettingsLeft)");
  expect(addon.eval("return { ns.Theme.CheckParts(TestOnlyChatCheckBox2.Check) ~= nil, ns.Theme.CheckParts(TestOnlyChatCheckBox2.Sub) ~= nil }"), "a box made as a category draws: dressed after ChatConfig_CreateCheckboxes, from the frame it was handed, its sub box too").toEqual([true, true]);
  expect(addon.eval("return __errors('Windows')"), "no errors").toBe("none");
});

// TEST-ONLY: the options window's lists: both scroll bars, the defaults button and the unkeyed divider in the page header, and the two scroll boxes.
const SETTINGS_LISTS_ENV = SETTINGS_ENV + `
  local f, list = SettingsPanel, SettingsPanel.Container.SettingsList
  f.CategoryList.ScrollBar, list.ScrollBar = __bar(f.CategoryList), __bar(list)
  f.CategoryList.ScrollBox, list.ScrollBox = __box(f.CategoryList), __box(list)
  list.Header = CreateFrame("Frame", nil, list) list.Header.Title = __label(list.Header)
  __sub(list.Header, "DefaultsButton", "Button")
  list.Header.Rule = list.Header:CreateTexture(nil, "ARTWORK") list.Header.Rule:SetAtlas("Options_HorizontalDivider")
  list.Header.Other = list.Header:CreateTexture(nil, "ARTWORK") list.Header.Other:SetAtlas("Options_Plate")
  list.Header.Label = __label(list.Header)
  -- A nav entry (Button with Texture, Label, and the game's state function), and a group header (Background, Label, Init).
  function __navEntry(on)
    local row = CreateFrame("Button", nil, f.CategoryList) row.Texture = row:CreateTexture(nil, "BACKGROUND") row.Label = __label(row)
    function row:UpdateStateInternal(selected) self.Texture:SetAtlas(selected and "Options_List_Active" or "Options_List_Hover") self.Texture:SetShown(selected) end
    if on then row:UpdateStateInternal(true) end
    return row
  end
  function __navHeader()
    local row = CreateFrame("Frame", nil, f.CategoryList) row.Background = row:CreateTexture(nil, "ARTWORK") row.Label = __label(row)
    function row:Init(text) self.Label:SetText(text) end
    return row
  end
  -- A settings row holding a check box, a slider with steppers, a dropdown (in Control) and a push button, as the game's controls do.
  function __settingRow()
    local row = CreateFrame("Frame", nil, list)
    row.Checkbox = CreateFrame("CheckButton", nil, row) row.Checkbox.Art = row.Checkbox:CreateTexture()
    row.SliderWithSteppers = __stepped(row)
    row.Control = CreateFrame("Frame", nil, row) row.Control.Dropdown = CreateFrame("Button", nil, row.Control)
    row.Control.Dropdown.Arrow = row.Control.Dropdown:CreateTexture() row.Control.Dropdown.Arrow:SetAlpha(0)
    row.Button = CreateFrame("Button", nil, row) row.Button.Art = row.Button:CreateTexture()
    return row
  end
`;

it("game options: scroll bars, defaults button, header divider, and the nav and settings rows as the game takes them", () => {
  const addon = loggedIn(SETTINGS_LISTS_ENV);
  addon.eval("SettingsPanel.CategoryList.ScrollBox:Take(__navEntry(true)) SettingsPanel.CategoryList.ScrollBox:Take(__navHeader()) SettingsPanel.Container.SettingsList.ScrollBox:Take(__settingRow())");
  addon.eval("SettingsPanel:Show()");
  expect(addon.eval(`local f = SettingsPanel local list = f.Container.SettingsList
    return { __barred(f.CategoryList.ScrollBar), __barred(list.ScrollBar), __panelled(list.Header.DefaultsButton),
      ns.Theme.DividerParts(list.Header.Rule) ~= nil, ns.Theme.DividerParts(list.Header.Other) == nil, list.Header.Rule.__alpha }`),
    "both scroll bars themed, Defaults a theme button, the header's divider texture one pixel of divider (another texture and a font string left alone)").toEqual([true, true, true, true, true, 0]);
  expect(addon.eval(`local list, row = SettingsPanel.Container.SettingsList, SettingsPanel.Container.SettingsList.ScrollBox.rows[1]
    return { ns.Theme.CheckParts(row.Checkbox) ~= nil, __stepper(row.SliderWithSteppers), __panelled(row.Control.Dropdown), row.Control.Dropdown.Arrow.__alpha, __panelled(row.Button) }`),
    "a row that was already there: its check box, slider with steppers, dropdown (arrow shown) and button themed").toEqual([true, true, true, 1, true]);
  addon.eval("SettingsPanel.Container.SettingsList.ScrollBox:Take(__settingRow())");
  expect(addon.eval(`local row = SettingsPanel.Container.SettingsList.ScrollBox.rows[2]
    return { ns.Theme.CheckParts(row.Checkbox) ~= nil, __stepper(row.SliderWithSteppers), __panelled(row.Control.Dropdown), __panelled(row.Button) }`),
    "and a row the game takes later").toEqual([true, true, true, true]);
  addon.eval("SettingsPanel.Container.SettingsList.ScrollBox:Take(CreateFrame('Frame', nil, SettingsPanel))");
  expect(addon.eval("return __errors('Windows')"), "a row with none of the controls is fine").toBe("none");
});

it("game options: the nav entries get the row washes and follow the game's selection, the group headers become section heads", () => {
  const addon = loggedIn(SETTINGS_LISTS_ENV);
  addon.eval("local box = SettingsPanel.CategoryList.ScrollBox box:Take(__navEntry(true)) box:Take(__navEntry(false)) box:Take(__navHeader())");
  addon.eval("SettingsPanel:Show()");
  // A nav entry's state: dressed, the plate faded, the selected rail shown.
  const entry = (i) => addon.eval(`local row = SettingsPanel.CategoryList.ScrollBox.rows[${i}] local p = ns.Theme.RowParts(row)
    return { p ~= nil, row.Texture.__alpha, p.rail:IsShown() }`);
  expect(entry(1), "a selected entry the window met already selected: row washes, the game's plate faded, the rail on").toEqual([true, 0, true]);
  expect(entry(2), "an unselected entry: no rail").toEqual([true, 0, false]);
  addon.eval("local rows = SettingsPanel.CategoryList.ScrollBox.rows rows[2]:UpdateStateInternal(true) rows[1]:UpdateStateInternal(false)");
  expect([entry(1)[2], entry(2)[2]], "the rail follows the game's state call").toEqual([false, true]);
  addon.eval("local box = SettingsPanel.CategoryList.ScrollBox box:Take(__navEntry(false)):UpdateStateInternal(true)");
  expect(entry(4)[2], "an entry taken later follows too").toBe(true);
  expect(addon.eval(`local head = SettingsPanel.CategoryList.ScrollBox.rows[3]
    head.Label:SetText("Game") head:Init("Addons")
    return { head.Background.__alpha, ns.Theme.RoleSize("section") == select(2, head.Label:GetFont()), head.Label:GetText() }`),
    "a group header: plate faded, label the section role; the text is capitals again after the game sets it").toEqual([0, true, "ADDONS"]);
  expect(addon.eval("return __errors('Windows')"), "no errors").toBe("none");
});

// TEST-ONLY: the addon list's own parts: scroll bar, character dropdown, force-load check, and the performance block with its header and divider.
const ADDON_PARTS_ENV = BUTTON_FRAME_ENV + `
  local f = __buttonFrame("AddonList", { "CancelButton" })
  f.ScrollBar = __bar(f) f.Dropdown = CreateFrame("Button", nil, f) f.Dropdown.Arrow = f.Dropdown:CreateTexture() f.Dropdown.Arrow:SetAlpha(0)
  f.ForceLoad = CreateFrame("CheckButton", nil, f) f.ForceLoad.Art = f.ForceLoad:CreateTexture()
  f.Performance = CreateFrame("Frame", nil, f) f.Performance.Header = __label(f.Performance, "Performance")
  f.Performance.Divider = f.Performance:CreateTexture(nil, "ARTWORK")
`;

it("addon list: scroll bar, character dropdown, force-load box, and the performance block's section head and divider", () => {
  const addon = loggedIn(ADDON_PARTS_ENV);
  addon.eval("AddonList:Show()");
  expect(addon.eval(`local f = AddonList
    return { __barred(f.ScrollBar), __panelled(f.Dropdown), f.Dropdown.Arrow.__alpha, ns.Theme.CheckParts(f.ForceLoad) ~= nil,
      ns.Theme.RoleSize("section") == select(2, f.Performance.Header:GetFont()), f.Performance.Header:GetText(),
      ns.Theme.DividerParts(f.Performance.Divider) ~= nil, f.Performance.Divider.__alpha }`),
    "scroll bar and dropdown (arrow kept) themed, the force-load box a check box, the header small capitals, the divider one pixel of divider").toEqual([true, true, 1, true, true, "PERFORMANCE", true, 0]);
  sameOnReshow(addon, "AddonList");
  const off = loggedIn(ADDON_PARTS_ENV, SWITCH_OFF);
  off.eval("AddonList:Show()");
  expect(off.eval("return { __barred(AddonList.ScrollBar), ns.Theme.DividerParts(AddonList.Performance.Divider) == nil }"), "switched off: the game's").toEqual([false, true]);
});

// TEST-ONLY: the chat settings with two pages: a box with a heading, a color heading, a ring-wearing row holding a check button, a
// radio further down and a plain frame; the combat page's filter box with a scroll bar, a name box and the two arrows; the tab manager.
const CHAT_BOXES_ENV = CHAT_ENV + `
  local page = CreateFrame("Frame", "ChatConfigChatSettings", f)
  local box = __sub(page, "Left") CreateFrame("Frame", "ChatConfigChatSettingsLeft", page) box = ChatConfigChatSettingsLeft __art(box)
  box.NineSlice = CreateFrame("Frame", nil, box) box.NineSlice.__piece = __art(box.NineSlice)
  box.header = __label(box, "Chat")
  ChatConfigChatSettingsLeftColorHeader = __label(box, "Color", "ChatConfigChatSettingsLeftColorHeader")
  local ring = __sub(box, "Row") __sub(ring, "NineSlice") ring.Check = CreateFrame("CheckButton", nil, ring) ring.Check.Art = ring.Check:CreateTexture()
  local deep = CreateFrame("Frame", nil, ring)
  CombatConfigColorsColorizeEntireLineBySource = CreateFrame("CheckButton", "CombatConfigColorsColorizeEntireLineBySource", deep)
  CombatConfigColorsColorizeEntireLineBySource.Art = CombatConfigColorsColorizeEntireLineBySource:CreateTexture()
  CombatConfigColorsColorizeEntireLineByTarget = CreateFrame("CheckButton", "CombatConfigColorsColorizeEntireLineByTarget", deep)
  CreateFrame("Frame", nil, page).__art = nil
  local filters = CreateFrame("Frame", "ChatConfigCombatSettingsFilters", CreateFrame("Frame", nil, f)) __art(filters)
  filters.NineSlice = CreateFrame("Frame", nil, filters) __art(filters.NineSlice)
  filters.ScrollBar = __bar(filters)
  CombatConfigSettingsNameEditBox = CreateFrame("EditBox", "CombatConfigSettingsNameEditBox", filters)
  for _, n in ipairs({ "ChatConfigMoveFilterUpButton", "ChatConfigMoveFilterDownButton", "ChatConfigCombatSettingsFiltersDeleteButton", "CombatConfigSettingsSaveButton" }) do
    _G[n] = CreateFrame("Button", n, filters) _G[n].Art = _G[n]:CreateTexture()
  end
  ChatConfigTextToSpeechSettings = CreateFrame("Frame", "ChatConfigTextToSpeechSettings", f) ChatConfigTextToSpeechSettings.ScrollBar = __bar(ChatConfigTextToSpeechSettings)
`;

it("chat settings: the boxes two levels down, their heads and rings, the radios, scroll bars, filter controls and the extra buttons", () => {
  const addon = loggedIn(CHAT_BOXES_ENV);
  addon.eval("ChatConfigFrame:Show()");
  expect(addon.eval(`local box = ChatConfigChatSettingsLeft
    return { __panelled(box), __faded(box), box.NineSlice.__piece.__alpha, box.Row.NineSlice.__piece.__alpha, __panelled(box.Row),
      ns.Theme.RoleSize("section") == select(2, box.header:GetFont()), box.header:GetText(), ChatConfigChatSettingsLeftColorHeader:GetText() }`),
    "a box on a page: inset panel, its art and ring faded, the row's ring faded and the row itself not a panel, heads small capitals").toEqual([true, 0, 0, 0, false, true, "CHAT", "COLOR"]);
  expect(addon.eval(`local source, target, check = CombatConfigColorsColorizeEntireLineBySource, CombatConfigColorsColorizeEntireLineByTarget, ChatConfigChatSettingsLeft.Row.Check
    return { ns.Theme.CheckParts(source).ring ~= nil, ns.Theme.CheckParts(check).ring == nil, ns.Theme.CheckParts(check).box ~= nil }`),
    "the by-source radio is a radio (dressed before the check walk reached it), a plain check button a check box").toEqual([true, true, true]);
  expect(addon.eval(`return { __barred(ChatConfigCombatSettingsFilters.ScrollBar), __barred(ChatConfigTextToSpeechSettings.ScrollBar), __panelled(CombatConfigSettingsNameEditBox),
    __panelled(ChatConfigCombatSettingsFiltersDeleteButton), __panelled(CombatConfigSettingsSaveButton),
    ns.Theme.ArrowParts(ChatConfigMoveFilterUpButton).glyph.__texCoord[3], ns.Theme.ArrowParts(ChatConfigMoveFilterDownButton).glyph.__texCoord[3] }`),
    "the filter list's and the text-to-speech page's scroll bars, the name box, Delete and Save themed, the move arrows pointing up and down").toEqual([true, true, true, true, true, 1, 0]);
  expect(addon.eval("return __errors('Windows')"), "no errors").toBe("none");
});

// TEST-ONLY: the chat settings' tab manager with a pool of two tabs (ChatConfigTabTemplate-shaped: Left/Middle/Right art), and the game's UpdateSelection.
const CHAT_TABS_ENV = CHAT_ENV + `
  CURRENT_CHAT_FRAME_ID = 2
  local m = CreateFrame("Frame", nil, f) f.ChatTabManager = m
  local tabs = {}
  for i = 1, 2 do local t = CreateFrame("Button", nil, m) t:SetID(i) t.Left, t.Middle, t.Right = t:CreateTexture(), t:CreateTexture(), t:CreateTexture() tabs[i] = t end
  m.tabPool = { EnumerateActive = function() local i = 0 return function() i = i + 1 return tabs[i] end end }
  function m:UpdateSelection(selected) self.picked = selected end
`;

it("chat settings: the window tabs are theme tabs, the current chat window's raised, following the game's selection", () => {
  const addon = loggedIn(CHAT_TABS_ENV);
  addon.eval("ChatConfigFrame:Show()");
  // Whether tab i is raised: its fill (the last BACKGROUND texture T.Tab tints) is the theme's raised colour.
  const raised = (i) => addon.eval(`local bg
    local tab = ({ ChatConfigFrame.ChatTabManager:GetChildren() })[${i}]
    for _, r in ipairs({ tab:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end end
    local c = bg.__vertexColor local r, g, b = ns.Theme.RGB("raised") return c[1] == r and c[2] == g and c[3] == b`);
  expect([addon.eval("return ({ ChatConfigFrame.ChatTabManager:GetChildren() })[1].Left.__alpha"), raised(1), raised(2)],
    "tabs themed (art faded); the current chat window's is raised").toEqual([0, false, true]);
  addon.eval("ChatConfigFrame.ChatTabManager:UpdateSelection(1)");
  expect([raised(1), raised(2), addon.eval("return ChatConfigFrame.ChatTabManager.picked")], "and the raised tab moves when the game picks another (its own function still runs)").toEqual([true, false, 1]);
  const bare = loggedIn(CHAT_ENV + "f.ChatTabManager = CreateFrame('Frame', nil, f)");
  bare.eval("ChatConfigFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "a manager without its pool or selection function").toBe("none");
});

it("Edit Mode window: layout dropdown, the grid slider, the switches and the account settings' check boxes, the options well, its scroll bar, section heads and the expander line", () => {
  const addon = loggedIn(EDIT_ENV);
  addon.eval("EditModeManagerFrame:Show()");
  expect(addon.eval(`local m = EditModeManagerFrame
    return { __panelled(m.LayoutDropdown), m.LayoutDropdown.Arrow.__alpha, __stepper(m.GridSpacingSlider.Slider),
      ns.Theme.CheckParts(m.ShowGridCheckButton.Button) ~= nil, ns.Theme.CheckParts(m.EnableSnapCheckButton.Button) ~= nil, ns.Theme.CheckParts(m.EnableAdvancedOptionsCheckButton.Button) ~= nil }`),
    "the dropdown (arrow kept), the slider with its steppers, and the three switches").toEqual([true, 1, true, true, true, true]);
  expect(addon.eval(`local well = EditModeManagerFrame.AccountSettings.SettingsContainer
    local rows = ({ well.ScrollChild.AdvancedOptionsContainer:GetChildren() })[4]
    local row = ({ rows:GetChildren() })[1]
    local marked = 0 for _, r in ipairs({ well:GetRegions() }) do if r.ignoreInLayout then marked = marked + 1 end end
    return { ns.Theme.CheckParts(row.Button) ~= nil, __panelled(well), well.BorderArt.__alpha, __barred(well.ScrollBar), marked > 0, well.BorderArt.ignoreInLayout == nil }`),
    "an account settings row's check box, the options well an inset panel (its pieces out of the layout, the game's own parts not) with its ring faded, its scroll bar themed").toEqual([true, true, 0, true, true, true]);
  expect(addon.eval(`local adv = EditModeManagerFrame.AccountSettings.SettingsContainer.ScrollChild.AdvancedOptionsContainer
    local fs = adv.CombatTitle.Title
    local x = EditModeManagerFrame.AccountSettings.Expander
    local held = 0 for _, c in ipairs({ x:GetChildren() }) do if c.ignoreInLayout then held = held + 1 end end
    return { ns.Theme.RoleSize("section") == select(2, fs:GetFont()), fs:GetText(), ns.Theme.DividerParts(x.Divider) ~= nil, x.Divider.__alpha, held }`),
    "a section title a small capitals head; the expander's divider one pixel of divider, its line kept out of the expander's layout").toEqual([true, "COMBATTITLE", true, 0, 1]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("EditModeManagerFrame:Hide() EditModeManagerFrame:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "showing it again paints nothing new").toBe(painted);
});

it("Edit Mode system settings: the check boxes, dropdowns and sliders the game takes after each UpdateSettings, and the Revert divider", () => {
  const addon = loggedIn(EDIT_ENV);
  const d = "EditModeSystemSettingsDialog";
  addon.eval(`${d}:Show()`);
  expect(addon.eval(`return ns.Theme.DividerParts(${d}.Buttons.Divider) ~= nil`), "the line between Revert and the extra buttons is a divider").toBe(true);
  addon.eval(`${d}:UpdateSettings()`);
  // The settings made by the last UpdateSettings: { check box, dropdown, dropdown arrow, slider with steppers, the plain frame untouched }.
  const made = () => addon.eval(`local c, dd, sl = table.unpack(${d}.made)
    return { ns.Theme.CheckParts(c.Button) ~= nil, __panelled(dd.Dropdown), dd.Dropdown.Arrow.__alpha, __stepper(sl.Slider) }`);
  expect(made(), "each setting is dressed as the game takes it").toEqual([true, true, 1, true]);
  addon.eval(`${d}:Hide() ${d}:Show() ${d}:UpdateSettings()`);
  expect([made(), addon.eval(`return ${d}.updates`)], "and again after the next one, the hook made once and the game's function still run").toEqual([[true, true, 1, true], 2]);
  expect(addon.eval("return __errors('Windows')"), "no errors").toBe("none");
});

it("Edit Mode import dialog: the character-specific check, the field labels, the import box on an inset with its scroll bar", () => {
  const addon = loggedIn(EDIT_ENV);
  const d = "EditModeImportLayoutDialog";
  addon.eval(`${d}:Show()`);
  expect(addon.eval(`local d = ${d}
    return { ns.Theme.CheckParts(d.CharacterSpecificLayoutCheckButton.Button) ~= nil, __looks(d.EditBoxLabel, "label", "text"), __looks(d.NameEditBoxLabel, "label", "text"),
      __faded(d.ImportBox), __panelled(d.ImportBox), __barred(d.ImportBox.ScrollBar) }`),
    "the check box, both labels light, the box's art faded under an inset panel, its scroll bar themed").toEqual([true, true, true, 0, true, true]);
  addon.eval(`EditModeLayoutDialog:Show()`);
  expect(addon.eval("return __errors('Windows')"), "a dialog without those parts is fine").toBe("none");
});
