# Auction helper: gap analysis against Auctionator, and the work plan

Date: 2026-10-04. ForeverUI at `bfef4e2` (main, after PR #81). Auctionator: the TheMouseNest/Auctionator addon (retail/"mainline" code path, which is what WoW Forever's modern auction house runs).

## How this was gathered, and what it rests on

- **ForeverUI side:** read line by line from `Modules/AuctionHelper.lua` (873 lines), `Modules/AuctionPrices.lua`, the options, slash and README entries, the 28 tests in `scripts/tests/auction.test.mjs`, and the `C_AuctionHouse` model in the test harness. Every claim about our side is from the code.
- **Auctionator side:** its repository could not be read from this environment (github.com, its API, archive host, CDN mirrors and the addon sites are all denied by the network policy). The feature list below comes from its published documentation and guides reached through web search, marked **[doc]**, and from my prior knowledge of its source layout and behaviour, marked **[prior]**. Anything marked [prior] should be re-checked against the code once github.com is allowed; the shape is right, the exact option names may differ.

Sources reached: the search-result pages for Auctionator's wiki API documentation, the Warcraft Tavern and NoobToBoss guides, CurseForge release notes (3.0.9, 3.1.5, 9.1.4, 9.1.6) and the Wago listing, plus the shopping-list how-to posts (Auction House Addict, Power Word: Gold).

## 1. Side by side

| Area | Auctionator | ForeverUI today | Gap |
|---|---|---|---|
| **Where it lives** | Its own tabs inside the auction house window (Shopping, Selling, Cancelling; Buying on Classic) [doc] | A 280 px panel docked left of the window with three stacked cards (Shop, Sell, Scan and your auctions) | Different shape, not a gap: ours fits the theme and never writes into Blizzard's frames. The cards are small (6 shop rows, 4 owned rows). |
| **Shopping lists** | Many named lists; create, rename, delete; import and export as strings (`^` between terms, `;` between fields) [doc]; "Recent searches" list [prior] | Up to 20 lists of 50 entries; create and add; right-click removes an entry. No rename, delete, import, export or recents. | **List management and import/export missing.** |
| **Search terms** | A term is a name plus filters: exact match (quoted), min/max level, min/max item level, min/max crafted level, min/max price, quality, tier/expansion, category [doc]; an editor dialog builds them [prior] | A term is an item ID or a plain name. No filters at all; a name search can show a different item (`BestResult` falls back to the first result). | **No filters; wrong-item risk on name searches.** |
| **Results view** | One row per item with min price and quantity, then a per-auction list (price, stack, quantity, seller, time left) sortable by column; buy from the list with a quantity dialog, Alt-click shortcut, keyboard navigation [doc/prior] | One row per list entry: icon, name, `x qty`, min unit price. Click hands the item to the game's browse list. Only the first page of browse results is read (`HasFullBrowseResults`/`RequestMore` unused). | **No per-auction view, no sorting, no buying.** Buying is a deliberate choice (the game's window buys), but the per-auction list is the piece players use most. |
| **Price database** | Prices per realm and faction, daily minimum kept 21 days, updated from full scans **and from every search's results** [doc/prior]; available quantity kept [prior] | Account-wide table, not keyed by realm or faction; daily lows kept 14 days; written only by the full scan; shop and sell searches never record prices; no quantity, no market value. Keyed by itemID only (item-level variants merge). | **Realm/faction scoping missing; searches don't feed the database; thinner history.** |
| **Full scan** | ReplicateItems scan, 15 min server limit; progress bar [prior] | Same, 400 rows per frame, "last scan N min ago" line. An aborted scan still spends the 15 minutes; own listings count toward the minimum. | Near parity. Two small fixes. |
| **Tooltips** | Vendor price, auction price (unit and stack), disenchant value, crafting cost; shift modifiers; age of data [doc/prior] | "AH: 12s 50c (today)" unit price with age; "Sells for" from the Tooltips module; "Sold by" from Vendor memory. No stack price, no disenchant, no crafting cost. | **No stack price, disenchant or crafting values.** |
| **Selling: item intake** | A bag view inside the tab, grouped by category, with favourites and "hide unposted"; click to load the sell form; Skip advances to the next item [doc/prior] | Drop or click an item onto a slot, or the game's own sell frame feeds the card through a `SetPostItem` post-hook. | **No bag view, no "next item" flow.** |
| **Selling: price** | Undercut the cheapest by a percentage or a static amount, or match [doc]; click any current listing to take its price [prior]; price history popup (per-day lows from scans) and "Your history" of posts [doc]; warns when under vendor price [prior]; minimum price as a share of vendor price [prior] | Rules: 1 copper, 1 silver, 1 %, match. Cheapest-now from the sell search (owner rows excluded), 7-day low only as a fallback base. No listing table, no manual price box, no posting history, no vendor floor. | **No price editing, no current-listings table, no posting history, no vendor floor.** |
| **Selling: quantity and stacks** | Quantity, stack size with Max, number of stacks, duration 12/24/48 h with "remember last" default, per-category default quantities [doc] | A commodity posts the whole dropped stack; an item posts one unit per click. No quantity, no stack size, no stack count, no duration picker (reads the game's CVar). | **Stacks and duration missing.** |
| **Selling: posting flow** | Enter posts; posts needing confirmation go through the game's popup because the form is Blizzard's [prior] | Post button only; when the game asks for confirmation the card says "list it from the game's own Sell tab" (the game's popup cannot confirm an addon post). | Confirmation is a real limit of posting from our own card; it needs an in-game check of how often the warning fires on Forever. |
| **Cancelling** | List of your auctions with sort; "Undercut scan" marks undercut ones; "Cancel undercut" cancels the next undercut each click, with a keyboard shortcut [doc] | "Check undercuts" marks them; Cancel per row. No "cancel next undercut", no shortcut, no sold/expired rows, no summary. | **No one-click-per-cancel flow across all undercut auctions.** |
| **Crafting info** | Reagent cost and profit in the profession window, plus "add reagents to shopping list" [doc/prior] | None. | **Missing.** |
| **Config** | Its own settings panel: tooltips, shopping, selling, cancelling, UI, shortcuts [doc]; `/auctionator`, `/atr` | Four rows under Bars, map, chat; `/fui ah ...` | Thin, but ForeverUI's options window is the right home. |
| **API for other addons** | `Auctionator.API.v1`: GetAuctionPriceByItemID/Link, GetVendorPriceByItemID/Link, GetDisenchantPriceByItemID/Link, RegisterForDBUpdate, MultiSearch/MultiSearchExact, ConvertToSearchString, shopping-list management [doc] | None. Other addons (bag addons, crafting helpers) can't read our prices. | **Missing**, and it matters: Forever addon authors will write against Auctionator's API first. |
| **Game versions and languages** | Retail, Classic Era, Cataclysm/MoP Classic; many locales [doc] | Forever only; English only. | Out of scope for a UI suite. |
| **Safety** | Standard addon practice | Restricted calls only inside clicks (tested); never writes into Blizzard's frames (tested); every number through the secret-value guard; 60 searches a minute. | Ours is stricter. Keep it. |

## 2. What we have that Auctionator doesn't

- A panel in the suite's own theme, with no second settings system and no extra tabs.
- Secret-value safety throughout, which Forever's instanced-combat rules will eventually force on every addon.
- Proven in a headless client: 28 tests, including the only-from-a-click proof for posting and cancelling.
- Vendor memory beside the auction price in the same tooltip, and a Keep-stocked list that already knows what you want to carry.

## 3. Gaps that matter, in order

Ranked by how often a vanilla player hits them.

1. **Selling is too thin to replace Auctionator for a seller.** No quantity or stack size, no duration picker, no manual price, no current-listings table. A player selling 200 Linen Cloth can't say "stacks of 20, 24 hours, 1 silver under the second-cheapest".
2. **Shopping results stop at one row per entry.** No per-auction list means no judgement call between a cheap small stack and a dear large one, and no sorting.
3. **The price database is weaker than it looks.** Mixed realms and factions, searches don't feed it, 14 days not 21, no quantity, no market value. On a fresh Forever realm the first weeks of prices are the most valuable data, and we only collect them on full scans.
4. **No cancel-next flow.** Cancelling five undercut auctions is five scrolls and clicks.
5. **No import/export, no list management.** Lists can't be shared between characters' accounts, guilds or from guides, and can't be deleted.
6. **No tooltip stack price, disenchant or crafting values.**
7. **No API.** Any Forever addon that wants prices will ask for Auctionator.

## 4. What "exceeding" looks like

Parity makes ours a themed Auctionator. Exceeding it means doing things Auctionator can't or doesn't, built on what the suite already has. Six candidates, each within Forever's rules (nothing protected outside a click, no secret arithmetic, one search in flight):

1. **Deals.** After any scan or list search, listings priced under the item's 7-day low (or under its vendor sell price) surface in a "Deals" card: name, price, how far under, and a click that opens the game's listing. Auctionator has no deal finder; TSM's needs a subscription. Vanilla's market is thin enough that this is useful every visit.
2. **Price alerts.** A per-item target price on a shopping entry ("Arcane Crystal under 20g"). Every scan or search that sees a listing under target plays the alert sound and shows a Chat-watch-style toast. Auctionator has nothing like it.
3. **Chat watch meets the auction house.** A "WTS" line in Trade that names an item we have a price for gets the toast line "AH: 12s 50c · they ask 10s": the player sees at a glance whether the trade offer beats the auction house. Nobody has this because nobody ships both halves.
4. **Instance prep and Keep-stocked buy lists.** One button on the prep card and in `/fui stock` turns the shortfalls into a shopping list and, at the auction house, searches it with the wanted quantities, so "I'm short 8 Greater Fire Protection Potions" becomes a search that shows the cheapest 8.
5. **A sales ledger.** Sold-auction mail (the game's "Auction successful" messages) and `AUCTION_HOUSE_AUCTION_CREATED`/`AUCTION_CANCELED` give a per-item record of what you listed, what sold, for how much and when; it feeds "Your history" on the sell card and a gold-from-auctions figure on the info strip beside gold per hour. Auctionator's posting history is listings only, not sales.
6. **Market value and age, not just the low.** Per item, a quantity-weighted market value from the scan (the price a chunk of the supply sits at, not the one undercutter), shown as "low / market" in tooltips with the data's age. It makes the undercut rule smarter: "match the market, never the outlier".

And two things to do better than Auctionator rather than differently:
- **Stack-aware posting for vanilla.** Default stack sizes by category that match how vanilla players buy (cloth 20, ore 20, herbs 20, potions 5, food 20), with "post N stacks" across the bag and a running "posted 3 of 10" line, all from one click per stack as the client requires, and the next stack loaded automatically.
- **Realm and faction scoping with per-day quantities**, kept 30 days, written by every search as well as scans.

## 5. Proposed work, in phases

Sizes: S under a day of lane time, M one to two, L more. Each is one commit with tests, as the suite's rules require. Everything stays inside the existing rules: restricted calls only from clicks, one search in flight, 60 a minute, secret guards, no writes into Blizzard's frames.

### Phase A: selling and cancelling parity (the biggest hole)

- [x] **A1 Sell form** (L): quantity, stack size with Max, number of stacks, a price box that accepts the suggestion or a typed price, per unit or per stack, bid for items, and a duration picker (1–3, labels from the game, "remember last"). Posting stays one click per stack; after each post the next stack loads and a "posted 3 of 10" line counts. Stop and skip buttons.
- [x] **A2 Current listings on the sell card** (M): the sell search's rows (price, quantity, time left, yours marked), scrollable, click a row to take its price. Read beyond the first page with `RequestMoreCommoditySearchResults`/`RequestMoreItemSearchResults`.
- [x] **A3 Vendor floor and warnings** (S): warn in the accent-red when the price is under the vendor sell price, and an option "never post under vendor price".
- [x] **A4 Cancel next undercut** (S): one button that cancels the first undercut auction on each click and advances; a count "3 undercut" after the check; optional re-check after each post.
- [x] **A5 Sold and expired rows** (S): show status from `OwnedAuctionInfo.status` and the expiry events; a "relist" shortcut that adds the item to the sell queue when it returns to the bag.

### Phase B: shopping parity

- [x] **B1 List management and import/export** (M): rename, delete, duplicate; export a list as text; import plain names, item IDs and Auctionator's `^`/`;` format (name and exact-match, level and quality fields; unsupported fields ignored and said so).
- [x] **B2 Search filters** (M): per entry, exact match, min/max level, quality, and a max price; the browse query carries `filters` and `minLevel`/`maxLevel`, and the exact-match flag uses `Enum.AuctionHouseFilter.ExactMatch`. Fixes the wrong-item fallback: a name entry matches only exact or contains-name results.
- [ ] **B3 Per-auction results** (L): clicking a shop row opens a second card (or replaces the shop rows) with every listing for that item from `SendSearchQuery`, sortable by unit price, quantity and time left, reading further pages on scroll; a row click still hands the game its listing for the buy. Keyboard: Up/Down rows, Enter to search.
- [ ] **B4 Recent searches** (S): the last 20 searched terms as a "Recent" pseudo-list.

### Phase C: the price database

- [x] **C1 Realm and faction scoping** (M): key the store by `GetRealmName()` + faction (or the connected-realm ID), with a one-time migration of today's account-wide prices into the current realm's table.
- [x] **C2 Searches feed the database** (S): every browse, sell and item search result records min price and quantity for its item, so prices grow between scans.
- [x] **C3 Richer history** (M): per day keep low, quantity and a quantity-weighted market value; keep 30 days; tooltips show "AH: low 12s · market 14s (today)" and stack totals when hovering a stack.
- [x] **C4 Scan fixes** (S): exclude own listings from the minimum; don't spend the 15 minutes on an aborted scan; count listings per item.

### Phase D: tooltips, crafting and the API

- [ ] **D1 Disenchant values** (M): vanilla's disenchant tables by item level and quality (the fixed vanilla tables, marked unverified until checked in game), priced from the database; a tooltip line and a column on the sell card.
- [ ] **D2 Crafting info** (M): in the profession window, reagent cost and profit from the database, and "add reagents to a shopping list" (which also joins Keep-stocked).
- [ ] **D3 An API** (S): `ForeverUI.API.v1` with `GetAuctionPriceByItemID/Link`, `GetVendorPriceByItemID/Link`, `GetDisenchantPriceByItemID/Link`, `RegisterForDBUpdate`, `MultiSearch`, `CreateShoppingList`/`AlterShoppingListItems`, mirroring Auctionator's names so addons written for it can switch with a one-line shim.

### Phase E: beyond Auctionator

- [ ] **E1 Deals card** (M): listings under the 7-day low or under vendor price, after any scan or search.
- [ ] **E2 Price alerts** (M): target prices on shopping entries; sound and toast through the Chat-watch toast.
- [ ] **E3 Chat watch price lines** (S): auction price beside a WTS/WTB line's item in the toast.
- [ ] **E4 Buy lists from Instance prep and Keep stocked** (S): shortfalls become a shopping list with wanted quantities; the shop shows "cheapest 8".
- [ ] **E5 Sales ledger** (L): from sold-auction mail and the auction events; "Your history" on the sell card; auction gold on the info strip.
- [x] **E6 Stack presets for vanilla** (S): default stack sizes by category; part of A1's form.

### Phase 0: split the module first

- [x] **S0 Split AuctionHelper.lua** (S): move the shop, sell and owned-auctions code into `Modules/AuctionShop.lua`, `Modules/AuctionSell.lua` and `Modules/AuctionOwned.lua` (the panel, queue, throttle and scan stay in `AuctionHelper.lua`), with no change in behaviour and every test passing unchanged, so the phases below can run in parallel without editing the same file.

### Order

A1, A2, A4 first (selling is the hole), then C1–C2 (data quality compounds with time: every day of unscoped, scan-only prices is lost data), then B1–B3, then D3 (the API makes the suite the price source for the Forever ecosystem), then E1–E4, with D1, D2 and E5 last.

## 6. Done list

Move finished tasks here with the commit hash.

## 7. In-game checks that gate all of this

Still unverified on Forever, and each phase above leans on them:
- Whether vanilla stackables are commodities (`C_AuctionHouse.GetItemCommodityStatus` on a bag item).
- Whether a post from the addon's button is accepted, and how often `AUCTION_HOUSE_POST_WARNING` fires.
- The hours behind the three durations.
- Whether the game's browse list shows the addon's `SearchForItemKeys` results on the Buy tab.
- How long `ReplicateItems` takes on a busy realm.
