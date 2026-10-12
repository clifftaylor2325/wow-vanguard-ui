-- Settings-loss guard. WoW Forever's beta has been reported to lose addon
-- settings between sessions. At logout Vanguard leaves the same stamp (the
-- time) in the account file (VanguardDB.guard, which also notes the profile
-- each character uses) and in this character's file (VanguardCharDB.guard,
-- with a backup of the character's profile as a profile string). At login:
--   * the account file came back without that stamp, or older than it: chat
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

-- "blank" when the account file has no stamp, "older" when its stamp is older than this
-- character's; nil when it is as new or this character has no stamp (a first run, or saved before the guard).
local function accountState(mine, acct)
  local stamp = mine and tonumber(mine.stamp)
  if not stamp then return nil end
  if not acct or not tonumber(acct.stamp) then return "blank" end
  return tonumber(acct.stamp) < stamp and "older" or nil
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

-- Restores the profile from this character's backup and offers the reload that applies it; says why when it can't.
function G.Restore()
  local backup = G.Backup()
  local scope, data = ns.Serialize.Decode(backup and backup.backup or "")
  if scope ~= "profile" then return ns.Chat("The backup can't be restored: " .. tostring(data) .. ".") end
  data.display = nil
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

-- Leaves the stamp in both files, the profile each character uses in the account file and
-- the backup in this character's; not while a loss is unanswered and nothing was imported or picked.
function G.Save()
  if G.lost and not ns.PendingProfileName() then return end
  local t, key, acct = now(), G.CharKey(), accountGuard()
  acct.stamp = t
  if key then acct.chars[key] = { profile = ns.SelectedProfileName(), stamp = t } end
  VanguardCharDB.guard = { stamp = t, profile = ns.ProfileName(), backup = ns.ExportProfile() }
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
