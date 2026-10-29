-- Key setup's class layouts: for every class, what each key means, as a short list of spells written best first.
-- Modules/KeybindsLayouts.lua turns a list into one spell with one rule (the first spell the character knows that
-- no earlier key on the same bar page has taken). This file is plain data and does nothing by itself.
--
-- Spells are stored by ID; the client names them. A bare ID is the classic database's rank 1 (vanilla's IDs, which
-- `/vg probe` lists with the names the client gives them). D.UNKNOWN marks a spell WoW Forever added or changed whose
-- ID no probe has named yet: it ships as an empty key, never a guess. No levels ship: a key holds a spell only once
-- the character knows it.
--
-- Each class has:
--   specs   the roles a player can pick besides Levelling: { id, role } (role "tank" or "healer" pre-picks it)
--   keys    the keys every bar page shares, by key ("F", "CTRL-X", "BUTTON4"), each a list of candidates
--   pages   bar 1's pages: { forms, base, [1] = list, ... } for keys 1 onwards; forms (the stance, form or stealth
--           that shows the page; none for the normal page) and base (the page's first action slot)
--   stances the spells (or lists of spells: one form at two ranks) whose stance-bar buttons `, Shift-` and Ctrl-` press
--   pets    true for a class whose ` and Shift-` are Pet Attack and Pet Follow
-- A candidate is a spell ID, or { id, only = "tank fury" }: on the list only for those roles.
-- UNVERIFIED on a Forever client (docs/SMOKE-TEST.md): every ID's name, and which bar page each stance, form and
-- stealth shows (the vanilla bonus bars: Battle, Cat and Stealth 1, Defensive 2, Berserker and Bear 3).

local ADDON, ns = ...
local L = ns.L

local D = {}
ns.KeybindsData = D

-- A spell whose WoW Forever ID waits for the probe (see the head of the file).
D.UNKNOWN = 0

-- Every spell a layout names, by name.
D.SPELL = {
  -- Warrior
  HeroicStrike = 78, Rend = 772, Overpower = 7384, ThunderClap = 6343, MortalStrike = 12294, Bloodthirst = 23881,
  ShieldSlam = 23922, SunderArmor = 7386, Revenge = 6572, ShieldBlock = 2565, Disarm = 676, Whirlwind = 1680,
  Execute = 5308, Cleave = 845, Recklessness = 1719, VictoryRush = D.UNKNOWN, Pummel = 6552, ShieldBash = 72,
  Taunt = 355, Hamstring = 1715, Bloodrage = 2687, ShieldWall = 871, BerserkerRage = 18499, Retaliation = 20230,
  Intercept = 20252, Charge = 100, DemoralizingShout = 1160, IntimidatingShout = 5246, BattleShout = 6673,
  BattleStance = 2457, DefensiveStance = 71, BerserkerStance = 2458,
  -- Druid
  Wrath = 5176, Moonfire = 8921, Starfire = 2912, Rejuvenation = 774, InsectSwarm = 5570, Innervate = 29166,
  Hurricane = 16914, Maul = 6807, Swipe = 779, DemoralizingRoar = 99, PrimalBite = D.UNKNOWN, Lacerate = D.UNKNOWN,
  Growl = 6795, FrenziedRegeneration = 22842, Enrage = 5229, Claw = 1082, Shred = 5221, Rake = 1822, Rip = 1079,
  FerociousBite = 22568, ShiftingPower = D.UNKNOWN, TigersFury = 5217, Bash = 5211, EntanglingRoots = 339,
  NaturesGrasp = 16689, Barkskin = 22812, HealingTouch = 5185, FeralCharge = 16979, Dash = 1850, FaerieFire = 770,
  MarkOfTheWild = 1126, Thorns = 467, OmenOfClarity = 16864, Prowl = 5215, BearForm = 5487, DireBearForm = 9634,
  CatForm = 768, TravelForm = 783,
  -- Rogue
  SinisterStrike = 1752, CheapShot = 1833, Mutilate = D.UNKNOWN, Backstab = 53, Garrote = 703, Eviscerate = 2098,
  Ambush = 8676, SliceAndDice = 5171, PickPocket = 921, ColdBlood = 14177, AdrenalineRush = 13750, Sap = 6770,
  ExposeArmor = 8647, Premeditation = 14183, Distract = 1725, Kick = 1766, Gouge = 1776, KidneyShot = 408,
  Evasion = 5277, Feint = 1966, Sprint = 2983, Vanish = 1856, Stealth = 1784,
  -- Mage
  Frostbolt = 116, Fireball = 133, FireBlast = 2136, FrostNova = 122, ArcanePower = 12042, Combustion = 11129,
  ArcaneMissiles = 5143, ArcaneExplosion = 1449, Counterspell = 2139, Polymorph = 118, Shoot = 5019,
  IceBlock = 11958, ManaShield = 1463, Blink = 1953, Evocation = 12051, ArcaneIntellect = 1459, IceArmor = 7302,
  FrostArmor = 168, ConjureFood = 587, ConjureWater = 5504,
  -- Warlock
  ShadowBolt = 686, Corruption = 172, CurseOfAgony = 980, Immolate = 348, LifeTap = 1454, DrainLife = 689,
  Fear = 5782, DeathCoil = 6789, HealthFunnel = 755, HowlOfTerror = 5484, DrainSoul = 1120, DemonArmor = 706,
  DemonSkin = 687, UnendingBreath = 5697, CreateHealthstone = 6201,
  -- Priest
  MindFlay = 15407, Smite = 585, ShadowWordPain = 589, MindBlast = 8092, DevouringPlague = D.UNKNOWN,
  ShadowWordDeath = D.UNKNOWN, HolyFire = 14914, Silence = 15487, PsychicScream = 8122, PowerWordShield = 17,
  FlashHeal = 2061, Heal = 2054, LesserHeal = 2050, Fade = 586, ShackleUndead = 9484, Shadowform = 15473,
  PowerWordFortitude = 1243, InnerFire = 588, DivineSpirit = 14752,
  -- Hunter
  ArcaneShot = 3044, RaptorStrike = 2973, AimedShot = 19434, SerpentSting = 1978, MultiShot = 2643,
  ScatterShot = 19503, ConcussiveShot = 5116, FreezingTrap = 1499, WingClip = 2974, HuntersMark = 1130,
  FeignDeath = 5384, MendPet = 136, Disengage = 781, RapidFire = 3045, AspectOfTheHawk = 13165,
  AspectOfTheMonkey = 13163, AspectOfTheCheetah = 5118,
  -- Paladin
  HolyStrike = D.UNKNOWN, SealOfRighteousness = 21084, Judgement = 20271, Consecration = 26573, Exorcism = 879,
  SealOfCommand = 20375, SealOfFury = D.UNKNOWN, SealOfTheCrusader = 21082, HammerOfJustice = 853,
  HolyShield = 20925, DivineFavor = 20216, DivineShield = 642, DivineProtection = 498, HolyLight = 635,
  BlessingOfFreedom = 1044, Cleanse = 4987, Purify = 1152, DevotionAura = 465, RetributionAura = 7294,
  BlessingOfMight = 19740, BlessingOfWisdom = 19742, BlessingOfKings = 20217,
  -- Shaman
  Stormstrike = 17364, LightningBolt = 403, FlameShock = 8050, FrostShock = 8056, LavaBurst = D.UNKNOWN,
  ChainLightning = 421, RageOfTheFarseer = D.UNKNOWN, ElementalMastery = 16166, CallOfTheElements = D.UNKNOWN,
  CallOfTheSpirits = D.UNKNOWN, CallOfTheAncestors = D.UNKNOWN, SearingTotem = 3599, EarthShock = 8042,
  Purge = 370, TotemicRecall = D.UNKNOWN, GroundingTotem = 8177, StoneskinTotem = 8071, HealingWave = 331,
  GhostWolf = 2645, TotemicProjection = D.UNKNOWN, RockbiterWeapon = 8017, WindfuryWeapon = 8232,
  FlametongueWeapon = 8024, LightningShield = 324,
}
local S = D.SPELL

-- Spells a character knows only from a talent: "Show what comes later" leaves them out until learned.
D.TALENTS = {
  [S.MortalStrike] = true, [S.Bloodthirst] = true, [S.ShieldSlam] = true, [S.InsectSwarm] = true,
  [S.FeralCharge] = true, [S.ColdBlood] = true, [S.AdrenalineRush] = true, [S.Premeditation] = true,
  [S.ArcanePower] = true, [S.Combustion] = true, [S.IceBlock] = true, [S.MindFlay] = true, [S.Silence] = true,
  [S.Shadowform] = true, [S.ScatterShot] = true, [S.SealOfCommand] = true, [S.HolyShield] = true,
  [S.DivineFavor] = true, [S.Stormstrike] = true, [S.ElementalMastery] = true,
}

-- A spell that takes the place of an older one on the same key (Ice Armor for Frost Armor): the older one is dropped
-- from the bars, not moved aside, when the new one arrives.
D.REPLACES = {
  [S.IceArmor] = { S.FrostArmor }, [S.DemonArmor] = { S.DemonSkin }, [S.Cleanse] = { S.Purify },
  [S.Heal] = { S.LesserHeal },
}

-- The roles' names, for the wizard's Your role choice.
D.ROLE_NAMES = {
  levelling = L["Levelling"], arms = L["Arms"], fury = L["Fury"], tank = L["Tank"], healer = L["Healer"],
  balance = L["Balance"], feral = L["Feral"], arcane = L["Arcane"], fire = L["Fire"], frost = L["Frost"],
  shadow = L["Shadow"], retribution = L["Retribution"], elemental = L["Elemental"], enhancement = L["Enhancement"],
}

-- The layouts, class by class (Appendix A of the key setup report).
D.CLASSES = {
  WARRIOR = {
    specs = { { "arms" }, { "fury" }, { "tank", role = "tank" } },
    keys = {
      F = { { S.Pummel, only = "fury" }, S.ShieldBash }, T = { { S.Taunt, only = "tank" }, S.Hamstring },
      G = { S.Bloodrage }, X = { { S.ShieldWall, only = "tank" }, { S.BerserkerRage, only = "fury" }, S.Retaliation },
      BUTTON4 = { { S.Intercept, only = "fury" }, S.Charge },
      BUTTON5 = { { S.DemoralizingShout, only = "tank" }, S.IntimidatingShout, S.DemoralizingShout },
      ["SHIFT-W"] = { S.BattleShout },
    },
    pages = {
      { forms = { S.BattleStance }, base = 73, { S.MortalStrike, S.HeroicStrike }, { S.Rend }, { S.Overpower, S.ThunderClap },
        { S.HeroicStrike, S.ThunderClap }, { S.VictoryRush }, { S.Execute } },
      { forms = { S.DefensiveStance }, base = 85, { S.ShieldSlam, S.SunderArmor }, { S.Revenge }, { S.ShieldBlock },
        { S.SunderArmor, S.HeroicStrike }, { S.ThunderClap }, { S.HeroicStrike, S.Disarm } },
      { forms = { S.BerserkerStance }, base = 97, { S.Bloodthirst, S.HeroicStrike }, { S.Whirlwind }, { S.Execute },
        { S.HeroicStrike, S.Cleave }, { S.VictoryRush }, { S.Cleave, S.Recklessness } },
    },
    stances = { S.BattleStance, S.DefensiveStance, S.BerserkerStance },
  },
  DRUID = {
    specs = { { "balance" }, { "feral" }, { "tank", role = "tank" }, { "healer", role = "healer" } },
    keys = {
      F = { { S.Bash, only = "tank" } }, T = { S.EntanglingRoots }, G = { S.NaturesGrasp }, X = { S.Barkskin },
      ["CTRL-X"] = { S.HealingTouch }, BUTTON4 = { { S.FeralCharge, only = "feral tank" }, S.Dash },
      BUTTON5 = { S.FaerieFire }, ["SHIFT-W"] = { S.MarkOfTheWild }, ["SHIFT-A"] = { S.Thorns },
      ["SHIFT-D"] = { S.OmenOfClarity }, ["SHIFT-SPACE"] = { S.Prowl },
    },
    pages = {
      { label = L["Caster"], base = 1, { S.Wrath }, { S.Moonfire }, { S.Starfire }, { S.Rejuvenation },
        { S.InsectSwarm, S.Innervate }, { S.Hurricane } },
      { forms = { S.CatForm }, base = 73, { S.Claw }, { S.Shred }, { S.Rake }, { S.Rip }, { S.FerociousBite },
        { S.ShiftingPower, S.TigersFury } },
      { forms = { S.BearForm, S.DireBearForm }, base = 97, { S.Maul }, { S.Swipe }, { S.DemoralizingRoar },
        { S.PrimalBite, S.Lacerate }, { S.Growl }, { S.FrenziedRegeneration, S.Enrage } },
    },
    stances = { { S.BearForm, S.DireBearForm }, S.CatForm, S.TravelForm },
  },
  ROGUE = {
    keys = {
      F = { S.Kick }, T = { S.Gouge }, G = { S.KidneyShot }, X = { S.Evasion }, ["CTRL-X"] = { S.Feint },
      BUTTON4 = { S.Sprint }, BUTTON5 = { S.Vanish },
    },
    pages = {
      { label = L["Out of stealth"], base = 1, { S.SinisterStrike }, { S.Mutilate, S.Backstab }, { S.Eviscerate },
        { S.SliceAndDice }, { S.ColdBlood, S.AdrenalineRush }, { S.ExposeArmor } },
      { forms = { S.Stealth }, base = 73, { S.CheapShot, S.SinisterStrike }, { S.Garrote }, { S.Ambush },
        { S.PickPocket }, { S.Sap }, { S.Premeditation, S.Distract } },
    },
    stances = { S.Stealth },
  },
  MAGE = {
    specs = { { "arcane" }, { "fire" }, { "frost" } },
    keys = {
      F = { S.Counterspell }, T = { S.Polymorph }, G = { S.Shoot }, X = { S.IceBlock, S.ManaShield },
      BUTTON4 = { S.Blink }, BUTTON5 = { S.Evocation }, ["SHIFT-W"] = { S.ArcaneIntellect },
      ["SHIFT-A"] = { S.IceArmor, S.FrostArmor }, ["SHIFT-D"] = { S.ConjureFood }, ["SHIFT-SPACE"] = { S.ConjureWater },
    },
    pages = {
      { base = 1, { { S.Frostbolt, only = "frost" }, S.Fireball }, { S.Frostbolt, S.Fireball }, { S.FireBlast },
        { S.FrostNova }, { S.ArcanePower, S.Combustion, S.ArcaneMissiles }, { S.ArcaneExplosion } },
    },
  },
  WARLOCK = {
    keys = {
      T = { S.Fear }, G = { S.Shoot }, X = { S.DeathCoil }, ["CTRL-X"] = { S.HealthFunnel },
      BUTTON4 = { S.HowlOfTerror }, BUTTON5 = { S.DrainSoul }, ["SHIFT-W"] = { S.DemonArmor, S.DemonSkin },
      ["SHIFT-A"] = { S.UnendingBreath }, ["SHIFT-SPACE"] = { S.CreateHealthstone },
    },
    pages = {
      { base = 1, { S.ShadowBolt }, { S.Corruption }, { S.CurseOfAgony }, { S.Immolate }, { S.LifeTap }, { S.DrainLife } },
    },
    pets = true,
  },
  PRIEST = {
    specs = { { "healer", role = "healer" }, { "shadow" } },
    keys = {
      F = { { S.Silence, only = "shadow" } }, T = { S.PsychicScream }, G = { S.Shoot }, X = { S.PowerWordShield },
      ["CTRL-X"] = { S.FlashHeal, S.Heal, S.LesserHeal }, BUTTON4 = { S.Fade }, BUTTON5 = { S.ShackleUndead },
      ["SHIFT-W"] = { S.PowerWordFortitude }, ["SHIFT-A"] = { S.InnerFire }, ["SHIFT-D"] = { S.DivineSpirit },
    },
    pages = {
      { base = 1, { { S.MindFlay, only = "shadow" }, S.Smite }, { S.ShadowWordPain }, { S.MindBlast },
        { S.DevouringPlague }, { S.ShadowWordDeath }, { S.HolyFire } },
    },
    stances = { S.Shadowform },
  },
  HUNTER = {
    keys = {
      F = { S.ScatterShot, S.ConcussiveShot }, T = { S.FreezingTrap, S.WingClip }, G = { S.HuntersMark },
      X = { S.FeignDeath }, ["CTRL-X"] = { S.MendPet }, BUTTON4 = { S.Disengage }, BUTTON5 = { S.RapidFire },
      ["SHIFT-W"] = { S.AspectOfTheHawk, S.AspectOfTheMonkey }, ["SHIFT-A"] = { S.AspectOfTheCheetah },
    },
    pages = {
      { base = 1, { S.ArcaneShot, S.RaptorStrike }, { S.AimedShot, S.SerpentSting }, { S.SerpentSting },
        { S.RaptorStrike }, {}, { S.MultiShot } },
    },
    pets = true,
  },
  PALADIN = {
    specs = { { "healer", role = "healer" }, { "tank", role = "tank" }, { "retribution" } },
    keys = {
      F = { S.HammerOfJustice }, T = { { S.HolyShield, only = "tank" } }, G = { { S.DivineFavor, only = "healer" } },
      X = { S.DivineShield, S.DivineProtection }, ["CTRL-X"] = { S.HolyLight }, BUTTON4 = { S.BlessingOfFreedom },
      BUTTON5 = { S.Cleanse, S.Purify }, ["SHIFT-W"] = { S.BlessingOfMight }, ["SHIFT-A"] = { S.BlessingOfWisdom },
      ["SHIFT-D"] = { S.BlessingOfKings },
    },
    pages = {
      { base = 1, { S.HolyStrike, S.SealOfRighteousness }, { S.Judgement }, { S.Consecration }, { S.Exorcism },
        { { S.SealOfCommand, only = "retribution" }, { S.SealOfFury, only = "tank" }, S.SealOfRighteousness },
        { S.SealOfTheCrusader } },
    },
    stances = { S.DevotionAura, S.RetributionAura },
  },
  SHAMAN = {
    specs = { { "elemental" }, { "enhancement" }, { "tank", role = "tank" }, { "healer", role = "healer" } },
    keys = {
      F = { S.EarthShock }, T = { S.Purge }, G = { S.TotemicRecall }, X = { S.GroundingTotem, S.StoneskinTotem },
      ["CTRL-X"] = { S.HealingWave }, BUTTON4 = { S.GhostWolf }, BUTTON5 = { S.TotemicProjection },
      ["SHIFT-W"] = { { S.RockbiterWeapon, only = "tank" }, { S.WindfuryWeapon, only = "enhancement" },
        { S.RockbiterWeapon, only = "enhancement" }, S.FlametongueWeapon, S.RockbiterWeapon },
      ["SHIFT-A"] = { S.LightningShield },
    },
    pages = {
      { base = 1, { { S.Stormstrike, only = "enhancement tank" }, S.LightningBolt }, { S.FlameShock }, { S.FrostShock },
        { { S.LavaBurst, only = "elemental" }, S.LightningBolt, S.ChainLightning },
        { { S.RageOfTheFarseer, only = "enhancement tank" }, { S.ElementalMastery, only = "elemental" } },
        { S.CallOfTheElements, S.SearingTotem }, { S.CallOfTheSpirits }, { S.CallOfTheAncestors } },
    },
  },
}
