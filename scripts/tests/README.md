# Testing Vanguard without the game

`npm test` runs the addon's real Lua (every file `Vanguard.toc` loads) inside a
headless WoW client written for the tests: a Lua 5.1-faithful VM (fengari with
5.1 shims), the frame API with real layout, a world model behind the game API,
and input. Each `scripts/tests/<area>.test.mjs` file is one area of the addon
and runs in parallel with the others under Vitest, one worker per core
(`VITEST_MAX_WORKERS=n` caps it); a worker compiles each Lua file once and
loads every later addon from the compiled chunks. The Lua project does not isolate
its files (`isolate: false` in `vitest.config.mjs`), so a worker keeps those chunks
and its warmed-up JIT from one file to the next. Do not mock a module or change
`process.env` in a case: the next file in that worker would see it. Files run at
one per worker, so the slowest file sets the wall time on a machine with many cores:
split a file by area when it passes about 45 s (`npm run timing` shows the per-file
times) and move its entry in `login-scope.json` with it.

Everything here is TEST-ONLY: nothing in `scripts/lib/wow-*.lua` ships in game.

## The pieces

| File | What it is |
| --- | --- |
| `scripts/lib/lua-harness.mjs` | Loads the client and the addon into a Lua state; the JS scenario API below. |
| `scripts/lib/wow-widget-api.lua` | The allowlist of widget methods (anything else errors, as a wrong method would in game). |
| `scripts/lib/wow-stub.lua` | Frames, regions, scripts, events, the clock, Lua 5.1 shims, and the input drivers. |
| `scripts/lib/wow-layout.lua` | Anchors, sizes and scale resolved to screen rects (1920x1080, origin bottom-left). |
| `scripts/lib/wow-world.lua` | The world: units, auras, actions, spells, quests, bags, the map, timers, Blizzard frames. |
| `scripts/lib/wow-taint.lua` | Taint and combat rules: who owns each frame, field writes on the game's frames, protected calls blocked in combat, secret geometry. |
| `scripts/lib/wow-inspect.lua` | A widget as a plain snapshot: what it draws, where, and its children. |
| `scripts/lua-engine.test.mjs` | The client's own tests (5.1 printing, layout, events, timers, input, inspectors). |
| `scripts/tests/smoke.test.mjs` | The harness cases a pull request's CI runs (`npm run test:quick`): load, login, unlock, lock and no errors, once as WoW Forever and once as Retail, then a fight with secret geometry on. |

## Writing a scenario

```js
import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("targeting a hostile shows the target frame", () => {
  const addon = loggedIn();                                      // the addon, logged in on a finished-setup account
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2 });
  expect(addon.frame("Vanguard_target.health")).toMatchObject({ visible: true, value: 640, max: 800 });
  expect(addon.texts("Defias Pillager").length).toBe(1);
  addon.world.removeUnit("target");
  expect(addon.frame("Vanguard_target").visible).toBe(false);
});
```

The pattern is: **set up the world, act as the player would, inspect what the
addon drew.** `scripts/tests/scenarios.test.mjs` has more.

### Loading the addon

- `createAddon({ savedVariables, client })` (from `../lib/lua-harness.mjs`): the
  addon files are run, SavedVariables Lua is run after them, nothing has fired
  yet. `client` is Lua run before the addon's files: `FOREVER_CLIENT` (the
  default) or `RETAIL_CLIENT` (interface 120007). `loggedIn(env, { client })`
  passes it on.
- `loggedIn(env)` (from `./helpers.mjs`): a finished-setup account, `env` Lua
  run before login, then `login()` fires ADDON_LOADED, PLAYER_LOGIN and
  PLAYER_ENTERING_WORLD (with six heavy modules off in most files; see
  "Scoped logins" below). To test an older or stricter client, nil out an API
  in `env` (`"C_Timer = nil"`) or call `addon.world.without("C_Timer")`.

### Scoped logins

A full login enables every module, and six of them (ActionBars, FrameAuras,
PlayerAuras, InstancePrep, UnitFrames and RaidTools) cost about three quarters
of it. So in a test file listed in `scripts/tests/login-scope.json`, `loggedIn`
leaves those six off (through `VanguardDB.profiles.Default.modules`, after your
`savedVariables`), except for the cases on that file's keep-full list, which get
the full login. The error guard judges a scoped login exactly as it judges a
full one.

- A file not in the data keeps the full login. So do the cross-module files
  (`smoke`, `scenarios`, `movers`; `FULL_FILES` in `scripts/lib/login-scope.mjs`)
  and a few single cases that check modules against each other (`FULL_CASES`
  there, each with its reason). `createAddon` is never scoped.
- The data is written by `node scripts/login-scope-probe.mjs --write`, never by
  hand. The probe runs the whole suite with every login scoped; a case that fails
  that way needs a heavy module and goes on its file's keep-full list. It takes a
  few minutes (`--workers <n>` caps Vitest's workers). Without `--write` it only
  prints how many cases of each file keep the full login.
- `VG_LOGIN_SCOPE=full` runs every login full (the equivalence check);
  `VG_LOGIN_SCOPE=probe` runs every login scoped; any other value throws.
- A new case in a listed file that needs one of the six modules fails (frames
  missing, or an `expectErrors` marker that "never" matched). Rerun the probe and
  commit the JSON. If the case checks several modules together, add it to
  `FULL_CASES` with a reason instead, and rerun the probe; a test fails when a
  `FULL_CASES` title no longer exists in its file.
- A case that only asserts that something is absent can pass with a module off
  without testing anything. Coverage catches the lines this hides:
  `npm run coverage` must stay at 100%, and a line only a scoped case used to
  reach goes back on the full login through `FULL_CASES`.

### Timing and profiling

- `npm run timing` runs the suite on 2 workers (the hosted runner's size) and
  prints the total wall time, a per-file table and the test counts. `--workers <n>`
  changes the cap, `--budget <seconds>` the limit it fails over (default 300),
  and `--baseline <file>` fails when a case listed in the file (one `file|case`
  line each, written by `--cases-out <file>`) is missing, failed or skipped.
  Files named after the options run alone.
- `npm run profile -- <area>` runs `scripts/tests/<area>.test.mjs` under Vitest
  with a Lua sampler on, and `npm run profile -- login` profiles warm logins. Both
  print where the Lua goes, by file, function and line, and write
  `coverage/profile/<area>.json`. One sample is 1,000 Lua VM instructions; time
  inside the harness's JavaScript is not counted. Nothing is sampled unless
  `LUA_PROFILE` is set, which the command does.

### The world (`addon.world`)

The world starts as WoW Forever (interface 16001) with one level 60 human mage,
"Tester", out of combat, with no target, auras, actions, quests or group. Every
change fires the events the client would.

| Call | Effect |
| --- | --- |
| `setUnit(token, fields)` | Creates or changes a unit (`name, hp, maxhp, power, maxpower, ptypeName, reaction, level, class, isPlayer, connected, dead, role, ...`). A new target fires PLAYER_TARGET_CHANGED; changed fields fire their UNIT_* events. |
| `removeUnit(token)` | The unit is gone (target lost, pet dismissed). |
| `unit(token)` | The unit's fields, or null. |
| `combat(true/false)` | PLAYER_REGEN_DISABLED, then `InCombatLockdown()` turns true; `InCombatLockdown()` turns false, then PLAYER_REGEN_ENABLED (the client's order). |
| `addAura(unit, aura)` / `removeAura(unit, name)` | Auras (`name, duration, applications, isHarmful, dispelName, sourceUnit, icon, spellId`); containers refresh and UNIT_AURA fires. |
| `setAction(slot, fields)` | An action slot: `{ id: 133 }` is Fireball (world spells: 133, 1459, 116, 2136, 118), plus `cooldown: { start, duration }`, `usable`, `count`, `charges`, ... |
| `addQuest(quest)` | A quest in the log (`questID, title, level, watched, objectives: [{ text, finished, type }]`). |
| `world.setQuestTimer(questID, seconds)` (Lua, through `addon.eval`) | A quest's timer: `seconds` left on the clock (a `secret(n)` for one the client hides), `nil` to clear it; QUEST_LOG_UPDATE fires, as the log does. `C_QuestLog.GetQuestTimers` answers from `world.questTimers` with the remaining seconds as `{ questID, questTimer }` each, counting down with `advance`. |
| `world.trackRecipe(recipeID, tracked)` (Lua, through `addon.eval`) | Tracks a recipe (`tracked` true or nil) or untracks it (false) and fires TRACKED_RECIPE_UPDATE(recipeID, tracked). `C_TradeSkillUI.GetRecipesTracked(isRecraft)` answers from `world.trackedRecipes` (recrafts are none); `C_TradeSkillUI.SetRecipeTracked` goes through it. |
| `learn(id, fields)` / `forgetAll()` | A spell in the spellbook (`name, icon, rank, helpful, passive, offSpec`; `C_SpellBook` reads them, SPELLS_CHANGED fires), or an empty spellbook. |
| `openNpc(data)` | A gossip or quest giver window. |
| `openAuctionHouse()` / `closeAuctionHouse()` | The auction house: `AuctionHouseFrame` (made on the first open, as the game loads it) shows and AUCTION_HOUSE_SHOW fires; AUCTION_HOUSE_CLOSED fires and it hides. `C_AuctionHouse` answers from `world.ah` (browse and search results, the replicate list, your auctions; see `scripts/lib/wow-world.lua`); queries are only recorded in `ah.queries`, so a test fires the result event itself (`fireAuctionEvents(key, id)` fires every one), and every restricted call (PostItem, PostCommodity, ConfirmPost*, CancelAuction, PlaceBid, StartCommoditiesPurchase) lands in `ah.restricted` with `clicked` (made inside a click) and `path` (the stack that made it). |
| `openMailbox()` | The mailbox opens: MAIL_SHOW, then MAIL_INBOX_UPDATE. The inbox is `world.mail`, a list of mails in order (`sender, subject, money, daysLeft, firstItemQuantity, firstItemLink`, and `invoice = { type, itemName, bid, deposit, consignment, count }` for an auction invoice), read by `GetInboxNumItems`, `GetInboxHeaderInfo` and `GetInboxInvoiceInfo`. Empty by default. |
| `postFromBag(bag, slot)` | A bag item clicked with the auction house open: the window's `SetPostItem` gets its `ItemLocation`. `world.cursor = { type = "item", id, bag, slot }` puts one on the cursor (`C_Cursor.GetCursorItem`). |
| `finishPost(auctionID)` | With `ah.throttle = true`, a post the addon sends fires AUCTION_HOUSE_THROTTLED_MESSAGE_SENT, makes `IsThrottledMessageSystemReady` false and locks the posted bag slot (`isLocked`); `finishPost` is the house taking it: the units leave the slot, then AUCTION_HOUSE_AUCTION_CREATED, BAG_UPDATE_DELAYED and AUCTION_HOUSE_THROTTLED_SYSTEM_READY fire. Off (the default), the throttle stays ready. |
| `set("realm", name)` | The realm `GetRealmName` reports (default "Forever Test"); `GetNormalizedRealmName` gives it without spaces or hyphens. The player's side is `units.player.faction`. |
| `openProfession(recipeID)` / `selectRecipe(recipeID)` / `closeProfession()` | The profession window: `ProfessionsFrame` (made on the first open, as Blizzard_Professions loads; ADDON_LOADED fires) shows on TRADE_SKILL_SHOW and its `CraftingPage.SchematicForm:Init({ recipeID })` is given the recipe; TRADE_SKILL_CLOSE fires and it hides. `C_TradeSkillUI.GetRecipeSchematic` answers from `world.recipes[recipeID]` (a CraftingRecipeSchematic: `name, outputItemID, quantityMin, quantityMax, reagentSlotSchematics = { { reagents = { { itemID } }, quantityRequired, reagentType } }`). |
| `world.professions` | Your two primary professions, `{ name, skillLine, profession }` each (`profession` an `Enum.Profession`, Enchanting 9): `GetProfessions`, `GetProfessionInfo` and `C_TradeSkillUI.GetProfessionInfoBySkillLineID` answer from it. Empty by default. |
| `secret(n)` | A secret value (as the client hides numbers in instanced combat): `set("units.player.hp", secret(100))`. It raises on arithmetic, comparison, concatenation, length, a call and any field read or write; `issecretvalue` is the one way to look at it. |
| `secretGeometry(mode)` | Secret positions and sizes, as the client hides them: `"derived"` (a bar's fill while its value is secret, a font string showing secret text, and anything anchored to those), `"strict"` (those, and every frame of the game's but UIParent), or off (`null`). Geometry getters then answer with secrets. |
| `get(field)` / `set(field, value)` | Any world field by path: `set("money", 12345)`, `set("build.interface", 120007)`. |
| `without(...names)` | Removes global APIs, as an older client would lack them. |
| `addChatBubble(text, opts)` | A chat bubble over a speaker's head saying `text`: a frame in `world.bubbles` with one child panel holding nine `TEST-ONLY-ART` textures and the text (`panel.String`), listed by `C_ChatBubbles.GetAllChatBubbles`; CHAT_MSG_SAY fires. `opts.forbidden` makes its `IsForbidden` true (an instance's bubble), `opts.empty` leaves it without a panel, `opts.unkeyed` leaves its text without the `String` key, `opts.event` is the chat event that fires instead of CHAT_MSG_SAY (`"CHAT_MSG_RAID"`). Returns its index. |
| `set("instance", true)` | The player is in an instance: `IsInInstance()` answers `true, "party"` (default `false, "none"`). |

The world's tables are open: `addon.eval("__wfgWorld.units.player.level = 10")`
is fine when no call covers a case. The client's font paths are plain globals,
`STANDARD_TEXT_FONT` and `DAMAGE_TEXT_FONT` (both `Fonts\FRIZQT__.TTF`, the enUS
values); a test that must tell them apart sets one in `env`.

### Input

| Call | Effect |
| --- | --- |
| `click(ref, button = "LeftButton")` | PreClick, OnMouseDown, OnMouseUp, OnClick, PostClick on a frame. |
| `hover(ref)` / `hover(null)` | The mouse onto a frame (OnEnter, `IsMouseOver`), or off everything (OnLeave). |
| `wheel(ref, delta)`, `key(ref, key)` | OnMouseWheel (on the frame, or the nearest parent that takes the wheel, as in game), OnKeyDown. |
| `drag(ref, point, x, y)` | Drags a frame to a point on the screen and drops it. |
| `type(ref, text)`, `enter(ref)` | An edit box's text (OnTextChanged), and Enter in it (OnEnterPressed). |
| `keys({ shift: true })` | Modifier keys held (`IsShiftKeyDown()`...). |
| `mouse(x, y)` | The cursor at screen pixels (`GetCursorPosition`). |
| `slash("unlock")`, `chat()` | A `/vg` command, and the chat lines the addon printed. |
| `fire(event, ...)`, `update(dt)`, `advance(seconds)` | A raw event, one OnUpdate, or the clock forward (timers and OnUpdates run). |

A frame `ref` is a global name with optional fields (`"Vanguard_player.health"`),
a `ns` path (`"ns.GetModule('Minimap').frame"`) or a widget id from a snapshot.

### Inspecting

| Call | Returns |
| --- | --- |
| `frame(ref)` | A snapshot or null: `{ name, kind, parent, shown, visible, rect: { left, bottom, width, height, right, top }, text, textColor, font, texture, atlas, color, vertexColor, alpha, value, min, max, barColor, checked, enabled, cooldown, scale, strata, level, attributes, mouse, children }`. |
| `frames(predicate)` | Snapshots of every widget passing a Lua predicate on `w`: `frames('w.__kind == "Cooldown" and w:IsVisible()')`. |
| `screen()` | The visible top-level frames the addon made, with rects: for on-screen and overlap checks. |
| `texts(text)` | Every visible font string reading exactly `text`. |
| `find(pattern)` | The first visible widget whose name or text matches a Lua pattern. |
| `eval(lua)` | Anything else, with `ns` (the addon's namespace) in scope; the first result comes back as JS. |

Rects are screen pixels on a 1920x1080 screen (`addon.eval("__wfgStub.setScreen(2560, 1440)")`
changes it). Text is measured at 6 px per character and 14 px per line.

### Errors

A Lua error throws in JS with the addon file and line it came from, and errors
the addon catches with `ns.Try` land in `ns.errors`. Numbers print as the
game's Lua 5.1 prints them (`3`, not `3.0`), so string assertions match the
game.

Every test is judged on this, with no switch to turn it off. After each test the
setup file fails it if any addon it built left an entry in `ns.errors` (entries
cleared with `ns.ClearErrors` count too), printing each entry's text, count and
stack. A test that causes an error on purpose names it:

- `expectErrors("<whole entry text>")` (from `./helpers.mjs`), or, where a line
  number or a counter varies, a RegExp anchored by `^` and `$` whose only
  variable parts are digit runs (`\d+`).
- `expectErrors` throws for any broader matcher (unanchored, empty or wildcard
  patterns, character classes, groups, alternation, `\w` or `\s`, the `g`, `m`
  and `y` flags, an empty string), so a marker cannot cover a class of errors.
- A marker that matches nothing fails the test too.
- `AURA_FALLBACK` (in `helpers.mjs`) names the deliberate aura-container
  fallback notice (D-06).

### Taint, combat and secret geometry

`scripts/lib/wow-taint.lua` holds the addon to rules the real client enforces and a
line-coverage run can't see. A broken rule is recorded and judged like a caught
error: the test fails unless `expectErrors` names it.

- **Who owns a frame.** A widget made by the addon's files (`Core/`, `Modules/`,
  `Libs/`), or made on one of the addon's frames (a group header's buttons), is the
  addon's. Everything else is the game's: what existed before the addon loaded,
  what the world makes, and what test code makes to stand in for the game.
- **Field writes.** Addon code that stores a field on a game frame is recorded
  (`field write: Modules/X.lua:12 stored the field vgFoo on the game's frame
  ChatFrame1`). Keep that state in `ns.FrameState("vgFoo")[frame]`; a test reads it
  the same way. Replacing a game frame's script with `SetScript` is recorded too
  (`script replaced: ...`): hook it with `HookScript`.
- **Combat lockdown.** In combat, addon code that calls a protected method
  (`Show`, `Hide`, `SetPoint`, `SetSize`, `SetAttribute` and the like) on a
  protected frame is blocked: nothing happens, ADDON_ACTION_BLOCKED fires and the
  call is recorded. Secure templates, `PlayerFrame` and the other unit frames, and
  anything marked with `__wfgStub.protect(frame)` are protected, and so is a
  frame holding one.
- **Secret geometry** is off unless a test calls `world.secretGeometry`.
- A test that wraps `CreateFrame` in its own Lua marks the wrapper with
  `__wfgStub.transparent[CreateFrame] = true` after defining it, so ownership is
  read from the code that called the wrapper.
- `world.combat(true)` fires PLAYER_REGEN_DISABLED before `InCombatLockdown()`
  turns true, as the client does: a handler there may still touch protected
  frames, and `ns.OutOfCombat` would run at once, so work for after the fight
  goes through `ns.AfterCombat`.

### Game windows

`WINDOWS_ENV` (in `helpers.mjs`) defines TEST-ONLY `__window(name)`, a frame shaped like the game's
ButtonFrameTemplate (an art texture marked `TEST-ONLY-ART`, `NineSlice`, `Inset`, `PortraitContainer`,
`CloseButton`, `TitleContainer.TitleText`, `<name>Button1-2`), and makes `MerchantFrame`, `StaticPopup1` and
`MirrorTimerContainer` (the breath bars' container: three unnamed timers with a `StatusBar`, and a `SetupTimer(i)`
that gives the i-th the game's bar texture back). `windowState(addon, name)` reads one back: `{ art, nine, portrait,
insetNine, panel, title, painted }`
(`art` is the marked texture's alpha; `panel` is whether Vanguard painted anything). The `windows-<area>.test.mjs`
files build on them; see docs/handoff/RESKIN-PLAN.md section 0.

## Conventions

- Names, texts and icons a test makes up carry `TEST-ONLY` so a leak into the
  addon is obvious.
- A case asserts on what the player would see (visible, text, rect, color),
  not on how the addon got there; internal fields (`w.__shown`) are for the
  predicates in `frames()`.
- Coverage of the addon's Lua is enforced (`npm run coverage`, which runs
  every test with coverage on; run it before opening a pull request, since CI
  runs it when a pull request is opened ready or marked ready for review (not a
  draft), on later pushes only while it carries the `full-tests` label, weekly,
  before a release and from the Actions tab, not on every push): a new feature comes with the
  scenario that exercises it. A pull request's own check runs only
  `smoke.test.mjs` from here.
- `npm run quality` applies to the tests too: every function has a comment
  above it and at most 10 lines of body code.
