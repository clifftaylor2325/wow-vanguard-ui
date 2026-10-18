-- Profile strings: plain settings tables (strings, numbers, booleans and
-- nested tables) to text and back, for /vg export and /vg import.
--
--   VG1:<scope>:<checksum>:<base64 of the serialized table>
--
-- Strings made before the rename (ForeverUI 0.3.0 and earlier) start FUI1:
-- instead, with the same body; they still import.
--
-- The parser reads only this grammar; nothing pasted is ever run as code.
-- The checksum catches a string cut off in the paste. Decoding keeps its place
-- between calls (S.Decoder), so a large string can be read a frame's work at a
-- time, S.BUDGET units per call, instead of freezing the game; the reader keeps
-- its own stack of open tables rather than recursing, so it can stop anywhere.

local ADDON, ns = ...

local S = {}
ns.Serialize = S

local MAX_DEPTH = 20
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
-- Units of work one call of a stepped decode does: 64 bytes summed, 16 base64 groups
-- decoded, or one value read count one each.
S.BUDGET = 2000

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
  local n = tonumber(num)
  if not n or n ~= n or n == math.huge or n == -math.huge then error("unexpected input at " .. pos) end
  return n, pos + #num
end

-- A key, or a value that isn't a table, at pos: value, next position.
local function readScalar(text, pos)
  if text:sub(pos, pos) == '"' then return readString(text, pos) end
  return readAtom(text, pos)
end

-- The reader's state p: text, pos, stack (the tables open, innermost last, each
-- { t = the table, key = the key its next value goes under }), and root and done
-- once the whole value is read.

-- Puts a value read into the innermost open table under the key read before it (or, with
-- none open, makes it the whole value), then steps over a comma after it.
local function place(p, value, pos)
  local top = p.stack[#p.stack]
  if not top then p.root, p.done = value, true return end
  top.t[top.key] = value
  pos = skip(p.text, pos)
  if p.text:sub(pos, pos) == "," then pos = skip(p.text, pos + 1) end
  p.pos = pos
end

-- Opens a table at pos (its opening brace).
local function open(p, pos)
  if #p.stack > MAX_DEPTH then error("settings nest too deeply") end
  p.stack[#p.stack + 1] = { t = {} }
  p.pos = skip(p.text, pos + 1)
end

-- Reads a value at pos: a table opens, anything else is placed.
local function readValue(p, pos)
  if p.text:sub(pos, pos) == "{" then return open(p, pos) end
  place(p, readScalar(p.text, pos))
end

-- Reads a [key]= at the reader's position into the innermost open table; returns where its value starts.
local function readKey(p, top)
  local text = p.text
  if text:sub(p.pos, p.pos) ~= "[" then error("expected [ at " .. p.pos) end
  local key, q = readScalar(text, skip(text, p.pos + 1))
  q = skip(text, q)
  if text:sub(q, q + 1) ~= "]=" then error("bad key at " .. p.pos) end
  top.key = key
  return skip(text, q + 2)
end

-- One step of reading: the whole value at first, then the innermost table's next pair or its end.
local function readStep(p)
  local top = p.stack[#p.stack]
  if not top then return readValue(p, p.pos) end
  if p.text:sub(p.pos, p.pos) == "}" then
    p.stack[#p.stack] = nil
    return place(p, top.t, p.pos + 1)
  end
  if p.pos > #p.text then error("unterminated table") end
  readValue(p, readKey(p, top))
end

-- Up to n steps of reading; returns how many it took (it stops once the whole value is read).
local function readSteps(p, n)
  for i = 1, n do
    readStep(p)
    if p.done then return i end
  end
  return n
end

-- Base64 groups --------------------------------------------------------------------------

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

-- Stepped decoding ---------------------------------------------------------------------------
-- A decode's state d: the scope, the checksum it should have (want) and the body; the phase
-- it is in (a function(d, n) that does up to n units of work, returns how many it took and
-- moves d.phase on); how far it has got (progress, 0-1); and at the end its result:
-- { scope, settings } or { nil, why not }.

local readyPhase, checkPhase

-- Sums up to n * 64 more bytes of d.body into d.sum (from d.i), then on to the check.
local function sumPhase(d, n)
  local from, stop = d.i, math.min(#d.body, d.i + n * 64 - 1)
  for i = from, stop do d.sum = (d.sum * 31 + d.body:byte(i)) % 65536 end
  d.i, d.progress = stop + 1, 0.2 * stop / #d.body
  if d.i > #d.body then d.phase = checkPhase end
  return math.max(1, math.ceil((stop - from + 1) / 64))
end

-- Decodes up to n * 16 more base64 groups of d.body into d.out (from d.j), then on to reading.
local function unbasePhase(d, n)
  local from, stop = d.j, math.min(#d.body, d.j + n * 64 - 1)
  for i = from, stop, 4 do d.out[#d.out + 1] = decodeGroup(d.body:sub(i, i + 3)) end
  d.j, d.progress = stop + 1, 0.2 + 0.3 * stop / #d.body
  if d.j > #d.body then d.phase = readyPhase end
  return math.max(1, math.ceil((stop - from + 1) / 64))
end

-- After the checksum: true when the body checks out and is base64, else nil and why not.
local function checkedBody(d)
  if string.format("%04x", d.sum) ~= d.want then return nil, "the string is incomplete (was it cut off when pasting?)" end
  if #d.body % 4 ~= 0 or d.body:find("[^%w%+/=]") then return nil, "the string is damaged" end
  return true
end

-- The check between summing and decoding: on to the base64, or the decode ends with why not.
checkPhase = function(d)
  local ok, why = checkedBody(d)
  if not ok then d.result = { nil, why } return 1 end
  d.j, d.out, d.phase = 1, {}, unbasePhase
  return 1
end

-- What reading gave: the settings table, or nil and why not.
local function settingsRead(root)
  if type(root) ~= "table" then return nil, "the settings in it can't be read" end
  return root
end

-- Reads up to n more values of the settings text; at the end (or at text that isn't
-- settings, which is never run) the decode's result is set.
local function readPhase(d, n)
  local p = d.p
  local ok, used = pcall(readSteps, p, n)
  if ok and not p.done then d.progress = 0.5 + 0.5 * p.pos / #p.text return used end
  local value, why = settingsRead(ok and p.root)
  d.result = value and { d.scope, value } or { nil, why }
  return 1
end

-- The base64 decoded: the settings text joined, and on to reading it.
readyPhase = function(d)
  local raw = table.concat(d.out)
  d.p, d.phase = { text = raw, pos = skip(raw, 1), stack = {} }, readPhase
  return 1
end

-- Base64 and checksum, whole --------------------------------------------------------------

-- Text as base64.
function S.Base64(text)
  local out = {}
  for i = 1, #text, 3 do
    out[#out + 1] = encodeGroup(text:byte(i, i + 2))
  end
  return table.concat(out)
end

-- Base64 back to text, or nil if it isn't valid base64.
function S.Unbase64(b64)
  b64 = b64:gsub("%s", "")
  if #b64 % 4 ~= 0 or b64:find("[^%w%+/=]") then return nil end
  local d = { body = b64, j = 1, out = {} }
  unbasePhase(d, math.huge)
  return table.concat(d.out)
end

-- A 4-hex-digit checksum of the text.
function S.Checksum(text)
  local d = { body = text, i = 1, sum = 0 }
  sumPhase(d, math.huge)
  return string.format("%04x", d.sum)
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

-- A decode's state for the pasted text, or nil and why not when it isn't a Vanguard string.
local function start(text)
  local scope, sum, body = pasted(text):match("^VG1:([%w_]+):(%x%x%x%x):(.+)$")
  if not scope then return nil, "not a Vanguard profile string" end
  return { scope = scope, want = sum, body = body, i = 1, sum = 0, progress = 0, phase = sumPhase }
end

-- One call's work on a decode (S.BUDGET units): false and how far it has got (0-1), or,
-- once it has finished, true and what S.Decode returns.
local function advance(d)
  local left = S.BUDGET
  while not d.result and left > 0 do left = left - d.phase(d, left) end
  if d.result then return true, d.result[1], d.result[2] end
  return false, d.progress
end

-- A stepped decode of a VG1 (or older FUI1) string: each call of the function it returns
-- does one frame's work (S.BUDGET units) and returns false and how far it has got (0-1),
-- or, once the decode has finished, true and what S.Decode returns.
function S.Decoder(text)
  local d, why = start(text)
  d = d or { result = { nil, why } }
  return function() return advance(d) end
end

-- A VG1 (or older FUI1) string back to scope and settings table, or nil and a reason.
function S.Decode(text)
  local step = S.Decoder(text)
  local done, a, b = step()
  while not done do done, a, b = step() end
  return a, b
end

-- The format a decoded profile string says it has (1 for one without: Vanguard 0.5.0 and
-- older), or nil and why not when it is newer than `newest`, the newest this version reads.
function S.Format(data, newest)
  local format = tonumber(data.format) or 1
  if format > newest then return nil, "it was made by a newer version of Vanguard: update Vanguard, then import it again" end
  return format
end
