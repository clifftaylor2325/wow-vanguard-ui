/* TEST-ONLY: the C side of the harness's Lua 5.1 engine (scripts/lib/lua-wasm.mjs is the JS side).
   Never shipped: tools/ is outside the addon and .pkgmeta leaves it out.

   One WebAssembly instance holds one Lua state, so the state's budget, coverage and output live in
   globals here. Every call from JS is one export: load and run a chunk (with the harness's traceback
   handler and the addon's `ADDON, ns` arguments when asked), its first result written to the output
   buffer as JSON with the same rules as lua-harness.mjs's toJs, or the error text when it failed. */

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
#include "lobject.h"
#include "lstate.h"
#include "lstring.h"
#include "ltable.h"
#include "ldebug.h"
#include "vg_hooks.h"

#define EXPORT(name) __attribute__((export_name(name)))

/* ---- output buffer: JSON results, error texts, dumps ---- */

static char *out;
static size_t out_len, out_cap;
static int out_special; /* a NaN or infinity was written as a marked string */

static void out_reserve (size_t n) {
  size_t cap = out_cap ? out_cap : 65536;
  if (out_len + n <= out_cap) return;
  while (cap < out_len + n) cap *= 2;
  out = realloc(out, cap);
  out_cap = cap;
}

static void out_put (const char *s, size_t n) {
  out_reserve(n);
  memcpy(out + out_len, s, n);
  out_len += n;
}

static void out_c (char c) { out_reserve(1); out[out_len++] = c; }
static void out_s (const char *s) { out_put(s, strlen(s)); }

EXPORT("vg_out_ptr") char *vg_out_ptr (void) { return out; }
EXPORT("vg_out_len") size_t vg_out_len (void) { return out_len; }
EXPORT("vg_out_special") int vg_out_special (void) { return out_special; }

/* Memory JS keeps for the state's life (the addon's name). */
EXPORT("vg_alloc") char *vg_alloc (size_t n) { return malloc(n); }

/* ---- scratch buffer: JS writes chunk names and sources here ---- */

static char *scratch;
static size_t scratch_cap;

EXPORT("vg_scratch") char *vg_scratch (size_t n) {
  if (n > scratch_cap) { scratch = realloc(scratch, n); scratch_cap = n; }
  return scratch;
}

/* ---- values to JSON (lua-harness.mjs's toJs) ---- */

static void put_string (const char *s, size_t n) {
  size_t i;
  out_c('"');
  for (i = 0; i < n; i++) {
    unsigned char c = (unsigned char)s[i];
    if (c == '"' || c == '\\') { out_c('\\'); out_c((char)c); }
    else if (c < 0x20 || c == 0x7f) { char b[8]; snprintf(b, sizeof b, "\\u%04x", c); out_s(b); }
    else out_c((char)c);
  }
  out_c('"');
}

/* A number as JSON. -0 goes as 0: Lua's own == does not tell them apart, and Lua 5.1, with no integers, makes
   -0 where 5.3's integer arithmetic made 0. */
static void put_number (double d) {
  char b[40];
  if (d == 0) { out_c('0'); return; }
  if (isfinite(d)) { snprintf(b, sizeof b, "%.17g", d); out_s(b); return; }
  out_special = 1;
  out_s(isnan(d) ? "\"\\u0001NaN\"" : d > 0 ? "\"\\u0001Infinity\"" : "\"\\u0001-Infinity\"");
}

/* A number as JS's String() writes it (keys of an object, widget labels). */
static void js_number (char *b, size_t size, double d) {
  int p;
  if (d == floor(d) && fabs(d) < 1e21) { snprintf(b, size, "%.0f", d == 0 ? 0.0 : d); return; }
  for (p = 15; p <= 17; p++) { snprintf(b, size, "%.*g", p, d); if (strtod(b, NULL) == d) return; }
}

static const char *type_label (int t) {
  switch (t) {
    case LUA_TFUNCTION: return "<function>";
    case LUA_TUSERDATA: case LUA_TLIGHTUSERDATA: return "<userdata>";
    case LUA_TTHREAD: return "<thread>";
    default: return "<unknown>";
  }
}

/* A raw string or number field of the table at idx, as JS text in b; 0 when absent or falsy in JS. */
static int widget_field (lua_State *L, int idx, const char *field, char *b, size_t size) {
  int t, truthy = 0;
  lua_pushstring(L, field);
  lua_rawget(L, idx);
  t = lua_type(L, -1);
  if (t == LUA_TSTRING) {
    size_t n; const char *s = lua_tolstring(L, -1, &n);
    snprintf(b, size, "%.*s", (int)n, s);
    truthy = n > 0;
  } else if (t == LUA_TNUMBER) {
    double d = lua_tonumber(L, -1);
    js_number(b, size, d);
    truthy = d != 0 && !isnan(d);
  }
  lua_pop(L, 1);
  return truthy ? 1 : (t == LUA_TSTRING || t == LUA_TNUMBER) ? -1 : 0;
}

static void put_value (lua_State *L, int idx, int depth);

/* `<kind name>` for a nested widget (a table with a truthy __kind), as toJs labels it. */
static int put_widget (lua_State *L, int idx) {
  char kind[256], name[256], text[600];
  if (widget_field(L, idx, "__kind", kind, sizeof kind) != 1) return 0;
  if (!widget_field(L, idx, "__name", name, sizeof name) && !widget_field(L, idx, "__id", name, sizeof name))
    strcpy(name, "null");
  snprintf(text, sizeof text, "<%s %s>", kind, name);
  put_string(text, strlen(text));
  return 1;
}

/* A table key as an object key (JS's String() of keyToJs). */
static void put_key (lua_State *L) {
  int t = lua_type(L, -2);
  if (t == LUA_TSTRING) { size_t n; const char *s = lua_tolstring(L, -2, &n); put_string(s, n); }
  else if (t == LUA_TNUMBER) { char b[40]; js_number(b, sizeof b, lua_tonumber(L, -2)); put_string(b, strlen(b)); }
  else { const char *s = (t == LUA_TFUNCTION || t == LUA_TUSERDATA || t == LUA_TLIGHTUSERDATA || t == LUA_TTHREAD) ? type_label(t) : "<key>"; put_string(s, strlen(s)); }
}

/* Counts the entries of the table at idx; *array says whether the keys are exactly 1..count. */
static int count_entries (lua_State *L, int idx, int *array) {
  int count = 0;
  double most = 0;
  *array = 1;
  lua_pushnil(L);
  while (lua_next(L, idx)) {
    count++;
    if (*array && lua_type(L, -2) == LUA_TNUMBER) {
      double k = lua_tonumber(L, -2);
      if (k != floor(k) || k < 1) *array = 0; else if (k > most) most = k;
    } else *array = 0;
    lua_pop(L, 1);
  }
  if (count == 0 || most > count) *array = 0;
  return count;
}

static void put_table (lua_State *L, int idx, int depth) {
  int array, count, i, first = 1;
  if (depth > 0 && put_widget(L, idx)) return;
  count = count_entries(L, idx, &array);
  if (array) {
    out_c('[');
    for (i = 1; i <= count; i++) { if (i > 1) out_c(','); lua_rawgeti(L, idx, i); put_value(L, -1, depth + 1); lua_pop(L, 1); }
    out_c(']');
    return;
  }
  out_c('{');
  lua_pushnil(L);
  while (lua_next(L, idx)) {
    if (!first) out_c(',');
    first = 0;
    put_key(L);
    out_c(':');
    put_value(L, -1, depth + 1);
    lua_pop(L, 1);
  }
  out_c('}');
}

static void put_value (lua_State *L, int idx, int depth) {
  int t = lua_type(L, idx);
  if (idx < 0) idx = lua_gettop(L) + idx + 1;
  lua_checkstack(L, 6);
  switch (t) {
    case LUA_TNIL: case LUA_TNONE: out_s("null"); return;
    case LUA_TBOOLEAN: out_s(lua_toboolean(L, idx) ? "true" : "false"); return;
    case LUA_TNUMBER: put_number(lua_tonumber(L, idx)); return;
    case LUA_TSTRING: { size_t n; const char *s = lua_tolstring(L, idx, &n); put_string(s, n); return; }
    case LUA_TTABLE: break;
    default: { const char *s = type_label(t); put_string(s, strlen(s)); return; }
  }
  if (depth > 32) { out_s("\"<too-deep>\""); return; }
  put_table(L, idx, depth);
}

/* ---- the instruction budget, coverage and the profiler: one debug hook ---- */

#define COUNT_EVERY 1000

static double budget_limit = -1; /* below zero: no budget */
static double budget_used;
static char budget_message[300];

EXPORT("vg_set_budget") void vg_set_budget (double limit) {
  budget_limit = limit;
  snprintf(budget_message, sizeof budget_message,
    "Lua ran %.14g instructions in one call from the tests: a runaway loop? (createAddon's instructionBudget, or LUA_INSTRUCTION_BUDGET, raises it)", limit);
}

/* Coverage: a set of (source, line) pairs. A source string is fixed when first seen, so its address
   names it for the state's life. */
#define HIT_SLOTS_MIN (1u << 16)
static uint64_t *hits;
static uint32_t hit_slots, hit_count;
static TString **sources;
static uint32_t source_count, source_cap;
static TString *last_source;
static uint32_t last_index;

static uint32_t source_index (TString *s) {
  uint32_t i;
  if (s == last_source) return last_index;
  for (i = 0; i < source_count; i++) if (sources[i] == s) break;
  if (i == source_count) {
    if (source_count == source_cap) { source_cap = source_cap ? source_cap * 2 : 256; sources = realloc(sources, source_cap * sizeof *sources); }
    luaS_fix(s);
    sources[source_count++] = s;
  }
  last_source = s;
  last_index = i;
  return i;
}

static void hit_insert (uint64_t key);

static void hits_grow (void) {
  uint64_t *old = hits;
  uint32_t n = hit_slots, i;
  hit_slots = n ? n * 2 : HIT_SLOTS_MIN;
  hits = calloc(hit_slots, sizeof *hits);
  hit_count = 0;
  for (i = 0; i < n; i++) if (old[i]) hit_insert(old[i]);
  free(old);
}

static void hit_insert (uint64_t key) {
  uint32_t i;
  if ((hit_count + 1) * 2 > hit_slots) hits_grow();
  i = (uint32_t)((key * 0x9E3779B97F4A7C15ull) >> 40) & (hit_slots - 1);
  while (hits[i] && hits[i] != key) i = (i + 1) & (hit_slots - 1);
  if (!hits[i]) { hits[i] = key; hit_count++; }
}

static void on_line (lua_State *L, int line) {
  Proto *p = ci_func(L->ci)->l.p;
  if (!p->source || getstr(p->source)[0] != '@') return;
  hit_insert(((uint64_t)(source_index(p->source) + 1) << 24) | (uint32_t)line);
}

/* Writes the hits as the count of sources, one chunk name per line, then "<source>,<line>" pairs
   separated by spaces on the last line, and forgets them. */
EXPORT("vg_take_hits") void vg_take_hits (void) {
  uint32_t s, i;
  char b[32];
  out_len = 0;
  snprintf(b, sizeof b, "%u\n", (unsigned)source_count);
  out_s(b);
  for (s = 0; s < source_count; s++) { out_s(getstr(sources[s])); out_c('\n'); }
  for (i = 0; i < hit_slots; i++) {
    if (!hits[i]) continue;
    snprintf(b, sizeof b, "%u,%u ", (unsigned)(hits[i] >> 24) - 1, (unsigned)(hits[i] & 0xFFFFFF));
    out_s(b);
  }
  if (hits) memset(hits, 0, hit_slots * sizeof *hits);
  hit_count = 0;
}

static void hook (lua_State *L, lua_Debug *ar) {
  if (ar->event == LUA_HOOKLINE) { on_line(L, ar->currentline); return; }
  if (budget_limit < 0) return;
  budget_used += COUNT_EVERY;
  if (budget_used > budget_limit) luaL_error(L, "%s", budget_message);
}

/* ---- the secret checks lvm.c calls (vg_hooks.h) ---- */

int vg_secret_on = 1;
Table *vg_secret_meta;
static TString *str_n;

EXPORT("vg_secret_checks") void vg_secret_checks (int on) { vg_secret_on = on; }

/* Whether the Lua function running is one of the addon's (chunks named @Core/, @Modules/, @Libs/). */
static int addon_running (lua_State *L) {
  const char *src;
  if (!isLua(L->ci)) return 0;
  src = getstr(ci_func(L->ci)->l.p->source);
  return strncmp(src, "@Core/", 6) == 0 || strncmp(src, "@Modules/", 9) == 0 || strncmp(src, "@Libs/", 6) == 0;
}

void vg_truth (lua_State *L, const TValue *v, int negate) {
  if (!ttisboolean(luaH_getstr(hvalue(v), str_n)) || !addon_running(L)) return;
  luaG_runerror(L, negate ? "attempt to negate a secret value" : "attempt to perform boolean test on a secret value");
}

void vg_compare (lua_State *L) {
  if (addon_running(L)) luaG_runerror(L, "attempt to compare a secret value");
}

void vg_use (lua_State *L) {
  luaG_runerror(L, "attempt to use a secret value");
}

/* ---- host functions the harness's Lua calls ---- */

/* __wfgUserdata(fields): a userdata that reads its fields from `fields`. */
static int h_userdata (lua_State *L) {
  lua_newuserdata(L, 0);
  lua_createtable(L, 0, 1);
  lua_pushvalue(L, 1);
  lua_setfield(L, -2, "__index");
  lua_setmetatable(L, -2);
  return 1;
}

/* __wfgMarkSecretMeta(SECRET): the secrets' metatable, known to the VM's checks. */
static int h_mark_secret_meta (lua_State *L) {
  luaL_checktype(L, 1, LUA_TTABLE);
  vg_secret_meta = (Table *)lua_topointer(L, 1);
  lua_pushvalue(L, 1);
  lua_setfield(L, LUA_REGISTRYINDEX, "vg.secretMeta");
  return 0;
}

static int secret_at (lua_State *L, int i) {
  int marked;
  if (lua_type(L, i) != LUA_TTABLE) return 0;
  if (lua_getmetatable(L, i)) {
    int same = vg_secret_meta != NULL && lua_topointer(L, -1) == (const void *)vg_secret_meta;
    lua_pop(L, 1);
    if (same) return 1;
  }
  lua_pushliteral(L, "__secret");
  lua_rawget(L, i);
  marked = lua_type(L, -1) == LUA_TBOOLEAN && lua_toboolean(L, -1);
  lua_pop(L, 1);
  return marked;
}

/* __wfgSecretAt(...): the position of the first secret argument, or nothing. */
static int h_secret_at (lua_State *L) {
  int n = lua_gettop(L), i;
  for (i = 1; i <= n; i++) if (secret_at(L, i)) { lua_pushinteger(L, i); return 1; }
  return 0;
}

/* xpcall as the game has it: arguments after the handler go to the function. */
static int game_xpcall (lua_State *L) {
  int n = lua_gettop(L), status;
  luaL_checkany(L, 2);
  lua_pushvalue(L, 2);
  lua_insert(L, 1);
  lua_remove(L, 3);
  status = lua_pcall(L, n - 2, LUA_MULTRET, 1);
  lua_pushboolean(L, status == 0);
  lua_replace(L, 1);
  return lua_gettop(L);
}

/* ---- the state ---- */

static lua_State *state;
static int traceback_ref = LUA_NOREF;

EXPORT("vg_open") lua_State *vg_open (int coverage) {
  lua_State *L = luaL_newstate();
  luaL_openlibs(L);
  lua_register(L, "__wfgUserdata", h_userdata);
  lua_register(L, "__wfgMarkSecretMeta", h_mark_secret_meta);
  lua_register(L, "__wfgSecretAt", h_secret_at);
  lua_register(L, "xpcall", game_xpcall);
  lua_getglobal(L, "debug");
  lua_getfield(L, -1, "traceback");
  traceback_ref = luaL_ref(L, LUA_REGISTRYINDEX);
  lua_pop(L, 1);
  str_n = luaS_newliteral(L, "n");
  luaS_fix(str_n);
  lua_sethook(L, hook, LUA_MASKCOUNT | (coverage ? LUA_MASKLINE : 0), COUNT_EVERY);
  state = L;
  return L;
}

/* The pcall message handler: the error with a traceback from the function that raised it. */
static int handler (lua_State *L) {
  if (!lua_isstring(L, 1)) lua_pushliteral(L, "<non-string error>"); else lua_pushvalue(L, 1);
  lua_rawgeti(L, LUA_REGISTRYINDEX, traceback_ref);
  lua_insert(L, -2);
  lua_pushinteger(L, 2);
  lua_call(L, 2, 1);
  return 1;
}

static void put_error (lua_State *L) {
  size_t n;
  const char *s = lua_tolstring(L, -1, &n);
  out_len = 0;
  if (s) out_put(s, n); else out_s("<non-string error>");
}

/* Loads the chunk in scratch (name: the first name_len bytes, then the chunk) and runs it with the
   traceback handler, with `ADDON, ns` as its arguments when addon is not NULL. Returns 0 and the first
   result as JSON when want is set (or the first result in the global named `into`), or 1 (load) / 2 (run)
   and the error text. */
EXPORT("vg_run") int vg_run (size_t name_len, size_t len, const char *addon, int want, const char *into) {
  lua_State *L = state;
  int base, nargs = 0;
  char *name = scratch, *chunk = scratch + name_len + 1;
  out_len = 0; out_special = 0; budget_used = 0;
  lua_pushcfunction(L, handler);
  base = lua_gettop(L);
  if (luaL_loadbuffer(L, chunk, len, name) != 0) { put_error(L); lua_settop(L, base - 1); return 1; }
  if (addon) { lua_pushstring(L, addon); lua_getglobal(L, "__wfgNs"); nargs = 2; }
  if (lua_pcall(L, nargs, (want || into) ? 1 : 0, base) != 0) { put_error(L); lua_settop(L, base - 1); return 2; }
  if (want) put_value(L, -1, 0);
  else if (into) lua_setglobal(L, into);
  lua_settop(L, base - 1);
  return 0;
}

static int dump_writer (lua_State *L, const void *p, size_t n, void *ud) {
  (void)L; (void)ud;
  out_put((const char *)p, n);
  return 0;
}

/* Compiles the chunk in scratch (as vg_run lays it out) and writes its bytecode, line info kept;
   returns 0, or 1 and the error text. */
EXPORT("vg_compile") int vg_compile (size_t name_len, size_t len) {
  lua_State *L = state;
  out_len = 0;
  if (luaL_loadbuffer(L, scratch + name_len + 1, len, scratch) != 0) { put_error(L); lua_pop(L, 1); return 1; }
  lua_dump(L, dump_writer, NULL);
  lua_pop(L, 1);
  return 0;
}

/* Lua's own memory in bytes. */
EXPORT("vg_memory") double vg_memory (void) {
  return (double)lua_gc(state, LUA_GCCOUNT, 0) * 1024 + lua_gc(state, LUA_GCCOUNTB, 0);
}

/* ---- what WASI's libc lacks: io.tmpfile, os.execute and os.tmpname fail as on a system without them ---- */

FILE *tmpfile (void) { return NULL; }
int system (const char *command) { (void)command; return -1; }
char *tmpnam (char *s) { (void)s; return NULL; }
