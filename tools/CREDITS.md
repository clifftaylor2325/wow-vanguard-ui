# Credits: tools/

Test tooling only. Nothing under `tools/` is loaded by the game or shipped to players (`.pkgmeta` leaves the folder out, and `scripts/pkgmeta.test.mjs` checks it).

## Lua 5.1.5 (`tools/lua51/lua-5.1.5/`, built into `tools/lua51/vg-lua51.wasm`)

The test harness's Lua 5.1 engine is PUC-Rio Lua 5.1.5, compiled to WebAssembly with the harness's own C shim (`tools/lua51/shim.c`). The sources are unchanged from `lua-5.1.5.tar.gz` (SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`, as published at lua.org); the build (`tools/lua51/build.mjs`) patches copies of `lvm.c` (the harness's secret-value checks) and `lparser.c` (no tail calls in the addon's chunks).

Copyright (C) 1994-2012 Lua.org, PUC-Rio. MIT license; the full text is in `tools/lua51/lua-5.1.5/COPYRIGHT`.
