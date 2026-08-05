// node --test: core/emit_istqb.js ISTQB test plan + test cases export.
import test from "node:test";
import assert from "node:assert/strict";
import istqb from "../src/core/emit_istqb.js";
import emitSelenium from "../src/core/emit_selenium.js";

const { buildIstqb, istqbStep, istqbSlug } = istqb;

const STEPS = [
  { type: "test", name: "Search a product" },
  { type: "click", locator: "role=button[name=\"Search\"]", name: "Search",
    strategy: "role" },
  { type: "fill", locator: "id=query", name: "Search field", value: "laptop",
    strategy: "id" },
  { type: "press", key: "Enter" },
  { type: "wait-load" },
  { type: "assert-text", locator: "id=total", name: "Total", value: "3 results" },
  { type: "test", name: "Log in" },
  { type: "fill", locator: "id=pwd", name: "Password", value: "<PASSWORD>" },
];

// ---- normalized replay steps ----------------------------------------------
test("istqbStep: normalized action, human target first, locator as hint", () => {
  const st = istqbStep(STEPS[1]);
  assert.deepEqual(st, {
    action: "click", target: "Search",
    hint: { engine: "role", locator: "role=button[name=\"Search\"]" },
  });
});
test("istqbStep: assertions carry the real expected value", () => {
  const st = istqbStep(STEPS[5]);
  assert.equal(st.action, "assert_text");
  assert.equal(st.expected, "3 results");
});
test("istqbStep: masked values become fill_secret and never leak", () => {
  const st = istqbStep(STEPS[7]);
  assert.equal(st.action, "fill_secret");
  assert.equal(st.value, undefined);
  assert.match(st.note, /masked at capture/);
});
test("istqbStep: markers carry no entry, unknown types become raw with the exact line", () => {
  assert.equal(istqbStep(STEPS[0]), null);
  const st = istqbStep({ type: "nope", locator: "css=#x" });
  assert.equal(st.action, "raw");
  assert.match(st.note, /without translation/);
});

// ---- identifier slug -------------------------------------------------------
test("istqbSlug: kebab-case, accents transliterated (SAPFX live lesson)", () => {
  assert.equal(istqbSlug("Scénario enregistré"), "scenario-enregistre");
  assert.equal(istqbSlug("  !!  "), "recorded");
});

// ---- the document ----------------------------------------------------------
test("buildIstqb: plan sections, one TC per scenario, table + replay YAML", () => {
  const md = buildIstqb({ testName: "Demo", url: "https://shop.example/", steps: STEPS });
  for (const section of ["## 1. Objective and scope",
                         "## 2. Preconditions and test data",
                         "## 3. Entry / exit criteria",
                         "## 4. Test cases",
                         "## 5. Traceability",
                         "## 6. Risks and points of attention"]) {
    assert.match(md, new RegExp(section.replace(/[/]/g, "\\/")));
  }
  assert.match(md, /- \*\*Identifier\*\*: TP-demo/);
  assert.match(md, /### TC-01: Search a product/);
  assert.match(md, /### TC-02: Log in/);
  assert.match(md, /\| # \| Action \| Data \| Expected result \|/);
  // the human phrase reuses the accessible name; the value lands in Data
  assert.match(md, /\| 2 \| Fill Search field with "laptop"\. \| `laptop` \| The value is accepted \|/);
  // replay block: normalized actions + hint with the locator strategy
  assert.match(md, /channel: web/);
  assert.match(md, /- action: click\n {4}target: 'Search'\n {4}hint: \{engine: 'role', locator: 'role=button\[name="Search"\]'\}/);
  assert.match(md, /- action: press_key\n {4}value: 'Enter'/);
  assert.match(md, /- action: assert_text/);
  assert.match(md, /expected: '3 results'/);
  // observed values listed once; masked values excluded everywhere
  assert.match(md, /Values observed while recording: `laptop`\./);
  assert.doesNotMatch(md, /<PASSWORD>/);
  assert.match(md, /- action: fill_secret/);
});
test("buildIstqb: YAML single quotes doubled, table pipes escaped", () => {
  const md = buildIstqb({ testName: "L'apostrophe", url: "u", steps: [
    { type: "fill", locator: "id=a", name: "A|B", value: "l'apostrophe" },
  ] });
  assert.match(md, /title: 'L''apostrophe'/);
  assert.match(md, /value: 'l''apostrophe'/);
  assert.match(md, /A\\\|B/);
});
test("buildIstqb: unknown steps fall back to the chosen emitter's raw line", () => {
  const md = buildIstqb({ testName: "X", url: "u", steps: [
    { type: "nope", locator: "css=#x" },
  ] }, emitSelenium);
  assert.match(md, /- action: raw/);
  assert.match(md, /Untranslated step:/);
});
