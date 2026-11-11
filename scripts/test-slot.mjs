#!/usr/bin/env node
// npm run test:slot -- <vitest args>: `vitest run <args>` once this machine has a free
// test slot (scripts/lib/test-slot.mjs). npm test and npm run test:quick are this script,
// and npm run coverage takes a slot the same way, so two suite runs never overlap on one
// machine. It waits when every slot is busy, and prints one line saying for whom.
//   VG_TEST_SLOTS=n      slots on this machine (default 1 under 12 GB of memory, else 2)
//   VG_TEST_SLOT_DIR=d   where the slot files live (default: vanguard-test-slots in the temp folder)

import { runInSlot } from "./lib/test-slot.mjs";

process.exit(await runInSlot(process.argv.slice(2)));
