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
      { text = "A profile can be exported in parts, such as layout only or one module, and imported without touching the rest.", page = "profiles", row = "Choose what to export" },
    } },
    { label = "Moving frames", items = {
      { text = "A frame can be anchored to another frame, and a bar can match another frame's width or height. Exit without saving puts everything back as it was." },
    } },
    { module = "QuestGuide", label = "Quest guidance", items = {
      { text = "Quest-start pins on the world map, from the game's own quest data. Shift-click a quest in the tracker to point the arrow at its next step.", page = "quests", row = "Quest-start pins on the world map" },
    } },
    { module = "GroupBoard", label = "Group board", items = {
      { text = "A group board (/vg lfg) lists looking-for-more and looking-for-group posts from chat by dungeon, role and level. A click opens a whisper you send yourself.", page = "more", row = "Open the group board" },
    } },
    { module = "Coexist", label = "Other addons", items = {
      { text = "When another addon does a job a Vanguard module also does, chat says so once and the Modules page lets you pick which one does it." },
    } },
    { label = "Setup", items = {
      { text = "The setup wizard sits above the frame handles on its last step, and its title and step are centred.", page = "general", row = "Run setup" },
    } },
    { label = "Errors", items = {
      { text = "An error in a hook on a game function, a button click or a timer is kept in /vg errors and doesn't stop the others." },
    } },
  } },
}
