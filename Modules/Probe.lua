-- The in-game probe batch behind `/vg probe`: one run, out of combat, that asks the client the
-- questions the research left open and writes the answers to a copy box and to SavedVariables
-- (VanguardDB.probe), so one paste settles them. It changes nothing: no setting, no frame the
-- player sees, no state of the game (a state driver on one hidden frame is made and removed).
--
-- Rules: a name is read through _G, never called when absent, and called once, in a pcall. A
-- secret prints "hidden" and is never compared, formatted or concatenated. `/vg probe fight`
-- takes the same secrecy and restriction reads once in the next fight; the lines are printed
-- after it, not during.

local ADDON, ns = ...

local P = {}
ns.Probe = P

-- The spell the spell predicates are asked about; the answer is about the spell kind, not this one.
P.SPELL = 1459

-- The C_Secrets predicates and what each is asked about: units, a spell, a slot or a plain 1.
P.SECRETS = {
  { "CanCompareUnitTokens", "player", "target" }, { "GetPowerTypeSecrecy", 0 },
  { "GetSpellAuraSecrecy", P.SPELL }, { "GetSpellCastSecrecy", P.SPELL },
  { "GetSpellCooldownSecrecy", P.SPELL }, { "HasSecretRestrictions" },
  { "ShouldActionCooldownBeSecret", 1 }, { "ShouldAurasBeSecret" }, { "ShouldCooldownsBeSecret" },
  { "ShouldSpellAuraBeSecret", P.SPELL }, { "ShouldSpellBookItemCooldownBeSecret", 1, 0 },
  { "ShouldSpellCooldownBeSecret", P.SPELL }, { "ShouldTotemSlotBeSecret", 1 },
  { "ShouldTotemSpellBeSecret", P.SPELL }, { "ShouldUnitAuraIndexBeSecret", "player", 1 },
  { "ShouldUnitAuraInstanceBeSecret", "player", 1 }, { "ShouldUnitAuraSlotBeSecret", "player", 1 },
  { "ShouldUnitComparisonBeSecret", "player", "target" }, { "ShouldUnitHealthMaxBeSecret", "player" },
  { "ShouldUnitIdentityBeSecret", "player" }, { "ShouldUnitPowerBeSecret", "player" },
  { "ShouldUnitPowerMaxBeSecret", "player" }, { "ShouldUnitSpellCastBeSecret", "player", P.SPELL },
  { "ShouldUnitSpellCastingBeSecret", "player" }, { "ShouldUnitStatsBeSecret", "player" },
  { "ShouldUnitThreatStateBeSecret", "player", "target" },
  { "ShouldUnitThreatValuesBeSecret", "player", "target" },
}

-- Reads called as they are: { section, label, name, arguments... }. The group listing and the
-- rest of the interface come first; "have" names are only looked for, never called.
P.CALLS = {
  group = {
    { "C_LFGInfo.CanPlayerUseLFD" }, { "C_LFGInfo.CanPlayerUseLFR" },
    { "C_LFGInfo.CanPlayerUseGroupFinder" }, { "C_LFGInfo.CanPlayerUsePremadeGroup" },
    { "C_LFGInfo.IsGroupFinderEnabled" }, { "C_LFGInfo.IsLFDEnabled" }, { "C_LFGInfo.IsLFREnabled" },
    { "C_PartyInfo.IsRaidListEnabled" }, { "C_PartyInfo.IsRaidListSupported" },
    { "C_LFGList.GetAvailableCategories" }, { "C_LFGList.HasActiveEntryInfo" },
    { "C_LFGList.GetSearchResults" },
  },
  navigation = {
    { "C_Navigation.GetDistance" }, { "C_Navigation.GetTargetState" },
    { "C_Navigation.HasValidScreenPosition" }, { "C_Navigation.WasClampedToScreen" },
    { "C_Navigation.GetFrame" }, { "C_Navigation.GetNearestPartyMemberToken" },
    { "C_SuperTrack.GetSuperTrackedQuestID" }, { "C_SuperTrack.IsSuperTrackingAnything" },
  },
  rules = {
    { "C_GameRules.IsHardcoreActive" }, { "C_GameRules.IsStandard" },
    { "C_GameRules.IsSelfFoundAllowed" }, { "C_GameRules.GetActiveGameMode" },
    { "C_GameRules.GetForeverExperiencePreset" },
    { "C_Seasons.HasActiveSeason" }, { "C_Seasons.GetActiveSeason" },
  },
  -- The CVar Safer colours follows (Core/Theme.lua); a wrong name here means the follow switch does nothing.
  access = { { "GetCVar", "colorblindMode" }, { "GetCVar", "colorblindSimulator" } },
  undocumented = {
    { "C_LootHistory.GetNumItems" }, { "C_LootHistory.GetItem", 1 },
    { "C_LootHistory.GetPlayerInfo", 1, 1 }, { "C_LootHistory.GetAllEncounterInfos" },
    { "C_LootHistory.GetLootHistoryTime" },
    { "C_TradeSkillUI.GetAllRecipeIDs" }, { "C_TradeSkillUI.GetRecipeCooldown", 1 },
    { "C_DamageMeter.IsDamageMeterAvailable" },
  },
}

-- Names only looked for, per section.
P.HAVE = {
  group = { "C_LFGList.Search", "C_LFGList.GetSearchResultInfo", "C_LFGList.GetAvailableActivities", "C_LFGList.CreateListing" },
  undocumented = { "SetItemSearch", "C_Container.SetItemSearch", "ContainerFrameCombinedBags.UpdateSearchResults", "C_Item.GetDetailedItemLevelInfo", "C_SuperTrack.GetNextWaypointForMap", "C_Navigation.GetNextWaypointForMap" },
}

-- The widget methods looked for: { kind of widget, method }.
P.METHODS = { { "Cooldown", "SetCountdownFormatter" }, { "Frame", "SetOnUpdateMode" }, { "FontString", "SetTextToFit" } }

-- Text -------------------------------------------------------------------------------------

-- The wall clock in seconds, or 0 on a client without it.
local function now()
  return type(time) == "function" and ns.PlainNumber(time()) or 0
end

-- A short error text.
local function errText(v)
  return type(v) == "string" and v:sub(1, 80) or "?"
end

-- A value as report text: a secret as "hidden", a string quoted, the rest as the guide probe says.
local function describe(v)
  if ns.IsSecret(v) then return "hidden" end
  if type(v) == "string" then return "'" .. v:sub(1, 60) .. "'" end
  return ns.GuideData.Describe(v)
end

-- Up to five returns as text, or "returned nothing".
local function describeAll(...)
  local n, out = select("#", ...), {}
  for i = 1, math.min(n, 5) do out[i] = describe((select(i, ...))) end
  return n == 0 and "returned nothing" or table.concat(out, ", ")
end

-- "label: present, <returns>" or the error, from a pcall's answer.
local function answer(label, ok, ...)
  if not ok then return label .. ": present, error " .. errText((...)) end
  return label .. ": present, " .. describeAll(...)
end

-- A call's label: its name and the arguments it was given.
local function labelOf(name, args)
  local shown = {}
  for i, a in ipairs(args) do shown[i] = tostring(a) end
  return name .. (#shown > 0 and ("(" .. table.concat(shown, ",") .. ")") or "")
end

-- One line for a read: missing, an error, or what it returned. Called once, in a pcall.
function P.Row(name, ...)
  local fn = ns.GuideData.Find(name)
  local label = labelOf(name, { ... })
  if not fn then return label .. ": missing" end
  return answer(label, pcall(fn, ...))
end

-- One line saying whether a name exists, without calling it.
function P.Has(name)
  return name .. ": " .. (ns.GuideData.Find(name) and "present (not called)" or "missing")
end

-- The lines for the calls and the looked-for names of one section.
local function sectionRows(key)
  local out = {}
  for _, call in ipairs(P.CALLS[key] or {}) do out[#out + 1] = P.Row(unpack(call)) end
  for _, name in ipairs(P.HAVE[key] or {}) do out[#out + 1] = P.Has(name) end
  return out
end

-- The keys of a global enum table, as "Name=value" sorted by value, or nil when the client lacks it.
local function enumText(name)
  local enum = type(_G.Enum) == "table" and _G.Enum[name]
  if type(enum) ~= "table" then return nil end
  local list = {}
  for key, value in pairs(enum) do list[#list + 1] = { key, value } end
  table.sort(list, function(a, b) return tostring(a[2]) < tostring(b[2]) end)
  for i, pair in ipairs(list) do list[i] = pair[1] .. "=" .. tostring(pair[2]) end
  return table.concat(list, ", ")
end

-- "Enum.Name: a=0, b=1" or "Enum.Name: missing".
local function enumLine(name)
  return "Enum." .. name .. ": " .. (enumText(name) or "missing")
end

-- Sections ---------------------------------------------------------------------------------

-- The header: the build and the client.
local function clientLines()
  local version, build, date, iface = GetBuildInfo()
  return {
    string.format("version %s, build %s (%s), interface %s, WOW_PROJECT_ID %s", tostring(version), tostring(build), tostring(date), tostring(iface), tostring(_G.WOW_PROJECT_ID)),
    ns.Client.Line(),
  }
end

-- The saved record of the run before this one, as a line, or why there is none.
local function previousLine(prev)
  if type(prev) ~= "table" then return "earlier run: none saved (first run, or the file did not survive)" end
  local same = prev.session == P.session
  local age = type(prev.time) == "number" and (now() - prev.time) or 0
  return string.format("earlier run: #%s, build %s, %d s ago, %s", tostring(prev.runs), tostring(prev.build), age, same and "same session (a reload would show the same)" or "from an earlier session (saved across a log out or reload)")
end

-- Writes this run's marker; returns the record it replaced.
local function stampSaved(store)
  local prev = store.probe
  local runs = (type(prev) == "table" and tonumber(prev.runs) or 0) + 1
  store.probe = { runs = runs, build = select(2, GetBuildInfo()), time = now(), session = P.session, report = prev and prev.report, fight = prev and prev.fight }
  return prev, store.probe
end

-- How many keys a table has.
local function countKeys(t)
  local n = 0
  for _ in pairs(type(t) == "table" and t or {}) do n = n + 1 end
  return n
end

-- SavedVariables: the earlier run's marker, then the write and its read back, account and character.
local function savedLines()
  local prev, now = stampSaved(VanguardDB)
  local cprev = stampSaved(VanguardCharDB)
  return {
    previousLine(prev), "this run: #" .. tostring(now.runs) .. ", written to VanguardDB.probe, read back " .. tostring(VanguardDB.probe == now),
    "character file: " .. (type(cprev) == "table" and ("earlier run #" .. tostring(cprev.runs) .. " found") or "no earlier run found"),
    "profiles in the account file: " .. countKeys(VanguardDB.profiles),
  }
end

-- The new-quest flag Vanguard found, the enums it looked in and the first quest's classification.
local function questLines()
  local flag = ns.QuestGuide.Flag()
  return {
    flag and ("new-quest flag: " .. flag.source .. " " .. flag.name .. " = " .. describe(flag.value)) or "new-quest flag: none found",
    enumLine("QuestClassification"), enumLine("QuestTag"),
    ns.GuideData.Line({ "C_QuestLog.GetQuestClassification", "quest" }),
    ns.GuideData.Line({ "C_QuestLog.GetQuestTagInfo", "quest" }),
  }
end

-- Whether there is a target (a hidden answer counts as none).
local function hasTarget()
  local has = ns.GuideData.Find("UnitExists")
  local ok, v = pcall(has or error, "target")
  return ok and not ns.IsSecret(v) and v == true
end

-- A target's threat reads, or why none were made. A target is a mob, so nothing here names a player.
local function threatLines()
  local out = { P.Row("C_Secrets.ShouldUnitThreatValuesBeSecret", "player", "target"), P.Row("C_Secrets.ShouldUnitThreatStateBeSecret", "player", "target") }
  if not hasTarget() then out[#out + 1] = "threat reads: no target (target a mob and run again)" return out end
  out[#out + 1] = P.Row("UnitThreatSituation", "player", "target")
  out[#out + 1] = P.Row("UnitDetailedThreatSituation", "player", "target")
  return out
end

-- Every C_Secrets predicate, called once.
local function secretLines()
  local out = {}
  for _, row in ipairs(P.SECRETS) do out[#out + 1] = P.Row("C_Secrets." .. row[1], unpack(row, 2)) end
  return out
end

-- The restriction states the client reports and the chat lockdown reads.
local function restrictionLines()
  local out = { enumLine("AddOnRestrictionType"), enumLine("AddOnRestrictionState") }
  local types = type(_G.Enum) == "table" and _G.Enum.AddOnRestrictionType
  for key, value in pairs(type(types) == "table" and types or {}) do
    out[#out + 1] = "type " .. key .. ": " .. P.Row("C_RestrictedActions.GetAddOnRestrictionState", value)
  end
  out[#out + 1] = P.Row("C_ChatInfo.InChatMessagingLockdown")
  out[#out + 1] = P.Row("C_ChatInfo.AreOutgoingAddonChatMessagesRestricted")
  out[#out + 1] = P.Row("C_RestrictedActions.InCombatLockdown")
  return out
end

-- The player's position on a map as x, y when the client gives plain numbers.
local function playerXY(map)
  local get = ns.GuideData.Find("C_Map.GetPlayerMapPosition")
  local pos = get and map and get(map, "player")
  if type(pos) ~= "table" or type(pos.GetXY) ~= "function" then return nil end
  local x, y = pos:GetXY()
  return ns.PlainNumber(x), ns.PlainNumber(y)
end

-- C_Navigation: the reads with nothing set, then the waypoint toward the player's own spot on this map.
local function navigationLines()
  local out = sectionRows("navigation")
  local best = ns.GuideData.Find("C_Map.GetBestMapForUnit")
  local map = best and ns.PlainNumber(best("player"))
  local x, y = playerXY(map)
  out[#out + 1] = x and P.Row("C_Navigation.GetNextWaypointForMap", map, x, y) or "C_Navigation.GetNextWaypointForMap: not called (no plain map or position)"
  return out
end

-- One hidden secure frame: whether a state driver pages like the action bar's does.
local function pagingFrame()
  if InCombatLockdown() then return "skipped (in combat)" end
  local f = _G.Vanguard_ProbePaging or CreateFrame("Frame", "Vanguard_ProbePaging", UIParent, "SecureHandlerStateTemplate")
  _G.RegisterStateDriver(f, "page", "[bar:2] 2; 1")
  local value = f:GetAttribute("state-page")
  _G.UnregisterStateDriver(f, "page")
  return value
end
P.Paging = pagingFrame

-- Secure snippets, the state driver and the names bar paging and click casting rely on.
local function pagingLines()
  local out = { "secure snippets (Vanguard's own probe): " .. tostring(ns.Client.has.secureSnippets) }
  for _, name in ipairs({ "SecureHandlerExecute", "SecureHandlerWrapScript", "RegisterStateDriver", "UnregisterStateDriver", "RegisterAttributeDriver", "SetOverrideBindingClick" }) do out[#out + 1] = P.Has(name) end
  local ok, value = pcall(pagingFrame)
  out[#out + 1] = "state driver '[bar:2] 2; 1' on a hidden secure frame: " .. (ok and ("state-page " .. describe(value)) or ("error " .. errText(value)))
  return out
end

-- The name and realm forms, and the home key Vanguard files data under.
local function realmLines()
  local H = ns.Home
  return {
    P.Row("GetRealmName"), P.Row("GetNormalizedRealmName"), P.Row("UnitName", "player"), P.Row("UnitFullName", "player"),
    "home: realm " .. describe(H.Realm()) .. ", ruleset " .. describe(H.Ruleset() or "none") .. ", side " .. describe(H.Side()) .. ", key " .. describe(H.Key()),
  }
end

-- A hidden widget of this kind, made once.
local function widgetOf(kind)
  P.widgets = P.widgets or {}
  if not P.widgets[kind] then
    local frame = CreateFrame(kind == "Cooldown" and "Cooldown" or "Frame")
    P.widgets[kind] = kind == "FontString" and frame:CreateFontString() or frame
  end
  return P.widgets[kind]
end

-- Whether a widget of this kind has a method.
local function methodLine(kind, method)
  local widget = widgetOf(kind)
  return kind .. ":" .. method .. ": " .. (type(widget[method]) == "function" and "present (not called)" or "missing")
end

-- What FontString:SetTextToFit does to a 60-wide, 14-high label given a long text: the font height,
-- string width and text before and after, so a run shows whether it shrinks the text or cuts it.
local function textFitLine()
  local label = widgetOf("FontString")
  if type(label.SetTextToFit) ~= "function" then return "SetTextToFit read: method missing" end
  label:SetSize(60, 14)
  local before = describe(label:GetFontHeight()) .. "/" .. describe(label:GetStringWidth())
  local ok, err = pcall(label.SetTextToFit, label, "A fairly long label")
  if not ok then return "SetTextToFit read: error " .. errText(err) end
  return "SetTextToFit read: height/width " .. before .. " -> " .. describe(label:GetFontHeight()) .. "/" .. describe(label:GetStringWidth()) .. ", text " .. describe(label:GetText())
end

-- How many of the first sixty skill lines are headers, and how many of those are collapsed.
local function headerCounts(api, total)
  local headers, collapsed = 0, 0
  for i = 1, math.min(total, 60) do
    local info = api.GetSkillLineInfo(i)
    if type(info) == "table" and info.isHeader then headers, collapsed = headers + 1, collapsed + (info.isCollapsed and 1 or 0) end
  end
  return headers, collapsed
end

-- A skill's rank/max by its ID, as text.
local function skillById(api, id)
  local info = api.GetSkillLineInfoByID(id)
  return type(info) == "table" and describe(info.rank) .. "/" .. describe(info.maxRank) or "none"
end

-- C_SkillInfo, read only (nothing is expanded or collapsed): how many lines the list gives, how many are
-- headers and how many headers are collapsed, and Enchanting (333) and Cooking (185) by ID. Fewer lines
-- than the skills you know, with a header collapsed, says the list hides them.
local function skillLine()
  local api = C_SkillInfo
  if type(api) ~= "table" or type(api.GetNumSkillLines) ~= "function" then return "C_SkillInfo read: missing" end
  local total = ns.PlainNumber(api.GetNumSkillLines()) or 0
  local headers, collapsed = headerCounts(api, total)
  return "C_SkillInfo read: lines " .. total .. ", headers " .. headers .. ", collapsed " .. collapsed .. "; Enchanting " .. skillById(api, 333) .. ", Cooking " .. skillById(api, 185)
end

-- The reads the guide probe holds, so one run carries them too.
local function guideLines()
  local out = {}
  for _, probe in ipairs(ns.GuideData.PROBES) do out[#out + 1] = ns.GuideData.Line(probe) end
  return out
end

-- The reads the addon makes that the Forever API documentation does not list, and the new widget methods.
local function undocumentedLines()
  local out = sectionRows("undocumented")
  for _, m in ipairs(P.METHODS) do out[#out + 1] = select(2, pcall(methodLine, m[1], m[2])) end
  out[#out + 1] = select(2, pcall(textFitLine))
  out[#out + 1] = select(2, pcall(skillLine))
  return out
end

-- The sections of a run: { title, lines function }, in the order they print.
P.SECTIONS = {
  { "Client", clientLines }, { "SavedVariables round trip", savedLines },
  { "New-quest flag", questLines }, { "Threat secrecy (target a mob first)", threatLines },
  { "Group listing", function() return sectionRows("group") end },
  { "Secure paging", pagingLines }, { "Realm and name format", realmLines },
  { "Game rules and seasons", function() return sectionRows("rules") end },
  { "Colour-blind mode CVars", function() return sectionRows("access") end },
  { "C_Secrets predicates", secretLines }, { "Restrictions and lockdown", restrictionLines },
  { "Navigation", navigationLines }, { "Undocumented on Forever", undocumentedLines },
  { "Guide reads", guideLines },
}

-- A run ------------------------------------------------------------------------------------

-- One section as lines under its title; an error in it is a line, and the run goes on.
local function runSection(section)
  local ok, lines = pcall(section[2])
  local out = { "== " .. section[1] }
  for _, line in ipairs(ok and lines or { "section failed: " .. errText(lines) }) do out[#out + 1] = "  " .. line end
  return out
end

-- The whole report as a list of lines.
function P.Build()
  local out = { "Vanguard probe report" }
  for _, section in ipairs(P.SECTIONS) do
    for _, line in ipairs(runSection(section)) do out[#out + 1] = line end
  end
  return out
end

-- How many lines say present, missing or error: "41 present, 9 missing, 2 errors".
function P.Tally(lines)
  local n = { present = 0, missing = 0, error = 0 }
  for _, line in ipairs(lines) do
    local kind = line:match(": (%a+)[ ,]") or line:match(": (%a+)$")
    if n[kind] then n[kind] = n[kind] + 1 end
  end
  return string.format("%d present, %d missing, %d errors", n.present, n.missing, n.error)
end

-- Keeps the report in SavedVariables and opens it in the copy box.
local function publish(lines)
  VanguardDB.probe.report = lines
  ns.ShowText("Vanguard probe  Ctrl+C to copy", table.concat(lines, "\n"))
  ns.Chat("Probe done: " .. P.Tally(lines) .. ". The report is in the copy box and saved in Vanguard.lua (SavedVariables) as probe.report.")
end

-- /vg probe: runs everything, out of combat.
function P.Run(toChat)
  if ns.InCombat() then return ns.Chat("Probe: run it out of combat. /vg probe fight takes the secrecy reads in the next fight.") end
  local lines = P.Build()
  publish(lines)
  if toChat then for _, line in ipairs(lines) do ns.Chat(line) end end
end

-- /vg probe last: the report kept in SavedVariables, from this or an earlier session.
function P.Last()
  local saved = VanguardDB.probe
  if type(saved) ~= "table" or type(saved.report) ~= "table" then return ns.Chat("Probe: no saved report yet. Run /vg probe.") end
  local text = table.concat(saved.report, "\n")
  ns.ShowText("Vanguard probe (saved)  Ctrl+C to copy", text .. (type(saved.fight) == "table" and ("\n" .. table.concat(saved.fight, "\n")) or ""))
end

-- The fight ---------------------------------------------------------------------------------

-- The secrecy, threat and restriction reads, as lines labelled with the moment.
function P.Snapshot(moment)
  local out = { "== Fight, " .. moment .. " (in combat: " .. tostring(ns.InCombat()) .. ")" }
  for _, fn in ipairs({ threatLines, secretLines, restrictionLines }) do
    local ok, lines = pcall(fn)
    for _, line in ipairs(ok and lines or { "failed: " .. errText(lines) }) do out[#out + 1] = "  " .. line end
  end
  return out
end

-- Adds a snapshot to the fight report.
local function snap(moment)
  for _, line in ipairs(P.Snapshot(moment)) do P.fight[#P.fight + 1] = line end
end

-- The fight is over: saves the report and tells the player it is ready.
local function fightDone()
  VanguardDB.probe = VanguardDB.probe or {}
  VanguardDB.probe.fight = P.fight
  ns.Chat("Probe: the fight report is ready. /vg probe last shows it after the main report.")
end

-- A fight starts while armed: one snapshot now and one three seconds in, the report kept after it.
local function fightStarted()
  if not P.armed then return end
  P.armed, P.fight = false, {}
  snap("start")
  if C_Timer and C_Timer.After then C_Timer.After(3, ns.Guard("probe fight snapshot", function() snap("3 s in") end)) end
  ns.AfterCombat(fightDone, "probefight")
end
ns.On("PLAYER_REGEN_DISABLED", fightStarted)

-- /vg probe fight: arms the next fight.
function P.Fight()
  P.armed = true
  ns.Chat("Probe: armed. Start a fight (a target dummy or a mob); the reads are taken as it starts and 3 s in, and printed after it (/vg probe last).")
end

-- Command ------------------------------------------------------------------------------------

-- /vg probe [chat|fight|last].
function P.Command(rest)
  local word = (rest or ""):lower():match("^%s*(%S*)")
  if word == "fight" then return P.Fight() end
  if word == "last" then return P.Last() end
  if word == "" or word == "chat" then return P.Run(word == "chat") end
  ns.Chat("Usage: /vg probe [chat|fight|last]  (one run asks the client the open questions and saves the answers)")
end

-- A new id for this session, so a saved record from an earlier one can be told apart.
P.session = now() .. ":" .. math.floor(GetTime() * 1000)
