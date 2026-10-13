// The UI preview's scenes in odd positions: the other half of preview.test.mjs, which has the
// reason both files exist and the check that the names are unique.

import { describe, expect, it } from "vitest";
import { SCENES, buildScene } from "../lib/preview-scenes.mjs";

describe("UI preview scenes", () => {
  it.each(SCENES.filter((_, i) => i % 2 === 1).map((scene) => [scene.name, scene]))("%s builds and the addon caught no error", (_name, scene) => {
    const addon = buildScene(scene);
    expect(addon.eval("return #ns.errors")).toBe(0);
  });
});
