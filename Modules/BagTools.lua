-- Bag tools (part of the Bags module): two buttons on the combined bag's search row, between the search
-- box and Sort. Filter fills the search box with a ready-made search (a quality, a binding, a kind of item,
-- one of your groups); Groups makes groups, puts the item on your cursor in one or takes it out again, sends
-- one to the bank, moves it first or deletes it. Everything they do is what /vg bag does; they are the way in, the command the extra.

local ADDON, ns = ...
local L = ns.L

local T, W = ns.Theme, ns.Widgets
local BG = ns.GetModule("Bags")

-- The space between buttons, how wide their menus are (room for a whole line), and the room a button's
-- label has besides its text: the text's inset, its gap to the arrow, the arrow and its inset, and a little slack.
local GAP, MENU_W, CHROME = 6, 210, 34

-- The ready-made searches: { search text, label }.
local SEARCHES = {
  { "", L["Show everything"] }, { "q>=3", L["Rare or better"] }, { "q>=4", L["Epic or better"] },
  { "bind:boe", L["Bind on equip"] }, { "type:armor", L["Armor"] }, { "type:weapon", L["Weapons"] },
}

-- The Filter menu: the ready-made searches, then one per group of yours.
local function filterChoices()
  local out = {}
  for _, s in ipairs(SEARCHES) do out[#out + 1] = s end
  for _, section in ipairs(BG.CategorySections()) do
    out[#out + 1] = { "cat:" .. ns.Lower(section.label), ns.Format(L["Group: {name}"], { name = section.label }) }
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

-- What can be done with one group of yours, added to the Groups menu.
local function addGroupRows(out, name)
  out[#out + 1] = { "add:" .. name, ns.Format(L["Put held item in {name}"], { name = name }) }
  out[#out + 1] = { "deposit:" .. name, ns.Format(L["Send {name} to the bank"], { name = name }) }
  out[#out + 1] = { "top:" .. name, ns.Format(L["Make {name} first"], { name = name }) }
  out[#out + 1] = { "delete:" .. name, ns.Format(L["Delete {name}"], { name = name }) }
end

-- The Groups menu: a new group, then for each group of yours what can be done with it, and (with any
-- group) taking the held item out of its group.
local function groupChoices()
  local out = { { "new:", L["New group..."] } }
  local sections = BG.CategorySections()
  for _, section in ipairs(sections) do addGroupRows(out, section.label) end
  if #sections > 0 then out[#out + 1] = { "remove:", L["Take held item out of its group"] } end
  return out
end

-- Does what a Groups menu row says.
local function groupAct(value)
  local verb, name = value:match("^(%a+):(.*)$")
  if verb == "new" then return ns.AskText(L["New group name"], BG.NewGroup, L["Create"]) end
  if verb == "add" then return BG.AddHeld(name) end
  if verb == "remove" then return BG.RemoveHeld() end
  BG.GroupAction(verb, name)
end

-- A tool button as wide as its label at full size (T.FullWidth: not what a shrunk or bounded string reads) and the
-- button's chrome.
local function sizeTool(d)
  d:SetWidth(math.ceil(T.FullWidth(d.text)) + CHROME)
  T.Refit(d.text)
end

-- A tool button: a dropdown that always reads its own label, not the choice made.
local function toolButton(frame, label, choices, act)
  local d = W.Dropdown(frame, choices, function() return nil end, act)
  d.menuWidth = MENU_W
  d:SetHeight(T.CONTROL_H)
  -- Shows the button's label, whatever was picked last.
  d.Refresh = function(self) self.text:SetText(label) end
  d:Refresh()
  sizeTool(d)
  return d
end

-- Sizes Filter, Groups and Sort to their labels again and fits the search box to the room they leave: the labels
-- change size with the Text size setting, which T.Refresh re-fonts but never re-widens.
function BG.ResizeTools(frame)
  local tools = BG.tools
  if not tools then return end
  sizeTool(tools.filter)
  sizeTool(tools.groups)
  ns.WidenToLabel(BG.sort)
  BG.FitSearch(frame)
end

-- How much of the search row the two buttons take (zero before they exist).
function BG.ToolsWidth()
  local tools = BG.tools
  return tools and tools.filter:GetWidth() + tools.groups:GetWidth() + 2 * GAP or 0
end

-- Adds Filter and Groups between the search box and Sort, which moves right of them.
function BG.AddTools(frame)
  local box = _G.BagItemSearchBox
  if BG.tools or type(box) ~= "table" or not BG.sort then return end
  local filter = toolButton(frame, L["Filter"], filterChoices, search)
  local groups = toolButton(frame, L["Groups"], groupChoices, groupAct)
  filter:SetPoint("LEFT", box, "RIGHT", GAP, 0)
  groups:SetPoint("LEFT", filter, "RIGHT", GAP, 0)
  BG.sort:ClearAllPoints()
  BG.sort:SetPoint("LEFT", groups, "RIGHT", GAP, 0)
  BG.tools = { filter = filter, groups = groups }
end
