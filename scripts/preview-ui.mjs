#!/usr/bin/env node
// Screenshot Vanguard without the game client.
//
//   node scripts/preview-ui.mjs [--out dir] [--scenes name,name]
//
// With no --scenes it renders every scene, a few at a time, each batch in a process of its own: one process that
// built every scene ran out of heap (V8) after about 19 of them, since every scene loads the whole addon.
//
// Runs the real addon Lua (same harness as the scripts/tests suite) against a TEST-ONLY
// world (units, action slots, chat lines) and lays out the frames it built
// in headless Chromium. Layout, sizes, colors and bar values are the
// addon's own; spell icons, the map and the game font are approximated.
// Needs Playwright (a global install is fine).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";
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

// How many scenes one process renders before the next process takes over.
const BATCH = 8;

const out = path.resolve(arg("out", path.join(root, "preview")));
fs.mkdirSync(out, { recursive: true });

// The scenes in batches of BATCH names.
function batches() {
  const names = SCENES.map((scene) => scene.name);
  const list = [];
  for (let i = 0; i < names.length; i += BATCH) list.push(names.slice(i, i + BATCH));
  return list;
}

// Renders each batch in a process of its own, one after the other; a batch that fails stops the run.
function renderInBatches() {
  for (const names of batches()) {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--out", out, "--scenes", names.join(",")], { stdio: "inherit" });
  }
}

// Renders the named scenes in one browser page.
async function renderScenes(names) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const scene of SCENES.filter((s) => names.includes(s.name))) await renderOne(page, scene);
  await browser.close();
}

// Builds one scene and writes its screenshot.
async function renderOne(page, scene) {
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

const only = arg("scenes", "");
if (only) await renderScenes(only.split(","));
else renderInBatches();
