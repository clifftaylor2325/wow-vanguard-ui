# ForeverUI

A from-scratch UI suite for WoW Forever (Midnight-era client, Interface 12xxxx):
one theme, movable frames and profiles now; unit frames, action bars,
minimap, chat and bags next. Written from scratch. It contains no code, art or
fonts from other UI addons.

## Install

Copy the `ForeverUI` folder from a release zip into `World of Warcraft/_retail_/Interface/AddOns/` (your Forever client's AddOns folder).

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

**Code quality:** every function has a comment on the line above it and at most 10 lines of body code; `npm run verify` and CI enforce it.

## License

MIT
