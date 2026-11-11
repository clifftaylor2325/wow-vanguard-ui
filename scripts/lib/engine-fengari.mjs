// Puts a tool that runs on fengari only (npm run bench, npm run profile) on fengari: imported before lua-harness.mjs,
// it sets VG_LUA_ENGINE=fengari unless the caller already chose an engine. The harness's default is the Lua 5.1
// engine (lua-wasm.mjs); the bench's instruction counts and the profiler's stack reads are fengari's.
process.env.VG_LUA_ENGINE ??= "fengari";
