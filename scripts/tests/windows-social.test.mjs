// windows-social: the social group of game windows (Modules/WindowsSocial.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

// The social group's switch turned off in the saved variables.
const OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" };

// Whether the addon recorded an error from the Windows module (none: "none").
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'");

it("the social group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.social"), "its switch is on by default").toBe(true);
  expect(windowErrors(addon)).toBe("none");
});

// Open mail ---------------------------------------------------------------------------------------

// A letter window the way the game builds it: stationery, a SimpleHTML-like body, push and item buttons.
const MAIL_ENV = WINDOWS_ENV + `
  __window("OpenMailFrame")
  OpenMailFrame.ReportSpamButton = CreateFrame("Button", "OpenMailReportSpamButton", OpenMailFrame)
  for _, n in ipairs({ "Reply", "Delete", "Cancel" }) do CreateFrame("Button", "OpenMail" .. n .. "Button", OpenMailFrame) end
  OpenStationeryBackgroundLeft = OpenMailFrame:CreateTexture() OpenStationeryBackgroundRight = OpenMailFrame:CreateTexture()
  OpenMailBodyText = { __colors = {}, SetTextColor = function(self, tag, r, g, b) self.__colors[tag] = { r, g, b } end }
  for _, n in ipairs({ "OpenMailLetterButton", "OpenMailMoneyButton", "OpenMailAttachmentButton1" }) do
    local b = CreateFrame("Button", n, OpenMailFrame) b.icon = b:CreateTexture() b.IconBorder = b:CreateTexture()
  end
  __updates = 0
  function OpenMailFrame:Update() __updates = __updates + 1 OpenStationeryBackgroundLeft:SetAlpha(1) OpenMailBodyText.__colors = {} end
`;

it("open mail: the letter window in the theme, its stationery faded, body text light, buttons and items dressed", () => {
  const addon = loggedIn(MAIL_ENV);
  addon.eval("OpenMailFrame:Show()");
  expect(windowState(addon, "OpenMailFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(addon.eval("return { OpenStationeryBackgroundLeft.__alpha, OpenStationeryBackgroundRight.__alpha }"), "the parchment faded").toEqual([0, 0]);
  expect(addon.eval(`local c = OpenMailBodyText.__colors
    return { c.P ~= nil and c.P[1] == ns.Theme.RGB("text"), c.H1 ~= nil and c.H1[1] == ns.Theme.RGB("gold") }`), "body light, headings gold").toEqual([true, true]);
  expect(addon.eval(`local n = 0 for _, name in ipairs({ "OpenMailReplyButton", "OpenMailReportSpamButton" }) do
      if select('#', _G[name]:GetRegions()) > 0 then n = n + 1 end end return n`), "its buttons themed").toBe(2);
  expect(addon.eval("return { OpenMailLetterButton.vgSkinned, OpenMailMoneyButton.vgSkinned, OpenMailAttachmentButton1.vgSkinned }"), "the item buttons get the bags' border").toEqual([true, true, true]);
});

it("open mail: a redraw puts the look back, a second show paints nothing more, the switch off leaves the game's", () => {
  const addon = loggedIn(MAIL_ENV);
  addon.eval("OpenMailFrame:Show()");
  const painted = windowState(addon, "OpenMailFrame").painted;
  addon.eval("OpenMailFrame:Update()");
  expect(addon.eval("return { __updates, OpenStationeryBackgroundLeft.__alpha, OpenMailBodyText.__colors.P ~= nil }"), "after Update: faded and light again").toEqual([1, 0, true]);
  addon.eval("OpenMailFrame:Hide() OpenMailFrame:Show() OpenMailFrame:Update()");
  expect(windowState(addon, "OpenMailFrame").painted, "painting again piles up nothing").toBe(painted);
  expect(addon.eval("OpenMailFrame:Update() return __updates"), "the hook went on once, the game's call still runs").toBe(3);
  const off = loggedIn(MAIL_ENV, OFF);
  off.eval("OpenMailFrame:Show()");
  expect([windowState(off, "OpenMailFrame").art !== 0, off.eval("return OpenMailFrame.vgWindow == nil and OpenStationeryBackgroundLeft.__alpha ~= 0")], "with the group off").toEqual([true, true]);
});

it("open mail: a client without the body text, the stationery, the items or the Update method loads cleanly", () => {
  const addon = loggedIn(WINDOWS_ENV + `__window("OpenMailFrame")`);
  addon.eval("OpenMailFrame:Show()");
  expect(windowState(addon, "OpenMailFrame").panel).toBe(true);
  const odd = loggedIn(WINDOWS_ENV + `__window("OpenMailFrame") OpenMailBodyText = {} OpenMailLetterButton = {}`);
  odd.eval("OpenMailFrame:Show()");
  expect([windowErrors(addon), windowErrors(odd), addon.eval("return #ns.errors")], "no errors").toEqual(["none", "none", 0]);
});
