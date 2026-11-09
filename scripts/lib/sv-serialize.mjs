// Lua that returns VanguardDB and VanguardCharDB as Lua source (keys sorted, so a fixture diffs
// cleanly): scripts/savedvariables-fixture.mjs writes fixtures with it, and the savedvariables test
// saves today's tables with it to load them again.
export const SERIALIZE_SV = `
local function key(k) if type(k) == "string" and k:match("^[%a_][%w_]*$") then return k end return "[" .. (type(k) == "string" and string.format("%q", k) or tostring(k)) .. "]" end
local function num(v) if v == math.floor(v) and math.abs(v) < 2^53 then return string.format("%d", v) end return string.format("%.17g", v) end
local function order(a, b) if type(a) == type(b) then return a < b end return type(a) == "number" end
local function val(v, ind)
  local t = type(v)
  if t == "string" then return string.format("%q", v) elseif t == "number" then return num(v) elseif t == "boolean" then return tostring(v) elseif t ~= "table" then return "nil" end
  local keys = {} for k in pairs(v) do keys[#keys + 1] = k end
  if #keys == 0 then return "{}" end
  table.sort(keys, order)
  local out = {}
  for _, k in ipairs(keys) do local s = val(v[k], ind .. "  ") if s ~= "nil" then out[#out + 1] = ind .. "  " .. key(k) .. " = " .. s .. "," end end
  return "{\\n" .. table.concat(out, "\\n") .. "\\n" .. ind .. "}"
end
return "VanguardDB = " .. val(VanguardDB, "") .. "\\nVanguardCharDB = " .. val(VanguardCharDB, "") .. "\\n"`;

