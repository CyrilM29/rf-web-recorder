/*
 * rf-web-recorder — core/steps.js
 *
 * Step model + compaction rules. Pure logic, unit-testable without a DOM.
 *
 * A step is a plain JSON-safe object:
 *   { type, locator?, strategy?, name?, css?, value?, key? }
 * Types: click | fill | select | check | uncheck | press | wait-load |
 *        assert-visible | assert-text | assert-value | assert-count | capture |
 *        test (scenario marker: { type: "test", name } splits the export into
 *        multiple test cases)
 *
 * Compaction rules (applied on append, and again by compact()):
 *   - consecutive identical steps are deduped — except two identical CLICKS
 *     whose timestamps (`t`, ms) are far enough apart: clicking a "+" stepper
 *     twice is intent, the dedup only guards against double-dispatched events;
 *   - consecutive `fill` steps on the same locator keep only the LAST value
 *     (typing emits many change events — only the final value matters);
 *   - consecutive `wait-load` steps collapse to one;
 *   - `test` markers pass through untouched, and BREAK the adjacency the
 *     fill/wait rules rely on (a marker is a scenario boundary).
 */
(function (global, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { (global.__RFREC_CORE = global.__RFREC_CORE || {}).steps = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function stepKey(step) {
    if (!step) return "";
    return JSON.stringify([
      step.type,
      step.locator === undefined ? null : step.locator,
      step.value === undefined ? null : step.value,
      step.key === undefined ? null : step.key,
    ]);
  }
  function isSame(a, b) { return !!a && !!b && stepKey(a) === stepKey(b); }

  // Two identical consecutive clicks recorded this close together are one
  // double-dispatched event; further apart they are a deliberate repeat.
  var CLICK_DEDUP_WINDOW_MS = 500;

  // Appends `step` to `steps` in place, applying the compaction rules.
  // Returns true when the list changed (append or replace), false on drop.
  function addStep(steps, step) {
    if (step && step.type === "test") { steps.push(step); return true; } // scenario markers always pass through
    var last = steps.length ? steps[steps.length - 1] : null;
    if (isSame(last, step)) {                                   // consecutive identical: drop...
      var timedClicks = step.type === "click" &&
        typeof step.t === "number" && typeof last.t === "number";
      if (!timedClicks || step.t - last.t < CLICK_DEDUP_WINDOW_MS) return false;
      steps.push(step);                                         // ...unless it is a deliberate repeat
      return true;
    }
    if (step.type === "fill" && last && last.type === "fill" &&
        last.locator === step.locator) {
      steps[steps.length - 1] = step;                           // same field: keep last value
      return true;
    }
    if (step.type === "wait-load" && last && last.type === "wait-load") {
      return false;                                             // collapse load waits
    }
    steps.push(step);
    return true;
  }

  // Full pass over an existing list (e.g. restored from sessionStorage).
  function compact(steps) {
    var out = [];
    for (var i = 0; i < (steps || []).length; i++) addStep(out, steps[i]);
    return out;
  }

  return { addStep: addStep, compact: compact, isSame: isSame, stepKey: stepKey };
});
