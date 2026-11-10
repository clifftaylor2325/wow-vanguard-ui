// A Vitest reporter that prints one line as each test file finishes: how many
// files are done, the file's result and time, and the run's time so far. A
// whole run takes the better part of an hour, and in an agent's shell Vitest
// picks its quiet reporter (only failures, then the totals), so without these
// lines a run says nothing until it ends and a stuck run looks like a slow one.
// vitest.config.mjs adds it; progressOn says when.

// Seconds as "42s" or "12m04s".
export function clock(seconds) {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, "0")}s`;
}

// The "(24 tests)" part of a line, with the failures when there are any.
function counts(tests, failed) {
  const noun = tests === 1 ? "test" : "tests";
  return failed ? `(${tests} ${noun}, ${failed} failed)` : `(${tests} ${noun})`;
}

// One finished file's line: "[ 37/188] ok      35.2s  lua    scripts/tests/chat.test.mjs (152 tests)  12m04s in".
export function progressLine({ done, total, state, seconds, project, file, tests, failed, elapsed }) {
  const width = String(total).length;
  const at = `[${String(done).padStart(width)}/${total}]`;
  const result = (state === "passed" ? "ok" : state === "skipped" ? "skip" : "FAIL").padEnd(4);
  const took = `${seconds.toFixed(1)}s`.padStart(7);
  return `${at} ${result} ${took}  ${String(project || "").padEnd(5)}  ${file} ${counts(tests, failed)}  ${clock(elapsed)} in`;
}

// Whether the lines print: VG_PROGRESS=1 always and VG_PROGRESS=0 never; unset, only when Vitest
// chose its quiet reporter (its default reporter prints every file itself).
export function progressOn(env, baseReporters) {
  if (env.VG_PROGRESS === "1") return true;
  if (env.VG_PROGRESS === "0") return false;
  return baseReporters.includes("minimal");
}

// What progressLine needs from a finished test module.
function moduleFacts(testModule) {
  const tests = [...testModule.children.allTests()];
  return {
    state: testModule.state(),
    seconds: (testModule.diagnostic().duration ?? 0) / 1000,
    project: testModule.project.name,
    file: testModule.relativeModuleId,
    tests: tests.length,
    failed: tests.filter((t) => t.result().state === "failed").length,
  };
}

// A reporter object for vitest.config.mjs that prints a line per finished test file.
export function progressReporter() {
  return {
    // Keeps Vitest's logger so the lines print with the rest of the run's output.
    onInit(vitest) { this.logger = vitest.logger; },
    // A new run (or a watch rerun): the count and the clock start again.
    onTestRunStart(specifications) { Object.assign(this, { total: specifications.length, done: 0, started: Date.now() }); },
    // Prints the finished file's line.
    onTestModuleEnd(testModule) {
      this.done += 1;
      const elapsed = (Date.now() - this.started) / 1000;
      this.logger.log(progressLine({ done: this.done, total: this.total, elapsed, ...moduleFacts(testModule) }));
    },
  };
}
