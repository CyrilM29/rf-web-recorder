// node --test — core/emit_browser.js keyword emission and suite/resource builders.
import test from "node:test";
import assert from "node:assert/strict";
import emit from "../src/core/emit_browser.js";

const { rfEscape, emitStep, emitBody, buildSuite, buildResourcePair } = emit;

// ---- Robot Framework escaping ---------------------------------------------
test("rfEscape: empty and null become ${EMPTY}", () => {
  assert.equal(rfEscape(""), "${EMPTY}");
  assert.equal(rfEscape(null), "${EMPTY}");
});
test("rfEscape: runs of spaces are escaped so tokens survive", () => {
  assert.equal(rfEscape("a  b"), "a \\ b");
});
test("rfEscape: leading #, leading/trailing space, backslash", () => {
  assert.equal(rfEscape("#tag"), "\\#tag");
  assert.equal(rfEscape(" x"), "\\ x");
  assert.equal(rfEscape("x "), "x\\ ");
  assert.equal(rfEscape("C:\\tmp"), "C:\\\\tmp");
});

// ---- per-step emission -----------------------------------------------------
test("emitStep: actions", () => {
  assert.deepEqual(emitStep({ type: "click", locator: "id=save" }), ["Click    id=save"]);
  assert.deepEqual(emitStep({ type: "fill", locator: "id=user", value: "admin" }),
    ["Fill Text    id=user    admin"]);
  assert.deepEqual(emitStep({ type: "select", locator: "id=country", value: "France" }),
    ["Select Options By    id=country    label    France"]);
  assert.deepEqual(emitStep({ type: "check", locator: "id=tos" }), ["Check Checkbox    id=tos"]);
  assert.deepEqual(emitStep({ type: "uncheck", locator: "id=tos" }), ["Uncheck Checkbox    id=tos"]);
  assert.deepEqual(emitStep({ type: "press", key: "Enter" }), ["Keyboard Key    press    Enter"]);
  assert.deepEqual(emitStep({ type: "wait-load" }), ["Wait For Load State    load"]);
});
test("emitStep: assertions", () => {
  assert.deepEqual(emitStep({ type: "assert-visible", locator: "id=hdr" }),
    ["Get Element States    id=hdr    contains    visible"]);
  assert.deepEqual(emitStep({ type: "assert-text", locator: "id=hdr", value: "Welcome" }),
    ["Get Text    id=hdr    ==    Welcome"]);
  assert.deepEqual(emitStep({ type: "assert-value", locator: "id=user", value: "admin" }),
    ["Get Property    id=user    value    ==    admin"]);
  assert.deepEqual(emitStep({ type: "assert-count", locator: "css=li", value: 3 }),
    ["Get Element Count    css=li    ==    3"]);
  assert.deepEqual(emitStep({ type: "capture", locator: "id=hdr" }), ["Get Element    id=hdr"]);
});
test("emitBody joins step lines", () => {
  const body = emitBody([{ type: "click", locator: "id=a" }, { type: "wait-load" }]);
  assert.equal(body, "Click    id=a\nWait For Load State    load\n");
});

// ---- full suite ------------------------------------------------------------
test("buildSuite: full runnable .robot text", () => {
  const text = buildSuite({
    testName: "Login Works",
    url: "https://example.test/app",
    steps: [{ type: "click", locator: 'role=button[name="Log in"]' }],
  });
  const lines = text.split("\n");
  assert.equal(lines[0], "*** Settings ***");
  assert.equal(lines[1], "Library    Browser");
  assert.equal(lines[3], "*** Test Cases ***");
  assert.equal(lines[4], "Login Works");
  assert.equal(lines[5], "    New Browser    chromium    headless=False");
  assert.equal(lines[6], "    New Page    https://example.test/app");
  assert.equal(lines[7], '    Click    role=button[name="Log in"]');
});
test("buildSuite: default test name", () => {
  assert.match(buildSuite({ steps: [] }), /Recorded Scenario/);
});

// ---- resource-first pair ---------------------------------------------------
test("buildResourcePair: locators become variables, steps become keywords", () => {
  const { resource, suite, resourceName } = buildResourcePair({
    testName: "Login Works",
    url: "https://example.test/app",
    steps: [
      { type: "fill", locator: 'role=textbox[name="Username"]', name: "Username", value: "admin" },
      { type: "click", locator: 'role=button[name="Log in"]', name: "Log in" },
      { type: "press", key: "Enter" },
      { type: "wait-load" },
      { type: "assert-text", locator: "id=welcome", name: "Welcome", value: "Hello admin" },
    ],
  });
  assert.equal(resourceName, "recorded_keywords.resource");
  // resource: variables carry the locators
  assert.match(resource, /\$\{LOC_1_USERNAME\}    role=textbox\[name="Username"\]/);
  assert.match(resource, /\$\{LOC_2_LOG_IN\}    role=button\[name="Log in"\]/);
  // resource: keywords wrap the Browser calls, args for value-bearing steps
  assert.match(resource, /Fill Username\n    \[Arguments\]    \$\{value\}\n    Fill Text    \$\{LOC_1_USERNAME\}    \$\{value\}/);
  assert.match(resource, /Click Log In\n    Click    \$\{LOC_2_LOG_IN\}/);
  assert.match(resource, /Welcome Text Should Be\n    \[Arguments\]    \$\{expected\}\n    Get Text    \$\{LOC_3_WELCOME\}    ==    \$\{expected\}/);
  // suite: locator-free, calls only resource keywords (+ inline no-locator steps)
  assert.match(suite, /Resource    recorded_keywords.resource/);
  assert.match(suite, /    Fill Username    admin/);
  assert.match(suite, /    Click Log In/);
  assert.match(suite, /    Keyboard Key    press    Enter/);
  assert.match(suite, /    Wait For Load State    load/);
  assert.match(suite, /    Welcome Text Should Be    Hello admin/);
  assert.ok(!suite.includes('role=button[name="Log in"]'), "raw locators must not leak into the suite");
});
test("buildResourcePair: repeated (action, locator) pairs reuse one keyword", () => {
  const { resource, suite } = buildResourcePair({
    steps: [
      { type: "click", locator: "id=next", name: "Next" },
      { type: "fill", locator: "id=q", name: "Query", value: "first" },
      { type: "click", locator: "id=next", name: "Next" },
    ],
  });
  assert.equal((resource.match(/^Click Next$/gm) || []).length, 1);
  assert.equal((suite.match(/^    Click Next$/gm) || []).length, 2);
});

// ---- scenario markers (multi-test sessions) --------------------------------
test("emitStep: test marker becomes a comment line (body pastes)", () => {
  assert.deepEqual(emit.emitStep({ type: "test", name: "Checkout" }),
    ["# --- Test: Checkout ---"]);
});
test("buildSuite: markers split into multiple test cases, bootstrap only once", () => {
  const text = buildSuite({
    testName: "Login",
    url: "https://app.example/",
    steps: [
      { type: "click", locator: "id=go" },
      { type: "test", name: "Search Works" },
      { type: "fill", locator: "id=q", value: "robot" },
    ],
  });
  const lines = text.split("\n");
  assert.equal(lines[4], "Login");
  assert.equal(lines[5], "    New Browser    chromium    headless=False");
  assert.equal(lines[7], "    Click    id=go");
  assert.equal(lines[8], "Search Works");
  assert.equal(lines[9], "    Fill Text    id=q    robot");
  assert.equal((text.match(/New Browser/g) || []).length, 1, "bootstrap only in the first test");
  assert.equal((text.match(/New Page/g) || []).length, 1);
});
test("buildSuite: an initial marker names the first test (no empty bootstrap test)", () => {
  const text = buildSuite({
    testName: "Ignored",
    steps: [{ type: "test", name: "Actual First" }, { type: "click", locator: "id=a" }],
  });
  assert.match(text, /\*\*\* Test Cases \*\*\*\nActual First\n    New Browser/);
  assert.ok(!text.includes("Ignored"));
});
test("buildSuite: a trailing marker still yields a valid (non-empty) test", () => {
  const text = buildSuite({
    steps: [{ type: "click", locator: "id=a" }, { type: "test", name: "Empty Tail" }],
  });
  assert.match(text, /Empty Tail\n    No Operation\n/);
});
test("buildResourcePair: markers split the suite, bootstrap only once", () => {
  const { resource, suite } = buildResourcePair({
    testName: "Login",
    steps: [
      { type: "click", locator: "id=go", name: "Go" },
      { type: "test", name: "Second Scenario" },
      { type: "click", locator: "id=go", name: "Go" },
    ],
  });
  assert.match(suite, /Login\n    New Browser/);
  assert.match(suite, /Second Scenario\n    Click Go/);
  assert.equal((suite.match(/New Browser/g) || []).length, 1);
  assert.equal((resource.match(/^Click Go$/gm) || []).length, 1, "keyword still deduped across scenarios");
});

// ---- CSS fallback locators in the resource pair ----------------------------
test("buildResourcePair: css fallback becomes a _FALLBACK variable + IF/ELSE body", () => {
  const { resource, suite } = buildResourcePair({
    steps: [
      { type: "fill", locator: 'role=textbox[name="Username"]', strategy: "role",
        css: '[id="login"] > input:nth-of-type(1)', name: "Username", value: "admin" },
      { type: "click", locator: 'role=button[name="Log in"]', strategy: "role",
        css: '[id="login"] > button:nth-of-type(1)', name: "Log in" },
    ],
  });
  // fallback variables next to the primaries
  assert.match(resource, /\$\{LOC_1_USERNAME\}    role=textbox\[name="Username"\]/);
  assert.match(resource, /\$\{LOC_1_USERNAME_FALLBACK\}    \[id="login"\] > input:nth-of-type\(1\)/);
  assert.match(resource, /\$\{LOC_2_LOG_IN_FALLBACK\}    \[id="login"\] > button:nth-of-type\(1\)/);
  // IF/ELSE body probing the primary first, arg used in BOTH branches
  const expectedBody = [
    "Fill Username",
    "    [Arguments]    ${value}",
    "    ${found}=    Get Element Count    ${LOC_1_USERNAME}",
    "    IF    ${found} > 0",
    "        Fill Text    ${LOC_1_USERNAME}    ${value}",
    "    ELSE",
    "        Log    Primary locator not found - falling back to the recorded CSS path    WARN",
    "        Fill Text    ${LOC_1_USERNAME_FALLBACK}    ${value}",
    "    END",
  ].join("\n");
  assert.ok(resource.includes(expectedBody), "IF/ELSE fallback body emitted verbatim");
  assert.match(resource, /Click Log In\n    \$\{found\}=    Get Element Count    \$\{LOC_2_LOG_IN\}/);
  // the suite stays locator-free either way
  assert.ok(!suite.includes("role="));
  assert.ok(!suite.includes("nth-of-type"));
});
test("buildResourcePair: no fallback when css equals the locator or is absent", () => {
  const { resource } = buildResourcePair({
    steps: [
      { type: "click", locator: "body > button:nth-of-type(1)", strategy: "css-path",
        css: "body > button:nth-of-type(1)", name: "Raw" },
      { type: "click", locator: "id=save", name: "Save" },
    ],
  });
  assert.ok(!resource.includes("_FALLBACK"), "no fallback variable emitted");
  assert.ok(!resource.includes("IF    "), "simple keyword bodies kept");
  assert.match(resource, /Click Save\n    Click    \$\{LOC_2_SAVE\}/);
});
test("buildResourcePair: css-path strategy never gets a fallback even if css differs", () => {
  const { resource } = buildResourcePair({
    steps: [{ type: "click", locator: "body > b:nth-of-type(1)", strategy: "css-path",
              css: "body > i:nth-of-type(1)", name: "Odd" }],
  });
  assert.ok(!resource.includes("_FALLBACK"));
});

// ---- parseSuite (.robot re-import) -----------------------------------------
const { parseSuite } = emit;

test("parseSuite: round-trips a buildSuite export (supported step set)", () => {
  const steps = [
    { type: "click", locator: 'role=button[name="Log in"]' },
    { type: "fill", locator: "id=user", value: "admin" },
    { type: "select", locator: "id=country", value: "France" },
    { type: "check", locator: "id=tos" },
    { type: "uncheck", locator: "id=news" },
    { type: "press", key: "Enter" },
    { type: "wait-load" },
    { type: "assert-visible", locator: "id=hdr" },
    { type: "assert-text", locator: "id=hdr", value: "Welcome" },
    { type: "assert-value", locator: "id=user", value: "admin" },
    { type: "assert-count", locator: 'text="Row"', value: 3 },
    { type: "capture", locator: "id=hdr" },
    { type: "test", name: "Second Scenario" },
    { type: "click", locator: "id=next" },
  ];
  const text = buildSuite({ testName: "First Scenario", url: "https://app.example/x", steps });
  const parsed = parseSuite(text);
  assert.equal(parsed.testName, "First Scenario");
  assert.equal(parsed.url, "https://app.example/x");
  assert.deepEqual(parsed.steps, steps);
  assert.deepEqual(parsed.skipped, []);
});
test("parseSuite: escaped values survive the round trip", () => {
  const steps = [{ type: "fill", locator: "id=q", value: "a  b\tc\nd #tag" }];
  const parsed = parseSuite(buildSuite({ steps }));
  assert.deepEqual(parsed.steps, steps);
});
test("parseSuite: skips Settings/Keywords sections and bootstrap lines", () => {
  const text = [
    "*** Settings ***",
    "Library    Browser",
    "Resource    recorded_keywords.resource",
    "",
    "*** Keywords ***",
    "Click Go",
    "    Click    ${LOC_1_GO}",
    "",
    "*** Test Cases ***",
    "My Test",
    "    New Browser    chromium    headless=False",
    "    New Page    https://x.example/",
    "    Click    id=a",
    "    No Operation",
  ].join("\n");
  const parsed = parseSuite(text);
  assert.equal(parsed.testName, "My Test");
  assert.equal(parsed.url, "https://x.example/");
  assert.deepEqual(parsed.steps, [{ type: "click", locator: "id=a" }]);
  assert.deepEqual(parsed.skipped, []);
});
test("parseSuite: unparseable lines are surfaced in `skipped`, never dropped", () => {
  const text = [
    "*** Test Cases ***",
    "T",
    "    New Page    https://x.example/",
    "    Click    id=a",
    "    Log    hello there",
    "    [Tags]    smoke",
    "    Fill Username    admin",
  ].join("\n");
  const parsed = parseSuite(text);
  assert.deepEqual(parsed.steps, [{ type: "click", locator: "id=a" }]);
  assert.deepEqual(parsed.skipped,
    ["Log    hello there", "[Tags]    smoke", "Fill Username    admin"]);
});
