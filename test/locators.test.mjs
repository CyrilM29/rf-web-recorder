// node --test: core/locators.js on minimal duck-typed fake DOM nodes (no jsdom).
import test from "node:test";
import assert from "node:assert/strict";
import locators from "../src/core/locators.js";

const { ariaRole, accName, isStableId, cssPath, candidatesFor, bestLocator, countMatches } = locators;

// ---- minimal fake DOM ------------------------------------------------------
function el(tag, opts = {}) {
  const attrs = { ...(opts.attrs || {}) };
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: opts.id || attrs.id || "",
    textContent: opts.text || "",
    value: opts.value,
    multiple: opts.multiple,
    size: opts.size,
    labels: opts.labels,
    parentElement: null,
    previousElementSibling: null,
    children: [],
    getAttribute(n) { return n in attrs ? attrs[n] : null; },
    hasAttribute(n) { return n in attrs; },
  };
  if (node.id) attrs.id = node.id;
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
function makeDoc(...roots) {
  const body = el("body");
  roots.forEach((r) => append(body, r));
  const all = [];
  (function walk(n) { all.push(n); n.children.forEach(walk); })(body);
  return {
    body,
    getElementById(id) { return all.find((n) => n.id === id) || null; },
    querySelector(sel) {
      const m = /^label\[for="(.+)"\]$/.exec(sel);
      if (m) {
        return all.find((n) => n.tagName === "LABEL" && n.getAttribute("for") === m[1]) || null;
      }
      return null;
    },
    querySelectorAll(sel) { return sel === "*" ? all : []; },
  };
}

// ---- computed ARIA role ----------------------------------------------------
test("ariaRole: explicit role attribute wins", () => {
  assert.equal(ariaRole(el("div", { attrs: { role: "Tab" } })), "tab");
});
test("ariaRole: implicit roles from HTML semantics", () => {
  assert.equal(ariaRole(el("button")), "button");
  assert.equal(ariaRole(el("a", { attrs: { href: "/x" } })), "link");
  assert.equal(ariaRole(el("a")), "");
  assert.equal(ariaRole(el("textarea")), "textbox");
  assert.equal(ariaRole(el("h2")), "heading");
  assert.equal(ariaRole(el("summary")), "button");
  assert.equal(ariaRole(el("nav")), "navigation");
});
test("ariaRole: input types", () => {
  assert.equal(ariaRole(el("input")), "textbox");
  assert.equal(ariaRole(el("input", { attrs: { type: "checkbox" } })), "checkbox");
  assert.equal(ariaRole(el("input", { attrs: { type: "search" } })), "searchbox");
  assert.equal(ariaRole(el("input", { attrs: { type: "submit" } })), "button");
  assert.equal(ariaRole(el("input", { attrs: { type: "hidden" } })), "");
});
test("ariaRole: select single vs multiple", () => {
  assert.equal(ariaRole(el("select")), "combobox");
  assert.equal(ariaRole(el("select", { multiple: true })), "listbox");
});

// ---- accessible name -------------------------------------------------------
test("accName: aria-label", () => {
  assert.equal(accName(el("button", { attrs: { "aria-label": "Close" } })), "Close");
});
test("accName: aria-labelledby joins referenced texts", () => {
  const t1 = el("span", { id: "t1", text: "First" });
  const t2 = el("span", { id: "t2", text: "Second" });
  const btn = el("button", { attrs: { "aria-labelledby": "t1 t2" } });
  const doc = makeDoc(t1, t2, btn);
  assert.equal(accName(btn, doc), "First Second");
});
test("accName: label[for] targets the field", () => {
  const lab = el("label", { attrs: { for: "user" }, text: "Username" });
  const input = el("input", { id: "user" });
  const doc = makeDoc(lab, input);
  assert.equal(accName(input, doc), "Username");
});
test("accName: wrapping label", () => {
  const input = el("input", { attrs: { type: "checkbox" } });
  const lab = el("label", { text: "Remember me", children: [input] });
  const doc = makeDoc(lab);
  assert.equal(accName(input, doc), "Remember me");
});
test("accName: img alt, input submit value, text content, placeholder", () => {
  assert.equal(accName(el("img", { attrs: { alt: "Logo" } })), "Logo");
  assert.equal(accName(el("input", { attrs: { type: "submit" }, value: "Send" })), "Send");
  assert.equal(accName(el("button", { text: "  Save\n  now " })), "Save now");
  assert.equal(accName(el("input", { attrs: { placeholder: "Search…" } })), "Search…");
});

// ---- stable id heuristic ---------------------------------------------------
test("isStableId: accepts hand-written ids, rejects generated ones", () => {
  assert.equal(isStableId("login-form"), true);
  assert.equal(isStableId("nav"), true);
  assert.equal(isStableId("x123456"), false);      // 3+ digit run
  assert.equal(isStableId("ember123"), false);
  assert.equal(isStableId(":r0:"), false);         // React useId
  assert.equal(isStableId("radix-item"), false);
  assert.equal(isStableId(""), false);
  assert.equal(isStableId("a".repeat(70)), false);
  assert.equal(isStableId("has space"), false);
});

// ---- anchored CSS path -----------------------------------------------------
test("cssPath: nth-of-type chain up to body", () => {
  const s1 = el("span"), s2 = el("span");
  const div = el("div", { children: [s1, s2] });
  makeDoc(div);
  assert.equal(cssPath(s2), "body > div:nth-of-type(1) > span:nth-of-type(2)");
});
test("cssPath: anchored at the nearest stable-id ancestor", () => {
  const b = el("b");
  const p = el("p", { children: [b] });
  const main = el("div", { id: "main", children: [p] });
  makeDoc(main);
  assert.equal(cssPath(b), '[id="main"] > p:nth-of-type(1) > b:nth-of-type(1)');
});
test("cssPath: unstable ancestor id is not used as an anchor", () => {
  const b = el("b");
  const div = el("div", { id: "x123456", children: [b] });
  makeDoc(div);
  assert.equal(cssPath(b), "body > div:nth-of-type(1) > b:nth-of-type(1)");
});

// ---- candidate generation + scoring priority -------------------------------
test("candidatesFor: test-id attributes come first", () => {
  const btn = el("button", { text: "Save", attrs: { "data-testid": "save-btn" } });
  makeDoc(btn);
  const cands = candidatesFor(btn);
  assert.equal(cands[0].strategy, "test-id");
  assert.equal(cands[0].selector, '[data-testid="save-btn"]');
});
test("candidatesFor: placeholder candidate for form fields", () => {
  const input = el("input", { attrs: { placeholder: "Email" } });
  makeDoc(input);
  const cands = candidatesFor(input);
  const ph = cands.find((c) => c.strategy === "placeholder");
  assert.equal(ph.selector, '[placeholder="Email"]');
});
test("bestLocator: unique role+name wins", () => {
  const btn = el("button", { text: "Save" });
  const doc = makeDoc(btn, el("p", { text: "Other" }));
  const best = bestLocator(btn, doc);
  assert.equal(best.strategy, "role");
  assert.equal(best.selector, 'role=button[name="Save"]');
});
test("bestLocator: quotes in the accessible name are escaped", () => {
  const btn = el("button", { attrs: { "aria-label": 'Say "Hi"' } });
  const doc = makeDoc(btn);
  assert.equal(bestLocator(btn, doc).selector, 'role=button[name="Say \\"Hi\\""]');
});
test("bestLocator: duplicate role+name falls through to the css path", () => {
  const b1 = el("button", { text: "Save" });
  const b2 = el("button", { text: "Save" });
  const doc = makeDoc(b1, b2);
  const best = bestLocator(b1, doc);
  assert.equal(best.strategy, "css-path");
  assert.equal(best.selector, "body > button:nth-of-type(1)");
});
test("bestLocator: stable id wins when role has no name", () => {
  const input = el("input", { id: "user" });
  const doc = makeDoc(input);
  const best = bestLocator(input, doc);
  assert.equal(best.strategy, "id");
  assert.equal(best.selector, "id=user");
});
test("countMatches: counts role+name pairs across the document", () => {
  const b1 = el("button", { text: "Save" });
  const b2 = el("button", { text: "Save" });
  const doc = makeDoc(b1, b2);
  const cand = candidatesFor(b1, doc).find((c) => c.strategy === "role");
  assert.equal(countMatches(cand, doc), 2);
});

// ---- v0.4.0 fixes ----------------------------------------------------------
test("accName: input button with value '0' keeps its name", () => {
  assert.equal(accName(el("input", { attrs: { type: "button" }, value: "0" })), "0");
});
test("countMatches sees elements inside open shadow roots", () => {
  const host = el("div");
  const inner = el("button", { text: "Save" });
  host.shadowRoot = { children: [inner] };
  const light = el("button", { text: "Save" });
  const doc = makeDoc(host, light);
  // one match in the light DOM, one inside the shadow root: NOT unique
  assert.equal(countMatches({ strategy: "role", role: "button", name: "Save" }, doc), 2);
});
