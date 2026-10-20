// scenarios: Vanguard played through the TEST-ONLY headless client's world
// (scripts/lib/wow-world.lua) and input, asserting on what it draws. The
// guide is scripts/tests/README.md; the pattern is: set up the world, act
// as the player would, inspect the frames.

import { expect, it } from "vitest";
import { PLATE_ENV, RAID_ENV, UNITS_ENV, loggedIn } from "./helpers.mjs";

it("targeting a hostile shows the target frame with its health and name, and losing it hides the frame", () => {
  const addon = loggedIn();
  expect(addon.frame("Vanguard_target").visible, "no target, no frame").toBe(false);
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2, level: 12 });
  expect(addon.frame("Vanguard_target").visible).toBe(true);
  expect(addon.frame("Vanguard_target.health")).toMatchObject({ visible: true, value: 640, max: 800 });
  expect(addon.texts("Defias Pillager").length, "the name is drawn once").toBe(1);
  addon.world.setUnit("target", { hp: 100 });
  expect(addon.frame("Vanguard_target.health").value, "damage moves the bar").toBe(100);
  addon.world.removeUnit("target");
  expect(addon.frame("Vanguard_target").visible).toBe(false);
});

it("a buff on the player shows its icon in the player auras, and goes with the buff", () => {
  const addon = loggedIn();
  // The visible icons drawn for the buff.
  const icons = () => addon.frames('w.__kind == "Texture" and w.__texture == "TEST-ONLY-ICON-Arcane Intellect" and w:IsVisible()');
  addon.world.addAura("player", { name: "Arcane Intellect", duration: 3600, sourceUnit: "player" });
  expect(icons().length, "one icon, inside the player auras").toBe(1);
  const container = addon.frame(addon.frame(icons()[0].parent).parent);
  expect([container.kind, container.parent]).toEqual(["AuraContainer", "Vanguard_PlayerAuras"]);
  addon.world.removeAura("player", "Arcane Intellect");
  expect(icons().length).toBe(0);
});

it("an action slot shows its spell's icon and cooldown sweep", () => {
  const addon = loggedIn();
  addon.world.setAction(1, { id: 133 });
  expect(addon.frame("Vanguard_Bar1Button1.icon")).toMatchObject({ visible: true, texture: "Interface\\Icons\\Spell_Fire_FlameBolt" });
  addon.world.setAction(1, { id: 133, cooldown: { start: 1000, duration: 8 } });
  expect(addon.frames('w.__kind == "Cooldown" and w.__parent == Vanguard_Bar1Button1').map((f) => f.cooldown)).toEqual([{ start: 1000, duration: 8 }]);
});

it("a tracked quest lists its title and objectives", () => {
  const addon = loggedIn();
  addon.world.addQuest({ questID: 7, title: "Wolves Across the Border", level: 8, watched: true, objectives: [{ text: "0/8 Wolves slain", finished: false, type: "monster" }] });
  addon.update(0); // the tracker rebuilds on the next frame
  expect(addon.find("Wolves Across the Border").kind).toBe("FontString");
  expect(addon.find("Wolves slain").text).toBe("Wolves slain");
  expect(addon.find("0/8").kind, "its count apart, at the row's right edge").toBe("FontString");
});

it("/vg unlock waits for combat to end, then shows the movers", () => {
  const addon = loggedIn();
  addon.world.combat(true);
  addon.clearChat();
  addon.slash("unlock");
  expect(addon.chat().join("\n")).toMatch(/In combat\. Try again once combat ends\./);
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length, "nothing moves in combat").toBe(0);
  addon.world.combat(false);
  addon.slash("unlock");
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length).toBeGreaterThan(0);
  addon.slash("lock");
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length).toBe(0);
});

it("clicking a category in the options window opens its page", () => {
  const addon = loggedIn();
  addon.slash("");
  expect(addon.frame("Vanguard_Options").visible, "/vg opens the options").toBe(true);
  const label = addon.find("^Unit frames$");
  expect(label.kind).toBe("FontString");
  addon.click(label.parent);
  expect(addon.find("^Show health numbers").text).toBe("Show health numbers");
});

it("every top-level frame of the default layout sits inside a 1920x1080 screen with no overlaps", () => {
  const addon = loggedIn();
  const screen = addon.screen();
  expect(screen.map((f) => f.name)).toEqual(expect.arrayContaining(["Vanguard_player", "Vanguard_Bar1", "Vanguard_Minimap"]));
  for (const f of screen) {
    expect(f.rect.left >= 0 && f.rect.bottom >= 0 && f.rect.right <= 1920 && f.rect.top <= 1080, `${f.name} stays on screen`).toBe(true);
  }
  const overlaps = [];
  for (const a of screen) for (const b of screen) {
    if (a.name < b.name && a.rect.left < b.rect.right && b.rect.left < a.rect.right && a.rect.bottom < b.rect.top && b.rect.bottom < a.rect.top) overlaps.push(`${a.name} x ${b.name}`);
  }
  expect(overlaps, "frames of the default layout do not cover each other").toEqual([]);
});

// What a leak or a doubled hook would grow: the frames the client holds, the frames running an
// OnUpdate, the errors Vanguard caught, and the chat lines it said.
const footprint = (addon) => [...addon.eval("local n = 0 for _ in pairs(__wfgStub.updaters) do n = n + 1 end return { #__wfgStub.frames, n, #ns.errors }"), addon.chat().length];

it("churn: repeated PLAYER_ENTERING_WORLD (queue pops, reloads, zoning) adds no frames, updaters, errors or chat lines", () => {
  const addon = loggedIn();
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2, level: 12 });
  for (let i = 0; i < 2; i++) addon.fire("PLAYER_ENTERING_WORLD", false, false);
  addon.advance(5);
  const before = footprint(addon);
  for (let i = 0; i < 25; i++) {
    addon.fire("PLAYER_ENTERING_WORLD", i % 2 === 0, i % 3 === 0);
    if (i % 5 === 0) addon.advance(2);
  }
  expect(footprint(addon), "the same frames, updaters, errors and chat lines after 25 more").toEqual(before);
  expect(addon.frame("Vanguard_target").visible, "and the frames still answer: the target frame is up").toBe(true);
});

// TEST-ONLY: raid4..raid40 and nameplate4..nameplate43 come and go together, as a layer change or a boss
// pull brings and clears them: the units and the plates exist, the client's events say so (a roster update, a
// health change for each member, a plate added and later removed), then everything is cleared and the roster
// update fires again.
const CHURN_LUA = `
  function __crowd(on)
    for i = 4, 43 do
      local unit = "nameplate" .. i
      __plates[unit] = on and __plateFor(i) or nil
      __units[unit] = on and __units.target or nil
      __wfgStub.fire(on and "NAME_PLATE_UNIT_ADDED" or "NAME_PLATE_UNIT_REMOVED", unit)
    end
    for i = 4, 40 do __units["raid" .. i] = on and { name = "TEST-ONLY Raider" .. i, hp = 900, maxhp = 1000, power = 0, maxpower = 0, ptype = "RAGE", player = true, class = "WARRIOR" } or nil end
    __wfgStub.fire("GROUP_ROSTER_UPDATE")
    for i = 4, 40 do __wfgStub.fire("UNIT_HEALTH", "raid" .. i) end
  end
  -- The client keeps its nameplate frames and hands the same one to the next unit, so a plate is made once.
  __pool = {}
  function __plateFor(i)
    if not __pool[i] then
      local p = CreateFrame("Frame", nil, UIParent)
      p:SetSize(110, 45)
      p:SetPoint("CENTER")
      p.UnitFrame, p.IsForbidden = CreateFrame("Frame", nil, p), function() return false end
      __pool[i] = p
    end
    return __pool[i]
  end`;

it("churn: 37 raid members and 40 nameplates arriving and vanishing together, again and again, leave no errors or growth", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + RAID_ENV + CHURN_LUA);
  for (let i = 0; i < 2; i++) {
    addon.eval("__crowd(true)");
    addon.advance(2);
    addon.eval("__crowd(false)");
    addon.advance(2);
  }
  const before = footprint(addon);
  const poolBefore = addon.eval("return #ns.GetModule('Nameplates').pool");
  for (let round = 0; round < 5; round++) {
    addon.eval("__crowd(true)");
    addon.advance(1);
    addon.eval("__crowd(false)");
    addon.advance(1);
  }
  expect(footprint(addon), "the third and later rounds build no frame or updater, say nothing and catch no error").toEqual(before);
  expect(addon.eval("return #ns.GetModule('Nameplates').pool"), "plates that come back take their own frame again: the pool stays as it was").toBe(poolBefore);
});
