// windows-pvp: the pvp group of game windows (Modules/WindowsPvP.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").
// The frames are built after Blizzard's Forever source (parentKeys and global names as the game has them).

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

// The pvp group's switch turned off in the saved variables.
const OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { pvp = false } } }" };

// Whether the addon recorded an error from the Windows module (none: "none").
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') or e.text:find('window') then return e.text end end return 'none'");

// TEST-ONLY helpers: a piece of game art (marked), a scroll bar shaped like MinimalScrollBar, and whether a
// frame has a texture of Vanguard's showing (a panel, a themed button) or what alpha a region has.
const PVP_ENV = WINDOWS_ENV + `
  function __art(parent, layer) local t = parent:CreateTexture(nil, layer or "BACKGROUND") t:SetTexture("TEST-ONLY-ART") return t end
  function __scrollBar(parent)
    local b = CreateFrame("Frame", nil, parent) b.Track = CreateFrame("Frame", nil, b) b.Thumb = CreateFrame("Button", nil, b.Track)
    __art(b.Track) return b
  end
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__kind == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
`;

it("the pvp group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.pvp"), "its switch is on by default").toBe(true);
  expect(windowErrors(addon)).toBe("none");
});

// Scoreboards ------------------------------------------------------------------------------------

// The scoreboard (Content, TabContainer, ScrollBar) and the match results (the same in lower case, a reward band
// and two push buttons), each with a SetupArtwork that lays new art on the frame, as the game's does.
const MATCH_ENV = PVP_ENV + `
  function __match(name, content, strip, bar)
    local f = __window(name)
    local c = CreateFrame("Frame", nil, f) f[content] = c
    c.Background, c.InsetBorderTop = __art(c), __art(c, "OVERLAY")
    c.ScrollBox = CreateFrame("Frame", nil, c) c.ScrollBox.Background = __art(c.ScrollBox)
    local s = CreateFrame("Frame", nil, c) c[strip] = s s.InsetBorderTop = __art(s) s.MatchmakingText = s:CreateFontString()
    f[bar] = __scrollBar(c)
    f.__setups = 0
    function f:SetupArtwork() self.__setups = self.__setups + 1 self.__new = __art(self) end
    return f
  end
  function __matches()
    __match("PVPMatchScoreboard", "Content", "TabContainer", "ScrollBar")
    local r = __match("PVPMatchResults", "content", "tabContainer", "scrollBar")
    local e = CreateFrame("Frame", nil, r.content) r.content.earningsArt = e
    e.background, e.OrangeGlow, e.OrangeSmoke = __art(e), __art(e, "OVERLAY"), __art(e, "OVERLAY")
    r.requeueButton, r.leaveButton = CreateFrame("Button", nil, r), CreateFrame("Button", nil, r)
  end
`;

it("S8.1 scoreboard and match results: window skin, table panel, the team wash and the reward burst kept", () => {
  const addon = loggedIn(MATCH_ENV + "__matches()");
  addon.eval("PVPMatchScoreboard:Show() PVPMatchResults:Show()");
  for (const name of ["PVPMatchScoreboard", "PVPMatchResults"]) {
    expect(windowState(addon, name), `${name}: the window skin`).toMatchObject({ art: 0, nine: 0, panel: true });
  }
  expect(addon.eval(`local c, s = PVPMatchScoreboard.Content, PVPMatchScoreboard.Content.TabContainer
    return { c.Background:GetAlpha(), c.InsetBorderTop:GetAlpha(), __panel(c), c.ScrollBox.Background:GetAlpha(), s.InsetBorderTop:GetAlpha() }`),
  "scoreboard: backdrop and inset border faded, an inset panel, the team wash kept, the tab strip's line faded").toEqual([0, 0, true, 1, 0]);
  expect(addon.eval(`local e = PVPMatchResults.content.earningsArt
    return { e.background:GetAlpha(), e.OrangeGlow:GetAlpha(), e.OrangeSmoke:GetAlpha(), __panel(PVPMatchResults.content) }`),
  "results: the reward band's backdrop faded, its burst of light kept, the table panelled").toEqual([0, 1, 1, true]);
  expect(addon.eval(`return { __panel(PVPMatchScoreboard.ScrollBar.Thumb), __panel(PVPMatchResults.scrollBar.Thumb),
    __panel(PVPMatchResults.requeueButton), __panel(PVPMatchResults.leaveButton) }`), "both scroll bars and the push buttons themed").toEqual([true, true, true, true]);
});

it("S8.1 scoreboards: art the game lays on later is faded, the hook goes on once, nothing piles up", () => {
  const addon = loggedIn(MATCH_ENV + "__matches()");
  addon.eval("PVPMatchScoreboard:Show()");
  const painted = windowState(addon, "PVPMatchScoreboard").painted;
  addon.eval("PVPMatchScoreboard:SetupArtwork()");
  expect(addon.eval("return { PVPMatchScoreboard.__new:GetAlpha(), PVPMatchScoreboard.__setups }"), "the faction border faded after SetupArtwork").toEqual([0, 1]);
  addon.eval("PVPMatchScoreboard:Hide() PVPMatchScoreboard:Show() PVPMatchScoreboard:SetupArtwork()");
  expect([windowState(addon, "PVPMatchScoreboard").painted, addon.eval("return PVPMatchScoreboard.__setups")], "painted once, the game's call runs once per call").toEqual([painted, 2]);
});

it("S8.1 scoreboards: loaded later (on demand), switched off, or bare", () => {
  const later = loggedIn(MATCH_ENV);
  later.eval("__matches()");
  later.fire("ADDON_LOADED", "Blizzard_PVPMatch");
  later.eval("PVPMatchResults:Show()");
  expect(windowState(later, "PVPMatchResults"), "a client that loads Blizzard_PVPMatch later").toMatchObject({ art: 0, panel: true });
  const off = loggedIn(MATCH_ENV + "__matches()", OFF);
  off.eval("PVPMatchScoreboard:Show()");
  expect([windowState(off, "PVPMatchScoreboard").art !== 0, off.eval("return PVPMatchScoreboard.vgWindow == nil")], "with the group off").toEqual([true, true]);
  const bare = loggedIn(PVP_ENV + '__window("PVPMatchScoreboard") __window("PVPMatchResults")');
  bare.eval("PVPMatchScoreboard:Show() PVPMatchResults:Show()");
  expect([windowState(bare, "PVPMatchResults").panel, windowErrors(bare)], "windows without a table, bar or buttons").toEqual([true, "none"]);
});
