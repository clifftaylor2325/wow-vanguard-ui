-- Profile strings: plain settings tables (strings, numbers, booleans and
-- nested tables) to text and back, for /vg export and /vg import.
--
--   VG1:<scope>:<checksum>:<base64 of the serialized table>
--
-- Strings made before the rename (ForeverUI 0.3.0 and earlier) start FUI1:
-- instead, with the same body; they still import.
--
-- The parser reads only this grammar; nothing pasted is ever run as code.
-- The checksum catches a string cut off in the paste.

local ADDON, ns = ...

local S = {}
ns.Serialize = S

local MAX_DEPTH = 20
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

-- Writing ------------------------------------------------------------------------------

-- A string literal: quote, backslash and any non-printable byte as \ddd.
local function quote(s)
  return '"' .. s:gsub('[%c"\\\128-\255]', function(c) return string.format("\\%03d", c:byte()) end) .. '"'
end

-- A number as text that reads back exactly (whole numbers stay whole; %.0f because Lua 5.1's %d is 32-bit on the game's build).
local function number(n)
  if n == math.floor(n) and math.abs(n) < 2 ^ 53 then
    return string.format("%.0f", n)
  end
  return string.format("%.17g", n)
end

-- Table keys in a stable order: numbers first, then strings.
local function sortedKeys(t)
  local keys = {}
  for k in pairs(t) do
    if type(k) == "string" or type(k) == "number" then keys[#keys + 1] = k end
  end
  table.sort(keys, function(a, b)
    if type(a) ~= type(b) then return type(a) == "number" end
    return a < b
  end)
  return keys
end

local write

-- A table as {[key]=value,...}; functions and other types are left out.
local function writeTable(t, depth)
  local parts = {}
  for _, k in ipairs(sortedKeys(t)) do
    local v = write(t[k], depth + 1)
    if v then parts[#parts + 1] = "[" .. write(k, depth + 1) .. "]=" .. v end
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

-- Any supported value as text, or nil for one that can't be written.
write = function(v, depth)
  local t = type(v)
  if depth > MAX_DEPTH then error("settings nest too deeply") end
  if t == "table" then return writeTable(v, depth) end
  if t == "string" then return quote(v) end
  if t == "number" and v == v and v ~= math.huge and v ~= -math.huge then return number(v) end
  if t == "boolean" then return tostring(v) end
  return nil
end

-- Reading ------------------------------------------------------------------------------

local read

-- Skips spaces; returns the next position.
local function skip(text, pos)
  return text:find("[^%s]", pos) or #text + 1
end

-- One character of a string literal at i (\ddd escapes decoded): char, next position.
local function readChar(text, i)
  local c = text:sub(i, i)
  if c ~= "\\" then
    return c, i + 1
  end
  local code = text:match("^%d%d%d", i + 1)
  if not code then error("bad escape at " .. i) end
  return string.char(tonumber(code)), i + 4
end

-- A string literal starting at pos (the opening quote): value, next position.
local function readString(text, pos)
  local out, i = {}, pos + 1
  while i <= #text do
    if text:sub(i, i) == '"' then return table.concat(out), i + 1 end
    out[#out + 1], i = readChar(text, i)
  end
  error("unterminated string")
end

-- A number, true or false at pos: value, next position.
local function readAtom(text, pos)
  for word, value in pairs({ ["true"] = true, ["false"] = false }) do
    if text:sub(pos, pos + #word - 1) == word then return value, pos + #word end
  end
  local num = text:match("^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
  if not num or not tonumber(num) then error("unexpected input at " .. pos) end
  return tonumber(num), pos + #num
end

-- One [key]=value pair at pos, added to t: next position.
local function readPair(text, pos, t, depth)
  if text:sub(pos, pos) ~= "[" then error("expected [ at " .. pos) end
  local key, p = read(text, skip(text, pos + 1), depth + 1)
  if type(key) == "table" or text:sub(skip(text, p), skip(text, p) + 1) ~= "]=" then error("bad key at " .. pos) end
  local value
  value, p = read(text, skip(text, skip(text, p) + 2), depth + 1)
  t[key] = value
  return skip(text, p)
end

-- A table literal at pos (the opening brace): value, next position.
local function readTable(text, pos, depth)
  local t, p = {}, skip(text, pos + 1)
  while text:sub(p, p) ~= "}" do
    if p > #text then error("unterminated table") end
    p = readPair(text, p, t, depth)
    if text:sub(p, p) == "," then p = skip(text, p + 1) end
  end
  return t, p + 1
end

-- Any value at pos: value, next position.
read = function(text, pos, depth)
  if depth > MAX_DEPTH then error("settings nest too deeply") end
  local c = text:sub(pos, pos)
  if c == "{" then return readTable(text, pos, depth) end
  if c == '"' then return readString(text, pos) end
  return readAtom(text, pos)
end

-- Base64 and checksum ------------------------------------------------------------------

-- Three bytes (0-255, nil past the end) as four base64 characters.
local function encodeGroup(a, b, c)
  local n = a * 65536 + (b or 0) * 256 + (c or 0)
  local out = {}
  for i = 1, 4 do
    local index = math.floor(n / 64 ^ (4 - i)) % 64
    out[i] = B64:sub(index + 1, index + 1)
  end
  if not c then out[4] = "=" end
  if not b then out[3] = "=" end
  return table.concat(out)
end

-- Text as base64.
function S.Base64(text)
  local out = {}
  for i = 1, #text, 3 do
    out[#out + 1] = encodeGroup(text:byte(i, i + 2))
  end
  return table.concat(out)
end

-- Four base64 characters back to up to three bytes.
local function decodeGroup(chunk)
  local n, pad = 0, 0
  for j = 1, 4 do
    local c = chunk:sub(j, j)
    pad = pad + (c == "=" and 1 or 0)
    n = n * 64 + (c == "=" and 0 or (B64:find(c, 1, true) - 1))
  end
  return string.char(math.floor(n / 65536) % 256, math.floor(n / 256) % 256, n % 256):sub(1, 3 - pad)
end

-- Base64 back to text, or nil if it isn't valid base64.
function S.Unbase64(b64)
  b64 = b64:gsub("%s", "")
  if #b64 % 4 ~= 0 or b64:find("[^%w%+/=]") then return nil end
  local out = {}
  for i = 1, #b64, 4 do
    out[#out + 1] = decodeGroup(b64:sub(i, i + 3))
  end
  return table.concat(out)
end

-- A 4-hex-digit checksum of the text.
function S.Checksum(text)
  local sum = 0
  for i = 1, #text do
    sum = (sum * 31 + text:byte(i)) % 65536
  end
  return string.format("%04x", sum)
end

-- Public -----------------------------------------------------------------------------------

-- A settings table as a VG1 string for scope ("profile" or a module name).
function S.Encode(scope, data)
  local body = S.Base64(write(data, 0) or "{}")
  return string.format("VG1:%s:%s:%s", scope, S.Checksum(body), body)
end

-- The pasted text without whitespace, an old FUI1 prefix read as VG1.
local function pasted(text)
  local s = (text or ""):gsub("%s", "")
  return (s:gsub("^FUI1:", "VG1:"))
end

-- A VG1 (or older FUI1) string back to scope and settings table, or nil and a reason.
function S.Decode(text)
  local scope, sum, body = pasted(text):match("^VG1:([%w_]+):(%x%x%x%x):(.+)$")
  if not scope then return nil, "not a Vanguard profile string" end
  if S.Checksum(body) ~= sum then return nil, "the string is incomplete (was it cut off when pasting?)" end
  local raw = S.Unbase64(body)
  if not raw then return nil, "the string is damaged" end
  local ok, value = pcall(read, raw, skip(raw, 1), 0)
  if not ok or type(value) ~= "table" then return nil, "the settings in it can't be read" end
  return scope, value
end
