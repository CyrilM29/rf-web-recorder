// node --test — core/resolve.js: the inverse of locator generation, plus the
// pure replay planning + assertion evaluation, on duck-typed fake DOM nodes.
import test from "node:test";
import assert from "node:assert/strict";
import resolve from "../src/core/resolve.js";

const { parseLocator, resolveSelector, countSelector, planStep, evalAssertion,
        findOptionIndex } = resolve;

// ---- minimal fake DOM (same pattern as locators.test.mjs) ------------------
function el(tag, opts = {}) {
  const attrs = { ...(opts.attrs || {}) };
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: opts.id || attrs.id || "",
    textContent: opts.text || "",
    value: opts.value,
    options: opts.options,
    parentElement: null,
    previousElementSibling: null,
    children: [],
    getAttribute(n) { return n in attrs ? attrs[n] : null; },
    hasAttribute(n) { return n in attrs; },
  };
  if (node.id) attrs.id = node.id;
  if (opts.rect) node.getBoundingClientRect = () => opts.rect;
  (opts.children || []).forEach((c) => append(node, c));
  return node;
}
function append(parent, child) {
  child.parentElement = parent;
  child.previousElementSibling =
    parent.children.length ? parent.children[parent.children.length - 1] : null;
  parent.children.push(child);
  return child;
}
// Fake doc WITHOUT querySelector/querySelectorAll/getElementById: every
// resolution must go through the children-walk fallback.
function makeWalkDoc(...roots) {
  const body = el("body");
  roots.forEach((r) => append(body, r));
  return { body };
}
// Fake doc WITH the query APIs (minimal: "*" + exact attribute selectors).
function makeQueryDoc(...roots) {
  const doc = makeWalkDoc(...roots);
  const all = [];
  (function walk(n) { all.push(n); n.children.forEach(walk); })(doc.body);
  doc.getElementById = (id) => all.find((n) => n.id === id) || null;
  doc.querySelectorAll = (sel) => {
    if (sel === "*") return all;
    const m = /^\[([\w-]+)="(.*)"\]$/.exec(sel);
    if (m) return all.filter((n) => n.getAttribute(m[1]) === m[2].replace(/\\(.)/g, "$1"));
    if (sel === "body > button:nth-of-type(1)") {
      return all.filter((n) => n.tagName === "BUTTON").slice(0, 1);
    }
    return [];
  };
  doc.querySelector = (sel) => doc.querySelectorAll(sel)[0] || null;
  return doc;
}

// ---- locator parsing -------------------------------------------------------
test("parseLocator recognizes every emitted form", () => {
  assert.deepEqual(parseLocator("id=login"), { kind: "id", id: "login" });
  assert.deepEqual(parseLocator('role=button[name="Log in"]'),
    { kind: "role", role: "button", name: "Log in" });
  assert.deepEqual(parseLocator('role=button[name="Say \\"Hi\\""]'),
    { kind: "role", role: "button", name: 'Say "Hi"' });
  assert.deepEqual(parseLocator('text="Save"'), { kind: "text", text: "Save" });
  assert.deepEqual(parseLocator('[data-testid="save-btn"]'),
    { kind: "attr", attribute: "data-testid", value: "save-btn" });
  assert.deepEqual(parseLocator("body > div:nth-of-type(1) > b:nth-of-type(1)"),
    { kind: "css", css: "body > div:nth-of-type(1) > b:nth-of-type(1)" });
});

// ---- resolution ------------------------------------------------------------
test("resolveSelector: role+name scan finds the element (walk fallback)", () => {
  const save = el("button", { text: "Save" });
  const other = el("button", { text: "Cancel" });
  const doc = makeWalkDoc(save, other);
  assert.equal(resolveSelector('role=button[name="Save"]', doc), save);
  assert.equal(resolveSelector('role=button[name="Missing"]', doc), null);
});
test("resolveSelector: text scan matches exact collapsed text", () => {
  const span = el("span", { text: "  Hello\n  world " });
  const doc = makeWalkDoc(span);
  assert.equal(resolveSelector('text="Hello world"', doc), span);
  assert.equal(resolveSelector('text="Hello"', doc), null);
});
test("resolveSelector: id via getElementById, and via the walk without it", () => {
  const input = el("input", { id: "user" });
  const queryDoc = makeQueryDoc(el("div", { children: [input] }));
  assert.equal(resolveSelector("id=user", queryDoc), input);
  const input2 = el("input", { id: "user" });
  const walkDoc = makeWalkDoc(el("div", { children: [input2] }));
  assert.equal(resolveSelector("id=user", walkDoc), input2);
});
test("resolveSelector: attribute selector via querySelector AND via the walk", () => {
  const btn = el("button", { attrs: { "data-testid": "save" } });
  assert.equal(resolveSelector('[data-testid="save"]', makeQueryDoc(btn)) !== null, true);
  const btn2 = el("button", { attrs: { "data-testid": "save" } });
  assert.equal(resolveSelector('[data-testid="save"]', makeWalkDoc(btn2)), btn2);
});
test("resolveSelector: raw CSS uses querySelectorAll, null without a CSS engine", () => {
  const btn = el("button", { text: "Go" });
  assert.equal(resolveSelector("body > button:nth-of-type(1)", makeQueryDoc(btn)), btn);
  assert.equal(resolveSelector("body > button:nth-of-type(1)", makeWalkDoc(btn)), null);
});
test("countSelector counts role/text matches across the document", () => {
  const b1 = el("button", { text: "Save" });
  const b2 = el("button", { text: "Save" });
  const doc = makeWalkDoc(b1, b2);
  assert.equal(countSelector('role=button[name="Save"]', doc), 2);
  assert.equal(countSelector('text="Save"', doc), 2);
  assert.equal(countSelector('role=button[name="Nope"]', doc), 0);
});

// ---- replay planning (pure) ------------------------------------------------
test("planStep maps steps to action descriptors", () => {
  assert.deepEqual(planStep({ type: "click", locator: "id=a" }), { action: "click", locator: "id=a" });
  assert.deepEqual(planStep({ type: "fill", locator: "id=u", value: "admin" }),
    { action: "fill", locator: "id=u", value: "admin" });
  assert.deepEqual(planStep({ type: "select", locator: "id=c", value: "France" }),
    { action: "select", locator: "id=c", label: "France" });
  assert.deepEqual(planStep({ type: "check", locator: "id=t" }),
    { action: "setChecked", locator: "id=t", checked: true });
  assert.deepEqual(planStep({ type: "uncheck", locator: "id=t" }),
    { action: "setChecked", locator: "id=t", checked: false });
  assert.deepEqual(planStep({ type: "press", key: "Enter" }), { action: "press", key: "Enter" });
  assert.deepEqual(planStep({ type: "wait-load" }), { action: "wait", ms: 300 });
  assert.deepEqual(planStep({ type: "test", name: "Second" }), { action: "marker", name: "Second" });
  assert.equal(planStep({ type: "assert-text", locator: "id=h" }).action, "assert");
  assert.equal(planStep({ type: "unknown" }).action, "noop");
});

// ---- assertion evaluation --------------------------------------------------
test("evalAssertion: visible passes on a non-zero rect, fails on zero-size", () => {
  const ok = el("div", { id: "hdr", rect: { width: 120, height: 20, left: 0, top: 0 } });
  assert.equal(evalAssertion({ type: "assert-visible", locator: "id=hdr" }, makeWalkDoc(ok)).ok, true);
  const flat = el("div", { id: "hdr", rect: { width: 0, height: 0, left: 0, top: 0 } });
  const res = evalAssertion({ type: "assert-visible", locator: "id=hdr" }, makeWalkDoc(flat));
  assert.equal(res.ok, false);
  assert.match(res.reason, /zero-size/);
});
test("evalAssertion: element not found names the locator", () => {
  const res = evalAssertion({ type: "assert-visible", locator: "id=ghost" }, makeWalkDoc());
  assert.equal(res.ok, false);
  assert.match(res.reason, /element not found: id=ghost/);
});
test("evalAssertion: text compares collapsed text content", () => {
  const div = el("div", { id: "msg", text: " Welcome,\n  admin " });
  const doc = makeWalkDoc(div);
  assert.equal(evalAssertion({ type: "assert-text", locator: "id=msg", value: "Welcome, admin" }, doc).ok, true);
  const bad = evalAssertion({ type: "assert-text", locator: "id=msg", value: "Bye" }, doc);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /expected "Bye"/);
});
test("evalAssertion: value compares the live .value", () => {
  const input = el("input", { id: "user", value: "admin" });
  const doc = makeWalkDoc(input);
  assert.equal(evalAssertion({ type: "assert-value", locator: "id=user", value: "admin" }, doc).ok, true);
  assert.equal(evalAssertion({ type: "assert-value", locator: "id=user", value: "root" }, doc).ok, false);
});
test("evalAssertion: count compares countSelector to the expected number", () => {
  const doc = makeWalkDoc(el("li", { text: "a" }), el("li", { text: "b" }));
  assert.equal(evalAssertion({ type: "assert-count", locator: 'role=listitem[name="a"]', value: 1 }, doc).ok, true);
  const bad = evalAssertion({ type: "assert-count", locator: 'role=listitem[name="a"]', value: 3 }, doc);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /count is 1, expected 3/);
});
test("evalAssertion: capture just requires the element to resolve", () => {
  const btn = el("button", { id: "go", text: "Go" });
  const res = evalAssertion({ type: "capture", locator: "id=go" }, makeWalkDoc(btn));
  assert.equal(res.ok, true);
  assert.equal(res.element, btn);
});

// ---- <select> option lookup ------------------------------------------------
test("findOptionIndex matches by label property, then by text content", () => {
  const select = {
    options: [
      { label: "", textContent: "  France " },
      { label: "Germany", textContent: "DE" },
    ],
  };
  assert.equal(findOptionIndex(select, "France"), 0);
  assert.equal(findOptionIndex(select, "Germany"), 1);
  assert.equal(findOptionIndex(select, "Spain"), -1);
});
