/*
 * emit_selenium.test.mjs — SeleniumLibrary emission adapter.
 * Focus: locator translation (Selenium has no role=/text= engines), keyword
 * mapping, and the two export shapes mirroring emit_browser's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sel = require("../src/core/emit_selenium.js");

// ---- locator translation ---------------------------------------------------

test("css-expressible selectors get the css: prefix", () => {
  assert.equal(sel.toSeleniumLocator({ locator: '[data-testid="save"]' }), 'css:[data-testid="save"]');
  assert.equal(sel.toSeleniumLocator({ locator: '[placeholder="Search"]' }), 'css:[placeholder="Search"]');
  assert.equal(sel.toSeleniumLocator({ locator: "#app > form > button:nth-of-type(2)" }),
    "css:#app > form > button:nth-of-type(2)");
});

test("id= translates to Selenium's id: strategy", () => {
  assert.equal(sel.toSeleniumLocator({ locator: "id=login" }), "id:login");
});

test("role=/text= fall back to the recorded CSS path", () => {
  assert.equal(
    sel.toSeleniumLocator({ locator: 'role=button[name="Submit"]', css: "#form > button" }),
    "css:#form > button");
  assert.equal(sel.toSeleniumLocator({ locator: 'text="Save"', css: "#bar > span" }), "css:#bar > span");
  // no CSS fallback recorded (pre-0.2 session): untranslatable, not guessed
  assert.equal(sel.toSeleniumLocator({ locator: 'role=button[name="Submit"]' }), null);
});

test("variable references pass through untouched (resource-pair bodies)", () => {
  assert.equal(sel.toSeleniumLocator({ locator: "${LOC_1_SAVE}" }), "${LOC_1_SAVE}");
});

// ---- keyword mapping -------------------------------------------------------

test("steps map to SeleniumLibrary keywords", () => {
  assert.deepEqual(sel.emitStep({ type: "click", locator: '[data-testid="save"]' }),
    ['Click Element    css:[data-testid="save"]']);
  assert.deepEqual(sel.emitStep({ type: "fill", locator: "id=user", value: "alice" }),
    ["Input Text    id:user    alice"]);
  assert.deepEqual(sel.emitStep({ type: "select", locator: "id=country", value: "France" }),
    ["Select From List By Label    id:country    France"]);
  assert.deepEqual(sel.emitStep({ type: "check", locator: "id=ok" }), ["Select Checkbox    id:ok"]);
  assert.deepEqual(sel.emitStep({ type: "uncheck", locator: "id=ok" }), ["Unselect Checkbox    id:ok"]);
  assert.deepEqual(sel.emitStep({ type: "press", key: "Enter" }), ["Press Keys    None    ENTER"]);
  assert.deepEqual(sel.emitStep({ type: "wait-load" }),
    ["Wait For Condition    return document.readyState === 'complete'"]);
});

test("assertions map to SeleniumLibrary assertion keywords", () => {
  assert.deepEqual(sel.emitStep({ type: "assert-visible", locator: "id=hdr" }),
    ["Element Should Be Visible    id:hdr"]);
  assert.deepEqual(sel.emitStep({ type: "assert-text", locator: "id=hdr", value: "Welcome" }),
    ["Element Text Should Be    id:hdr    Welcome"]);
  assert.deepEqual(sel.emitStep({ type: "assert-value", locator: "id=user", value: "alice" }),
    ["Element Attribute Value Should Be    id:user    value    alice"]);
  assert.deepEqual(sel.emitStep({ type: "assert-count", locator: '[data-testid="row"]', value: 3 }),
    ['Page Should Contain Element    css:[data-testid="row"]    limit=3']);
});

test("untranslatable steps become comments — information is never dropped", () => {
  const lines = sel.emitStep({ type: "click", locator: 'role=button[name="Submit"]' });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith("# untranslatable to SeleniumLibrary"));
  assert.ok(lines[0].includes('role=button[name="Submit"]'));
});

// ---- suite + resource-first pair -------------------------------------------

const STEPS = [
  { type: "fill", locator: 'role=textbox[name="Username"]', css: "#login > input:nth-of-type(1)",
    name: "Username", value: "alice" },
  { type: "press", key: "Enter" },
  { type: "click", locator: '[data-testid="save"]', name: "Save" },
  { type: "assert-text", locator: "id=welcome", name: "Welcome", value: "Welcome, alice" },
];

test("buildSuite emits a runnable SeleniumLibrary suite", () => {
  const text = sel.buildSuite({ testName: "Login", url: "https://app.example/", steps: STEPS });
  assert.ok(text.startsWith("*** Settings ***\nLibrary    SeleniumLibrary\n"));
  assert.ok(text.includes("Open Browser    https://app.example/    Chrome"));
  assert.ok(text.includes("    Input Text    css:#login > input:nth-of-type(1)    alice"));
  assert.ok(text.includes("    Press Keys    None    ENTER"));
  assert.ok(text.includes('    Click Element    css:[data-testid="save"]'));
  assert.ok(text.includes("    Element Text Should Be    id:welcome    Welcome, alice"));
  // no Playwright engine leaks into the Selenium suite
  assert.ok(!text.includes("role="));
});

test("buildResourcePair keeps locators out of the suite", () => {
  const pair = sel.buildResourcePair({ testName: "Login", url: "https://app.example/", steps: STEPS });
  assert.ok(pair.resource.includes("Library    SeleniumLibrary"));
  assert.ok(pair.resource.includes("${LOC_1_USERNAME}    css:#login > input:nth-of-type(1)"));
  assert.ok(pair.resource.includes("Fill Username\n    [Arguments]    ${value}\n    Input Text    ${LOC_1_USERNAME}    ${value}"));
  assert.ok(pair.suite.includes("Resource    recorded_keywords.resource"));
  assert.ok(pair.suite.includes("Fill Username    alice"));
  assert.ok(pair.suite.includes("Press Keys    None    ENTER"));   // no locator: stays inline
  // the suite carries no locator of any kind
  assert.ok(!pair.suite.includes("css:"));
  assert.ok(!pair.suite.includes("id:welcome"));
  assert.ok(!pair.suite.includes("role="));
});

test("emitBody joins translated lines", () => {
  const body = sel.emitBody(STEPS);
  assert.ok(body.includes("Input Text    css:#login"));
  assert.ok(body.endsWith("\n"));
});

// ---- scenario markers (multi-test sessions) --------------------------------

test("markers become comments in emitStep/emitBody", () => {
  assert.deepEqual(sel.emitStep({ type: "test", name: "Checkout" }),
    ["# --- Test: Checkout ---"]);
});

test("buildSuite splits on markers; Open Browser only in the first test", () => {
  const text = sel.buildSuite({
    testName: "Login",
    url: "https://app.example/",
    steps: [
      { type: "click", locator: "id=go" },
      { type: "test", name: "Search Works" },
      { type: "fill", locator: "id=q", value: "robot" },
    ],
  });
  assert.match(text, /Login\n    Open Browser    https:\/\/app.example\/    Chrome\n    Click Element    id:go\n/);
  assert.match(text, /Search Works\n    Input Text    id:q    robot\n/);
  assert.equal((text.match(/Open Browser/g) || []).length, 1, "bootstrap only once");
});

test("buildResourcePair splits the suite on markers; bootstrap only once", () => {
  const pair = sel.buildResourcePair({
    testName: "Login",
    steps: [
      { type: "click", locator: "id=go", name: "Go" },
      { type: "test", name: "Second Scenario" },
      { type: "click", locator: "id=go", name: "Go" },
    ],
  });
  assert.match(pair.suite, /Login\n    Open Browser/);
  assert.match(pair.suite, /Second Scenario\n    Click Go/);
  assert.equal((pair.suite.match(/Open Browser/g) || []).length, 1);
});

// ---- v0.4.0 fixes ----------------------------------------------------------
test("press: camel-case keys become UPPER_SNAKE Selenium names", () => {
  assert.deepEqual(sel.emitStep({ type: "press", key: "ArrowDown" }), ["Press Keys    None    ARROW_DOWN"]);
  assert.deepEqual(sel.emitStep({ type: "press", key: "PageUp" }), ["Press Keys    None    PAGE_UP"]);
  assert.deepEqual(sel.emitStep({ type: "press", key: "Enter" }), ["Press Keys    None    ENTER"]);
  assert.deepEqual(sel.emitStep({ type: "press", key: "F5" }), ["Press Keys    None    F5"]);
});
test("resource pair: capture steps become Locate keywords here too", () => {
  const pair = sel.buildResourcePair({
    steps: [{ type: "capture", locator: "id=hdr", name: "Header" }],
  });
  assert.ok(pair.resource.includes("Get WebElement    ${LOC_1_HEADER}"));
  assert.ok(pair.suite.includes("Locate Header"));
});
test("emission escapes RF variable syntax in recorded values", () => {
  assert.deepEqual(sel.emitStep({ type: "fill", locator: "id=q", value: "x${y}" }),
    ["Input Text    id:q    x\\${y}"]);
});
