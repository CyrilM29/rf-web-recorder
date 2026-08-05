// node --test: core/emit_report.js HTML documentation report + Markdown plan.
import test from "node:test";
import assert from "node:assert/strict";
import report from "../src/core/emit_report.js";
import emitSelenium from "../src/core/emit_selenium.js";

const { humanizeStep, buildReport, buildPlan } = report;

const STEPS = [
  { type: "test", name: "Search a product" },
  { type: "click", locator: "role=button[name=\"Search\"]", name: "Search",
    css: "#toolbar > button" },
  { type: "fill", locator: "id=query", name: "Search field", value: "laptop" },
  { type: "press", key: "Enter" },
  { type: "wait-load" },
  { type: "assert-text", locator: "id=total", name: "Total", value: "3 results" },
  { type: "test", name: "Log in" },
  { type: "fill", locator: "id=pwd", name: "Password", value: "<PASSWORD>" },
];

// ---- phrase builder --------------------------------------------------------
test("humanizeStep: uses the accessible name when there is one", () => {
  const parts = humanizeStep(STEPS[1]);
  assert.equal(parts.map((p) => p.text).join(""), 'Click Search.');
  assert.equal(parts.some((p) => p.code), false);
});
test("humanizeStep: falls back to the locator, flagged as code", () => {
  const parts = humanizeStep({ type: "click", locator: "css=#x > i" });
  assert.equal(parts.some((p) => p.code && p.text === "css=#x > i"), true);
});
test("humanizeStep: says so when the value was masked at capture", () => {
  const phrase = humanizeStep(STEPS[7]).map((p) => p.text).join("");
  assert.match(phrase, /"<PASSWORD>" \(value masked at capture\)\./);
});
test("humanizeStep: unknown types and markers carry no phrase", () => {
  assert.equal(humanizeStep({ type: "nope" }), null);
  assert.equal(humanizeStep(STEPS[0]), null);
});

// ---- HTML report -----------------------------------------------------------
test("buildReport: self-contained page, one chapter per scenario, phrase + raw line", () => {
  const page = buildReport({ testName: "Demo", url: "https://shop.example/", steps: STEPS });
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<h2>1\. Search a product<\/h2>/);
  assert.match(page, /<h2>2\. Log in<\/h2>/);
  // the phrase AND the exact keyword line travel together (quotes HTML-escaped)
  assert.match(page, /Fill Search field with &quot;laptop&quot;\./);
  assert.match(page, /<code>Fill Text {4}id=query {4}laptop<\/code>/);
  // no external resource anywhere (self-contained: CSS inline, no JS)
  assert.doesNotMatch(page, /<script|href=|src=/);
});
test("buildReport: HTML-escapes recorded content", () => {
  const page = buildReport({ testName: "a<b", url: "u", steps: [
    { type: "click", locator: "css=#x", name: "<img>" },
  ] });
  assert.match(page, /<title>a&lt;b<\/title>/);
  assert.match(page, /Click &lt;img&gt;\./);
  assert.doesNotMatch(page, /Click <img>/);
});
test("buildReport: accepts the Selenium emitter for the raw lines", () => {
  const page = buildReport({ testName: "D", url: "u", steps: [STEPS[2]] }, emitSelenium);
  assert.match(page, /Input Text|css:|id:/);
});

// ---- Markdown plan ---------------------------------------------------------
test("buildPlan: scenario sections, numbered phrases, expected result to complete", () => {
  const md = buildPlan({ testName: "Demo", url: "https://shop.example/", steps: STEPS });
  assert.match(md, /^# Test plan: Demo/);
  assert.match(md, /## Scenario 1: Search a product/);
  assert.match(md, /## Scenario 2: Log in/);
  assert.match(md, /1\. Click Search\./);
  assert.match(md, /\*\*Expected result\*\*: to complete by the reviewer\./);
});
test("buildPlan: locators live in the appendix, code-spanned", () => {
  const md = buildPlan({ testName: "Demo", url: "u", steps: STEPS });
  assert.match(md, /## Recorded locators/);
  assert.match(md, /- `role=button\[name="Search"\]` \(scenario 1, step 1\)/);
  // a locator used twice is listed once
  const hits = md.match(/`id=query`/g) || [];
  assert.equal(hits.length, 1);
});
test("buildPlan: a literal *emphasis* value cannot break the Markdown (code spans)", () => {
  const md = buildPlan({ testName: "D", url: "u", steps: [
    { type: "click", locator: "text=*LH*" },
  ] });
  assert.match(md, /`text=\*LH\*`/);
});
