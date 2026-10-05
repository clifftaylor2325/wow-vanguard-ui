-- The AFK screen: while you're away (/afk, or the game marks you idle), the
-- screen dims and a card shows your name in your class color, your level and
-- class, the zone, how long you've been away, the time, and your XP bar.
-- Moving, typing or a fight brings everything back, and a click on the screen
-- puts it away until the next time. It shows only out of combat, and it's
-- drawn over the UI rather than hiding it, so nothing secure is touched.

local ADDON, ns = ...

local T = ns.Theme

local AFK = ns.Module("AfkScreen", { defaults = {} })

AFK.CARD_W, AFK.CARD_H, AFK.BAR_H = 380, 132, 10

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

-- The card's texts and bar, as they are now.
function AFK.Paint()
  local f = AFK.frame
  f.name:SetText(plain(ask("UnitName", "player")))
  f.name:SetTextColor(classColor())
  f.who:SetText(AFK.Who())
  f.where:SetText(AFK.Where())
  AFK.Tick()
  paintXP(f.xp)
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
  local elapsed = 0
  f:EnableMouse(true)
  f:SetScript("OnMouseDown", AFK.Dismiss)
  f:SetScript("OnKeyDown", AFK.Dismiss)
  ns.OutOfCombat(function() f:EnableKeyboard(true) if ns.Client.Has("keyPropagate") then f:SetPropagateKeyboardInput(true) end end)
  f:SetScript("OnUpdate", function(_, dt)
    elapsed = elapsed + dt
    if elapsed >= 1 then elapsed = 0 AFK.Tick() end
  end)
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
end
