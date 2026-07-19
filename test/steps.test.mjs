// node --test — core/steps.js dedup + compaction rules (pure logic).
import test from "node:test";
import assert from "node:assert/strict";
import stepsCore from "../src/core/steps.js";

const { addStep, compact, isSame } = stepsCore;

function click(loc) { return { type: "click", locator: loc, strategy: "role" }; }
function fill(loc, value) { return { type: "fill", locator: loc, value, strategy: "role" }; }

test("consecutive identical steps are deduped", () => {
  const steps = [];
  assert.equal(addStep(steps, click("id=a")), true);
  assert.equal(addStep(steps, click("id=a")), false);
  assert.equal(steps.length, 1);
});

test("non-consecutive duplicates are both kept", () => {
  const steps = [];
  addStep(steps, click("id=a"));
  addStep(steps, click("id=b"));
  addStep(steps, click("id=a"));
  assert.equal(steps.length, 3);
});

test("consecutive fills on the same locator keep only the last value", () => {
  const steps = [];
  addStep(steps, fill("id=user", "a"));
  addStep(steps, fill("id=user", "ad"));
  addStep(steps, fill("id=user", "admin"));
  assert.equal(steps.length, 1);
  assert.equal(steps[0].value, "admin");
});

test("consecutive fills on different locators are both kept", () => {
  const steps = [];
  addStep(steps, fill("id=user", "admin"));
  addStep(steps, fill("id=pass", "<PASSWORD>"));
  assert.equal(steps.length, 2);
});

test("identical consecutive fills (same value) collapse to one", () => {
  const steps = [];
  addStep(steps, fill("id=user", "admin"));
  assert.equal(addStep(steps, fill("id=user", "admin")), false);
  assert.equal(steps.length, 1);
});

test("consecutive wait-load steps collapse to one", () => {
  const steps = [];
  addStep(steps, { type: "wait-load" });
  assert.equal(addStep(steps, { type: "wait-load" }), false);
  addStep(steps, click("id=a"));
  addStep(steps, { type: "wait-load" });
  assert.equal(steps.length, 3);
});

test("compact() applies all rules over a restored list", () => {
  const noisy = [
    click("id=a"), click("id=a"),
    fill("id=user", "a"), fill("id=user", "admin"),
    { type: "wait-load" }, { type: "wait-load" },
    click("id=b"),
  ];
  const out = compact(noisy);
  assert.deepEqual(out.map((s) => s.type), ["click", "fill", "wait-load", "click"]);
  assert.equal(out[1].value, "admin");
});

test("isSame compares type, locator, value and key", () => {
  assert.equal(isSame(click("id=a"), click("id=a")), true);
  assert.equal(isSame(click("id=a"), click("id=b")), false);
  assert.equal(isSame({ type: "press", key: "Enter" }, { type: "press", key: "Tab" }), false);
});
