// The error guard: a test fails when it leaves an error in ns.errors that it
// did not expect. The global afterEach in scripts/tests/setup.mjs reads what
// every addon the test built caught (caught) and judges it against the
// matchers the test named with expectErrors (check, judge). A test opts out
// only by naming each error it causes on purpose; expectErrors refuses a
// matcher broad enough to cover a class of errors (decision D-01).
//
// This module imports nothing (no fengari, no harness): setup.mjs loads it
// for the quick project too. `caught` only calls the addon.eval it is given.

// The matchers this test named, kept on globalThis so every module shares one list.
const expected = (globalThis[Symbol.for("vanguard.expected")] ??= []);

// Whether a string is non-empty or a regexp pattern names a single error:
// anchored at both ends, a letter in it, and nothing wider than digit runs.
function namesOneError(matcher) {
  if (typeof matcher === "string") return matcher.length > 0;
  if (!(matcher instanceof RegExp) || /[gmy]/.test(matcher.flags)) return false;
  const src = matcher.source;
  if (!src.startsWith("^") || !/(^|[^\\])(\\\\)*\$$/.test(src.slice(1))) return false;
  const rest = src.slice(1, -1).replace(/\\d\+?/g, "").replace(/\\[^a-zA-Z0-9]/g, "");
  return /[A-Za-z]/.test(rest) && !/[\\.*+?{}[\]()|^$]/.test(rest);
}

// Names the errors this test causes on purpose: each a non-empty string (the
// whole entry text) or a fully anchored RegExp that varies only in digit
// runs. Throws a TypeError (D-01) for any other matcher, keeping none.
export function expectErrors(...matchers) {
  const at = matchers.findIndex((m) => !namesOneError(m));
  if (at >= 0) {
    throw new TypeError(`expectErrors (D-01): ${String(matchers[at])} could cover a class of errors; name the whole error text, or an anchored pattern that varies only in digits`);
  }
  expected.push(...matchers);
}

// Empties this test's matchers and returns what it held.
export function takeExpected() {
  return expected.splice(0);
}

// Every entry the addon caught as [{ text, count, stack }]: the ones
// ns.ClearErrors forgot (kept by the harness in __wfgCleared), then ns.errors.
export function caught(addon) {
  const found = addon.eval(`
    local out = {}
    local function add(list)
      for i = 1, #list do out[#out + 1] = { text = list[i].text, count = list[i].count, stack = list[i].stack } end
    end
    add(__wfgCleared or {})
    add(ns.errors)
    return out`);
  return Array.isArray(found) ? found : [];
}

// Whether a matcher names this entry text: a string equals it, a RegExp matches it.
function matches(matcher, text) {
  return typeof matcher === "string" ? matcher === text : matcher.test(text);
}

// The lines of one unexpected entry: its number, text and count, then its stack when it has one.
function entryLines(entry, index) {
  const lines = [`  ${index + 1}. ${entry.text}   (x${entry.count})`];
  const stack = String(entry.stack ?? "").split("\n").filter((line) => line.trim() !== "");
  if (stack.length) lines.push("     stack:", ...stack.map((line) => `       ${line.trim()}`));
  return lines;
}

// What a matcher looks like in a message.
const show = (matcher) => (typeof matcher === "string" ? JSON.stringify(matcher) : String(matcher));

// The closing line: how to name the first unexpected error, or what to do with unused matchers.
function hint(unexpected) {
  if (!unexpected.length) return "Remove the expectErrors matcher that matched nothing, or make the test cause that error.";
  return `If the test causes the error on purpose, name it with expectErrors(${JSON.stringify(unexpected[0].text)}); otherwise fix the addon.`;
}

// "" when every entry matches some matcher and every matcher matches some
// entry, else the failure message (text, count and stack of each stray entry).
export function judge(found, expectedMatchers) {
  const unexpected = found.filter((e) => !expectedMatchers.some((m) => matches(m, e.text)));
  const unused = expectedMatchers.filter((m) => !found.some((e) => matches(m, e.text)));
  if (!unexpected.length && !unused.length) return "";
  const lines = unexpected.length ? [`Vanguard left ${unexpected.length} error(s) in ns.errors that this test did not expect:`] : [];
  unexpected.forEach((entry, i) => lines.push(...entryLines(entry, i)));
  if (unused.length) lines.push(`expected but never seen: ${unused.map(show).join(", ")}`);
  return [...lines, hint(unexpected)].join("\n");
}

// Throws one Error listing every entry the addons caught that the matchers do not cover.
export function check(addons, expectedMatchers) {
  const message = judge(addons.flatMap(caught), expectedMatchers);
  if (message) throw new Error(message);
}
