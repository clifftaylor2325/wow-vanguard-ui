-- The AFK screen: while you're away (/afk, or the game marks you idle), the
-- screen dims and a card shows your name in your class color, your level and
-- class, the zone, how long you've been away, the time, and your XP bar. Under
-- the card, in your faction's heading font and crest color, sits your faction's
-- passage: Varian's last letter to Anduin for the Alliance, the Blood Oath of
-- the Horde for the Horde (gone while the faction look is off).
-- Moving, typing or a fight brings everything back, and a click on the screen
-- puts it away until the next time. It shows only out of combat, and it's
-- drawn over the UI rather than hiding it, so nothing secure is touched.

local ADDON, ns = ...

local T = ns.Theme

local AFK = ns.Module("AfkScreen", { defaults = {} })

AFK.CARD_W, AFK.CARD_H, AFK.BAR_H = 380, 132, 10
-- The passage under the card, in your faction's heading font: how wide it wraps, its size over the title's.
AFK.PASSAGE_W, AFK.PASSAGE_UP = 640, 3

-- The backdrop passage for each faction (shown while the faction look is on).
AFK.PASSAGES = {
  Alliance = {
    text = "My son, a terrible darkness has returned to our world. As before, it seeks to annihilate everything that we hold dear. I go to face it, knowing I may not return. All my life I have lived by the sword. I've seen kingdoms burn, and watched brave heroes die in vain. It's been difficult for me to trust after losing so much. But from you I have learned patience, tolerance, and faith. Anduin, I now believe as you do, that peace is the noblest aspiration. But to preserve it, you must be willing to fight!",
    by = "Varian Wrynn, to his son Anduin",
  },
  Horde = {
    text = "Lok'tar ogar! Victory or death - it is these words that bind me to the Horde. For they are the most sacred and fundamental of truths to any warrior of the Horde. I give my flesh and blood freely to the Warchief. I am the instrument of my Warchief's desire. I am a weapon of my Warchief's command. From this moment until the end of days I live and die - For the Horde!",
    by = "The Blood Oath of the Horde",
  },
}

-- Values ---------------------------------------------------------------------------------------

-- Calls a client function by name; nil when this client doesn't have it.
local function ask(name, ...)
  local fn = _G[name]
  if type(fn) == "function" then return fn(...) end
end

-- Text from the client, or "" when it's missing or hidden.
local function plain(text)
  if ns.IsSecret(text) or type(text) ~= "string" then return "" end
  return text
end

-- True while the game marks you away (a hidden answer counts as no).
function AFK.Away()
  local away = ask("UnitIsAFK", "player")
  return not ns.IsSecret(away) and away == true
end

-- "Level 42 Warrior" (either part left out when the client can't say).
function AFK.Who()
  local level, class = ns.PlainNumber(ask("UnitLevel", "player")), plain((ask("UnitClass", "player")))
  local text = (level and ("Level " .. level .. " ") or "") .. class
  return (text:gsub("%s+$", ""))
end

-- The zone, with the spot within it when there is one: "Elwynn Forest  ·  Goldshire".
function AFK.Where()
  local zone, spot = plain(ask("GetRealZoneText")), plain(ask("GetSubZoneText"))
  if spot ~= "" and spot ~= zone then return zone .. "  ·  " .. spot end
  return zone
end

-- How long you've been away, as "Away 3:07" or "Away 1:03:07".
function AFK.AwayText(seconds)
  local s = math.floor(seconds)
  if s < 3600 then return string.format("Away %d:%02d", math.floor(s / 60), s % 60) end
  return string.format("Away %d:%02d:%02d", math.floor(s / 3600), math.floor(s / 60) % 60, s % 60)
end

-- Your class color (r, g, b), or the accent when the client can't say.
local function classColor()
  local _, class = ask("UnitClass", "player")
  local c = not ns.IsSecret(class) and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
  if c then return c.r, c.g, c.b end
  return T.RGB("accent")
end

-- Painting ---------------------------------------------------------------------------------------

-- The XP bar: your XP into this level, hidden at the cap or when the client hides it.
local function paintXP(bar)
  local cur, max = ns.PlainNumber(ask("UnitXP", "player")), ns.PlainNumber(ask("UnitXPMax", "player"))
  local level, cap = ns.PlainNumber(ask("UnitLevel", "player")), ns.PlainNumber(ask("GetMaxPlayerLevel"))
  local show = cur ~= nil and max ~= nil and max > 0 and not (level and cap and level >= cap)
  bar:SetShown(show)
  if not show then return end
  bar:SetMinMaxValues(0, max)
  T.SetBarValue(bar, cur)
end

-- Your faction's passage under the card, in the crest's color; gone while the faction look is off.
function AFK.PaintPassage()
  local f, faction = AFK.frame, T.Faction()
  local passage = faction and AFK.PASSAGES[faction]
  f.passage:SetShown(passage ~= nil)
  f.by:SetShown(passage ~= nil)
  if not passage then return end
  f.passage:SetText(passage.text)
  f.by:SetText(passage.by)
  f.passage:SetTextColor(T.RGB(T.CRESTS[faction][2]))
end

-- The card's texts and bar, as they are now.
function AFK.Paint()
  local f = AFK.frame
  f.name:SetText(plain(ask("UnitName", "player")))
  f.name:SetTextColor(classColor())
  f.who:SetText(AFK.Who())
  f.where:SetText(AFK.Where())
  AFK.Tick()
  paintXP(f.xp)
  AFK.PaintPassage()
end

-- The time away and the clock (once a second while the screen shows).
function AFK.Tick()
  local f = AFK.frame
  f.away:SetText(AFK.AwayText((ask("GetTime") or 0) - (AFK.since or 0)))
  f.clock:SetText(ask("date", "%H:%M") or "")
end

-- Showing ---------------------------------------------------------------------------------------

-- Dims the screen and shows the card (not in combat, and not again once you've clicked it away).
function AFK.Open()
  if AFK.frame:IsShown() or AFK.dismissed or ns.InCombat() then return end
  AFK.since = ask("GetTime") or 0
  AFK.Paint()
  T.FadeIn(AFK.frame, 0.4)
end

-- Puts the screen away (you're back, a fight started, or you clicked it).
function AFK.Close()
  if AFK.frame:IsShown() then T.FadeOut(AFK.frame, 0.2) end
end

-- Your away flag changed: show the screen while you're away, put it away when you're back.
function AFK.Update()
  if AFK.Away() then return AFK.Open() end
  AFK.dismissed = false
  AFK.Close()
end

-- Building ---------------------------------------------------------------------------------------

-- One line of the card's text, under the line before it.
local function line(card, role, color, anchor, gap)
  local fs = T.Text(card:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetPoint("TOP", anchor, anchor == card and "TOP" or "BOTTOM", 0, -gap)
  return fs
end

-- The card's texts: name, who, where, and the time away and the clock along its bottom.
local function addTexts(f, card)
  f.name = line(card, "title", false, card, 14)
  f.who = line(card, "label", "text2", f.name, 4)
  f.where = line(card, "label", "text", f.who, 8)
  f.away = T.Text(card:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.away:SetPoint("BOTTOMLEFT", card, "BOTTOMLEFT", 12, AFK.BAR_H + 16)
  f.clock = T.Text(card:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.clock:SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT", -12, AFK.BAR_H + 16)
end

-- Your faction's crest at the card's left, while the faction look is on.
local function addCrest(f, card)
  f.crest = T.Crest(card, 44)
  f.crest:SetPoint("TOPLEFT", card, "TOPLEFT", 14, -14)
end

-- The passage under the card (a title, so it takes the faction's heading font), centered
-- and wrapped, with who said it beneath.
local function addPassage(f, card)
  f.passage = T.Text(f:CreateFontString(nil, "OVERLAY"), "title", false)
  T.TextSize(f.passage, T.RoleSize("title") + AFK.PASSAGE_UP)
  f.passage:SetWidth(AFK.PASSAGE_W)
  f.passage:SetJustifyH("CENTER")
  f.passage:SetSpacing(4)
  f.passage:SetPoint("TOP", card, "BOTTOM", 0, -36)
  f.by = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.by:SetPoint("TOP", f.passage, "BOTTOM", 0, -10)
end

-- The XP bar along the card's bottom.
local function addXP(f, card)
  f.xp = T.BarColor(T.StyleBar(CreateFrame("StatusBar", nil, card)), "xp")
  T.HudPanel(f.xp, { inset = true })
  f.xp:SetPoint("BOTTOMLEFT", card, "BOTTOMLEFT", 12, 12)
  f.xp:SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT", -12, 12)
  f.xp:SetHeight(AFK.BAR_H)
end

-- The full-screen frame over the UI, dimmed.
local function dimmer()
  local f = CreateFrame("Frame", "Vanguard_AfkScreen", UIParent)
  f:SetAllPoints(UIParent)
  f:SetFrameStrata("FULLSCREEN_DIALOG")
  f.dim = T.Tint(f:CreateTexture(nil, "BACKGROUND"), "shade", 0.75)
  f.dim:SetTexture(T.WHITE)
  f.dim:SetAllPoints()
  return f
end

-- The dim over the whole screen, and the card in its middle.
local function build()
  local f = dimmer()
  local card = T.Panel(CreateFrame("Frame", nil, f), { shadow = true })
  card:SetSize(AFK.CARD_W, AFK.CARD_H)
  card:SetPoint("CENTER", f, "CENTER", 0, 60)
  addTexts(f, card)
  addCrest(f, card)
  addPassage(f, card)
  addXP(f, card)
  return f
end

-- You clicked or pressed a key: the screen goes until you're next away (the key still works).
function AFK.Dismiss()
  AFK.dismissed = true
  AFK.Close()
end

-- Clicks and keys put the screen away; the time away and the clock tick once a second.
local function wire(f)
  f:EnableMouse(true)
  f:SetScript("OnMouseDown", AFK.Dismiss)
  f:SetScript("OnKeyDown", AFK.Dismiss)
  ns.OutOfCombat(function() f:EnableKeyboard(true) if ns.Client.Has("keyPropagate") then f:SetPropagateKeyboardInput(true) end end)
  ns.Every("afk screen", 1, AFK.Tick, f)
end

-- Module entry point (Core/Modules.lua): a fight puts the screen away, and it
-- comes back after the fight if you're still away.
function AFK.Enable()
  AFK.frame = build()
  wire(AFK.frame)
  AFK.frame:Hide()
  ns.On("PLAYER_FLAGS_CHANGED", function(_, unit) if unit == "player" then AFK.Update() end end)
  ns.On("PLAYER_REGEN_DISABLED", AFK.Close)
  ns.On("PLAYER_REGEN_ENABLED", AFK.Update)
  T.OnChanged(AFK.PaintPassage)
end
