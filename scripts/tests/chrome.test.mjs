// chrome: the shared window chrome (Core/Chrome.lua) and the game scroll bar's thumb (T.ScrollBar), in the
// TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a 400 x 300 painted panel at the screen's centre to hang chrome on, by global name. It is made
// on one of Vanguard's frames, so it counts as Vanguard's own (the chrome stores title and close on it), then
// moved to UIParent for its scale and visibility.
const PANEL_LUA = `
  function __panel(name)
    local f = CreateFrame("Frame", name, Vanguard_Minimap)
    f:SetParent(UIParent)
    ns.Theme.Panel(f, { shadow = true })
    f:SetSize(400, 300)
    f:SetPoint("CENTER")
    return f
  end
`;

// A font string's role size and colour token, as the player sees them: { size, isText, isText2 }.
const look = (addon, ref) => {
  const f = addon.frame(ref);
  return { size: f.font.size, text: isTok(addon, f.textColor, "text"), text2: isTok(addon, f.textColor, "text2"), muted: isTok(addon, f.textColor, "muted") };
};

it("a window title: the title role in the text colour on the close button's line, its count beside it, the close placed and working, Escape closes", () => {
  const addon = loggedIn(PANEL_LUA);
  addon.eval(`__closed = {}
    local f = __panel("TestOnlyWindow")
    __parts = ns.WindowTitle(f, "Test only", { count = "3 quests", onClose = function(frame) __closed[#__closed + 1] = frame end, escape = true })`);
  expect(look(addon, "TestOnlyWindow.title"), "the title role, in text").toMatchObject({ size: addon.eval("return ns.Theme.RoleSize('title')"), text: true });
  expect(look(addon, "__parts.count"), "the count in small text2").toMatchObject({ size: addon.eval("return ns.Theme.RoleSize('small')"), text2: true });
  const offsets = addon.eval(`local f, t, c = TestOnlyWindow, TestOnlyWindow.title, __parts.count
    return { t:GetLeft() - f:GetLeft(), (t:GetTop() + t:GetBottom()) / 2 - f:GetTop(), c:GetLeft() - t:GetRight(), t:GetText(), c:GetText() }`);
  expect(offsets, "T.SPACE.pad in, centred on the close button's line (T.CONTROL.inset down), the count T.SPACE.gap + 2 right of it").toEqual([16, -24, 10, "Test only", "3 quests"]);
  const close = addon.eval(`local f, c = TestOnlyWindow, TestOnlyWindow.close
    local inset = ns.Theme.PixelRound(f, ns.Theme.CONTROL.inset)
    local p = c.__points.CENTER
    return { c == __parts.close, p.rel == f, p.relPoint, p.x + inset, p.y + inset, c:IsShown() }`);
  expect(close, "the close button where every window has it (T.PlaceClose), and frame.close is it").toEqual([true, true, "TOPRIGHT", 0, 0, true]);
  addon.click("TestOnlyWindow.close");
  expect(addon.eval("return #__closed == 1 and __closed[1] == TestOnlyWindow"), "its click calls onClose with the frame").toBe(true);
  expect(addon.eval("for _, n in ipairs(UISpecialFrames) do if n == 'TestOnlyWindow' then return true end end return false"), "Escape closes it (UISpecialFrames)").toBe(true);
  expect(addon.eval("return TestOnlyWindow.title == __parts.title"), "frame.title is the title").toBe(true);
});

it("a window title centred, a card heading left or centred, and the parts that aren't asked for", () => {
  const addon = loggedIn(PANEL_LUA);
  const centred = addon.eval(`local f = __panel("TestOnlyCentred")
    local p = ns.WindowTitle(f, "Setup", { align = "center", count = "Step 1 of 3" })
    local t, c = p.title, p.count
    return { t:GetTop() - f:GetTop(), (t:GetLeft() + t:GetRight()) / 2 - (f:GetLeft() + f:GetRight()) / 2, c:GetTop() - t:GetBottom(),
      (c:GetLeft() + c:GetRight()) / 2 - (t:GetLeft() + t:GetRight()) / 2, p.close == nil, f.close == nil }`);
  expect(centred, "a centred window title hangs T.CONTROL.inset down, its count T.SPACE.tight under it, both centred; no close unless asked").toEqual([-24, 0, -4, 0, true, true]);
  addon.eval(`__cardClosed = 0
    local f = __panel("TestOnlyCard")
    __card = ns.WindowTitle(f, "Rolls", { kind = "card", onClose = function() __cardClosed = __cardClosed + 1 end })`);
  expect(look(addon, "TestOnlyCard.title"), "a card's title is the heading role, in text").toMatchObject({ size: addon.eval("return ns.Theme.RoleSize('heading')"), text: true });
  const card = addon.eval(`local f, t, c = TestOnlyCard, TestOnlyCard.title, TestOnlyCard.close
    return { t:GetLeft() - f:GetLeft(), t:GetTop() - f:GetTop(), f:GetRight() - c:GetRight(), f:GetTop() - c:GetTop(), __card.count == nil }`);
  expect(card, "T.SPACE.gap in from the card's corner, the close T.SPACE.gap in from its top-right corner, no count unless asked").toEqual([8, -8, 8, 8, true]);
  addon.click("TestOnlyCard.close");
  expect(addon.eval("return __cardClosed"), "the card's close works too").toBe(1);
  const cardCentred = addon.eval(`local f = __panel("TestOnlyCardCentred")
    local t = ns.WindowTitle(f, "AFK", { kind = "card", align = "center" }).title
    return { t:GetTop() - f:GetTop(), (t:GetLeft() + t:GetRight()) / 2 - (f:GetLeft() + f:GetRight()) / 2 }`);
  expect(cardCentred, "a centred card heading hangs T.SPACE.gap down").toEqual([-8, 0]);
});

it("Escape needs a named frame, and a client without UISpecialFrames is fine", () => {
  const addon = loggedIn(PANEL_LUA);
  const unnamed = addon.eval(`local ok, err = pcall(ns.WindowTitle, CreateFrame("Frame", nil, UIParent), "Nameless", { escape = true }) return { ok, err }`);
  expect(unnamed[0], "an unnamed frame can't close on Escape").toBe(false);
  expect(unnamed[1]).toMatch(/escape needs a named frame/);
  const without = addon.eval(`local saved = UISpecialFrames
    UISpecialFrames = nil
    local ok = pcall(ns.WindowTitle, __panel("TestOnlyNoList"), "Old client", { escape = true })
    UISpecialFrames = saved
    return ok`);
  expect(without, "no list, no error").toBe(true);
});

// TEST-ONLY: a 300 x 200 scroll view on a panel, its content `height` tall, reachable as the global __view.
const VIEW_LUA = (height) => `local f = __panel("TestOnlyScroller")
  __view = ns.ScrollView(f, { width = 300 })
  __view:SetPoint("TOPLEFT", 16, -40)
  __view:SetSize(300, 200)
  __view:Fit(${height})`;

// The view's state: scroll, thumb shown, grip shown, the edges, the thumb's height and its offsets from the view
// (false while hidden), and the content's height.
const viewState = (addon) => addon.eval(`local v, t = __view, __view.thumb
  return { v:GetVerticalScroll(), t:IsShown(), v.grip:IsShown(), v.fadeTop:IsShown(), v.fadeBottom:IsShown(), t:GetHeight(),
    t:IsShown() and t:GetRight() - v:GetRight(), t:IsShown() and v:GetTop() - t:GetTop(), v.child:GetHeight() }`);

it("a scroll view whose content fits: no thumb, no edges, the wheel does nothing, Fit never shrinks the content under one unit", () => {
  const addon = loggedIn(PANEL_LUA + VIEW_LUA(100));
  expect(viewState(addon).slice(0, 5), "all fits: nothing shows").toEqual([0, false, false, false, false]);
  addon.wheel("__view", -1);
  expect(viewState(addon)[0], "the wheel has nowhere to go").toBe(0);
  addon.eval("__view:Fit(0)");
  expect(viewState(addon)[8], "a content height of 0 is 1").toBe(1);
  expect(addon.eval("return __view.child:GetWidth()"), "the content is opts.width wide").toBe(300);
});

it("a scroll view that overflows: the T.SCROLL thumb right of the view, ScrollTo clamped, the wheel in 40s, the soft edges follow", () => {
  const addon = loggedIn(PANEL_LUA + VIEW_LUA(800));
  expect(viewState(addon), "at the top: the thumb (a quarter of the view, 50) at the top, 12 right of the view; only the bottom edge").toEqual([0, true, true, false, true, 50, 12, 0, 800]);
  const thumb = addon.frame("__view.thumb");
  expect([thumb.rect.width / addon.eval("return __view:GetEffectiveScale()"), thumb.alpha, isTok(addon, thumb.vertexColor, "text2")], "T.SCROLL.thumb wide, text2, at the rest alpha").toEqual([4, 0.5, true]);
  addon.eval("__view:ScrollTo(100)");
  expect(viewState(addon).slice(0, 8), "scrolled 100 of 600: both edges, the thumb a sixth of its travel (150) down").toEqual([100, true, true, true, true, 50, 12, 25]);
  addon.eval("__view:ScrollTo(10000)");
  expect(viewState(addon).slice(0, 5), "clamped to the end: no bottom edge").toEqual([600, true, true, true, false]);
  addon.eval("__view:ScrollTo(-5)");
  expect(viewState(addon)[0], "clamped to the top").toBe(0);
  addon.wheel("__view", -1);
  addon.wheel("__view", -1);
  expect(viewState(addon)[0], "a wheel step down scrolls 40").toBe(80);
  addon.wheel("__view.child", 1);
  expect(viewState(addon)[0], "a step up over the content scrolls the view back 40").toBe(40);
  addon.eval("__view:Fit(220)");
  expect(viewState(addon).slice(0, 2), "Fit clamps the scroll to the new range").toEqual([20, true]);
});

it("a scroll view's grip: the thumb lights under the mouse, and dragging it scrolls the content as far as the thumb's travel", () => {
  const addon = loggedIn(PANEL_LUA + VIEW_LUA(800));
  addon.hover("__view.grip");
  expect(addon.frame("__view.thumb").alpha, "lit under the mouse").toBe(1);
  addon.hover(null);
  expect(addon.frame("__view.thumb").alpha, "the rest alpha off it").toBe(0.5);
  const drag = addon.eval(`local v, s = __view, __view:GetEffectiveScale()
    __wfgWorld.mouse = { x = 0, y = 500 }
    v.grip:GetScript("OnMouseDown")(v.grip, "RightButton")
    local right = v.drag == nil
    v.grip:GetScript("OnMouseDown")(v.grip, "LeftButton")
    __wfgWorld.mouse = { x = 0, y = 500 - 75 * s }
    __wfgStub.update(0.05)
    local dragged, lit = v:GetVerticalScroll(), v.thumb:GetAlpha()
    v.grip:GetScript("OnMouseUp")(v.grip, "LeftButton")
    __wfgWorld.mouse = { x = 0, y = 0 }
    __wfgStub.update(0.05)
    return { right, dragged, lit, v:GetVerticalScroll(), v.thumb:GetAlpha(), v.grip:GetScript("OnUpdate") == nil }`);
  expect(drag, "the right button starts nothing; the left drags half the travel (150) for half the content (600), lit while held, and stops when let go").toEqual([true, 300, 1, 300, 0.5, true]);
  const short = addon.eval(`local f = __panel("TestOnlyShort")
    local v = ns.ScrollView(f, { width = 100 })
    v:SetPoint("TOPLEFT", 16, -40)
    v:SetSize(100, 20)
    v:Fit(30)
    __wfgWorld.mouse = { x = 0, y = 500 }
    v.grip:GetScript("OnMouseDown")(v.grip, "LeftButton")
    __wfgWorld.mouse = { x = 0, y = 400 }
    __wfgStub.update(0.05)
    v.grip:GetScript("OnMouseUp")(v.grip, "LeftButton")
    return { v.thumb:GetHeight(), v:GetVerticalScroll() }`);
  expect(short, "a view shorter than the smallest thumb (24) shows it but a drag has no travel to scale").toEqual([24, 0]);
});

it("a scroll view around a multi-line edit box follows its cursor", () => {
  const addon = loggedIn(PANEL_LUA);
  const out = addon.eval(`local f = __panel("TestOnlyEditor")
    local box = CreateFrame("EditBox", nil, f)
    box:SetMultiLine(true)
    box:SetSize(300, 1)
    local v = ns.ScrollView(f, { child = box })
    v:SetPoint("TOPLEFT", 16, -40)
    v:SetSize(300, 100)
    v:Fit(500)
    v:FollowCursor(box)
    local moved = box:GetScript("OnCursorChanged")
    local out = { v.child == box, v:GetVerticalScroll() }
    moved(box, 0, -250, 1, 14) out[#out + 1] = v:GetVerticalScroll()
    moved(box, 0, -50, 1, 14) out[#out + 1] = v:GetVerticalScroll()
    moved(box, 0, -60, 1, 14) out[#out + 1] = v:GetVerticalScroll()
    return out`);
  expect(out, "the box is the content; a cursor below the view scrolls so its line's bottom is in view (264 - 100), one above scrolls to it, one inside moves nothing").toEqual([true, 0, 164, 50, 50]);
});

it("a section header: small muted capitals 18 tall, a count after it, and SetText keeps the capitals", () => {
  const addon = loggedIn(PANEL_LUA);
  addon.eval(`local f = __panel("TestOnlyHeaders")
    __plain = ns.Widgets.SectionHeader(f, "Quests", { width = 200, count = "3" })
    __plain:SetPoint("TOPLEFT", 16, -40)`);
  expect(look(addon, "__plain.text"), "small, muted").toMatchObject({ size: addon.eval("return ns.Theme.RoleSize('small')"), muted: true });
  expect(look(addon, "__plain.count"), "the count in small text2").toMatchObject({ size: addon.eval("return ns.Theme.RoleSize('small')"), text2: true });
  const plain = addon.eval(`local h = __plain
    return { h:GetHeight(), h:GetWidth(), h.text:GetText(), h.count:GetText(), h.count:GetLeft() - h.text:GetRight(), h.chevron == nil, h.text:GetLeft() - h:GetLeft() }`);
  expect(plain, "18 tall, opts.width wide, QUESTS with its count T.SPACE.tight after, no chevron, the text at the left edge").toEqual([18, 200, "QUESTS", "3", 4, true, 0]);
  addon.eval("__plain:SetText('Rewards')");
  expect(addon.eval("return __plain.text:GetText()"), "SetText goes through the capitals too").toBe("REWARDS");
  expect(addon.eval("local h = ns.Widgets.SectionHeader(__plain:GetParent(), 'Bare') return { h.count == nil, h:GetWidth() }"), "no opts: no count, no width set").toEqual([true, 0]);
});

it("a collapsible section header: a 12 px chevron in text2 left of the text that swaps on a click, SetCollapsed and onToggle", () => {
  const addon = loggedIn(PANEL_LUA);
  addon.eval(`__toggled = {}
    local f = __panel("TestOnlyFold")
    __fold = ns.Widgets.SectionHeader(f, "Elwynn Forest", { width = 200, collapsible = true, onToggle = function(c) __toggled[#__toggled + 1] = c end })
    __fold:SetPoint("TOPLEFT", 16, -40)`);
  const chevron = addon.frame("__fold.chevron");
  const scale = addon.eval("return __fold:GetEffectiveScale()");
  expect([chevron.rect.width / scale, chevron.rect.height / scale, isTok(addon, chevron.vertexColor, "text2"), /Down$/.test(chevron.texture)], "a 12 px Down chevron in text2 while open").toEqual([12, 12, true, true]);
  expect(addon.eval("local h = __fold return { h.text:GetLeft() - h.chevron:GetRight(), h.chevron:GetLeft() - h:GetLeft(), h.collapsed }"), "the text T.SPACE.tight right of the chevron at the left edge; open").toEqual([4, 0, false]);
  addon.click("__fold");
  expect(addon.eval("return { __fold.collapsed, __fold.chevron:GetTexture(), __toggled[1] }"), "a click folds it: the Right chevron, onToggle(true)").toEqual([true, addon.eval("return ns.Theme.Icon('Right')"), true]);
  addon.click("__fold");
  expect(addon.eval("return { __fold.collapsed, __fold.chevron:GetTexture(), __toggled[2], #__toggled }"), "and opens it again").toEqual([false, addon.eval("return ns.Theme.Icon('Down')"), false, 2]);
  addon.eval("__fold:SetCollapsed(true)");
  expect(addon.eval("return { __fold.collapsed, #__toggled }"), "SetCollapsed shows the state without telling onToggle").toEqual([true, 2]);
  expect(addon.eval(`local h = ns.Widgets.SectionHeader(__fold:GetParent(), "Quiet", { collapsible = true })
    h:Click()
    return h.collapsed`), "collapsible without onToggle still folds on a click").toBe(true);
});

it("a list row: T.ROW.height tall with the hover wash, and the one selected look (rail and wash) that follows the accent", () => {
  const addon = loggedIn(PANEL_LUA);
  addon.eval(`local f = __panel("TestOnlyRows")
    __row = ns.Widgets.Row(f, nil, { width = 300 })
    __row:SetPoint("TOPLEFT", 16, -40)
    __short = ns.Widgets.Row(f, 20)`);
  const rows = addon.eval(`local r = __row
    local hover
    for _, t in ipairs({ r:GetRegions() }) do if t.__layer == "HIGHLIGHT" then hover = t.__vertexColor end end
    return { r:GetHeight(), r:GetWidth(), __short:GetHeight(), __short:GetWidth(), r.selected, r.rail:IsShown(), r.wash:IsShown(), hover }`);
  expect(rows.slice(0, 7), "28 tall (or the height given), opts.width wide, not selected: no rail, no wash").toEqual([28, 300, 20, 0, false, false, false]);
  expect(isTok(addon, rows[7], "hover"), "the hover wash on the highlight layer").toBe(true);
  addon.eval("__row:SetSelected(true)");
  const selected = addon.eval(`local r = __row
    return { r.selected, r.rail:IsShown(), r.wash:IsShown(), r.rail:GetWidth() / ns.Theme.Pixel(r), r.rail:GetLeft() - r:GetLeft(), r.rail:GetHeight() - r:GetHeight(), r.wash.__vertexColor[4] }`);
  expect(selected, "selected: a rail T.ROW.rail screen pixels wide down the left edge, the wash at T.ROW.wash alpha").toEqual([true, true, true, 2, 0, 0, 0.12]);
  expect([isTok(addon, addon.frame("__row.rail").vertexColor, "accent"), isTok(addon, addon.frame("__row.wash").vertexColor, "accent")], "both in the accent").toEqual([true, true]);
  addon.slash("accent ff8000");
  expect([isTok(addon, addon.frame("__row.rail").vertexColor, "accent"), isTok(addon, addon.frame("__row.wash").vertexColor, "accent"), addon.frame("__row.wash").vertexColor[3]], "a new accent re-tints them (T.Tint remembers)").toEqual([true, true, 0.12]);
  addon.eval("__row:SetSelected(false)");
  expect(addon.eval("return { __row.selected, __row.rail:IsShown(), __row.wash:IsShown() }"), "unselected again").toEqual([false, false, false]);
});

// TEST-ONLY scroll bar shaped like the game's MinimalScrollBar: a Track holding the Thumb, arrow buttons with art.
const BAR_LUA = `
  function __bar()
    local bar = CreateFrame("Frame", nil, UIParent)
    bar:SetSize(16, 300)
    bar:SetPoint("CENTER")
    bar.Track = CreateFrame("Frame", nil, bar)
    bar.Track:SetAllPoints()
    bar.Track.Begin = bar.Track:CreateTexture()
    bar.Track.Thumb = CreateFrame("Button", nil, bar.Track)
    bar.Track.Thumb:SetSize(8, 60)
    bar.Track.Thumb:SetPoint("TOP")
    bar.Track.Thumb.Middle = bar.Track.Thumb:CreateTexture()
    bar.Back, bar.Forward = CreateFrame("Button", nil, bar), CreateFrame("Button", nil, bar)
    bar.Back.Texture = bar.Back:CreateTexture()
    return bar
  end
`;

it("T.ScrollBar: the game's thumb carries the one T.SCROLL line, lit while the mouse is over it or drags it; the arrows fade and stop taking the mouse", () => {
  const addon = loggedIn(PANEL_LUA + BAR_LUA);
  addon.eval("__gbar = __bar() ns.Theme.ScrollBar(__gbar) ns.Theme.ScrollBar(__gbar) __thumb = __gbar.Track.Thumb __line = ns.FrameState('vgThumb')[__thumb].bar");
  const line = addon.frame("__line");
  const scale = addon.eval("return __thumb:GetEffectiveScale()");
  expect([line.rect.width / scale, line.rect.height / scale, line.alpha, isTok(addon, line.vertexColor, "text2"), line.visible], "T.SCROLL.thumb wide, the thumb's height, at the rest alpha, text2, after two dressings").toEqual([4, 60, 0.5, true, true]);
  const faded = addon.eval(`local b = __gbar
    local lines = 0
    for _, r in ipairs({ __thumb:GetRegions() }) do if r.__alpha ~= 0 then lines = lines + 1 end end
    return { b.Track.Begin.__alpha, __thumb.Middle.__alpha, lines, b.Back:GetAlpha(), b.Forward:GetAlpha(), b.Back.__mouse, b.Forward.__mouse,
      ns.FrameState('vgArrow')[b.Back] ~= nil, (__line:GetLeft() + __line:GetRight()) / 2 - (__thumb:GetLeft() + __thumb:GetRight()) / 2 }`);
  expect(faded, "the track and thumb art faded, the line the only thing left on the thumb and centred on it; the arrows at alpha 0 without the mouse, marked once").toEqual([0, 0, 1, 0, 0, false, false, true, 0]);
  addon.hover("__thumb");
  expect(addon.frame("__line").alpha, "lit under the mouse").toBe(1);
  addon.hover(null);
  expect(addon.frame("__line").alpha, "the rest alpha off it").toBe(0.5);
  const drag = addon.eval(`local t = __thumb
    t.__scripts.OnMouseDown(t, "LeftButton")
    local held = __line:GetAlpha()
    t.__scripts.OnLeave(t)
    local off = __line:GetAlpha()
    t.__scripts.OnMouseUp(t, "LeftButton")
    return { held, off, __line:GetAlpha() }`);
  expect(drag, "lit while held, even with the mouse off the thumb; the rest alpha when let go").toEqual([1, 1, 0.5]);
  expect(addon.eval("local f = CreateFrame('Frame', nil, UIParent) f.Back = CreateFrame('Button', nil, f) ns.Theme.ScrollBar(f) return { f.Back:GetAlpha(), ns.FrameState('vgArrow')[f.Back] == nil }"), "a frame without a thumb is left alone").toEqual([1, true]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
