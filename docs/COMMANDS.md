# Commands

Every `/vg` command (`/vanguard` works too), grouped by what it does. `/vg help` prints the same list in game. The full wording of each command is in the Commands section of [README.md](../README.md), which is the reference this page is checked against.

## Options and setup

| Command | What it does |
| --- | --- |
| `/vg` | The options window (also `/vg options`, `/vg config`, the addons button by the minimap) |
| `/vg setup` | The first-run setup again |
| `/vg whatsnew` | What changed in this version |
| `/vg modules`, `/vg enable <module>`, `/vg disable <module>` | List the parts; switch one, then `/reload` |
| `/vg skins` | Addons skinned through the API; `skins <addon> on\|off` |
| `/vg status` | Version, profile, modules, skins, work waiting on combat |

## Layout

| Command | What it does |
| --- | --- |
| `/vg unlock`, `/vg lock`, `/vg move` | Drag handles on every Vanguard frame |
| `/vg reset <frame\|all>`, `/vg frames` | Put a frame back; list the frames you can move |
| `/vg grid`, `/vg snap` | The unlock-mode grid and snapping |
| `/vg dock` | Line up Deadly Boss Mods' bars with the Boss timers spots |
| `/vg preview [party\|10\|25\|40\|off]` | Raid frames with sample players |

## Look

| Command | What it does |
| --- | --- |
| `/vg variant [name]` | Theme variant: default, contrast, vellum, classic, midnight, obsidian, moss, ember |
| `/vg corners [square\|rounded]` | Panel corners |
| `/vg accent <colour>`, `/vg theme reset` | The accent colour |
| `/vg ornaments`, `/vg gradient`, `/vg icons` | Window ornaments, panel gradient, sharper menu icons (off by default) |
| `/vg texelsnap`, `/vg nineslice`, `/vg slug`, `/vg framebuffer` | Side-by-side tests (off by default) |

## Profiles

| Command | What it does |
| --- | --- |
| `/vg profile [name]` | Switch, or `new`, `copy`, `delete`, `reset` |
| `/vg preset [name]` | Healer, Damage, Tank and any an addon offers |
| `/vg export`, `/vg import` | Profile strings, whole or in parts |
| `/vg spec [profile\|off]` | Use a profile in this specialization |

## Combat and groups

| Command | What it does |
| --- | --- |
| `/vg binds`, `/vg keybind` | Click-casting and hover keys; keybind mode |
| `/vg meter [on\|off\|dps\|hps]`, `/vg fights`, `/vg recap` | Vanguard's meter, DPS per fight, last fight's recap |
| `/vg rolls`, `/vg loot` | Roll results; officer soft-reserve list and roster |
| `/vg lfg [probe]` | The group board |
| `/vg plates [enemies on\|off]` | Nameplates drawn and the game's plate settings |
| `/vg situation ...`, `/vg watch ...` | Situation overrides; Chat watch phrases |

## Town, quests and gear

| Command | What it does |
| --- | --- |
| `/vg quests`, `/vg way`, `/vg questdata` | Quest log, waypoints, what the client says about a quest |
| `/vg ah ...` | Auction prices, shopping lists, scans |
| `/vg weights [wizard\|...]` | Stat weights for gear upgrades |
| `/vg craft ...`, `/vg mail ...` | Craft queue; mail tools (off until switched on) |
| `/vg prep [want <kind> <n>\|setup]` | The Instance prep card and wanted amounts |
| `/vg stock`, `/vg inventory`, `/vg vendors` | Items to keep, characters remembered, merchants remembered |
| `/vg ranks`, `/vg trainers`, `/vg legacy` | Spell ranks, what trainers teach, the Legacy system |
| `/vg copy` | The recent chat as plain text |

## Help and diagnostics

| Command | What it does |
| --- | --- |
| `/vg help` | Every command with a line on what it does |
| `/vg errors [clear]` | What Vanguard caught going wrong this session |
| `/vg report`, `/vg feedback [bug\|feature]` | A block to paste at vanguardui.com/feedback |
| `/vg perf [cpu\|watch]`, `/vg mem` | CPU time and memory |
| `/vg frame <name> [deep]`, `/vg realm`, `/vg factionart` | What the client says about a frame, your realm, the faction pictures |
