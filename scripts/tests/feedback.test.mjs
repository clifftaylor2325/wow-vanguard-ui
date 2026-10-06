// /vg feedback: the in-game feedback form (Core/Feedback.lua). Its checks are the
// site's (wow-vanguard-ui-site src/feedback/fields.js), and the block it makes is
// read by the site's src/feedback/fill.js, so the shapes below are that parser's.

import { expect, it } from "vitest";
import { CLICK_LUA, loggedIn } from "./helpers.mjs";

const BOX = "Vanguard_Feedback";
// Opens the form by /vg feedback [kind]; the problem line; the copy box's state; a text's lines.
const open = (addon, kind = "") => { addon.slash(`feedback ${kind}`.trim()); return addon.frame(BOX); };
const problem = (addon) => addon.eval(`return ${BOX}.problem:GetText()`);
const copyBox = (addon) => addon.eval("local f = Vanguard_TextDialog return { f:IsShown(), f.title:GetText(), f.edit:GetText() }");
const lines = (text) => text.split("\n");
// The test client keeps no keyboard focus: every box's SetFocus records itself as the focused one.
const FOCUS_LUA = `for _, n in ipairs({ "summary", "did", "expected", "happened", "want", "why" }) do
    local box = ${BOX}[n] or ${BOX}.bug[n] or ${BOX}.feature[n]
    box.SetFocus = function(self) __focused = n end
  end`;
// The name of the box focused last.
const focused = (addon) => addon.eval("return __focused");

// Fills the bug fields with a report that passes every check.
function goodBug(addon) {
  addon.type(`${BOX}.summary`, "Raid frames go blank after a reload");
  addon.type("Vanguard_Feedback_did", "Typed /reload in a raid group.");
  addon.type("Vanguard_Feedback_happened", "The raid frames stayed empty until I left the group.");
}

it("/vg feedback opens the form on a bug, with the summary focused and the bug fields showing", () => {
  const addon = loggedIn();
  expect(open(addon).visible, "the form opens").toBe(true);
  addon.eval(FOCUS_LUA);
  open(addon);
  expect(addon.eval(`return { ${BOX}.kind, ${BOX}.bug:IsShown(), ${BOX}.feature:IsShown(), __focused }`), "a bug at first, the summary focused").toEqual(["bug", true, false, "summary"]);
  expect(addon.texts("What did you do?").length + addon.texts("What happened instead?").length, "the bug's questions").toBe(2);
  addon.click(`${BOX}.cancel`);
  expect(addon.frame(BOX).visible, "Cancel closes it").toBe(false);
  expect(open(addon, "feature").visible && addon.eval(`return ${BOX}.kind`), "/vg feedback feature opens it on a feature").toBe("feature");
  expect(addon.eval(`return { ${BOX}.bug:IsShown(), ${BOX}.feature:IsShown() }`)).toEqual([false, true]);
  addon.eval(`${BOX}.summary:GetScript("OnEscapePressed")()`);
  expect(addon.frame(BOX).visible, "Escape closes it").toBe(false);
  expect(open(addon, "nonsense").visible && addon.eval(`return ${BOX}.kind`), "an unknown word keeps the kind last picked").toBe("feature");
  addon.click(`${BOX}.kindRow.segments[1]`);
  expect(addon.eval(`return { ${BOX}.kind, ${BOX}.bug:IsShown(), ${BOX}.feature:IsShown() }`), "the kind row switches back").toEqual(["bug", true, false]);
});

it("Make report says what the site would, in its words, and keeps the form open", () => {
  const addon = loggedIn();
  open(addon);
  addon.click(`${BOX}.make`);
  expect(problem(addon), "an empty summary").toBe("The short summary is required.");
  addon.type(`${BOX}.summary`, "  short  ");
  addon.click(`${BOX}.make`);
  expect(problem(addon), "too short, trimmed").toBe("The short summary needs at least 8 characters.");
  addon.type(`${BOX}.summary`, "x".repeat(101));
  addon.click(`${BOX}.make`);
  expect(problem(addon), "too long").toBe("The short summary can be at most 100 characters (it has 101).");
  addon.type(`${BOX}.summary`, "Raid frames go blank after a reload");
  addon.click(`${BOX}.make`);
  expect(problem(addon), "then the bug's texts, in order").toBe("What you did is required.");
  addon.type("Vanguard_Feedback_did", "Typed /reload.");
  addon.type("Vanguard_Feedback_expected", "é".repeat(1001));
  addon.click(`${BOX}.make`);
  expect(problem(addon), "characters are counted, not bytes").toBe("What you expected can be at most 1,000 characters (it has 1,001).");
  addon.type("Vanguard_Feedback_expected", "");
  addon.click(`${BOX}.make`);
  expect(problem(addon), "the expected text is optional").toBe("What happened instead is required.");
  expect(addon.frame(BOX).visible && !addon.eval("return Vanguard_TextDialog and Vanguard_TextDialog:IsShown()"), "nothing is made while a problem shows").toBe(true);
  addon.eval(`${BOX}.kind = "feature"`);
  addon.click(`${BOX}.make`);
  expect(problem(addon), "a feature checks its own texts").toBe("What you want is required.");
  addon.type("Vanguard_Feedback_want", "A bigger minimap.");
  addon.type("Vanguard_Feedback_why", "I keep missing nodes.");
  addon.click(`${BOX}.make`);
  expect(problem(addon), "and needs a part of Vanguard").toBe("Choose the part of Vanguard it's about.");
  expect(addon.eval('return ns.Feedback.Check({ kind = "idea", title = "A long enough title" })'), "a kind the site doesn't have").toBe("Choose Report a bug or Request a feature.");
});

it("a bug's block carries the kind, title, texts and the /vg report, color codes gone", () => {
  const addon = loggedIn();
  addon.eval('ns.Report("RaidFrames", "attempt to index a nil value")');
  open(addon);
  goodBug(addon);
  addon.type(`${BOX}.summary`, "  Raid frames   go |cffff0000blank|r\nafter a reload ");
  addon.type("Vanguard_Feedback_expected", "--- happened ---\n ### a line like a marker\nplain");
  addon.click(`${BOX}.make`);
  const [shown, title, text] = copyBox(addon);
  expect([shown, title, addon.frame(BOX).visible], "the block opens in the copy box and the form closes").toEqual([true, "Vanguard feedback: Ctrl+C, then paste at vanguardui.com/feedback", false]);
  const l = lines(text);
  expect([l[0], l.at(-1)], "the block's markers").toEqual(["### Vanguard feedback v1 ###", "### end feedback ###"]);
  expect(l.slice(1, 3), "kind and title, the title on one line without the game's colors").toEqual(["kind: bug", "title: Raid frames go blank after a reload"]);
  expect(l.slice(3, 11), "each text under its marker; a typed line that reads as a marker is set off by a space").toEqual([
    "--- did ---", "Typed /reload in a raid group.",
    "--- expected ---", " --- happened ---", "  ### a line like a marker", "plain",
    "--- happened ---", "The raid frames stayed empty until I left the group.",
  ]);
  const report = l.slice(l.indexOf("--- report ---") + 1, -1);
  expect([report[0], report.at(-1)], "then /vg report, whole").toEqual(["### Vanguard report v1 ###", "### end ###"]);
  expect(report.some((x) => /^\[1\] RaidFrames: .*attempt to index a nil value  \(x1\)$/.test(x)), "with the caught error").toBe(true);
  expect(text, "the same block as ns.Feedback.Text makes of the fields").toBe(addon.eval("return ns.Feedback.Text(ns.Feedback.Fields())"));
});

it("a feature's block carries the area, a module's key or one of the site's general choices", () => {
  const addon = loggedIn();
  open(addon, "feature");
  addon.type(`${BOX}.summary`, "A bigger minimap");
  addon.type("Vanguard_Feedback_want", "A minimap twice the size.");
  addon.type("Vanguard_Feedback_why", "I keep missing nodes.");
  const areas = addon.eval("return ns.Feedback.Areas()");
  expect(areas[0], "no choice first").toEqual(["", "Choose one"]);
  expect(areas.find((a) => a[0] === "Minimap")?.[1], "each module by its shown name").toBe(addon.eval('return ns.Options.MODULE_INFO.Minimap[1]'));
  expect(areas.slice(-4).map((a) => a[0]), "then the site's four general ones").toEqual(["command", "setting", "new", "not-sure"]);
  expect(addon.eval(`return { ns.Feedback.AreaLabel("Minimap"), ns.Feedback.AreaLabel("not-sure"), ns.Feedback.AreaLabel("") == nil, ns.Feedback.AreaLabel("Nope") == nil }`), "a label for a known value only").toEqual([areas.find((a) => a[0] === "Minimap")[1], "Not sure", true, true]);
  addon.click(`${BOX}.feature.area`);
  addon.eval(`${BOX}.feature.area.set("Minimap")`);
  expect(addon.eval(`return ${BOX}.feature.area.get()`), "the dropdown picks the area").toBe("Minimap");
  addon.click(`${BOX}.make`);
  const [, , text] = copyBox(addon);
  expect(lines(text), "the block").toEqual([
    "### Vanguard feedback v1 ###", "kind: feature", "title: A bigger minimap", "area: Minimap",
    "--- want ---", "A minimap twice the size.", "--- why ---", "I keep missing nodes.", "### end feedback ###",
  ]);
});

it("Tab runs through the boxes of the kind showing, Shift-Tab back, round the ends", () => {
  const addon = loggedIn();
  open(addon);
  addon.eval(FOCUS_LUA);
  // Tab pressed in the named box.
  const tab = (name) => addon.eval(`local b = ${BOX}["${name}"] or ${BOX}.bug["${name}"] or ${BOX}.feature["${name}"]; b:GetScript("OnTabPressed")()`);
  tab("summary");
  expect(focused(addon), "summary to what you did").toBe("did");
  tab("did"); tab("expected"); tab("happened");
  expect(focused(addon), "from the last box round to the summary").toBe("summary");
  addon.keys({ shift: true });
  tab("summary");
  expect(focused(addon), "Shift-Tab from the summary round to the last box").toBe("happened");
  tab("happened");
  expect(focused(addon), "and back one").toBe("expected");
  addon.keys({ shift: false });
  addon.eval(`${BOX}.kind = "feature"`);
  open(addon);
  tab("summary"); tab("want");
  expect(focused(addon), "a feature's order").toBe("why");
  addon.eval(`${BOX}.feature.why:GetScript("OnEscapePressed")()`);
  expect(addon.frame(BOX).visible, "Escape in a box closes the form").toBe(false);
});

it("the options window's General page has a Send feedback button that opens the form", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("");
  expect(addon.eval('return __click("Send feedback")'), "the button is on the page").toBeTruthy();
  expect([addon.eval("return Vanguard_Options:IsShown()"), addon.frame(BOX).visible], "it closes the options and opens the form").toEqual([false, true]);
});
