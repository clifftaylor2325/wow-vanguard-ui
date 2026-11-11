/* TEST-ONLY. The checks the harness's patched lvm.c calls (tools/lua51/build.mjs puts them in).

   A harness secret is a table under one metatable (scripts/lib/wow-world.lua's SECRET). Lua 5.3 sends
   `#t` and `<` / `<=` between a table and a number through that metatable, which refuses them; Lua 5.1
   does not (`#` on a table is the raw length, and mixed-type ordering raises its own "attempt to
   compare" error), so VG_USE and VG_ORDER give the refusal the metatable would have.
   VG_TRUTH and VG_COMPARE are the client's refusals that no metamethod can make, as
   scripts/lib/lua-secret-ops.mjs puts them in fengari's VM: a truth test or `not` on a secret boolean,
   and `==` / `~=` with a secret, in the addon's own chunks only.
   vg_keep_frames is for lparser.c: the addon's chunks compile without tail calls (scripts/lib/lua-keep-frames.mjs). */
#ifndef vg_hooks_h
#define vg_hooks_h

#include "lobject.h"

extern int vg_secret_on;
extern Table *vg_secret_meta;

void vg_truth (lua_State *L, const TValue *v, int negate);
void vg_compare (lua_State *L);
void vg_use (lua_State *L);
int vg_keep_frames (const TString *source);

#define vg_is_secret(v) \
  (ttistable(v) && vg_secret_meta != NULL && hvalue(v)->metatable == vg_secret_meta)

#define VG_TRUTH(L,v,pc,neg) \
  { if (vg_secret_on && vg_is_secret(v)) { (L)->savedpc = (pc); vg_truth(L, v, neg); } }
#define VG_COMPARE(L,a,b,pc) \
  { if (vg_secret_on && (vg_is_secret(a) || vg_is_secret(b))) { (L)->savedpc = (pc); vg_compare(L); } }
#define VG_USE(L,v,pc) \
  { if (vg_is_secret(v)) { (L)->savedpc = (pc); vg_use(L); } }
#define VG_ORDER(L,a,b) \
  { if (vg_is_secret(a) || vg_is_secret(b)) vg_use(L); }

#endif
