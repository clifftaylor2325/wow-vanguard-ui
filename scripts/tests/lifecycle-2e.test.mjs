// The raid and town modules that switch off and on without a reload (A4-2e): RaidAuras, RaidHealing, RaidStatus,
// OfficerLoot, Upgrades, CharacterExtras, Errands, Merchant, TalentPlanner and QuestGuide. Each gets the three
// cases every live module gets (lifecycle-helpers.mjs), and a case for what its Disable does.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// The addon logged in with `saved` Lua appended to its saved variables (the lifecycle cases' login).
const login = (saved) => loggedIn("", { savedVariables: saved });

lifecycleCases("RaidAuras", login);
lifecycleCases("RaidHealing", login);
