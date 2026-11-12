// The UI preview's scenes (scripts/preview-ui.mjs, scripts/lib/preview-scenes.mjs): every one
// must build in the headless client, since the preview job in CI fails the whole run when one
// does not. The screenshots need Playwright and are not taken here; only the Lua that builds
// each scene runs, which is where the job failed on 2026-10-11 (a font string with no font).
// The scenes are split over two files by position, even here and odd in previewodd.test.mjs,
// so two workers share them.

import { describe, expect, it } from "vitest";
import { SCENES, TOC_VERSION, buildScene } from "../lib/preview-scenes.mjs";

describe("UI preview scenes", () => {
  it("there are scenes, each with a unique name and a caption", () => {
    expect(SCENES.length).toBeGreaterThan(0);
    expect(new Set(SCENES.map((scene) => scene.name)).size).toBe(SCENES.length);
    expect(SCENES.filter((scene) => !scene.caption)).toEqual([]);
  });

  it.each(SCENES.filter((_, i) => i % 2 === 0).map((scene) => [scene.name, scene]))("%s builds and the addon caught no error", (_name, scene) => {
    const addon = buildScene(scene);
    expect(addon.eval("return #ns.errors")).toBe(0);
  });
});

it("an options scene shows the window, not setup or What's new over it, and its footer names the TOC's version", () => {
  const addon = buildScene(SCENES.find((scene) => scene.name === "vanguard-options"));
  const shown = addon.eval(`return { setup = Vanguard_Setup ~= nil and Vanguard_Setup:IsShown(),
    news = Vanguard_WhatsNew ~= nil and Vanguard_WhatsNew:IsShown(), footer = Vanguard_Options.version:GetText() }`);
  expect(shown, "setup is done and this version's notes were read").toEqual({ setup: false, news: false, footer: `Vanguard ${TOC_VERSION}  ·  /vg` });
});

it("the changed-settings scene's caption names the mark its two changed rows draw: the reset arrow", () => {
  const scene = SCENES.find((s) => s.name === "vanguard-options-changed");
  const addon = buildScene(scene);
  const marks = addon.eval(`local icons = {} for _, w in ipairs(__wfgStub.frames) do
    if w.reset and w.reset:IsShown() then icons[#icons + 1] = w.reset.mark.__texture:match("Icons\\\\(%a+)$") end end return icons`);
  expect(marks, "each changed row shows the Reset icon").toEqual(["Reset", "Reset"]);
  expect(scene.caption).toContain("the arrow left of each puts its default back");
});
