# Getting started with Vanguard

Vanguard is one addon that replaces a pile of them: unit frames, raid frames, action bars, bags, chat, nameplates, the map, quest tools, an auction helper and more, in one look. It is made for WoW Forever. This page is the short version for players; [README.md](../README.md) is the full description of what every part does.

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

## If something goes wrong

- `/vg errors` lists anything Vanguard caught going wrong this session.
- `/vg report` prints one block to copy; paste it at vanguardui.com/feedback, or write the report in game with `/vg feedback`.
- `/vg status` says the version, profile, modules and what the client has.

Several newer parts start switched off (the Vanguard meter, craft queue, mail tools, boat timer and others). The What's new window and the options pages say which; turn them on under `/vg`.

## Where to read more

- [COMMANDS.md](COMMANDS.md): every `/vg` command, grouped by what it does.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.
- [README.md](../README.md): the full feature description.
