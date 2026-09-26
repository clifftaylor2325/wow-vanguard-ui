# ForeverUI

A from-scratch UI suite for WoW Forever (Midnight-era client, Interface 12xxxx).
Written from scratch. It contains no code, art or fonts from other UI addons.

## What's in it

- **Look and layout**: one flat theme with accent presets. Every frame can be moved in unlock mode (`/fui unlock`), with a grid, snapping and arrow-key nudging. Profiles can be exported and imported, and can switch with your spec.
- **Unit frames**: player, target, target of target, focus and party frames. Cast bars for you, your target and your focus. Buff and debuff rows on target and focus.
- **Raid frames** (VuhDo-style):
  - Healing: click casting and hover keybindings, incoming heals and shields, aggro strip, missing-buff marker, dispellable-debuff border, your HoTs.
  - Status: range fade, raid target icons, ready check, resurrection marker, and leader and assistant marks.
- **Action bars**: range and power tint, plus restyled pet, stance and extra action buttons and a vehicle exit button.
- **Nameplates**: class/reaction/threat colors, your debuffs, casts, raid icon, target border.
- **Everything else**: XP and reputation bars, square minimap, chat skin, combined bag, and themed tooltips with class colors and a Target line.
- **Options**: `/fui` or the addons button. Turn any module off under Modules to keep the default one.

Every client call is checked before use, and values the Midnight client hides
from addons go to the bars unread. None of this has been checked in game yet:
please report what breaks.

## Install

Download `ForeverUI-<version>.zip` from the [latest release](https://github.com/clifftaylor2325/wow-forever-ui/releases/latest) and unzip the `ForeverUI` folder into `World of Warcraft/_retail_/Interface/AddOns/` (your Forever client's AddOns folder).

## Commands

```
/fui               the options window (also: left-click the addons button by the minimap)
/fui unlock | lock drag handles on every ForeverUI frame (also: right-click the addons button)
/fui reset <frame|all>
/fui accent <rrggbb> | reset      /fui theme reset
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
    S.Panel(MyFrame)                -- flat panel, 1px border ({ accent = true } for an accent border)
    S.Button(MyFrame.OkButton)
    S.EditBox(MyFrame.Input)
    S.CloseButton(MyFrame.Close)
    S.SetFont(MyFrame.Title, 14)
  end)
end
```

The callback runs once at login, or immediately if the addon registers after login. Errors in it are reported and don't break anything else. Painted frames follow `/fui accent` changes live. `S.apiVersion` is 1; the API only grows.

## Development

```bash
npm install
npm run verify    # real addon Lua under a strict TEST-ONLY WoW stub, then the code-quality check
npm run lint      # luacheck
npm run package   # dist/ForeverUI-<version>.zip from committed files
npm run preview   # preview/*.png: the default layout and the options window (needs Playwright)
```

**Release:** bump `## Version` in `ForeverUI.toc` and merge, then run the `release` workflow from the Actions tab on `main` (it tags `v<version>`), or push a matching tag. It re-runs the checks and publishes a GitHub release with the zip.

**Code quality:** every function has a comment on the line above it and at most 10 lines of body code; `npm run verify` and CI enforce it.

## License

MIT
