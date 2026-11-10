-- Tooltips in the Vanguard look: a flat panel instead of the default art,
-- a border in the class (or reaction) color of the unit you're looking at,
-- the unit's name in that color, and a "Target:" line. A player's tooltip
-- adds the guild and rank, the realm and the group role, and your own adds
-- your equipped item level. A tooltip the client gives its default spot
-- can sit in a movable corner, follow the cursor, or stay where the client
-- puts it, chosen apart for units in the world, units on frames and
-- everything else, and unit tooltips can be hidden in combat. Item tooltips show what
-- the item sells for (the stack's worth, unless the client already shows it),
-- how many you have (bags and bank); other modules add their own item lines
-- after those (TT.AddItemLines). One switch, off by default, adds IDs: an
-- item's to its tooltip, a spell's to a spell's and an aura's.
--
-- Written for WoW Forever. Every client call is looked up when used. In
-- Midnight some of a tooltip's text is hidden from addons, so this module only
-- colors lines and adds its own; a line's text is read (and only when it is
-- plain) to keep from repeating what the client already shows.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")

local T = ns.Theme
local L = ns.L

local TT = ns.Module("Tooltips", {
  defaults = { anchor = "corner", unitAnchor = "corner", frameAnchor = "corner", classBorder = true, targetLine = true, guild = true, realm = true, role = true, itemLevel = true, hideInCombat = false,
    sellPrice = true, itemCount = true, ids = false },
})

-- After 0.9.3: the "Item IDs" switch (itemID) became one switch for item, spell and aura IDs (ids), and the one
-- tooltip position (anchor) became three: unit tooltips in the world and on frames start where anchor was.
ns.Migrate("Tooltips", function(saved)
  if saved.itemID ~= nil then saved.ids, saved.itemID = saved.itemID, nil end
  if saved.unitAnchor == nil then saved.unitAnchor = saved.anchor end
  if saved.frameAnchor == nil then saved.frameAnchor = saved.anchor end
end)

TT.NAMES = { "GameTooltip", "ItemRefTooltip", "ShoppingTooltip1", "ShoppingTooltip2", "EmbeddedItemTooltip" }
-- More of the client's tooltips and tooltip-like boxes, skinned while the game windows' "menus" group is
-- on too (its switch: "Right-click menus, dropdowns and more tooltips"). Ones a client lacks are skipped.
TT.MORE_NAMES = {
  "ItemRefShoppingTooltip1", "ItemRefShoppingTooltip2", "GameNoHeaderTooltip", "GameSmallHeaderTooltip", "BuffFrameTooltip",
  "QuickKeybindTooltip", "SettingsTooltip", "PartyMemberBuffTooltip", "AutoCompleteBox",
  "BattlePetTooltip", "FloatingBattlePetTooltip", "FriendsTooltip",
}

-- Skinning ---------------------------------------------------------------------------------

-- The close button some tooltips carry (the Links window's, a floating pet tooltip's) as the theme's close
-- cross, left where the game put it: the Links window sizes its title against that spot.
local function skinClose(tt)
  local close = tt.CloseButton
  if type(close) == "table" and close.CreateTexture then T.CloseButton(close) end
end

-- The "comparing with equipped" label over a shopping tooltip: its art gone under a flat panel like the
-- tooltip's, its text in the theme's light colour instead of the game's gold.
local function skinCompareHeader(tt)
  local header = tt.CompareHeader
  if type(header) ~= "table" or not header.GetRegions then return end
  T.FadeRegions(header)
  T.Tooltip(header)
  if type(header.Label) == "table" and header.Label.SetTextColor then T.Color(header.Label, "text") end
end

-- The decorative edge art some tooltip styles show (their TopOverlay and BottomOverlay textures) kept
-- invisible, whenever the game shows it again or sets its atlas for the next style.
local function fadeOverlays(tt)
  local windows = ns.GetModule("Windows")
  windows.KeepFaded(tt.TopOverlay)
  windows.KeepFaded(tt.BottomOverlay)
end

-- Flat panel on one tooltip, its default art hidden (alpha only, so the client's layout is untouched).
local function skin(tt)
  if type(tt) ~= "table" or vgSkinned[tt] then return end
  vgSkinned[tt] = true
  T.Tooltip(tt)
  fadeOverlays(tt)
  skinClose(tt)
  skinCompareHeader(tt)
end

-- The unit health bar under the default tooltip: flat texture.
local function skinHealthBar()
  local bar = _G.GameTooltipStatusBar
  if type(bar) ~= "table" or not bar.SetStatusBarTexture then return end
  T.StyleBar(bar)
end

-- The theme font, scaled by Text size, on the client's tooltip fonts (those it has), kept
-- after every theme change.
function TT.ApplyFonts()
  T.FontObjects(T.FONT_OBJECTS.tooltip)
end

-- Whether the game windows' menus group is on (the Windows module enables before this one).
local function moreWanted()
  local settings = ns.GetModule("Windows").settings
  return settings ~= nil and settings.menus == true
end

-- Skins every tooltip this client has (TT.MORE_NAMES with the menus group on).
function TT.SkinAll()
  for _, name in ipairs(TT.NAMES) do skin(_G[name]) end
  if moreWanted() then
    for _, name in ipairs(TT.MORE_NAMES) do skin(_G[name]) end
  end
  skinHealthBar()
end

-- Whether a frame is one the client keeps from addons (a friendly plate in an instance); nil and non-frames count as no.
local function forbidden(f)
  return type(f) == "table" and type(f.IsForbidden) == "function" and f:IsForbidden() == true
end

-- Whether a left-hand line of the tooltip carries `label` (plain text; a secret line never counts).
local function hasLine(tt, label)
  for i = 1, tt.NumLines and tt:NumLines() or 0 do
    local line = _G[tt:GetName() .. "TextLeft" .. i]
    local text = line and line.GetText and line:GetText()
    if type(text) == "string" and not ns.IsSecret(text) and text:find(label, 1, true) then return true end
  end
  return false
end

-- Units -------------------------------------------------------------------------------------

-- The unit a tooltip shows, or nil (none, or hidden from addons).
function TT.Unit(tt)
  if not tt.GetUnit then return nil end
  local _, unit = tt:GetUnit()
  if ns.IsSecret(unit) or type(unit) ~= "string" then return nil end
  return unit
end

-- r, g, b for a unit: class color for players, grey for a creature another player tagged, reaction color otherwise.
local function unitColor(unit)
  return ns.GetModule("UnitFrames").HealthColor(unit)
end

-- The named values of the unit line being written: one table for every line, so a tooltip refresh makes none.
local slots = {}

-- text with its {key} filled with a value (a name the client gave plainly).
local function filled(text, key, value)
  slots[key] = value
  return ns.Format(text, slots)
end

-- "Target: <name>" in the target's color, when the unit has a target you can name.
local function addTarget(tt, unit)
  local target = unit .. "target"
  if not ns.IsTrue(UnitExists(target)) then return end
  local name = UnitName(target)
  if ns.IsSecret(name) or type(name) ~= "string" then return end
  tt:AddLine(filled(L["Target: {name}"], "name", name), unitColor(target))
end

-- Player lines ------------------------------------------------------------------------------

-- The roles a group gives a player, by the client's name for each, as the tooltip words them (no line without one).
TT.ROLES = { TANK = L["Tank"], HEALER = L["Healer"], DAMAGER = L["DPS"] }

-- One of the module's own facts about a player, in the quiet text color.
local function addFact(tt, text)
  tt:AddLine(text, T.RGB("text2"))
end

-- The guild line's wording: the guild with the rank or alone, or only the rank where the client's own tooltip
-- already names the guild (nil when that leaves nothing to add).
local function guildText(named, rank)
  if named then return rank and L["Guild rank: {rank}"] end
  return rank and L["Guild: {guild} ({rank})"] or L["Guild: {guild}"]
end

-- A player's guild and rank (GetGuildInfo answers for a player near you; the name and rank may be hidden).
local function addGuild(tt, unit)
  local guild, rank = ns.CallIf(_G, "GetGuildInfo", unit)
  slots.guild, slots.rank = ns.PlainText(guild), ns.PlainText(rank)
  if not slots.guild then return end
  local text = guildText(hasLine(tt, slots.guild), slots.rank)
  if text then addFact(tt, ns.Format(text, slots)) end
end

-- "Realm: <name>" for a player from another realm (UnitName's second answer; none for your own), unless a line
-- of the client's already carries the realm, as its name line does on some clients.
local function addRealm(tt, unit)
  local _, realm = UnitName(unit)
  realm = ns.PlainText(realm)
  if realm and not hasLine(tt, realm) then addFact(tt, filled(L["Realm: {realm}"], "realm", realm)) end
end

-- "Role: Tank" for a player the group has given a role.
local function addRole(tt, unit)
  local role = TT.ROLES[ns.PlainText(ns.CallIf(_G, "UnitGroupRolesAssigned", unit)) or ""]
  if role then addFact(tt, filled(L["Role: {role}"], "role", role)) end
end

-- "Item level 62" on your own tooltip: the equipped average the character pane shows, rounded down as there.
-- Another player's needs an inspect request, and WoW Forever's Inspect window opens itself again on any answer
-- for the unit it last showed, so none is asked for from here and other players get no line.
local function addItemLevel(tt, unit)
  if not ns.IsTrue(UnitIsUnit(unit, "player")) then return end
  local level = ns.PlainNumber((select(2, ns.CallIf(_G, "GetAverageItemLevel"))))
  if level and level >= 1 then addFact(tt, filled(L["Item level {level}"], "level", math.floor(level))) end
end

-- The module's lines about a player, as switched on: guild and rank, realm, role, then your own item level. Other
-- units get none.
local function addPlayerLines(tt, unit)
  local on = TT.settings
  if not ns.IsTrue(UnitIsPlayer(unit)) then return end
  if on.guild then addGuild(tt, unit) end
  if on.realm then addRealm(tt, unit) end
  if on.role then addRole(tt, unit) end
  if on.itemLevel then addItemLevel(tt, unit) end
end

-- The unit color handed to the theme as the border's: one table, filled again on every refresh. Only the default
-- tooltip is decorated, so nothing else holds it, and the theme reads it at each repaint.
local borderColor = {}

-- The tooltip's border in a unit's color, with no table made per refresh.
local function setUnitBorder(tt, r, g, b)
  borderColor[1], borderColor[2], borderColor[3] = r, g, b
  T.SetBorder(tt, borderColor)
end

-- Colors the name line and border, and adds the player lines and the target line.
local function decorate(tt, unit)
  local r, g, b = unitColor(unit)
  local first = _G[tt:GetName() .. "TextLeft1"]
  if first then first:SetTextColor(r, g, b) end
  if TT.settings.classBorder then setUnitBorder(tt, r, g, b) end
  addPlayerLines(tt, unit)
  if TT.settings.targetLine then addTarget(tt, unit) end
end

-- Before the client fills a unit tooltip: in a fight with Hide in combat on, hides it and stops the fill (true).
-- The client shows a tooltip again after its post-calls, so only a hide before the fill holds.
function TT.BeforeUnit(tt)
  if tt ~= _G.GameTooltip or not (TT.settings.hideInCombat and ns.InCombat()) then return false end
  tt:Hide()
  return true
end

-- A unit tooltip was filled in: decorate it, or hide it in combat if asked (the old script path; the data
-- API's fill is stopped before this by TT.BeforeUnit).
function TT.OnUnit(tt)
  if tt ~= _G.GameTooltip then return end
  local unit = TT.Unit(tt)
  if not unit then return T.SetBorder(tt, nil) end
  if TT.settings.hideInCombat and ns.InCombat() then return tt:Hide() end
  decorate(tt, unit)
end

-- Any tooltip hid: its border goes back to the theme's.
local function onHide(tt)
  T.SetBorder(tt, nil)
end

-- Sell price --------------------------------------------------------------------------------

-- What one of an item sells for (copper), or nil: not cached yet, no value, or hidden.
function TT.SellPrice(link)
  local info = C_Item and C_Item.GetItemInfo
  if type(info) ~= "function" or type(link) ~= "string" then return nil end
  local price = ns.PlainNumber((select(11, info(link))))
  if price and price > 0 then return price end
end

-- How many the item button under the tooltip holds (1 when it can't say); auction prices use
-- it for their stack line too.
function TT.StackOf(tt)
  local owner = tt.GetOwner and tt:GetOwner()
  local count = type(owner) == "table" and ns.PlainNumber(owner.count)
  return count and count > 1 and count or 1
end

-- Whether the client's own "Sell Price" is already on the tooltip: a money frame is up, or a line carries the
-- game's label, SELL_PRICE (Forever's GameTooltip writes its price as a plain text line, no money frame).
function TT.ShowsPrice(tt)
  if (tonumber(tt.shownMoneyFrames) or 0) > 0 then return true end
  local label = _G.SELL_PRICE
  return type(label) == "string" and tt.GetName ~= nil and tt:GetName() ~= nil and hasLine(tt, label)
end

-- What the stack sells for, unless the client already shows a price.
local function addPrice(tt, link)
  local price = not TT.ShowsPrice(tt) and TT.SellPrice(link)
  if not price then return end
  local r, g, b = T.RGB("text2")
  tt:AddDoubleLine(L["Sells for"], ns.GetModule("InfoStrip").Money(price * TT.StackOf(tt)), r, g, b, T.RGB("gold"))
end

-- How many you have (in your bags and bank), or nil when none or the client can't say.
function TT.Owned(link)
  local count = C_Item and C_Item.GetItemCount
  if type(count) ~= "function" then return nil end
  local bags, all = ns.PlainNumber(count(link)), ns.PlainNumber(count(link, true))
  if all and all > 0 then return bags or all, all end
end

-- "You have 12" (and how many of those are in the bank).
local function addCount(tt, link)
  local bags, all = TT.Owned(link)
  if not all then return end
  local text = ns.Format(L["You have {count}"], { count = all })
  if all > bags then text = ns.Format(L["You have {count} ({bank} in the bank)"], { count = all, bank = all - bags }) end
  tt:AddLine(text, T.RGB("text2"))
end

-- The item's ID, for players who look items up.
local function addID(tt, link)
  local id = link:match("item:(%d+)")
  if id then tt:AddLine(ns.Format(L["Item ID {id}"], { id = id }), T.RGB("text2")) end
end

-- Other modules' item lines, each fn(tt, link), run in the order added after the tooltip's own.
TT.itemLines = {}

-- Adds fn(tt, link) to every item tooltip, after Vanguard's own lines: the shared
-- extension point (Vendor memory's "Sold by", auction prices). link is a plain item link.
-- It works with the Tooltips module off too: the first line added installs the item hook.
function TT.AddItemLines(fn)
  TT.itemLines[#TT.itemLines + 1] = fn
  TT.HookItems()
end

-- The module's own item lines (sell price, count, ID), as switched on; none while the module is off.
local function ownItemLines(tt, link)
  local on = TT.settings
  if not on then return end
  if on.sellPrice then addPrice(tt, link) end
  if on.itemCount then addCount(tt, link) end
  if on.ids then addID(tt, link) end
end

-- An item tooltip was filled in: add the switched-on lines, then other modules' (one
-- that fails is reported and doesn't stop the rest).
function TT.OnItem(tt)
  if forbidden(tt) or not tt.GetItem then return end
  local _, link = tt:GetItem()
  if ns.IsSecret(link) or type(link) ~= "string" then return end
  ownItemLines(tt, link)
  for _, fn in ipairs(TT.itemLines) do ns.Try("tooltip lines", fn, tt, link) end
end

-- Spell and aura IDs ------------------------------------------------------------------------

-- "Spell ID 133" under a spell's tooltip and an aura's (an aura's ID is its spell's), with IDs switched on. The ID
-- is the one in the client's tooltip data; a hidden one adds nothing, and a tooltip kept from addons is left alone.
function TT.OnSpell(tt, data)
  if not TT.settings.ids or forbidden(tt) then return end
  local plain = ns.PlainTable(data)
  local id = plain and ns.PlainNumber(plain.id)
  if id then tt:AddLine(filled(L["Spell ID {id}"], "id", id), T.RGB("text2")) end
end

-- Hooks ------------------------------------------------------------------------------------

-- Calls fn(tooltip, data) after the client fills a tooltip of one kind through its tooltip data API; true when it
-- has that API and that kind.
local function hookData(kind, fn)
  local processor, kinds = _G.TooltipDataProcessor, _G.Enum and _G.Enum.TooltipDataType
  if type(processor) ~= "table" or not processor.AddTooltipPostCall or not (kinds and kinds[kind]) then return false end
  processor.AddTooltipPostCall(kinds[kind], ns.Guard("tooltip " .. kind, fn))
  return true
end

-- Calls fn after the client fills a tooltip of one kind (new data API, else the old script).
local function hookFilled(kind, script, fn)
  if hookData(kind, fn) then return end
  local tt = _G.GameTooltip
  if tt and tt.HasScript and tt:HasScript(script) then tt:HookScript(script, ns.Guard("tooltip " .. kind, fn)) end
end

-- Calls fn before the client fills a tooltip of one kind, where the client has the data API; fn's true stops the fill.
local function hookBefore(kind, fn)
  local processor, kinds = _G.TooltipDataProcessor, _G.Enum and _G.Enum.TooltipDataType
  if type(processor) == "table" and processor.AddTooltipPreCall and kinds and kinds[kind] then
    processor.AddTooltipPreCall(kinds[kind], ns.GuardResult("tooltip " .. kind .. " before", fn, false))
  end
end

-- Whether the item tooltip hook is in place: it is made once, by the first item line added
-- (other modules') or by Enable, whichever comes first, and does not depend on this module being on.
local itemsHooked = false

-- Hooks item tooltips once (the module's own lines when it is on, and every module's added lines).
function TT.HookItems()
  if itemsHooked then return end
  itemsHooked = true
  hookFilled("Item", "OnTooltipSetItem", TT.OnItem)
end

-- Decorates unit tooltips and adds the module's lines to item, spell and aura tooltips as the client fills them
-- (spell and aura IDs only where the client has the tooltip data API, as the 12.1 client does).
local function hookTooltips()
  hookBefore("Unit", TT.BeforeUnit)
  hookFilled("Unit", "OnTooltipSetUnit", TT.OnUnit)
  hookData("Spell", TT.OnSpell)
  hookData("UnitAura", TT.OnSpell)
  TT.HookItems()
end

-- Anchoring --------------------------------------------------------------------------------

-- Whether the tooltip's anchors can't be changed now: it or its owner is forbidden, or the client restricts its
-- anchoring while a forbidden frame (a buff on a friendly plate in an instance) owns it. Touching it then is
-- the "forbidden object" error, caught by ns.Guard but lighting the error badge on every hover.
local function anchorRestricted(tt, parent)
  if forbidden(tt) or forbidden(parent) then return true end
  return type(tt.IsAnchoringRestricted) == "function" and tt:IsAnchoringRestricted() == true
end

-- Whether the frame a tooltip is owned to shows a unit of its own: Vanguard's unit frames and the game's keep the
-- unit's token in their unit field (a hidden one doesn't count).
local function showsUnit(parent)
  return ns.PlainText(type(parent) == "table" and parent.unit) ~= nil
end

-- Which position setting a tooltip given the default anchor follows: unitAnchor for a unit under the mouse in the
-- world (the client owns that tooltip to UIParent), frameAnchor for a unit on a frame, anchor for everything else
-- (a spell on a bar, a mailbox). The tooltip is not filled yet, so the mouse and the owner are what say.
local function anchorSetting(parent)
  local inWorld = parent == _G.UIParent
  local onUnit = ns.IsTrue(UnitExists("mouseover")) or (not inWorld and showsUnit(parent))
  if not onUnit then return "anchor" end
  return inWorld and "unitAnchor" or "frameAnchor"
end

-- Moves a tooltip given the default anchor, as its kind is set: to the corner frame, the cursor, or left alone (as
-- it is when the client restricts its anchoring).
function TT.Anchor(tt, parent)
  if anchorRestricted(tt, parent) then return end
  local where = TT.settings[anchorSetting(parent)]
  if where == "cursor" then return tt:SetOwner(parent, "ANCHOR_CURSOR") end
  if where ~= "corner" then return end
  tt:SetOwner(parent, "ANCHOR_NONE")
  tt:ClearAllPoints()
  tt:SetPoint("BOTTOMRIGHT", TT.corner, "BOTTOMRIGHT")
end

-- The movable corner frame the tooltip sits in (unlock mode shows it).
local function buildCorner()
  TT.corner = CreateFrame("Frame", "Vanguard_TooltipAnchor", UIParent)
  TT.corner:SetSize(180, 56)
  ns.Mover(TT.corner, "tooltip", L["Tooltip"], { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 200 })
end

-- Module entry point (Core/Modules.lua).
function TT.Enable(settings)
  TT.settings = settings
  buildCorner()
  TT.SkinAll()
  TT.ApplyFonts()
  hookTooltips()
  if _G.GameTooltip then _G.GameTooltip:HookScript("OnHide", ns.Guard("hide tooltip", onHide)) end
  if type(hooksecurefunc) == "function" and type(_G.GameTooltip_SetDefaultAnchor) == "function" then
    hooksecurefunc("GameTooltip_SetDefaultAnchor", ns.Guard("hook GameTooltip_SetDefaultAnchor", TT.Anchor))
  end
end
