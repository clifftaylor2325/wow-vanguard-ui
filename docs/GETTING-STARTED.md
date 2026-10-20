# Getting started with Vanguard

Vanguard is one addon that replaces a pile of them: unit frames, raid frames, action bars, bags, chat, nameplates, the map, quest tools, an auction helper and more, in one look. It is made for WoW Forever. This page is the short version for players; the [feature pages](features/) are the full description of what every part does.

## Install

1. Download `Vanguard-<version>.zip` (CurseForge and Wago carry each release).
2. Unzip the `Vanguard` folder into `World of Warcraft/_retail_/Interface/AddOns/`, your Forever client's AddOns folder.
3. Start the game and make sure Vanguard is ticked on the character screen's AddOns list.

Updating from ForeverUI (before 0.4.0)? Settings don't carry over by themselves. Before updating, type `/fui export` in game and keep the string, then `/vg import` it after.

## First run

The first login opens the setup wizard: pick a layout (Damage, Tanking or Healing, Versus deck, or like the game's), your screen, a look, then move things where you want them. Run it again any time with `/vg setup`.

- `/vg` opens the options window. Press Escape to close it.
- `/vg unlock` shows drag handles on every Vanguard frame; `/vg lock` saves them. Right-click the addons button by the minimap does the same.
- `/vg modules` lists the parts. Turn off anything you would rather another addon does: `/vg disable <module>`, then `/reload`.
- `/vg whatsnew` lists what changed in this version; click a line to open its setting.

## What Vanguard does on its own

- At a merchant it repairs with your own gold and sells your gray items. Both have a switch in the options (`/vg`).
- On a character's first login it turns the game's enemy nameplates on, and the combined bags and Cooldown Manager switches follow Vanguard's Bags and Game tools pages.
- Setup can change the game's UI scale, and `/vg graphics apply` changes graphics settings (`/vg graphics undo` puts them back).

These are settings of the game itself, so they stay when you disable Vanguard. To go back, change them in the game's own options (turning Vanguard's Bags module off puts your bag layout back). Key bindings that Vanguard's action bars set are saved with the game's bindings too, and the "Filtered" chat tab the chat filter makes can be closed from its tab menu.

## If something goes wrong

- `/vg errors` lists anything Vanguard caught going wrong this session.
- `/vg report` prints one block to copy; paste it at vanguardui.com/feedback, or write the report in game with `/vg feedback`.
- `/vg status` says the version, profile, modules and what the client has.

Much of what this page and the feature pages describe has not been checked in the game yet: CHANGELOG.md and SMOKE-TEST.md say what has. If something looks wrong, tell us (`/vg report`).

Several newer parts start switched off (the Vanguard meter, craft queue, mail tools, boat timer and others). The What's new window and the options pages say which; turn them on under `/vg`.

## Where to read more

- [COMMANDS.md](COMMANDS.md): every `/vg` command, grouped by what it does.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.
- [README.md](../README.md): the overview, with a link to each feature page.
