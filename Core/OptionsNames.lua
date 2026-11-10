-- The options window's short names (docs/design/SETTINGS-SIMPLIFICATION.md, D3): a row's caption is a name of at most
-- 40 characters, and a row renamed from a longer caption keeps that caption as its tip. The old caption is the same
-- L[] string it was, so its translations stay, the search still finds the row by its old words (in both tongues), and
-- a jump by the old caption (an older What's new note) still lands. Core/OptionsWindow.lua names each row it reads.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options

-- The renamed rows: the new English name (without a reload bracket) -> the caption it had, reload bracket and all.
O.RENAMED = {
  ["Handles in the game's Edit Mode too"] = L["Show these handles in the game's Edit Mode too"],
  ["Combined bag in sections"] = L["Combined bag in sections: equipment, consumables, quest items, junk"],
  ["The game's tracker in the Vanguard look"] = L["The game's quest tracker in the Vanguard look (reload)"],
  ["The game's tracker under the info strip"] = L["The game's quest tracker under the info strip (reload)"],
  ["Tooltips on hover"] =
    L["Tooltips on hover (XP: kills to level, rested, quest XP; reputation: standing and the next)"],
  ["Lock buttons"] = L["Lock buttons (Shift-drag to move actions)"],
  ["Movable pet and stance bars"] = L["Pet and stance bars in their own movable spots (reload)"],
  ["Restyle pet, stance and extra buttons"] = L["Restyle the pet, stance, possess and extra action buttons (reload)"],
  ["Auction price on the toast"] = L["Auction price of a linked item on the toast"],
  ["Ctrl + wheel jumps to top or bottom"] = L["Ctrl + mouse wheel jumps to the top or bottom of chat"],
  ["Hide the tab bar until hovered"] = L["Hide the tab bar until the mouse is over the chat"],
  ["Keep chat tabs visible"] = L["Keep chat tabs visible (the game fades them until the mouse comes near)"],
  ["Movers for floating windows"] = L["Move floating windows with /vg unlock (reload)"],
  ["Short channel names"] = L["Short channel names: [2. Trade] shows as [2]"],
  ["Text-only bubbles"] = L["Text-only bubbles: no panel behind the words over heads (reload)"],
  ["Calm HUD out of combat"] =
    L["Calm HUD: quiet the HUD out of combat until a fight, a hostile target or the mouse"],
  ["Cast ring at the cursor"] = L["Ring at the cursor: the global cooldown and your cast"],
  ["Group threat panel"] = L["Group threat panel: who has the most threat on your target (reload)"],
  ["In-combat mark"] =
    L["In-combat mark: crossed swords and a red edge on your frame, a red edge on your target's while it fights"],
  ["Interrupt mark on cast bars"] = L["Interrupt mark beside the target and focus cast bars"],
  ["Mark resurrections and summons"] = L["Mark players being resurrected or summoned"],
  ["Pet happiness dot"] = L["Your pet's happiness, a dot on the pet frame (reload)"],
  ["Stack big raids at the left"] = L["Stack big raids at the left (more than 10 players)"],
  ["Status chip beside your frame"] =
    L["Status chip beside your frame: Eating, Drinking, Well Fed, or a missing buff from Instance prep's checks, out of combat (reload)"],
  ["Tag mark on your target"] =
    L["Tag mark on your target: a green check if you tagged it, a grey X if another player did"],
  ["Versus deck"] = L["Versus deck: your frame and your target's joined in one panel, the crest between"],
  ["Your threat on your target"] = L["Your threat on your target, above its frame (reload)"],
  ["Accept summons"] = L["Accept summons (one offered in a fight is taken when it ends)"],
  ["Character and other windows"] = L["Character, merchant, quest, loot and other windows (reload)"],
  ["Counts on your other characters"] = L["How many your other characters have (here, same side)"],
  ["Decline group invites from strangers"] = L["Decline group invites from people who aren't friends or guildmates"],
  ["Faster auto-loot"] = L["Faster auto-loot (when the game's auto-loot is on)"],
  ["Furthest camera zoom (the game's setting)"] = L["Furthest the camera zooms out"],
  ["Hide the red error line"] = L["Hide the red error line (full bags and quest log still show)"],
  ["Item sell price"] = L["What an item sells for (when the game doesn't say)"],
  ["Mail, guild and social windows"] = L["Mail, guild, channels, friends and guild-creation windows (reload)"],
  ["Menus, dropdowns and tooltips"] = L["Right-click menus, dropdowns and more tooltips (reload)"],
  ["Options and help windows"] = L["Game options, Edit Mode, keybinding and help windows (reload)"],
  ["Release at once in battlegrounds"] = L["Release at once when you die in a battleground"],
  ["Tabs and the character pane"] = L["Tab buttons and the inside of the character pane (reload)"],
  ["Town windows and item dialogs"] = L["Stable, trainer, merchant, bags, loot and item dialogs (reload)"],
  ["Where an item is sold"] = L["Where an item is sold (merchants you've visited)"],
  ["World map and calendar windows"] = L["World map, group finder, calendar and Legacy windows (reload)"],
  ["Icons on the minimap's corners"] = L["Tracking, mail and difficulty on the minimap's corners (reload)"],
  ["Minimap button drawer"] = L["Gather addon minimap buttons into a drawer (reload)"],
  ["The /way command"] = L["/way sets map waypoints, unless another addon has it (reload)"],
  ["Vanguard look on the waypoint pin"] = L["Vanguard's pin and font on the game's floating waypoint pin (reload)"],
  ["Your DPS in the last fight"] = L["Your DPS in the last fight (from the game's damage meter)"],
  ["Your DPS place in the group"] = L["Your place in the last fight's DPS, in a group"],
  ["Accept shared quests"] = L["Accept quests a party member shares with you"],
  ["Pick the reward that sells for most"] = L["With a choice of rewards, take the one that sells for most"],
  ["Quest XP toward your level"] = L["Under the quests, how much of the XP to level they give"],
  ["Remember who finished each quest"] = L["Remember which character finished each quest (\"Done on Thrall-Realm\")"],
  ["Skip chatter for a single quest"] = L["Skip the chatter when an NPC has just one quest for you"],
  ["Vanguard's quest dialog"] = L["Vanguard's quest dialog at the bottom center (reload)"],
  ["Vanguard's quest log"] = L["Vanguard's quest log on the quest log key (reload)"],
  ["Vanguard's quest tracker"] = L["Vanguard's quest tracker under the info strip (reload)"],
  ["Announce a rare nearby"] = L["A rare nearby: a sound and a chat line, out of combat"],
  ["DPS sparkline of the last 20 fights"] = L["Sparkline of your DPS in the last 20 fights, under the damage meter"],
  ["Group roll results panel"] = L["Show the group's /roll results in a small panel"],
  ["Hardcore notices in the Vanguard look"] = L["Hardcore death notices in the Vanguard look (reload)"],
  ["Loss of control in the Vanguard look"] = L["Loss of control in the Vanguard look, above your character (reload)"],
  ["Low health screen tint"] =
    L["Low health: a soft tint round the screen edge that grows as your health drops (no pulse)"],
  ["Place them to fit the layout"] = L["Place them to fit the layout; off leaves them to Edit Mode (reload)"],
  ["Recap in chat after each fight"] =
    L["Recap in chat after each fight: interrupts, dispels, damage taken, deaths (/vg recap)"],
  ["Show each line's share"] = L["Show each line's share of the total (45%) when the game gives plain figures"],
  ["Show loot rolls"] = L["Show loot rolls (who rolled what) where the client has them"],
  ["Vanguard's own meter"] =
    L["Vanguard's own damage and healing meter: the top lines of the game's meter (/vg meter)"],
  ["Auction prices in tooltips"] = L["Auction prices in tooltips (from your scans)"],
  ["Buff checks on the card"] = L["Buff checks on the card: flask, food, oil or poison, raid buffs"],
  ["Checklist when you enter an instance"] =
    L["Checklist when you enter a dungeon or raid (only when something is low)"],
  ["Craft queue and recipe ranking"] = L["Craft queue, profession cooldowns and recipe ranking (/vg craft)"],
  ["Crafting costs and profit"] = L["Crafting costs and profit beside the profession window"],
  ["Deals list"] = L["Deals list in the Lists tab: listings under the 7-day market or vendor price"],
  ["Disenchant values in tooltips"] = L["Disenchant values in tooltips (on for enchanters until you choose)"],
  ["Inbox search and send-to-alt presets"] =
    L["Search the inbox and send-to-alt presets beside the mail window (/vg mail)"],
  ["Keep items stocked from merchants"] = L["Keep items stocked from merchants (/vg stock)"],
  ["Lists and Posting tabs"] =
    L["Lists and Posting tabs on the auction house (lists, deals, upgrades, sell helper, your auctions, scan)"],
  ["Notice older ranks on bars"] = L["Notice older spell ranks on bar buttons (/vg ranks)"],
  ["Offer to sell your sell list"] = L["Offer to sell the items on your sell list (/vg junk)"],
  ["Recheck undercuts after posting"] = L["Check your auctions for undercuts again after each post and cancel"],
  ["Remember what trainers teach"] = L["Remember what trainers teach (/vg trainers)"],
  ["Seconds per craft"] = L["Seconds a craft takes, for the per-hour ranking"],
  ["Stack and Max buttons at merchants"] = L["Stack and Max buttons on a merchant item's quantity window"],
  ["Upgrades list"] =
    L["Upgrades list in the Lists tab: armor and weapons that beat what you wear, by Gear upgrades' weights"],
  ["Warn when a supply runs low"] = L["Warn in chat when a supply runs low (once, out of combat)"],
  ["Item level on gear slots"] = L["Item level on each gear slot of the character pane"],
  ["Mark missing enchants"] = L["Mark worn pieces missing an enchant with a !"],
  ["Also on player, target and focus"] = L["Also on your player, target and focus frames (reload)"],
  ["Numbered channels"] = L["Numbered channels (General, Trade, LookingForGroup)"],
  ["Buffs on players"] = L["Buffs on players (defensives, and yours on friends)"],
  ["Enemy nameplates (the game's setting)"] = L["Enemy nameplates (the game's setting, the V key)"],
  ["Levels, colored by difficulty"] = L["Levels, colored by how hard the unit is for you"],
  ["Mark your target's plate"] = L["Accent border, glow and marker on your target"],
  ["Tag marks"] = L["Tag marks: a green check on mobs you tagged, a grey X and grey bar on another player's"],
  ["Put the list in the party chat box"] = L["Put the list in the chat box for the party"],
  ["Put the list in the raid chat box"] = L["Put the list in the chat box for the raid"],
  ["Soft-reserve list"] = L["Turn on the soft-reserve list"],
  ["Follow the nearest quest"] = L["Follow the nearest quest (off: only the one you pinned)"],
  ["Mark quests new in WoW Forever"] = L["New mark on quests new in WoW Forever (when the client flags them)"],
  ["Next step in the tracker"] = L["The followed quest's next step in the tracker"],
  ["Aggro strip along the top"] = L["Aggro strip along the top (yellow, orange, red)"],
  ["Expansion and transmog windows"] = L["Expansion page, transmog and Trading Post windows (reload)"],
  ["Group finder and PvP windows"] = L["Group finder, PvP and Adventure Guide windows (reload)"],
  ["Say the next pick at a level-up"] = L["At a level-up, say what the plan picks next"],
  ["Spend planned points at a level-up"] =
    L["Spend planned points by itself at a level-up (buys and applies them, no asking)"],
  ["Arrow to a Ctrl-clicked waypoint"] = L["Point the arrow at a waypoint you Ctrl-click on the map"],
}

-- Rows that set one of the game's own settings as well as Vanguard's, which their caption doesn't say (a row that only
-- mirrors one says "(the game's setting)" in its name): the English name -> the tip that says so.
O.GAME_SETTING_TIPS = {
  ["Combined bag"] = L["Also sets the game's combined bags setting (put back as it was when this is off)."],
}

-- Gives a renamed row its old caption (an L[] string) as its tip, after any tip it has (last, so the window can take
-- a reload bracket off its end), and that caption's English
-- (its reload bracket left off) as row.was, which the window's jump by caption also reads. Returns the row.
---@param row table
---@param old string
---@return table
function O.Renamed(row, old)
  row.tip = row.tip and (row.tip .. "\n" .. old) or old
  row.was = (ns.English(old):gsub(" %(reload%)$", ""))
  return row
end

-- Names a row the window reads: a caption O.RENAMED lists gets its old caption as tip (once; a row already renamed,
-- by this or by O.Renamed, is left as it is), and one O.GAME_SETTING_TIPS lists gets that tip.
---@param row table
function O.NameRow(row)
  local old, game = O.RENAMED[row.english], O.GAME_SETTING_TIPS[row.english]
  if old and not row.was then O.Renamed(row, old) end
  if game and not row.tip then row.tip = game end
end
