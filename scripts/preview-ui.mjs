#!/usr/bin/env node
// Screenshot Vanguard without the game client.
//
//   node scripts/preview-ui.mjs [--out dir]
//
// Runs the real addon Lua (same harness as the scripts/tests suite) against a TEST-ONLY
// world (units, action slots, chat lines) and lays out the frames it built
// in headless Chromium. Layout, sizes, colors and bar values are the
// addon's own; spell icons, the map and the game font are approximated.
// Needs Playwright (a global install is fine).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { root } from "./lib/lua-harness.mjs";
import { SCENES, buildScene } from "./lib/preview-scenes.mjs";
import { renderScene } from "./lib/ui-preview.mjs";

// The value after --name, or the fallback.
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// Playwright from the project, else from the global npm root.
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(path.join(globalRoot, "noop.js"))("playwright");
  }
}

const out = path.resolve(arg("out", path.join(root, "preview")));
fs.mkdirSync(out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const scene of SCENES) {
  const addon = buildScene(scene);
  const file = path.join(out, `${scene.name}.png`);
  await renderScene(page, addon, {
    file,
    caption: `Preview · ${scene.caption} · layout from the addon's Lua; TEST-ONLY units, icons and chat; map, icons and font approximated, not a game screenshot`,
    // An options page sizes its note rows from the measured text, so it is built again from the measurements.
    relayout: () => { const m = (scene.lua || "").match(/ns\.Options\.Show\("(\w+)"\)/); if (m) addon.eval(`ns.Options.RebuildPage("${m[1]}")`); },
    screen: scene.screen,
  });
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
await browser.close();
