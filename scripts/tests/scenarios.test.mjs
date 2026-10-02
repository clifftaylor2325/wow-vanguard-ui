// scenarios: ForeverUI played through the TEST-ONLY headless client's world
// (scripts/lib/wow-world.lua) and input, asserting on what it draws. The
// guide is scripts/tests/README.md; the pattern is: set up the world, act
// as the player would, inspect the frames.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("targeting a hostile shows the target frame with its health and name, and losing it hides the frame", () => {
  const addon = loggedIn();
  expect(addon.frame("ForeverUI_target").visible, "no target, no frame").toBe(false);
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2, level: 12 });
  expect(addon.frame("ForeverUI_target").visible).toBe(true);
  expect(addon.frame("ForeverUI_target.health")).toMatchObject({ visible: true, value: 640, max: 800 });
  expect(addon.texts("Defias Pillager").length, "the name is drawn once").toBe(1);
  addon.world.setUnit("target", { hp: 100 });
  expect(addon.frame("ForeverUI_target.health").value, "damage moves the bar").toBe(100);
  addon.world.removeUnit("target");
  expect(addon.frame("ForeverUI_target").visible).toBe(false);
});

it("a buff on the player shows its icon in the player auras, and goes with the buff", () => {
  const addon = loggedIn();
  // The visible icons drawn for the buff.
  const icons = () => addon.frames('w.__kind == "Texture" and w.__texture == "TEST-ONLY-ICON-Arcane Intellect" and w:IsVisible()');
  addon.world.addAura("player", { name: "Arcane Intellect", duration: 3600, sourceUnit: "player" });
  expect(icons().length, "one icon, inside the player auras").toBe(1);
  const container = addon.frame(addon.frame(icons()[0].parent).parent);
  expect([container.kind, container.parent]).toEqual(["AuraContainer", "ForeverUI_PlayerAuras"]);
  addon.world.removeAura("player", "Arcane Intellect");
  expect(icons().length).toBe(0);
});

it("an action slot shows its spell's icon and cooldown sweep", () => {
  const addon = loggedIn();
  addon.world.setAction(1, { id: 133 });
  expect(addon.frame("ForeverUI_Bar1Button1.icon")).toMatchObject({ visible: true, texture: "Interface\\Icons\\Spell_Fire_FlameBolt" });
  addon.world.setAction(1, { id: 133, cooldown: { start: 1000, duration: 8 } });
  expect(addon.frames('w.__kind == "Cooldown" and w.__parent == ForeverUI_Bar1Button1').map((f) => f.cooldown)).toEqual([{ start: 1000, duration: 8 }]);
});

it("a tracked quest lists its title and objectives", () => {
  const addon = loggedIn();
  addon.world.addQuest({ questID: 7, title: "Wolves Across the Border", level: 8, watched: true, objectives: [{ text: "0/8 Wolves slain", finished: false, type: "monster" }] });
  expect(addon.find("Wolves Across the Border").kind).toBe("FontString");
  expect(addon.find("Wolves slain").text).toBe("- 0/8 Wolves slain");
});

it("/fui unlock waits for combat to end, then shows the movers", () => {
  const addon = loggedIn();
  addon.world.combat(true);
  addon.clearChat();
  addon.slash("unlock");
  expect(addon.chat().join("\n")).toMatch(/Not in combat\. Try again once combat ends\./);
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
  expect(addon.frame("ForeverUI_Options").visible, "/fui opens the options").toBe(true);
  const label = addon.find("^Unit frames$");
  expect(label.kind).toBe("FontString");
  addon.click(label.parent);
  expect(addon.find("^Show health numbers").text).toBe("Show health numbers");
});

it("every top-level frame of the default layout sits inside a 1920x1080 screen with no overlaps", () => {
  const addon = loggedIn();
  const screen = addon.screen();
  expect(screen.map((f) => f.name)).toEqual(expect.arrayContaining(["ForeverUI_player", "ForeverUI_Bar1", "ForeverUI_Minimap"]));
  for (const f of screen) {
    expect(f.rect.left >= 0 && f.rect.bottom >= 0 && f.rect.right <= 1920 && f.rect.top <= 1080, `${f.name} stays on screen`).toBe(true);
  }
  const overlaps = [];
  for (const a of screen) for (const b of screen) {
    if (a.name < b.name && a.rect.left < b.rect.right && b.rect.left < a.rect.right && a.rect.bottom < b.rect.top && b.rect.bottom < a.rect.top) overlaps.push(`${a.name} x ${b.name}`);
  }
  expect(overlaps, "frames of the default layout do not cover each other").toEqual([]);
});
