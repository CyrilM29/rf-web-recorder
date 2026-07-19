/*
 * rf-web-recorder v0.2.0 — universal Robot Framework Browser-library recorder.
 *
 * Hover to highlight + click to capture locators; « rec » records your
 * interactions as replayable Browser-library keywords; « export » downloads
 * a .robot suite (or a .resource + .robot pair). Right-click while recording
 * opens the assertion menu. Esc stops. API: window.__RFREC
 *
 * Two ways to run it on any web page:
 *   1. paste this whole file into the DevTools console, or
 *   2. load the browser extension in extension/ and click its icon.
 *
 * GENERATED FILE — do not edit. Sources live in src/; run `node build.mjs`.
 * License: Apache-2.0 (see LICENSE / NOTICE).
 */
(() => {
"use strict";
// ---- src/core/locators.js ------------------------------------------------
/*
 * rf-web-recorder — core/locators.js
 *
 * Locator candidate generation and scoring for Playwright-style selectors as
 * consumed by the Robot Framework Browser library.
 *
 * Pure logic, duck-typed: every function accepts plain objects that look like
 * DOM nodes (tagName, getAttribute(), textContent, parentElement,
 * previousElementSibling, children...). Real DOM elements satisfy the same
 * interface at runtime; unit tests pass minimal fake nodes — no jsdom needed.
 *
 * Candidate priority (first candidate that resolves UNIQUELY wins):
 *   1. explicit test ids  (data-testid / data-test-id / data-test / data-cy)
 *   2. computed ARIA role + accessible name  -> role=button[name="Submit"]
 *   3. placeholder (form fields)             -> [placeholder="..."]
 *   4. stable-looking id                     -> id=X
 *   5. short unique trimmed text             -> text="..."
 *   6. anchored CSS path (nearest stable-id ancestor + nth-of-type chain)
 *
 * Ported from the author's SAPFX project (Apache-2.0) and generalized — see NOTICE.
 */
(function (global, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { (global.__RFREC_CORE = global.__RFREC_CORE || {}).locators = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---- duck-typed accessors (never throw on partial fake nodes) ------------
  function attr(el, name) {
    try {
      if (el && typeof el.getAttribute === "function") {
        var v = el.getAttribute(name);
        return v === null || v === undefined ? "" : String(v);
      }
    } catch (e) { /* detached / exotic host */ }
    return "";
  }
  function hasAttr(el, name) {
    try {
      if (el && typeof el.hasAttribute === "function") return !!el.hasAttribute(name);
    } catch (e) { /* ignore */ }
    return attr(el, name) !== "";
  }
  function tagOf(el) { return el && el.tagName ? String(el.tagName).toLowerCase() : ""; }
  function textOf(el) { return el && el.textContent !== null && el.textContent !== undefined ? String(el.textContent) : ""; }
  function collapse(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function docOf(el, doc) { return doc || (el && el.ownerDocument) || null; }

  // ---- computed ARIA role: explicit role attribute, else implicit role -----
  // Implicit mapping is a pragmatic subset of the HTML-AAM specification.
  var IMPLICIT_ROLES = {
    button: "button", textarea: "textbox", img: "img", nav: "navigation",
    main: "main", form: "form", search: "search", header: "banner",
    footer: "contentinfo", aside: "complementary", article: "article",
    section: "region", dialog: "dialog", table: "table", ul: "list",
    ol: "list", li: "listitem", option: "option", progress: "progressbar",
    output: "status", summary: "button", hr: "separator", select: "combobox",
  };
  var INPUT_ROLES = {
    checkbox: "checkbox", radio: "radio", button: "button", submit: "button",
    reset: "button", image: "button", range: "slider", number: "spinbutton",
    search: "searchbox",
  };
  function ariaRole(el) {
    var explicit = attr(el, "role").trim().split(/\s+/)[0];
    if (explicit) return explicit.toLowerCase();
    var tag = tagOf(el);
    if (tag === "a" || tag === "area") return hasAttr(el, "href") ? "link" : "";
    if (tag === "input") {
      var t = (attr(el, "type") || "text").toLowerCase();
      if (t === "hidden") return "";
      return INPUT_ROLES[t] || "textbox";
    }
    if (tag === "select") return (el.multiple || Number(el.size) > 1) ? "listbox" : "combobox";
    if (/^h[1-6]$/.test(tag)) return "heading";
    return IMPLICIT_ROLES[tag] || "";
  }

  // ---- accessible name (simplified accname, W3C precedence order) ----------
  // aria-labelledby -> aria-label -> <label> (for= / wrapping) -> alt ->
  // input button value -> text content -> title -> placeholder.
  function refsText(el, attrName, doc) {
    var refs = attr(el, attrName).trim();
    if (!refs) return "";
    var d = docOf(el, doc);
    if (!d || typeof d.getElementById !== "function") return "";
    var parts = [];
    var ids = refs.split(/\s+/);
    for (var i = 0; i < ids.length; i++) {
      var ref = d.getElementById(ids[i]);
      if (ref) { var t = collapse(textOf(ref)); if (t) parts.push(t); }
    }
    return parts.join(" ");
  }
  function wrappingLabelText(el) {
    var cur = el ? el.parentElement : null;
    var hops = 0;
    while (cur && hops < 5) {
      if (tagOf(cur) === "label") { var t = collapse(textOf(cur)); if (t) return t; }
      cur = cur.parentElement; hops++;
    }
    return "";
  }
  function accName(el, doc) {
    var labelledby = refsText(el, "aria-labelledby", doc);
    if (labelledby) return labelledby;
    var ariaLabel = collapse(attr(el, "aria-label"));
    if (ariaLabel) return ariaLabel;
    // <label for=...> / wrapping <label>: .labels covers both on native form
    // fields; fall back to an explicit label[for] query, then wrapping labels.
    if (el && el.labels && el.labels.length) {
      var lt = collapse(textOf(el.labels[0]));
      if (lt) return lt;
    }
    var d = docOf(el, doc);
    if (el && el.id && String(el.id).indexOf('"') === -1 && d && typeof d.querySelector === "function") {
      try {
        var lab = d.querySelector('label[for="' + el.id + '"]');
        if (lab) { var t = collapse(textOf(lab)); if (t) return t; }
      } catch (e) { /* ignore */ }
    }
    var wrap = wrappingLabelText(el);
    if (wrap) return wrap;
    var tag = tagOf(el);
    if (tag === "img" || tag === "area") {
      var alt = collapse(attr(el, "alt"));
      if (alt) return alt;
    }
    if (tag === "input") {
      var t2 = attr(el, "type").toLowerCase();
      if ((t2 === "button" || t2 === "submit" || t2 === "reset") && el.value) {
        return collapse(String(el.value));
      }
    }
    var text = collapse(textOf(el));
    if (text) return text.slice(0, 300);
    var title = collapse(attr(el, "title"));
    if (title) return title;
    return collapse(attr(el, "placeholder"));
  }

  // ---- stable-vs-generated id heuristic ------------------------------------
  // Auto-generated ids (React useId ":r0:", Ember "ember123", Radix, long
  // numeric suffixes...) change between builds/renders: never emit them.
  var UNSTABLE_ID = /\d{3,}|^ember\d|^radix|^:r|^ui-id-|^yui_|^ext-gen|^gwt-uid|^__/i;
  function isStableId(id) {
    if (!id) return false;
    id = String(id);
    if (id.length > 64) return false;
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(id)) return false;
    return !UNSTABLE_ID.test(id);
  }

  // ---- anchored CSS path ---------------------------------------------------
  // Nearest stable-id ancestor as the anchor ([id="..."] is always a safe CSS
  // literal), then an nth-of-type chain down to the element. Crossing an OPEN
  // shadow root boundary hops to the host and joins with a descendant
  // combinator — Playwright's CSS engine pierces open shadow roots, so the
  // plain selector keeps working for click/fill.
  function cssPath(el) {
    var parts = [];
    var cur = el;
    var guard = 0;
    while (cur && cur.nodeType === 1 && guard++ < 100) {
      var tag = tagOf(cur);
      if (tag === "body" || tag === "html") { parts.unshift("body"); return parts.join(" > "); }
      if (cur.id && isStableId(cur.id)) {
        parts.unshift('[id="' + cur.id + '"]');
        return parts.join(" > ");
      }
      var idx = 1, sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(tag + ":nth-of-type(" + idx + ")");
      var parent = cur.parentElement;
      if (!parent) {
        var root = (typeof cur.getRootNode === "function") ? cur.getRootNode() : null;
        var host = root && root.host ? root.host : null;
        if (host) return cssPath(host) + " " + parts.join(" > ");
        break;
      }
      cur = parent;
    }
    return parts.join(" > ");
  }

  // ---- candidate generation ------------------------------------------------
  var TEST_ID_ATTRIBUTES = ["data-testid", "data-test-id", "data-test", "data-cy"];
  function cssAttrEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function quoted(value) {
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function candidatesFor(el, doc) {
    var out = [];
    var tag = tagOf(el);
    // 1. explicit test ids
    for (var i = 0; i < TEST_ID_ATTRIBUTES.length; i++) {
      var v = attr(el, TEST_ID_ATTRIBUTES[i]);
      if (v) {
        out.push({ strategy: "test-id", attribute: TEST_ID_ATTRIBUTES[i], value: v,
                   selector: "[" + TEST_ID_ATTRIBUTES[i] + '="' + cssAttrEscape(v) + '"]' });
      }
    }
    // 2. computed role + accessible name (the "user intention" locator)
    var role = ariaRole(el);
    var name = accName(el, doc);
    if (role && name && name.length <= 120) {
      out.push({ strategy: "role", role: role, name: name,
                 selector: "role=" + role + "[name=" + quoted(name) + "]" });
    }
    // 3. placeholder, for form fields
    var placeholder = collapse(attr(el, "placeholder"));
    if (placeholder && (tag === "input" || tag === "textarea")) {
      out.push({ strategy: "placeholder", value: placeholder,
                 selector: '[placeholder="' + cssAttrEscape(placeholder) + '"]' });
    }
    // 4. stable-looking id
    if (el && el.id && isStableId(el.id)) {
      out.push({ strategy: "id", value: String(el.id), selector: "id=" + el.id });
    }
    // 5. short unique trimmed text
    var text = collapse(textOf(el));
    if (text && text.length <= 40) {
      out.push({ strategy: "text", value: text, selector: "text=" + quoted(text) });
    }
    // 6. fallback: anchored CSS path (unique by construction)
    out.push({ strategy: "css-path", value: null, selector: cssPath(el) });
    return out;
  }

  // ---- uniqueness check (re-resolve at capture time) -----------------------
  function matchesCandidate(el, cand, doc) {
    switch (cand.strategy) {
      case "test-id": return attr(el, cand.attribute) === cand.value;
      case "role": return ariaRole(el) === cand.role && accName(el, doc) === cand.name;
      case "placeholder": return collapse(attr(el, "placeholder")) === cand.value;
      case "id": return String(el && el.id || "") === cand.value;
      case "text": return collapse(textOf(el)) === cand.value;
      default: return false; // css-path: structural, checked by construction
    }
  }
  function allElements(doc) {
    if (doc && typeof doc.querySelectorAll === "function") {
      try { return Array.prototype.slice.call(doc.querySelectorAll("*")); } catch (e) { /* fall through */ }
    }
    var out = [];
    function walk(n) {
      if (!n) return;
      out.push(n);
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i]);
    }
    if (doc && doc.body) walk(doc.body);
    return out;
  }
  function countMatches(cand, doc) {
    if (cand.strategy === "css-path") return 1; // nth-of-type chain from a unique anchor
    var els = allElements(doc);
    var n = 0;
    for (var i = 0; i < els.length; i++) {
      if (matchesCandidate(els[i], cand, doc)) n++;
    }
    return n;
  }

  // The first candidate that resolves uniquely on the page wins. Returns
  // { selector, strategy, candidates } — the strategy is surfaced in the panel
  // so users can judge the robustness of every recorded step.
  function bestLocator(el, doc) {
    doc = docOf(el, doc);
    var cands = candidatesFor(el, doc);
    for (var i = 0; i < cands.length; i++) {
      if (countMatches(cands[i], doc) === 1) {
        return { selector: cands[i].selector, strategy: cands[i].strategy, candidates: cands };
      }
    }
    var last = cands[cands.length - 1];
    return { selector: last.selector, strategy: last.strategy, candidates: cands };
  }

  return {
    TEST_ID_ATTRIBUTES: TEST_ID_ATTRIBUTES,
    ariaRole: ariaRole,
    accName: accName,
    isStableId: isStableId,
    cssPath: cssPath,
    collapse: collapse,
    candidatesFor: candidatesFor,
    countMatches: countMatches,
    bestLocator: bestLocator,
  };
});

// ---- src/core/steps.js ---------------------------------------------------
/*
 * rf-web-recorder — core/steps.js
 *
 * Step model + compaction rules. Pure logic, unit-testable without a DOM.
 *
 * A step is a plain JSON-safe object:
 *   { type, locator?, strategy?, name?, value?, key? }
 * Types: click | fill | select | check | uncheck | press | wait-load |
 *        assert-visible | assert-text | assert-value | assert-count | capture
 *
 * Compaction rules (applied on append, and again by compact()):
 *   - consecutive identical steps are deduped;
 *   - consecutive `fill` steps on the same locator keep only the LAST value
 *     (typing emits many change events — only the final value matters);
 *   - consecutive `wait-load` steps collapse to one.
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

  // Appends `step` to `steps` in place, applying the compaction rules.
  // Returns true when the list changed (append or replace), false on drop.
  function addStep(steps, step) {
    var last = steps.length ? steps[steps.length - 1] : null;
    if (isSame(last, step)) return false;                       // consecutive identical: drop
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

// ---- src/core/emit_browser.js --------------------------------------------
/*
 * rf-web-recorder — core/emit_browser.js
 *
 * Step -> Robot Framework Browser-library keyword emission. Pure logic.
 *
 * Three export shapes:
 *   emitBody(steps)          -> plain step body (clipboard paste)
 *   buildSuite(opts)         -> full runnable .robot text
 *   buildResourcePair(opts)  -> { resource, suite, resourceName }:
 *       every distinct locator becomes a ${LOC_<N>_<SLUG>} variable + small
 *       action keywords in a .resource file; the .robot test calls only those
 *       keywords (locators never leak into the test — resource-first pattern).
 */
(function (global, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { (global.__RFREC_CORE = global.__RFREC_CORE || {}).emit = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SEP = "    "; // Robot Framework argument separator (4 spaces)

  // Escape a value so it survives Robot Framework's plain-text parsing:
  // backslashes, control chars, runs of 2+ spaces (token separators), and
  // leading '#' (comment) / leading-trailing spaces (stripped) are protected.
  function rfEscape(value) {
    if (value === undefined || value === null) return "${EMPTY}";
    var s = String(value);
    if (s === "") return "${EMPTY}";
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    s = s.replace(/ ( +)/g, function (m, extra) {
      return " " + extra.replace(/ /g, "\\ ");                 // "a  b" -> "a \ b"
    });
    if (s.charAt(0) === " ") s = "\\" + s;
    if (s.charAt(0) === "#") s = "\\" + s;
    if (s.length > 1 && s.charAt(s.length - 1) === " " && s.charAt(s.length - 2) !== "\\") {
      s = s.slice(0, -1) + "\\ ";
    }
    return s;
  }

  // One step -> one (or zero) Browser-library keyword line, no indentation.
  function emitStep(step) {
    var loc = rfEscape(step.locator);
    switch (step.type) {
      case "click": return ["Click" + SEP + loc];
      case "fill": return ["Fill Text" + SEP + loc + SEP + rfEscape(step.value)];
      case "select": return ["Select Options By" + SEP + loc + SEP + "label" + SEP + rfEscape(step.value)];
      case "check": return ["Check Checkbox" + SEP + loc];
      case "uncheck": return ["Uncheck Checkbox" + SEP + loc];
      case "press": return ["Keyboard Key" + SEP + "press" + SEP + rfEscape(step.key)];
      case "wait-load": return ["Wait For Load State" + SEP + "load"];
      case "assert-visible": return ["Get Element States" + SEP + loc + SEP + "contains" + SEP + "visible"];
      case "assert-text": return ["Get Text" + SEP + loc + SEP + "==" + SEP + rfEscape(step.value)];
      case "assert-value": return ["Get Property" + SEP + loc + SEP + "value" + SEP + "==" + SEP + rfEscape(step.value)];
      case "assert-count": return ["Get Element Count" + SEP + loc + SEP + "==" + SEP + rfEscape(step.value)];
      case "capture": return ["Get Element" + SEP + loc];
      default: return [];
    }
  }

  function emitBody(steps) {
    var lines = [];
    (steps || []).forEach(function (st) {
      emitStep(st).forEach(function (l) { lines.push(l); });
    });
    return lines.join("\n") + (lines.length ? "\n" : "");
  }

  function testNameOf(opts) {
    return (opts && opts.testName ? String(opts.testName) : "").trim() || "Recorded Scenario";
  }

  // Full runnable .robot suite.
  function buildSuite(opts) {
    opts = opts || {};
    var lines = [];
    lines.push("*** Settings ***");
    lines.push("Library" + SEP + "Browser");
    lines.push("");
    lines.push("*** Test Cases ***");
    lines.push(testNameOf(opts));
    lines.push(SEP + "New Browser" + SEP + (opts.browser || "chromium") + SEP + "headless=False");
    lines.push(SEP + "New Page" + SEP + rfEscape(opts.url || "about:blank"));
    (opts.steps || []).forEach(function (st) {
      emitStep(st).forEach(function (l) { lines.push(SEP + l); });
    });
    return lines.join("\n") + "\n";
  }

  // ---- resource-first pair -------------------------------------------------
  function slugOf(step, fallback) {
    var base = step.name || step.value || "";
    if (!base && step.locator) base = String(step.locator).replace(/^[a-z-]+=/, "");
    var s = String(base).toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
    return s || fallback;
  }
  function titleCase(slug) {
    return String(slug).toLowerCase().split(/_+/).filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }
  // Keyword name + whether the recorded value travels as an argument.
  var KEYWORD_SHAPES = {
    "click": { name: function (h) { return "Click " + h; }, arg: false },
    "fill": { name: function (h) { return "Fill " + h; }, arg: true, argName: "value" },
    "select": { name: function (h) { return "Select " + h + " Option"; }, arg: true, argName: "label" },
    "check": { name: function (h) { return "Check " + h; }, arg: false },
    "uncheck": { name: function (h) { return "Uncheck " + h; }, arg: false },
    "assert-visible": { name: function (h) { return h + " Should Be Visible"; }, arg: false },
    "assert-text": { name: function (h) { return h + " Text Should Be"; }, arg: true, argName: "expected" },
    "assert-value": { name: function (h) { return h + " Value Should Be"; }, arg: true, argName: "expected" },
    "assert-count": { name: function (h) { return h + " Count Should Be"; }, arg: true, argName: "expected" },
  };

  function buildResourcePair(opts) {
    opts = opts || {};
    var steps = opts.steps || [];
    var resourceName = opts.resourceName || "recorded_keywords.resource";

    // 1. distinct locators -> ${LOC_<N>_<SLUG>} variables
    var varByLocator = {};
    var varOrder = [];
    var n = 0;
    steps.forEach(function (st) {
      if (!st.locator || KEYWORD_SHAPES[st.type] === undefined) return;
      if (varByLocator[st.locator]) return;
      n++;
      var slug = slugOf(st, "ELEMENT_" + n);
      varByLocator[st.locator] = { variable: "LOC_" + n + "_" + slug, slug: slug };
      varOrder.push(st.locator);
    });

    // 2. keywords: one per (type, locator), deduped; suite calls them in order
    var keywords = [];       // { name, lines }
    var keywordByShape = {}; // "<type> <locator>" -> name
    var usedNames = {};
    var suiteCalls = [];
    steps.forEach(function (st) {
      var shape = KEYWORD_SHAPES[st.type];
      if (!shape || !st.locator) {
        emitStep(st).forEach(function (l) { suiteCalls.push(l); });   // press / wait-load stay inline
        return;
      }
      var entry = varByLocator[st.locator];
      var key = st.type + " " + st.locator;
      var kwName = keywordByShape[key];
      if (!kwName) {
        kwName = shape.name(titleCase(entry.slug));
        if (usedNames[kwName]) {
          var i = 2;
          while (usedNames[kwName + " " + i]) i++;
          kwName = kwName + " " + i;
        }
        usedNames[kwName] = true;
        keywordByShape[key] = kwName;
        var body = [];
        var locRef = "${" + entry.variable + "}";
        var argRef = "${" + (shape.argName || "value") + "}";
        if (shape.arg) body.push(SEP + "[Arguments]" + SEP + argRef);
        // Variable references pass through rfEscape untouched, so emitStep is
        // reused verbatim to build the keyword body.
        var line = emitStep({ type: st.type, locator: locRef,
                              value: shape.arg ? argRef : st.value, key: st.key })[0];
        body.push(SEP + line);
        keywords.push({ name: kwName, lines: body });
      }
      suiteCalls.push(shape.arg ? kwName + SEP + rfEscape(st.value) : kwName);
    });

    // 3. resource text
    var res = [];
    res.push("*** Settings ***");
    res.push("Library" + SEP + "Browser");
    res.push("");
    res.push("*** Variables ***");
    varOrder.forEach(function (loc) {
      res.push("${" + varByLocator[loc].variable + "}" + SEP + rfEscape(loc));
    });
    res.push("");
    res.push("*** Keywords ***");
    keywords.forEach(function (kw) {
      res.push(kw.name);
      kw.lines.forEach(function (l) { res.push(l); });
    });

    // 4. suite text (locator-free: only resource keywords + session bootstrap)
    var suite = [];
    suite.push("*** Settings ***");
    suite.push("Resource" + SEP + resourceName);
    suite.push("");
    suite.push("*** Test Cases ***");
    suite.push(testNameOf(opts));
    suite.push(SEP + "New Browser" + SEP + (opts.browser || "chromium") + SEP + "headless=False");
    suite.push(SEP + "New Page" + SEP + rfEscape(opts.url || "about:blank"));
    suiteCalls.forEach(function (c) { suite.push(SEP + c); });

    return {
      resource: res.join("\n") + "\n",
      suite: suite.join("\n") + "\n",
      resourceName: resourceName,
    };
  }

  return {
    rfEscape: rfEscape,
    emitStep: emitStep,
    emitBody: emitBody,
    buildSuite: buildSuite,
    buildResourcePair: buildResourcePair,
  };
});

// ---- src/core/emit_selenium.js -------------------------------------------
/*
 * rf-web-recorder — core/emit_selenium.js
 *
 * Step -> Robot Framework SeleniumLibrary keyword emission. Pure logic.
 * Second emission adapter next to emit_browser.js (same step model, same
 * export shapes) for teams still on SeleniumLibrary.
 *
 * Locator translation — SeleniumLibrary has no Playwright engines:
 *   - `role=…[name=…]` and `text=…` selectors CANNOT be expressed; each
 *     recorded step carries a `css` fallback (the anchored CSS path computed
 *     at capture time) which is used instead, as `css:<path>`;
 *   - `id=X`            -> `id:X`
 *   - everything else (test-id / placeholder attribute selectors, CSS paths)
 *     is plain CSS       -> `css:<selector>`
 * A step whose locator needs the CSS fallback but has none recorded (e.g.
 * steps restored from a pre-0.2 session) is kept as a comment — the
 * information is never silently dropped.
 * Limit: Playwright CSS pierces open shadow roots, Selenium CSS does not —
 * steps recorded inside shadow DOM may not replay under Selenium.
 */
(function (global, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./emit_browser.js"));
  } else {
    var core = global.__RFREC_CORE = global.__RFREC_CORE || {};
    core.emitSelenium = factory(core.emit);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (base) {
  "use strict";

  var SEP = "    ";
  var rfEscape = base.rfEscape;

  // Selenium key names for the keys the recorder captures (Press Keys arg).
  var KEY_NAMES = { Enter: "ENTER", Tab: "TAB", Escape: "ESCAPE" };

  // Browser-selector -> SeleniumLibrary locator, or null when untranslatable.
  function toSeleniumLocator(step) {
    var loc = step && step.locator;
    if (!loc) return null;
    if (/^\$\{/.test(loc)) return loc;              // variable reference: already translated
    if (/^id=/.test(loc)) return "id:" + loc.slice(3);
    if (/^(role=|text=)/.test(loc)) {
      return step.css ? "css:" + step.css : null;   // needs the recorded CSS fallback
    }
    return "css:" + loc;                            // attribute selectors + CSS paths
  }

  // One step -> one SeleniumLibrary keyword line (or a comment, never a loss).
  function emitStep(step) {
    if (!step) return [];
    if (step.type === "press") {
      var key = KEY_NAMES[step.key] || String(step.key || "").toUpperCase();
      return ["Press Keys" + SEP + "None" + SEP + rfEscape(key)];
    }
    if (step.type === "wait-load") {
      return ["Wait For Condition" + SEP + "return document.readyState === 'complete'"];
    }
    var loc = toSeleniumLocator(step);
    if (loc === null && step.locator) {
      var reference = base.emitStep(step)[0] || (step.type + " " + step.locator);
      return ["# untranslatable to SeleniumLibrary (no CSS fallback recorded): " + reference];
    }
    loc = rfEscape(loc);
    switch (step.type) {
      case "click": return ["Click Element" + SEP + loc];
      case "fill": return ["Input Text" + SEP + loc + SEP + rfEscape(step.value)];
      case "select": return ["Select From List By Label" + SEP + loc + SEP + rfEscape(step.value)];
      case "check": return ["Select Checkbox" + SEP + loc];
      case "uncheck": return ["Unselect Checkbox" + SEP + loc];
      case "assert-visible": return ["Element Should Be Visible" + SEP + loc];
      case "assert-text": return ["Element Text Should Be" + SEP + loc + SEP + rfEscape(step.value)];
      case "assert-value":
        return ["Element Attribute Value Should Be" + SEP + loc + SEP + "value" + SEP + rfEscape(step.value)];
      case "assert-count":
        return ["Page Should Contain Element" + SEP + loc + SEP + "limit=" + rfEscape(step.value)];
      case "capture": return ["Get WebElement" + SEP + loc];
      default: return [];
    }
  }

  function emitBody(steps) {
    var lines = [];
    (steps || []).forEach(function (st) {
      emitStep(st).forEach(function (l) { lines.push(l); });
    });
    return lines.join("\n") + (lines.length ? "\n" : "");
  }

  function testNameOf(opts) {
    return (opts && opts.testName ? String(opts.testName) : "").trim() || "Recorded Scenario";
  }

  // Full runnable .robot suite (SeleniumLibrary session bootstrap).
  function buildSuite(opts) {
    opts = opts || {};
    var lines = [];
    lines.push("*** Settings ***");
    lines.push("Library" + SEP + "SeleniumLibrary");
    lines.push("");
    lines.push("*** Test Cases ***");
    lines.push(testNameOf(opts));
    lines.push(SEP + "Open Browser" + SEP + rfEscape(opts.url || "about:blank") + SEP +
               (opts.seleniumBrowser || "Chrome"));
    (opts.steps || []).forEach(function (st) {
      emitStep(st).forEach(function (l) { lines.push(SEP + l); });
    });
    return lines.join("\n") + "\n";
  }

  // ---- resource-first pair (same shape as emit_browser's) ------------------
  function slugOf(step, fallback) {
    var basis = step.name || step.value || "";
    if (!basis && step.locator) basis = String(step.locator).replace(/^[a-z-]+=/, "");
    var s = String(basis).toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
    return s || fallback;
  }
  function titleCase(slug) {
    return String(slug).toLowerCase().split(/_+/).filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }
  var KEYWORD_SHAPES = {
    "click": { name: function (h) { return "Click " + h; }, arg: false },
    "fill": { name: function (h) { return "Fill " + h; }, arg: true, argName: "value" },
    "select": { name: function (h) { return "Select " + h + " Option"; }, arg: true, argName: "label" },
    "check": { name: function (h) { return "Check " + h; }, arg: false },
    "uncheck": { name: function (h) { return "Uncheck " + h; }, arg: false },
    "assert-visible": { name: function (h) { return h + " Should Be Visible"; }, arg: false },
    "assert-text": { name: function (h) { return h + " Text Should Be"; }, arg: true, argName: "expected" },
    "assert-value": { name: function (h) { return h + " Value Should Be"; }, arg: true, argName: "expected" },
    "assert-count": { name: function (h) { return h + " Count Should Be"; }, arg: true, argName: "expected" },
  };

  function buildResourcePair(opts) {
    opts = opts || {};
    var steps = opts.steps || [];
    var resourceName = opts.resourceName || "recorded_keywords.resource";

    // 1. distinct TRANSLATED locators -> ${LOC_<N>_<SLUG>} variables
    var varByLocator = {};
    var varOrder = [];
    var n = 0;
    steps.forEach(function (st) {
      var loc = toSeleniumLocator(st);
      if (!loc || KEYWORD_SHAPES[st.type] === undefined) return;
      if (varByLocator[loc]) return;
      n++;
      var slug = slugOf(st, "ELEMENT_" + n);
      varByLocator[loc] = { variable: "LOC_" + n + "_" + slug, slug: slug };
      varOrder.push(loc);
    });

    // 2. keywords: one per (type, locator), deduped; suite calls them in order
    var keywords = [];
    var keywordByShape = {};
    var usedNames = {};
    var suiteCalls = [];
    steps.forEach(function (st) {
      var shape = KEYWORD_SHAPES[st.type];
      var loc = toSeleniumLocator(st);
      if (!shape || !loc) {
        emitStep(st).forEach(function (l) { suiteCalls.push(l); });  // press / wait / comments inline
        return;
      }
      var entry = varByLocator[loc];
      var key = st.type + " " + loc;
      var kwName = keywordByShape[key];
      if (!kwName) {
        kwName = shape.name(titleCase(entry.slug));
        if (usedNames[kwName]) {
          var i = 2;
          while (usedNames[kwName + " " + i]) i++;
          kwName = kwName + " " + i;
        }
        usedNames[kwName] = true;
        keywordByShape[key] = kwName;
        var body = [];
        var locRef = "${" + entry.variable + "}";
        var argRef = "${" + (shape.argName || "value") + "}";
        if (shape.arg) body.push(SEP + "[Arguments]" + SEP + argRef);
        // Reuse emitStep verbatim: variable references pass rfEscape untouched,
        // and a locator that ALREADY starts with ${ skips translation below.
        var line = emitStep({ type: st.type, locator: locRef, css: null,
                              value: shape.arg ? argRef : st.value, key: st.key })[0];
        body.push(SEP + line);
        keywords.push({ name: kwName, lines: body });
      }
      suiteCalls.push(shape.arg ? kwName + SEP + rfEscape(st.value) : kwName);
    });

    // 3. resource text
    var res = [];
    res.push("*** Settings ***");
    res.push("Library" + SEP + "SeleniumLibrary");
    res.push("");
    res.push("*** Variables ***");
    varOrder.forEach(function (loc) {
      res.push("${" + varByLocator[loc].variable + "}" + SEP + rfEscape(loc));
    });
    res.push("");
    res.push("*** Keywords ***");
    keywords.forEach(function (kw) {
      res.push(kw.name);
      kw.lines.forEach(function (l) { res.push(l); });
    });

    // 4. suite text (locator-free)
    var suite = [];
    suite.push("*** Settings ***");
    suite.push("Resource" + SEP + resourceName);
    suite.push("");
    suite.push("*** Test Cases ***");
    suite.push(testNameOf(opts));
    suite.push(SEP + "Open Browser" + SEP + rfEscape(opts.url || "about:blank") + SEP +
               (opts.seleniumBrowser || "Chrome"));
    suiteCalls.forEach(function (c) { suite.push(SEP + c); });

    return {
      resource: res.join("\n") + "\n",
      suite: suite.join("\n") + "\n",
      resourceName: resourceName,
    };
  }

  return {
    toSeleniumLocator: toSeleniumLocator,
    emitStep: emitStep,
    emitBody: emitBody,
    buildSuite: buildSuite,
    buildResourcePair: buildResourcePair,
  };
});

// ---- src/panel/panel.js --------------------------------------------------
/*
 * rf-web-recorder — panel/panel.js
 *
 * Floating in-page UI: draggable/collapsible panel with rec/export/clear/stop
 * buttons, an editable test name, the ordered step list (move up/down, delete),
 * a hover highlight overlay, and a small floating menu used both for the
 * export-format picker and the right-click assertion menu.
 *
 * Browser-only (touches the DOM). Ported from the author's SAPFX recorder
 * panel (Apache-2.0) and generalized — see NOTICE.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE = global.__RFREC_CORE || {};

  var ACCENT = "#4f46e5";   // indigo — panel identity color
  var REC_RED = "#d0021b";

  // ---- hover highlight overlay ---------------------------------------------
  function createOverlay(doc) {
    var box = doc.createElement("div");
    box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;" +
      "border:2px solid " + ACCENT + ";background:rgba(79,70,229,0.10);border-radius:2px;" +
      "display:none;transition:all .03s linear;";
    var chip = doc.createElement("div");
    chip.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;" +
      "background:" + ACCENT + ";color:#fff;font:12px/1.4 monospace;padding:2px 6px;" +
      "border-radius:3px;white-space:nowrap;display:none;max-width:80vw;overflow:hidden;" +
      "text-overflow:ellipsis;";
    doc.documentElement.appendChild(box);
    doc.documentElement.appendChild(chip);
    return {
      show: function (rect, label) {
        box.style.left = rect.left + "px"; box.style.top = rect.top + "px";
        box.style.width = rect.width + "px"; box.style.height = rect.height + "px";
        box.style.display = "block";
        chip.textContent = label;
        var top = rect.top - 20;
        if (top < 0) top = rect.top + rect.height + 2;
        chip.style.left = rect.left + "px"; chip.style.top = top + "px";
        chip.style.display = "block";
      },
      hide: function () { box.style.display = "none"; chip.style.display = "none"; },
      flash: function () {
        var orig = box.style.background;
        box.style.background = "rgba(22,163,74,0.25)";
        setTimeout(function () { box.style.background = orig; }, 150);
      },
      destroy: function () { box.remove(); chip.remove(); },
    };
  }

  // ---- floating menu (export picker + assertion context menu) --------------
  // Closes on Escape or click-away; only one open at a time.
  function createMenu(doc) {
    var menuEl = null;
    function close() {
      if (!menuEl) return;
      doc.removeEventListener("mousedown", onAway, true);
      doc.removeEventListener("keydown", onKey, true);
      menuEl.remove(); menuEl = null;
    }
    function onAway(e) { if (menuEl && !menuEl.contains(e.target)) close(); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    function open(x, y, items) {
      close();
      menuEl = doc.createElement("div");
      menuEl.className = "__rfrecMenu";
      menuEl.style.cssText = "position:fixed;z-index:2147483647;background:#fff;color:#222;" +
        "border:1px solid #b3b3b3;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
        "font:12px/1.5 -apple-system,Segoe UI,sans-serif;min-width:180px;overflow:hidden;padding:4px 0;";
      items.forEach(function (item) {
        var row = doc.createElement("div");
        row.textContent = item.label;
        row.style.cssText = "padding:5px 12px;cursor:pointer;white-space:nowrap;";
        row.addEventListener("mouseenter", function () { row.style.background = "#eef2ff"; });
        row.addEventListener("mouseleave", function () { row.style.background = ""; });
        row.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          close();
          try { item.onPick(); } catch (err) { /* handler error must not break the page */ }
        });
        menuEl.appendChild(row);
      });
      doc.documentElement.appendChild(menuEl);
      // keep on-screen
      var r = menuEl.getBoundingClientRect();
      var left = Math.min(x, (global.innerWidth || 9999) - r.width - 8);
      var top = Math.min(y, (global.innerHeight || 9999) - r.height - 8);
      menuEl.style.left = Math.max(0, left) + "px";
      menuEl.style.top = Math.max(0, top) + "px";
      doc.addEventListener("mousedown", onAway, true);
      doc.addEventListener("keydown", onKey, true);
    }
    return { open: open, close: close, isOpen: function () { return !!menuEl; },
             contains: function (node) { return !!(menuEl && node && menuEl.contains(node)); } };
  }

  // ---- main panel ----------------------------------------------------------
  // handlers: onToggleRec(), onExport(anchorRect), onClear(), onStop(),
  //           onMoveStep(i, delta), onRemoveStep(i), onNameInput(value)
  function createPanel(doc, handlers) {
    var panel = doc.createElement("div");
    panel.id = "__rfrecPanel";
    panel.style.cssText = "position:fixed;z-index:2147483647;right:12px;bottom:12px;" +
      "width:400px;max-height:55vh;display:flex;flex-direction:column;background:#fff;" +
      "border:1px solid #b3b3b3;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
      "font:12px/1.45 -apple-system,Segoe UI,sans-serif;color:#222;overflow:hidden;";

    var head = doc.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 10px;" +
      "background:" + ACCENT + ";color:#fff;font-weight:600;cursor:move;";
    var dot = doc.createElement("span");   // blinking recording indicator
    dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:" + REC_RED +
      ";display:none;flex:0 0 auto;box-shadow:0 0 4px " + REC_RED + ";";
    var title = doc.createElement("span"); title.style.flex = "1";
    var btnCollapse = doc.createElement("button");
    var btnRec = doc.createElement("button");
    var btnExport = doc.createElement("button");
    var btnClear = doc.createElement("button");
    var btnClose = doc.createElement("button");
    [btnCollapse, btnRec, btnExport, btnClear, btnClose].forEach(function (b) {
      b.style.cssText = "border:1px solid #fff;background:transparent;color:#fff;" +
        "border-radius:4px;cursor:pointer;font:11px monospace;padding:2px 8px;";
    });
    btnCollapse.textContent = "▾";  // expanded marker
    btnRec.textContent = "rec"; btnExport.textContent = "export";
    btnClear.textContent = "clear"; btnClose.textContent = "stop";
    head.appendChild(dot); head.appendChild(title); head.appendChild(btnCollapse);
    head.appendChild(btnRec); head.appendChild(btnExport);
    head.appendChild(btnClear); head.appendChild(btnClose);

    var nameRow = doc.createElement("div");
    nameRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid #eee;";
    var nameLbl = doc.createElement("span"); nameLbl.textContent = "Test:"; nameLbl.style.color = "#666";
    var nameInput = doc.createElement("input");
    nameInput.type = "text";
    nameInput.style.cssText = "flex:1;font:11px monospace;border:1px solid #ccc;border-radius:3px;padding:2px 5px;";
    nameInput.addEventListener("input", function () { handlers.onNameInput(nameInput.value); });
    nameRow.appendChild(nameLbl); nameRow.appendChild(nameInput);

    var list = doc.createElement("div");
    list.style.cssText = "overflow:auto;padding:6px;";
    var hint = doc.createElement("div");
    hint.style.cssText = "padding:6px 10px;color:#666;border-top:1px solid #eee;";
    panel.appendChild(head); panel.appendChild(nameRow); panel.appendChild(list); panel.appendChild(hint);
    doc.documentElement.appendChild(panel);

    var styleEl = doc.createElement("style");
    styleEl.textContent = "@keyframes __rfrecBlink{50%{opacity:.25}}";
    doc.documentElement.appendChild(styleEl);

    // collapse (header only)
    var collapsed = false;
    function setCollapsed(c) {
      collapsed = c;
      nameRow.style.display = c ? "none" : "";
      list.style.display = c ? "none" : "";
      hint.style.display = c ? "none" : "";
      btnCollapse.textContent = c ? "▸" : "▾";
    }
    btnCollapse.addEventListener("click", function () { setCollapsed(!collapsed); });

    // drag by the header (switches right/bottom anchoring to left/top)
    var drag = null;
    function onDragDown(e) {
      if (e.target.tagName === "BUTTON") return;
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      panel.style.right = "auto"; panel.style.bottom = "auto";
      panel.style.left = r.left + "px"; panel.style.top = r.top + "px";
      e.preventDefault();
    }
    function onDragMove(e) {
      if (!drag) return;
      panel.style.left = (e.clientX - drag.dx) + "px";
      panel.style.top = (e.clientY - drag.dy) + "px";
    }
    function onDragUp() { drag = null; }
    head.addEventListener("mousedown", onDragDown, true);
    doc.addEventListener("mousemove", onDragMove, true);
    doc.addEventListener("mouseup", onDragUp, true);

    btnRec.addEventListener("click", function () { handlers.onToggleRec(); });
    btnExport.addEventListener("click", function () {
      handlers.onExport(btnExport.getBoundingClientRect());
    });
    btnClear.addEventListener("click", function () { handlers.onClear(); });
    btnClose.addEventListener("click", function () { handlers.onStop(); });

    function stepBtn(label, fn) {
      var b = doc.createElement("button");
      b.textContent = label;
      b.style.cssText = "margin-left:3px;border:1px solid #b3b3b3;background:#fff;cursor:pointer;" +
        "font:10px monospace;border-radius:3px;padding:0 4px;";
      b.addEventListener("click", fn);
      return b;
    }
    function strategyChip(strategy) {
      var chip = doc.createElement("span");
      chip.textContent = strategy || "?";
      chip.style.cssText = "flex:0 0 auto;font:9px monospace;color:" + ACCENT +
        ";border:1px solid " + ACCENT + ";border-radius:8px;padding:0 5px;";
      return chip;
    }

    var frameTag = (global.top !== global.self) ? " [iframe]" : "";

    return {
      root: panel,
      setRecording: function (on) {
        btnRec.textContent = on ? "pause" : "rec";
        btnRec.style.background = on ? REC_RED : "transparent";
        dot.style.display = on ? "inline-block" : "none";
        dot.style.animation = on ? "__rfrecBlink 1s infinite" : "none";
      },
      setHint: function (text) { hint.textContent = text; },
      getTestName: function () { return nameInput.value; },
      setTestName: function (v) { nameInput.value = v; },
      // step rows: "N. <line>" + strategy chip + up/down/delete
      renderSteps: function (steps, lines, recording) {
        title.textContent = (recording ? "Recording" : "Steps") + " — " +
          steps.length + " step(s)" + frameTag;
        list.textContent = "";
        steps.forEach(function (st, i) {
          var row = doc.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 4px;border-bottom:1px solid #f0f0f0;";
          var txt = doc.createElement("span");
          txt.style.cssText = "flex:1;font:11px monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          txt.textContent = (i + 1) + ". " + lines[i];
          txt.title = lines[i];
          row.appendChild(txt);
          if (st.strategy) row.appendChild(strategyChip(st.strategy));
          row.appendChild(stepBtn("↑", function () { handlers.onMoveStep(i, -1); }));
          row.appendChild(stepBtn("↓", function () { handlers.onMoveStep(i, 1); }));
          row.appendChild(stepBtn("✕", function () { handlers.onRemoveStep(i); }));
          list.appendChild(row);
        });
      },
      // capture rows: label + one copy button per candidate strategy
      renderCaptures: function (captures, copyFn) {
        title.textContent = "RF Web Recorder — " + captures.length + " captured" + frameTag;
        list.textContent = "";
        captures.forEach(function (rec, i) {
          var row = doc.createElement("div");
          row.style.cssText = "padding:5px 4px;border-bottom:1px solid #f0f0f0;";
          var lab = doc.createElement("div");
          lab.style.cssText = "color:" + ACCENT + ";font:11px monospace;margin-bottom:3px;" +
            "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          lab.textContent = (i + 1) + ". [" + rec.strategy + "] " + rec.label;
          lab.title = rec.selector;
          row.appendChild(lab);
          var bar = doc.createElement("div");
          rec.candidates.forEach(function (cand) {
            var b = doc.createElement("button");
            b.textContent = cand.strategy;
            b.style.cssText = "margin:0 4px 0 0;border:1px solid " + ACCENT + ";background:#fff;" +
              "color:" + ACCENT + ";border-radius:4px;cursor:pointer;font:11px monospace;padding:1px 7px;";
            b.addEventListener("click", function () { copyFn(cand.selector, b); });
            bar.appendChild(b);
          });
          row.appendChild(bar);
          list.appendChild(row);
        });
      },
      contains: function (node) {
        return !!(node && node.closest && node.closest("#__rfrecPanel"));
      },
      destroy: function () {
        doc.removeEventListener("mousemove", onDragMove, true);
        doc.removeEventListener("mouseup", onDragUp, true);
        panel.remove(); styleEl.remove();
      },
    };
  }

  CORE.panel = { createPanel: createPanel, createOverlay: createOverlay, createMenu: createMenu };
})(typeof window !== "undefined" ? window : globalThis);

// ---- src/recorder.js -----------------------------------------------------
/*
 * rf-web-recorder — recorder.js
 *
 * Event wiring: capture + record modes, hover highlight, right-click assertion
 * menu, sessionStorage persistence, export (3 formats). Browser-only.
 *
 * Capture mode (default): hover highlights the element and shows its best
 * locator; a click copies a `Get Element    <locator>` line and lists the
 * element (with every candidate strategy) in the panel.
 *
 * Record mode: clicks / typed values / selects / checkboxes become ordered
 * Browser-library steps; Enter/Tab become Keyboard Key presses; hash/history
 * navigation becomes Wait For Load State. Right-click opens the assertion
 * menu (visible / text / value / count). Passwords are never captured in
 * clear text (value replaced by <PASSWORD>).
 *
 * Ported from the author's SAPFX recorder listener (Apache-2.0) and
 * generalized — see NOTICE.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE = global.__RFREC_CORE || {};

  var STORE_KEY = "__rfrecSteps";
  var NAME_KEY = "__rfrecName";
  var URL_KEY = "__rfrecUrl";
  var DEFAULT_NAME = "Recorded Scenario";
  var HINT_CAPTURE = "Hover + click to capture a locator. rec to record. Esc to stop.";
  var HINT_RECORD = "Recording: clicks and typed values become steps. " +
    "Right-click an element for assertions. export offers Browser / SeleniumLibrary formats.";

  function createRecorder() {
    var locators = CORE.locators, stepsCore = CORE.steps, emit = CORE.emit,
        emitSelenium = CORE.emitSelenium, ui = CORE.panel;
    var doc = global.document;

    var running = false;
    var recording = false;
    var captures = [];
    var steps = [];
    var panel = null, overlay = null, menu = null;

    // ---- persistence (survives page reloads within the tab) ----------------
    function loadSteps() {
      try { var s = global.sessionStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : []; }
      catch (e) { return []; }
    }
    function saveSteps() {
      try { global.sessionStorage.setItem(STORE_KEY, JSON.stringify(steps)); } catch (e) { /* ignore */ }
    }
    function loadName() {
      try { return global.sessionStorage.getItem(NAME_KEY) || DEFAULT_NAME; }
      catch (e) { return DEFAULT_NAME; }
    }
    function saveName(v) { try { global.sessionStorage.setItem(NAME_KEY, v); } catch (e) { /* ignore */ } }
    function startUrl() {
      try { return global.sessionStorage.getItem(URL_KEY) || global.location.href; }
      catch (e) { return global.location.href; }
    }
    function rememberUrl() {
      try {
        if (!global.sessionStorage.getItem(URL_KEY)) {
          global.sessionStorage.setItem(URL_KEY, global.location.href);
        }
      } catch (e) { /* ignore */ }
    }

    // ---- helpers -----------------------------------------------------------
    function copy(text, btn) {
      try { if (global.navigator.clipboard) global.navigator.clipboard.writeText(text); } catch (e) { /* ignore */ }
      if (btn) {
        var t = btn.textContent;
        btn.textContent = "copied";
        setTimeout(function () { btn.textContent = t; }, 700);
      }
    }
    // Dependency-free file download via a Blob anchor click.
    function download(text, filename) {
      var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      doc.documentElement.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function stepLine(st) { return emit.emitStep(st)[0] || st.type; }
    function renderPanel() {
      if (!panel) return;
      if (recording || steps.length) {
        panel.renderSteps(steps, steps.map(stepLine), recording);
      } else {
        panel.renderCaptures(captures, copy);
      }
    }
    function addStep(step) {
      if (stepsCore.addStep(steps, step)) {
        saveSteps(); renderPanel();
        if (overlay) overlay.flash();
      }
    }
    function inOurUI(node) {
      return !!((panel && panel.contains(node)) || (menu && menu.contains(node)));
    }
    function bestFor(el) {
      var best = locators.bestLocator(el, doc);
      best.name = locators.accName(el, doc).slice(0, 40);
      // Anchored CSS path fallback (always the last candidate): stored on every
      // step so non-Playwright emitters (SeleniumLibrary) can translate steps
      // whose winning selector uses an engine they lack (role= / text=).
      var cands = best.candidates;
      best.css = cands && cands.length ? cands[cands.length - 1].selector : null;
      return best;
    }
    function stepFields(type, best, extra) {
      var step = { type: type, locator: best.selector, strategy: best.strategy,
                   name: best.name, css: best.css };
      for (var k in (extra || {})) step[k] = extra[k];
      return step;
    }
    function isPasswordField(t) {
      var ty = (t && t.getAttribute) ? String(t.getAttribute("type") || t.type || "") : String(t.type || "");
      return ty.toLowerCase() === "password";
    }

    // ---- hover highlight (cheap label: first candidate, no uniqueness scan) -
    var raf = 0, lastEvt = null;
    function paint() {
      raf = 0;
      var t = lastEvt ? lastEvt.target : null;
      if (!t || t.nodeType !== 1 || inOurUI(t) || !overlay) { if (overlay) overlay.hide(); return; }
      var cands = locators.candidatesFor(t, doc);
      var first = cands[0];
      var r = t.getBoundingClientRect();
      overlay.show({ left: r.left, top: r.top, width: r.width, height: r.height },
        "[" + first.strategy + "] " + first.selector);
    }
    function onMove(event) { lastEvt = event; if (!raf) raf = global.requestAnimationFrame(paint); }

    // ---- click: capture (inspect) or record (step) -------------------------
    function onClick(event) {
      if (inOurUI(event.target)) return;              // panel/menu handle their own clicks
      if (menu && menu.isOpen()) { menu.close(); return; }
      var target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (!target) return;
      if (recording) {
        var tag = target.tagName ? target.tagName.toLowerCase() : "";
        var type = String((target.getAttribute && target.getAttribute("type")) || "").toLowerCase();
        if (tag === "input" && (type === "checkbox" || type === "radio")) return; // change handles those
        var best = bestFor(target);
        addStep(stepFields("click", best));
        return;                                       // never block the app while recording
      }
      // capture mode: inspection only — swallow the click
      event.preventDefault(); event.stopPropagation();
      var cap = bestFor(target);
      captures.push({ selector: cap.selector, strategy: cap.strategy,
                      candidates: cap.candidates, label: cap.name || cap.selector });
      renderPanel();
      copy("Get Element    " + cap.selector);         // ready-to-paste perception line
      if (overlay) overlay.flash();
    }

    // ---- change: fills, selects, checkboxes --------------------------------
    function onChange(event) {
      if (!recording || inOurUI(event.target)) return;
      var t = event.target;
      if (!t || t.nodeType !== 1) return;
      var tag = t.tagName ? t.tagName.toLowerCase() : "";
      var best;
      if (tag === "select") {
        best = bestFor(t);
        var opt = (t.selectedOptions && t.selectedOptions[0]) ||
                  (t.options && t.options[t.selectedIndex]);
        var label = opt ? (opt.label || opt.textContent || "").trim() : "";
        addStep(stepFields("select", best, { value: label }));
        return;
      }
      var type = String((t.getAttribute && t.getAttribute("type")) || t.type || "").toLowerCase();
      if (tag === "input" && type === "checkbox") {
        best = bestFor(t);
        addStep(stepFields(t.checked ? "check" : "uncheck", best));
        return;
      }
      if (tag === "input" && type === "radio") {
        best = bestFor(t);
        addStep(stepFields("click", best));
        return;
      }
      if ((tag === "input" || tag === "textarea") && "value" in t) {
        best = bestFor(t);
        // Passwords never reach the export/clipboard/sessionStorage in clear text.
        var value = isPasswordField(t) ? "<PASSWORD>" : t.value;
        addStep(stepFields("fill", best, { value: value }));
      }
    }

    // ---- keydown: Enter/Tab presses, Escape stops --------------------------
    function onKey(event) {
      if (event.key === "Escape") {
        if (menu && menu.isOpen()) return;            // menu's own Escape closes it first
        stop();
        return;
      }
      if (!recording || inOurUI(event.target)) return;
      if (event.key === "Enter" || event.key === "Tab") {
        addStep({ type: "press", key: event.key });
      }
    }

    // ---- right-click assertion menu (record mode only) ---------------------
    function candidateCount(best) {
      for (var i = 0; i < best.candidates.length; i++) {
        if (best.candidates[i].selector === best.selector) {
          return locators.countMatches(best.candidates[i], doc);
        }
      }
      return 1;
    }
    function onContextMenu(event) {
      if (!recording || inOurUI(event.target)) return; // default context menu outside record mode
      var target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (!target) return;
      event.preventDefault(); event.stopPropagation();
      var best = bestFor(target);
      var text = locators.collapse(target.textContent || "").slice(0, 200);
      var value = ("value" in target) ? String(target.value) : "";
      if (isPasswordField(target)) value = "<PASSWORD>";
      var count = candidateCount(best);
      menu.open(event.clientX, event.clientY, [
        { label: "Assert visible", onPick: function () {
            addStep(stepFields("assert-visible", best)); } },
        { label: "Assert text" + (text ? " (“" + text.slice(0, 24) + (text.length > 24 ? "…" : "") + "”)" : ""),
          onPick: function () {
            addStep(stepFields("assert-text", best, { value: text })); } },
        { label: "Assert value", onPick: function () {
            addStep(stepFields("assert-value", best, { value: value })); } },
        { label: "Assert count (" + count + ")", onPick: function () {
            addStep(stepFields("assert-count", best, { value: count })); } },
      ]);
    }

    // ---- navigation -> replayable wait -------------------------------------
    function onNav() { if (recording) addStep({ type: "wait-load" }); }
    function onBeforeUnload() { if (recording) { stepsCore.addStep(steps, { type: "wait-load" }); saveSteps(); } }

    // ---- export ------------------------------------------------------------
    function testName() { return (panel && panel.getTestName() || "").trim() || DEFAULT_NAME; }
    function fileSlug() {
      return testName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recorded";
    }
    function exportAs(format) {
      var opts = { testName: testName(), url: startUrl(), steps: steps };
      // Emission adapter: Browser library by default, SeleniumLibrary on demand
      // (locator translation lives in emit_selenium.js — same export shapes).
      var target = (format.indexOf("selenium-") === 0) ? emitSelenium : emit;
      format = format.replace(/^selenium-/, "");
      if (format === "resource-pair") {
        var pair = target.buildResourcePair(opts);
        download(pair.resource, pair.resourceName);
        download(pair.suite, fileSlug() + ".robot");
        copy(pair.suite);
      } else if (format === "body") {
        copy(target.emitBody(steps));
      } else {
        var text = target.buildSuite(opts);
        download(text, fileSlug() + ".robot");
        copy(text);
      }
    }
    function onExportClick(anchorRect) {
      menu.open(anchorRect.left, anchorRect.bottom + 4, [
        { label: "Download .robot suite (Browser)", onPick: function () { exportAs("robot"); } },
        { label: "Download .resource + .robot pair (Browser)", onPick: function () { exportAs("resource-pair"); } },
        { label: "Download .robot suite (SeleniumLibrary)", onPick: function () { exportAs("selenium-robot"); } },
        { label: "Download .resource + .robot pair (SeleniumLibrary)", onPick: function () { exportAs("selenium-resource-pair"); } },
        { label: "Copy step body to clipboard", onPick: function () { exportAs("body"); } },
      ]);
    }

    // ---- recording state ---------------------------------------------------
    function notifyState() {
      try { doc.dispatchEvent(new CustomEvent("__rfrecState", { detail: recording })); } catch (e) { /* ignore */ }
    }
    function setRecording(on) {
      if (!running && on) start();
      recording = !!on;
      if (on) rememberUrl();
      if (panel) {
        panel.setRecording(recording);
        panel.setHint(recording ? HINT_RECORD : HINT_CAPTURE);
      }
      renderPanel();
      notifyState();
    }

    // ---- lifecycle ---------------------------------------------------------
    function start() {
      if (running) return;
      running = true;
      steps = stepsCore.compact(loadSteps());   // restore after a reload
      captures = [];
      overlay = ui.createOverlay(doc);
      menu = ui.createMenu(doc);
      panel = ui.createPanel(doc, {
        onToggleRec: function () { setRecording(!recording); },
        onExport: onExportClick,
        onClear: function () {
          captures = []; steps = [];
          saveSteps();
          try { global.sessionStorage.removeItem(URL_KEY); } catch (e) { /* ignore */ }
          renderPanel();
        },
        onStop: stop,
        onMoveStep: function (i, d) {
          var j = i + d;
          if (j < 0 || j >= steps.length) return;
          var t = steps[i]; steps[i] = steps[j]; steps[j] = t;
          saveSteps(); renderPanel();
        },
        onRemoveStep: function (i) { steps.splice(i, 1); saveSteps(); renderPanel(); },
        onNameInput: saveName,
      });
      panel.setTestName(loadName());
      panel.setHint(HINT_CAPTURE);
      renderPanel();
      doc.addEventListener("mousemove", onMove, true);
      doc.addEventListener("click", onClick, true);
      doc.addEventListener("change", onChange, true);
      doc.addEventListener("keydown", onKey, true);
      doc.addEventListener("contextmenu", onContextMenu, true);
      global.addEventListener("hashchange", onNav, true);
      global.addEventListener("popstate", onNav, true);
      global.addEventListener("beforeunload", onBeforeUnload, true);
      console.info("[rf-web-recorder] Ready. Hover to highlight, click to capture, rec to record. " +
        "Right-click while recording opens the assertion menu. Esc stops.");
    }
    function stop() {
      if (!running) return;
      running = false;
      recording = false;
      doc.removeEventListener("mousemove", onMove, true);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("change", onChange, true);
      doc.removeEventListener("keydown", onKey, true);
      doc.removeEventListener("contextmenu", onContextMenu, true);
      global.removeEventListener("hashchange", onNav, true);
      global.removeEventListener("popstate", onNav, true);
      global.removeEventListener("beforeunload", onBeforeUnload, true);
      if (menu) menu.close();
      if (overlay) overlay.destroy();
      if (panel) panel.destroy();
      panel = overlay = menu = null;
      notifyState();
      console.info("[rf-web-recorder] stopped (steps kept — start again to resume).");
    }

    return {
      start: start,
      stop: stop,
      isRunning: function () { return running; },
      toggleRecording: function () { setRecording(!recording); },
      setRecording: setRecording,
      isRecording: function () { return recording; },
      exportAs: exportAs,
    };
  }

  CORE.recorder = { create: createRecorder };
})(typeof window !== "undefined" ? window : globalThis);

// ---- src/main.js ---------------------------------------------------------
/*
 * rf-web-recorder — main.js
 *
 * Entry point: bootstraps the public `window.__RFREC` API and auto-starts
 * capture mode on injection. Idempotent — the bundle wrapper re-calls
 * `__RFREC.start()` instead of re-installing when pasted twice.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE || {};
  if (global.__RFREC) { global.__RFREC.start(); return; }

  var instance = CORE.recorder.create();

  global.__RFREC = {
    version: "0.1.0",
    start: instance.start,
    stop: instance.stop,
    isRunning: instance.isRunning,
    toggleRecording: instance.toggleRecording,
    setRecording: instance.setRecording,
    isRecording: instance.isRecording,
    exportAs: instance.exportAs,      // "robot" | "resource-pair" | "body"
    core: CORE,                       // locator/step/emit internals for power users
  };

  instance.start();
})(typeof window !== "undefined" ? window : globalThis);
})();
