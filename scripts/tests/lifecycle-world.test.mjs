// The lifecycle cases (lifecycle-helpers.mjs) in a populated world, for the live modules whose footprint depends on what
// the game shows: raid tiles for the raid modules, the trainer, a merchant and the mailbox for the town modules. The
// cases in lifecycle-2c and -2e log in solo with no window open, where those modules have little to register.

import { describe } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { HEALING_ENV, RAID_ENV, RAID_MARKS_ENV, SETUP_DONE, TRAINER_ONE_SERVICE_ENV, UNITS_ENV, loggedIn } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// Logged in, then two raid tiles shown (healing and mark reads in place), so each tile's rows, marks and unit
// subscriptions are part of what is compared.
function raidLogin(saved) {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + RAID_MARKS_ENV, { savedVariables: saved });
  addon.eval('__spawn(1, "raid1"); __spawn(3, "raid3")');
  return addon;
}

describe("in a raid with two tiles", () => {
  for (const name of ["RaidAuras", "RaidHealing", "RaidStatus"]) lifecycleCases(name, raidLogin);
});

// Logged in with the game's trainer window open (the Train all button made and shown).
function trainerLogin(saved) {
  const addon = loggedIn(TRAINER_ONE_SERVICE_ENV, { savedVariables: saved });
  addon.fire("TRAINER_SHOW");
  return addon;
}

describe("with the trainer open", () => lifecycleCases("Errands", trainerLogin));

// TEST-ONLY: a merchant that repairs.
const REPAIRER = "CanMerchantRepair = function() return true end GetRepairAllCost = function() return 50, true end GetMoney = function() return 500 end RepairAllItems = function() end";

// Logged in with a merchant open.
function merchantLogin(saved) {
  const addon = loggedIn(REPAIRER, { savedVariables: saved });
  addon.fire("MERCHANT_SHOW");
  return addon;
}

describe("with a merchant open", () => lifecycleCases("Merchant", merchantLogin));

// Logged in with the heavy modules off and the mail tools on, at an open mailbox with a letter in it (the panel made
// and shown beside it).
function mailboxLogin(saved = "") {
  const settings = "\nVanguardDB.profiles.Default.MailTools = { on = true }";
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + settings + saved });
  addon.login();
  addon.eval(`__wfgWorld.mail = { { sender = "TEST-ONLY Mum", subject = "Hello", money = 0, itemCount = 0 } }`);
  addon.world.openMailWindow();
  return addon;
}

describe("at an open mailbox", () => lifecycleCases("MailTools", mailboxLogin));
