# Forever API facts (from Blizzard's UI source)

Ten questions the bug hunt of 2026-11-10 could not settle from the addon's own code, answered from the game's UI
source, and an eleventh (section 11) that an error from the game raised the same evening. Research, not spec: nothing here was checked in the game but the error section 11 quotes, and each section ends with what the source cannot
tell and the in-game check that would. The hunt's hand-off is [../handoff/BUG-HUNT-HANDOFF-2026-11-10.md](../handoff/BUG-HUNT-HANDOFF-2026-11-10.md).

Source: Blizzard's wow-ui-source, branch `forever` (build 1.60.1.70170; the source at hand now is build 1.60.1.70888, which this page has not been rechecked against). Paths below are under `Interface/AddOns/`.
"Doc" means `Blizzard_APIDocumentationGenerated`, which is generated from the client and lists the APIs it exposes.
Line numbers are that build's and will drift: grep for the identifier quoted.

## 1. Auction posting

**Verdict:** Forever uses the modern auction house (`Blizzard_AuctionHouseUI`, `C_AuctionHouse`). It has no legacy
auction UI. An item (non-commodity) post sends `C_AuctionHouse.PostItem(item, duration, quantity, bid, buyout)`. The bid and
buyout are **per item**, and the total shown is quantity times price, so a quantity of n makes n one-item auctions at
the unit price, with the multisell progress bar counting them.

- The UI loads on Forever: `Blizzard_AuctionHouseUI/Blizzard_AuctionHouseUI.toc:2` (`LoadOnDemand: 1`), `:9`
  (`AllowLoadGameType: mainline, cata, mists`), `:15` (`[Game]\Blizzard_AuctionData.lua [AllowLoadGameType camelot]`,
  the only Forever-specific file, which holds categories alone: `Camelot/Blizzard_AuctionData.lua`). No `Blizzard_AuctionUI`
  folder exists, and `PostAuction` and `GetAuctionItemInfo` appear nowhere in the Doc files (grep finds nothing).
- Post: `Shared/Blizzard_AuctionHouseItemSellFrame.lua:479-485` (`GetPostDetails` returns item, duration, quantity, bid,
  buyout), `:488-499` (`StartPost` calls `C_AuctionHouse.PostItem(...)`, then `ConfirmPostItem` with the same values at `:504-508`).
- Per-item price: `Shared/Blizzard_AuctionHouseItemSellFrame.lua:438-441` (`GetTotalPrice = quantity * (buyout or bid or 0)`);
  the price box is labelled `AUCTION_HOUSE_UNIT_PRICE_LABEL` (`Shared/Blizzard_AuctionHouseSellFrame.xml:235-238`); the
  bid box is `SecondaryPriceInput`, `AUCTION_HOUSE_BID_LABEL` (`Shared/Blizzard_AuctionHouseItemSellFrame.xml:19-24`).
  A zero price is sent as nil (`:443-455`), and a buyout at or below the bid is refused (`:471-473`).
- n auctions: `Shared/Blizzard_AuctionHouseItemSellFrame.lua:101` (`AuctionHouseMultisellProgressFrame:Start(itemTexture, self:GetQuantity())`).
- Signatures: Doc `AuctionHouseDocumentation.lua:883-893` (`PostItem(item, duration, quantity, bid?, buyout?)`, bid Nilable),
  `:864-874` (`PostCommodity(item, duration, quantity, unitPrice)`).
- **Commodities:** the routing is the client's answer per item: `Shared/Blizzard_AuctionHouseFrame.lua:613-625`
  (`C_AuctionHouse.GetItemCommodityStatus(itemLocation)`: Commodity goes to the commodities sell frame and `PostCommodity`, Item
  goes to the item sell frame). **Unknowable from source:** which vanilla items the server classes as commodities. That is server
  data, so it needs an in-game check (`/dump C_AuctionHouse.GetItemCommodityStatus(ItemLocation:CreateFromBagAndSlot(b, s))`).
- **No buyout:** `buyoutAmount` is `Nilable = true` (Doc `AuctionHouseDocumentation.lua:1588`, AuctionInfo, WOWMONEY;
  `:1603`, BidInfo; the item search result struct has the same field). Source gives nil as the value to expect. Whether the client
  ever sends 0 instead can't be told from Lua, so treat both nil and 0 as no buyout.
- **Cancel and double clicks:** the game's Cancel button never calls `CanCancelAuction`. A click shows the static popup
  `CANCEL_AUCTION` with the auction ID (`Shared/Blizzard_AuctionHouseAuctionsFrame.lua:121-125`, `:500-502`), and the cancel
  goes through only on Accept (`Shared/Blizzard_AuctionHouseFrame.lua:77-97`: `OnAccept` calls `C_AuctionHouse.CancelAuction(data.auctionID)`,
  `exclusive = 1`). The popup is the game's double-click guard. The button is enabled only for a selected, unsold auction
  (`Shared/Blizzard_AuctionHouseAuctionsFrame.lua:461-463`). `CanCancelAuction` exists (Doc `AuctionHouseDocumentation.lua:45`)
  but the game's UI doesn't use it.

## 2. Secret-safe visibility: how to hide or fade a region from a secret value

**Verdict:** addon (tainted) code **may not** pass a secret to `SetShown`, `SetPoint`, `SetWidth` and the like. Those take secrets
only from untainted code. The setters that do take a secret from addon code are `SetAlpha`, `SetAlphaFromBoolean`,
`SetVertexColor`, `SetVertexColorFromBoolean`, `SetText`, `SetValue`, `SetMinMaxValues`, `SetStatusBarColor` and the texture setters.
So the secret-safe way to hide a region is by alpha: `region:SetAlphaFromBoolean(secretBool, 1, 0)`, or `SetAlpha(secretNumber)`.
Blizzard says this in so many words:

> `Blizzard_UnitFrame/Shared/UnitFrameUtil.lua:487` — "Tainted callers must apply showRoleIcon with SetAlphaFromBoolean; SetShown does not accept secret arguments from tainted execution."

Evidence (Doc = `Blizzard_APIDocumentationGenerated`; `SecretArguments` says who may pass a secret):
- `SimpleScriptRegionAPIDocumentation.lua:725-728` (Region `SetShown`) and `SimpleFrameAPIDocumentation.lua:1484-1488` (Frame `SetShown`,
  also `IsProtectedFunction`): `SecretArguments = "AllowedWhenUntainted"`. `SetPoint` (`SimpleScriptRegionResizingAPIDocumentation.lua:135-139`)
  and `SetWidth` (`:175-178`) are the same.
- `SimpleRegionAPIDocumentation.lua:123-145` (`SetAlpha`, `SetAlphaFromBoolean(value, alphaIfTrue = 255?, alphaIfFalse = 0)`: note the
  defaults are written as 255 and 0, so pass 1 and 0 yourself) and `:191-216` (`SetVertexColor`, `SetVertexColorFromBoolean(value, colorIfTrue, colorIfFalse)`):
  `"AllowedWhenTainted"`. Frame `SetAlpha` and `SetAlphaFromBoolean`: `SimpleFrameAPIDocumentation.lua:1134-1150`, same.
  FontString `SetText`: `SimpleFontStringAPIDocumentation.lua:664-667`, AllowedWhenTainted. StatusBar `SetMinMaxValues`, `SetStatusBarColor`, `SetValue`:
  `SimpleStatusBarAPIDocumentation.lua:229-232`, `:282-285`, `:355-358`, AllowedWhenTainted.
- Curves: `C_CurveUtil.CreateCurve`, `CreateColorCurve`, `EvaluateColorFromBoolean(bool, colorIfTrue, colorIfFalse)` ("Evaluates a
  potentially-secret boolean value and returns a color") and `EvaluateColorValueFromBoolean` ("returns a single color component (eg. alpha)"):
  `CurveUtilDocumentation.lua:11-63`. A colour curve's `Evaluate` returns a `colorRGBA`, and `EvaluateUnpacked` returns `yR, yG, yB, yA`, so
  **alpha is carried** (`LuaColorCurveObjectAPIDocumentation.lua:47-80`). `SetToDefaults` "clears the secret values flag" (`:151-153`), meaning a curve
  becomes secret once a secret has gone through it.
- `UnitHealthPercent(unit, usePredicted = true, curve?)`: "Returns percent of health remaining - can be scaled via a curve for display
  purposes", `SecretReturns = true`, `SecretWhenCurveSecret = true` (`UnitDocumentation.lua:1506-1518`). The result is secret. Hand it to
  `SetValue` or `SetAlpha`, or run it through a curve and hand the result to a setter, and never compare it.
- The game's own curve use: `Blizzard_SharedXMLBase/CurveConstants.lua:4-21` (`ZeroToOne`, `ScaleTo100`, `Reverse`, `ReverseTo100`), and the encounter
  timeline's alpha curves (`Blizzard_EncounterTimeline/EncounterTimelineConstants.lua:181-194`).
- **Unknowable from source:** Forever's Lua has no low-health or nameplate code path that fades from a secret by curve (a
  whole-tree search for `UnitHealthPercent(`, `SetAlphaFromBoolean` and `SetVertexColorFromBoolean` finds only the comment above). That is because
  Blizzard's own frames run untainted and simply call `SetShown` or `SetAlpha` with the secret. So there's no example in Blizzard code to copy,
  and the Doc entries are the contract.

## 3. Which widget getters can return a secret, and the stated rules

**Verdict:** the read-back bug class is **wide**. The client documents secret "aspects": a widget that has been *given* a
secret through a setter takes on that aspect, and from then on the matching getter returns a secret. Every getter in
the hunt's list is covered: `IsShown`/`IsVisible` (Shown), `GetAlpha`/`GetEffectiveAlpha` (Alpha), `GetValue`/`GetMinMaxValues` (BarValue),
`GetText` (Text), `GetTextColor`/`GetVertexColor`/`GetStatusBarColor` (VertexColor and Alpha), `GetScale`/`GetEffectiveScale` (Scale),
`GetFrameLevel`, `GetID`, `IsEnabled`/`GetButtonState` (ButtonState), `GetChildren`/`GetRegions`/`GetParent` (Hierarchy), `GetTexCoord`, `GetRotation`
and more. `GetWidth`, `GetHeight`, `GetSize`, `GetPoint`, `GetPointByName`, and a font string's `GetStringWidth`, `GetStringHeight`, `GetNumLines`, `IsTruncated` and
`GetWrappedWidth` are secret "when anchoring secret" (`SecretWhenAnchoringSecret`, checked with `IsAnchoringSecret()`).

- The aspects: `SecretAspectConstantsDocumentation.lua:6-43` (`Text`, `Shown`, `Scale`, `Alpha`, `FrameLevel`, `VertexColor`,
  `Desaturation`, `TexCoords`, `BarValue`, `Cooldown`, `Rotation`, `ButtonState`, `FrameStrata`, `Hierarchy`, `ObjectName`, …).
- The setters that add an aspect when given a secret (`SecretArgumentsAddAspect`): `SimpleRegionAPIDocumentation.lua:123` `SetAlpha`
  → Alpha, `:191` `SetVertexColor` → VertexColor and Alpha; `SimpleScriptRegionAPIDocumentation.lua:725` `SetShown` → Shown;
  `SimpleFontStringAPIDocumentation.lua:664` `SetText` → Text, `:675` `SetTextColor` → VertexColor and Alpha; `SimpleStatusBarAPIDocumentation.lua:229` `SetMinMaxValues`,
  `:355` `SetValue` → BarValue, `:282` `SetStatusBarColor` → VertexColor and Alpha; `SimpleFrameAPIDocumentation.lua:1281` `SetFrameLevel`, `:1472` `SetScale`,
  `:1484` `SetShown`; `SimpleButtonAPIDocumentation.lua:336` `SetEnabled`, `:476` `SetText`; texture `SetDesaturated`, `SetTexCoord`, `SetRotation`
  (`SimpleTextureBaseAPIDocumentation.lua:417-580`).
- The getters that return a secret for an aspect (`SecretReturnsForAspect`): `SimpleScriptRegionAPIDocumentation.lua:568-570` (`IsShown`, Shown),
  `IsVisible` likewise; `SimpleRegionAPIDocumentation.lua` `GetAlpha` (Alpha), `GetVertexColor` (VertexColor and Alpha), `GetScale` and `GetEffectiveScale`;
  `SimpleFrameAPIDocumentation.lua` `GetAlpha`, `GetEffectiveAlpha`, `GetFrameLevel`, `GetID`, `GetChildren`, `GetRegions`, `IsShown`, `IsVisible`;
  `SimpleFontStringAPIDocumentation.lua` `GetText` (Text), `GetTextColor`; `SimpleStatusBarAPIDocumentation.lua` `GetValue`, `GetMinMaxValues`,
  `GetStatusBarColor`; `SimpleButtonAPIDocumentation.lua` `GetText`, `IsEnabled`.
- Geometry: `SimpleScriptRegionResizingAPIDocumentation.lua:65-69` (`GetPoint`), `:91` (`GetPointByName`), `:161-164` (`GetHeight`), `:276-279`
  (`GetSize`), `:323-326` (`GetWidth`): `SecretWhenAnchoringSecret = true`. Font string measures: `SimpleFontStringAPIDocumentation.lua:231, 327, 341, 400-444`.
- The checks: `HasSecretAspect`, `HasAnySecretAspect`, `HasSecretValues`, `IsPreventingSecretValues` (`SimpleFrameScriptObjectAPIDocumentation.lua`),
  `IsAnchoringSecret` (`SimpleScriptRegionResizingAPIDocumentation.lua:414`).
- **How Blizzard's code treats getters:** it doesn't wrap them. A search of the whole tree finds `issecretvalue` and `canaccessvalue` only on
  data values (chat filters `Blizzard_ChatFrameBase/Shared/ChatFrameFilters.lua:37,116`, damage meter icons `Blizzard_DamageMeter/DamageMeterEntry.lua:54`,
  pools `Blizzard_SharedXMLBase/Pools.lua:274`, secure containers `Blizzard_SharedXMLBase/SecureTypes.lua:34-357`, the restricted environment). No
  widget getter is ever wrapped, because Blizzard's frames run untainted, where reading a secret is allowed.
- **Stated rules:** the prose rules are `Blizzard_APIDocumentationGenerated/SecretPredicatesDocumentation.lua`, one sentence per predicate
  (see §10). For widgets, `:22-25` says: "`RequiresFontStringTextAccess` — Guarded APIs reject access for tainted callers if the object has the secret
  Text aspect assigned", and `:75-77`: "`SecretWhenAnchoringSecret` — … produce secret values when an object has secret anchoring information".
  On top of that, every function carries the flag `SecretArguments = "AllowedWhenTainted" | "AllowedWhenUntainted"`, which says who may pass it a secret.
  The other prose statement is the comment quoted in §2.
- **Unknowable from source:** whether an aspect is ever cleared once set (for example, does a later plain `SetShown(true)` clear Shown?). The Doc
  documents no clearing setter except `SetToDefaults` on curves. Assume a region fed a secret stays secret in that aspect until proven otherwise.
  The error in #838 fits this: the client drives an edge's `Shown` from secret data, and `IsShown()` then returns a secret.

## 4. Loot method

**Verdict:** use `C_PartyInfo.GetLootMethod()` and `Enum.LootMethod`. The old global `GetLootMethod` isn't used anywhere in the game's code,
and the generated docs don't list it (they cover namespaced APIs, so this doesn't prove the global is absent; check it in game with
`/dump GetLootMethod`). The game's own loot frame **doesn't check the method**: a click calls `LootSlot`, and the client answers with
`OPEN_MASTER_LOOT_LIST` when you are the master looter.

- `C_PartyInfo.GetLootMethod()` returns `method` (LootMethod, not nil), `masterLootPartyID?` and `masterLooterRaidID?`: Doc `PartyInfoDocumentation.lua:287-296`;
  `SetLootMethod` is at `:562`.
- `Enum.LootMethod`: Freeforall 0, Roundrobin 1, Masterlooter 2, Group 3, Needbeforegreed 4, Personal 5: Doc `LootConstantsDocumentation.lua:6-20`.
- Game use: `Blizzard_FrameXML/Mainline/LootHistory.lua:552` (`C_PartyInfo.GetLootMethod() ~= Enum.LootMethod.Masterlooter`);
  the party menu (`Blizzard_UnitPopup/Mainline/UnitPopupButtons.lua:616-743`, including `C_PartyInfo.IsLootMethodAvailable`).
- Master loot flow: `Blizzard_UIPanels_Game/Mainline/LootFrame.lua:64-86` (OnClick sets `LootFrame.selectedLootFrame`/`selectedSlot`, calls `LootSlot`);
  `Blizzard_UIPanels_Game/Mainline/GroupLootFrame.lua:304-309` (`OPEN_MASTER_LOOT_LIST` opens the "Assign loot / Request roll" menu, and Assign
  loot calls `MasterLooterFrame_Show`, `:196-206`, `:882-911`). The comment at `:304` reads "Requires retest if/when this feature is reenabled".
- **Unknowable from source:** whether Forever's servers offer master loot at all (`C_PartyInfo.IsLootMethodAvailable(Enum.LootMethod.Masterlooter)`
  answers that in game).

## 5. Trainer type

**Verdict:** `C_Trainer.GetTrainerType()` returns `Enum.TrainerType` (General 0, TalentsObsolete 1, Tradeskills 2, Pet 3). The trainer
frame uses it to tell a pet trainer apart, and `IsTradeskillTrainer()` for professions.

- Doc `TrainerDocumentation.lua:20` (`GetTrainerType`), `TrainerConstantsDocumentation.lua:6-17` (the enum).
- `Blizzard_TrainerUI/Mainline/Blizzard_TrainerUI.lua:444` and `:571-577` (Pet: show `trainingPoints`, the training points line), `:611`
  (`elementData.trainerType == Enum.TrainerType.Pet` marks a pet skill), `:871` (`IsTradeskillTrainer()`).
- Forever only: `Blizzard_TrainerUI/Mainline/Blizzard_TrainerUI_Camelot.lua:9-11` (`TrainerUI_UseCategories()` is
  `GetTrainerType() ~= Pet`: a pet trainer's list has no category headers). Loaded by `Blizzard_TrainerUI.toc:7` `[AllowLoadGameType camelot]`;
  the addon is LoadOnDemand (`:2`).

## 6. Bank

**Verdict:** `BankFrame`, with its `BankPanel` child, is made **at login**. It lives in `Blizzard_UIPanels_Game`, which isn't load-on-demand,
in a Forever-only file pair. Forever's bank is the modern tabbed bank panel, with the vanilla bank bags standing in as the "purchased tabs":
`C_Bank.FetchPurchasedBankTabData(Enum.BankType.Character)` lists them (each `tabData.ID` is a container ID), and the frame splits their slots
into pages.

- `Blizzard_UIPanels_Game/Blizzard_UIPanels_Game.toc:137-142` (`[Game]\BankFrame.lua`, `[Game]\BankFrame.xml [AllowLoadGameType camelot]`; the
  Mainline XML is `[ExcludeLoadGameType camelot]`); the panel is registered at `BankFrameRegistration.lua:11`.
- `Camelot/BankFrame.xml:59` (`<Frame name="BankFrame" inherits="BankFrameTemplate" mixin="BankFrameMixin">`), `:86` (`<Frame name="BankPanel"
  parentKey="BankPanel" … inherits="BankPanelTemplate">`), `:40` (page tabs are `LargeSideTabButtonTemplate`, from a pool).
- `Camelot/BankFrame.lua:86-102` (`GetNumPagesForBankType`: one page unless `C_Bank.ShouldUsePlayerBagsInBank()`, else the slots of every purchased
  tab, `C_Container.GetContainerNumSlots(tabData.ID)`, divided into pages); `:104-132` (page tabs for Character, then Account if `C_Bank.CanViewBank`);
  `:140-160` (bag-slot buttons for bags 2 to `C_Bank.FetchMaxNumBankTabs`, from the same tab data, with a red "No BankTab data found" error when nil).
- Doc `BankDocumentation.lua:241-247` (`FetchPurchasedBankTabData(bankType)`), `:322-327` (`ShouldUsePlayerBagsInBank`).
- **Unknowable from source:** the exact container IDs Forever returns (likely the classic `BANK_CONTAINER` plus bank bags 5-11; check with
  `/dump C_Bank.FetchPurchasedBankTabData(0)` at a banker).

## 7. Objective tracker: what animates on a count change, and how a parked tracker comes back

**Verdict:** a count change makes the game's objective line play `GlowAnim` (a bar glow sweeping across the line), and on completion `CheckAnim`.
Animations only change alpha and scale on the tracker's own children, so **none of them can draw while a parent is hidden**. What can
bring a "parked" tracker back on screen is the **managed-frame container**: `ObjectiveTrackerFrame` is a right managed frame, and the container
re-parents every managed frame it believes is showing back onto itself, and sets its alpha to 1. It decides "showing" from the frame's own `IsShown()`
flag, not from whether it is visible. So a tracker hidden by `SetParent(hiddenFrame)` while its own shown flag stays true is put back on the screen.

- Count-change animation: `Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua:226-263` (`line:SetState(Adding | Completing | Completed | Present)`);
  `Blizzard_ObjectiveTrackerAnimTemplates.lua:41-70` (`SetState`: Adding and Completing play `GlowAnim`, Completing also `CheckAnim`, Fading plays `FadeOutAnim`);
  `Blizzard_ObjectiveTrackerAnimTemplates.xml:40-51` (`GlowAnim` scales and fades the `Glow` texture; `FadeInAnim` fades the line from 0 to 1 over 0.5 s, which
  looks faded while it plays).
- The tracker is managed: `Blizzard_ObjectiveTracker/Blizzard_ObjectiveTracker.xml:3` (`ObjectiveTrackerFrame` inherits `RightManagedFrameTemplate`,
  `EditModeObjectiveTrackerSystemTemplate`); `Blizzard_ManagedFrameSystem/Shared/ManagedFrameSystem.xml:28` (`isRightManagedFrame = true`).
- The re-parent: `Blizzard_ManagedFrameSystem/Shared/ManagedFrameSystem.lua:46-55` (`UpdateFrame`: `frame:ClearAllPoints(); frame:SetParent(container)`), called from
  `AddManagedFrame` (`:57-77`: skipped only if `frame.ignoreFramePositionManager`, if not in its default position, or if `not frame:IsShown()`), from
  `UpdateManagedFrames` (`:79-86`, over everything in `showingFrames`, then `AnimInManagedFrames` sets alpha 1, `:129-133`), from the frame's own
  `OnShow` (`:17-19`), and on `UI.TopLevelParentShown` (`:136-160`: the UI coming back after Alt-Z, a cinematic or similar). Edit Mode adds it again in
  `EditModeSystemMixin:ApplySystemAnchor` (`Blizzard_EditMode/Shared/EditModeSystemTemplates.lua:349-357`, which also *clears* `ignoreFramePositionManager`
  when the frame is in its default position).
- Leaving the container: only `OnHide` (`ManagedFrameSystem.lua:21-23` → `RemoveManagedFrame`, `:93-115`) or `BreakFromFrameManager`
  (`EditModeSystemTemplates.lua:335-343`, which sets `ignoreFramePositionManager` and re-parents to UIParent).
- Consequence for a fix: parking by re-parent alone doesn't hold. The tracker has to be *hidden* (its own shown flag false), so `OnHide` takes it out of
  `showingFrames`, and kept hidden after `OnShow` (hook `OnShow` and hide it again, out of combat). The count-first text ("5/12 Pridewing Venom Sac")
  is the tracker's objective-line format. The error-frame message is name-first.
- **Unknowable from source:** whether Forever's `ObjectiveTrackerFrame:Hide()` is blocked in combat. It isn't marked protected in the XML (`:3`).

## 8. Quest log selection and QUEST_LOG_UPDATE

**Verdict:** Forever's quest log is the modern map quest log (`QuestMapFrame`, `C_QuestLog`). The classic `QuestLogFrame` and `SelectQuestLogEntry`
are loaded only on vanilla, tbc, wrath, cata and mists. The game's own code treats `C_QuestLog.SetSelectedQuest` as **not** sending a
`QUEST_LOG_UPDATE` back into the quest log synchronously: it switches the selection and back inside one function, with no guard. It does guard
the header expand and collapse calls, which do send the event.

- Which UI loads: `Blizzard_UIPanels_Game/Blizzard_UIPanels_Game.toc:96-99` (`QuestLogFrame` only for vanilla, tbc, wrath, cata, mists), `:173-178`
  (`[Family]\QuestMapFrame.lua`/`.xml` mainline, plus `[Game]\QuestMapFrameOverrides.lua` and `[Game]\QuestMapFrameUtils.lua` for camelot).
- Selection calls: `Mainline/QuestMapFrame.lua:1044-1050` (`QuestMapFrame_ShowQuestDetails`: `C_QuestLog.SetSelectedQuest(questID)`), `:1477-1491`
  (abandon: select, `SetAbandonQuest`, select the old quest back, all in one call), `:2612`.
- The guard pattern for calls that *do* send `QUEST_LOG_UPDATE` back at once: `Mainline/QuestMapFrame.lua:163-174`, `:182-194`, `:929-940`
  (`QuestMapFrame.ignoreQuestLogUpdate = true` around `ExpandQuestHeader`/`CollapseQuestHeader`), read at `:567`.
- Doc `QuestLogDocumentation.lua:1243-1250` (`SetSelectedQuest(questID)`).
- **Unknowable from source:** whether the client sends a `QUEST_LOG_UPDATE` later (on the next frame) after a selection change. Events come from C. An
  addon that calls `SetSelectedQuest` inside its own `QUEST_LOG_UPDATE` handler should still guard against re-entry.

## 9. Merchant: buying stacked items

**Verdict:** `BuyMerchantItem(index, quantity)` takes the **number of items**, not the number of stacks or lots. The game's multi-buy dialog
counts in items, stepping in the merchant's lot size (`stackCount`), capped by `GetMerchantItemMaxStack(index)` and by what you can afford.
A plain right-click calls `BuyMerchantItem(index)` with no quantity, which buys one lot.

- `Blizzard_UIPanels_Game/Mainline/MerchantFrame.lua:713-738` (`MerchantItemButton_BuyMultipleStacks`: `maxStack = GetMerchantItemMaxStack(id)`;
  `canAfford = floor(GetMoney() / (info.price / info.stackCount))`, items per copper of the lot price; opens
  `StackSplitFrame:OpenStackSplitFrame(min(maxStack, canAfford), self, …, info.stackCount)` only when `maxStack > 1`).
- `Blizzard_FrameXML/Mainline/StackSplitFrame.lua:3-19` (`minSplit = stackCount`, `split` starts at it) and `:333` (`owner.SplitStack(owner, split)`) →
  `MerchantFrame.lua:656-667` (`SplitStack`: `BuyMerchantItem(button:GetID(), split)`, or the extended-cost confirmation with that split).
- Plain click: `MerchantFrame.lua:699-705` (`BuyMerchantItem(self:GetID())`, after the high-price check at 1,500,000 copper, `:670`).
- Forever loads the Mainline merchant frame: `Blizzard_UIPanels_Game.toc:110,113` (`[Family]\MerchantFrame.lua`/`.xml [AllowLoadGameType mainline]`; Vanilla
  is a separate flavour, `:111`).
- **Unknowable from source:** what the server does with a quantity above `GetMerchantItemMaxStack`, or one that is not a multiple of the lot size
  (the UI never sends either).

## 10. Secret or restricted: UnitName("player"), GetActionText, GetActionInfo, containsOwnerItem, damage meter

**Verdict:** `UnitName("player")` is **not** secret: its secrecy rule is unit identity, which never applies to a player-controlled unit.
`GetActionText` is not marked secret. `GetActionInfo` has no generated doc (the old global), so the source can't settle it. `containsOwnerItem`
is not secret. **The damage meter's session data is secret in combat** (`SecretWhenInCombat`).

- `UnitName`: Doc `UnitDocumentation.lua:2489-2492` (`SecretWhenUnitNameIdentityRestricted = true`, `SecretArguments = "AllowedWhenTainted"`); the rule is
  `SecretPredicatesDocumentation.lua:135-138`: "produce secret values under regular unit identity secrecy rules, except in PvP when the queried unit is a
  player"; regular identity secrecy (`:130-133`) is "secret values when the unit isn't player-controlled or in the party/raid". The player is both, so
  `UnitName("player")` is plain. A nameplate or boss name can be secret.
- `GetActionText`: Doc `ActionBarFrameDocumentation.lua:253-262` (`MayReturnNothing`, `RequiresValidActionSlot`, no `SecretReturns` or `SecretWhen…`
  flag): plain, but nil for an empty or invalid slot. `GetActionTexture`: `:270`. `GetActionInfo`: **not in the generated docs**.
  **Unknowable from source**, so check in game (`/dump issecretvalue(GetActionInfo(1))` in combat, and in a dungeon).
- `containsOwnerItem`: Doc `AuctionHouseDocumentation.lua:1608-1617` (`BrowseResultInfo`, `bool`, not nil); `GetBrowseResults` (`:216-221`) has no
  secret flag. Plain.
- Damage meter: Doc `DamageMeterDocumentation.lua:21-80` (`C_DamageMeter.GetCombatSessionFromID`, `GetCombatSessionFromType`,
  `GetCombatSessionSourceFromID`, `GetCombatSessionSourceFromType`: all `SecretWhenInCombat = true`); `GetAvailableCombatSessions` (`:11`) is not.
  The rule: "produce secret values when combat addon restrictions are in effect" (`SecretPredicatesDocumentation.lua:95-97`). The game's own
  damage meter guards icon textures with `issecretvalue` (`Blizzard_DamageMeter/DamageMeterEntry.lua:54`).
- The secrecy rules in prose are in `SecretPredicatesDocumentation.lua`, one sentence per predicate, for example `:60-72` (PvP match, chat lockdown in
  encounters, dungeons and raids, restricted maps), `:80-97` (auras, cooldowns, in combat), `:115-118` (another unit's casts), `:126-128` (unit max
  health when the unit isn't player-controlled), `:156-163` (threat), and `:22-25` `RequiresFontStringTextAccess`: "Guarded APIs reject access for tainted
  callers if the object has the secret Text aspect assigned." (This adds to §3: the stated rule for aspects.)

## 11. Forbidden is not the only way the client refuses a frame: access restrictions

**Verdict:** `IsForbidden()` answers only "explicitly marked as forbidden". The client also puts **access restrictions** on script
objects, and a restricted object refuses tainted code every call (the error text is the forbidden one, "Attempt to access forbidden
object from code tainted by an AddOn") while `IsForbidden()` still returns false. The one restriction the docs list is on aura objects
while aura information is secret. The call that answers for both cases is `object:CanBeAccessedInContext()`.

- Seen in the game (0.9.5, open world, in a fight, an enemy plate with the player's debuffs): `calling 'GetParent' on bad self
  (Attempt to access forbidden object from code tainted by an AddOn)`, from a parent walk that had just had `IsForbidden()` answer false.
- Doc `SimpleFrameScriptObjectConstantsDocumentation.lua` (`ScriptObjectAccessRestriction`, one value): `DenyTaintedAccessWhenAurasAreSecret`,
  "Denies access to this script object from tainted execution while aura information is secret."
- Doc `SimpleFrameScriptObjectAPIDocumentation.lua:45` (`CanBeAccessedInContext`): "Returns whether the current Lua execution context has
  permission to access this object"; false "when execution is tainted and the object is forbidden or enforcing access restrictions". `:148`
  (`HasAccessConstraints`): "True if this object is forbidden or subject to conditional access restrictions". `:60` `GetAccessRestrictions`,
  `:163` `HasAnyAccessRestrictions`, `:10` `AddAccessRestrictions`. `:242` (`IsForbidden`): "True if this object has been explicitly marked as
  forbidden, regardless of the current Lua execution context." All of these return secrets under the `ObjectSecurity` aspect, so read
  the answer with `ns.IsTrue`. Retail 12.1.5's copy of the file lists the same calls at the same lines.
- Game use: `Blizzard_FrameXML/SecureTemplates.lua:561` (`delegate:HasAccessConstraints()` before a secure click is passed on).
- Forbidden aspects are a third thing (`ForbiddenAspectConstantsDocumentation.lua`: script bindings, event registrations, changing the
  parent, setting a texture and more, each refused on its own while the object stays otherwise reachable).
- **Unknowable from source:** which objects carry the restriction (it is set in C: the aura container, its buttons, or more), whether a
  texture an addon made on a restricted button is refused with it, when exactly aura information counts as secret, and whether tainted
  code may always call `CanBeAccessedInContext` on a restricted object (the addon also reads a refused `GetParent` as "held").
