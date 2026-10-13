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
    { module = "SpellRanks", label = "Spell ranks", items = {
      { text = "Chat can say when a bar button holds an older rank of a spell you know better; /vg ranks lists them and /vg ranks swap puts the newest rank there, out of combat.", page = "more", row = "Notice older spell ranks on bar buttons (/vg ranks)", off = true },
      { text = "Trainers you visit are remembered: /vg trainers next lists what comes in the next levels and where to learn it, and a level-up says so too.", page = "more", row = "Remember what trainers teach (/vg trainers)", off = true },
    } },
    { module = "InstancePrep", label = "Instance prep", items = {
      { text = "A dungeon card on the checklist shows the dungeon's level range, your own quests for it and the keys you carry, at the door and with /vg prep.", page = "more", row = "Dungeon card: level range, your dungeon quests and keys on the checklist", off = true },
    } },
    { module = "Windows", label = "Game windows", items = {
      { text = "The spellbook gets the flat Vanguard panel, like the other game windows.", page = "more", row = "Character, merchant, quest, loot and other windows" },
    } },
    { module = "RaidFrames", label = "Raid frames", items = {
      { text = "A raid tile width the choices don't list shows its value on the Width row.", page = "raid", row = "Width" },
    } },
    { module = "AuctionHelper", label = "Auction helper", items = {
      { text = "The Shopping and Selling tabs on the auction house are sized to their names.", page = "more", row = "Shopping and Selling tabs on the auction house" },
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
      { text = "A craft queue for your professions (/vg craft): queue the recipe on display, open the next one, raise Keep stocked to fit, see profession cooldowns across your characters and rank the recipes that pay best. Nothing is crafted or bought for you.", page = "more", row = "Craft queue, profession cooldowns and recipe ranking (/vg craft)", off = true },
    } },
    { module = "MailTools", label = "Mail tools", items = {
      { text = "A panel beside the mail window searches and filters your inbox, and presets fill the Send Mail tab for your alts (/vg mail). You click Take and Send yourself.", page = "more", row = "Search the inbox and send-to-alt presets beside the mail window (/vg mail)", off = true },
    } },
    { module = "GroupBoard", label = "Group board", items = {
      { text = "A group board (/vg lfg) lists looking-for-more and looking-for-group posts from chat by dungeon, role and level. A click opens a whisper you send yourself.", page = "more", row = "Open the group board" },
    } },
    { module = "Coexist", label = "Other addons", items = {
      { text = "When another addon does a job a Vanguard module also does, chat says so once and the Modules page lets you pick which one does it." },
    } },
    { module = "Errands", label = "Errands", items = {
      { text = "A boat and zeppelin timer, off until you switch it on, learns each ride's time and counts down the next one.", page = "more", row = "Boat and zeppelin timer (reload)", off = true },
    } },
    { label = "Setup", items = {
      { text = "The setup wizard sits above the frame handles on its last step, and its title and step are centred.", page = "general", row = "Run setup" },
    } },
    { label = "Errors", items = {
      { text = "An error in a hook on a game function, a button click or a timer is kept in /vg errors and doesn't stop the others." },
    } },
  } },
}
