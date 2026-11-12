// stub-harness: the TEST-ONLY client's widgets (scripts/lib/wow-stub.lua): how methods resolve, scripts and
// shown state, the base every frame test stands on.

import { expect, it } from "vitest";
import { RETAIL_CLIENT, createAddon } from "../lib/lua-harness.mjs";
import { TIDY_ENV } from "./helpers.mjs";

it("replacing a method a widget kind already resolved reaches new and existing widgets of that kind", () => {
  const addon = createAddon();
  const seen = addon.eval(`local old = CreateFrame("Frame") old:SetScale(2)
    local orig = __wfgStub.methods.SetScale
    __wfgStub.methods.SetScale = function(self) self.__marked = true end
    local fresh = CreateFrame("Frame") fresh:SetScale(3) old:SetScale(3)
    local button = CreateFrame("Button") button:SetScale(3)
    __wfgStub.methods.SetScale = orig
    return { fresh = fresh.__marked == true, old = old.__marked == true, button = button.__marked == true }`);
  expect(seen).toEqual({ fresh: true, old: true, button: true });
});

it("HookScript refuses a script the widget's kind lacks, as SetScript does", () => {
  const addon = createAddon();
  expect(addon.eval(`local ok, err = pcall(function() CreateFrame("Frame"):HookScript("OnClick", function() end) end)
    return { ok, err:match("Frame doesn't have a \\"OnClick\\" script") ~= nil }`)).toEqual([false, true]);
});

it("buttons, check buttons, sliders and edit boxes take OnEnable and OnDisable hooks, run by Disable and Enable", () => {
  const addon = createAddon();
  const runs = addon.eval(`local out = {}
    for _, kind in ipairs({ "Button", "CheckButton", "Slider", "EditBox" }) do
      local w, seen = CreateFrame(kind), {}
      w:HookScript("OnDisable", function() seen[#seen + 1] = "off" end)
      w:HookScript("OnEnable", function() seen[#seen + 1] = "on" end)
      w:Disable() w:Enable() out[kind] = table.concat(seen, " ")
    end
    return out`);
  expect(runs).toEqual({ Button: "off on", CheckButton: "off on", Slider: "off on", EditBox: "off on" });
});

it("SetShown runs OnShow and OnHide as Show and Hide do, but not a hook on the frame's Show", () => {
  const addon = createAddon();
  const runs = addon.eval(`local f, seen = CreateFrame("Frame"), {}
    f:SetScript("OnShow", function() seen[#seen + 1] = "show" end)
    f:SetScript("OnHide", function() seen[#seen + 1] = "hide" end)
    f:Hide() f:SetShown(true) f:SetShown(true) f:SetShown(nil) f:SetShown(false)
    hooksecurefunc(f, "Show", function() seen[#seen + 1] = "Show hook" end)
    f:SetShown(true)
    return table.concat(seen, " ")`);
  expect(runs).toBe("hide show hide show");
});

// Blizzard_APIDocumentationGenerated, both clients: SimpleStatusBarConstantsDocumentation.lua, NumericRuleFormatterSharedDocumentation.lua,
// DurationTextBindingSharedDocumentation.lua, StringUtilDocumentation.lua and NumericRuleFormatterAPIDocumentation.lua.
it("the world's status bar, rounding and duration enums carry the client's names and values, and its rule formatter the client's methods", () => {
  const addon = createAddon();
  expect(addon.eval(`local e = Enum return { e.StatusBarInterpolation.Immediate, e.StatusBarInterpolation.ExponentialEaseOut,
    e.NumericRuleFormatRounding.Nearest, e.NumericRuleFormatRounding.Up, e.NumericRuleFormatRounding.Down,
    e.DurationTextBindingProperty.RemainingDuration, e.DurationTextBindingProperty.RemainingPercent, e.DurationTextBindingProperty.TotalDuration, e.DurationTextBindingProperty.EndTime }`))
    .toEqual([0, 1, 0, 1, 2, 0, 1, 4, 6]);
  expect(addon.eval(`local f = C_StringUtil.CreateNumericRuleFormatter() f:SetBreakpoints({ { threshold = 0 } }) f:AddBreakpoint({ threshold = 60 })
    local copy = f:Copy() f:ClearBreakpoints()
    return { #f:GetBreakpoints(), #copy:GetBreakpoints(), copy:GetBreakpoints()[2].threshold, f.Format == nil }`)).toEqual([0, 2, 60, true]);
});

// OnUpdate runs only while a frame is visible (SimpleFrameScriptObjectConstantsDocumentation.lua OnUpdateMode
// RunWhenVisible; Blizzard_UnitFrame/Shared/CompactUnitFrame.lua:292 works around it for a hidden frame).
it("a shown frame under a hidden parent runs no OnUpdate until the parent shows", () => {
  const addon = createAddon();
  const ticks = addon.eval(`local p = CreateFrame("Frame") local c = CreateFrame("Frame", nil, p) __ticks = 0
    c:SetScript("OnUpdate", function() __ticks = __ticks + 1 end)
    p:Hide() __wfgStub.update(0.1) __wfgStub.update(0.1) local hidden = __ticks
    p:Show() __wfgStub.update(0.1)
    return { hidden, __ticks, c:IsShown() }`);
  expect(ticks).toEqual([0, 1, true]);
});

// UnitThreatSituation is SecretWhenUnitThreatStateRestricted and UnitDetailedThreatSituation
// SecretWhenUnitThreatValuesRestricted (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua, both clients).
it("threat reads answer with secrets while the world hides threat or holds a secret value, and plainly otherwise", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob", threat: 3, threatPct: 100 });
  // Which of the threat reads are secrets.
  const read = () => addon.eval(`local s = issecretvalue local a = { UnitDetailedThreatSituation("target") }
    return { s(UnitThreatSituation("target")), s(a[1]), s(a[2]), s(a[3]), s(a[5]) }`);
  expect(addon.eval("return { UnitDetailedThreatSituation('target') }"), "plain").toEqual([true, 3, 100, 100, 0]);
  expect(read(), "plain: no secrets").toEqual([false, false, false, false, false]);
  addon.eval("__wfgWorld.threatSecret = true");
  expect(read(), "world.threatSecret: every return").toEqual([true, true, true, true, true]);
  addon.eval("__wfgWorld.threatSecret = false __wfgWorld.units.target.threat = __wfgWorld.secret(1)");
  expect([...read(), addon.eval("return rawget(UnitDetailedThreatSituation('target'), 'n')")], "a secret stored value: every return, isTanking from the value inside").toEqual([true, true, true, true, true, false]);
});

// A unit watch reads SecureButton_GetUnit, the "unit" attribute (Blizzard_RestrictedAddOnEnvironment/SecureStateDriver.lua,
// Blizzard_FrameXML/SecureTemplates.lua:201-212, both clients), never a .unit field.
it("a unit watch shows a frame by its unit attribute and ignores a .unit field", () => {
  const addon = createAddon();
  expect(addon.eval(`local byField = CreateFrame("Button", nil, UIParent) byField.unit = "player"
    local byAttribute = CreateFrame("Button", nil, UIParent) byAttribute:SetAttribute("unit", "player")
    RegisterUnitWatch(byField) RegisterUnitWatch(byAttribute)
    return { byField:IsShown(), byAttribute:IsShown() }`)).toEqual([false, true]);
});

// UnitInRange is SecretReturns on both clients (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua).
it("UnitInRange hands a secret range back as a secret, with a secret checked flag", () => {
  const addon = createAddon();
  addon.world.setUnit("party1", { name: "TEST-ONLY Friend", inRange: false });
  // Whether each return is a secret, and what it hides.
  const read = () => addon.eval(`local a, b = UnitInRange("party1")
    local hidden = a
    if issecretvalue(a) then hidden = rawget(a, "n") end
    return { issecretvalue(a), issecretvalue(b), hidden }`);
  expect(read(), "plain").toEqual([false, false, false]);
  addon.eval("__wfgWorld.units.party1.inRange = __wfgWorld.secret(false)");
  expect(read(), "secret").toEqual([true, true, false]);
});

// UnitHealthPercent is SecretReturns and SecretWhenCurveSecret on both clients
// (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua): with hidden health every answer is hidden. Without a
// curve it answers the percentage the curve would be given, 0 to 1 (Blizzard_SharedXMLBase/CurveConstants.lua:
// ScaleTo100 "re-scales any percentage value from [0, 1] to [0, 100]", both clients).
it("UnitHealthPercent answers hidden health with a secret percent, a secret number curve result or a hidden color", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob", hp: 25, maxhp: 100 });
  // Plain or secret, and the value inside, for no curve, a number curve and a color curve.
  const read = () => addon.eval(`local num = { Evaluate = function(_, x) return x * 100 end }
    local col = C_CurveUtil.CreateColorCurve() col:AddPoint(0, CreateColor(1, 0, 0, 1))
    local function look(v) if issecretvalue(v) then return { true, rawget(v, "n") } end return { false, v } end
    return { look(UnitHealthPercent("target")), look(UnitHealthPercent("target", true, num)),
      look(UnitHealthPercent("target", true, col).r) }`);
  expect(read(), "plain").toEqual([[false, 0.25], [false, 25], [false, 1]]);
  addon.eval("__wfgWorld.units.target.hp = __wfgWorld.secret(25)");
  expect(read(), "hidden health").toEqual([[true, 0.25], [true, 25], [true, 1]]);
});

// UnitIsGroupLeader and UnitIsGroupAssistant are SecretWhenUnitIdentityRestricted, UnitIsAFK
// SecretInChatMessagingLockdown, UnitCastingInfo and UnitChannelInfo SecretWhenUnitSpellCastRestricted with
// notInterruptible not NeverSecret (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua, both clients).
it("leader, assistant, away and not-interruptible pass a secret field through as a secret", () => {
  const addon = createAddon();
  addon.world.setUnit("party1", { name: "TEST-ONLY Friend", leader: true, assistant: false, afk: true,
    cast: { name: "TEST-ONLY Bolt", startMs: 0, endMs: 1000, interruptible: false } });
  // Each answer as [secret, value inside].
  const read = () => addon.eval(`local function look(v) if issecretvalue(v) then return { true, rawget(v, "n") } end return { false, v } end
    return { look(UnitIsGroupLeader("party1")), look(UnitIsGroupAssistant("party1")), look(UnitIsAFK("party1")),
      look(select(8, UnitCastingInfo("party1"))) }`);
  expect(read(), "plain").toEqual([[false, true], [false, false], [false, true], [false, true]]);
  addon.eval(`local u, s = __wfgWorld.units.party1, __wfgWorld.secret
    u.leader, u.assistant, u.afk, u.cast.interruptible = s(true), s(false), s(true), s(false)`);
  expect(read(), "secret fields").toEqual([[true, true], [true, false], [true, true], [true, true]]);
  addon.eval("__wfgWorld.units.party1.cast.channel = true");
  expect(addon.eval(`local v = select(7, UnitChannelInfo("party1")) return { issecretvalue(v), rawget(v, "n") }`), "a channel too").toEqual([true, true]);
});

// UnitIsUnit is RequiresComparableUnitTokens (FailureMode ReturnNothing) and SecretWhenUnitComparisonRestricted;
// C_Secrets.CanCompareUnitTokens says which pairs may be compared (SecretPredicatesDocumentation.lua,
// SecretPredicateAPIDocumentation.lua, UnitDocumentation.lua, both clients).
it("UnitIsUnit answers a secret while comparison is restricted, and nothing for a pair that may not be compared", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob" });
  addon.world.setUnit("boss1", { name: "TEST-ONLY Mob" });
  // [CanCompareUnitTokens, number of returns, secret, value inside] for a pair.
  const read = (a, b) => addon.eval(`local r = { UnitIsUnit("${a}", "${b}") } local v = r[1]
    return { C_Secrets.CanCompareUnitTokens("${a}", "${b}"), #r, issecretvalue(v), issecretvalue(v) and rawget(v, "n") or v }`);
  addon.eval("__wfgWorld.units.boss1 = __wfgWorld.units.target");
  expect(read("target", "boss1"), "open").toEqual([true, 1, false, true]);
  expect(read("boss1", "nameplate1"), "open, another pair").toEqual([true, 1, false, false]);
  addon.eval("__wfgWorld.unitComparisonSecret = true");
  expect(read("target", "boss1"), "restricted, a pair with target").toEqual([true, 1, true, true]);
  expect(read("boss1", "nameplate1"), "restricted, an off-limits pair").toEqual([false, 0, false]);
});

// SecureActionButton_ShouldUseOnKeyDown decides the phase with GetCVarBool("ActionButtonUseKeyDown")
// (Blizzard_FrameXML/SecureTemplates.lua, both clients), so the world's own read and a secure button never disagree.
it("a secure button's click phase and GetCVarBool read the same ActionButtonUseKeyDown value", () => {
  const addon = createAddon();
  // [GetCVarBool, acts on down, acts on up] for a fresh secure button.
  const read = () => addon.eval(`local b = CreateFrame("Button", nil, UIParent, "SecureActionButtonTemplate")
    b:RegisterForClicks("AnyDown", "AnyUp")
    return { GetCVarBool("ActionButtonUseKeyDown"), __wfgStub.secureActs(b, "LeftButton", true), __wfgStub.secureActs(b, "LeftButton", false) }`);
  expect(read(), "the default").toEqual([true, true, false]);
  addon.eval('SetCVar("ActionButtonUseKeyDown", "0")');
  expect(read(), "switched off").toEqual([false, false, true]);
});

// C_UnitAuras.GetAuraDuration returns a LuaDurationObject with no secret tag of its own
// (Blizzard_APIDocumentationGenerated/UnitAuraDocumentation.lua); the object's HasSecretValues is ReturnsNeverSecret
// (LuaDurationObjectAPIDocumentation.lua). Its getters answering with secrets is the stricter guess.
it("an aura with hidden times gives a duration object that holds them hidden, and plain times give plain answers", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob", auras: [{ name: "TEST-ONLY Hex", auraInstanceID: 7, duration: 10, expirationTime: 110 }] });
  // [HasSecretValues, then each getter as [secret, value inside]] for the aura's object at time 100.
  const read = () => addon.eval(`__wfgStub.now = 100 local d = C_UnitAuras.GetAuraDuration("target", 7)
    local function look(v) if issecretvalue(v) then return { true, rawget(v, "n") } end return { false, v } end
    return { d:HasSecretValues(), look(d:GetStartTime()), look(d:GetTotalDuration()), look(d:GetEndTime()), look(d:GetRemainingDuration()), d:IsZero() }`);
  expect(read(), "plain").toEqual([false, [false, 100], [false, 10], [false, 110], [false, 10], false]);
  addon.eval(`local a = __wfgWorld.units.target.auras[1] a.duration, a.expirationTime = __wfgWorld.secret(10), __wfgWorld.secret(110)`);
  expect(read(), "hidden").toEqual([true, [true, 100], [true, 10], [true, 110], [true, 10], false]);
});

// world.secretReads is the harness's own worst case: Blizzard_APIDocumentationGenerated (UnitDocumentation.lua, both
// clients) tags neither UnitOnTaxi nor UnitIsDeadOrGhost secret. A hidden boolean is what a truth test is refused on.
it("a yes/no read the secret-read switch hides answers a hidden boolean, so an unguarded truth test raises", () => {
  const addon = createAddon();
  addon.eval("__wfgWorld.secretReads.UnitOnTaxi = true __wfgWorld.secretReads.UnitIsDeadOrGhost = true");
  expect(addon.eval(`local t, d = UnitOnTaxi("player"), UnitIsDeadOrGhost("player")
    return { issecretvalue(t), rawget(t, "n"), issecretvalue(d), rawget(d, "n") }`)).toEqual([true, false, true, false]);
  expect(addon.eval(`return { pcall(assert(loadstring('if UnitOnTaxi("player") then return 1 end', "@Modules/TEST-ONLY.lua"))) }`),
    "a truth test in addon code").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to perform boolean test on a secret value"]);
});

// Blizzard_SharedXMLBase/CallbackRegistry.lua's CallbackRegistryMixin (both clients): RegisterCallback keeps one
// callback per owner per event, generates an owner for nil, refuses a number owner, keeps extra arguments in a
// closure and returns the owner; UnregisterCallback drops one.
it("EventRegistry keeps one callback per owner, passes the extra arguments, and unregisters", () => {
  const addon = createAddon();
  const seen = addon.eval(`local out, me = {}, {}
    local function note(tag) return function(...) out[#out + 1] = tag .. ":" .. table.concat({ select(2, ...) }, ",") end end
    local mine = EventRegistry:RegisterCallback("TEST-ONLY", note("first"), me)
    EventRegistry:RegisterCallback("TEST-ONLY", note("second"), me)
    local made = EventRegistry:RegisterCallback("TEST-ONLY", note("extra"), nil, "a", "b")
    EventRegistry:TriggerEvent("TEST-ONLY", "p")
    EventRegistry:UnregisterCallback("TEST-ONLY", made)
    EventRegistry:TriggerEvent("TEST-ONLY", "q")
    local ok = pcall(EventRegistry.RegisterCallback, EventRegistry, "TEST-ONLY", note("n"), 5)
    return { out, mine == me, type(made), ok }`);
  expect(seen).toEqual([["extra:a,b,p", "second:p", "second:q"], true, "number", false]);
});

// C_Item.GetItemInfo returns ... sellPrice, classID, subclassID, bindType, expansionID, setID, isCraftingReagent
// (Blizzard_APIDocumentationGenerated/ItemDocumentation.lua, both clients).
it("GetItemInfo gives the item's own class, subclass and reagent flag, as GetItemInfoInstant does", () => {
  const addon = createAddon();
  addon.eval("__wfgWorld.items[2589].reagent = true");
  expect(addon.eval(`local i = { C_Item.GetItemInfo(2589) } local n = { C_Item.GetItemInfoInstant(2589) }
    return { i[12], i[13], i[17], n[6], n[7] }`)).toEqual([7, 5, true, 7, 5]);
});

// GetEffectiveAlpha is in SimpleFrameAPIDocumentation.lua:366 only; MinimapFrameAPIDocumentation.lua has no
// SetBlipTexture (both clients); GameMenuFrameButtonTemplate is forever's Blizzard_GameMenu/Shared/GameMenuFrame.xml
// only; live SecretAspectConstantsDocumentation.lua ends at RadialProgress (no FrameStrata).
it("the widget lists hold only what each client has: GetEffectiveAlpha on frames, no SetBlipTexture, Forever's game menu template", () => {
  const addon = createAddon();
  expect(addon.eval(`local f = CreateFrame("Frame", nil, UIParent)
    return { type(f.GetEffectiveAlpha), type(f:CreateTexture().GetEffectiveAlpha), type(f:CreateFontString().GetEffectiveAlpha),
      type(Minimap.SetBlipTexture), CreateFrame("Button", nil, UIParent, "GameMenuFrameButtonTemplate") ~= nil, Enum.SecretAspect.FrameStrata }`),
  "Forever").toEqual(["function", "nil", "nil", "nil", true, 16777216]);
  const retail = createAddon({ client: RETAIL_CLIENT });
  expect(retail.eval(`local ok, err = pcall(CreateFrame, "Button", nil, UIParent, "GameMenuFrameButtonTemplate")
    return { ok, err:match("unknown template") ~= nil, Enum.SecretAspect.FrameStrata == nil, Enum.SecretAspect.RadialProgress }`),
  "Retail").toEqual([false, true, true, 8388608]);
});

// GetWidth and GetHeight take ignoreRect, Default = false (SimpleScriptRegionAPIDocumentation.lua, both clients), and
// Blizzard_SharedXMLBase/AnchorUtil.lua's FormatFrame prints GetSize() as the "calculated size" and GetSize(true) as
// the "explicit size": a frame stretched between two anchored edges answers its laid-out size.
it("a frame given a size and stretched between two anchors reports the stretched size; ignoreRect gives the one set", () => {
  const addon = createAddon();
  const out = addon.eval(`local p = CreateFrame("Frame", nil, UIParent) p:SetSize(300, 200) p:SetPoint("CENTER")
    local f = CreateFrame("Frame", nil, p) f:SetSize(100, 20)
    f:SetPoint("TOPLEFT", p, "TOPLEFT") f:SetPoint("BOTTOMRIGHT", p, "BOTTOMRIGHT")
    local one = CreateFrame("Frame", nil, p) one:SetSize(100, 20) one:SetPoint("LEFT", p, "LEFT")
    local w, h = f:GetSize()
    return { w, h, f:GetWidth(true), f:GetHeight(true), f:GetRight() == p:GetRight(), f:GetTop() == p:GetTop(), one:GetWidth(), one:GetHeight() }`);
  expect(out).toEqual([300, 200, 100, 20, true, true, 100, 20]);
});

// Blizzard_UIPanelTemplates/Shared/UIPanelTemplatesShared.lua:147-151 sets a button's normal and highlight textures and
// reads each back; SimpleTextureBaseAPIDocumentation.lua's GetTexCoord answers the four corners (both clients), never
// nothing: Blizzard hands an untouched texture's coordinates straight back to SetTexCoord (forever
// Blizzard_SharedMapDataProviders/FrameCloneManager.lua:119, Blizzard_SharedXMLBase/AnchorUtil.lua:374-380,
// TextureUtil.lua:67). The whole-texture corners for an unset one are the stub's guess.
it("getters answer what their setter stored, HasScript the kind's script list and IsForbidden false; unset textures stay nil and unset coordinates are the whole texture", () => {
  const addon = createAddon();
  const out = addon.eval(`local b = CreateFrame("Button", nil, UIParent)
    local unset = b:GetNormalTexture() == nil and b:GetHighlightTexture() == nil
    b:SetNormalTexture("TEST-ONLY-UP") b:SetHighlightTexture("TEST-ONLY-LIT")
    local n, h = b:GetNormalTexture(), b:GetHighlightTexture()
    local first = n:GetTexture()
    b:SetNormalTexture("TEST-ONLY-UP2")
    local t = b:CreateTexture() t:SetTexCoord(0.1, 0.9, 0.2, 0.8)
    local four = { t:GetTexCoord() }
    return { unset, n:GetObjectType(), first, h:GetDrawLayer(), b:GetNormalTexture() == n, n:GetTexture(), four,
      b:HasScript("OnClick"), CreateFrame("Frame"):HasScript("OnClick"), t:HasScript("OnShow"), b:IsForbidden(), { b:CreateTexture():GetTexCoord() } }`);
  expect(out).toEqual([true, "Texture", "TEST-ONLY-UP", "HIGHLIGHT", true, "TEST-ONLY-UP2", [0.1, 0.2, 0.1, 0.8, 0.9, 0.2, 0.9, 0.8], true, false, false, false, [0, 0, 0, 1, 1, 0, 1, 1]]);
});

// The client runs OnShow when a frame comes into view and OnHide when it leaves it, once each (Blizzard relies on it:
// Blizzard_EncounterTimeline/EncounterTimelineView.lua:192-203, Blizzard_GlueXML/Mainline/CharacterSelect.lua:2701).
it("a frame shown or hidden under a hidden parent runs its OnShow or OnHide only when it comes into or leaves view", () => {
  const addon = createAddon();
  const runs = addon.eval(`local p = CreateFrame("Frame") local c, seen = CreateFrame("Frame", nil, p), {}
    c:SetScript("OnShow", function() seen[#seen + 1] = "show" end)
    c:SetScript("OnHide", function() seen[#seen + 1] = "hide" end)
    c:Hide() p:Hide() c:Show() seen[#seen + 1] = "|" p:Show() seen[#seen + 1] = "|"
    p:Hide() c:Hide() seen[#seen + 1] = "|" p:Show()
    return table.concat(seen, " ")`);
  expect(runs).toBe("hide | show | hide |");
});

// Blizzard_APIDocumentationGenerated/UnitAuraDocumentation.lua:264-284 (forever) GetAuraDispelTypeColor: the curve is
// read "with the dispel type ID used as the 'x' value", the curve is Nilable = false, and the answer is
// SecretWhenUnitAuraRestricted. The IDs are the world's copy of the addon's own (world.dispelTypeIds), not sourced.
it("the dispel colour call reads the curve at the debuff's type number, and hides the colour of a hidden type", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob" });
  const out = addon.eval(`local s = __wfgWorld.secret
    __wfgWorld.addAura("target", { name = "TEST-ONLY A", isHarmful = true, dispelName = "Magic", auraInstanceID = 501 })
    __wfgWorld.addAura("target", { name = "TEST-ONLY B", isHarmful = true, dispelName = s("Curse"), auraInstanceID = 502 })
    local c = C_CurveUtil.CreateColorCurve() c:AddPoint(0, CreateColor(1, 0, 0)) c:AddPoint(1, CreateColor(0, 0, 1)) c:AddPoint(2, CreateColor(0, 1, 0))
    local plain = C_UnitAuras.GetAuraDispelTypeColor("target", 501, c)
    local hidden = C_UnitAuras.GetAuraDispelTypeColor("target", 502, c)
    return { plain.r, plain.g, plain.b, issecretvalue(hidden.r), issecretvalue(hidden.g), rawget(hidden.g, "n") }`);
  expect(out).toEqual([0, 0, 1, true, true, 1]);
});

// Blizzard_FrameXMLUtil/Mainline/DifficultyUtil.lua (forever and live; Forever loads the Mainline file too,
// Blizzard_FrameXMLUtil.toc:33-36): bands >= 5, >= 3, >= -4, then the trivial range, on UnitEffectiveLevel, two
// returns; Blizzard_FrameXMLBase/Constants.lua:195-213 the colours. The trivial range itself is the world's guess.
it("the level colour uses the client's bands and colours and answers its highlight colour too", () => {
  const addon = createAddon();
  const out = addon.eval(`local o = {} for _, l in ipairs({ 65, 63, 56, 55, 53, 52 }) do local c = GetCreatureDifficultyColor(l) o[#o + 1] = l .. ":" .. c.r .. "," .. c.g .. "," .. c.b end
    local _, lit = GetQuestDifficultyColor(56)
    return { UnitLevel("player"), o, select("#", GetCreatureDifficultyColor(56)), lit.g }`);
  expect(out).toEqual([60, ["65:1,0.1,0.1", "63:1,0.5,0.25", "56:1,0.82,0", "55:0.25,0.75,0.25", "53:0.25,0.75,0.25", "52:0.5,0.5,0.5"], 2, 1]);
});

// Blizzard_SharedXMLBase/CvarUtil.lua:9-15 (forever and live, Blizzard_SharedXMLBase.toc:23): the global SetCVar turns
// a boolean into "1" or "0" before C_CVar.SetCVar; a test's own SetCVar still hears C_CVar.SetCVar.
it("the global SetCVar stores a boolean as 1 or 0, and C_CVar.SetCVar reaches a test's own SetCVar", () => {
  const addon = createAddon();
  const out = addon.eval(`SetCVar("TEST_ONLY_ON", true) SetCVar("TEST_ONLY_OFF", false) C_CVar.SetCVar("TEST_ONLY_RAW", 2)
    local plain = { GetCVar("TEST_ONLY_ON"), GetCVarBool("TEST_ONLY_ON"), GetCVar("TEST_ONLY_OFF"), GetCVar("TEST_ONLY_RAW") }
    local orig, heard = SetCVar, nil
    SetCVar = function(name) heard = name end
    C_CVar.SetCVar("TEST_ONLY_HEARD", "1") SetCVar = orig
    return { plain, heard }`);
  expect(out).toEqual([["1", true, "0", "2"], "TEST_ONLY_HEARD"]);
});

// Blizzard_AuraContainer (forever and live identical): Blizzard_AuraContainerFrameProviders.lua AcquireFrame makes a
// batch when no frame is free and CreateFrame runs initializeFrame on each new one; Blizzard_AuraContainerShared.lua:
// 100-106 FrameCreationBatchSize = 10; Blizzard_AuraContainerGroups.lua:239-254 shows up to maxFrameCount.
it("an aura group makes another batch of ten buttons when its auras outnumber them, dressing each, in a fight too", () => {
  const addon = createAddon();
  const out = addon.eval(`for i = 1, 15 do __wfgWorld.addAura("player", { name = "TEST-ONLY " .. i, isHelpful = true, auraInstanceID = 600 + i }) end
    local inits, fought = 0, 0
    local init = function(b) inits = inits + 1 if InCombatLockdown() then fought = fought + 1 end b:SetSize(20, 20) end
    local c = CreateFrame("AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
    c:AddAuraGroup("a", "HELPFUL", { maxFrameCount = 32, layout = {}, initializeFrame = init })
    c:AddAuraGroup("b", "HELPFUL", { maxFrameCount = 12, layout = {}, initializeFrame = init })
    c:SetUnit("player") c:SetEnabled(true)
    local function shown(g) local n = 0 for _, b in ipairs(c.__groups[g].buttons) do if b.__shown then n = n + 1 end end return n end
    local before = { #c.__groups[1].buttons, shown(1), #c.__groups[2].buttons, shown(2), inits }
    __wfgWorld.combat(true)
    for i = 16, 21 do __wfgWorld.addAura("player", { name = "TEST-ONLY " .. i, isHelpful = true, auraInstanceID = 600 + i }) end
    c:UpdateAllAuras()
    return { before, { #c.__groups[1].buttons, shown(1), inits, fought } }`);
  expect(out).toEqual([[20, 15, 20, 12, 40], [30, 21, 50, 10]]);
});

// helpers.mjs's TIDY_ENV and TOOLS_ENV use the world's hooksecurefunc (wow-world.lua), which already hooks methods on
// tables: a hooked function keeps its results and the hook is counted (stub.hooks), as in a plain client.
it("a client set up with TIDY_ENV keeps the world's hooksecurefunc: every result kept, every hook counted", () => {
  const addon = createAddon();
  addon.eval(TIDY_ENV);
  expect(addon.eval(`TEST_ONLY_A = function() return 42, 7 end local before = __wfgStub.hooks or 0
    hooksecurefunc("TEST_ONLY_A", function() end)
    __t = { m = function() return 1, 2 end } hooksecurefunc(__t, "m", function() end)
    return { select("#", TEST_ONLY_A()), select("#", __t.m()), __wfgStub.hooks - before }`)).toEqual([2, 2, 2]);
  expect(addon.eval(`function TEST_ONLY_I() return 1, nil, 3, nil end hooksecurefunc("TEST_ONLY_I", function() end)
    return { select("#", TEST_ONLY_I()), (select(3, TEST_ONLY_I())) }`), "a nil among the results keeps the ones after it (H44 guess 10)").toEqual([4, 3]);
});

// live ContentTrackingDocumentation.lua:313-324 CONTENT_TRACKING_UPDATE (type, id, isTracked); the trackers name the third
// argument "added" and play the new-entry fanfare on it (Blizzard_ObjectiveTracker/Blizzard_AdventureObjectiveTracker.lua:
// 38-44, Blizzard_AchievementObjectiveTracker.lua:16-22), so a stop says false.
it("on Retail, stopping the tracking of a collectable says it is no longer tracked", () => {
  const addon = createAddon({ client: RETAIL_CLIENT });
  expect(addon.eval(`local seen = {} local f = CreateFrame("Frame") f:RegisterEvent("CONTENT_TRACKING_UPDATE")
    f:SetScript("OnEvent", function(_, _, kind, id, tracked) seen[#seen + 1] = { kind, id, tracked } end)
    __wfgWorld.collectables[0] = { { id = 5, title = "TEST-ONLY" } } C_ContentTracking.StopTracking(0, 5, 2) return seen`)).toEqual([[0, 5, false]]);
});

// live UnitAuraDocumentation.lua:395-410 GetPlayerAuraBySpellID is RequiresNonSecretAura, and
// SecretPredicatesDocumentation.lua:28-31 says such a call "will return no values" for a secret aura.
it("on Retail, asking for one of your auras by spell id answers nothing for a hidden aura", () => {
  const addon = createAddon({ client: RETAIL_CLIENT });
  expect(addon.eval(`__wfgWorld.units.player.auras = { __wfgWorld.secret(1), { spellId = 7, name = "TEST-ONLY" } }
    return { C_UnitAuras.GetPlayerAuraBySpellID(99999) == nil, C_UnitAuras.GetPlayerAuraBySpellID(7).name }`)).toEqual([true, "TEST-ONLY"]);
});

// Blizzard_AuraContainer/Blizzard_CustomAuraContainer.lua (forever and live identical): AddAuraGroup asserts a
// non-empty key, a valid filter string and a new key (:286-291), then its options (:1-36, :143-194);
// Blizzard_FrameXMLUtil/AuraUtil.lua:270-320 lists the filter words and IsValidFilterString's messages.
it("an aura container refuses a group the client's asserts refuse, with the client's message, and keeps the good ones", () => {
  const addon = createAddon();
  const out = addon.eval(`local c = CreateFrame("AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
    local function try(key, filter, opts)
      opts.layout = opts.layout or {} local ok, err = pcall(c.AddAuraGroup, c, key, filter, opts) return ok or err
    end
    return { try("a", "HELPFUL|!RAID PLAYER", { maxFrameCount = 2 }), try("a", "HELPFUL", { maxFrameCount = 2 }), try("", "HELPFUL", {}),
      try("b", "HELPFUL|TEST_ONLY_NO_SUCH", {}), try("b", "HELPFUL|!", {}), try("b", "HELPFUL", { maxFrameCount = 2.5 }),
      try("b", "HELPFUL", { maxFrameCount = math.huge, layout = { elementSpacing = "2" } }), try("b", "HELPFUL", { layout = { forceNewLine = 1 } }),
      try("b", "HELPFUL", { layout = { elementWidth = -1 } }), try("b", "HELPFUL", { sortMethod = 99 }), try("b", "HELPFUL", { initializeFrame = 1 }),
      #c.__groups }`);
  expect(out).toEqual([true, "aura group 'a' already exists with this key.", "groupKey must be a non-empty string.",
    "Unknown aura filter component: 'TEST_ONLY_NO_SUCH'", "A negation prefix ('!') must be followed by a filter component.",
    "maxFrameCount must be a non-negative integer or infinity.", "elementSpacing must be a number.", "forceNewLine must be a boolean.",
    "elementWidth must be a non-negative number.", "sortMethod must be a valid AuraContainerSortMethod.", "initializeFrame must be a function or nil.", 1]);
});

// The harness's own counter (no client rule): a click whose handler raises still ends its hardware event.
it("a click whose handler raises ends its hardware event and passes the error on", () => {
  const addon = createAddon();
  expect(addon.eval(`local b = CreateFrame("Button", nil, UIParent) b:SetScript("OnClick", function() error("TEST-ONLY", 0) end)
    local ok, err = pcall(__wfgStub.click, b) return { ok, err, __wfgStub.hardware }`)).toEqual([false, "TEST-ONLY", 0]);
});

// Blizzard's own code leans on the client running an edit box's scripts for code-set text and focus:
// forever Blizzard_AutoComplete/AutoComplete.lua:401 and Blizzard_ChatFrameBase/Shared/ChatFrameEditBox.lua:530
// (its comment: setting the text from code clears the userInput flag), and
// Blizzard_SharedXML/Shared/InputBox/InputBoxTemplates.lua:180-207 (SearchBoxTemplate_ClearText). That they run at
// once, and only on a change, is the stub's guess.
it("an edit box runs OnTextChanged for code-set text and its focus scripts when the focus changes; typing runs it once", () => {
  const addon = createAddon();
  expect(addon.eval(`local seen = {} local e = CreateFrame("EditBox", nil, UIParent)
    e:SetScript("OnTextChanged", function(_, user) seen[#seen + 1] = "text:" .. tostring(user) end)
    e:SetScript("OnEditFocusGained", function() seen[#seen + 1] = "gained" end)
    e:SetScript("OnEditFocusLost", function() seen[#seen + 1] = "lost" end)
    e:SetText("a") e:SetText("a") e:SetFocus() e:SetFocus() e:ClearFocus() e:ClearFocus() __wfgStub.type(e, "b")
    local fs = UIParent:CreateFontString() fs:SetFont("TEST-ONLY", 12, "") fs:SetText("c")
    return table.concat(seen, " ")`)).toBe("text:false gained lost text:true");
});

// Blizzard_AuraContainer/Blizzard_ManagedAuraContainer.lua:518-525 ParseAllAuras clears the groups and returns while
// not IsEnabled(), before any aura source, Edit Mode's included; Blizzard_AuraContainer.lua:24-25 IsEnabled is
// `self.enabled == true` (both clients).
it("a switched-off aura container shows nothing in Edit Mode, though its preview is on", () => {
  const addon = createAddon();
  const shown = addon.eval(`local c = CreateFrame("AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
    c:AddAuraGroup("x", "HELPFUL", { maxFrameCount = 1, layout = {}, initializeFrame = function(b) b:SetSize(20, 20) end })
    c:SetUnit("player")
    __wfgStub.editMode = true c:SetEnabled(false)
    local off = c.__groups[1].buttons[1].__shown
    c:SetEnabled(true)
    return { off, c.__groups[1].buttons[1].__shown }`);
  expect(shown).toEqual([false, true]);
});

// FCF_GetNextOpenChatWindowIndex looks only up to Constants.ChatFrameConstants.MaxChatWindows, 10, and answers nil
// past it (Blizzard_ChatFrameBase/Shared/FloatingChatFrame.lua:26-34, ChatConstantsDocumentation.lua:214); then
// FCF_OpenNewWindow returns nothing, else `chatFrame, chatFrameIndex` (Mainline/FloatingChatFrame.lua, forever
// :707-710 and :755, live :522-525 and :570).
it("FCF_OpenNewWindow gives the window and its number up to the tenth window, then nothing", () => {
  const addon = createAddon();
  const out = addon.eval(`local made = {}
    for n = 1, 8 do local f, i = FCF_OpenNewWindow("TEST-ONLY " .. n) made[n] = f:GetName() .. " " .. i end
    return { made[1], made[8], select("#", FCF_OpenNewWindow("TEST-ONLY full")) }`);
  expect(out).toEqual(["ChatFrame3 3", "ChatFrame10 10", 0]);
});

// ChatFrame1 to ChatFrame10 are declared in Blizzard_ChatFrameBase/Mainline/FloatingChatFrame.xml (forever :709-762,
// live :698-751), so all ten exist from login, each with its tab and edit box, and NUM_CHAT_WINDOWS is
// Constants.ChatFrameConstants.MaxChatWindows (Blizzard_DeprecatedChatInfo/Deprecated_ChatFrame.lua:18;
// ChatConstantsDocumentation.lua:214, Value 10). A fresh character shows only General and Combat Log.
it("the world starts with the game's ten chat windows, 3 to 10 hidden", () => {
  const addon = createAddon();
  const out = addon.eval(`local shown = {}
    for i = 1, 10 do shown[i] = _G["ChatFrame" .. i]:IsShown() and _G["ChatFrame" .. i .. "Tab"]:IsShown() end
    return { NUM_CHAT_WINDOWS, #CHAT_FRAMES, CHAT_FRAMES[10], ChatFrame10EditBox ~= nil, ChatFrame11 == nil, shown[1], shown[2], shown[3], shown[10] }`);
  expect(out).toEqual([10, 10, "ChatFrame10", true, true, true, true, false, false]);
});

// With all ten windows made at login, FCF_OpenNewWindow shows the first hidden one from 3 instead of making a frame.
it("FCF_OpenNewWindow shows a window that was there from login", () => {
  const addon = createAddon();
  const out = addon.eval(`local before = ChatFrame3 local f = FCF_OpenNewWindow("TEST-ONLY")
    return { f == before, f:IsShown(), ChatFrame3Tab:IsShown(), #CHAT_FRAMES, NUM_CHAT_WINDOWS }`);
  expect(out).toEqual([true, true, true, 10, 10]);
});

// Blizzard_SharedXMLBase/CallbackRegistry.lua (both clients, identical): RegisterCallback raises for a non-string
// event, then for a non-function func, before the owner rules (:112-117); TriggerEvent (:187-188) and
// UnregisterCallback (:225-226) raise for a non-string event.
it("EventRegistry refuses a missing callback and an event name that is not text, with the client's messages", () => {
  const addon = createAddon();
  const errs = addon.eval(`local function why(...) local ok, err = pcall(...) return ok and "ok" or err:match("CallbackRegistryMixin.*$") end
    local R = EventRegistry
    return { why(R.RegisterCallback, R, "TEST-ONLY", nil, {}), why(R.RegisterCallback, R, 5, function() end, {}),
      why(R.RegisterCallback, R, 5, nil, 5), why(R.UnregisterCallback, R, 5, nil), why(R.TriggerEvent, R, 5),
      why(R.TriggerEvent, R, "TEST-ONLY") }`);
  expect(errs).toEqual([
    "CallbackRegistryMixin::RegisterCallback 'func' requires function type.",
    "CallbackRegistryMixin::RegisterCallback 'event' requires string type.",
    "CallbackRegistryMixin::RegisterCallback 'event' requires string type.",
    "CallbackRegistryMixin:UnregisterCallback 'event' requires string type.",
    "CallbackRegistryMixin:TriggerEvent 'event' requires string type.",
    "ok",
  ]);
});

// /home/user/blizz/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/ActionBarFrameDocumentation.lua
// (IsEquippedAction carries RequiresValidActionSlot) and ActionBarSharedDocumentation.lua (its FailureMode is
// ReturnNothing): a slot outside the bars answers nothing instead of raising.
it("C_ActionBar.IsEquippedAction answers nothing for a slot outside 1 to 180, and a worn item's slot answers true", () => {
  const addon = createAddon();
  const out = addon.eval(`__wfgWorld.setAction(7, { id = 133, equipped = true })
    local function count(...) return select("#", ...) end
    return { count(C_ActionBar.IsEquippedAction(0)), count(C_ActionBar.IsEquippedAction(181)),
      C_ActionBar.IsEquippedAction(7), C_ActionBar.IsEquippedAction(8), (pcall(C_ActionBar.IsEquippedAction, "x")) }`);
  expect(out).toEqual([0, 0, true, false, false]);
});

// /home/user/blizz/forever/Interface/AddOns/Blizzard_TrainerUI/Mainline/Blizzard_TrainerUI.lua:469 reads
// serviceName, serviceType, texture, reqLevel, serviceSubText, category = GetTrainerServiceInfo(index).
it("the world's GetTrainerServiceInfo answers name, kind, icon, level, rank and category in the client's order", () => {
  const addon = createAddon();
  const out = addon.eval(`__wfgWorld.trainer = { services = { { name = "TEST-ONLY Bolt", cost = 5, icon = 135808, level = 4,
      rank = "TEST-ONLY Rank 2", category = "TEST-ONLY Cat" } } }
    return { GetTrainerServiceInfo(1) }`);
  expect(out).toEqual(["TEST-ONLY Bolt", "available", 135808, 4, "TEST-ONLY Rank 2", "TEST-ONLY Cat"]);
});

// /home/user/blizz/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua:1257-1267:
// UnitGetDetailedHealPrediction(unit, healerUnit, healPredictionCalculator) has no Returns.
it("UnitGetDetailedHealPrediction fills the calculator and returns nothing", () => {
  const addon = createAddon();
  const out = addon.eval(`local calc = CreateUnitHealPredictionCalculator()
    return { select("#", UnitGetDetailedHealPrediction("player", "player", calc)), calc.unit }`);
  expect(out).toEqual([0, "player"]);
});

// /home/user/blizz/forever/Interface/AddOns/Blizzard_DeprecatedSpellBook/Deprecated_SpellBook.lua:4-6: the fallbacks
// load only while GetCVarBool("loadDeprecationFallbacks"). The world defines them, so the CVar reads on (its default
// is a guess: not in Blizzard's source).
it("the deprecation fallbacks CVar reads on in the world that defines the fallback globals", () => {
  const addon = createAddon();
  const out = addon.eval(`return { GetCVar("loadDeprecationFallbacks"), GetCVarBool("loadDeprecationFallbacks"), type(IsPlayerSpell),
    type(ChatFrame_AddMessageEventFilter) }`);
  expect(out).toEqual(["1", true, "function", "function"]);
});

// /home/user/blizz/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua:4552-4561
// (UnitPowerUpdate): the payload is unitTarget, powerType, neither nilable.
it("a world power or combo change fires UNIT_POWER_UPDATE with its power type, one event per type", () => {
  const addon = createAddon();
  const out = addon.eval(`__wfgWorld.setUnit("player", { ptypeName = "MANA" })
    local seen, f = {}, CreateFrame("Frame")
    f:RegisterEvent("UNIT_POWER_UPDATE")
    f:SetScript("OnEvent", function(_, _, unit, powerType) seen[#seen + 1] = unit .. " " .. tostring(powerType) end)
    __wfgWorld.setUnit("player", { power = 10, combo = 2 })
    table.sort(seen)
    return seen`);
  expect(out).toEqual(["player COMBO_POINTS", "player MANA"]);
});
