# Vanguard's API for other addons

What another addon can ask of Vanguard: a skin in Vanguard's look, auction prices and shopping lists, and presets and options links. Each surface only grows: functions are added, never changed or removed.

## Skin API

```
## OptionalDeps: Vanguard
```
```lua
if Vanguard and Vanguard.RegisterSkin then
  Vanguard.RegisterSkin("MyAddon", function(S)
    S.Panel(MyFrame, { shadow = true }) -- flat panel, 1px border, sheen; shadow for floating windows
    S.Button(MyFrame.OkButton)
    S.EditBox(MyFrame.Input)
    S.CloseButton(MyFrame.Close)
    S.CheckBox(MyFrame.Option)       -- a CheckButton as a 16 px box with a check mark
    S.Radio(MyFrame.Choice)          -- a radio CheckButton as a 16 px ring with a dot
    S.ArrowButton(MyFrame.Next, "right")
    S.Slider(MyFrame.Volume)         -- a Slider (or MinimalSliderWithSteppers) as a pill track, quiet fill and round knob
    S.Divider(MyFrame.Rule)          -- a divider texture as one pixel of the divider colour
    S.Text(MyFrame.Title, "title")  -- text roles: title, heading, name, cell, label, number, small, tiny, world
    S.Color(MyFrame.Hint, "text2")  -- theme colors by name: text, text2, muted, accent, accentText, good, bad...
    S.Tint(MyFrame.Glow, "accent")
  end)
end
```

The callback runs once at login, or immediately if the addon registers after login. Errors in it are reported and don't break anything else. Painted frames follow `/vg accent` changes live, and their borders stay one screen pixel at any UI scale (`S.Pixel(frame)` gives that size). `S.RGB(name)` returns any theme color; the names, text roles and the rest of the look are listed in `docs/THEME.md` (from `Core/Theme.lua`). `S.apiVersion` is 1; the API only grows.

## Auction prices: Vanguard.API.v1

Vanguard keeps auction prices per realm and faction (from the Auction helper's scans and from every search at the auction house) and hands them to other addons through `Vanguard.API.v1`. Its function names and argument order are those of Auctionator's v1 API, as Vanguard's auction plan lists them (Auctionator's own source was not read when this was written), so an addon written for Auctionator can switch with a one-line shim:

```lua
-- ## OptionalDeps: Vanguard
local api = (Auctionator and Auctionator.API and Auctionator.API.v1) or (Vanguard and Vanguard.API and Vanguard.API.v1)
local price = api and api.GetAuctionPriceByItemID("MyAddon", 2589)
```

### Rules

- Every function takes your addon's name first (`callerID`, a string). A call without one, or with another argument of the wrong type, raises an error at your line that says which argument, for example `Vanguard.API.v1.MultiSearch: terms must be a table, got string`.
- Prices are in copper, for the realm and faction of the character logged in. A function returns `nil` when it knows no price.
- `v1` only grows: functions are added, never changed or removed.

### Prices

| Function | Returns |
| --- | --- |
| `GetAuctionPriceByItemID(callerID, itemID)` | The cheapest price per unit last seen at the auction house, by a scan or a search, or `nil` (never seen, or not for 30 days). |
| `GetAuctionPriceByItemLink(callerID, itemLink)` | The same, by an item link (or an `"item:2589"` string). |
| `GetVendorPriceByItemID(callerID, itemID)` | What a merchant pays for one (0 for an item with no value), or `nil` while the game hasn't loaded the item. |
| `GetVendorPriceByItemLink(callerID, itemLink)` | The same, by an item link. |
| `GetDisenchantPriceByItemID(callerID, itemID)` | What disenchanting one is worth on average: for each material vanilla's disenchanting tables give for its quality and item level, chance x average quantity x the material's market value (else its cheapest price). `nil` for anything but weapons and armour of green quality or better, or when none of its materials has a price. The tables are not yet checked in game. |
| `GetDisenchantPriceByItemLink(callerID, itemLink)` | The same, by an item link. |

### Being told about new prices

`RegisterForDBUpdate(callerID, callback)`: `callback()` runs, with no arguments, on the frame after prices are recorded: once after a whole scan, and after each search that saw a price. A callback that errors is reported in Vanguard's error list (`/vg errors`) and does not stop the others.

### Shopping lists and searches

Search strings are item names, as you would type them in the game's search box. In Auctionator's form, `name;field;field...`, only the name is read (quotes around it are dropped); an item link or an item ID written as text works too. A string that is blank, and anything that isn't a string, is left out. A list holds at most 50 entries and there are at most 20 lists (Vanguard's caps); they are the player's lists, shown on the Shop card at the auction house.

| Function | Does |
| --- | --- |
| `MultiSearch(callerID, terms)` | At the open auction house: the terms become the list "`callerID` search" (made, or replaced), which the Shop card picks and searches one term at a time (one search in flight, at most one a second). Returns `true` when queued, `false` when the auction house is closed, no term is usable or the list can't be made. |
| `MultiSearchExact(callerID, terms)` | The same, each name matched exactly: a name the game knows an item by is searched by that item's ID, so only that item comes back. |
| `CreateShoppingList(callerID, listName, terms)` | Makes the list (replacing one of that name). Returns `true`, or `false` for a blank name or a new list past 20. Works with the auction house closed. |
| `AlterShoppingListItems(callerID, listName, terms)` | Replaces the entries of an existing list. Returns `false` when there is no list of that name. |

Nothing in the API posts, buys, bids or cancels: those stay with the player's clicks.

## Presets and options links

Three more functions on the `Vanguard` table, next to `RegisterSkin`. They are version 1 of this surface (`Vanguard.apiVersion` is 1) and only grow: functions are added, never changed or removed. A call with a wrong kind of argument returns `false` and why; none raises an error, reads a game value or touches a protected frame, so they are safe to call at any time, in combat included.

```lua
-- ## OptionalDeps: Vanguard
if Vanguard and Vanguard.RegisterPreset then
  Vanguard.RegisterPreset("MyAddon tank", "VG1:parts:...", "Raid frames and nameplates for tanking.")
end
if Vanguard and Vanguard.OpenOptions then Vanguard.OpenOptions("profiles") end
```

| Function | Does |
| --- | --- |
| `Vanguard.RegisterPreset(name, string, info)` | Offers a profile string (from `/vg export`, partial or whole) on the Profiles page and to `/vg preset`. `name` is 1 to 32 characters; `string` begins `VG1:` and is at most 20000 characters; `info` (optional) is one line of at most 200 characters (`\|` is dropped). A name already offered is replaced, except Vanguard's own (Healer, Damage, Tank). At most 20 presets. Returns `true`, or `false` and why. The string is checked when the player applies it, not when you register it. |
| `Vanguard.GetPresets()` | The presets on offer, a copy: `{ name, info, builtIn }` each, in order. |
| `Vanguard.OpenOptions(page, setting)` | Opens the options window on `page` (`general`, `modules`, `unitframes`, `raid`, `actionbars`, `quests`, `bars`, `map`, `chat`, `tools`, `town`, `profiles`, `feedback`, or a module's own page key), scrolled to the first row whose caption contains `setting` (optional text). Returns `true`, or `false` for a page that doesn't exist. The key `more`, from before the Bars, map, chat page was split into five, still opens (`bars`). |

A preset never applies by itself. The player picks it on the Profiles page (or types `/vg preset <name>`), answers a question, and it is imported like `/vg import`: a backup of their profile first, a partial string merged key by key (their layout, theme and everything the string leaves out are kept), a whole profile saved as a new profile. In combat it is refused, and chat says to try again after the fight. Vanguard's own Healer, Damage and Tank presets are partial strings for the raid frames and nameplates.

Widget builders: the skin API's `S` table (see [Skin API](#skin-api)) already carries the theme builders (Panel, Button, EditBox, Tab, CheckBox, Radio, Divider, ArrowButton, Slider, ScrollBar, Tooltip, Text, Color and the rest); `W.*` builders stay private for now.
