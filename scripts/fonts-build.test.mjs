// The font build scripts (scripts/fonts/*.py) are Python with fontTools, which is not part of the
// npm install, so the tests read them as text: every font they save keeps the source's head.modified,
// or a rebuild with the same inputs never gives the same bytes (H44-26-101).

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { root } from "./check-zip.mjs";

// The text of one build script.
function script(name) {
  return fs.readFileSync(path.join(root, "scripts", "fonts", name), "utf8");
}

it("make-fonts.py opens each upstream Fira font without recalculating its timestamp", () => {
  expect(script("make-fonts.py")).toMatch(/TTFont\(os\.path\.join\(src_dir, f"FiraSansCondensed-\{weight\}\.ttf"\), recalcTimestamp=False\)/);
});

it("make-heading-fonts.py turns the timestamp off on the variable font and on the pinned instance it saves", () => {
  const text = script("make-heading-fonts.py");
  expect(text).toMatch(/TTFont\(os\.path\.join\(SRC, "Cinzel\[wght\]\.ttf"\), recalcTimestamp=False\)/);
  expect(text).toMatch(/^ {4}font\.recalcTimestamp = False$/m);
});
