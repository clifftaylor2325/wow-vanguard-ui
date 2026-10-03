# Design: click casting a healer can set up without typing

Status: proposal, 2026-10-03. Scope: `Modules/ClickCast.lua`, `Modules/ClickCastOptions.lua`,
`Core/Widgets.lua`, the raid-frame and unit-frame registration, the test harness.

## 1. Problem

Today the Click casting page is a form: press a key, pick an action from a cycle button,
*type* a spell name (or drag one from the spellbook) into a box, click Add. The list below
shows six rows of text. A new healer has to know their spells' exact names, cannot see
what is already bound to which button, has no help with ranks (vanilla healers downrank
constantly), and gets no starter layout. EllesmereUI's HoverCast page is better than a
text box but still a form; neither is as quick as VuhDo's grid, which is what people
who heal in vanilla remember.

Goal: a healer opens `/fui` → Click casting and, in under a minute and without typing,
has a working set of bindings for their class, can see the whole layout at a glance,
can change any cell with two clicks, and can test it before the raid.

## 2. What the player sees

### 2.1 Three ways in, same result

1. **Starter layout** (one click). A row of class cards at the top: "Priest healing
   layout", "Druid", "Paladin", "Shaman" (only the player's class is shown, plus "Empty").
   Clicking one fills the grid with the spells that character *already knows*; spells
   it does not know yet are shown dimmed with "not learned yet" and bind themselves when
   `SPELLS_CHANGED` says the spell appeared (the binding is stored by spell ID, so it is
   simply inert until then).
2. **The grid** (two clicks per cell). Rows are the five mouse buttons, columns are the
   modifier combinations (none, Shift, Ctrl, Alt, Shift+Ctrl, Shift+Alt, Ctrl+Alt). Each
   cell shows the bound spell's icon and name, or "—". Click a cell → the spell picker
   (2.2) opens anchored to it; pick → bound. Right-click a cell → clear. Drag a spell
   from the spellbook or a bar onto a cell → bound. Drag a cell onto another cell → move
   (swap if occupied).
3. **Hover keys** (press to bind). Under the grid, a "Keys while hovering" list with a
   big **Add key** button: "Press a key or scroll…" then the picker opens. The row shows
   the key in human form ("Shift + Q", "Wheel up"), the spell, and a small warning if
   that key is also an action-bar or game binding (`GetBindingAction(key)`), e.g.
   "also Action bar 1 slot 2 — off the frames the key keeps doing that".

The old free-text route stays as the last item of the picker ("Macro…" opens a text
box; "Something else…" accepts a typed spell name) so nothing is lost.

### 2.2 The spell picker

A popup list of what this character can cast on a friendly unit, grouped and iconed:

- **Heals** — direct heals and HoTs.
- **Protect & cleanse** — shields, dispels, cures, decurses.
- **Buffs** — single-target buffs (Fortitude, Mark of the Wild, blessings…).
- **Other** — the rest of the active, non-passive spellbook (Resurrection, Innervate…).
- **Actions** — Target, Unit menu, Focus, Assist, Macro…, Something else…

A search box at the top filters by name as you type (optional, not required). Hovering
a row shows the game's spell tooltip. The character's spellbook is the only source;
passives, off-spec and unlearned entries never appear.

**Ranks.** Vanilla spells have ranks as separate spellbook entries. The picker collapses
them: one row per spell, bound as "max rank" by default (cast by spell *name*, which the
client resolves to the highest known rank, so a newly learned rank applies by itself).
A small chevron on the row expands the ranks ("Flash Heal — Rank 1 … Rank 7") for
healers who downrank; a specific rank is bound by its spell ID and is labelled
"Rank 3" in the cell. On clients without ranks (retail-style spellbooks) the chevron
never shows.

**Grouping rules.** `C_Spell.IsSpellHelpful(id)` (guarded) splits friendly-castable
from the rest. Within friendly spells, a small per-class table of spell IDs in
`Modules/ClickCastSpells.lua` assigns Heals / Protect & cleanse / Buffs; anything not in
the table lands in Other. The table also drives the starter layouts. It is data, lives
in one file, and has a test that every ID resolves to a name in the harness world.

### 2.3 Try it before the raid

A **Test** toggle turns the page's sample tile (a real raid button, unit = player) into
a sandbox: hover it and press a key or click, and a line under it says what *would*
happen — "Shift + Right click → Renew (Rank 5) on Cliff" — without casting (the sample
tile's secure attributes are read with `SecureButton_GetModifiedAttribute` logic
reproduced insecurely from the saved bindings, not by clicking through). Keys that
collide with game bindings show the collision here too.

### 2.4 Guard rails

- Left click unmodified is Target and right click unmodified is the unit menu unless
  the player overrides them; overriding either shows a one-line note ("You won't be
  able to target by clicking; Alt + Left click still targets" — the layout always keeps
  one Target cell and says which).
- In combat the grid is read-only with a banner ("Changes apply when the fight ends");
  the editor still accepts changes and queues them through `ns.OutOfCombat`, as today.
- Without secure snippets (`ns.Client.ProbeSnippets()` false) the hover-key section
  shows why it is off and the mouse grid keeps working, as today.
- Every change applies immediately out of combat; no Add button, no reload.

### 2.5 Sharing

"Copy to…" (other spec, where the client has specs), "Export" (one string, same
serializer as profiles) and "Import" on the page; `/fui binds export|import` as the
slash form. A layout string carries spell IDs plus names, so it imports on another
character of the same class and dims what that character has not learned.

## 3. Data model

Binding records gain fields; old records keep working.

```lua
{ key = "shift-BUTTON2",      -- unchanged
  action = "spell",           -- spell | macro | target | menu | focus | assist
  spellID = 6076,             -- new: the ID that was picked (a rank's own ID when a rank was chosen)
  rank = nil,                 -- new: nil = max rank (cast by name), or the rank number for display
  value = "Renew" }           -- the name; still what the secure attribute gets when rank is nil
```

Casting: `spell` attribute = `value` (name) when `rank == nil`, else `spellID` (number;
the `spell` attribute accepts an ID on 12.x — confirm on Forever in the smoke test).
`macro` keeps `macrotext`. `focus` and `assist` are new `type` values.

Migration (`ns.MigrateDB`): a record with `action = "spell"` and no `spellID` is looked
up once by name through `C_Spell.GetSpellInfo`; if found, `spellID` is filled in; if
not, it is kept as a name-only binding and the grid cell shows a "?" icon with "spell
not known on this character".

Storage stays per character and per spec in `ForeverUICharDB.clickcast`. Starter
layouts are templates, not stored; applying one writes ordinary records.

## 4. Implementation notes

- **Spellbook enumeration** (new `Modules/ClickCastSpells.lua`): walk
  `C_SpellBook.GetNumSpellBookSkillLines()` → `GetSpellBookSkillLineInfo(i)` → items
  `itemIndexOffset+1 … +numSpellBookItems` with `GetSpellBookItemInfo(idx,
  Enum.SpellBookSpellBank.Player)`; keep `itemType == Spell`, not `isPassive`, not
  `isOffSpec`; read name/icon with `C_Spell.GetSpellInfo`. Group ranks by name. Cache
  the list and rebuild on `SPELLS_CHANGED`/`LEARNED_SPELL_IN_TAB`. Every call is
  guarded with `type(...) == "function"` per the repo rule, and each name goes into
  `.luacheckrc` `read_globals` and `scripts/lib/wow-widget-api.lua` where applicable.
  The harness world (`scripts/lib/wow-world.lua`) needs a spellbook: a list of
  `{ id, name, rank, icon, helpful, passive }` per test character.
- **Widgets**: `W.Grid` (cells with icon + label + drop target, built on
  `ns.DialogButton`), `W.Picker` (scrolling list with groups, search, tooltips; reuse
  `W.Search`, `W.Dropdown` menu machinery), `W.ClassCard`. Drag-and-drop uses
  `GetCursorInfo()` as the current drop handler does, extended to `"spell"` with a
  spellbook index and to internal cell moves.
- **Apply**: unchanged mechanics (`setAction`, `CC.EnterSnippet`, `wrap`); the only
  change is choosing name vs ID per record and the two new secure types. Hover keys
  keep the `*` prefix fix from WORKPLAN P2.7.
- **Collision check**: `GetBindingAction(key)` and the action bars' own key map; purely
  informational.
- **Spell data file**: per class, ordered lists of spell IDs for Heals, Protect &
  cleanse, Buffs, and the starter layout as `{ key = "BUTTON1", spell = <id or name> }`
  rows. IDs come from the Forever client (verify in game; keep names alongside so a
  wrong ID degrades to a name).

### Starter layouts (first draft; adjust after in-game testing)

| Button | Priest | Druid | Paladin | Shaman |
| --- | --- | --- | --- | --- |
| Left | Target | Target | Target | Target |
| Right | Flash Heal | Rejuvenation | Flash of Light | Lesser Healing Wave |
| Shift + Left | Greater Heal | Healing Touch | Holy Light | Healing Wave |
| Shift + Right | Renew | Regrowth | Blessing of Protection | Chain Heal |
| Ctrl + Left | Dispel Magic | Remove Curse | Cleanse | Cure Poison |
| Ctrl + Right | Cure Disease | Abolish Poison | Purify | Cure Disease |
| Alt + Left | Power Word: Shield | Swiftmend | Lay on Hands | Ancestral Spirit |
| Alt + Right | Resurrection | Rebirth | Redemption | Nature's Swiftness |
| Middle | Unit menu | Unit menu | Unit menu | Unit menu |

Each layout binds by name (max rank), so it works from level 1 up and dims what is not
learned.

## 5. Phases

| Phase | What | Size |
| --- | --- | --- |
| 1 | Data model + migration; `spellID`/`rank`; `focus`/`assist` types; spellbook enumeration with harness support | M |
| 2 | Spell picker popup (groups, ranks, search, tooltips, Macro…/Something else…) replacing the text box in the existing editor | M |
| 3 | The grid (cells, click/right-click/drag), hover-key list with press-to-bind and collision notes; old editor removed | M |
| 4 | Starter layouts + spell data file + class cards | S |
| 5 | Test mode on the sample tile; combat banner; guard-rail notes | S |
| 6 | Copy to spec, export/import, `/fui binds export|import` | S |

Phases 1–3 are the core; 4 is what makes it "under a minute". Each phase keeps the
100 % coverage floor: the harness gets a spellbook and a `GetCursorInfo` spell cursor.

## 6. Open questions

1. Does Forever's `spell` secure attribute accept a numeric spell ID (needed for exact
   ranks)? If not, bind ranks by `"Flash Heal(Rank 3)"` name syntax, which the client
   has honored since vanilla.
2. Is `C_Spell.IsSpellHelpful` present on Forever? Fallback: the per-class table alone
   decides grouping; everything else is Other.
3. Should the grid default to 7 modifier columns or 4 (none/Shift/Ctrl/Alt) with a
   "More modifiers" toggle? Suggest 4 by default; VuhDo users will ask for the rest.
4. WORKPLAN P3.10 (use the game's Click Cast Bindings) stays an alternative; if it is
   adopted, the picker and grid here can write to it instead of to secure attributes.
