# ForeverUI

A from-scratch UI suite for WoW Forever (the 12.1 engine with vanilla content; the TOC declares Interface 16001 for Forever and 120007).
Written from scratch. It contains no code, art or fonts from other UI addons.

## What's in it

- **Look and layout**: the Slate & Brass theme: slate panels with soft shadows, a brass accent (or arcane, fel, void, ember), bundled Fira Sans Condensed, pixel-perfect borders, smooth bars, quiet fades and interface sounds (Reduce motion and Interface sounds switches turn them off). Every frame can be moved in unlock mode (`/fui unlock`), with a grid, snapping and arrow-key nudging; right-click a frame's handle to set its anchor and exact offsets. Profiles can be exported and imported, and can switch with your spec (on clients that have specializations).
- **Unit frames**: player, target, target of target, focus and party frames. On WoW Forever they show levels (colored by difficulty) and health as a percent, and a diamond marks elite, rare and boss targets. Combo points for rogues and druids above the player frame.
  - Target and focus auras: debuffs under the frame (a crowd-control slot, then yours soonest-first, then others' dimmed if you turn "Only your debuffs" off), the target's buffs above it, each row wrapping at the frame's width. Timer numbers are off by default (the dark sweep shows time left) and can be turned on.
  - Cast bars for you, your target and your focus, with a spark, the seconds left, your latency at the end of your own cast, and a gray edge on a cast you can't interrupt.
- **Raid frames** (VuhDo-style):
  - Laid out in zones that never overlap: name at the top, status (missing health, Dead, Offline) under it, the missing-buff mark in the top-right corner, debuffs bottom left, your HoTs bottom right, the power bar along the bottom, and the ready check and resurrection big in the center. Default tile 100 x 48.
  - Readable at a glance: class colors softened into the panel color by default (or dark bars with class-colored names, or bright class colors), outlined names that end in "..." when too long, and a dark bar on the dead and offline. In instanced combat, where the game keeps health secret from addons, the bars still fill and the missing-health text hides.
  - Auras: the first debuff you can dispel, then up to two others (boss debuffs included); your HoTs, lit while they're in their refresh window; no timer numbers on these small icons. A debuff you can dispel washes the tile in its type's color from the bottom and colors its edge.
  - Healing: click casting and hover keybindings, incoming heals and shields, aggro strip, missing-buff marker (hidden while the game hides auras, so it never cries wolf), an accent edge on your target, a faint wash under the mouse.
  - Status: range fade, raid target icons, ready check, resurrection marker, and leader and assistant marks.
- **Action bars**: range and power tint, plus restyled pet, stance and extra action buttons and a vehicle exit button.
  - The bottom bars stack with bar 1 on top; turning on another bottom bar adds it underneath. Each row takes its bar's real height, so a bar with bigger buttons or more rows pushes the ones above it up, right away when you change it. A position you've dragged is kept; `/fui reset all` puts the bars back in this order.
  - Empty slots stay hidden until you drag a spell or item, so a new character sees no empty squares.
  - Each bar has its own number of buttons, buttons per row, button size, and visibility: Always, On mouseover (seen only while the mouse is over it), In combat, or Hidden. While you drag a spell or item, On mouseover and In combat bars show too (In combat bars only when the drag starts out of combat).
  - Hidden bars keep their keys: the bar isn't drawn, but a bound key still casts, like a keybind-only bar. A Hidden bottom bar keeps its row in the stack (leaving a gap), because bars can't be re-stacked during combat.
  - The right-edge bars (4 and 5) start off; turned on, they show on mouseover. Profiles that already had them on keep them on Always.
- **Nameplates**: class/reaction/threat colors, your debuffs (soonest to expire first, with timers) and your crowd control, casts, raid icon, target border.
- **Everything else**: XP and reputation bars, square minimap, chat skin, combined bag, and themed tooltips with class colors and a Target line.
- **Options**: `/fui` or the addons button. Turn any module off under Modules to keep the default one.
- **First-run setup**: the first time you log in on an account, a three-step wizard asks for a layout (Damage and tanking, or Healing), an accent and raid frame style, then unlocks your frames so you can move them (the same unlock mode as `/fui unlock`, or **Move frames** under General in `/fui`; `/fui lock` or Done locks them again). With the defaults it takes three clicks: Next, Next, Done. It waits until you're out of combat. Done, the close button and Escape all end it, and it doesn't come back on its own; `/fui setup` reopens it. Damage and tanking is ForeverUI's defaults (picking it puts back anything Healing moved); Healing puts the raid frames centered just above your cast bar, growing upward, and turns click casting on. With Healing, a party and raids of up to 2 groups fit between the player and target frames; raids of more than 2 groups overlap them, so drag the raid frames where you want them with `/fui unlock` (or **Move frames** under General in `/fui`).

Every client call is checked before use, and values the client hides from
addons go to the bars unread. Auras use the client's own aura containers where
it has them (12.1 and WoW Forever), so icons, stacks, timers and debuff colors
keep working while it hides aura values in instanced combat; `/fui status`
shows which aura backend is in use. None of this has been checked in game yet:
please report what breaks.

## Install

Download `ForeverUI-<version>.zip` from the [latest release](https://github.com/clifftaylor2325/wow-forever-ui/releases/latest) and unzip the `ForeverUI` folder into `World of Warcraft/_retail_/Interface/AddOns/` (your Forever client's AddOns folder).

## Commands

```
/fui               the options window (also: left-click the addons button by the minimap)
/fui setup         the first-run setup again: layout, look, then move things
/fui unlock | lock drag handles on every ForeverUI frame (also: right-click the addons button)
/fui reset <frame|all>
/fui accent <rrggbb|brass|arcane|fel|void|ember> | reset      /fui theme reset
/fui modules       enable|disable <module>, then /reload
/fui skins         addons skinned through the API; skins <addon> on|off
/fui profile [name]              switch (or create); profile new|copy|delete <name>, profile reset
/fui export [module] | import    profile strings (whole profile or one module's settings)
/fui spec [profile|off]          use a profile whenever you're in this specialization
/fui binds                       this spec's click-casting and hover-key bindings
/fui status
```

## Skin API (for other addons)

```
## OptionalDeps: ForeverUI
```
```lua
if ForeverUI and ForeverUI.RegisterSkin then
  ForeverUI.RegisterSkin("MyAddon", function(S)
    S.Panel(MyFrame, { shadow = true }) -- flat panel, 1px border, sheen; shadow for floating windows
    S.Button(MyFrame.OkButton)
    S.EditBox(MyFrame.Input)
    S.CloseButton(MyFrame.Close)
    S.Text(MyFrame.Title, "title")  -- text roles: title, heading, name, cell, label, number, small, tiny, world
    S.Color(MyFrame.Hint, "text2")  -- theme colors by name: text, text2, muted, accent, good, bad...
    S.Tint(MyFrame.Glow, "accent")
  end)
end
```

The callback runs once at login, or immediately if the addon registers after login. Errors in it are reported and don't break anything else. Painted frames follow `/fui accent` changes live, and their borders stay one screen pixel at any UI scale (`S.Pixel(frame)` gives that size). `S.RGB(name)` returns any theme color; the names are in `Core/Theme.lua`. `S.apiVersion` is 1; the API only grows.

## Development

```bash
npm install
npm test          # JS and Lua harness tests under Vitest, once (vitest run, no watch), then a per-category Lua harness summary
npm run verify    # npm test (real addon Lua under a strict TEST-ONLY WoW stub, and the JS tests), then the code-quality scan; CI runs this
                  # (functions of 10 lines or fewer, all documented; colors only from Core/Theme.lua)
npm run coverage  # line coverage of the addon Lua; fails below scripts/lua-coverage-floor.json
npm run lint      # luacheck
npm run media     # regenerate Media/Textures and Media/Icons from scripts/lib/media-sources.mjs
npm run package   # dist/ForeverUI-<version>.zip from committed files
npm run preview   # preview/*.png: the default layout and the options window (needs Playwright)
```

**Play from your clone:** `npm run link:wow -- --wow "<Forever folder that has Interface/AddOns>"` links `Interface/AddOns/ForeverUI` to this clone (a directory junction on Windows, no admin needed), so an edit plus `/reload` shows in game. The folder is remembered in `~/.wow-forever/config.json`, so after the first time it's just `npm run link:wow`. An installed copy is only moved aside with `--replace` (it becomes `ForeverUI.backup-<date>`). `--status` shows what's there; `--unlink` removes the link and never deletes a real folder.

**VS Code:** open the folder and accept the recommended extensions: **Lua** (sumneko) and **WoW API** (Ketho), which add Lua 5.1 checking plus autocomplete and docs for the game API. `.vscode/tasks.json` has verify, luacheck (problems show in the editor), coverage, package, preview and link:wow under *Run Task*.

**Windows tools:** `npm run verify` needs only Node. For `npm run lint`, put `luacheck.exe` from the [luacheck releases](https://github.com/lunarmodules/luacheck/releases) on your PATH. CI also runs a Lua 5.1 syntax check (`luac5.1 -p`); you don't need it locally.

**Release:** bump `## Version` in `ForeverUI.toc` and merge, then run the `release` workflow from the Actions tab on `main` (it tags `v<version>`), or push a matching tag. It re-runs the checks and publishes a GitHub release with the zip.

**Art and fonts:** every texture and icon under `Media/` is drawn by code in `scripts/lib/media-sources.mjs` (plain math, no image editor), and `npm run verify` fails if a committed file doesn't match its source. The fonts are made from upstream Fira Sans Condensed by `scripts/fonts/make-fonts.py` (see that file).

**Code quality:** every function has a comment on the line above it and at most 10 lines of body code; `npm run verify` and CI enforce it.

## License

MIT, except the fonts: `Media/Fonts/FiraSansCondensed-*.ttf` are Fira Sans Condensed (Copyright 2012-2015 The Mozilla Foundation and Telefonica S.A.) under the SIL Open Font License 1.1, in `Media/Fonts/OFL.txt`. ForeverUI ships them trimmed to Latin, Greek and Cyrillic, with the digits pointing at the font's tabular figures.
