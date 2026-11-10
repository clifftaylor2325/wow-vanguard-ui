// raidroster: the raid roster panel of the raid tools (Modules/RaidRoster.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { isTok, loggedIn } from "./helpers.mjs";

// Types a /vg command and returns the chat lines it printed, joined.
const say = (addon, cmd) => { addon.chat(); addon.slash(cmd); return Array.from(addon.chat()).join("\n"); };
// Presses the button with this label on the roster card (the Raid frames page).
const press = (addon, label) => addon.eval(`for _, r in ipairs(ns.GetModule("RaidTools").RosterRows()) do if r[2] == ${JSON.stringify(label)} then r[3]() end end`);

// The roster panel: whether it is shown, and each line as [left, right].
const roster = (addon) => addon.eval(`local f, out = Vanguard_RaidRoster, {}
  for i, row in ipairs(f.rows) do if row.left:IsShown() then out[#out + 1] = { row.left:GetText(), row.right:GetText() } end end
  return { f:IsShown(), out }`);

it("the roster lists the raid by role then name, with leader marks, offline and dead, and follows changes", () => {
  const addon = loggedIn("RAID_CLASS_COLORS.WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }");
  // Makes or changes a raid member.
  const set = (t, f) => addon.world.setUnit(t, { isPlayer: true, ...f });
  set("raid1", { name: "Zed", class: "WARRIOR", className: "Warrior", role: "TANK", leader: true });
  set("raid2", { name: "Amy", class: "PRIEST", className: "Priest", role: "HEALER", assistant: true });
  set("raid3", { name: "Bob", class: "MAGE", className: "Mage", role: "DAMAGER", connected: false });
  set("raid4", { name: "Cat", class: "MAGE", className: "Mage", role: "DAMAGER", dead: true });
  set("raid5", { name: "Dan", class: "MAGE", className: "Mage" });
  say(addon, "loot roster");
  expect(roster(addon)).toEqual([true, [
    ["Roster 5", "1 offline"], ["Zed", "Tank Lead"], ["Amy", "Healer Asst"], ["Bob", "DPS Offline"], ["Cat", "DPS Dead"], ["Dan", ""],
  ]]);
  expect(addon.eval("return Vanguard_RaidRoster.rows[2].left.__textColor[1]"), "class color").toBeCloseTo(0.78);
  expect(isTok(addon, addon.eval("return Vanguard_RaidRoster.rows[4].left.__textColor"), "muted"), "an offline name is muted, not disabled").toBe(true);
  addon.world.setUnit("raid3", { connected: true });
  addon.advance(0.5);
  expect(roster(addon)[1][3], "an event repaints it on the next frame").toEqual(["Bob", "DPS"]);
  say(addon, "loot roster");
  expect(roster(addon)[0], "toggles off").toBe(false);
  press(addon, "Show or hide the roster");
  expect(roster(addon)[0]).toBe(true);
  press(addon, "Show or hide the roster");
  expect(roster(addon)[0], "the button toggles it off again").toBe(false);
});

it("the roster handles a solo player, a party and a hidden name", () => {
  const addon = loggedIn("");
  say(addon, "loot roster");
  expect(roster(addon)[1].map((x) => x[0]), "alone: just you").toEqual(["Roster 1", "Tester"]);
  addon.world.setUnit("party1", { name: "Pal", class: "MAGE", className: "Mage", isPlayer: true });
  addon.fire("GROUP_ROSTER_UPDATE");
  addon.advance(0.5);
  expect(roster(addon)[1].map((x) => x[0]), "party").toEqual(["Roster 2", "Tester", "Pal"]);
  addon.eval('__wfgWorld.units.party1.name = __wfgWorld.secret("Pal")');
  addon.fire("GROUP_ROSTER_UPDATE");
  addon.advance(0.5);
  expect(roster(addon)[1].map((x) => x[0]), "a hidden name is left out").toEqual(["Roster 1", "Tester"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("Y1-2 the open roster is drawn once a frame, and only for you and group members' unit events", () => {
  const addon = loggedIn("");
  addon.world.setUnit("party1", { name: "Pal", class: "MAGE", className: "Mage", isPlayer: true });
  say(addon, "loot roster");
  addon.advance(0.5);
  addon.eval(`__paints = 0 local RT = ns.GetModule("RaidTools") local draw = RT.DrawRows
    RT.DrawRows = function(...) __paints = __paints + 1 return draw(...) end`);
  for (let i = 1; i <= 30; i++) addon.fire("UNIT_FLAGS", `nameplate${i}`);
  addon.fire("UNIT_FLAGS");
  addon.advance(0.5);
  expect(addon.eval("return __paints"), "30 mobs' flags (and one with no unit): not drawn").toBe(0);
  addon.fire("UNIT_FLAGS", "party1");
  addon.fire("UNIT_CONNECTION", "player");
  addon.fire("GROUP_ROSTER_UPDATE");
  addon.advance(0.5);
  expect(addon.eval("return __paints"), "a member's, yours and the roster's: drawn once").toBe(1);
});

it("the roster: T.SPACE.gap in from the panel's edge on every side (a HUD card's padding), and as tall as its padding and lines", () => {
  const addon = loggedIn("");
  addon.world.setUnit("party1", { name: "Pal", class: "MAGE", className: "Mage", isPlayer: true });
  say(addon, "loot roster");
  const gap = addon.eval("return ns.Theme.SPACE.gap");
  const [panel, name] = ["", ".rows[1].left"].map((part) => addon.frame(`Vanguard_RaidRoster${part}`).rect);
  const note = addon.eval("local p = Vanguard_RaidRoster.rows[1].right.__points.TOPRIGHT return { p.x, p.rel == Vanguard_RaidRoster }");
  expect([name.left - panel.left, panel.top - name.top, note[0], note[1]], "the heading a gap in from the left and top, its note a gap in from the right").toEqual([gap, gap, -gap, true]);
  expect(addon.eval("return Vanguard_RaidRoster:GetHeight() - 3 * ns.GetModule('RaidTools').RLINE"), "three lines (the heading, you and Pal) and two gaps").toBe(2 * gap);
});

it("the roster of 40 stays on the screen: the lines are cut to the room under its top, the last one counting the members left out", () => {
  // The roster's bottom edge, its drawn lines' texts and the screen's height with 40 raid members on a w x h canvas.
  const full = (w, h) => {
    const addon = loggedIn(`__wfgStub.setScreen(${w}, ${h})`);
    for (let i = 1; i <= 40; i += 1) addon.world.setUnit(`raid${i}`, { name: `Pal${String(i).padStart(2, "0")}`, class: "MAGE", className: "Mage", isPlayer: true, role: "DAMAGER" });
    say(addon, "loot roster");
    return [addon.eval("return Vanguard_RaidRoster:GetBottom()"), roster(addon)[1].map((x) => x[0])];
  };
  const [bottom768, at768] = full(1365, 768);
  expect(bottom768, "1365x768: the bottom edge is on the screen").toBeGreaterThanOrEqual(0);
  expect([at768.length, at768[0], at768[at768.length - 1]], "39 lines: the heading, 37 members and the count of the 3 left out").toEqual([39, "Roster 40", "+3 more"]);
  const [bottom668, at668] = full(835, 668);
  expect([bottom668 >= 0, at668.length, at668[at668.length - 1]], "835x668: cut shorter still").toEqual([true, 32, "+10 more"]);
  const [bottom1080, at1080] = full(1920, 1080);
  expect([bottom1080 >= 0, at1080.length, at1080[at1080.length - 1]], "a tall screen: every member, and no count line").toEqual([true, 41, "Pal40"]);
});

it("the roster is not in the raid tools' way: it works with the officer loot tools off, and hears the group only while it is open", () => {
  const addon = loggedIn("");
  addon.eval("__heard = 0 local RT = ns.GetModule('RaidTools') local soon = RT.SoonPaint RT.SoonPaint = function(...) __heard = __heard + 1 return soon(...) end");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(addon.eval("return __heard"), "closed: no group event reaches it").toBe(0);
  say(addon, "loot roster");
  expect(roster(addon)[0], "opens with the officer loot tools off").toBe(true);
  addon.fire("PLAYER_DEAD");
  addon.advance(0.5);
  say(addon, "loot roster");
  addon.eval("__heard = 0");
  addon.fire("GROUP_ROSTER_UPDATE");
  addon.fire("UNIT_FLAGS", "player");
  expect(addon.eval("return __heard"), "closed again: its watchers are gone").toBe(0);
});

it("the roster card is on the Raid frames page", () => {
  const addon = loggedIn("");
  expect(addon.eval(`local out = {} for i, r in ipairs(ns.GetModule("RaidTools").RosterRows()) do out[i] = r[2] end return out`)).toEqual(["Raid roster", "Show or hide the roster"]);
});
