-- Vanguard's own role presets, as profile strings (partial strings: the raid frames and
-- nameplates parts only, so a layout, theme and every other module stay as they are).
-- Core/Integration.lua lists them beside the presets other addons register. A string is
-- what /vg export raid nameplates makes: change a preset by exporting a new string.

local ADDON, ns = ...

ns.BUILTIN_PRESETS = {
  { name = "Healer", info = "Raid frames sorted by role with power bars, party frames on, short debuff rows on nameplates.", text = "VG1:parts:3f88:e1siTmFtZXBsYXRlcyJdPXtbImJ1ZmZzIl09MCxbImNhc3RCYXIiXT10cnVlLFsiZGVidWZmcyJdPTIsWyJ0aHJlYXQiXT1mYWxzZX0sWyJSYWlkRnJhbWVzIl09e1siY29tcGFjdCJdPWZhbHNlLFsic2hvd0luUGFydHkiXT10cnVlLFsic2hvd1BsYXllciJdPXRydWUsWyJzaG93UG93ZXIiXT10cnVlLFsic29ydEJ5Um9sZSJdPXRydWV9LFsiYWRkb25WZXJzaW9uIl09IjAuMy4wIixbImZvcm1hdCJdPTIsWyJwYXJ0cyJdPXtbMV09Ik5hbWVwbGF0ZXMiLFsyXT0iUmFpZEZyYW1lcyJ9fQ==" },
  { name = "Damage", info = "Compact raid frames without power bars, longer debuff rows and threat colours on nameplates.", text = "VG1:parts:6d80:e1siTmFtZXBsYXRlcyJdPXtbImJ1ZmZzIl09MCxbImNhc3RCYXIiXT10cnVlLFsiZGVidWZmcyJdPTYsWyJ0aHJlYXQiXT10cnVlLFsidGltZXJzIl09dHJ1ZX0sWyJSYWlkRnJhbWVzIl09e1siY29tcGFjdCJdPXRydWUsWyJzaG93UG93ZXIiXT1mYWxzZSxbInNvcnRCeVJvbGUiXT1mYWxzZX0sWyJhZGRvblZlcnNpb24iXT0iMC4zLjAiLFsiZm9ybWF0Il09MixbInBhcnRzIl09e1sxXT0iTmFtZXBsYXRlcyIsWzJdPSJSYWlkRnJhbWVzIn19" },
  { name = "Tank", info = "Raid frames sorted by role, threat colours, target border and buff rows on nameplates.", text = "VG1:parts:585b:e1siTmFtZXBsYXRlcyJdPXtbImJ1ZmZzIl09MyxbImNhc3RCYXIiXT10cnVlLFsiZGVidWZmcyJdPTQsWyJ0YXJnZXRCb3JkZXIiXT10cnVlLFsidGhyZWF0Il09dHJ1ZX0sWyJSYWlkRnJhbWVzIl09e1siY29tcGFjdCJdPXRydWUsWyJzaG93UG93ZXIiXT1mYWxzZSxbInNvcnRCeVJvbGUiXT10cnVlfSxbImFkZG9uVmVyc2lvbiJdPSIwLjMuMCIsWyJmb3JtYXQiXT0yLFsicGFydHMiXT17WzFdPSJOYW1lcGxhdGVzIixbMl09IlJhaWRGcmFtZXMifX0=" },
}
