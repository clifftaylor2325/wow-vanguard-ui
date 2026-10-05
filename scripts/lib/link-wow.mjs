// Links this clone into the game's AddOns folder, so an edit plus /reload
// shows in game without packaging. Windows gets a directory junction (no
// admin rights needed); macOS and Linux get a symlink.
//
// The game folder is the one holding Interface/AddOns for the Forever client.
// It's remembered in ~/.wow-forever/config.json (shared by both addon repos
// and the kit's `forever` TUI), so it's only typed once.
//
// Pure functions take an `io` object ({ fs, platform, home, now }) so tests
// run against a temp directory.

import path from "node:path";

// Where the shared settings live.
export function configPath(io) {
  return path.join(io.home, ".wow-forever", "config.json");
}

// The saved settings, or {} if there are none or the file is unreadable.
export function readConfig(io) {
  try {
    return JSON.parse(io.fs.readFileSync(configPath(io), "utf8"));
  } catch {
    return {};
  }
}

// Saves `wowDir` into the shared settings, keeping any other keys.
export function saveWowDir(io, wowDir) {
  const file = configPath(io);
  io.fs.mkdirSync(path.dirname(file), { recursive: true });
  io.fs.writeFileSync(file, `${JSON.stringify({ ...readConfig(io), wowDir }, null, 2)}\n`);
}

// The AddOns folder inside a game folder.
export function addonsDir(wowDir) {
  return path.join(wowDir, "Interface", "AddOns");
}

// What sits at `p`: "missing", "link" (symlink or junction), "folder" or "file".
export function kindAt(io, p) {
  let st;
  try {
    st = io.fs.lstatSync(p);
  } catch {
    return "missing";
  }
  if (st.isSymbolicLink()) return "link";
  return st.isDirectory() ? "folder" : "file";
}

// Where a link points (resolved to an absolute path), or null.
export function linkTarget(io, p) {
  try {
    return path.resolve(path.dirname(p), io.fs.readlinkSync(p));
  } catch {
    return null;
  }
}

// Same folder, ignoring a trailing separator and (on Windows) letter case.
export function samePath(io, a, b) {
  return io.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

// An absolute path without a trailing separator.
function norm(p) {
  return path.resolve(p).replace(/[\\/]+$/, "");
}

// Picks the game folder: --wow, then WOW_FOREVER_DIR, then the saved one.
export function resolveWowDir(io, flag, env) {
  return flag || env.WOW_FOREVER_DIR || readConfig(io).wowDir || null;
}

// A backup name for an installed copy, e.g. Vanguard.backup-20261027-1530.
export function backupName(dest, now) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);
  return `${dest}.backup-${stamp}`;
}

// Why the game folder can't be used, or null when it can.
export function wowDirProblem(io, wowDir) {
  if (!wowDir) return "Tell me the game folder once: npm run link:wow -- --wow \"<folder that has Interface/AddOns>\"";
  if (kindAt(io, addonsDir(wowDir)) !== "folder") {
    return `No Interface/AddOns in ${wowDir}. Pick the Forever client's folder (start the game once so it creates AddOns).`;
  }
  return null;
}

// The state of the addon's slot: { dest, kind, target, linkedHere }.
export function status(io, wowDir, addon, repo) {
  const dest = path.join(addonsDir(wowDir), addon);
  const kind = kindAt(io, dest);
  const target = kind === "link" ? linkTarget(io, dest) : null;
  return { dest, kind, target, linkedHere: !!target && samePath(io, target, repo) };
}

// Links the addon slot to this clone. An installed copy is kept aside only
// with `replace`. Returns { ok, message }.
export function link(io, { wowDir, addon, repo, replace }) {
  const s = status(io, wowDir, addon, repo);
  if (s.linkedHere) return { ok: true, message: `${addon} is already linked to this clone.` };
  if (s.kind === "file") return { ok: false, message: `${s.dest} is a file. Move it, then try again.` };
  if (s.kind === "folder" && !replace) {
    return { ok: false, message: `${s.dest} is an installed copy. Add --replace to move it aside and link this clone.` };
  }
  const moved = clearSlot(io, s);
  io.fs.symlinkSync(repo, s.dest, io.platform === "win32" ? "junction" : "dir");
  return { ok: true, message: `${addon} → ${repo}${moved ? ` (installed copy moved to ${moved})` : ""}. /reload in game.` };
}

// Empties the slot before linking: removes an old link, moves a folder aside.
// Returns the backup path when a folder was moved.
function clearSlot(io, s) {
  if (s.kind === "link") io.fs.unlinkSync(s.dest);
  if (s.kind !== "folder") return null;
  const backup = backupName(s.dest, io.now());
  io.fs.renameSync(s.dest, backup);
  return backup;
}

// Removes the link. Never deletes a real folder. Returns { ok, message }.
export function unlink(io, { wowDir, addon, repo }) {
  const s = status(io, wowDir, addon, repo);
  if (s.kind === "missing") return { ok: true, message: `${addon} isn't installed or linked.` };
  if (s.kind !== "link") return { ok: false, message: `${s.dest} is an installed copy, not a link. Left as it is.` };
  io.fs.unlinkSync(s.dest);
  return { ok: true, message: `Unlinked ${addon}. Install a release zip to play without the clone.` };
}

// One line describing the slot, for --status.
export function describe(s, addon) {
  if (s.linkedHere) return `${addon}: linked to this clone`;
  if (s.kind === "link") return `${addon}: linked to another folder (${s.target})`;
  if (s.kind === "folder") return `${addon}: installed copy (not linked)`;
  return `${addon}: not installed`;
}
