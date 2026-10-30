// Shared by the click-casting test files (clickcast, clickcast-groups, clickcast-notice): a logged-in priest and the
// finders for the Click casting page, in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

export const CS = "ns.ClickCastSpells";
export const CC = 'ns.GetModule("ClickCast")';

// A priest's spellbook: ranks, a passive, an off-spec entry and a damage spell.
export const PRIEST = [
  [2061, { name: "Flash Heal", rank: 1, helpful: true, icon: "Interface\\Icons\\TEST-ONLY-FH" }],
  [9472, { name: "Flash Heal", rank: 2, helpful: true, icon: "Interface\\Icons\\TEST-ONLY-FH2" }],
  [139, { name: "Renew", rank: 1, helpful: true }],
  [17, { name: "Power Word: Shield", rank: 1, helpful: true }],
  [527, { name: "Dispel Magic", rank: 1, helpful: true }],
  [1243, { name: "Power Word: Fortitude", rank: 1, helpful: true }],
  [2006, { name: "Resurrection", rank: 1, helpful: true }],
  [585, { name: "Smite", rank: 1, helpful: false }],
  [15270, { name: "Spirit Tap", passive: true, helpful: false }],
  [2651, { name: "Elune's Grace", offSpec: true, helpful: true }],
  [2050, { name: "Lesser Heal", rank: 1, helpful: true }],
  [2054, { name: "Heal", rank: 1, helpful: true }],
  [2060, { name: "Greater Heal", rank: 1, helpful: true }],
  [528, { name: "Cure Disease", rank: 1, helpful: true }],
];

// A logged-in addon made a priest with the spellbook above. A test file logs in itself, with
// `priestly(loggedIn(CLICK_LUA + extra, opts))`, so that scripts/login-scope-probe.mjs finds its logins.
export function priestly(addon) {
  addon.eval('__wfgWorld.units.player.class = "PRIEST" __wfgWorld.units.player.className = "Priest"');
  for (const [id, fields] of PRIEST) addon.world.learn(id, fields);
  return addon;
}

// The first widget passing a Lua predicate on `w`, as its id.
export const widget = (addon, predicate) => addon.frames(predicate)[0]?.id;

// The grid cell for a binding key.
export const cell = (addon, key) => widget(addon, `w.key == "${key}" and w.iconFrame ~= nil and w.empty ~= nil`);

// The current spec's bindings as { key: "action:value:spellID:rank" }.
export const bindings = (addon) => addon.eval(`local out = {} for _, b in ipairs(${CC}.Bindings()) do out[b.key] = b.action .. ":" .. tostring(b.value) .. ":" .. tostring(b.spellID) .. ":" .. tostring(b.rank) end return out`);

// How many times the bindings were applied to the frames while fn ran (the module's ApplyAll, counted).
export function applies(addon, fn) {
  addon.eval(`__applies, __realApply = 0, ${CC}.ApplyAll ${CC}.ApplyAll = function(...) __applies = __applies + 1 return __realApply(...) end`);
  const result = fn();
  addon.eval(`${CC}.ApplyAll = __realApply`);
  return [result, addon.eval("return __applies")];
}

// The menu-click notice's text, and the shape of the old starter layouts (Flash Heal on Right, the menu on Middle).
export const MENU_NOTICE = "Middle click can't open the unit menu on your raid frames: the game only runs it on a click its own Click Casting window binds. Put the menu on Right click and what is on Right click now on Middle click?";
export const OLD_SHAPE = `${CC}.Add("BUTTON2", "spell", "Flash Heal", 2061) ${CC}.Add("BUTTON3", "menu")`;
