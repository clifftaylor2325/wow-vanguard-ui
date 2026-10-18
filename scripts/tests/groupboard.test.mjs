// groupboard: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/GroupBoard.lua and GroupBoardView.lua: looking-for-more and looking-for-group posts from
// chat on one board by dungeon, role and level; a click opens a whisper that the player sends.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";
import { alphaOf, closeOf, escapes, insets, pressEscape, titleOf } from "./dialogs.mjs";

// TEST-ONLY whisper calls, recorded: the game's whisper-with-message call and the plain one.
const WHISPER_ENV = `
  __tells = {}
  ChatFrameUtil = {
    SendTellWithMessage = function(name, text) table.insert(__tells, name .. " | " .. text) end,
    SendTell = function(name) table.insert(__tells, name) end,
  }
`;

// A logged-in addon at level `level` (a level 24 mage by default), with the whisper calls recorded.
function board(level = 24) {
  const addon = loggedIn(WHISPER_ENV + CLICK_LUA);
  addon.eval(`__wfgWorld.units.player.level = ${level}`);
  return addon;
}

// A chat line as the client sends it: the event, then text and sender.
const post = (addon, text, sender, event = "CHANNEL") => addon.fire(`CHAT_MSG_${event}`, text, sender, "Common", "4. LookingForGroup", "", "", 4, 4, "LookingForGroup", 7, 1, "g");

// What GB.Parse makes of a line: [kind, dungeon name, roles], or null.
const parse = (addon, text) => addon.eval(`local e = ns.GetModule("GroupBoard").Parse(${JSON.stringify(text)})
  if not e then return nil end
  return { e.kind, e.dungeon and e.dungeon.name or "none", table.concat(e.roles, ",") }`);

// The board's visible rows: [kind, dungeon, roles, sender, age] each.
const rows = (addon) => addon.eval(`local f, out = Vanguard_GroupBoard, {}
  for i = 1, f.rows.used do local b = f.rows[i] out[i] = { b.kind:GetText(), b.dungeon:GetText(), b.roles:GetText(), b.sender:GetText(), b.age:GetText() } end
  return out`);

// The board's count and the line under its rows.
const status = (addon) => addon.eval("return { Vanguard_GroupBoard.count:GetText(), Vanguard_GroupBoard.note:GetText() }");

it("group board: lines are read as looking for more or for a group, with the dungeon and roles", () => {
  const addon = board();
  expect(parse(addon, "LFM SFK need heals and a tank"), "LFM, a short name, two roles").toEqual(["LFM", "Shadowfang Keep", "tank,healer"]);
  expect(parse(addon, "lvl 24 rogue LFG BFD"), "LFG").toEqual(["LFG", "Blackfathom Deeps", ""]);
  expect(parse(addon, "LF1M dps DM east tribute"), "Dire Maul's short names before the Deadmines' dm").toEqual(["LFM", "Dire Maul", "dps"]);
  expect(parse(addon, "LF2M DM, need dps"), "plain dm is the Deadmines").toEqual(["LFM", "The Deadmines", "dps"]);
  expect(parse(addon, "LFG anything, healer"), "no dungeon named").toEqual(["LFG", "none", "healer"]);
  expect(parse(addon, "lfg or lfm? |cff1eff00|Hitem:1::::::::|h[Zul'Farrak Key]|h|r"), "LFM wins; a link's name is read as words").toEqual(["LFM", "Zul'Farrak", ""]);
  expect(parse(addon, "WTS Devilsaur Leggings"), "neither").toBe(null);
  expect(parse(addon, "1st stop sfk? no"), "a short name only as a whole word, and no kind: not a post").toBe(null);
});

it("group board: the board lists each sender's latest post, newest first, with its age", () => {
  const addon = board();
  post(addon, "LFM SFK need heals", "Lightmend-Ruleset");
  addon.advance(70);
  post(addon, "LFG WC dps", "Rogue");
  post(addon, "LF2M BRD tank", "Brd", "YELL");
  addon.slash("lfg");
  expect(addon.eval("return Vanguard_GroupBoard:IsShown()"), "/vg lfg opens it").toBe(true);
  expect(rows(addon), "newest first, BRD left out (off your level); names without their realm part; ages").toEqual([
    ["LFG", "Wailing Caverns 17-24", "DPS", "Rogue", "now"],
    ["LFM", "Shadowfang Keep 22-30", "Healer", "Lightmend", "1m"],
  ]);
  expect(status(addon), "BRD is off your level: two posts, no note").toEqual(["2 posts", ""]);
  post(addon, "LFM SFK need a tank now", "Lightmend-Ruleset");
  addon.update(0);
  expect(rows(addon)[0], "the sender's new post replaces the old one, on top").toEqual(["LFM", "Shadowfang Keep 22-30", "Tank", "Lightmend", "now"]);
  expect(addon.eval("return #ns.GetModule('GroupBoard').entries"), "three senders").toBe(3);
});

it("group board: hidden chat, your own lines and channels you don't read are skipped", () => {
  const addon = board();
  addon.eval('__wfgStub.fire("CHAT_MSG_CHANNEL", __wfgWorld.secret(), "Hidden")');
  addon.eval('__wfgStub.fire("CHAT_MSG_CHANNEL", "LFM SFK", __wfgWorld.secret())');
  post(addon, "LFM SFK", "Tester");
  post(addon, "LFM SFK", "Tester-Ruleset");
  post(addon, "LFM SFK", "Saying", "SAY");
  post(addon, "LFM SFK", "Guildie", "GUILD");
  addon.eval("__wfgWorld.units.player.name = __wfgWorld.secret()");
  post(addon, "LFM SFK", "Tester");
  expect(addon.eval("local out = {} for _, e in ipairs(ns.GetModule('GroupBoard').entries) do out[#out + 1] = e.sender end return out"), "only the line whose sender may be someone else").toEqual(["Tester"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("group board: a click opens a whisper with the message filled in, never sends it", () => {
  const addon = board();
  post(addon, "LFM SFK need heals", "Lightmend-Ruleset");
  post(addon, "LFG SFK", "Seeker");
  post(addon, "LFM need dps", "Anyone");
  addon.slash("lfg");
  addon.eval('ns.Settings("GroupBoard").role = "healer"');
  for (const i of [3, 2, 1]) addon.eval(`local b = Vanguard_GroupBoard.rows[${i}] b.__scripts.OnClick(b, "LeftButton")`);
  expect(addon.eval("return __tells"), "LFM: you and your role; LFG: an invitation; no dungeon: your group").toEqual([
    "Lightmend-Ruleset | Hi! Level 24 Mage (Healer) for Shadowfang Keep, if you still need one.",
    "Seeker | Hi! We're forming Shadowfang Keep, want to join?",
    "Anyone | Hi! Level 24 Mage (Healer) for your group, if you still need one.",
  ]);
  addon.eval('__tells = {} ns.Settings("GroupBoard").role = "TEST-ONLY" __wfgWorld.units.player.level = __wfgWorld.secret()');
  addon.eval("UnitClass = function() return __wfgWorld.secret() end");
  addon.eval("local GB = ns.GetModule('GroupBoard') __tells[1] = GB.Template(GB.entries[3]) __tells[2] = GB.Template({ kind = 'LFG', roles = {} })");
  expect(addon.eval("return __tells"), "nothing plain to say about you; an unknown role says DPS; no dungeon: a group").toEqual([
    "Hi! A player (DPS) for Shadowfang Keep, if you still need one.", "Hi! We're forming a group, want to join?"]);
  addon.eval("ChatFrameUtil.SendTellWithMessage = nil local b = Vanguard_GroupBoard.rows[1] b.__scripts.OnClick(b, 'LeftButton')");
  expect(addon.eval("return __tells[3]"), "without the call: a plain whisper to them").toBe("Anyone");
});

it("group board: the filter, the level switch, the note, more posts than rows, and old posts going", () => {
  const addon = board(60);
  addon.slash("lfg");
  expect(status(addon), "empty").toEqual(["0 posts", "No posts yet. No chat lines reached the board since login. More: /vg lfg probe."]);
  post(addon, "LFM SFK heals", "Low");
  addon.update(0);
  expect(status(addon), "a post below your level hides").toEqual(["0 posts", "No posts match. Show all posts, or turn off Only dungeons for my level."]);
  addon.eval('__click("Only dungeons for my level")');
  expect(rows(addon).length, "the switch off shows it").toBe(1);
  for (let i = 1; i <= 12; i++) post(addon, `LFG MC ${i}`, `Raider${i}`);
  addon.update(0);
  expect([rows(addon).length, status(addon)], "ten rows and the rest counted; a raid shows one level").toEqual([10, ["13 posts", "+3 more"]]);
  expect(rows(addon)[0][1], "a raid's single level").toBe("Molten Core 60");
  addon.eval('__click("All posts")');
  expect([addon.eval("return Vanguard_GroupBoard.filter.text:GetText()"), status(addon)[0]], "looking for more only").toEqual(["Looking for more", "1 posts"]);
  addon.eval('__click("Looking for more")');
  expect(status(addon)[0], "looking for a group only").toBe("12 posts");
  addon.eval('__click("Looking for a group")');
  expect(status(addon)[0], "all again").toBe("13 posts");
  addon.advance(601);
  expect(status(addon)[0], "after ten minutes the posts are gone (the board's tick)").toBe("0 posts");
  addon.eval("local GB = ns.GetModule('GroupBoard') GB.MAX = 2 for i = 1, 3 do GB.Add({ kind = 'LFG', roles = {}, sender = 'S' .. i, time = GetTime(), text = '' }) end");
  expect(addon.eval("return #ns.GetModule('GroupBoard').entries"), "at most GB.MAX posts").toBe(2);
});

it("group board: the tooltip, closing, the module off, and its options card", () => {
  const addon = board();
  post(addon, "LFM SFK need heals", "Lightmend-Ruleset");
  addon.slash("lfg");
  addon.eval("local b = Vanguard_GroupBoard.rows[1] b.__scripts.OnEnter(b)");
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "the full name, the whole line, what a click does").toEqual([
    "Lightmend-Ruleset", "LFM SFK need heals", addon.eval('return ns.Theme.Paint("Click: whisper with a message filled in", "text2")')]);
  addon.eval("local b = Vanguard_GroupBoard.rows[1] b.__scripts.OnLeave(b) b.entry = nil b.__scripts.OnEnter(b)");
  expect(addon.eval("return GameTooltip:IsShown()"), "hidden on leave; no post, no tooltip").toBe(false);
  addon.eval("local c = Vanguard_GroupBoard.close c.__scripts.OnClick(c)");
  expect(addon.eval("return Vanguard_GroupBoard:IsShown()"), "the close button").toBe(false);
  addon.eval('ns.Options.Show("chat") __click("Open the group board")');
  expect(addon.eval("return Vanguard_GroupBoard:IsShown()"), "the options button opens it").toBe(true);
  addon.slash("lfg");
  post(addon, "LFG WC", "Later");
  expect(addon.eval("return Vanguard_GroupBoard.rows.used"), "a post while it's closed waits for the next open").toBe(1);
  const off = loggedIn(WHISPER_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { GroupBoard = false } } }" });
  off.clearChat();
  off.slash("lfg");
  expect(chatHas(off, /The group board is off \(\/vg > Modules\)\./), "module off: says so").toBe(true);
});

it("group board: the empty board and /vg lfg probe say what chat was heard and why lines were skipped", () => {
  const addon = board();
  addon.eval("GetChannelList = function() return 1, 'General', false, 2, 'Trade', false end");
  post(addon, "WTS Devilsaur Leggings", "Seller");
  post(addon, "LFM SFK", "Said", "SAY");
  post(addon, "LFM SFK", "Mage");
  post(addon, "LFM SFK", "Tester");
  addon.eval("GetChannelList = nil");
  addon.slash("lfg");
  expect(status(addon)).toEqual(["1 posts", ""]);
  addon.eval("local f = Vanguard_GroupBoard f:Hide() ns.GetModule('GroupBoard').entries = {} ns.GetModule('GroupBoard').Refresh()");
  expect(status(addon)[1]).toBe("No posts yet. 4 chat lines since login: 1 posts, 1 other, 0 hidden by the game, 1 from channels that are off, 1 yours. More: /vg lfg probe.");
  addon.slash("lfg probe");
  expect(chatHas(addon, /Group board: 4 chat lines since login/), "the summary").toBe(true);
  expect(chatHas(addon, /You are in channels: unknown/), "no channel list on this client").toBe(true);
  addon.eval("GetChannelList = function() return 1, 'General', false, 2, 'Trade', false end");
  addon.slash("lfg probe");
  expect(chatHas(addon, /1 General, 2 Trade/), "the channels").toBe(true);
  expect(chatHas(addon, /Posts kept: 0/), "kept and shown").toBe(true);
});

it("group board: a Trade line naming a dungeon the list lacks still shows as 'Any dungeon' under the level filter", () => {
  const addon = board();
  post(addon, "LFG HoT - Can tank or DPS", "Bon Figgy-Ruleset");
  post(addon, "LFW \u2014 your mats + tip", "Crafty-Ruleset");
  addon.slash("lfg");
  expect(rows(addon), "the LFG line is a post with no dungeon, the LFW line is not a post").toEqual([["LFG", "Any dungeon", "Tank, DPS", "Bon Figgy", "now"]]);
  addon.slash("lfg probe");
  expect(chatHas(addon, /Last line that was not a post: LFW/), "the probe quotes the last miss").toBe(true);
});

// The theme numbers the board is laid out with: pad, gap, row height, button height, dialog alpha, the close
// button's inset, and the title and small role sizes.
const tokens = (addon) => addon.eval(`local T = ns.Theme
  return { T.SPACE.pad, T.SPACE.gap, T.ROW.height, T.BUTTON_H, T.ALPHA.dialog, T.CONTROL.inset, T.RoleSize("title"), T.RoleSize("small") }`);

// A W.Row's look, from a Lua expression for it: its height, its hover wash (the vertex colour of its T.Row hover layer), and whether the selected look is there and hidden.
const rowLook = (addon, row) => addon.eval(`local r = ${row}
  local hover = ns.Theme.RowParts(r).hover.__vertexColor
  return { r:GetHeight(), hover, r.rail ~= nil and r.wash ~= nil, r.rail:IsShown() or r.wash:IsShown() }`);

it("group board: a window title with its count and X, a dialog's opacity, T.SPACE.pad in from every edge, Escape closes it", () => {
  const addon = board();
  post(addon, "LFM SFK need heals", "Lightmend-Ruleset");
  addon.slash("lfg");
  const [pad, , , , dialog, inset, titleSize, smallSize] = tokens(addon);
  expect(titleOf(addon, "Vanguard_GroupBoard"), "the title role in text, T.SPACE.pad in, on the X's line").toEqual({ size: titleSize, text: true, left: pad, mid: -inset });
  const count = addon.frame("Vanguard_GroupBoard.count");
  expect([count.text, count.font.size, isTok(addon, count.textColor, "text2")], "the count beside it, small text2").toEqual(["1 posts", smallSize, true]);
  const px = addon.eval("return ns.Theme.PixelRound(Vanguard_GroupBoard, ns.Theme.CONTROL.inset)");
  expect(closeOf(addon, "Vanguard_GroupBoard", "close"), "the X where every window has it").toEqual([px, px, true]);
  expect(alphaOf(addon, "Vanguard_GroupBoard"), "T.ALPHA.dialog (it was 0.97)").toBe(dialog);
  const [filter, body, hint] = ["filter", "body", "hint"].map((part) => insets(addon, `Vanguard_GroupBoard.${part}`, "Vanguard_GroupBoard"));
  expect([filter[0], body[0], body[2], hint[0], hint[3]], "buttons, rows and hint all T.SPACE.pad in from the edges").toEqual([pad, pad, pad, pad, pad]);
  expect(escapes(addon, "Vanguard_GroupBoard"), "Escape is wired").toBe(true);
  pressEscape(addon);
  expect(addon.eval("return Vanguard_GroupBoard:IsShown()"), "and closes it").toBe(false);
});

it("group board: the rows are W.Rows T.ROW.height tall, the buttons T.BUTTON_H, and the hint is a note while the line under the rows is a status", () => {
  const addon = board();
  post(addon, "LFM SFK need heals", "Lightmend-Ruleset");
  addon.slash("lfg");
  const [pad, gap, rowH, buttonH, , , , smallSize] = tokens(addon);
  const look = rowLook(addon, "Vanguard_GroupBoard.rows[1]");
  expect([look[0], isTok(addon, look[1], "hover"), look[2], look[3]], "T.ROW.height, the hover wash, the selected look made and hidden").toEqual([rowH, true, true, false]);
  addon.eval("Vanguard_GroupBoard.rows[1]:SetSelected(true)");
  expect(rowLook(addon, "Vanguard_GroupBoard.rows[1]")[3], "W.Row's own selected look").toBe(true);
  const [row, panel, body] = ["rows[1]", "", "body"].map((part) => addon.frame(`Vanguard_GroupBoard${part && "."}${part}`).rect);
  expect(panel.width - row.width, "a row runs the board's width less the padding on both sides").toBe(2 * pad);
  expect(addon.eval("return Vanguard_GroupBoard.filter:GetHeight()"), "the filter button is T.BUTTON_H").toBe(buttonH);
  expect(addon.eval("return Vanguard_GroupBoard.mine:GetLeft() - Vanguard_GroupBoard.filter:GetRight()"), "T.SPACE.gap between the controls").toBe(gap);
  const [hint, note] = ["hint", "note"].map((part) => addon.frame(`Vanguard_GroupBoard.${part}`));
  expect([hint.font.size, isTok(addon, hint.textColor, "muted"), note.font.size, isTok(addon, note.textColor, "text2")], "the hint small muted, the note small text2").toEqual([smallSize, true, smallSize, true]);
  expect(hint.rect.top < body.bottom, "the hint sits under the rows").toBe(true);
});

it("group board: the note's two lines and the hint's line fit the board's height, a gap between them and a tight gap under the rows", () => {
  const addon = board();
  addon.slash("lfg");
  const [, gap, , , , , , smallSize] = tokens(addon);
  const tight = addon.eval("return ns.Theme.SPACE.tight");
  // The harness measures a line at 14; the game's small text is two units taller than its size, and the board reserves
  // two lines for the note (an empty board says why, in two lines at most) and one for the hint.
  const [note, hint] = ["note", "hint"].map((part) => addon.frame(`Vanguard_GroupBoard.${part}`).id);
  addon.eval(`__wfgStub.stringHeights = { [${note}] = ${2 * (smallSize + 2)}, [${hint}] = ${smallSize + 2} } __wfgStub.layoutGen = __wfgStub.layoutGen + 1`);
  const [n, h, body] = ["note", "hint", "body"].map((part) => addon.frame(`Vanguard_GroupBoard.${part}`).rect);
  expect([body.bottom - n.top, n.bottom - h.top], "the note a tight gap under the rows; a gap between its second line and the hint, so the board is tall enough").toEqual([tight, gap]);
  addon.eval("__wfgStub.stringHeights = nil");
});
