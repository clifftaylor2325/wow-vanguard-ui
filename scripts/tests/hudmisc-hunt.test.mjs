// hud-misc bug hunt: the bag, minimap, strip and merchant modules against what the live client hands back.

import { expect, it } from "vitest";
import { UI_ENV, loggedIn } from "./helpers.mjs";

it("minimap: a shown state the client holds secret is never handed to the map's box", () => {
  const addon = loggedIn(UI_ENV);
  addon.eval(`Vanguard_Minimap.SetShown = function(self, shown)
    if issecretvalue(shown) then error("Secret values are only allowed during untainted execution") end
    self.__calls = (self.__calls or 0) + 1
  end
  Minimap.IsShown = function() return { __secret = true } end`);
  addon.eval("Minimap:Hide()");
  expect(addon.eval("return { #ns.errors, Vanguard_Minimap.__calls or 0 }"), "no error, and the box was not asked").toEqual([0, 0]);
});
