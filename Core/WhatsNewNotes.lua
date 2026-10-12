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
    { label = "Setup", items = {
      { text = "The setup wizard sits above the frame handles on its last step, and its title and step are centred.", page = "general", row = "Run setup" },
    } },
    { label = "Errors", items = {
      { text = "An error in a hook on a game function, a button click or a timer is kept in /vg errors and doesn't stop the others." },
    } },
  } },
}
