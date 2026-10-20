// chat-bubbles: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, isTok, loggedIn } from "./helpers.mjs";

const THEME_FONT = "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-Medium.ttf";
const OFF = { savedVariables: "VanguardDB.profiles = { Default = { modules = { ChatBubbles = false } } }" };
const TEXT_ONLY = { savedVariables: "VanguardDB.profiles = { Default = { ChatBubbles = { textOnly = true } } }" };

// What bubble i looks like: the alphas its nine art textures are at (as a set), whether a panel is drawn on
// it, how many soft shadow pieces and sheen lines (a BORDER line across the top, below the edge) it has,
// whether its text is the panel's String, and the text's font path and size and its colour (the text is
// found among the panel's regions, so a bubble without the String key reads the same way).
const bubbleLook = (addon, i) => addon.eval(`local panel = __wfgWorld.bubbles[${i}]:GetChildren()
  local art, painted, shadow, sheen, fs = {}, false, 0, 0, nil
  for _, r in ipairs({ panel:GetRegions() }) do
    if r.__texture == "TEST-ONLY-ART" then art[tostring(r:GetAlpha())] = true
    elseif r:GetObjectType() == "FontString" then fs = r
    elseif r:GetObjectType() == "Texture" and r:GetAlpha() ~= 0 then painted = true end
    if type(r.__texture) == "string" and r.__texture:find("Shadow$") then shadow = shadow + 1 end
    if r.__layer == "BORDER" and r.__points.TOPLEFT and r.__points.TOPRIGHT and r.__points.TOPLEFT.y ~= 0 then sheen = sheen + 1 end
  end
  return { art = art, panel = painted, shadow = shadow, sheen = sheen, keyed = panel.String == fs, font = (fs:GetFont()), size = select(2, fs:GetFont()), color = fs.__textColor }`);
// The theme's painted-part count.
const paintedCount = (addon) => addon.eval("return ns.Theme.PaintedCount()");

it("chat bubbles: a bubble's art fades and a flat panel sits behind its text in the theme font, a moment after the message", () => {
  const addon = loggedIn();
  const before = paintedCount(addon);
  addon.world.addChatBubble("TEST-ONLY hello");
  expect([bubbleLook(addon, 1).panel, addon.eval('return ns.GetModule("ChatBubbles").waiting')], "on the message itself nothing is drawn yet (the engine makes the bubble on a later frame); a look is pending").toEqual([false, true]);
  addon.update(0.1);
  const b = bubbleLook(addon, 1);
  expect([b.art, b.panel, b.font, b.size, isTok(addon, b.color, "text")], "then its art is at alpha 0 with a panel drawn, the text in the theme font at the chat size, light")
    .toEqual([{ 0: true }, true, THEME_FONT, 12, true]);
  expect([b.shadow, b.sheen], "the panel is the chat's flat material: no soft shadow, no sheen").toEqual([0, 0]);
  const one = paintedCount(addon);
  addon.world.addChatBubble("TEST-ONLY again");
  addon.world.addChatBubble("TEST-ONLY and again");
  addon.update(0.1);
  expect([bubbleLook(addon, 2).panel, bubbleLook(addon, 3).panel, paintedCount(addon)], "a burst of messages dresses each new bubble once and the first one not again").toEqual([true, true, one + 2 * (one - before)]);
  addon.fire("CHAT_MSG_SAY", "TEST-ONLY nothing new", "TEST-ONLY Speaker");
  addon.update(0.1);
  expect(paintedCount(addon), "a message with no new bubble paints nothing").toBe(one + 2 * (one - before));
  addon.world.addChatBubble("TEST-ONLY unkeyed", { unkeyed: true });
  addon.update(0.1);
  const u = bubbleLook(addon, 4);
  expect([u.keyed, u.panel, u.font], "a bubble whose text is not keyed String: the font string is found among the panel's regions and dressed the same").toEqual([false, true, THEME_FONT]);
  addon.world.addChatBubble("TEST-ONLY raid line", { event: "CHAT_MSG_RAID" });
  addon.world.addChatBubble("TEST-ONLY raid lead line", { event: "CHAT_MSG_RAID_LEADER" });
  addon.update(0.1);
  expect([bubbleLook(addon, 5).panel, bubbleLook(addon, 6).panel], "a raid line and a raid leader's line (the game's Raid Chat Bubbles option) raise bubbles that are dressed too").toEqual([true, true]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat bubbles: a forbidden bubble, a bubble inside an instance and one without a panel are left alone; leaving the instance dresses what is there", () => {
  const addon = loggedIn();
  addon.world.addChatBubble("TEST-ONLY instance text", { forbidden: true });
  addon.update(0.1);
  expect(bubbleLook(addon, 1), "a bubble addons may not touch keeps its art and gets no panel").toMatchObject({ art: { 1: true }, panel: false });
  addon.world.set("instance", true);
  addon.world.addChatBubble("TEST-ONLY in a dungeon");
  addon.update(0.1);
  expect(bubbleLook(addon, 2), "inside an instance the engine's bubbles are left as they are").toMatchObject({ art: { 1: true }, panel: false });
  addon.world.set("instance", false);
  addon.world.addChatBubble("TEST-ONLY outside", { empty: true });
  addon.update(0.1);
  expect([bubbleLook(addon, 2).panel, bubbleLook(addon, 1).panel], "back outside, the next message dresses the bubble made inside; the forbidden one stays the engine's").toEqual([true, false]);
  addon.world.addChatBubble("TEST-ONLY forbidden panel");
  addon.eval("__wfgWorld.bubbles[4]:GetChildren().IsForbidden = function() return true end");
  addon.update(0.1);
  expect(bubbleLook(addon, 4), "a bubble whose panel addons may not touch keeps its art and gets no panel").toMatchObject({ art: { 1: true }, panel: false });
  addon.eval("IsInInstance = function() return __wfgWorld.secret(1) end");
  addon.world.addChatBubble("TEST-ONLY hidden state");
  addon.update(0.1);
  expect(bubbleLook(addon, 5).panel, "when the client hides whether you are in an instance, bubbles are left alone").toBe(false);
  expect(addon.eval("return #ns.errors"), "no errors, the panel-less bubble included").toBe(0);
});

it("chat bubbles: Text-only bubbles on fades the art and draws no panel, the text alone in the theme font; still never inside an instance", () => {
  const addon = loggedIn("", TEXT_ONLY);
  const before = paintedCount(addon);
  addon.world.addChatBubble("TEST-ONLY floating");
  addon.update(0.1);
  const b = bubbleLook(addon, 1);
  expect([b.art, b.panel, b.shadow, b.sheen, b.font, b.size, isTok(addon, b.color, "text")], "art at alpha 0, nothing painted behind the text, the text in the theme font at the chat size, light")
    .toEqual([{ 0: true }, false, 0, 0, THEME_FONT, 12, true]);
  expect(paintedCount(addon), "no panel was painted at all").toBe(before);
  addon.world.set("instance", true);
  addon.world.addChatBubble("TEST-ONLY in a dungeon");
  addon.update(0.1);
  expect(bubbleLook(addon, 2), "inside an instance the engine's bubbles are left as they are").toMatchObject({ art: { 1: true }, panel: false, size: 13 });
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat bubbles: the module off leaves them the game's; a client without C_ChatBubbles or IsInInstance is fine", () => {
  const off = loggedIn("", OFF);
  off.world.addChatBubble("TEST-ONLY off");
  off.update(0.1);
  expect(bubbleLook(off, 1), "module off: art kept, no panel, the game's font").toMatchObject({ art: { 1: true }, panel: false, size: 13 });
  const bare = loggedIn("C_ChatBubbles = nil");
  bare.world.addChatBubble("TEST-ONLY no api");
  bare.update(0.1);
  expect([bubbleLook(bare, 1).panel, bare.eval("return #ns.errors")], "a client that cannot list its bubbles: nothing drawn, no error").toEqual([false, 0]);
  const open = loggedIn("IsInInstance = nil");
  open.world.addChatBubble("TEST-ONLY old client");
  open.update(0.1);
  expect([bubbleLook(open, 1).panel, open.eval("return #ns.errors")], "a client without IsInInstance still dresses its bubbles").toEqual([true, 0]);
});

it("chat bubbles: the Text-only switch applies on reload: ticking or unticking it asks for the reload that redresses the bubbles the engine reuses", () => {
  const addon = loggedIn(CLICK_LUA);
  const row = "Text-only bubbles: no panel behind the words over heads";
  addon.eval('ns.Options.Show("chat")');
  expect(addon.eval("return Vanguard_Options.reload:IsShown()"), "no reload asked for yet").toBe(false);
  expect(addon.eval(`return __click("${row}") and ns.GetModule("ChatBubbles").settings.textOnly`), "ticked and saved").toBe(true);
  expect(addon.eval("return Vanguard_Options.reload:IsShown()"), "the reload is offered").toBe(true);
  expect(addon.eval(`return __click("${row}") and ns.GetModule("ChatBubbles").settings.textOnly`), "unticked again").toBe(false);
});
