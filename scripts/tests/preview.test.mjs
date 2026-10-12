// The UI preview's scenes (scripts/preview-ui.mjs, scripts/lib/preview-scenes.mjs): every one
// must build in the headless client, since the preview job in CI fails the whole run when one
// does not. The screenshots need Playwright and are not taken here; only the Lua that builds
// each scene runs, which is where the job failed on 2026-10-11 (a font string with no font).

import { describe, expect, it } from "vitest";
import { SCENES, buildScene } from "../lib/preview-scenes.mjs";

describe("UI preview scenes", () => {
  it("there are scenes, each with a unique name and a caption", () => {
    expect(SCENES.length).toBeGreaterThan(0);
    expect(new Set(SCENES.map((scene) => scene.name)).size).toBe(SCENES.length);
    expect(SCENES.filter((scene) => !scene.caption)).toEqual([]);
  });

  it.each(SCENES.map((scene) => [scene.name, scene]))("%s builds and the addon caught no error", (_name, scene) => {
    const addon = buildScene(scene);
    expect(addon.eval("return #ns.errors")).toBe(0);
  });
});
