// The text-fit baseline's write rule (scripts/tests/textfit.test.mjs, VG_TEXTFIT_WRITE=1): the list only gets
// shorter. A run may take out the lines a change fixed and may start a list under a new key (a new audit's first
// record), but a line that is not already under an existing key is refused: a new overflow never goes in that way.

// The baseline after a write run: the written cases' lines in place of their keys', every key sorted. Throws when
// a written case that already has a key would gain a line.
export function mergeWritten(baseline, written) {
  const gained = Object.entries(written).flatMap(([key, found]) => (key in baseline ? found.filter((l) => !baseline[key].includes(l)).map((l) => `${key}: ${l}`) : []));
  if (gained.length) throw new Error(`VG_TEXTFIT_WRITE refuses ${gained.length} new overflow line(s) under an existing key (fix the text's room, or start a new key):\n  ${gained.join("\n  ")}`);
  return Object.fromEntries(Object.entries({ ...baseline, ...written }).sort(([a], [b]) => a.localeCompare(b)));
}
