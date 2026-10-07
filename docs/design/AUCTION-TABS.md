# Auction helper inside the auction house window: review and plan

Written 2026-10-07 against `main` at `be83552` (after PR #160). Read with `docs/handoff/AUCTION-PLAN.md`
(the feature gap analysis) and `docs/handoff/WORKPLAN.md` §0 (how to work). Every `file:line` is as
of that commit; if a line has moved, grep for the identifier quoted next to it.

The problem, in the owner's words: none of the auction panels can be dragged, and the new panels show
behind the game's window. The ask: dock the helper into tabs on the game's auction house window, and
review the whole auction UI to see how it should be reorganised to fit tabs.

Decided by the owner on 2026-10-07: two tabs, Shopping and Selling, with Deals as a list in Shopping;
a bag click stays with the game's Sell page; phase 1 (the dock) first, then phase 2 per tab.

---

## 1. What is there today

Everything the helper shows at the auction house hangs off one frame, built the first time the house
opens (`Modules/AuctionHelper.lua:206`, `AH.Build`):

| Piece | Frame | Where | Size | What it holds |
|---|---|---|---|---|
| The panel | `Vanguard_AuctionPanel`, child of UIParent | its top-right on the window's top-left, 4 px gap | 280 wide; as tall as the window (538) or as its cards need | the three cards below |
| Shop card | `AH.shopCard` | y −8, 196 tall | list dropdown (180), **+ Add** (76), **Search list** (120), **Restock** (76), progress line, **6 rows** at −74; a results view in its place: **Back**, icon and name, three columns (Unit price 100, Quantity 60, Time left 92), **6 rows**, status line, Up/Down/Enter |
| Sell card | `AH.sellCard` | y −210, 346 tall | 36 px drop slot, four lines (Cheapest now, 7-day low, Deposit, Your price), undercut segments, a two-column form (Quantity + Max, Stack + Max; Stacks, Bid; Price + per unit), the length segments, **Skip / Stop / Post** and a status line, a header and **4 listing rows** (or **Your history** in their place) |
| Scan and your auctions | `AH.scanCard` | y −564, 168 tall | **Scan the auction house** (150), the last-scan line, **Check undercuts** (120), **4 rows** of your auctions at −64 (mark, icon, name, price, Cancel or Relist), **Cancel next undercut** and its summary at −146 |
| Deals | `Vanguard_AuctionDeals`, child of the panel | its top-left on the window's top-right | 280 wide, 8 rows + heading | count on the right, status line, **8 rows** (icon, name, price, how far under), tooltips |
| Filters | `Vanguard_AuctionFilters`, DIALOG strata | right of the panel | 280 × 228 | exact, level range, quality, max price, alert |

Not part of this: the crafting panel beside the profession window (`Modules/AuctionCrafting.lua`),
the price-alert toast (`Modules/AuctionAlerts.lua`) and the tooltip lines. They stay where they are.

### What goes wrong

1. **It is behind the window.** The panel is a child of UIParent at UIParent's level; the game's window
   is `toplevel` and raises itself when clicked (`Blizzard_AuctionHouseFrame.xml:4`). Anything of ours
   that overlaps the window loses. The screenshot shows it: the Shop and Sell cards under the window's
   left edge, Deals under its right.
2. **It is not a mover.** `AH.Build` never calls `ns.Mover` (`Core/Movers.lua:123`), so `/vg unlock`
   shows no handle and nothing drags. A mover would not help much anyway: the panel is anchored to the
   window and the window is the game's to place.
3. **It does not fit.** The cards stack to 8 + 196 + 6 + 346 + 8 + 168 = 732 units; the window is 538.
   `size()` (`AuctionHelper.lua:187`) makes the panel as tall as the cards, so it hangs 200 units below
   the window, and `SetClampedToScreen` then pushes it around on a short screen.
4. **280 px is too narrow for what the cards show.** Item names are cut at 124 px from the right
   (`AH.RowParts`, `AuctionHelper.lua:98`); the sell form packs two fields a row; the results view has
   three columns in 264 px; the undercut and length segments are squeezed to 264.
5. **The row counts are tiny for the data.** Six shop rows for lists of up to 50 items; six listing
   rows for an item with hundreds of auctions; four of your auctions; four listings under the sell
   form; eight deals. Every list scrolls, and the wheel is the only way.
6. **The flows cross the gap.** Click a listing or a deal and "the game's own list shows that item, to
   buy there": the item is searched (`AH.Send`, `AuctionHelper.lua:121`, `s.open`) and the game's
   Buy page, beside our panel, shows it. That only works because both are visible at once. Buying
   stays the game's on purpose (nothing here buys), and that stays true in tabs; the hand-off has to
   become a tab switch (§3).
7. **Deals is on the other side.** The one card that answers "what should I buy" sits apart from the
   Shop card that answers "what do I want to buy".
8. **The filter dialog anchors to the panel.** `AH.EditFilters` (`AuctionShop.lua:859`) puts it on the
   panel's right, that is, over the window.

---

## 2. What the game's window gives us

From the Forever client's own UI source (`Blizzard_AuctionHouseUI`, branch `forever` of Blizzard's
`wow-ui-source`; the frame is `Shared/Blizzard_AuctionHouseFrame.{lua,xml}`, the tabs
`Shared/Blizzard_AuctionHouseTab.lua` and `Mainline/Blizzard_AuctionHouseTab.xml`):

- **The window** `AuctionHouseFrame` is 800 × 538, a `PortraitFrameTemplate` (so it has `SetTitle`),
  centred. The Windows module already skins it (`Modules/Windows.lua:46`, group `town`, on demand
  when `Blizzard_AuctionHouseUI` loads) and its tabs (`Modules/WindowsTabs.lua`, on every show).
- **The tabs** are three `AuctionHouseFrameDisplayModeTabTemplate` buttons (`BuyTab`, `SellTab`,
  `AuctionsTab`) in the `Tabs` parentArray, the first at the window's BOTTOMLEFT (20, −28), each next
  one anchored LEFT to the previous RIGHT at −15. Each carries a `displayMode`: a table naming the
  child frames to show. On load the window runs `PanelTemplates_SetNumTabs(self, #self.Tabs)` and
  fills `self.tabsForDisplayMode[tab.displayMode] = i`. A tab's OnClick calls
  `SetDisplayMode(self.displayMode)` on the window. The template sizes itself to its text on show
  (`PanelTemplates_TabResize`, min 70, padding 20).
- **`SetDisplayMode(mode)`** hides every child frame named anywhere in `AuctionHouseFrameDisplayMode`,
  shows the ones `mode` names, selects the tab `tabsForDisplayMode[mode]` with `PanelTemplates_SetTab`,
  calls `UpdateTitle` (Buy, Sell or Auctions by tab 1, 2, 3; any other tab gets the Buy title), and
  hides its dialogs and popups. It returns early when the mode is already the current one. The
  window's OnShow sets the Buy mode.
- **The content area**, from the game's own anchors: the search bar's top is at −29, the categories
  list starts 4 px in from the left, the sell frame runs from −69 down to 2 px above the money frame,
  the Auctions page from −42 to the same bottom; the money inset's top is 27 px up from the bottom.
  So a page of ours can use **x 4 … 796, y −30 … −508: about 790 × 478**, under the title and above
  the money line. At 20 px a row that is **room for about 20 rows** beside a toolbar and a header.
- **Adding a tab** is what Auctionator has done since the modern house arrived (8.3), and it has not
  tainted anything in that time: the window is not protected, and buying runs through
  `C_AuctionHouse` and static popups the game owns. In our terms:

  ```lua
  local tab = CreateFrame("Button", nil, AuctionHouseFrame, "AuctionHouseFrameDisplayModeTabTemplate")
  tab:SetText("Shopping")
  tab:SetPoint("LEFT", AuctionHouseFrame.Tabs[#AuctionHouseFrame.Tabs], "RIGHT", -15, 0)
  tab.displayMode = {}                      -- our own table: it names no game frame, so they all hide
  table.insert(AuctionHouseFrame.Tabs, tab)
  AuctionHouseFrame.tabsForDisplayMode[tab.displayMode] = #AuctionHouseFrame.Tabs
  PanelTemplates_SetNumTabs(AuctionHouseFrame, #AuctionHouseFrame.Tabs)
  hooksecurefunc(AuctionHouseFrame, "SetDisplayMode", function(f, mode) page:SetShown(mode == tab.displayMode) end)
  hooksecurefunc(AuctionHouseFrame, "UpdateTitle", function(f) if f.displayMode == tab.displayMode then f:SetTitle("Shopping") end end)
  ```

  This is the one place the helper writes into the game's frame (its `Tabs` list and the
  display-mode lookup) and the one method it calls on it (`SetDisplayMode`, to switch tabs).
  The module's header rule "nothing here touches the game's auction frames" (`AuctionHelper.lua:33`)
  becomes "the helper adds its tabs to the window's tab row and switches tabs; nothing else of the
  game's is touched".
- **Our tabs get the Vanguard look** the same way the game's do: `GW.DressTabs(AuctionHouseFrame)`
  (`WindowsTabs.lua:160`) dresses whatever is in `frame.Tabs` and is safe to run again; the tabs
  module runs it on every show of the window, so tabs added at the first show are dressed by the
  second, and the helper asks for it once at once through `GW.DressTabsNow` when the tabs are wanted.

---

## 3. The layout: two Vanguard tabs on the window

**Shopping** and **Selling**, after the game's Buy, Sell and Auctions. Two, not four: the row has room
for more (five tabs of 70–110 px fit under an 800 px window with room to spare), but each tab is a place
to look, and the helper's pieces fall into exactly two jobs. The names are distinct from the game's
tabs and are the ones Auctionator's players already know. While one of ours is selected the title
reads "Shopping" or "Selling". The floating panel, the Deals frame and their sizing code go.

### Shopping (buying side)

```
+-----------------------------+-----------------------------------------------------+
| LISTS                       | Shopping            [+ Add] [Search list] [Filters] |
|  Shopping              12   | Item                      Unit price   Up   Max    |
|  Mats                   8   | [ ] Linen Cloth             1s 20c    340   2s     |
|  Enchanting mats       31   | [ ] Strange Dust           12s  0c     12          |
|  Recent                20   |  ... about 20 rows ...                              |
|  Restock                5   |                                                     |
|  Deals                 14   |                                                     |
|                             |                                                     |
|  [New] [Rename] [Copy]      |                                                     |
|  [Delete] [Import] [Export] |                                                     |
|                             |                                                     |
|  Scan the auction house     |                                                     |
|  last scan 12 min ago       |  12 of 50 searched                                  |
+-----------------------------+-----------------------------------------------------+
```

- **Left pane (about 240 wide)**: the lists as rows, one per shopping list with its count, then
  Recent, Restock and **Deals** (a list the scans and searches write, so it belongs with the lists).
  The row selected is the list the right pane shows. Under them the list actions the dropdown's menu
  holds today (`AH.LIST_ACTIONS`, `AuctionShop.lua:727`: new, rename, duplicate, delete, import,
  export). At the bottom, **Scan the auction house** and the last-scan line (the scan feeds Deals and
  the tooltips, so it lives on the buying side).
- **Right pane (about 540 wide)**: the selected list as a table with a header: Item, Unit price,
  Available ("none up" when nothing is), Max price when a filter sets one; about 20 rows. The toolbar
  above it: **+ Add**, **Search list** with its progress ("12 of 50") and **Restock** when the Restock
  list is selected. Click a row: its listings replace the table (Back, the item, Unit price / Quantity
  / Time left, sortable headers, about 20 rows, Up/Down/Enter as today). Right-click: **Filters...**,
  **Remove**. **Deals** selected: Item, Unit price, Under by, Judged against (the tooltip's text as a
  column), the count in the heading.
- **Filters** opens centred over the window (DIALOG strata, as now), not beside anything.
- **Hand-off to the game's list**: a click on a listing or a deal sends the item's search as today and
  then `AuctionHouseFrame:SetDisplayMode(AuctionHouseFrameDisplayMode.Buy)`, so the game's Buy page
  comes up with the item. The player clicks Shopping to come back; the view and its place are kept.
  [VERIFY IN GAME]: the browse list shows the searched item after the switch, as it does beside the
  panel today.

### Selling (selling side)

```
+-----------------------------+-----------------------------------------------------+
| [slot] Cheapest now  1s 20c | Up now, each               Qty   Time left          |
|        7-day low     1s 10c | ■ 1s 10c                   20    Long               |
|        Deposit          5c  |   1s 20c                   340   Very long          |
|        Your price    1s 19c |  ... about 10 rows ...   [Up now | Your history]    |
| Undercut: 1c  1s  1%  Match |                                                     |
| Quantity [ 20] Max          +-----------------------------------------------------+
| Stack    [ 20] Max          | Your auctions   [Check undercuts] [Cancel next]     |
| Stacks   [  1]              | Item             Your price   Status      3 undercut|
| Bid      [    ]             | ■ Linen Cloth      1s 20c     up        [Cancel]    |
| Price    [1s 19c] per unit  |   Strange Dust    12s  0c     sold · 12s            |
| 12 h   24 h   48 h          |   Rough Stone       8c        expired · in bags [Relist]
| posted 3 of 10 [Skip][Stop][Post]  ... about 8 rows ...                           |
| sold 5 of 8 · avg 1s 12c    |                                                     |
+-----------------------------+-----------------------------------------------------+
```

- **Left pane (about 300 wide)**: the sell card as it is, one field a row now that there is height:
  slot and the four lines, undercut, Quantity + Max, Stack + Max, Stacks, Bid, Price + per unit, the
  length, the posting line with Skip / Stop / Post, and under it the item's one-line history ("sold 5
  of 8 · avg 1s 12c", from the ledger).
- **Right pane, top (about 10 rows)**: **Up now** for the item on the card (price per unit, quantity,
  time left, yours marked, click one to take its price), with **Your history** in its place on a
  toggle, as today.
- **Right pane, bottom (about 8 rows)**: **Your auctions**: Check undercuts, Cancel next undercut and
  its summary; rows with the item, your price, how it stands (up, sold · price, expired · by mail /
  in bags) and Cancel or Relist. The rows keep surviving the house closing, as now.
- The game's **bag click** still feeds the card (the `SetPostItem` post-hook, `AuctionSell.lua:673`).
  The game switches to its own Sell page when you click a bag item; the card has the item too, one
  tab over. The owner chose to leave the game's flow alone.

### Why not other shapes

- **One "Vanguard" tab with everything**: the three cards plus Deals need about 740 units of height
  side by side at 280 wide, or two rows of two; both leave the lists at six rows. The two-tab split
  gives each job the whole window.
- **A third tab for your auctions** ("Auctions+", "Undercuts"): the game already has an Auctions tab;
  two tabs named for the same thing confuse, and the undercut check, cancel and relist are steps of
  the selling loop, which the Selling tab's right pane has room for.
- **Deals as its own tab**: it is a list of items to buy; it reads as one more list in the Shopping
  pane, and a count beside it says when it is worth a look.
- **Keep the floating panel as an option**: two layouts to keep right is twice the testing; the tabs
  replace it. The `panel` setting stays as the switch for the tabs (its saved value carries over).

### Settings and text

- `panel` (`Core/Options.lua:454`): "Vanguard panel beside the auction house (lists, sell helper,
  scan)" → "Shopping and Selling tabs on the auction house". `deals` (line 446): "Deals card ..." →
  "Deals list in the Shopping tab". `scanButton` unchanged.
- `README.md:84` (Auction helper) and `:85` (Deals): "docks to the left of the game's window" → the
  tabs; `docs/SMOKE-TEST.md` gets a step per tab; `docs/handoff/AUCTION-PLAN.md` §1 "Where it lives"
  row.

---

## 4. Phasing

**Phase 1: dock what exists (one PR, branch `work/auction-tabs`).** The two tabs and two pages
(`Vanguard_AuctionShopping`, `Vanguard_AuctionSelling`), the display-mode and title hooks, the
`SetDisplayMode(Buy)` hand-off, the tab dressing, the filter dialog centred. The existing cards move
onto the pages with their internal layout kept and only their anchors changed: Shopping = Shop card
(full width less a 280 px right column) + Deals card in the right column with the scan button and
its line under it; Selling = Sell card in a 280 px left column + a "Your auctions" card on the right.
Row counts come from the page height (`AH.SHOP_ROWS`, `AH.VIEW_ROWS`, `AH.OWNED_ROWS`,
`AH.DEAL_ROWS`, `AH.LIST_ROWS` set in `AH.Build` before the cards are built), so the lists grow to
the room they have. The floating panel, the Deals frame and `size()` go. Tests: the panel tests in
`scripts/tests/auction.test.mjs:237-252` and `:289-298` become tab tests; the stub's window gains
the tab model (§5). README, options text, smoke test. This is the owner's screenshot fixed, and it is
small: the cards' code does not change.

**Phase 2: lay each tab out for the room (one PR per tab).** Shopping: the lists pane replaces the
dropdown and its menu; one table widget (header, sortable columns, rows, wheel and keyboard) shared
by the list table, the listings view, Deals and your auctions, grown from the view's
`AH.VIEW_COLUMNS` (`AuctionShop.lua:39`). Selling: the one-field-a-row form, the two right panes.
Deals becomes a list in the pane. **[VERIFY IN GAME]** per tab before the next.

**Phase 3: polish.** Reopen on the Vanguard tab last used (a setting), a count on the Shopping tab
while Deals has entries, Enter in + Add's dialog to add and search.

---

## 5. The harness and the repository's rules

- **Stub** (`scripts/lib/wow-world.lua:1462`, `auctionHouseFrame()`): the window gains `Tabs` (three
  Buttons with `displayMode` tables), `tabsForDisplayMode`, `displayMode`, `SetDisplayMode` with the
  game's select-and-title semantics, `SetTitle`, `UpdateTitle` and a `TitleContainer.TitleText`;
  `openAuctionHouse` sets the Buy mode as the game's OnShow does and `SetPostItem` the sell mode;
  globals `PanelTemplates_SetNumTabs`, `PanelTemplates_SetTab`, `PanelTemplates_GetSelectedTab`,
  `PanelTemplates_TabResize` (TEST-ONLY shapes of the game's) and `AuctionHouseFrameDisplayMode`;
  the template `AuctionHouseFrameDisplayModeTabTemplate` (kind Button) in
  `scripts/lib/wow-widget-api.lua` `templates`. `hooksecurefunc` exists (`wow-world.lua:144`).
- **`.luacheckrc`** `read_globals`: `PanelTemplates_SetNumTabs`, `AuctionHouseFrameDisplayMode`
  (the other PanelTemplates calls are the game's, not ours).
- **Code quality**: functions of 10 lines, a comment above each, colours and sizes through
  `Core/Theme.lua`; coverage floor 100 % of lines (`scripts/lua-coverage-floor.json`).
- **Taint hygiene**: our tab buttons are ours (no secure attributes); we never call
  `AuctionHouseFrame:SetDisplayMode` from an event handler during a protected moment (the house is
  closed in combat anyway, `AuctionHelper.lua:58`).
