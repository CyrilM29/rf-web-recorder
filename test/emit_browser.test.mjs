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
