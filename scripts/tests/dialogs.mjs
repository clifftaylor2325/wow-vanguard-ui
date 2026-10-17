// Shared checks for the Core dialogs and wizards (Core/Dialog.lua and the windows built on it, the feedback form and
// the mover popover): what a window's chrome looks like to the player, read from the TEST-ONLY headless client.
// Not a test file itself; the area tests that open these windows import it.

import { isTok } from "./helpers.mjs";

// The size of the title role, the same for every window title.
export const titleSize = (addon) => addon.eval("return ns.Theme.RoleSize('title')");

// A window's title as the player sees it, from its frame's global name: the title's size (a text role's), whether it
// is in the text colour, how far in from the frame's left it starts and how far down from its top its middle is.
export function titleOf(addon, name) {
  const t = addon.frame(`${name}.title`);
  const at = addon.eval(`local f, t = ${name}, ${name}.title
    return { t:GetLeft() - f:GetLeft(), (t:GetTop() + t:GetBottom()) / 2 - f:GetTop() }`);
  return { size: t.font.size, text: isTok(addon, t.textColor, "text"), left: at[0], mid: at[1] };
}

// The X on a window (the field the frame keeps it in, the chrome's by default): how far in from the frame's
// top-right corner its middle (or, on a card, its corner) sits, across and down, and whether it is shown.
export const closeOf = (addon, name, field = "chrome.close") => addon.eval(`local f, c = ${name}, ${name}.${field}
  local p = c.__points.CENTER or c.__points.TOPRIGHT
  return { p.rel == f and -p.x, -p.y, c:IsShown() }`);

// The fill alpha of a window's panel: its white background texture, anchored to both corners.
export const alphaOf = (addon, name) => addon.eval(`for _, r in ipairs({ ${name}:GetRegions() }) do
  if r.__layer == "BACKGROUND" and r.__texture == ns.Theme.WHITE and r.__points.BOTTOMRIGHT then return r.__vertexColor[4] end end`);

// Whether a frame's name is on the game's list of windows that Escape closes.
export const escapes = (addon, name) => addon.eval(`for _, n in ipairs(UISpecialFrames) do if n == "${name}" then return true end end return false`);

// Presses Escape as the game does: every window on that list that is shown hides.
export const pressEscape = (addon) => addon.eval("for _, n in ipairs(UISpecialFrames) do local f = _G[n] if f and f:IsShown() then f:Hide() end end");

// How far a widget sits inside a frame, on each side as [left, top, right, bottom] (positive inwards).
export const insets = (addon, widget, frame) => addon.eval(`local w, f = ${widget}, ${frame}
  return { w:GetLeft() - f:GetLeft(), f:GetTop() - w:GetTop(), f:GetRight() - w:GetRight(), w:GetBottom() - f:GetBottom() }`);

// A scroll view's thumb (view: a Lua expression for it, frame: the window it is in): whether the thumb and its grip
// show, and how far its right edge is in from the window's right edge (false while hidden).
export const thumbOf = (addon, view, frame) => addon.eval(`local v, f = ${view}, ${frame}
  return { v.thumb:IsShown(), v.grip:IsShown(), v.thumb:IsShown() and f:GetRight() - v.thumb:GetRight() }`);

// A button's look: whether it has the accent fill, its label, its height and its width.
export const buttonOf = (addon, lua) => addon.eval(`local b = ${lua} return { b.fill ~= nil, b.text:GetText(), b:GetHeight(), b:GetWidth() }`);
