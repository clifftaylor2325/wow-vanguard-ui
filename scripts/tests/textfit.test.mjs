// textfit: text that doesn't fit where Vanguard put it, in the TEST-ONLY headless client with the addon's real font
// widths and every string a third longer, as a translation might run (createAddon's textFit: scripts/lib/wow-text.lua
// and scripts/lib/wow-textfit.lua). Each case opens one set of windows and audits them: text cut short in its box,
// text running out over an edge of its frame, and text drawn over other text or a control.
//
// Overflows found before this check existed are listed in textfit-baseline.json, by case. A case fails on one not
// listed there, and on a listed one that no longer happens, so the list only gets shorter: fix the text's room (the
// shared fit for a button label is ns.Theme.FitText), then take its line out. VG_TEXTFIT_WRITE=1 rewrites the list
// from what the cases find; use it only to take out what a change fixed, never to let a new overflow in.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { SETUP_DONE, expectErrors } from "./helpers.mjs";
import { SCENES, buildScene } from "../lib/preview-scenes.mjs";

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "textfit-baseline.json");
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const written = {};

// One finding as a baseline line: what, where, the text (as written in English) and what it ran into.
const line = (f) => [f.kind, f.place, f.text, f.other].filter(Boolean).join(" | ");

// An addon in the text-fit client, logged in on a finished-setup account (a brand-new one when firstRun).
function fitClient(firstRun = false) {
  const addon = createAddon({ savedVariables: firstRun ? "" : SETUP_DONE, textFit: true });
  addon.login();
  return addon;
}

// What one audit pass finds, as sorted unique baseline lines.
const lines = (findings) => [...new Set(findings.map(line))].sort();

// Checks a case's findings against its baseline lines (or records them, under VG_TEXTFIT_WRITE).
function expectFits(name, findings) {
  const found = lines(findings);
  if (process.env.VG_TEXTFIT_WRITE) return void (written[name] = found);
  const known = new Set(baseline[name] ?? []);
  expect(found.filter((l) => !known.has(l)), `${name}: new text overflow (give the text room or fit it; see the top of this file)`).toEqual([]);
  expect([...known].filter((l) => !found.includes(l)), `${name}: fixed, so take these out of textfit-baseline.json`).toEqual([]);
}

afterAll(() => {
  if (!process.env.VG_TEXTFIT_WRITE) return;
  const merged = Object.fromEntries(Object.entries({ ...baseline, ...written }).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(BASELINE, `${JSON.stringify(merged, null, 2)}\n`);
});

it("text fits: the setup wizard, every step", () => {
  const addon = fitClient(true);
  const findings = [];
  for (let step = 1; step <= 8 && addon.eval("return Vanguard_Setup:IsShown()"); step++) {
    findings.push(...addon.textFit("Vanguard_Setup"));
    addon.eval("ns.Setup.Next()");
  }
  expectFits("setup wizard", findings);
});

// Audits the options window on each of its pages from first to last (1-based, inclusive), in one client.
function optionsPages(first, last) {
  const addon = fitClient();
  const pages = addon.eval("local out = {} for _, p in ipairs(ns.Options.PAGES) do out[#out + 1] = p.key end return out");
  const findings = [];
  for (const page of pages.slice(first - 1, last)) {
    addon.eval(`ns.Options.Show(${JSON.stringify(page)})`);
    findings.push(...addon.textFit("Vanguard_Options"));
  }
  return findings;
}

it("text fits: the options window, the first ten pages", () => {
  expectFits("options window, pages 1-10", optionsPages(1, 10));
});

it("text fits: the options window, the pages after the tenth", () => {
  expectFits("options window, pages 11 on", optionsPages(11, Infinity));
});

it("text fits: the screen at login, and unlock mode's handles", () => {
  const addon = fitClient();
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2, level: 18 });
  const findings = addon.textFit();
  addon.slash("unlock");
  findings.push(...addon.textFit());
  expectFits("screen", findings);
});

it("text fits: the dialogs", () => {
  const addon = fitClient();
  const findings = [];
  // Opens a dialog by Lua and audits the frame it shows in.
  const open = (lua, frame) => { addon.eval(lua); findings.push(...addon.textFit(frame)); };
  open('ns.Ask(ns.L["Reset this page?"], ns.L["Reset"], function() end)', "Vanguard_Question");
  open('ns.OfferReload(ns.L["Some changes take effect after a reload."])', "Vanguard_Reload");
  open('ns.ShowText(ns.L["Export profile"], "Vanguard:1:abc")', "Vanguard_TextDialog");
  open('ns.ShowFind(ns.L["Find"], function() return {} end)', "Vanguard_FindDialog");
  expectFits("dialogs", findings);
});

it("text fits: the key-capture prompt on a French client is not cut short (P1-4)", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: 'GetLocale = function() return "frFR" end' });
  addon.login();
  addon.eval(`TEST_KeyCapture = ns.Widgets.KeyCapture(UIParent, ns.L["Add key"], function() end)
    TEST_KeyCapture:SetPoint("CENTER") TEST_KeyCapture.__scripts.OnClick(TEST_KeyCapture)`);
  expect(addon.eval("return TEST_KeyCapture.text:GetText()"), "the French prompt shows").not.toBe("Press a key, click or scroll...");
  expect(addon.textFit("TEST_KeyCapture"), "the prompt fits its 220-wide button").toEqual([]);
});

it("text fits: the key-capture prompt is not cut short in any language at the largest Text size (B1-5)", () => {
  for (const locale of ["deDE", "esES", "esMX", "ruRU"]) {
    const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: `GetLocale = function() return "${locale}" end` });
    addon.login();
    addon.eval(`ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()
      TEST_KeyCapture = ns.Widgets.KeyCapture(UIParent, ns.L["Add key"], function() end)
      TEST_KeyCapture:SetPoint("CENTER") TEST_KeyCapture.__scripts.OnClick(TEST_KeyCapture)`);
    expect(addon.textFit("TEST_KeyCapture"), `${locale}: the prompt fits its 220-wide button at Text size 130%`).toEqual([]);
  }
});

it("text fits: the find box after a search with a long query keeps its title on one line above the query (P1-2, P8-5)", () => {
  const addon = fitClient();
  const query = "the dungeon group is looking for a healer tonight at eight";
  addon.eval(`ns.ShowFind(ns.L["Find"], function(q) return 'Chat: 9 lines with "' .. q .. '"', "text" end)
    Vanguard_FindDialog.query:SetText("${query}") Vanguard_FindDialog.go.__scripts.OnClick(Vanguard_FindDialog.go)`);
  expect(addon.eval("return Vanguard_FindDialog.title:GetText()")).toContain(query);
  expect(addon.eval("return Vanguard_FindDialog.title:GetMaxLines()"), "the title is one line").toBe(1);
  // A long summary is cut short on purpose (an ellipsis); what must not happen is drawing over the query row.
  const kinds = addon.textFit("Vanguard_FindDialog").map((finding) => finding.kind);
  expect(kinds.filter((kind) => kind !== "cut"), "the title overlaps nothing in the find box").toEqual([]);
});

// The preview's scenes (scripts/lib/preview-scenes.mjs) that open a window, and the frames each one audits.
const SCENE_WINDOWS = [
  ["vanguard-stock-list", ["Vanguard_StockList"]],
  ["vanguard-errands", ["ClassTrainerFrame", "Vanguard_FlightTimer"]],
  ["vanguard-quest-gossip", ["Vanguard_QuestDialog"]],
  ["vanguard-quest-detail", ["Vanguard_QuestDialog"]],
  ["vanguard-auction", ["Vanguard_AuctionShopping"]],
  ["vanguard-auction-selling", ["Vanguard_AuctionSelling"]],
  ["vanguard-auction-alert", ["Vanguard_AuctionFilters"]],
  ["vanguard-bosses", ["Vanguard_RaidTools"]],
  ["vanguard-strip", ["Vanguard_InfoStrip"]],
];

it("text fits: the town, quest, auction and group windows of the preview's scenes", () => {
  const findings = [];
  for (const [name, frames] of SCENE_WINDOWS) {
    const addon = buildScene(SCENES.find((s) => s.name === name), { textFit: true });
    for (const frame of frames) findings.push(...addon.textFit(frame));
  }
  expectFits("preview scenes' windows", findings);
});

it("text fits: the errors window's Report a bug button is as wide as its label, and Import gets the usual width back (B1-6)", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: 'GetLocale = function() return "ruRU" end' });
  addon.login();
  addon.eval(`ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh() ns.ShowErrors("Errors", "none")`);
  const label = addon.eval('return ns.L["Report a bug"]');
  const cut = addon.textFit("Vanguard_TextDialog").filter((finding) => finding.text === label);
  expect(cut, "the label of Report a bug is whole at Text size 130%").toEqual([]);
  expect(addon.eval("return Vanguard_TextDialog.primary:GetWidth()"), "the button grew past the usual 120").toBeGreaterThan(120);
  addon.eval(`ns.AskText("Import", function() end)`);
  expect(addon.eval("return Vanguard_TextDialog.primary:GetWidth()"), "the next use of the box has the usual width").toBe(120);
});

it("text fits: a dialog's long title stays on one line instead of wrapping over its content (B1-8)", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: 'GetLocale = function() return "ruRU" end' });
  addon.login();
  addon.world.setUnit("player", { class: "WARRIOR", level: 25 });
  addon.eval(`ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()`);
  addon.slash("prep setup");
  expect(addon.eval("return Vanguard_PrepWizard.title:GetMaxLines()"), "the title is one line").toBe(1);
  const title = addon.eval("return Vanguard_PrepWizard.title:GetText()");
  const over = addon.textFit("Vanguard_PrepWizard").filter((finding) => finding.text === title && finding.kind !== "cut");
  expect(over, "the title is cut with an ellipsis at worst, and draws over nothing").toEqual([]);
  addon.eval('ns.Ask("Reset this page?", "Reset", function() end)');
  expect(addon.eval("return Vanguard_Question.title:GetMaxLines()"), "a hung title (question, reload) is not limited").toBe(0);
});

// The options footer with 12 caught errors and a reload waiting, in a language at Text size 130%:
// [error line's right edge, notice's left edge, the error text's right edge, reload button's whole-label cuts].
function footerAt(locale, replaced) {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: `GetLocale = function() return "${locale}" end` });
  addon.login();
  addon.eval(`ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()
    for i = 1, 12 do ns.Report("TEST-ONLY site", "failure " .. i) end`);
  addon.advance(0.5);
  addon.eval(`ns.Options.${replaced ? "ProfileReplaced" : "NeedReload"}() ns.Options.Show()`);
  const label = addon.eval('return ns.L["Reload now"]');
  const cuts = addon.textFit("Vanguard_Options").filter((finding) => finding.text === label);
  return addon.eval("return { Vanguard_OptionsErrors:GetRight(), Vanguard_Options.notice:GetLeft(), Vanguard_OptionsErrors.text:GetRight(), Vanguard_Options.reload:GetLeft() }").concat([cuts.length]);
}

it("text fits: the options footer's error line stops short of the reload notice, and Reload now shows whole (B1-7, B2-2)", () => {
  expectErrors(/^TEST-ONLY site: failure \d+$/);
  for (const [locale, replaced] of [["enUS", true], ["deDE", false], ["deDE", true], ["frFR", true], ["ruRU", false]]) {
    const [errorsRight, noticeLeft, textRight, reloadLeft, cuts] = footerAt(locale, replaced);
    expect(errorsRight, `${locale}: the error line ends before the notice`).toBeLessThanOrEqual(noticeLeft + 1e-6);
    expect(textRight, `${locale}: and its text stays inside its click area`).toBeLessThanOrEqual(errorsRight + 1e-6);
    expect(noticeLeft, `${locale}: the notice ends at the Reload now button`).toBeLessThan(reloadLeft);
    expect(cuts, `${locale}: Reload now is not cut`).toBe(0);
  }
});
