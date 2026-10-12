-- Game windows, pvp group: Battleground scoreboards, queue dialogs, objective widgets and the match timer, in the
-- Vanguard look. Filled by stream S8 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.
--
-- Frame names, parentKeys and templates are read from Blizzard's Forever source (Blizzard_PVPMatch,
-- Blizzard_LFGUtil's Mainline PVPHelper and PvpPopup, Blizzard_UIWidgets, Blizzard_FrameXML's Timer,
-- Blizzard_UIPanels_Game's PVPBanner and Camelot PVPRankFrame). Every part is optional: a client without one
-- skips it.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers ---------------------------------------------------------------------------------------

-- Frames whose game methods or scripts are already hooked here (a skin runs on every show; a hook goes on once).
local hooked = setmetatable({}, { __mode = "k" })

-- Runs fn(frame) after the frame's game method `name` each time it runs (with script set, after its script
-- handler of that name), once per frame and name; a frame without the method is skipped.
local function after(frame, name, fn, script)
  hooked[frame] = hooked[frame] or {}
  if hooked[frame][name] then return end
  if not script and (type(frame[name]) ~= "function" or type(hooksecurefunc) ~= "function") then return end
  hooked[frame][name] = true
  -- Runs fn on the frame.
  local function run() fn(frame) end
  if script then return frame:HookScript(name, ns.Guard("hook " .. name, run)) end
  hooksecurefunc(frame, name, ns.Guard("hook " .. name, run))
end

-- The first part of frame found under one of keys, or nil.
local function partOf(frame, keys)
  for _, key in ipairs(keys) do
    if type(frame[key]) == "table" then return frame[key] end
  end
end

-- Themes the push buttons a frame keeps under those keys.
local function dressKeys(frame, keys)
  for _, key in ipairs(keys) do
    local button = frame[key]
    if type(button) == "table" and button.CreateTexture then T.Button(button) end
  end
end

-- Scoreboards -----------------------------------------------------------------------------------

-- Where the scoreboard (Content) and the match results (content) keep the table, and its tab strip.
GW.PVP_CONTENT = { "Content", "content" }
GW.PVP_TAB_STRIP = { "TabContainer", "tabContainer" }
-- The match results' push buttons (Queue again, Leave), which its OnLoad keeps on the window.
GW.PVP_PUSH = { "requeueButton", "leaveButton" }
-- The light the results play over their reward band when rewards come in: kept, it is an animation.
GW.PVP_BURST = { "OrangeGlow", "OrangeSmoke" }

-- The table's frame: its backdrop and inset border faded, a flat inset panel behind the rows (the rows, their
-- column headers and the team colour wash over them stay the game's), the edge lines of its tab strip faded.
local function skinTable(content)
  T.FadeRegions(content)
  T.Panel(content, { inset = true, noSheen = true })
  local strip = partOf(content, GW.PVP_TAB_STRIP)
  if strip and strip.GetRegions then T.FadeRegions(strip) end
end

-- The results' reward band: its backdrop and shadow faded, the burst of light the game plays over it kept.
local function skinEarnings(content)
  local band = content.earningsArt
  if type(band) ~= "table" or not band.GetRegions then return end
  local keep = {}
  for _, key in ipairs(GW.PVP_BURST) do
    if type(band[key]) == "table" then keep[band[key]] = true end
  end
  T.FadeRegions(band, keep)
end

-- The scoreboard and the match results: the window skin hugging the frame (the room its border art had is
-- inside the frame), the table, the reward band, the scroll bar and the push buttons; again after the game
-- lays the match's faction border on the frame (SetupArtwork). The tabs are dressed by WindowsTabs.lua.
function GW.SkinPvPMatch(frame)
  GW.Skin(frame, 0)
  local content = partOf(frame, GW.PVP_CONTENT)
  if content then skinTable(content) skinEarnings(content) end
  local bar = frame.ScrollBar or frame.scrollBar
  if type(bar) == "table" then T.ScrollBar(bar) end
  dressKeys(frame, GW.PVP_PUSH)
  after(frame, "SetupArtwork", GW.SkinPvPMatch)
end

-- Blizzard_PVPMatch loads at login on Forever (LoadOnDemand 0); registered on demand as well, so a client
-- that loads it later is covered too.
GW.Add("pvp", "onDemand", "Blizzard_PVPMatch", { "PVPMatchScoreboard", "PVPMatchResults" }, GW.SkinPvPMatch)
