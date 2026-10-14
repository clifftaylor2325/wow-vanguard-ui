-- What's new: the release notes players read in game (Core/WhatsNew.lua shows them), newest
-- version first. Plain data, so the website's build can read it from this file too: one
-- entry per line, plain string literals only. Each version lists groups (one per module or
-- area: module is the module's name when there is one, label what the player reads), each
-- group its items: text (player language), page (the options page a click opens; leave it
-- out for a line that opens nothing), row (a row caption on that page to jump to) and
-- off = true for a thing that starts off. Notes for the next version are written ahead of
-- the release, which bumps ## Version in Vanguard.toc to match.

local ADDON, ns = ...

ns.WHATS_NEW = {
  { version = "0.6.0", groups = {
    { module = "Nameplates", label = "Nameplates", items = {
      { text = "Enemies get nameplates: the game ships its enemy plates off, so Vanguard turns them on once; the Nameplates page now has the game's Enemy and Friendly nameplate switches, and /vg plates says what the game's plate settings are.", page = "nameplates", row = "Enemy nameplates (the game's setting, the V key)" },
    } },
    { module = "CooldownGaps", label = "Cooldown gaps", items = {
      { text = "A new row of icons for what the game's Cooldown Manager misses: on-use trinkets, items and spells you choose with /vg gaps add and /vg gaps spell add, your pet's abilities and totems; a switch also draws the Cooldown Manager's essential and utility cooldowns there in the Vanguard look.", page = "tools", row = "Cooldown gaps", off = true },
    } },
    { module = "SpellRanks", label = "Spell ranks", items = {
      { text = "Chat can say when a bar button holds an older rank of a spell you know better; /vg ranks lists them and /vg ranks swap puts the newest rank there, out of combat.", page = "town", row = "Notice older spell ranks on bar buttons (/vg ranks)", off = true },
      { text = "Trainers you visit are remembered: /vg trainers next lists what comes in the next levels and where to learn it, and a level-up says so too.", page = "town", row = "Remember what trainers teach (/vg trainers)", off = true },
    } },
    { module = "InstancePrep", label = "Instance prep", items = {
      { text = "A dungeon card on the checklist shows the dungeon's level range, your own quests for it and the keys you carry, at the door and with /vg prep.", page = "town", row = "Dungeon card: level range, your dungeon quests and keys on the checklist", off = true },
    } },
    { module = "Windows", label = "Game windows", items = {
      { text = "The spellbook gets the flat Vanguard panel, like the other game windows.", page = "windows", row = "Character, merchant, quest, loot and other windows" },
    } },
    { module = "CooldownGlow", label = "Cooldown Manager glow", items = {
      { text = "A Cooldown Manager buff icon can glow when its aura is in its last 30 % (you choose the share), for spells the game doesn't flag itself.", page = "tools", row = "Glow a Cooldown Manager buff in its last part, where the game's own flag is missing", off = true },
    } },
    { module = "RaidFrames", label = "Raid frames", items = {
      { text = "A raid tile width the choices don't list shows its value on the Width row.", page = "raid", row = "Width" },
      { text = "A raid of 25 or 40 now starts at the left of your character, its groups stacked as rows, where healers keep it; a party or a raid of 10 stays over your player frame. Frames you already moved stay where they are, and Stack big raids at the left turns it off.", page = "raid", row = "Stack big raids at the left (more than 10 players)" },
    } },
    { module = "AuctionHelper", label = "Auction helper", items = {
      { text = "The auction house tabs are now called Lists and Posting, and are sized to their names.", page = "town", row = "Lists and Posting tabs on the auction house" },
      { text = "Posting shows a step guide (Item, Price, Post, Listed) with a line saying what to do next, and a price the game asks you to confirm is confirmed with a second click." },
      { text = "Clicking an item in your bags while Posting is open keeps you on Posting instead of switching to the game's Sell page." },
    } },
    { module = "MenuStrip", label = "Menu bar", items = {
      { text = "A menu bar button takes your click while the game's new indicator is showing above it." },
    } },
    { module = "Situations", label = "Situations", items = {
      { text = "While you record a situation, a banner says which one you are editing and what it changes, with a button to stop and save." },
    } },
    { label = "Profiles", items = {
      { text = "If the game loses your saved settings, Vanguard says so and offers to restore them from a backup it keeps." },
      { text = "Presets: Vanguard's Healer, Damage and Tank, and any an addon offers, apply from the Profiles page (or /vg preset) after a question and a backup. Addons can also open the options window on a page.", page = "profiles", row = "Apply Healer" },
      { text = "A profile can be exported in parts, such as layout only or one module, and imported without touching the rest.", page = "profiles", row = "Choose what to export" },
    } },
    { label = "Moving frames", items = {
      { text = "A frame can be anchored to another frame, and a bar can match another frame's width or height. Exit without saving puts everything back as it was." },
    } },
    { module = "QuestGuide", label = "Quest guidance", items = {
      { text = "Quest-start pins on the world map, from the game's own quest data. Shift-click a quest in the tracker to point the arrow at its next step.", page = "quests", row = "Quest-start pins on the world map" },
    } },
    { module = "CraftQueue", label = "Craft queue", items = {
      { text = "A craft queue for your professions (/vg craft): queue the recipe on display, open the next one, raise Keep stocked to fit, see profession cooldowns across your characters and rank the recipes that pay best. Nothing is crafted or bought for you.", page = "town", row = "Craft queue, profession cooldowns and recipe ranking (/vg craft)", off = true },
    } },
    { module = "MailTools", label = "Mail tools", items = {
      { text = "A panel beside the mail window searches and filters your inbox, and presets fill the Send Mail tab for your alts (/vg mail). You click Take and Send yourself.", page = "town", row = "Search the inbox and send-to-alt presets beside the mail window (/vg mail)", off = true },
    } },
    { module = "GroupBoard", label = "Group board", items = {
      { text = "A group board (/vg lfg) lists looking-for-more and looking-for-group posts from chat by dungeon, role and level. A click opens a whisper you send yourself.", page = "chat", row = "Open the group board" },
    } },
    { module = "OfficerLoot", label = "Officer loot tools", items = {
      { text = "A soft-reserve list (/vg loot) flags a roll on a reserved item in the roll tracker, and a roster panel lists the group by role. Kept on your character and shared by hand into the chat box; nothing is synced or sent for you.", page = "tools", row = "Turn on the soft-reserve list and the roster", off = true },
    } },
    { module = "InstancePrep", label = "Instance prep", items = {
      { text = "Buff checks add a flask, food buff, weapon oil and raid buff rows to the ready-check card. They start off.", page = "town", row = "Buff checks on the card: flask, food, oil or poison, raid buffs", off = true },
    } },
    { module = "GroupThreat", label = "Group threat", items = {
      { text = "A panel lists who in your group has the most threat on your target. It starts off, and hides itself while the game hides threat values.", page = "unitframes", row = "Group threat panel: who has the most threat on your target (reload)", off = true },
    } },
    { module = "Coexist", label = "Other addons", items = {
      { text = "When another addon does a job a Vanguard module also does, chat says so once and the Modules page lets you pick which one does it." },
    } },
    { module = "FightHistory", label = "Fight history", items = {
      { text = "/vg recap shows the last fight's interrupts, dispels, damage taken and deaths from the game's damage meter, and sends them to a channel on request. A recap in your own chat after each fight is off until you switch it on.", page = "tools", row = "Recap in chat after each fight: interrupts, dispels, damage taken, deaths (/vg recap)", off = true },
    } },
    { module = "Meter", label = "Vanguard meter", items = {
      { text = "A damage and healing meter in the Vanguard look (/vg meter): the top lines of the game's own meter as class-colored bars, per second, in combat too. Off until you switch it on; the game's own meter stays until you turn it off in the game's settings.", page = "tools", row = "Vanguard's own damage and healing meter: the top lines of the game's meter (/vg meter)", off = true },
    } },
    { module = "Errands", label = "Errands", items = {
      { text = "A boat and zeppelin timer, off until you switch it on, learns each ride's time and counts down the next one.", page = "town", row = "Boat and zeppelin timer (reload)", off = true },
    } },
    { module = "Legacy", label = "Legacy system", items = {
      { text = "/vg legacy probe lists what the game has for the Legacy system, and a perk planner (off until you switch it on) keeps a list of perks within the tree's 16 points.", page = "town", row = "Legacy perk planner: a list of perks within the tree's 16 points (/vg legacy plan)", off = true },
    } },
    { label = "Setup", items = {
      { text = "The setup wizard sits above the frame handles on its last step, and its title and step are centred.", page = "general", row = "Run setup" },
      { text = "Setup's Healing and Damage and tanking layouts now set the raid frame, raid aura and nameplate settings of the Healer and Damage presets, so the two look different; the presets carry raid auras and raid healing too.", page = "general", row = "Run setup" },
    } },
    { label = "Theme", items = {
      { text = "Three new looks: High contrast (opaque panels, white text, a thicker accent ring), Vellum and ink (a warm dark with cream text) and Classic look (dark leather and bronze with gold-cream text). Slate and brass stays the default.", page = "general", row = "Theme variant: surfaces and text", off = true },
      { text = "Four more looks: Midnight (cold navy-black, ice-blue text), Obsidian (neutral charcoal, light grey text, a silver edge), Moss (dark forest green, pale sage text) and Ash and ember (smoky grey, a rust edge, warm grey text).", page = "general", row = "Theme variant: surfaces and text", off = true },
      { text = "Rounded corners on every theme: General → Look → Corners (or /vg corners rounded) rounds the corners of windows, frames, tooltips and buttons by four pixels. Square stays the default.", page = "general", row = "Corners: square or rounded panels", off = true },
    } },
    { label = "Window ornaments", items = {
      { text = "A thin brass rule under the options window's header and corner brackets on setup and the quest log.", page = "general", row = "Window ornaments: a brass rule or corners on large windows", off = true },
    } },
    { label = "Sharper icons", items = {
      { text = "/vg icons draws the menu strip icons at the size they show at (16, 20, 24 or 32 px) instead of scaling one image, for even strokes. It takes effect after a /reload.", off = true },
    } },
    { label = "Theme tests", items = {
      { text = "Two switches for side-by-side tests: /vg slug draws world text with the game's smooth-scaling font flag, and /vg framebuffer stops inner borders showing through a window as it fades.", off = true },
    } },
    { module = "QuestTracker", label = "Quest tracker and log", items = {
      { text = "Click +N more on the quest tracker to show your watched quests (up to 10) and Show fewer to fold it back; Vanguard remembers the choice across a reload; the tracker starts below the info strip and sits under the game's windows. Each quest shows the XP it gives." },
      { text = "In Vanguard's quest log, Track and Untrack redraw the button at once, Shift-click a quest to track it, and a reward card shows the item's tooltip when you hover it." },
      { text = "On the world map, a quest zone header loses the game's yellow bar for a gold chevron." },
    } },
    { module = "Errands", label = "Trainer", items = {
      { text = "A Train all button on the trainer's window learns everything you can afford in one click and says what it cost." },
    } },
    { module = "Upgrades", label = "Gear upgrades", items = {
      { text = "A stat weights wizard (/vg weights wizard) has a slider and an exact-value box for every stat, so gear and auction upgrades are judged the way you value your stats.", page = "town", row = "Set up stat weights" },
    } },
    { module = "InstancePrep", label = "Wanted amounts", items = {
      { text = "A short window (/vg prep setup) sets how many food, bandages, potions and ammo or shards to carry, with Use suggested for your level.", page = "town", row = "Set wanted amounts..." },
    } },
    { module = "Nameplates", label = "Nameplates", items = {
      { text = "The Nameplates page has the game's Enemy and Friendly nameplate switches, and enemy plates are on by default. Vanguard dresses both alike; /vg plates says how many it drew and what the game's plate settings are." },
    } },
    { module = "ClickCast", label = "Click casting", items = {
      { text = "The spell picker and the Add key picker open above their click catcher and take your clicks." },
    } },
    { module = "Windows", label = "Windows and menus", items = {
      { text = "Drag a game window by an empty spot along its top edge, the calendar and 14 more included. Window buttons sit on a faint tile, and Escape closes the options window." },
      { text = "The info strip lists the day, date and time in two columns, with a calendar button and a labelled durability line. The options window's switches are larger, and the long Bars, map, chat page is five pages." },
    } },
    { label = "Memory", items = {
      { text = "The auction price history keeps 7 days per item instead of 30, a scan keeps the cheapest gear link per item, and old chat alerts are swept, so Vanguard holds less memory after a scan. /vg mem watches it." },
    } },
    { module = "Meter", label = "Meter fixes", items = {
      { text = "The Vanguard meter starts clear of the bags and menu bar, shows figures to two decimals and fills its top bar when the figure is under 1." },
    } },
    { label = "Errors", items = {
      { text = "An error in a hook on a game function, a button click or a timer is kept in /vg errors and doesn't stop the others." },
    } },
  } },
}
