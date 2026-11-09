// banner: the welcome banner strip (Core/Banner.lua) on setup's steps (the welcome banner, then the AFK scenes) and on
// the What's new window, in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

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

// Clicks setup's Next button `times` times.
const next = (addon, times) => addon.eval(`for _ = 1, ${times} do Vanguard_Setup.next:GetScript('OnClick')(Vanguard_Setup.next, 'LeftButton') end`);

// Setup's step caption, the picture's file and whether the brand mark shows, after `times` clicks on Next.
const stepScene = (addon, times) => {
  next(addon, times);
  return addon.eval("local f = Vanguard_Setup return { f.caption:GetText(), f.banner.file, f.banner.mark:IsShown(), f:GetHeight() }");
};

it("banner: setup's first step shows the picture under the title, the window grows by it, and the next step keeps it at one height", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  const first = strip(addon, "Vanguard_Setup"), tall = addon.eval("return Vanguard_Setup:GetHeight()");
  expect([first.file, first.shown, first.art, first.crop], "the picture, whole (a 2:1 picture)").toEqual([FILE, true, first.width / 2, [0, 1, 0, 1]]);
  expect(addon.eval("local f = Vanguard_Setup return f.pages.profile.__points.TOPLEFT.rel == f.banner and f.pages.profile.__points.TOPLEFT.relPoint"), "the page hangs from the strip").toBe("BOTTOMLEFT");
  next(addon, 1);
  const second = strip(addon, "Vanguard_Setup");
  expect([second.file, second.shown, second.whole, addon.eval("return Vanguard_Setup:GetHeight()")], "the second step keeps the welcome banner and the window its height").toEqual([FILE, true, first.whole, tall]);
});

it("banner: setup's steps are a journey through the shipped paintings: the welcome banner, your faction's AFK scene, then the camp at night", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  const art = "Interface\\AddOns\\Vanguard\\Media\\Art\\", tall = addon.eval("return Vanguard_Setup:GetHeight()");
  expect(stepScene(addon, 2), "Look: the welcome banner with the crest and name").toEqual([expect.stringContaining("Look"), "banner-dusk", true, tall]);
  expect(stepScene(addon, 1), "Comfort: the Alliance tester's keep, with no mark over it").toEqual([expect.stringContaining("Comfort"), "afk-keep", false, tall]);
  expect(addon.eval("return Vanguard_Setup.banner.art.__texture"), "the picture's file is set").toBe(art + "afk-keep");
  expect(stepScene(addon, 3)[1], "Combat: still the faction's scene").toBe("afk-keep");
  expect(stepScene(addon, 1), "Move things: the camp at night").toEqual([expect.stringContaining("Move things"), "afk-camp", false, tall]);
  expect(stepScene(addon, 1)[1], "All set: the camp").toBe("afk-camp");
  addon.eval("Vanguard_Setup.back:GetScript('OnClick')(Vanguard_Setup.back, 'LeftButton')");
  expect(stepScene(addon, 0), "Back to Move things: the camp again").toEqual([expect.stringContaining("Move things"), "afk-camp", false, tall]);
  addon.eval("Vanguard_Setup:Hide() UnitFactionGroup = function() return 'Horde' end ns.Setup.Open()");
  expect(stepScene(addon, 3), "a Horde character's guided steps show the canyon").toEqual([expect.stringContaining("Comfort"), "afk-canyon", false, tall]);
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

// The What's new banner's brand mark: whether it shows, the crest's file and side, the name, its font and size, the shade's
// gradient and reach, the strip's width and the theme's spec.
const brandMark = (addon) => addon.eval(`local m, spec = Vanguard_WhatsNew.banner.mark, ns.Theme.BANNER_MARK
  local font, size = m.name:GetFont()
  local g = m.shade.__gradient or {}
  return { shown = m:IsShown(), crest = m.crest.__texture or false, side = m.crest:GetWidth(), name = m.name:GetText() or false,
    font = font == ns.Theme.FONTS.alliance, size = size, shade = g[1] or false, left = g[2] and g[2][4] or false, right = g[3] and g[3][4] or false,
    reach = m.shade:GetWidth(), width = Vanguard_WhatsNew.banner:GetWidth(), spec = spec }`);

it("banner: Vanguard's crest and name sit over the picture's open sky, sized to the picture, and hide with it", () => {
  const addon = loggedIn(NOTES);
  const whole = brandMark(addon), h = whole.width / 2;
  expect([whole.shown, whole.crest, whole.name, whole.font], "the crest's file, the addon's name in the heading font").toEqual([true, "Interface\\AddOns\\Vanguard\\Media\\Art\\banner-crest", "Vanguard", true]);
  expect([whole.side, whole.size, whole.reach], "a share of the picture's height, the shade across its reach").toEqual([Math.floor(h * whole.spec.crest), Math.floor(h * whole.spec.name), whole.width * whole.spec.reach]);
  expect([whole.shade, whole.left, whole.right], "a shade from the left fading to clear").toEqual(["HORIZONTAL", whole.spec.shade, 0]);
  addon.eval("ns.Banner.Room = function() return 100 end ns.WhatsNew.Open()");
  const cropped = brandMark(addon);
  expect([cropped.side, cropped.size], "a cropped picture has a smaller mark").toEqual([Math.floor(100 * whole.spec.crest), Math.floor(100 * whole.spec.name)]);
  addon.eval("ns.Banner.Room = function() return 10 end ns.WhatsNew.Open()");
  expect(brandMark(addon).shown, "no picture, no mark").toBe(false);
});
