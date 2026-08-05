// node --test: core/steps.js dedup + compaction rules (pure logic).
import test from "node:test";
import assert from "node:assert/strict";
import stepsCore from "../src/core/steps.js";

const { addStep, compact, isSame, sensitiveMask } = stepsCore;

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

// ---- scenario markers ------------------------------------------------------
function marker(name) { return { type: "test", name }; }

test("test markers always pass through, even consecutively", () => {
  const steps = [];
  assert.equal(addStep(steps, marker("A")), true);
  assert.equal(addStep(steps, marker("A")), true);   // no dedup on markers
  assert.equal(steps.length, 2);
});

test("a marker breaks fill compaction adjacency", () => {
  const steps = [];
  addStep(steps, fill("id=user", "adm"));
  addStep(steps, marker("Scenario 2"));
  addStep(steps, fill("id=user", "admin"));
  assert.equal(steps.length, 3);
  assert.equal(steps[0].value, "adm");
  assert.equal(steps[2].value, "admin");
});

test("a marker breaks wait-load compaction adjacency", () => {
  const steps = [];
  addStep(steps, { type: "wait-load" });
  addStep(steps, marker("Next"));
  addStep(steps, { type: "wait-load" });
  assert.deepEqual(steps.map((s) => s.type), ["wait-load", "test", "wait-load"]);
});

test("compact() keeps markers in place", () => {
  const out = compact([
    fill("id=q", "a"), fill("id=q", "ab"),
    marker("Second"),
    fill("id=q", "abc"),
  ]);
  assert.deepEqual(out.map((s) => s.type), ["fill", "test", "fill"]);
  assert.equal(out[1].name, "Second");
});

// ---- v0.4.0: click dedup is time-aware -------------------------------------
test("two identical clicks far apart in time are BOTH kept (deliberate repeat)", () => {
  const steps = [];
  addStep(steps, { type: "click", locator: "id=plus", t: 1000 });
  assert.equal(addStep(steps, { type: "click", locator: "id=plus", t: 2000 }), true);
  assert.equal(steps.length, 2);
});
test("two identical clicks within the dedup window collapse (double dispatch)", () => {
  const steps = [];
  addStep(steps, { type: "click", locator: "id=plus", t: 1000 });
  assert.equal(addStep(steps, { type: "click", locator: "id=plus", t: 1100 }), false);
  assert.equal(steps.length, 1);
});
test("identical clicks without timestamps still dedupe (legacy/imported steps)", () => {
  const steps = [];
  addStep(steps, click("id=a"));
  assert.equal(addStep(steps, click("id=a")), false);
  assert.equal(steps.length, 1);
});
test("compact() preserves deliberate timed repeats", () => {
  const kept = compact([
    { type: "click", locator: "id=plus", t: 1000 },
    { type: "click", locator: "id=plus", t: 2000 },
  ]);
  assert.equal(kept.length, 2);
});

// ---- sensitive-field masking ------------------------------------------------
// Duck-typed field: only getAttribute, like the real recorder call sites.
function field(attrs) {
  return { getAttribute: (n) => (n in attrs ? attrs[n] : null) };
}

test("sensitiveMask: password inputs mask as <PASSWORD>", () => {
  assert.equal(sensitiveMask(field({ type: "password" })), "<PASSWORD>");
  assert.equal(sensitiveMask(field({ type: "PASSWORD" })), "<PASSWORD>");
});

test("sensitiveMask: payment/OTP/password-manager autocomplete tokens mask as <SECRET>", () => {
  for (const ac of ["cc-number", "cc-csc", "cc-exp", "cc-exp-month", "cc-exp-year",
                    "one-time-code", "current-password", "new-password"]) {
    assert.equal(sensitiveMask(field({ type: "text", autocomplete: ac })), "<SECRET>", ac);
  }
  // autocomplete is a token list: the sensitive token can come with others
  assert.equal(sensitiveMask(field({ autocomplete: "billing cc-number" })), "<SECRET>");
});

test("sensitiveMask: card/CVC/OTP name-id-label patterns mask as <SECRET>", () => {
  assert.equal(sensitiveMask(field({ name: "card_number" })), "<SECRET>");
  assert.equal(sensitiveMask(field({ name: "cardNumber" })), "<SECRET>");
  assert.equal(sensitiveMask(field({ id: "cvv" })), "<SECRET>");
  assert.equal(sensitiveMask(field({ name: "cvc2" })), "<SECRET>");
  assert.equal(sensitiveMask(field({ name: "otp" })), "<SECRET>");
  assert.equal(sensitiveMask(field({ "aria-label": "Security code" })), "<SECRET>");
  assert.equal(sensitiveMask(field({ name: "one-time-code" })), "<SECRET>");
  // a text field whose name says password (visibility-toggled password UIs)
  assert.equal(sensitiveMask(field({ type: "text", name: "password" })), "<SECRET>");
});

test("sensitiveMask: ordinary fields are not masked", () => {
  assert.equal(sensitiveMask(field({ type: "text", name: "username" })), null);
  assert.equal(sensitiveMask(field({ type: "email", name: "email" })), null);
  assert.equal(sensitiveMask(field({ name: "search" })), null);
  assert.equal(sensitiveMask(field({ name: "cscope_query" })), null);  // csc needs word boundaries
  assert.equal(sensitiveMask(field({ name: "footpath" })), null);      // otp needs word boundaries
  assert.equal(sensitiveMask(field({ inputmode: "numeric", name: "quantity" })), null);
  assert.equal(sensitiveMask(null), null);
});
