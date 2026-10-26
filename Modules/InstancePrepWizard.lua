-- Instance prep, the wanted-amounts window: three steps (supplies, your class's
-- supply, a review) for how many food, bandages, potions, ammo (hunters) and soul
-- shards (warlocks) to carry. Use suggested fills amounts for your level. Changes
-- apply as the sliders move, like the options page; /vg prep want <kind> <n> sets
-- the same numbers. Opened from /vg > Town and gear > Instance prep and by
-- /vg prep setup. Never reads a count the client hides.

local ADDON, ns = ...

local L = ns.L

local T, W = ns.Theme, ns.Widgets

local PR = ns.GetModule("InstancePrep")
local WZ = {}
PR.Wizard = WZ

WZ.WIDTH, WZ.HEIGHT, WZ.PAD, WZ.ROW = 400, 300, T.SPACE.pad, T.ROW.height
-- Where the sliders (and the review text) start, down from the top: the head of a dialog and the step caption's line.
local CAPTION_H = 16
WZ.TOP = ns.DIALOG.head + CAPTION_H
-- Each amount's label and slider range: { label, min, max, step }.
WZ.AMOUNTS = {
  food = { L["Food & drink"], 0, 100, 5 }, bandages = { L["Bandages"], 0, 60, 5 }, potions = { L["Potions"], 0, 20, 1 },
  ammo = { L["Ammo"], 0, 2000, 100 }, shards = { L["Soul shards"], 0, 30, 1 },
}
-- The amounts on each page (the class page depends on your class: WZ.ClassKeys).
WZ.SUPPLIES = { "food", "bandages", "potions" }
-- What Use suggested sets, for a level under 20, under 40 and 40 and over.
WZ.SUGGESTED = {
  food = { 10, 20, 30 }, bandages = { 5, 10, 20 }, potions = { 1, 3, 5 }, ammo = { 200, 400, 1000 }, shards = { 5, 10, 15 },
}

-- The amounts for your class's own supply: ammo for hunters, soul shards for warlocks, else none.
function WZ.ClassKeys()
  return PR.CLASS_KEYS[PR.You()] or {}
end

-- The pages in order: supplies, class (only when your class has a supply), review.
function WZ.Pages()
  local pages = { "supplies" }
  if #WZ.ClassKeys() > 0 then pages[#pages + 1] = "class" end
  pages[#pages + 1] = "review"
  return pages
end

-- The suggested amount of one kind at a level: three tiers (under 20, under 40, 40 and over).
function WZ.Suggest(key, level)
  local tier = level < 20 and 1 or level < 40 and 2 or 3
  return WZ.SUGGESTED[key][tier]
end

-- Sets every amount to the suggestion for your level (the ones your class doesn't use stay as they are).
function WZ.UseSuggested()
  local _, level = PR.You()
  for _, page in ipairs({ "supplies", "class" }) do
    for _, k in ipairs(WZ.Keys(page)) do PR.settings.want[k] = WZ.Suggest(k, level) end
  end
  WZ.Refresh()
end

-- The amounts on the page: the supplies, the class's own, or none (the review).
function WZ.Keys(page)
  if page == "supplies" then return WZ.SUPPLIES end
  return page == "class" and WZ.ClassKeys() or {}
end

-- One review line per amount on the supplies and class pages.
local function amountLines(lines)
  for _, page in ipairs({ "supplies", "class" }) do
    for _, k in ipairs(WZ.Keys(page)) do lines[#lines + 1] = string.format("  %s: %d", WZ.AMOUNTS[k][1], PR.settings.want[k]) end
  end
end

-- The review text: what you'll carry, and what is short right now (in the card's words).
function WZ.ReviewText()
  local lines = { L["You'll be told when you carry fewer than:"] }
  amountLines(lines)
  local _, short = PR.LowSupplies()
  lines[#lines + 1] = #short > 0 and ns.Format(L["Short right now: {count} (/vg prep shows them)."], { count = #short }) or L["Nothing is short right now."]
  lines[#lines + 1] = L["Keep-stocked items are changed with /vg stock; class reagents follow your level."]
  return table.concat(lines, "\n")
end

-- Shows only the sliders for the page's amounts, stacked from the top.
function WZ.Place(page)
  local keys = WZ.Keys(page)
  for _, s in pairs(WZ.frame.sliders) do s:Hide() end
  for i, k in ipairs(keys) do
    local s = WZ.frame.sliders[k]
    s:ClearAllPoints()
    s:SetPoint("TOPLEFT", WZ.PAD, -WZ.TOP - (i - 1) * WZ.ROW)
    s:Show()
  end
end

-- Shows the page: its sliders or the review text, with the buttons that fit it.
function WZ.Show(n)
  local f, page = WZ.frame, WZ.pages[n]
  WZ.step = n
  WZ.Place(page)
  f.review:SetShown(page == "review")
  f.suggest:SetShown(n == 1)
  f.back:SetShown(n > 1)
  f.next.text:SetText(n == #WZ.pages and L["Done"] or L["Next"])
  WZ.Refresh()
end

-- Repaints the sliders and the review text, and the step caption.
function WZ.Refresh()
  local f = WZ.frame
  for _, s in pairs(f.sliders) do s:Refresh() end
  f.review:SetText(WZ.ReviewText())
  f.caption:SetText(ns.Format(L["Step {step} of {count}"], { step = WZ.step, count = #WZ.pages }))
end

-- One slider for an amount: moves PR.settings.want[key] as it is dragged.
local function amountSlider(f, key)
  local a = WZ.AMOUNTS[key]
  local opts = { min = a[2], max = a[3], step = a[4] }
  local s = W.Slider(f, a[1], opts, function() return PR.settings.want[key] end, function(v) PR.settings.want[key] = v end, WZ.WIDTH - 2 * WZ.PAD)
  s:Hide()
  f.sliders[key] = s
end

-- The footer: Use suggested (first page), Back and Next or Done (the window applies as you go, so it ends in Done).
local function footer(f)
  f.suggest = W.Button(f, L["Use suggested"], WZ.UseSuggested)
  f.suggest:SetPoint("BOTTOMLEFT", WZ.PAD, WZ.PAD)
  f.next = W.Primary(f, L["Next"], function() WZ.Next() end)
  f.next:SetPoint("BOTTOMRIGHT", -WZ.PAD, WZ.PAD)
  f.back = W.Button(f, L["Back"], function() WZ.Show(WZ.step - 1) end)
  f.back:SetPoint("RIGHT", f.next, "LEFT", -T.SPACE.gap, 0)
end

-- The title, the step caption (a note) and the review text; the window's close button comes with ns.Dialog.
local function labels(f)
  f.title:SetText(L["Instance prep: wanted amounts"])
  f.caption = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.caption:SetPoint("TOPLEFT", WZ.PAD, -ns.DIALOG.head)
  f.review = T.Text(f:CreateFontString(nil, "OVERLAY"), "label")
  f.review:SetPoint("TOPLEFT", WZ.PAD, -WZ.TOP)
  f.review:SetWidth(WZ.WIDTH - 2 * WZ.PAD)
  f.review:SetJustifyH("LEFT")
end

-- Next: the following page; on the last one it is Done and closes the window.
function WZ.Next()
  if WZ.step >= #WZ.pages then return WZ.frame:Hide() end
  WZ.Show(WZ.step + 1)
end

-- Builds the window once: a dialog (its X and Escape close it) with a slider per amount.
local function build()
  local f = ns.Dialog("Vanguard_PrepWizard", WZ.WIDTH, WZ.HEIGHT)
  f.sliders = {}
  labels(f)
  for key in pairs(WZ.AMOUNTS) do amountSlider(f, key) end
  footer(f)
  return f
end

-- Opens the window on its first page (Instance prep must be on; out of combat only, since it has no use in a fight).
function WZ.Open()
  if not PR.settings then return ns.Chat(L["Instance prep is off (/vg > Modules)."]) end
  if ns.InCombat() then return ns.OutOfCombat(WZ.Open, "prep wizard") end
  WZ.frame = WZ.frame or build()
  WZ.pages = WZ.Pages()
  WZ.Show(1)
  WZ.frame:Show()
end
