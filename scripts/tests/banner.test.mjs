// banner: the welcome banner strip (Core/Banner.lua) on setup's first step and on the What's new window, in the
// TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

const FILE = "Interface\\AddOns\\Vanguard\\Media\\Art\\banner-dusk";

// The notes a What's new window needs: one group, one line, for a made-up running version.
const NOTES = `ns.WHATS_NEW = { { version = "9.9.9", groups = { { label = "TEST-ONLY", items = { { text = "TEST-ONLY line" } } } } } }
__wfgWorld.addons.Vanguard.Version = "9.9.9"
`;

// The banner strip of a window: its picture's file, whether it shows, the picture's height, the strip's, and the crop.
const strip = (addon, name) => addon.eval(`local s = ${name}.banner
  return { file = s.art.__texture or false, shown = s.art:IsShown(), art = s.art:GetHeight(), whole = s:GetHeight(), crop = s.art.__texCoord or false, width = s:GetWidth() }`);

it("banner: the height is the whole picture when the room allows, as much as the room allows, or none under the least worth showing", () => {
  const addon = loggedIn();
  expect(addon.eval("local B = ns.Banner return { B.Height(400, 900), B.Height(400, 150), B.Height(400, 80), B.Height(400, 79) }"), "200 whole, 150 cropped, 80 the least, 79 none").toEqual([200, 150, 80, 0]);
});

it("banner: setup's first step shows the picture under the title, the window grows by it, and the next step has none", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  const first = strip(addon, "Vanguard_Setup"), tall = addon.eval("return Vanguard_Setup:GetHeight()");
  expect([first.file, first.shown, first.art, first.crop], "the picture, whole (a 2:1 picture)").toEqual([FILE, true, first.width / 2, [0, 1, 0, 1]]);
  expect(addon.eval("local f = Vanguard_Setup return f.pages.profile.__points.TOPLEFT.rel == f.banner and f.pages.profile.__points.TOPLEFT.relPoint"), "the page hangs from the strip").toBe("BOTTOMLEFT");
  addon.eval("Vanguard_Setup.next:GetScript('OnClick')(Vanguard_Setup.next, 'LeftButton')");
  const next = strip(addon, "Vanguard_Setup");
  expect([next.shown, next.whole < 1, Math.round(tall - addon.eval("return Vanguard_Setup:GetHeight()"))], "the second step hides it and the window gives its height back").toEqual([false, true, Math.round(first.whole)]);
});

it("banner: a screen with no room for it leaves the strip out and never loads the picture", () => {
  const addon = loggedIn("__wfgStub.setScreen(1280, 400) UIParent:SetSize(1280, 400) UISpecialFrames = {}", { firstRun: true });
  const none = strip(addon, "Vanguard_Setup");
  expect([none.file, none.shown, none.whole < 1], "no file set, hidden, no height").toEqual([false, false, true]);
});

it("banner: What's new shows it under its hint, crops it to the room there is, and sets the file once", () => {
  const addon = loggedIn(NOTES);
  const whole = strip(addon, "Vanguard_WhatsNew"), gap = addon.eval("return ns.Theme.SPACE.col");
  expect([whole.file, whole.shown, whole.art, whole.whole, addon.eval("return Vanguard_WhatsNew:GetHeight()")], "the whole picture and the gap, the list below it").toEqual([FILE, true, whole.width / 2, whole.width / 2 + gap, 392 + whole.width / 2 + gap]);
  addon.eval("ns.Banner.Room = function() return 120 end ns.WhatsNew.Open()");
  const cropped = strip(addon, "Vanguard_WhatsNew"), kept = 120 / (cropped.width / 2);
  expect([cropped.art, cropped.crop.map((v) => +v.toFixed(3))], "120 units of the whole: the middle of the picture").toEqual([120, [0, 1, +((1 - kept) / 2).toFixed(3), +((1 + kept) / 2).toFixed(3)]]);
  expect(addon.eval("return Vanguard_WhatsNew.banner.loaded"), "loaded once").toBe(true);
});
