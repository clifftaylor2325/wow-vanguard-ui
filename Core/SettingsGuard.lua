-- Settings-loss guard. WoW Forever's beta has been reported to lose addon
-- settings between sessions. At logout Vanguard leaves the same stamp (the
-- time) in the account file (VanguardDB.guard, which also notes the profile
-- each character uses) and in this character's file (VanguardCharDB.guard,
-- with a backup of the character's profile as a profile string). At login:
--   * the account file came back without this character's stamp, or older than it: chat
--     says the saved settings didn't load, a question offers to restore the
--     profile from this character's backup (or to paste a profile string),
--     the General and Profiles pages show the same, and setup waits;
--   * this character's file came back blank while the account file
--     remembers the character: it uses its profile again, and setup stays shut.
-- A first run, or a file saved before the guard, has no stamps, so nothing fires.
-- While a loss is unanswered, logout leaves both stamps and the backup as they
-- were (unless a profile was imported or picked), so the next login offers it again.

local ADDON, ns = ...

local T, O = ns.Theme, ns.Options

local G = {}
ns.SettingsGuard = G

-- What chat says, and what the question asks, when the account's settings didn't load.
G.LOST = "Vanguard's saved settings didn't load this session (the account file came back %s). This character kept a backup."
G.LOST_NO_BACKUP = "Vanguard's saved settings didn't load this session (the account file came back %s). Paste a profile string you exported to get them back."
G.ASK = "Vanguard's saved settings didn't load. Restore profile %s from this character's backup?"
G.ASK_NO_BACKUP = "Vanguard's saved settings didn't load. Paste a profile string you exported?"
G.LATER = "The General and Profiles pages in /vg can still restore them; Start fresh there runs setup instead."
-- The options' notice, one line.
G.NOTICE = "Vanguard's saved settings didn't load this session."

-- t when it is a table, else nil (a hand-edited file may hold anything).
local function tbl(t)
  return type(t) == "table" and t or nil
end

-- Now, in seconds (0 when the client can't say).
local function now()
  return type(time) == "function" and ns.PlainNumber(time()) or 0
end

-- This character's key in the account file, "Name-Realm"; nil while the client won't say the name.
function G.CharKey()
  local name = type(UnitName) == "function" and UnitName("player")
  if type(name) ~= "string" or ns.IsSecret(name) then return nil end
  local realm = type(GetNormalizedRealmName) == "function" and GetNormalizedRealmName() or GetRealmName()
  return name .. "-" .. tostring(realm or "?")
end

-- Checking ----------------------------------------------------------------------------------

-- The account file's stamp for this character: its own note's (another character's logout after a
-- loss renews the account's stamp, not this one's), or the account's when the client won't name it.
local function accountStamp(acct)
  local key = G.CharKey()
  if not key then return tonumber(acct.stamp) end
  local note = tbl(acct.chars) and tbl(acct.chars[key])
  return note and tonumber(note.stamp)
end

-- "blank" when the account file has no stamp for this character, "older" when it is older than this
-- character's; nil when it is as new or this character has no stamp (a first run, or saved before the guard).
local function accountState(mine, acct)
  local stamp = mine and tonumber(mine.stamp)
  if not stamp then return nil end
  local theirs = acct and accountStamp(acct)
  if not theirs then return "blank" end
  return theirs < stamp and "older" or nil
end

-- The account file's note of this character ({ profile, stamp }) when this character's file came back blank; else nil.
local function lostCharacter(acct)
  local key = G.CharKey()
  local known = ns.NewCharacter() and key and acct and tbl(acct.chars) and tbl(acct.chars[key])
  return known and type(known.profile) == "string" and known or nil
end

-- What didn't load: "account" (with "blank" or "older"), "character" (with the account's note of it), or nil.
function G.Check()
  local mine, acct = tbl(VanguardCharDB.guard), tbl(VanguardDB.guard)
  local how = accountState(mine, acct)
  if how then return "account", how end
  local known = lostCharacter(acct)
  if known then return "character", known end
end

-- The unanswered loss ("account"), or nil.
function G.Lost()
  return G.lost
end

-- This character's backup ({ profile, backup = a profile string }), or nil when it has none.
function G.Backup()
  local mine = tbl(VanguardCharDB.guard)
  return mine and type(mine.backup) == "string" and mine or nil
end

-- A lost character file -------------------------------------------------------------------------

-- What chat says when this character's file came back blank and it goes back to `name`.
local function characterLine(name, later)
  local tail = later and ", after a reload." or "."
  return "This character's saved Vanguard settings didn't load; it uses profile " .. name .. " again" .. tail
end

-- This character's file came back blank: setup is not owed again, and the profile the account
-- file says it used is staged (a reload applies it) when it still exists.
local function restoreCharacter(known)
  VanguardCharDB.setupDone, VanguardCharDB.pickProfile = true, nil
  local name = known.profile
  if not VanguardDB.profiles[name] then return end
  ns.UseProfile(name)
  local later = ns.PendingProfileName() ~= nil
  ns.Chat(characterLine(name, later))
  if later then ns.OfferReload("This character used profile " .. name .. ".") end
end

-- A lost account file ------------------------------------------------------------------------------

-- The rows of the General and Profiles pages, rebuilt when the window is open.
local function rebuildPages()
  O.RebuildPage("general")
  O.RebuildPage("profiles")
end

-- The loss is answered (restored, a string pasted, or a fresh start): the notice goes.
function G.Resolve()
  G.lost = nil
  rebuildPages()
end

-- The profile name a backup restores into: its own, or "Restored" when it isn't a usable name.
local function restoreName(backup)
  return ns.ValidProfileName(backup.profile) and backup.profile or "Restored"
end

-- Puts a restored profile in place: this character uses it after the reload, and setup has run.
local function putRestored(name, data)
  VanguardDB.profiles[name] = data
  VanguardDB.setupDone, VanguardCharDB.setupDone = true, true
  ns.UseProfile(name)
  if name == ns.ProfileName() then ns.ProfileChanged() end
end

-- The backup string's profile, read as an import reads one (an older format upgraded, a newer one
-- refused) and without the string's own keys; else nil and why not.
local function readBackup(text)
  local kind, payload = ns.ReadPayload(ns.Serialize.Decode(text))
  if kind ~= "profile" then return nil, kind and "it isn't a whole profile" or payload end
  return ns.StripPayload(payload)
end

-- Restores the profile from this character's backup and offers the reload that applies it; says why when it can't.
function G.Restore()
  local backup = G.Backup()
  local data, why = readBackup(backup and backup.backup or "")
  if not data then return ns.Chat("The backup can't be restored: " .. tostring(why) .. ".") end
  local name = restoreName(backup)
  putRestored(name, data)
  G.Resolve()
  ns.OfferReload("Restored profile " .. name .. " from this character's backup.")
end

-- Pastes a profile string (the import box); a whole profile staged by it answers the loss at logout.
function G.Paste()
  ns.ImportDialog()
end

-- Start fresh: the loss is answered and setup runs, out of the options' way.
function G.StartFresh()
  G.Resolve()
  O.Hide()
  ns.Setup.Open()
end

-- Not now: says where the restore still is.
local function later()
  ns.Chat(G.LATER)
end

-- Asks once at login: restore from the backup, or paste a string when there is none.
function G.Offer()
  local backup = G.Backup()
  if backup then return ns.Ask(G.ASK:format(restoreName(backup)), "Restore", G.Restore, later) end
  ns.Ask(G.ASK_NO_BACKUP, "Paste a string", G.Paste, later)
end

-- The account's settings didn't load: chat says so (how the file came back), then the question.
local function announce(how)
  local text = G.Backup() and G.LOST or G.LOST_NO_BACKUP
  ns.Chat(text:format(how == "older" and "older than this character's last session" or "blank"))
  G.Offer()
end

-- At login, before setup decides whether it is owed.
function G.OnLogin()
  local lost, detail = G.Check()
  if lost == "character" then return restoreCharacter(detail) end
  G.lost = lost
  if lost then announce(detail) end
end
ns.On("PLAYER_LOGIN", G.OnLogin)

-- Logout ------------------------------------------------------------------------------------

-- The account file's guard, with its table of characters (repaired if damaged).
local function accountGuard()
  VanguardDB.guard = ns.Fill(tbl(VanguardDB.guard) or {}, { chars = {} })
  return VanguardDB.guard
end

-- A profile string of these settings: a top-level copy is stamped, so the profile itself isn't.
local function encodeOwn(profile)
  local data = {}
  for k, v in pairs(profile) do data[k] = v end
  return ns.Serialize.Encode("profile", ns.StampPayload(data))
end

-- The backup string of the profile in use: its own values (no Situations override, ns.OwnValues) with
-- this computer's own state kept (the combined bags flags, the graphics undo record), which an export
-- for another client leaves out, since the backup only ever comes back here.
local function backupString()
  if ns.OwnValues then return ns.OwnValues(encodeOwn, ns.Profile()) end
  return encodeOwn(ns.Profile())
end

-- The backup this character keeps: the old one while the profile it names is still missing (a pasted
-- string or a fresh start must not erase its only copy), else one of the profile in use.
local function keptBackup()
  local old = G.Backup()
  if old and not VanguardDB.profiles[restoreName(old)] then return old.profile, old.backup end
  return ns.ProfileName(), backupString()
end

-- Leaves the stamp in both files, the profile each character uses in the account file and
-- the backup in this character's; not while a loss is unanswered and nothing was imported or picked.
function G.Save()
  if G.lost and not ns.PendingProfileName() then return end
  local t, key, acct = now(), G.CharKey(), accountGuard()
  acct.stamp = t
  if key then acct.chars[key] = { profile = ns.SelectedProfileName(), stamp = t } end
  local profile, backup = keptBackup()
  VanguardCharDB.guard = { stamp = t, profile = profile, backup = backup }
end
ns.On("PLAYER_LOGOUT", G.Save)

-- Options --------------------------------------------------------------------------------------

-- The notice row: one line in the warning color.
local function noticeRow(parent, row, width)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), "label", "warn")
  fs:SetJustifyH("LEFT")
  fs:SetWidth(width - 14)
  fs:SetText(row[2])
  return fs
end
O.AddRowKind("notice", noticeRow, 22)

-- What the notice card explains under its line.
local function explain()
  if G.Backup() then return "This character kept a backup of profile " .. restoreName(G.Backup()) .. " from its last session. Restore it, paste a profile string you exported, or start fresh with setup." end
  return "Paste a profile string you exported (/vg export), or start fresh with setup."
end

-- The rows the General and Profiles pages start with while the account's settings didn't load; none otherwise.
function G.Rows()
  if not G.lost then return {} end
  local rows = { { "header", "Saved settings didn't load" }, { "notice", G.NOTICE }, { "text", explain() } }
  if G.Backup() then rows[#rows + 1] = { "button", "Restore the backup", G.Restore } end
  rows[#rows + 1] = { "button", "Paste a profile string", G.Paste }
  rows[#rows + 1] = { "button", "Start fresh: run setup", G.StartFresh }
  return rows
end

-- Saved data size -------------------------------------------------------------------------------
-- The game refuses an addon's SavedVariables file past a size it doesn't publish; its signal is the
-- event SAVED_VARIABLES_TOO_LARGE. Prices are the part that grows (a full price home is up to about
-- 3.5 MB of text), so a size estimate is kept under G.BUDGET by dropping the oldest price homes,
-- never the one in use. The numbers are estimates of the text the game writes, not readings.

-- The account file's budget in bytes (a guess well under any limit worth fearing), and the delay
-- after login before the size is checked, so the walk stays out of the login itself.
G.BUDGET, G.AUDIT_AFTER = 6 * 1024 * 1024, 15

-- Estimated bytes of a table as the game writes it: each key and value's text, plus indent and punctuation.
local function tableBytes(t, depth, seen)
  local n = 2
  for k, v in pairs(t) do
    n = n + G.Bytes(k, depth, seen) + G.Bytes(v, depth + 1, seen) + depth + 6
  end
  return n
end

-- Estimated bytes of any saved value (a table is walked once, so a loop in a damaged file ends).
---@param v any
---@return number
function G.Bytes(v, depth, seen)
  if type(v) == "string" then return #v + 2 end
  if type(v) ~= "table" then return #tostring(v) end
  seen = seen or {}
  if seen[v] then return 0 end
  seen[v] = true
  return tableBytes(v, depth or 0, seen)
end

-- Each top-level key of a saved table as { name, bytes }, largest first.
function G.Sizes(t)
  local list = {}
  for k, v in pairs(tbl(t) or {}) do list[#list + 1] = { name = tostring(k), bytes = G.Bytes(v, 1) + #tostring(k) } end
  table.sort(list, function(a, b) return a.bytes > b.bytes end)
  return list
end

-- Drops price homes, oldest first and never this one, until `free` bytes are gone; returns how many it dropped.
-- The auction data's layout is AuctionPrices' (AP.DropOldestHomes); the sizes are this file's (G.Bytes).
function G.Trim(free)
  local AP = ns.AuctionPrices
  return AP and AP.DropOldestHomes(free, G.Bytes) or 0
end

-- "1.2 MB" or "340 KB" for a byte count.
local function sizeText(bytes)
  if bytes >= 1024 * 1024 then return string.format("%.1f MB", bytes / 1024 / 1024) end
  return string.format("%.0f KB", bytes / 1024)
end

-- The largest three keys of a saved table as "ah 1.1 MB, inventory 90 KB, profiles 40 KB".
local function largest(sizes)
  local parts = {}
  for i = 1, math.min(3, #sizes) do parts[i] = sizes[i].name .. " " .. sizeText(sizes[i].bytes) end
  return table.concat(parts, ", ")
end

-- What /vg mem says about the saved files: the account file's estimate against the budget and
-- what holds the most, then this character's file. One walk, out of combat (it can take a moment).
function G.SizeReport()
  if ns.InCombat() then return ns.Chat("Saved data sizes are read out of combat; try /vg mem again after the fight.") end
  local account, char = G.Sizes(VanguardDB), G.Sizes(VanguardCharDB)
  local total = G.Bytes(VanguardDB)
  ns.Chat(string.format("Saved data (estimate): account file %s of a %s budget; largest: %s.", sizeText(total), sizeText(G.BUDGET), largest(account)))
  ns.Chat(string.format("This character's file: %s (%s).", sizeText(G.Bytes(VanguardCharDB)), largest(char)))
end

-- What chat says after price homes were dropped for size (`still` when the file is still over).
local function trimmedLine(dropped, still)
  local text = string.format("Vanguard's saved data was too large: it dropped the auction prices of %d realm and side(s), oldest first (they fill again as you scan).", dropped)
  return still and (text .. " It is still large; /vg mem lists what holds the most.") or text
end

-- Over the budget: drops the oldest price homes and says so. Nothing happens within it.
function G.Audit()
  local over = G.Bytes(VanguardDB) - G.BUDGET
  if over <= 0 then return end
  local dropped = G.Trim(over)
  ns.Chat(dropped > 0 and trimmedLine(dropped, G.Bytes(VanguardDB) > G.BUDGET) or "Vanguard's saved data is over its size budget; /vg mem lists what holds the most.")
end

-- A while after login, out of combat, the file's size is checked.
local function scheduleAudit()
  if C_Timer and C_Timer.After then C_Timer.After(G.AUDIT_AFTER, ns.Guard("saved data size", function() ns.OutOfCombat(G.Audit, "saved data size") end)) end
end
ns.On("PLAYER_LOGIN", scheduleAudit)

-- The client says an addon's saved file was too large: Vanguard trims to half its budget, so the next
-- save fits, and says what happened (the settings guard then reports a file that came back blank).
function G.OnTooLarge(_, name)
  if name ~= ADDON or type(VanguardDB) ~= "table" then return end
  local dropped = G.Trim(G.Bytes(VanguardDB) - G.BUDGET / 2)
  ns.Chat("The game says Vanguard's saved data is too large. " .. (dropped > 0 and trimmedLine(dropped) or "Vanguard has no price data left to drop; /vg mem lists what holds the most."))
end
ns.On("SAVED_VARIABLES_TOO_LARGE", G.OnTooLarge)
