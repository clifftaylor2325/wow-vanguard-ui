-- Bag tools (part of the Bags module): two buttons on the combined bag's search row, between the search
-- box and Sort. Filter fills the search box with a ready-made search (a quality, a binding, a kind of item,
-- one of your groups); Groups makes groups, puts the item on your cursor in one, sends one to the bank,
-- moves it first or deletes it. Everything they do is what /vg bag does; they are the way in, the command the extra.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets
local BG = ns.GetModule("Bags")

-- A tool button's width, the space between buttons, and how wide their menus are (room for a whole line).
local TOOL_W, GAP, MENU_W = 58, 6, 210

-- The ready-made searches: { search text, label }.
local SEARCHES = {
  { "", "Show everything" }, { "q>=3", "Rare or better" }, { "q>=4", "Epic or better" },
  { "bind:boe", "Bind on equip" }, { "type:armor", "Armor" }, { "type:weapon", "Weapons" },
}

-- The Filter menu: the ready-made searches, then one per group of yours.
local function filterChoices()
  local out = {}
  for _, s in ipairs(SEARCHES) do out[#out + 1] = s end
  for _, section in ipairs(BG.CategorySections()) do
    out[#out + 1] = { "cat:" .. section.label:lower(), "Group: " .. section.label }
  end
  return out
end

-- Puts a search in the box and has the bag refresh what it lights.
local function search(text)
  local box = _G.BagItemSearchBox
  if type(box) ~= "table" then return end
  box:SetText(text)
  local frame = BG.sectionFrame or _G.ContainerFrameCombinedBags
  if frame and type(frame.UpdateSearchResults) == "function" then frame:UpdateSearchResults() end
end

-- The Groups menu: a new group, then for each group of yours what can be done with it.
local function groupChoices()
  local out = { { "new:", "New group..." } }
  for _, section in ipairs(BG.CategorySections()) do
    local name = section.label
    out[#out + 1] = { "add:" .. name, "Put held item in " .. name }
    out[#out + 1] = { "deposit:" .. name, "Send " .. name .. " to the bank" }
    out[#out + 1] = { "top:" .. name, "Make " .. name .. " first" }
    out[#out + 1] = { "delete:" .. name, "Delete " .. name }
  end
  return out
end

-- Does what a Groups menu row says.
local function groupAct(value)
  local verb, name = value:match("^(%a+):(.*)$")
  if verb == "new" then return ns.AskText("New group name", BG.NewGroup, "Create") end
  if verb == "add" then return BG.AddHeld(name) end
  BG.GroupAction(verb, name)
end

-- A tool button: a dropdown that always reads its own label, not the choice made.
local function toolButton(frame, label, choices, act)
  local d = W.Dropdown(frame, choices, function() return nil end, act, TOOL_W)
  d.menuWidth = MENU_W
  d:SetHeight(T.CONTROL_H)
  -- Shows the button's label, whatever was picked last.
  d.Refresh = function(self) self.text:SetText(label) end
  d:Refresh()
  return d
end

-- How much of the search row the two buttons take (zero before they exist).
function BG.ToolsWidth()
  return BG.tools and 2 * (TOOL_W + GAP) or 0
end

-- Adds Filter and Groups between the search box and Sort, which moves right of them.
function BG.AddTools(frame)
  local box = _G.BagItemSearchBox
  if BG.tools or type(box) ~= "table" or not BG.sort then return end
  local filter = toolButton(frame, "Filter", filterChoices, search)
  local groups = toolButton(frame, "Groups", groupChoices, groupAct)
  filter:SetPoint("LEFT", box, "RIGHT", GAP, 0)
  groups:SetPoint("LEFT", filter, "RIGHT", GAP, 0)
  BG.sort:ClearAllPoints()
  BG.sort:SetPoint("LEFT", groups, "RIGHT", GAP, 0)
  BG.tools = { filter = filter, groups = groups }
end
