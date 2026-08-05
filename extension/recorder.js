/*
 * rf-web-recorder v0.6.0: universal Robot Framework Browser-library recorder.
 *
 * Hover to highlight + click to capture locators; « rec » records your
 * interactions as replayable Browser-library keywords; « play » replays the
 * recorded steps in place; « +test » starts a new test case; « export »
 * downloads a .robot suite (or a .resource + .robot pair) and re-imports
 * one. Right-click while recording opens the assertion menu; double-click
 * a step row to edit it. Esc stops. API: window.__RFREC
 *
 * Two ways to run it on any web page:
 *   1. paste this whole file into the DevTools console, or
 *   2. load the browser extension in extension/ and click its icon.
 *
 * GENERATED FILE: do not edit. Sources live in src/; run `node build.mjs`.
 * License: Apache-2.0 (see LICENSE / NOTICE).
 */
(() => {
"use strict";
// ---- src/core/locators.js ------------------------------------------------
/*
 * rf-web-recorder: core/locators.js
 *
 * Locator candidate generation and scoring for Playwright-style selectors as
 * consumed by the Robot Framework Browser library.
 *
 * Pure logic, duck-typed: every function accepts plain objects that look like
 * DOM nodes (tagName, getAttribute(), textContent, parentElement,
 * previousElementSibling, children...). Real DOM elements satisfy the same
 * interface at runtime; unit tests pass minimal fake nodes, no jsdom needed.
 *
 * Candidate priority (first candidate that resolves UNIQUELY wins):
 *   1. explicit test ids  (data-testid / data-test-id / data-test / data-cy)
 *   2. computed ARIA role + accessible name  -> role=button[name="Submit"]
 *   3. placeholder (form fields)             -> [placeholder="..."]
 *   4. stable-looking id                     -> id=X
 *   5. short unique trimmed text             -> text="..."
 *   6. anchored CSS path (nearest stable-id ancestor + nth-of-type chain)
 *
 * Ported from the author's SAPFX project (Apache-2.0) and generalized: see NOTICE.
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
      // != null, not truthiness: a keypad button with value="0" has a name
      if ((t2 === "button" || t2 === "submit" || t2 === "reset") &&
          el.value !== undefined && el.value !== null && String(el.value) !== "") {
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
  // combinator: Playwright's CSS engine pierces open shadow roots, so the
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
  // Every element of the document INCLUDING open shadow trees: the emitted
  // Playwright locators pierce open shadow roots, so the uniqueness scan must
  // look inside them too or a light-DOM-only count of 1 could still resolve
  // to a different element at replay time.
  function allElements(doc) {
    if (doc && typeof doc.querySelectorAll === "function") {
      try {
        var out = [];
        var scopes = [doc];
        while (scopes.length) {
          var els = scopes.pop().querySelectorAll("*");
          for (var i = 0; i < els.length; i++) {
            out.push(els[i]);
            if (els[i].shadowRoot) scopes.push(els[i].shadowRoot);
          }
        }
        return out;
      } catch (e) { /* fall through */ }
    }
    var out2 = [];
    function walkChildren(n) {
      var kids = (n && n.children) || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i]);
    }
    function walk(n) {
      if (!n) return;
      out2.push(n);
      if (n.shadowRoot) walkChildren(n.shadowRoot);
      walkChildren(n);
    }
    if (doc && doc.body) walk(doc.body);
    return out2;
  }
  function countMatches(cand, doc) {
    if (cand.strategy === "css-path") {
      // nth-of-type chain from a unique anchor: verify with the CSS engine
      // when one is available (a duplicated anchor id would break uniqueness);
      // a count of 0 means the element sits in a shadow tree plain CSS cannot
      // see but Playwright's piercing engine can: trust the construction.
      if (doc && typeof doc.querySelectorAll === "function") {
        try { return doc.querySelectorAll(cand.selector).length || 1; } catch (e) { /* fall through */ }
      }
      return 1;
    }
    var els = allElements(doc);
    var n = 0;
    for (var i = 0; i < els.length; i++) {
      if (matchesCandidate(els[i], cand, doc)) n++;
    }
    return n;
  }

  // The first candidate that resolves uniquely on the page wins. Returns
  // { selector, strategy, candidates }: the strategy is surfaced in the panel
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
 * rf-web-recorder: core/steps.js
 *
 * Step model + compaction rules + sensitive-field masking. Pure logic,
 * unit-testable without a DOM.
 *
 * A step is a plain JSON-safe object:
 *   { type, locator?, strategy?, name?, css?, value?, key? }
 * Types: click | fill | select | check | uncheck | press | wait-load |
 *        assert-visible | assert-text | assert-value | assert-count | capture |
 *        test (scenario marker: { type: "test", name } splits the export into
 *        multiple test cases)
 *
 * Compaction rules (applied on append, and again by compact()):
 *   - consecutive identical steps are deduped: except two identical CLICKS
 *     whose timestamps (`t`, ms) are far enough apart: clicking a "+" stepper
 *     twice is intent, the dedup only guards against double-dispatched events;
 *   - consecutive `fill` steps on the same locator keep only the LAST value
 *     (typing emits many change events: only the final value matters);
 *   - consecutive `wait-load` steps collapse to one;
 *   - `test` markers pass through untouched, and BREAK the adjacency the
 *     fill/wait rules rely on (a marker is a scenario boundary).
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

  // Two identical consecutive clicks recorded this close together are one
  // double-dispatched event; further apart they are a deliberate repeat.
  var CLICK_DEDUP_WINDOW_MS = 500;

  // Appends `step` to `steps` in place, applying the compaction rules.
  // Returns true when the list changed (append or replace), false on drop.
  function addStep(steps, step) {
    if (step && step.type === "test") { steps.push(step); return true; } // scenario markers always pass through
    var last = steps.length ? steps[steps.length - 1] : null;
    if (isSame(last, step)) {                                   // consecutive identical: drop...
      var timedClicks = step.type === "click" &&
        typeof step.t === "number" && typeof last.t === "number";
      if (!timedClicks || step.t - last.t < CLICK_DEDUP_WINDOW_MS) return false;
      steps.push(step);                                         // ...unless it is a deliberate repeat
      return true;
    }
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

  // ---- sensitive-field masking ---------------------------------------------
  // Fields whose value must never reach the step list / sessionStorage /
  // clipboard / export in clear text. type=password is the obvious case;
  // the autocomplete tokens cover payment + OTP + password-manager fields;
  // the name/id/aria-label patterns catch the same fields on forms that skip
  // autocomplete. The patterns stay deliberately narrow: a false positive
  // silently masks a value the user meant to record.
  var SENSITIVE_AUTOCOMPLETE = /^(cc-number|cc-csc|cc-exp(-month|-year)?|one-time-code|current-password|new-password)$/;
  var SENSITIVE_HINT = /passw|pwd|cvv|cvc|card.?number|cardnum|(^|[^a-z])(csc|otp)([^a-z]|$)|one.?time.?code|security.?code/;

  function attrOf(el, name) {
    try {
      if (el && typeof el.getAttribute === "function") {
        return String(el.getAttribute(name) || "").toLowerCase();
      }
    } catch (e) { /* ignore */ }
    return "";
  }

  // Returns the placeholder to record instead of the real value ("<PASSWORD>"
  // for password inputs, "<SECRET>" for payment/OTP fields), or null when the
  // value is safe to record.
  function sensitiveMask(el) {
    if (!el) return null;
    var type = attrOf(el, "type") || String(el.type || "").toLowerCase();
    if (type === "password") return "<PASSWORD>";
    // autocomplete is a whitespace-separated token list ("billing cc-number")
    var tokens = attrOf(el, "autocomplete").split(/\s+/);
    for (var i = 0; i < tokens.length; i++) {
      if (SENSITIVE_AUTOCOMPLETE.test(tokens[i])) return "<SECRET>";
    }
    var hint = attrOf(el, "name") + " " + attrOf(el, "id") + " " + attrOf(el, "aria-label");
    return SENSITIVE_HINT.test(hint) ? "<SECRET>" : null;
  }

  return { addStep: addStep, compact: compact, isSame: isSame, stepKey: stepKey,
           sensitiveMask: sensitiveMask };
});

// ---- src/core/emit_browser.js --------------------------------------------
/*
 * rf-web-recorder: core/emit_browser.js
 *
 * Step -> Robot Framework Browser-library keyword emission. Pure logic.
 *
 * Three export shapes:
 *   emitBody(steps)          -> plain step body (clipboard paste)
 *   buildSuite(opts)         -> full runnable .robot text
 *   buildResourcePair(opts)  -> { resource, suite, resourceName }:
 *       every distinct locator becomes a ${LOC_<N>_<SLUG>} variable + small
 *       action keywords in a .resource file; the .robot test calls only those
 *       keywords (locators never leak into the test: resource-first pattern).
 *       A step whose recorded CSS-path fallback differs from its winning
 *       locator additionally gets a ${LOC_<N>_<SLUG>_FALLBACK} variable and an
 *       IF/ELSE keyword body that falls back to the CSS path (with a WARN log)
 *       when the primary locator no longer matches.
 *
 * `test` marker steps ({ type: "test", name }) split every export shape into
 * multiple *** Test Cases *** entries; the session bootstrap (New Browser /
 * New Page) is emitted only in the FIRST test: later tests continue the same
 * browser session.
 *
 * parseSuite(text) is the inverse of buildSuite: it reads an exported .robot
 * back into { testName, url, steps, skipped }: unparseable lines land in
 * `skipped`, never silently dropped.
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
  // backslashes, control chars, variable syntax (${ @{ &{ %{), runs of 2+
  // spaces (token separators), and leading '#' (comment) / leading-trailing
  // spaces (stripped) are protected. With `isValue`, a leading "word=" is also
  // escaped so a recorded value can never turn into a named argument (Browser
  // keywords have parameters like force/txt: `force=True` as a literal value
  // would otherwise be swallowed as `force=` and the call would lose it).
  function rfEscape(value, isValue) {
    if (value === undefined || value === null) return "${EMPTY}";
    var s = String(value);
    if (s === "") return "${EMPTY}";
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    s = s.replace(/([$@&%])\{/g, "\\$1{");   // recorded text is always literal, never a live RF variable
    s = s.replace(/ ( +)/g, function (m, extra) {
      return " " + extra.replace(/ /g, "\\ ");                 // "a  b" -> "a \ b"
    });
    if (s.charAt(0) === " ") s = "\\" + s;
    if (s.charAt(0) === "#") s = "\\" + s;
    if (s.charAt(s.length - 1) === " ") {
      // An odd number of backslashes before the final space means it is
      // already escaped (doubling made literal backslashes come in pairs).
      var bs = /\\*(?= $)/.exec(s)[0].length;
      if (bs % 2 === 0) s = s.slice(0, -1) + "\\ ";
    }
    if (isValue) s = s.replace(/^([A-Za-z_][A-Za-z0-9_]*)=/, "$1\\=");
    return s;
  }

  // One step -> one (or zero) Browser-library keyword line, no indentation.
  // `esc` (default rfEscape) lets the resource-pair builder keep its generated
  // ${...} variable references live while recorded values still escape.
  function emitStep(step, esc) {
    var E = esc || rfEscape;
    var loc = E(step.locator);
    switch (step.type) {
      case "click": return ["Click" + SEP + loc];
      case "fill": return ["Fill Text" + SEP + loc + SEP + E(step.value, true)];
      case "select": return ["Select Options By" + SEP + loc + SEP + "label" + SEP + E(step.value, true)];
      case "check": return ["Check Checkbox" + SEP + loc];
      case "uncheck": return ["Uncheck Checkbox" + SEP + loc];
      case "press": return ["Keyboard Key" + SEP + "press" + SEP + E(step.key, true)];
      case "wait-load": return ["Wait For Load State" + SEP + "load"];
      case "assert-visible": return ["Get Element States" + SEP + loc + SEP + "contains" + SEP + "visible"];
      case "assert-text": return ["Get Text" + SEP + loc + SEP + "==" + SEP + E(step.value, true)];
      case "assert-value": return ["Get Property" + SEP + loc + SEP + "value" + SEP + "==" + SEP + E(step.value, true)];
      case "assert-count": return ["Get Element Count" + SEP + loc + SEP + "==" + SEP + E(step.value, true)];
      case "capture": return ["Get Element" + SEP + loc];
      case "test": return ["# --- Test: " + (step.name || "Test") + " ---"]; // scenario marker (comment in a body paste)
      default: return [];
    }
  }

  // rfEscape variant for resource-pair keyword bodies: our generated variable
  // references (${LOC_...}, ${value}, ...) must stay live; anything else:
  // i.e. every recorded value: escapes normally.
  function refEscape(v, isValue) {
    var s = String(v === undefined || v === null ? "" : v);
    if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(s)) return s;
    return rfEscape(v, isValue);
  }

  // ---- scenario split ------------------------------------------------------
  // Splits a list on `test` markers into groups. Accepts step objects
  // ({ type: "test", name }) or precompiled entries ({ marker: name });
  // anything else lands in the current group. An initial marker (before any
  // step) NAMES the first scenario instead of leaving an empty bootstrap-only
  // test behind.
  function splitScenarios(items) {
    var groups = [{ name: null, items: [] }];
    (items || []).forEach(function (it) {
      var markerName = null;
      if (it && it.type === "test") markerName = String(it.name || "");
      else if (it && typeof it === "object" && it.marker !== undefined) markerName = String(it.marker || "");
      if (markerName !== null) { groups.push({ name: markerName.trim(), items: [] }); return; }
      groups[groups.length - 1].items.push(it);
    });
    if (groups.length > 1 && groups[0].name === null && groups[0].items.length === 0) {
      groups.shift();
    }
    return groups;
  }
  function scenarioName(group, index, fallbackFirst) {
    if (group.name) return group.name;
    return index === 0 ? fallbackFirst : "Scenario " + (index + 1);
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

  // Full runnable .robot suite. `test` markers split it into several test
  // cases; the browser bootstrap runs only in the first one.
  function buildSuite(opts) {
    opts = opts || {};
    var lines = [];
    lines.push("*** Settings ***");
    lines.push("Library" + SEP + "Browser");
    lines.push("");
    lines.push("*** Test Cases ***");
    var groups = splitScenarios(opts.steps);
    groups.forEach(function (group, gi) {
      lines.push(scenarioName(group, gi, testNameOf(opts)));
      if (gi === 0) {
        lines.push(SEP + "New Browser" + SEP + (opts.browser || "chromium") + SEP + "headless=False");
        lines.push(SEP + "New Page" + SEP + rfEscape(opts.url || "about:blank"));
      } else if (!group.items.length) {
        lines.push(SEP + "No Operation");        // RF forbids an empty test body
      }
      group.items.forEach(function (st) {
        emitStep(st).forEach(function (l) { lines.push(SEP + l); });
      });
    });
    return lines.join("\n") + "\n";
  }

  // ---- resource-first pair -------------------------------------------------
  function slugText(text) {
    return String(text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
  }
  function slugOf(step, fallback) {
    var s = slugText(step.name || step.value);
    // An empty or purely numeric slug makes a poor keyword name ("1 Text Should
    // Be", caught live on a counter span with no accessible name): prefer the
    // locator, which names the TARGET rather than its current value.
    if (!s || /^[0-9_]+$/.test(s)) {
      var fromLocator = slugText(String(step.locator || "").replace(/^[a-z-]+=/, ""));
      if (fromLocator && !/^[0-9_]+$/.test(fromLocator)) s = fromLocator;
    }
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
    "capture": { name: function (h) { return "Locate " + h; }, arg: false },
  };

  // A step deserves a CSS fallback branch when its recorded CSS path exists,
  // differs from the winning locator, and the winning locator is not itself
  // the raw CSS path already.
  function hasCssFallback(step) {
    return !!(step.css && step.locator && step.css !== step.locator &&
              step.strategy !== "css-path");
  }

  function buildResourcePair(opts) {
    opts = opts || {};
    var steps = opts.steps || [];
    var resourceName = opts.resourceName || "recorded_keywords.resource";

    // 1. distinct locators -> ${LOC_<N>_<SLUG>} variables
    //    (+ ${LOC_<N>_<SLUG>_FALLBACK} when a distinct CSS path was recorded)
    // Object.create(null): a locator spelled like an Object.prototype member
    // ("constructor", "toString"...) must not hit an inherited property.
    var varByLocator = Object.create(null);
    var varOrder = [];
    var n = 0;
    steps.forEach(function (st) {
      if (!st.locator || KEYWORD_SHAPES[st.type] === undefined) return;
      if (varByLocator[st.locator]) return;
      n++;
      var slug = slugOf(st, "ELEMENT_" + n);
      var entry = { variable: "LOC_" + n + "_" + slug, slug: slug };
      if (hasCssFallback(st)) {
        entry.fallback = { variable: "LOC_" + n + "_" + slug + "_FALLBACK", css: st.css };
      }
      varByLocator[st.locator] = entry;
      varOrder.push(st.locator);
    });

    // 2. keywords: one per (type, locator), deduped; suite calls them in order
    var keywords = [];       // { name, lines }
    var keywordByShape = Object.create(null); // "<type> <locator>" -> name
    var usedNames = Object.create(null);
    var suiteCalls = [];     // strings, or { marker: name } scenario boundaries
    steps.forEach(function (st) {
      if (st.type === "test") { suiteCalls.push({ marker: String(st.name || "") }); return; }
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
        // emitStep is reused verbatim to build the keyword body; refEscape
        // keeps the generated variable references live while recorded values
        // still escape normally.
        function actionLine(ref) {
          return emitStep({ type: st.type, locator: ref,
                            value: shape.arg ? argRef : st.value, key: st.key }, refEscape)[0];
        }
        if (entry.fallback) {
          // Self-healing body: try the primary locator, fall back to the
          // recorded CSS path with a WARN so the drift never goes unnoticed.
          var fbRef = "${" + entry.fallback.variable + "}";
          body.push(SEP + "${found}=" + SEP + "Get Element Count" + SEP + locRef);
          body.push(SEP + "IF" + SEP + "${found} > 0");
          body.push(SEP + SEP + actionLine(locRef));
          body.push(SEP + "ELSE");
          body.push(SEP + SEP + "Log" + SEP +
                    "Primary locator not found - falling back to the recorded CSS path" + SEP + "WARN");
          body.push(SEP + SEP + actionLine(fbRef));
          body.push(SEP + "END");
        } else {
          body.push(SEP + actionLine(locRef));
        }
        keywords.push({ name: kwName, lines: body });
      }
      suiteCalls.push(shape.arg ? kwName + SEP + rfEscape(st.value, true) : kwName);
    });

    // 3. resource text
    var res = [];
    res.push("*** Settings ***");
    res.push("Library" + SEP + "Browser");
    res.push("");
    res.push("*** Variables ***");
    varOrder.forEach(function (loc) {
      var entry = varByLocator[loc];
      res.push("${" + entry.variable + "}" + SEP + rfEscape(loc));
      if (entry.fallback) {
        res.push("${" + entry.fallback.variable + "}" + SEP + rfEscape(entry.fallback.css));
      }
    });
    res.push("");
    res.push("*** Keywords ***");
    keywords.forEach(function (kw) {
      res.push(kw.name);
      kw.lines.forEach(function (l) { res.push(l); });
    });

    // 4. suite text (locator-free: only resource keywords + session bootstrap;
    //    markers split it into several tests, bootstrap in the first only)
    var suite = [];
    suite.push("*** Settings ***");
    suite.push("Resource" + SEP + resourceName);
    suite.push("");
    suite.push("*** Test Cases ***");
    var groups = splitScenarios(suiteCalls);
    groups.forEach(function (group, gi) {
      suite.push(scenarioName(group, gi, testNameOf(opts)));
      if (gi === 0) {
        suite.push(SEP + "New Browser" + SEP + (opts.browser || "chromium") + SEP + "headless=False");
        suite.push(SEP + "New Page" + SEP + rfEscape(opts.url || "about:blank"));
      } else if (!group.items.length) {
        suite.push(SEP + "No Operation");
      }
      group.items.forEach(function (c) { suite.push(SEP + c); });
    });

    return {
      resource: res.join("\n") + "\n",
      suite: suite.join("\n") + "\n",
      resourceName: resourceName,
    };
  }

  // ---- .robot re-import (inverse of buildSuite) ----------------------------
  // Undoes rfEscape on a single argument token.
  function rfUnescape(token) {
    if (token === "${EMPTY}") return "";
    var out = "";
    for (var i = 0; i < token.length; i++) {
      var ch = token.charAt(i);
      if (ch === "\\" && i + 1 < token.length) {
        var next = token.charAt(i + 1);
        if (next === "n") { out += "\n"; i++; continue; }
        if (next === "r") { out += "\r"; i++; continue; }
        if (next === "t") { out += "\t"; i++; continue; }
        out += next; i++; continue;      // \\  \<space>  \#  and any other escape
      }
      out += ch;
    }
    return out;
  }

  // One tokenized body line -> step object, or null when not a recorder step.
  function parseStepLine(tokens) {
    var kw = tokens[0];
    var a = tokens.slice(1);
    function arg(i) { return rfUnescape(a[i] === undefined ? "" : a[i]); }
    switch (kw) {
      case "Click": if (a.length === 1) return { type: "click", locator: arg(0) }; break;
      case "Fill Text": if (a.length === 2) return { type: "fill", locator: arg(0), value: arg(1) }; break;
      case "Select Options By":
        if (a.length === 3 && a[1] === "label") return { type: "select", locator: arg(0), value: arg(2) };
        break;
      case "Check Checkbox": if (a.length === 1) return { type: "check", locator: arg(0) }; break;
      case "Uncheck Checkbox": if (a.length === 1) return { type: "uncheck", locator: arg(0) }; break;
      case "Keyboard Key": if (a.length === 2 && a[0] === "press") return { type: "press", key: arg(1) }; break;
      case "Wait For Load State": if (a.length <= 1) return { type: "wait-load" }; break;
      case "Get Element States":
        if (a.length === 3 && a[1] === "contains" && a[2] === "visible") {
          return { type: "assert-visible", locator: arg(0) };
        }
        break;
      case "Get Text":
        if (a.length === 3 && a[1] === "==") return { type: "assert-text", locator: arg(0), value: arg(2) };
        break;
      case "Get Property":
        if (a.length === 4 && a[1] === "value" && a[2] === "==") {
          return { type: "assert-value", locator: arg(0), value: arg(3) };
        }
        break;
      case "Get Element Count":
        if (a.length === 3 && a[1] === "==") {
          var raw = arg(2);
          return { type: "assert-count", locator: arg(0),
                   value: /^\d+$/.test(raw) ? Number(raw) : raw };
        }
        break;
      case "Get Element": if (a.length === 1) return { type: "capture", locator: arg(0) }; break;
    }
    return null;
  }

  // Parses a Browser-library .robot text back into recorder steps.
  // Returns { testName, url, steps, skipped }:
  //   - only the *** Test Cases *** section is read (Settings/Keywords/
  //     Variables are structure, not steps);
  //   - the New Browser / New Page bootstrap and No Operation placeholders
  //     are recognized and dropped (New Page still yields `url`);
  //   - the first test-case name becomes testName, every further one becomes
  //     a { type: "test", name } marker;
  //   - anything else unparseable lands in `skipped`, never silently dropped.
  function parseSuite(text) {
    var lines = String(text || "").split(/\r?\n/);
    var section = "";
    var steps = [];
    var skipped = [];
    var testName = null;
    var url = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      var header = /^\*{3}\s*([^*]+?)\s*\*{3}/.exec(line);
      if (header) { section = header[1].toLowerCase(); continue; }
      if (section !== "test cases") continue;
      if (line.charAt(0) === "#") continue;          // full-line comment, NOT a test name
      if (!/^\s/.test(line)) {                       // unindented: a test-case name
        if (testName === null) testName = line.trim();
        else steps.push({ type: "test", name: line.trim() });
        continue;
      }
      var body = line.replace(/^\s+/, "");
      if (body.charAt(0) === "#") continue;          // comments carry no step
      // Trailing whitespace (editor artifacts) is not data: unless the last
      // space is escaped (odd backslash run before it: `\ ` survives).
      var tail = /^(.*?)([ \t]+)$/.exec(body);
      if (tail) {
        var bs = /\\*$/.exec(tail[1])[0].length;
        body = bs % 2 === 1 ? tail[1] + " " : tail[1];
      }
      // RF separators: 2+ spaces, or a tab optionally padded with spaces.
      var tokens = body.split(/[ \t]*\t[ \t]*| {2,}/);
      // A cell starting with '#' begins an inline comment: drop it and the rest.
      for (var ci = 1; ci < tokens.length; ci++) {
        if (tokens[ci].charAt(0) === "#") { tokens = tokens.slice(0, ci); break; }
      }
      if (tokens[0] === "New Browser") continue;     // bootstrap: re-added on export
      if (tokens[0] === "New Page") {
        if (url === null && tokens[1] !== undefined) url = rfUnescape(tokens[1]);
        continue;
      }
      if (tokens[0] === "No Operation" && tokens.length === 1) continue; // empty-scenario placeholder
      var step = parseStepLine(tokens);
      if (step) steps.push(step);
      else skipped.push(body);
    }
    return { testName: testName || "", url: url || "", steps: steps, skipped: skipped };
  }

  return {
    rfEscape: rfEscape,
    refEscape: refEscape,
    rfUnescape: rfUnescape,
    emitStep: emitStep,
    emitBody: emitBody,
    splitScenarios: splitScenarios,
    scenarioName: scenarioName,
    buildSuite: buildSuite,
    buildResourcePair: buildResourcePair,
    parseSuite: parseSuite,
    // resource-pair naming helpers, shared with emit_selenium.js
    slugText: slugText,
    slugOf: slugOf,
    titleCase: titleCase,
    KEYWORD_SHAPES: KEYWORD_SHAPES,
  };
});

// ---- src/core/emit_selenium.js -------------------------------------------
/*
 * rf-web-recorder: core/emit_selenium.js
 *
 * Step -> Robot Framework SeleniumLibrary keyword emission. Pure logic.
 * Second emission adapter next to emit_browser.js (same step model, same
 * export shapes) for teams still on SeleniumLibrary.
 *
 * Locator translation, SeleniumLibrary has no Playwright engines:
 *   - `role=…[name=…]` and `text=…` selectors CANNOT be expressed; each
 *     recorded step carries a `css` fallback (the anchored CSS path computed
 *     at capture time) which is used instead, as `css:<path>`;
 *   - `id=X`            -> `id:X`
 *   - everything else (test-id / placeholder attribute selectors, CSS paths)
 *     is plain CSS       -> `css:<selector>`
 * A step whose locator needs the CSS fallback but has none recorded (e.g.
 * steps restored from a pre-0.2 session) is kept as a comment: the
 * information is never silently dropped.
 * Limit: Playwright CSS pierces open shadow roots, Selenium CSS does not,
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

  // Selenium key names are UPPER_SNAKE: camel-case DOM keys split on the case
  // boundary (ArrowDown -> ARROW_DOWN): a bare toUpperCase() would emit the
  // invalid ARROWDOWN for any key set through the panel's step editor.
  function seleniumKeyName(key) {
    return KEY_NAMES[key] ||
      String(key || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  }

  // One step -> one SeleniumLibrary keyword line (or a comment, never a loss).
  // `esc` (default rfEscape): see emit_browser.emitStep.
  function emitStep(step, esc) {
    var E = esc || rfEscape;
    if (!step) return [];
    if (step.type === "test") {
      return ["# --- Test: " + (step.name || "Test") + " ---"];  // scenario marker (comment in a body paste)
    }
    if (step.type === "press") {
      return ["Press Keys" + SEP + "None" + SEP + E(seleniumKeyName(step.key), true)];
    }
    if (step.type === "wait-load") {
      return ["Wait For Condition" + SEP + "return document.readyState === 'complete'"];
    }
    var loc = toSeleniumLocator(step);
    if (loc === null && step.locator) {
      var reference = base.emitStep(step)[0] || (step.type + " " + step.locator);
      return ["# untranslatable to SeleniumLibrary (no CSS fallback recorded): " + reference];
    }
    loc = E(loc);
    switch (step.type) {
      case "click": return ["Click Element" + SEP + loc];
      case "fill": return ["Input Text" + SEP + loc + SEP + E(step.value, true)];
      case "select": return ["Select From List By Label" + SEP + loc + SEP + E(step.value, true)];
      case "check": return ["Select Checkbox" + SEP + loc];
      case "uncheck": return ["Unselect Checkbox" + SEP + loc];
      case "assert-visible": return ["Element Should Be Visible" + SEP + loc];
      case "assert-text": return ["Element Text Should Be" + SEP + loc + SEP + E(step.value, true)];
      case "assert-value":
        return ["Element Attribute Value Should Be" + SEP + loc + SEP + "value" + SEP + E(step.value, true)];
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

  // Full runnable .robot suite (SeleniumLibrary session bootstrap). `test`
  // markers split it into several test cases; Open Browser runs only in the
  // first one: later tests continue the same session.
  function buildSuite(opts) {
    opts = opts || {};
    var lines = [];
    lines.push("*** Settings ***");
    lines.push("Library" + SEP + "SeleniumLibrary");
    lines.push("");
    lines.push("*** Test Cases ***");
    var groups = base.splitScenarios(opts.steps);
    groups.forEach(function (group, gi) {
      lines.push(base.scenarioName(group, gi, testNameOf(opts)));
      if (gi === 0) {
        lines.push(SEP + "Open Browser" + SEP + rfEscape(opts.url || "about:blank") + SEP +
                   (opts.seleniumBrowser || "Chrome"));
      } else if (!group.items.length) {
        lines.push(SEP + "No Operation");        // RF forbids an empty test body
      }
      group.items.forEach(function (st) {
        emitStep(st).forEach(function (l) { lines.push(SEP + l); });
      });
    });
    return lines.join("\n") + "\n";
  }

  // ---- resource-first pair (same shape as emit_browser's) ------------------
  // Naming helpers + keyword shapes are shared with emit_browser.js: one
  // definition, two adapters.
  var slugOf = base.slugOf;
  var titleCase = base.titleCase;
  var KEYWORD_SHAPES = base.KEYWORD_SHAPES;

  function buildResourcePair(opts) {
    opts = opts || {};
    var steps = opts.steps || [];
    var resourceName = opts.resourceName || "recorded_keywords.resource";

    // 1. distinct TRANSLATED locators -> ${LOC_<N>_<SLUG>} variables
    // Object.create(null): see emit_browser, a locator spelled like an
    // Object.prototype member must not hit an inherited property.
    var varByLocator = Object.create(null);
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
    var keywordByShape = Object.create(null);
    var usedNames = Object.create(null);
    var suiteCalls = [];     // strings, or { marker: name } scenario boundaries
    steps.forEach(function (st) {
      if (st.type === "test") { suiteCalls.push({ marker: String(st.name || "") }); return; }
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
        // Reuse emitStep verbatim: base.refEscape keeps the generated variable
        // references live, and a locator that ALREADY starts with ${ skips
        // translation below.
        var line = emitStep({ type: st.type, locator: locRef, css: null,
                              value: shape.arg ? argRef : st.value, key: st.key }, base.refEscape)[0];
        body.push(SEP + line);
        keywords.push({ name: kwName, lines: body });
      }
      suiteCalls.push(shape.arg ? kwName + SEP + rfEscape(st.value, true) : kwName);
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

    // 4. suite text (locator-free; markers split it into several tests,
    //    the Open Browser bootstrap in the first only)
    var suite = [];
    suite.push("*** Settings ***");
    suite.push("Resource" + SEP + resourceName);
    suite.push("");
    suite.push("*** Test Cases ***");
    var groups = base.splitScenarios(suiteCalls);
    groups.forEach(function (group, gi) {
      suite.push(base.scenarioName(group, gi, testNameOf(opts)));
      if (gi === 0) {
        suite.push(SEP + "Open Browser" + SEP + rfEscape(opts.url || "about:blank") + SEP +
                   (opts.seleniumBrowser || "Chrome"));
      } else if (!group.items.length) {
        suite.push(SEP + "No Operation");
      }
      group.items.forEach(function (c) { suite.push(SEP + c); });
    });

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

// ---- src/core/emit_report.js ---------------------------------------------
/*
 * rf-web-recorder: core/emit_report.js
 *
 * Step -> human documentation. Pure logic, unit-testable without a DOM.
 * Concept ported back from the SAPFX web recorder (its 0.8.0 "HTML
 * documentation report" + "spec plan" exports, themselves inspired by
 * RoboSAPiens' saveHtmlReport: see the SAPFX project's NOTICE chain).
 *
 * Two export shapes, both documentation and never a test (the raw recording
 * stays authoritative):
 *   buildReport(opts, emitter) -> self-contained HTML page: one chapter per
 *       scenario, one <li> per step with the factual English phrase AND the
 *       exact Robot Framework line alongside (the report never invents);
 *       inline minimal CSS, no JS, no external resource.
 *   buildPlan(opts)            -> Markdown test-plan draft: one section per
 *       scenario, numbered business-readable steps, expected results left to
 *       the reviewer, plus a "Recorded locators" appendix (locators stay out
 *       of the phrasing when the target has an accessible name).
 *
 * humanizeStep(step) is the shared phrase builder: it uses the accessible
 * name captured at record time when there is one, the raw locator (marked as
 * code) otherwise, and it says so when a value was masked at capture.
 */
(function (global, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./emit_browser.js"));
  } else {
    var core = global.__RFREC_CORE = global.__RFREC_CORE || {};
    core.report = factory(core.emit);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (base) {
  "use strict";

  var MASKED_RE = /^<(PASSWORD|SECRET)>$/;

  // The step's human-facing label: the accessible name captured at record
  // time when there is one, otherwise the locator itself (flagged as code so
  // renderers can style it and the plan can route it to the appendix).
  function stepLabel(step) {
    var name = step && step.name ? String(step.name).trim() : "";
    if (name) return { text: name, code: false };
    var loc = step && step.locator ? String(step.locator) : "";
    if (loc) return { text: loc, code: true };
    return { text: "the element", code: false };
  }

  function maskedNote(value) {
    return MASKED_RE.test(String(value === undefined || value === null ? "" : value))
      ? " (value masked at capture)" : "";
  }

  // One step -> { phrase parts } or null when the step has no translation
  // (unknown type): callers then fall back to the raw keyword line.
  // The phrase is returned in parts so each renderer can quote/escape its own
  // way: [{ text }, { text, code: true }, ...].
  function humanizeStep(step) {
    if (!step || !step.type || step.type === "test") return null;
    var label = stepLabel(step);
    var q = function (v) { return { text: '"' + String(v === undefined || v === null ? "" : v) + '"' }; };
    var t = function (text) { return { text: text }; };
    switch (step.type) {
      case "click": return [t("Click "), label, t(".")];
      case "fill": return [t("Fill "), label, t(" with "), q(step.value),
                           t(maskedNote(step.value) + ".")];
      case "select": return [t("Select "), q(step.value), t(" in "), label, t(".")];
      case "check": return [t("Check "), label, t(".")];
      case "uncheck": return [t("Uncheck "), label, t(".")];
      case "press": return [t("Press the "), t(String(step.key || "")), t(" key.")];
      case "wait-load": return [t("Wait for the page to finish loading.")];
      case "assert-visible": return [t("Verify that "), label, t(" is visible.")];
      case "assert-text": return [t("Verify that "), label, t(" shows "), q(step.value), t(".")];
      case "assert-value": return [t("Verify that "), label, t(" contains the value "),
                                   q(step.value), t(maskedNote(step.value) + ".")];
      case "assert-count": return [t("Verify that "), label, t(" appears "),
                                   t(String(step.value === undefined ? "" : step.value)),
                                   t(" time(s).")];
      case "capture": return [t("Locate "), label, t(" (captured locator).")];
      default: return null;
    }
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function phraseHtml(parts) {
    return parts.map(function (p) {
      return p.code ? "<code>" + escapeHtml(p.text) + "</code>" : escapeHtml(p.text);
    }).join("");
  }
  // Markdown rendering: code parts in CommonMark code spans (a literal `*LH*`
  // must not render as emphasis: same lesson as the SAPFX spec export).
  function mdCode(t) {
    var s = String(t);
    var ticks = "`";
    while (s.indexOf(ticks) !== -1) ticks += "`";
    return ticks + s + ticks;
  }
  function phraseMd(parts) {
    return parts.map(function (p) { return p.code ? mdCode(p.text) : p.text; }).join("");
  }

  function planNameOf(opts) {
    return (opts && opts.testName ? String(opts.testName) : "").trim() || "Recorded Scenario";
  }

  // ---- HTML documentation report -------------------------------------------
  function buildReport(opts, emitter) {
    opts = opts || {};
    var em = emitter || base;
    var name = planNameOf(opts);
    var css = "body{font-family:system-ui,sans-serif;margin:2em auto;max-width:62em;" +
      "padding:0 1em;color:#24292f}h1{font-size:1.5em;border-bottom:2px solid #444;" +
      "padding-bottom:.3em}h2{font-size:1.15em;margin-top:1.4em}p.meta{color:#57606a;" +
      "font-size:.9em}ol.steps{padding-left:1.6em}ol.steps>li{margin:.9em 0}" +
      "p.human{margin:0 0 .15em}p.raw{margin:0}code{background:#f6f8fa;" +
      "border:1px solid #d0d7de;border-radius:3px;padding:1px 5px;font-size:.85em;" +
      "color:#3b4854}";
    var page = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
      "<title>" + escapeHtml(name) + "</title>\n<style>" + css + "</style>\n" +
      "</head>\n<body>\n<h1>" + escapeHtml(name) + "</h1>\n" +
      "<p class=\"meta\">Report generated by rf-web-recorder from " +
      escapeHtml(String(opts.url || "about:blank")) + ". Documentation of the " +
      "recorded flow: the raw recording stays authoritative, this report is " +
      "not a test.</p>\n";
    base.splitScenarios(opts.steps).forEach(function (group, gi) {
      page += "<h2>" + (gi + 1) + ". " +
        escapeHtml(base.scenarioName(group, gi, name)) + "</h2>\n<ol class=\"steps\">\n";
      group.items.forEach(function (step) {
        var parts = humanizeStep(step);
        var raw = em.emitStep(step).map(escapeHtml).join("<br>");
        page += "<li>" +
          (parts ? "<p class=\"human\">" + phraseHtml(parts) + "</p>" : "") +
          "<p class=\"raw\"><code>" + raw + "</code></p></li>\n";
      });
      page += "</ol>\n";
    });
    page += "</body>\n</html>\n";
    return page;
  }

  // ---- Markdown test-plan draft --------------------------------------------
  function buildPlan(opts) {
    opts = opts || {};
    var name = planNameOf(opts);
    var groups = base.splitScenarios(opts.steps);
    var locators = [];   // [{ locator, where }]: appendix rows, in order of first use
    var seen = {};
    var md = "# Test plan: " + name + "\n\n";
    md += "Draft generated by rf-web-recorder from " + mdCode(String(opts.url || "about:blank")) +
      ".\nBusiness-readable draft of the recorded flow: review the wording, add the " +
      "expected\nresults, then hand it to whoever writes the final suite. Raw locators " +
      "live in the\nappendix.\n\n";
    groups.forEach(function (group, gi) {
      md += "## Scenario " + (gi + 1) + ": " + base.scenarioName(group, gi, name) + "\n\n";
      var n = 0;
      group.items.forEach(function (step, si) {
        var parts = humanizeStep(step);
        if (!parts) return;   // unknown step types carry no phrase: nothing invented
        n++;
        md += n + ". " + phraseMd(parts) + "\n";
        if (step.locator && !seen[step.locator]) {
          seen[step.locator] = true;
          locators.push({ locator: step.locator,
                          where: "scenario " + (gi + 1) + ", step " + (si + 1) });
        }
      });
      if (!n) md += "*(no translatable step recorded)*\n";
      md += "\n- **Expected result**: to complete by the reviewer.\n\n";
    });
    md += "## Recorded locators\n\n";
    md += locators.length
      ? locators.map(function (l) { return "- " + mdCode(l.locator) + " (" + l.where + ")"; }).join("\n") + "\n"
      : "*(none)*\n";
    return md;
  }

  return { humanizeStep: humanizeStep, buildReport: buildReport, buildPlan: buildPlan,
           escapeHtml: escapeHtml, mdCode: mdCode };
});

// ---- src/core/emit_istqb.js ----------------------------------------------
/*
 * rf-web-recorder: core/emit_istqb.js
 *
 * Step -> ISTQB test-design document. Pure logic, unit-testable without a
 * DOM. Ported back from the SAPFX recorders' ISTQB export (2026-08-05: same
 * template on their desktop and web channels; see NOTICE chain).
 *
 * buildIstqb(opts, emitter) -> ONE Markdown document covering both ISTQB
 * levels (ISTQB / ISO 29119-3):
 *   - test plan: objective and scope, preconditions and observed data,
 *     entry/exit criteria, traceability, risks;
 *   - test cases: one TC per scenario marker, an Action / Data / Expected
 *     result table, and a normalized `replay` YAML block: framework-neutral
 *     actions (click/fill/press_key/assert_*), the human target first (the
 *     accessible name captured at record time), the recorded locator
 *     relegated to a `hint` (engine = the locator strategy).
 *
 * Human-readable AND replayable by an AI with any test framework. The
 * recorder invents nothing: judgment fields stay "to complete" (an agent or
 * a reviewer writes them); assertions recorded in-page carry real expected
 * values; masked values (<PASSWORD>/<SECRET>) never reach the document as
 * data (the step becomes `fill_secret`).
 */
(function (global, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./emit_browser.js"), require("./emit_report.js"));
  } else {
    var core = global.__RFREC_CORE = global.__RFREC_CORE || {};
    core.istqb = factory(core.emit, core.report);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (base, report) {
  "use strict";

  var MASKED_RE = /^<(PASSWORD|SECRET)>$/;

  // Single-quoted YAML scalar: the only escape is doubling inner quotes, safe
  // whatever was recorded.
  function yq(t) { return "'" + String(t).replace(/'/g, "''") + "'"; }

  // Markdown table cell: a bare pipe would split the row, even inside a code
  // span.
  function mdCell(t) { return String(t).replace(/\|/g, "\\|"); }

  // Kebab-case plan identifier, accents transliterated (NFD + diacritics
  // stripped): "Scénario enregistré" -> scenario-enregistre, never
  // sc-nario-enregistr (caught live on the SAPFX side).
  function istqbSlug(t) {
    var s = String(t);
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* older engines */ }
    s = s.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return s || "recorded";
  }

  var GENERIC_EXPECTED = "The action completes without error (to specify)";
  var TABLE_EXPECTED = {
    fill: "The value is accepted",
    fill_secret: "The value is accepted",
    select: "The selection is applied",
    press_key: "The next state appears (to specify)",
    wait: "Loading completes",
    assert_present: "The element is visible",
    assert_text: "The text matches (review for locale independence)",
    assert_value: "The value matches (review for locale independence)",
    assert_count: "The occurrence count matches",
    locate: "to specify",
    raw: "to specify",
  };

  // One step -> normalized replay entry { action, target?, value?, expected?,
  // key?, note?, hint? } or null for scenario markers. Unknown types become
  // `raw` carrying the emitter's exact keyword line: nothing dropped silently.
  function istqbStep(step, emitter) {
    if (!step || !step.type || step.type === "test") return null;
    var out = null;
    var masked = MASKED_RE.test(String(step.value === undefined || step.value === null ? "" : step.value));
    switch (step.type) {
      case "click": out = { action: "click" }; break;
      case "fill":
        out = masked
          ? { action: "fill_secret", note: "value masked at capture, provide at replay" }
          : { action: "fill", value: step.value };
        break;
      case "select": out = { action: "select", value: step.value }; break;
      case "check": out = { action: "check" }; break;
      case "uncheck": out = { action: "uncheck" }; break;
      case "press": out = { action: "press_key", value: step.key }; break;
      case "wait-load": out = { action: "wait" }; break;
      case "assert-visible": out = { action: "assert_present" }; break;
      case "assert-text": out = { action: "assert_text", expected: step.value }; break;
      case "assert-value":
        out = masked
          ? { action: "assert_value", note: "expected value masked at capture" }
          : { action: "assert_value", expected: step.value };
        break;
      case "assert-count": out = { action: "assert_count", expected: step.value }; break;
      case "capture":
        out = { action: "locate", note: "captured locator, no user action" };
        break;
      default:
        out = { action: "raw",
                line: (emitter || base).emitStep(step).join("  |  "),
                note: "step without translation: exact keyword line" };
    }
    var name = step.name ? String(step.name).trim() : "";
    if (name) out.target = name;
    if (step.locator) {
      out.hint = { engine: String(step.strategy || "browser"), locator: String(step.locator) };
    }
    return out;
  }

  function istqbYaml(st) {
    var out = ["  - action: " + st.action];
    ["target", "value", "expected", "line", "note"].forEach(function (k) {
      if (st[k] !== undefined && st[k] !== null) out.push("    " + k + ": " + yq(st[k]));
    });
    if (st.hint) {
      out.push("    hint: {engine: " + yq(st.hint.engine) + ", locator: " + yq(st.hint.locator) + "}");
    }
    return out;
  }

  // ---- the document ---------------------------------------------------------
  function buildIstqb(opts, emitter) {
    opts = opts || {};
    var name = (opts.testName ? String(opts.testName) : "").trim() || "Recorded Scenario";
    var url = String(opts.url || "about:blank");
    var groups = base.splitScenarios(opts.steps);
    var values = [];
    var parsed = groups.map(function (group) {
      return group.items
        .map(function (step) { return { step: step, st: istqbStep(step, emitter) }; })
        .filter(function (row) { return row.st !== null; });
    });
    parsed.forEach(function (rows) {
      rows.forEach(function (row) {
        if ((row.st.action === "fill" || row.st.action === "select") && row.st.value) {
          values.push(row.st.value);
        }
      });
    });

    var md = "# ISTQB test plan: " + name + "\n\n";
    md += "> Generated by rf-web-recorder from " + url + ".\n";
    md += "> Test-design document (ISTQB / ISO 29119-3): human-readable, and\n";
    md += "> replayable by an AI with any test framework through each test\n";
    md += "> case's `replay` block. Fill the \"to complete\" fields before any\n";
    md += "> formal use: the recorder documents what it observed, it invents\n";
    md += "> nothing.\n\n";
    md += "- **Identifier**: TP-" + istqbSlug(name) + "\n";
    md += "- **Channel**: web (browser UI)\n";
    md += "- **System / URL**: " + url + "\n\n";
    md += "## 1. Objective and scope\n\n";
    md += "- **Objective**: to complete (observed: the recorded flow below).\n";
    md += "- **Items under test**: to complete.\n";
    md += "- **Out of scope**: to complete.\n\n";
    md += "## 2. Preconditions and test data\n\n";
    md += "- Application reachable at " + url + ".\n";
    md += "- Values observed while recording: " +
      (values.length ? values.map(report.mdCode).join(", ") : "none") + ".\n\n";
    md += "## 3. Entry / exit criteria\n\n";
    md += "- **Entry**: application reachable, preconditions satisfied.\n";
    md += "- **Exit**: all test cases executed, expected results confirmed.\n\n";
    md += "## 4. Test cases\n\n";
    var trace = [];
    groups.forEach(function (group, gi) {
      var tcId = "TC-" + (gi + 1 < 10 ? "0" : "") + (gi + 1);
      var title = base.scenarioName(group, gi, name);
      md += "### " + tcId + ": " + title + "\n\n- **Priority**: to complete\n\n";
      md += "| # | Action | Data | Expected result |\n";
      md += "|---|--------|------|-----------------|\n";
      parsed[gi].forEach(function (row, i) {
        var human;
        if (row.st.action === "fill_secret" ||
            (row.st.action === "assert_value" && row.st.expected === undefined)) {
          // Masked at capture: even the placeholder stays out of the document
          // (the recorder never carries a secret, mirroring the SAPFX export).
          var label = row.st.target || report.mdCode(row.st.hint ? row.st.hint.locator : "the element");
          human = (row.st.action === "fill_secret" ? "Fill " : "Verify ") + label +
            " (value masked at capture, provide at replay)";
        } else {
          var parts = report.humanizeStep(row.step);
          human = parts
            ? parts.map(function (p) { return p.code ? report.mdCode(p.text) : p.text; }).join("")
            : "Untranslated step: " + report.mdCode(row.st.line || row.step.type);
        }
        var data = "";
        if (row.st.action !== "press_key" && row.st.value !== undefined) data = row.st.value;
        else if (row.st.action.indexOf("assert") === 0 && row.st.expected !== undefined) data = row.st.expected;
        md += "| " + (i + 1) + " | " + mdCell(human) + " | " +
          mdCell(data === "" ? "" : report.mdCode(data)) + " | " +
          mdCell(TABLE_EXPECTED[row.st.action] || GENERIC_EXPECTED) + " |\n";
      });
      md += "\n- **Postconditions**: to complete.\n\n";
      md += "Replay block (normalized actions; each `hint` is the locator\n";
      md += "recorded at capture time, and may drift):\n\n";
      md += "```yaml\ntest_case: " + tcId + "\ntitle: " + yq(title) + "\nchannel: web\nsteps:\n";
      parsed[gi].forEach(function (row) { md += istqbYaml(row.st).join("\n") + "\n"; });
      md += "```\n\n";
      trace.push("| " + tcId + " | scenario " + (gi + 1) + " of the recording, steps 1 to " +
        parsed[gi].length + " | to link |");
    });
    md += "## 5. Traceability\n\n";
    md += "| Test case | Source | Requirement / spec |\n|---|---|---|\n" +
      trace.join("\n") + "\n\n";
    md += "## 6. Risks and points of attention\n\n";
    md += "- The `hint` locators date from the recording session: re-verify\n";
    md += "  them when the page drifts (prefer role + accessible name, the\n";
    md += "  recorder's own preference order).\n";
    md += "- Never replay with fixed waits (time.sleep): wait on the load\n";
    md += "  state or on element visibility instead.\n";
    return md;
  }

  return { buildIstqb: buildIstqb, istqbStep: istqbStep, istqbSlug: istqbSlug };
});

// ---- src/core/resolve.js -------------------------------------------------
/*
 * rf-web-recorder: core/resolve.js
 *
 * The INVERSE of locator generation: resolve a recorded selector back to the
 * matching element(s) so recorded steps can be REPLAYED in place, plus the
 * pure step -> action planning and assertion evaluation the replayer runs on.
 *
 * Selector forms understood (exactly what locators.js emits):
 *   id=X                    -> getElementById, or a children-walk fallback
 *   role=<role>[name="…"]   -> full scan matching ariaRole() + accName()
 *   text="…"                -> full scan matching collapsed text content
 *   [attr="…"]              -> querySelector, or an attribute-walk fallback
 *   anything else (CSS)     -> querySelector (guarded; null when absent)
 *
 * Pure logic, duck-typed like the rest of core: works against any object
 * shaped like a document/element. Fake docs without querySelector fall back
 * to a children walk for every scannable form: only raw CSS paths genuinely
 * need a CSS engine.
 */
(function (global, factory) {
  "use strict";
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./locators.js"));
  } else {
    var core = global.__RFREC_CORE = global.__RFREC_CORE || {};
    core.resolve = factory(core.locators);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (locators) {
  "use strict";

  var collapse = locators.collapse;

  // ---- duck-typed document scan (mirror of locators.js allElements) --------
  // Pierces open shadow roots like the Playwright engines the recorded
  // locators target: replay must resolve what the export will resolve.
  function allElements(doc) {
    if (doc && typeof doc.querySelectorAll === "function") {
      try {
        var out = [];
        var scopes = [doc];
        while (scopes.length) {
          var els = scopes.pop().querySelectorAll("*");
          for (var i = 0; i < els.length; i++) {
            out.push(els[i]);
            if (els[i].shadowRoot) scopes.push(els[i].shadowRoot);
          }
        }
        return out;
      } catch (e) { /* fall through */ }
    }
    var out2 = [];
    function walkChildren(n) {
      var kids = (n && n.children) || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i]);
    }
    function walk(n) {
      if (!n) return;
      out2.push(n);
      if (n.shadowRoot) walkChildren(n.shadowRoot);
      walkChildren(n);
    }
    if (doc && doc.body) walk(doc.body);
    return out2;
  }
  function attrOf(el, name) {
    try {
      if (el && typeof el.getAttribute === "function") {
        var v = el.getAttribute(name);
        return v === null || v === undefined ? "" : String(v);
      }
    } catch (e) { /* ignore */ }
    return "";
  }
  function unescapeQuoted(s) { return String(s).replace(/\\(.)/g, "$1"); }

  // ---- selector parsing (inverse of locators.js candidate selectors) ------
  function parseLocator(locator) {
    var loc = String(locator === undefined || locator === null ? "" : locator);
    var m = /^id=(.+)$/.exec(loc);
    if (m) return { kind: "id", id: m[1] };
    m = /^role=([\w-]+)\[name="((?:\\.|[^"\\])*)"\]$/.exec(loc);
    if (m) return { kind: "role", role: m[1].toLowerCase(), name: unescapeQuoted(m[2]) };
    m = /^text="((?:\\.|[^"\\])*)"$/.exec(loc);
    if (m) return { kind: "text", text: unescapeQuoted(m[1]) };
    m = /^\[([A-Za-z][\w-]*)="((?:\\.|[^"\\])*)"\]$/.exec(loc);
    if (m) return { kind: "attr", attribute: m[1], value: unescapeQuoted(m[2]) };
    return { kind: "css", css: loc };
  }

  function matchesParsed(el, parsed, doc) {
    switch (parsed.kind) {
      case "id": return String((el && el.id) || "") === parsed.id;
      case "role":
        return locators.ariaRole(el) === parsed.role && locators.accName(el, doc) === parsed.name;
      case "text":
        return collapse(el && el.textContent !== undefined && el.textContent !== null ? el.textContent : "") === parsed.text;
      case "attr": return attrOf(el, parsed.attribute) === parsed.value;
      default: return false;
    }
  }

  // All elements matching the locator, in document order. Raw CSS needs a
  // real querySelectorAll; every other form falls back to a children walk.
  function queryAll(locator, doc) {
    var parsed = parseLocator(locator);
    if (parsed.kind === "css" || parsed.kind === "attr") {
      if (doc && typeof doc.querySelectorAll === "function") {
        try {
          var sel = parsed.kind === "attr"
            ? "[" + parsed.attribute + '="' + parsed.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]'
            : parsed.css;
          return Array.prototype.slice.call(doc.querySelectorAll(sel));
        } catch (e) { /* invalid selector or exotic host: fall through */ }
      }
      if (parsed.kind === "css") return [];       // no CSS engine on this doc
    }
    if (parsed.kind === "id" && doc && typeof doc.getElementById === "function") {
      try {
        var byId = doc.getElementById(parsed.id);
        return byId ? [byId] : [];
      } catch (e) { /* fall through to the walk */ }
    }
    var els = allElements(doc);
    var out = [];
    for (var i = 0; i < els.length; i++) {
      if (matchesParsed(els[i], parsed, doc)) out.push(els[i]);
    }
    return out;
  }

  function resolveSelector(locator, doc) {
    var found = queryAll(locator, doc);
    return found.length ? found[0] : null;
  }
  function countSelector(locator, doc) { return queryAll(locator, doc).length; }

  // ---- step -> replay action descriptor (pure) -----------------------------
  function planStep(step) {
    if (!step) return { action: "noop" };
    switch (step.type) {
      case "test": return { action: "marker", name: step.name || "" };
      case "wait-load": return { action: "wait", ms: 300 };
      case "press": return { action: "press", key: step.key === undefined ? "" : String(step.key) };
      case "click": return { action: "click", locator: step.locator };
      case "fill":
        return { action: "fill", locator: step.locator,
                 value: step.value === undefined || step.value === null ? "" : String(step.value) };
      case "select":
        return { action: "select", locator: step.locator,
                 label: step.value === undefined || step.value === null ? "" : String(step.value) };
      case "check": return { action: "setChecked", locator: step.locator, checked: true };
      case "uncheck": return { action: "setChecked", locator: step.locator, checked: false };
      case "assert-visible": case "assert-text": case "assert-value":
      case "assert-count": case "capture":
        return { action: "assert", kind: step.type, locator: step.locator };
      default: return { action: "noop" };
    }
  }

  // ---- assertion evaluation (pure given a doc) -----------------------------
  // Returns { ok, reason?, element? }: the element travels back so the
  // replayer can highlight what it checked.
  function evalAssertion(step, doc) {
    var loc = step && step.locator;
    if (step && step.type === "assert-count") {
      var n = countSelector(loc, doc);
      var want = Number(step.value);
      if (n === want) return { ok: true };
      return { ok: false, reason: "count is " + n + ", expected " + want + " for " + loc };
    }
    var el = resolveSelector(loc, doc);
    if (!el) return { ok: false, reason: "element not found: " + loc };
    switch (step.type) {
      case "capture":
        return { ok: true, element: el };
      case "assert-visible": {
        var rect = null;
        try {
          if (typeof el.getBoundingClientRect === "function") rect = el.getBoundingClientRect();
        } catch (e) { /* detached */ }
        if (rect && (!rect.width || !rect.height)) {
          return { ok: false, reason: "element has a zero-size box: " + loc, element: el };
        }
        return { ok: true, element: el };
      }
      case "assert-text": {
        var text = collapse(el.textContent !== undefined && el.textContent !== null ? el.textContent : "");
        if (text === String(step.value)) return { ok: true, element: el };
        return { ok: false, reason: 'text is "' + text + '", expected "' + step.value + '"', element: el };
      }
      case "assert-value": {
        var value = el.value === undefined || el.value === null ? "" : String(el.value);
        if (value === String(step.value)) return { ok: true, element: el };
        return { ok: false, reason: 'value is "' + value + '", expected "' + step.value + '"', element: el };
      }
      default:
        return { ok: false, reason: "unsupported assertion: " + (step && step.type) };
    }
  }

  // ---- <select> replay helper: option index by label -----------------------
  function findOptionIndex(selectEl, label) {
    var options = (selectEl && selectEl.options) || [];
    var want = collapse(label === undefined || label === null ? "" : label);
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var lab = opt && opt.label !== undefined && opt.label !== null ? collapse(String(opt.label)) : "";
      if (!lab) lab = collapse(opt && opt.textContent !== undefined && opt.textContent !== null ? opt.textContent : "");
      if (lab === want) return i;
    }
    return -1;
  }

  return {
    parseLocator: parseLocator,
    resolveSelector: resolveSelector,
    countSelector: countSelector,
    planStep: planStep,
    evalAssertion: evalAssertion,
    findOptionIndex: findOptionIndex,
  };
});

// ---- src/panel/panel.js --------------------------------------------------
/*
 * rf-web-recorder: panel/panel.js
 *
 * Floating in-page UI: draggable/collapsible panel with rec/play/+test/export/
 * clear/stop buttons, an editable test name, the ordered step list (move
 * up/down, delete, double-click inline edit, scenario-marker rows, replay row
 * status), a hover highlight overlay, and a small floating menu used both for
 * the export-format picker and the right-click assertion menu.
 *
 * Browser-only (touches the DOM). Ported from the author's SAPFX recorder
 * panel (Apache-2.0) and generalized: see NOTICE.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE = global.__RFREC_CORE || {};

  var ACCENT = "#4f46e5";   // indigo: panel identity color
  var REC_RED = "#d0021b";

  // ---- hover highlight overlay ---------------------------------------------
  function createOverlay(doc) {
    var flashTimer = 0, flashOrig = "";
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
        // Snapshot the resting background only when idle: two overlapping
        // flashes (fill + deferred press arrive in one tick) would otherwise
        // snapshot the green and restore green: permanently.
        if (flashTimer) clearTimeout(flashTimer);
        else flashOrig = box.style.background;
        box.style.background = "rgba(22,163,74,0.25)";
        flashTimer = setTimeout(function () {
          box.style.background = flashOrig;
          flashTimer = 0;
        }, 150);
      },
      destroy: function () {
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = 0; }
        box.remove(); chip.remove();
      },
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
  // handlers: onToggleRec(), onPlay(), onAddTest(name), onExport(anchorRect),
  //           onClear(), onStop(), onMoveStep(i, delta), onRemoveStep(i),
  //           onEditStep(i, text), onNameInput(value)
  function createPanel(doc, handlers) {
    var panel = doc.createElement("div");
    panel.id = "__rfrecPanel";
    // 470px: the header row carries 7 controls (collapse/rec/play/+test/export/
    // clear/stop): at 400px it wrapped onto two lines and pushed `stop` under
    // the title (seen in the first recorded demo).
    panel.style.cssText = "position:fixed;z-index:2147483647;right:12px;bottom:12px;" +
      "width:470px;max-height:55vh;display:flex;flex-direction:column;background:#fff;" +
      "border:1px solid #b3b3b3;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
      "font:12px/1.45 -apple-system,Segoe UI,sans-serif;color:#222;overflow:hidden;";

    var head = doc.createElement("div");
    head.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 10px;" +
      "background:" + ACCENT + ";color:#fff;font-weight:600;cursor:move;";
    var dot = doc.createElement("span");   // blinking recording indicator
    dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:" + REC_RED +
      ";display:none;flex:0 0 auto;box-shadow:0 0 4px " + REC_RED + ";";
    var title = doc.createElement("span");
    // nowrap + ellipsis: the title must never push the buttons onto a 2nd row
    title.style.cssText = "flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    var btnCollapse = doc.createElement("button");
    var btnRec = doc.createElement("button");
    var btnPlay = doc.createElement("button");
    var btnAddTest = doc.createElement("button");
    var btnExport = doc.createElement("button");
    var btnClear = doc.createElement("button");
    var btnClose = doc.createElement("button");
    [btnCollapse, btnRec, btnPlay, btnAddTest, btnExport, btnClear, btnClose].forEach(function (b) {
      b.style.cssText = "border:1px solid #fff;background:transparent;color:#fff;" +
        "border-radius:4px;cursor:pointer;font:11px monospace;padding:2px 6px;";
    });
    btnCollapse.textContent = "▾";  // expanded marker
    btnRec.textContent = "rec"; btnPlay.textContent = "play";
    btnAddTest.textContent = "+test"; btnExport.textContent = "export";
    btnClear.textContent = "clear"; btnClose.textContent = "stop";
    btnPlay.title = "Replay the recorded steps on this page";
    btnAddTest.title = "Start a new test case (scenario marker)";
    head.appendChild(dot); head.appendChild(title); head.appendChild(btnCollapse);
    head.appendChild(btnRec); head.appendChild(btnPlay); head.appendChild(btnAddTest);
    head.appendChild(btnExport); head.appendChild(btnClear); head.appendChild(btnClose);

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
    // Cross-origin iframe warning strip (hidden by default): shown by
    // setFrameWarn(n) in the TOP frame when the page embeds frames this
    // bundle cannot reach. Ported from the SAPFX web recorder.
    var frameWarn = doc.createElement("div");
    frameWarn.style.cssText = "padding:4px 10px;color:#a15c00;background:#fff8ec;" +
      "border-top:1px solid #f0e0c0;display:none;";
    var hint = doc.createElement("div");
    hint.style.cssText = "padding:6px 10px;color:#666;border-top:1px solid #eee;";
    panel.appendChild(head); panel.appendChild(nameRow); panel.appendChild(list);
    panel.appendChild(frameWarn); panel.appendChild(hint);
    doc.documentElement.appendChild(panel);

    // +test inline prompt: a temporary one-line input above the step list;
    // Enter commits the next scenario's name, Escape cancels.
    var scenarioRow = null;
    function promptScenario() {
      if (scenarioRow) {
        var existing = scenarioRow.lastChild;
        if (existing && existing.focus) existing.focus();
        return;
      }
      scenarioRow = doc.createElement("div");
      scenarioRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid #eee;";
      var lbl = doc.createElement("span");
      lbl.textContent = "New test:"; lbl.style.color = "#666";
      var inp = doc.createElement("input");
      inp.type = "text";
      inp.placeholder = "next scenario name (Enter = add, Esc = cancel)";
      inp.style.cssText = "flex:1;font:11px monospace;border:1px solid " + ACCENT + ";border-radius:3px;padding:2px 5px;";
      function closePrompt() { if (scenarioRow) { scenarioRow.remove(); scenarioRow = null; } }
      inp.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") {
          var name = inp.value.trim();
          closePrompt();
          if (name) handlers.onAddTest(name);
        } else if (e.key === "Escape") { closePrompt(); }
      });
      scenarioRow.appendChild(lbl); scenarioRow.appendChild(inp);
      panel.insertBefore(scenarioRow, list);
      inp.focus();
    }

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
      // mouseup outside the window never reaches us: a move with no button
      // held means the drag already ended: stop following the cursor.
      if (e.buttons === 0) { drag = null; return; }
      panel.style.left = (e.clientX - drag.dx) + "px";
      panel.style.top = (e.clientY - drag.dy) + "px";
    }
    function onDragUp() { drag = null; }
    head.addEventListener("mousedown", onDragDown, true);
    doc.addEventListener("mousemove", onDragMove, true);
    doc.addEventListener("mouseup", onDragUp, true);

    btnRec.addEventListener("click", function () { handlers.onToggleRec(); });
    btnPlay.addEventListener("click", function () { handlers.onPlay(); });
    btnAddTest.addEventListener("click", function () { promptScenario(); });
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

    // Double-click inline editor: swaps the row text for an input. Enter
    // commits through onEditStep (the recorder re-renders), Escape cancels.
    function editRow(row, txt, i) {
      var inp = doc.createElement("input");
      inp.type = "text";
      inp.value = row.__rfrecEditValue;
      inp.style.cssText = "flex:1;font:11px monospace;border:1px solid " + ACCENT +
        ";border-radius:3px;padding:1px 4px;min-width:0;";
      row.replaceChild(inp, txt);
      inp.focus(); inp.select();
      var done = false;
      function cancel() {
        if (done) return;
        done = true;
        try { row.replaceChild(txt, inp); } catch (e) { /* row already re-rendered */ }
      }
      inp.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") { done = true; handlers.onEditStep(i, inp.value); }
        else if (e.key === "Escape") cancel();
      });
      inp.addEventListener("blur", cancel);
    }

    // Replay row status: "active" (current step), "fail" (stopped here), null.
    var rowEls = [];
    function applyRowStatus(row, status) {
      if (status === "active") {
        row.style.outline = "2px solid " + ACCENT; row.style.outlineOffset = "-2px";
        row.style.background = row.__rfrecBg || "";
      } else if (status === "fail") {
        row.style.outline = "2px solid " + REC_RED; row.style.outlineOffset = "-2px";
        row.style.background = "#fdecea";
      } else {
        row.style.outline = ""; row.style.background = row.__rfrecBg || "";
      }
    }

    return {
      root: panel,
      setRecording: function (on) {
        btnRec.textContent = on ? "pause" : "rec";
        btnRec.style.background = on ? REC_RED : "transparent";
        dot.style.display = on ? "inline-block" : "none";
        dot.style.animation = on ? "__rfrecBlink 1s infinite" : "none";
      },
      setHint: function (text) { hint.textContent = text; },
      // n cross-origin iframes are invisible to this bundle's listeners: say
      // so instead of silently missing their steps (0 hides the strip).
      setFrameWarn: function (n) {
        if (n > 0) {
          frameWarn.textContent = "⚠ " + n + " cross-origin iframe(s) this panel cannot reach: " +
            "the extension records inside them (one panel per frame); the console snippet cannot.";
          frameWarn.style.display = "";
        } else { frameWarn.style.display = "none"; }
      },
      getTestName: function () { return nameInput.value; },
      setTestName: function (v) { nameInput.value = v; },
      // step rows: "N. <line>" + strategy chip + up/down/delete; scenario
      // markers render as a distinct "· Test: name ·" row with delete only.
      // Double-click any row to edit it inline (value if the step carries
      // one, else key/name/locator).
      renderSteps: function (steps, lines, recording) {
        title.textContent = (recording ? "Recording" : "Steps") + ", " +
          steps.length + " step(s)" + frameTag;
        list.textContent = "";
        rowEls = [];
        steps.forEach(function (st, i) {
          var isMarker = st.type === "test";
          var row = doc.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 4px;border-bottom:1px solid #f0f0f0;";
          var txt = doc.createElement("span");
          txt.style.cssText = "flex:1;font:11px monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          if (isMarker) {
            txt.textContent = "· Test: " + (st.name || "?") + " ·";
            txt.style.color = ACCENT; txt.style.fontWeight = "600";
            row.style.background = "#eef2ff";
          } else {
            txt.textContent = (i + 1) + ". " + lines[i];
            txt.title = lines[i] + ": double-click to edit";
          }
          row.__rfrecBg = row.style.background;
          var editable = ("value" in st) ? st.value
            : st.type === "press" ? st.key
            : isMarker ? st.name
            : st.locator;
          row.__rfrecEditValue = editable === undefined || editable === null ? "" : String(editable);
          txt.addEventListener("dblclick", function (e) {
            e.preventDefault(); e.stopPropagation();
            editRow(row, txt, i);
          });
          row.appendChild(txt);
          if (!isMarker) {
            if (st.strategy) row.appendChild(strategyChip(st.strategy));
            row.appendChild(stepBtn("↑", function () { handlers.onMoveStep(i, -1); }));
            row.appendChild(stepBtn("↓", function () { handlers.onMoveStep(i, 1); }));
          }
          row.appendChild(stepBtn("✕", function () { handlers.onRemoveStep(i); }));
          list.appendChild(row);
          rowEls.push(row);
        });
      },
      // replay feedback: mark row i "active"/"fail" (clears the others);
      // setRowStatus(-1, null) clears everything.
      setRowStatus: function (i, status) {
        for (var j = 0; j < rowEls.length; j++) {
          applyRowStatus(rowEls[j], j === i ? status : null);
        }
        if (status && rowEls[i] && typeof rowEls[i].scrollIntoView === "function") {
          try { rowEls[i].scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ }
        }
      },
      // capture rows: label + one copy button per candidate strategy
      renderCaptures: function (captures, copyFn) {
        title.textContent = "RF Web Recorder: " + captures.length + " captured" + frameTag;
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
 * rf-web-recorder: recorder.js
 *
 * Event wiring: capture + record modes, in-panel replay, hover highlight,
 * right-click assertion menu, sessionStorage persistence, export + .robot
 * re-import. Browser-only.
 *
 * Capture mode (default): hover highlights the element and shows its best
 * locator; a click copies a `Get Element    <locator>` line and lists the
 * element (with every candidate strategy) in the panel.
 *
 * Record mode: clicks / typed values / selects / checkboxes become ordered
 * Browser-library steps; Enter/Tab become Keyboard Key presses; hash/history
 * navigation becomes Wait For Load State. Right-click opens the assertion
 * menu (visible / text / value / count). Passwords and other sensitive
 * fields (payment, OTP: see steps.sensitiveMask) are never captured in
 * clear text (value replaced by <PASSWORD> / <SECRET>).
 *
 * Ported from the author's SAPFX recorder listener (Apache-2.0) and
 * generalized: see NOTICE.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE = global.__RFREC_CORE || {};

  var STORE_KEY = "__rfrecSteps";
  var NAME_KEY = "__rfrecName";
  var URL_KEY = "__rfrecUrl";
  var REC_KEY = "__rfrecRecording";
  var DEFAULT_NAME = "Recorded Scenario";
  var REPLAY_DELAY = 350;   // ms between replayed steps
  var HINT_CAPTURE = "Hover + click to capture a locator. rec to record, play to replay. Esc to stop.";
  var HINT_RECORD = "Recording: clicks and typed values become steps. " +
    "Right-click an element for assertions. +test starts a new test case. " +
    "export offers Browser / SeleniumLibrary formats.";

  function createRecorder() {
    var locators = CORE.locators, stepsCore = CORE.steps, emit = CORE.emit,
        emitSelenium = CORE.emitSelenium, emitReport = CORE.report,
        emitIstqb = CORE.istqb,
        resolveCore = CORE.resolve, ui = CORE.panel;
    var doc = global.document;

    var running = false;
    var recording = false;
    var replaying = false;   // replay in progress: its synthetic events are never recorded
    var playTimer = 0;
    var captures = [];
    var steps = [];
    var panel = null, overlay = null, menu = null;

    // ---- persistence (survives page reloads within the tab) ----------------
    // sessionStorage writes can fail legitimately (private mode, quota,
    // storage disabled): recording still works, it just won't survive a
    // reload: warn once instead of failing silently.
    var persistWarned = false;
    function persistWarn(e) {
      if (persistWarned) return;
      persistWarned = true;
      try {
        console.warn("[rf-web-recorder] sessionStorage write failed: " +
          "steps will not survive a reload:", e);
      } catch (e2) { /* ignore */ }
    }
    function loadSteps() {
      try { var s = global.sessionStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : []; }
      catch (e) { return []; }
    }
    function saveSteps() {
      try { global.sessionStorage.setItem(STORE_KEY, JSON.stringify(steps)); } catch (e) { persistWarn(e); }
    }
    function loadName() {
      try { return global.sessionStorage.getItem(NAME_KEY) || DEFAULT_NAME; }
      catch (e) { return DEFAULT_NAME; }
    }
    function saveName(v) { try { global.sessionStorage.setItem(NAME_KEY, v); } catch (e) { persistWarn(e); } }
    function startUrl() {
      try { return global.sessionStorage.getItem(URL_KEY) || global.location.href; }
      catch (e) { return global.location.href; }
    }
    function rememberUrl() {
      try {
        if (!global.sessionStorage.getItem(URL_KEY)) {
          global.sessionStorage.setItem(URL_KEY, global.location.href);
        }
      } catch (e) { persistWarn(e); }
    }
    // The recording FLAG survives navigation too: after a reload + re-injection
    // (snippet re-paste or extension shortcut) recording resumes by itself
    // instead of silently dropping every interaction until the user notices.
    function saveRecording() {
      try { global.sessionStorage.setItem(REC_KEY, recording ? "1" : ""); } catch (e) { persistWarn(e); }
    }
    function loadRecording() {
      try { return global.sessionStorage.getItem(REC_KEY) === "1"; } catch (e) { return false; }
    }

    // ---- helpers -----------------------------------------------------------
    function copy(text, btn) {
      function flash(label) {
        if (!btn) return;
        if (btn.__rfrecLabel === undefined) btn.__rfrecLabel = btn.textContent;
        btn.textContent = label;
        setTimeout(function () { btn.textContent = btn.__rfrecLabel; }, 700);
      }
      // Legacy path for contexts without a usable async clipboard (non-secure
      // origins have no navigator.clipboard; writeText can also reject on an
      // unfocused document). The flash reports execCommand's actual result:
      // the button must not claim "copied" when nothing was.
      function legacyCopy() {
        var ok = false;
        try {
          var ta = doc.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed"; ta.style.opacity = "0";
          ourTransientHost().appendChild(ta);
          ta.select();
          ok = !!(doc.execCommand && doc.execCommand("copy"));
          ta.remove();
        } catch (e) { ok = false; }
        flash(ok ? "copied" : "copy failed");
      }
      try {
        if (global.navigator.clipboard) {
          var p = global.navigator.clipboard.writeText(text);
          if (p && typeof p.then === "function") {
            p.then(function () { flash("copied"); }, legacyCopy);
            return;
          }
        }
        legacyCopy();
      } catch (e) { legacyCopy(); }
    }
    // Our own transient DOM helpers (download anchor, import file input) are
    // parented to the PANEL, never to documentElement: their synthetic .click()
    // reaches the document capture listener like any other click, and only
    // `inOurUI()` keeps it out of the recording. Parented elsewhere, every
    // export would append a bogus step to the recording (caught live: the
    // download anchor was recorded as `Click body > a:nth-of-type(1)`).
    function ourTransientHost() {
      return doc.getElementById("__rfrecPanel") || doc.documentElement;
    }
    // Dependency-free file download via a Blob anchor click. A failure
    // (Blob/createObjectURL blocked by a strict CSP or sandbox) must not
    // break the page: it is surfaced in the hint line instead.
    function download(text, filename) {
      try {
        var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = doc.createElement("a");
        a.href = url; a.download = filename; a.style.display = "none";
        ourTransientHost().appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) {
        if (panel) panel.setHint("Download failed (" + filename + "): " + String((e && e.message) || e));
      }
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
      // Copy, never mutate what bestLocator returned.
      var best = locators.bestLocator(el, doc);
      var cands = best.candidates;
      return {
        selector: best.selector,
        strategy: best.strategy,
        candidates: cands,
        name: locators.accName(el, doc).slice(0, 40),
        // Anchored CSS path fallback (always the last candidate): stored on
        // every step so non-Playwright emitters (SeleniumLibrary) can translate
        // steps whose winning selector uses an engine they lack (role=/text=).
        css: cands && cands.length ? cands[cands.length - 1].selector : null,
      };
    }
    function stepFields(type, best, extra) {
      var step = { type: type, locator: best.selector, strategy: best.strategy,
                   name: best.name, css: best.css };
      for (var k in (extra || {})) step[k] = extra[k];
      return step;
    }
    // Password / payment / OTP detection lives in the pure core (unit-tested
    // there); returns the placeholder to record instead, or null.
    function sensitiveMask(t) { return stepsCore.sensitiveMask(t); }

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
    function onMove(event) {
      if (replaying) return;                          // keep the replay highlight stable
      lastEvt = event; if (!raf) raf = global.requestAnimationFrame(paint);
    }

    // ---- click: capture (inspect) or record (step) -------------------------
    // The floating menu closes itself on MOUSEDOWN (panel.js onAway); by the
    // time the paired click event reaches us, isOpen() is already false: so
    // the dismissal is remembered here and the click that follows is swallowed
    // instead of being recorded/captured as a spurious step.
    var menuDismissedAt = 0;
    function onMouseDown(event) {
      if (replaying) return;
      if (menu && menu.isOpen() && !menu.contains(event.target)) menuDismissedAt = Date.now();
    }
    function onClick(event) {
      if (replaying) return;                          // never record replayed events
      if (inOurUI(event.target)) return;              // panel/menu handle their own clicks
      if (menuDismissedAt && Date.now() - menuDismissedAt < 1000) {
        menuDismissedAt = 0;
        return;                                       // this click only dismissed the menu
      }
      if (menu && menu.isOpen()) { menu.close(); return; }
      var target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (!target) return;
      if (recording) {
        var tag = target.tagName ? target.tagName.toLowerCase() : "";
        var type = String((target.getAttribute && target.getAttribute("type")) || "").toLowerCase();
        if (tag === "input" && (type === "checkbox" || type === "radio")) return; // change handles those
        var best = bestFor(target);
        addStep(stepFields("click", best, { t: Date.now() }));  // t: dedup window for deliberate repeats
        return;                                       // never block the app while recording
      }
      // capture mode: inspection only, swallow the click
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
      if (replaying) return;                          // never record replayed events
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
        addStep(stepFields("click", best, { t: Date.now() }));
        return;
      }
      // File inputs have no replayable value (C:\fakepath\...) and assigning
      // one at replay time throws: a real upload needs Upload File By
      // Selector written by hand, so nothing useful can be recorded here.
      if (tag === "input" && type === "file") return;
      if ((tag === "input" || tag === "textarea") && "value" in t) {
        best = bestFor(t);
        // Sensitive values (password / payment / OTP) never reach the
        // export/clipboard/sessionStorage in clear text.
        var value = sensitiveMask(t) || t.value;
        addStep(stepFields("fill", best, { value: value }));
      }
    }

    // ---- keydown: Enter/Tab presses, Escape stops --------------------------
    function onKey(event) {
      if (replaying) {                                // never record replayed events
        if (event.key === "Escape") cancelReplay("Replay cancelled.");
        return;
      }
      if (event.key === "Escape") {
        if (menu && menu.isOpen()) return;            // menu's own Escape closes it first
        var t = event.target;
        if (inOurUI(t) && t && t.tagName === "INPUT") return; // inline editors handle their own Escape
        stop();
        return;
      }
      if (!recording || inOurUI(event.target)) return;
      if (event.key === "Enter" || event.key === "Tab") {
        // Deferred one tick ON PURPOSE: a field's `change` fires on blur, i.e.
        // AFTER this keydown (Tab moves focus away, Enter submits). Recording
        // the key immediately put it BEFORE the fill it actually followed:
        // replaying that pressed Enter on an empty field, then filled it.
        // Caught by the first visible-browser demo run.
        // Kept in `pendingPress` so onBeforeUnload can flush it if Enter
        // triggers a full-page submit and the page unloads before the tick.
        pendingPress = { type: "press", key: event.key };
        setTimeout(function () {
          if (pendingPress) { var p = pendingPress; pendingPress = null; addStep(p); }
        }, 0);
      }
    }
    var pendingPress = null;

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
      if (replaying) return;
      if (!recording || inOurUI(event.target)) return; // default context menu outside record mode
      var target = event.target && event.target.nodeType === 1 ? event.target : null;
      if (!target) return;
      event.preventDefault(); event.stopPropagation();
      var best = bestFor(target);
      var text = locators.collapse(target.textContent || "").slice(0, 200);
      var value = ("value" in target) ? String(target.value) : "";
      var mask = sensitiveMask(target);
      if (mask) value = mask;
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
    function onNav() { if (recording && !replaying) addStep({ type: "wait-load" }); }
    function onBeforeUnload() {
      if (!recording || replaying) return;
      if (pendingPress) { stepsCore.addStep(steps, pendingPress); pendingPress = null; } // the Enter that submitted
      stepsCore.addStep(steps, { type: "wait-load" });
      saveSteps();
    }

    // ---- in-panel replay ---------------------------------------------------
    // Steps replay sequentially (REPLAY_DELAY ms apart) against the live DOM:
    // synthetic events for actions, resolve.evalAssertion for assertions.
    // A failure stops the run, marks the row red and names the reason.
    function synthMouse(el, type) {
      var ev;
      try { ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: global }); }
      catch (e) { ev = doc.createEvent("MouseEvents"); ev.initEvent(type, true, true); }
      el.dispatchEvent(ev);
    }
    function synthEvent(el, type) {
      var ev;
      try { ev = new Event(type, { bubbles: true }); }
      catch (e) { ev = doc.createEvent("HTMLEvents"); ev.initEvent(type, true, false); }
      el.dispatchEvent(ev);
    }
    function synthKey(el, type, key) {
      var ev;
      try { ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: key }); }
      catch (e) { ev = doc.createEvent("Events"); ev.initEvent(type, true, true); ev.key = key; }
      el.dispatchEvent(ev);
    }
    function tryFocus(el) {
      try { if (el && typeof el.focus === "function") el.focus(); } catch (e) { /* ignore */ }
    }
    // Assign through the NATIVE prototype setter: React's controlled inputs
    // track the last value set via the native accessor and dedupe `input`
    // events whose value "didn't change": a plain el.value = x is exactly
    // what gets deduped, so fills silently no-oped on React apps.
    function setNativeValue(el, value) {
      var proto = null;
      try {
        if (global.HTMLInputElement && el instanceof global.HTMLInputElement) proto = global.HTMLInputElement.prototype;
        else if (global.HTMLTextAreaElement && el instanceof global.HTMLTextAreaElement) proto = global.HTMLTextAreaElement.prototype;
      } catch (e) { /* duck-typed doc in tests */ }
      if (proto) {
        try {
          var desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) { desc.set.call(el, value); return; }
        } catch (e) { /* fall through */ }
      }
      el.value = value;
    }
    function highlightElement(el, label) {
      if (!overlay || !el || typeof el.getBoundingClientRect !== "function") return;
      try {
        var r = el.getBoundingClientRect();
        overlay.show({ left: r.left, top: r.top, width: r.width, height: r.height }, label);
        overlay.flash();
      } catch (e) { /* detached */ }
    }
    // One planned step against the live DOM. Returns { ok, reason? } or "skip".
    function runPlanned(st, plan) {
      switch (plan.action) {
        case "marker": case "noop": return "skip";
        case "wait": return { ok: true };            // the pause IS the step (see next())
        case "press": {
          var target = doc.activeElement || doc.body;
          synthKey(target, "keydown", plan.key);
          synthKey(target, "keyup", plan.key);
          return { ok: true };
        }
        case "assert": {
          var res = resolveCore.evalAssertion(st, doc);
          if (res.element) highlightElement(res.element, stepLine(st));
          return res.ok ? { ok: true } : { ok: false, reason: res.reason };
        }
      }
      var el = resolveCore.resolveSelector(st.locator, doc);
      if (!el) return { ok: false, reason: "element not found: " + st.locator };
      highlightElement(el, stepLine(st));
      switch (plan.action) {
        case "click":
          // focus between down and up, like a native click: so a recorded
          // press that follows lands on this element, not on <body>
          synthMouse(el, "mousedown");
          tryFocus(el);
          synthMouse(el, "mouseup"); synthMouse(el, "click");
          break;
        case "fill":
          tryFocus(el);
          setNativeValue(el, plan.value);
          synthEvent(el, "input"); synthEvent(el, "change");
          break;
        case "select": {
          var oi = resolveCore.findOptionIndex(el, plan.label);
          if (oi < 0) return { ok: false, reason: 'no option labelled "' + plan.label + '" in ' + st.locator };
          el.selectedIndex = oi;
          synthEvent(el, "input"); synthEvent(el, "change");
          break;
        }
        case "setChecked":
          el.checked = plan.checked;
          synthEvent(el, "change");
          break;
        default:
          return { ok: false, reason: "unsupported action: " + plan.action };
      }
      return { ok: true };
    }
    function cancelReplay(message) {
      if (!replaying) return false;
      replaying = false;
      if (playTimer) { global.clearTimeout(playTimer); playTimer = 0; }
      if (panel) { panel.setRowStatus(-1, null); if (message) panel.setHint(message); }
      if (overlay) overlay.hide();
      return true;
    }
    function play() {
      if (replaying || !steps.length || !panel) return;
      replaying = true;
      var i = 0;
      var executed = 0;
      panel.setHint("Replaying…  Esc cancels.");
      function fail(idx, reason) {
        replaying = false; playTimer = 0;
        panel.setRowStatus(idx, "fail");
        panel.setHint("Replay FAILED at step " + (idx + 1) + ": " + reason);
      }
      function next() {
        playTimer = 0;
        if (!replaying) return;                       // cancelled or stopped
        if (i >= steps.length) {
          replaying = false;
          panel.setRowStatus(-1, null);
          panel.setHint("replay OK (" + executed + " steps)");
          if (overlay) overlay.hide();
          return;
        }
        var idx = i++;
        var st = steps[idx];
        var plan = resolveCore.planStep(st);
        panel.setRowStatus(idx, plan.action === "marker" ? null : "active");
        var result;
        try { result = runPlanned(st, plan); }
        catch (e) { fail(idx, String((e && e.message) || e)); return; }
        if (result && result.ok === false) { fail(idx, result.reason || "step failed"); return; }
        if (result !== "skip") executed++;
        var delay = plan.action === "marker" ? 0
          : plan.action === "wait" ? plan.ms : REPLAY_DELAY;
        playTimer = global.setTimeout(next, delay);
      }
      next();
    }

    // ---- export ------------------------------------------------------------
    function testName() { return (panel && panel.getTestName() || "").trim() || DEFAULT_NAME; }
    function fileSlug() {
      return testName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recorded";
    }
    function exportAs(format) {
      var opts = { testName: testName(), url: startUrl(), steps: steps };
      // Emission adapter: Browser library by default, SeleniumLibrary on demand
      // (locator translation lives in emit_selenium.js: same export shapes).
      var target = (format.indexOf("selenium-") === 0) ? emitSelenium : emit;
      format = format.replace(/^selenium-/, "");
      if (format === "resource-pair") {
        var pair = target.buildResourcePair(opts);
        download(pair.resource, pair.resourceName);
        // Chrome's multiple-download protection targets same-task downloads:
        // spacing the second one out gives the user a visible prompt instead
        // of a silently missing .robot, and the hint says to expect 2 files.
        setTimeout(function () { download(pair.suite, fileSlug() + ".robot"); }, 350);
        copy(pair.suite);
        if (panel) {
          panel.setHint("Exporting 2 files (.resource + .robot): allow multiple downloads if the browser asks.");
        }
      } else if (format === "report") {
        // Self-contained HTML documentation page (phrase + exact RF line per
        // step, one chapter per scenario): documentation, never a test.
        var page = emitReport.buildReport(opts, target);
        download(page, fileSlug() + "-report.html");
        copy(page);
      } else if (format === "plan") {
        var plan = emitReport.buildPlan(opts);
        download(plan, fileSlug() + "-plan.md");
        copy(plan);
      } else if (format === "istqb") {
        // ISTQB test plan + test cases (ported back from SAPFX): human table
        // per scenario plus a normalized framework-neutral replay YAML block.
        var istqb = emitIstqb.buildIstqb(opts, target);
        download(istqb, fileSlug() + "-istqb.md");
        copy(istqb);
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
        { label: "Download HTML report (documentation)", onPick: function () { exportAs("report"); } },
        { label: "Download Markdown test plan (draft)", onPick: function () { exportAs("plan"); } },
        { label: "Download ISTQB test plan (.istqb.md)", onPick: function () { exportAs("istqb"); } },
        { label: "Copy step body to clipboard", onPick: function () { exportAs("body"); } },
        { label: "Import .robot…", onPick: importRobot },
      ]);
    }

    // ---- .robot re-import --------------------------------------------------
    // Reads an exported Browser-library suite back into the step list
    // (REPLACES the current steps). Unparseable lines are counted in the
    // hint: parseSuite surfaces them, it never drops them silently.
    function importRobot() {
      var input = doc.createElement("input");
      input.type = "file";
      input.accept = ".robot,.txt,text/plain";
      input.style.display = "none";
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        input.remove();
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var parsed = emit.parseSuite(String(reader.result || ""));
          steps = parsed.steps;
          if (parsed.testName) {
            saveName(parsed.testName);
            if (panel) panel.setTestName(parsed.testName);
          }
          if (parsed.url) {
            try { global.sessionStorage.setItem(URL_KEY, parsed.url); } catch (e) { persistWarn(e); }
          }
          saveSteps();
          renderPanel();
          if (panel) {
            panel.setHint("Imported " + steps.length + " step(s) from " + file.name +
              (parsed.skipped.length ? ", skipped " + parsed.skipped.length + " unparseable line(s)" : "") + ".");
          }
        };
        reader.readAsText(file);
      });
      ourTransientHost().appendChild(input);   // see ourTransientHost: never record our own click
      input.click();
    }

    // ---- step editing / scenario markers -----------------------------------
    // Inline edit commit (panel double-click): value-bearing steps update the
    // value, press updates the key, markers their name, everything else the
    // locator (locator edits invalidate the recorded strategy/CSS fallback).
    function editStep(i, text) {
      var st = steps[i];
      if (!st) return;
      if ("value" in st) {
        st.value = (st.type === "assert-count" && /^\d+$/.test(text.trim())) ? Number(text.trim()) : text;
      } else if (st.type === "press") {
        st.key = text;
      } else if (st.type === "test") {
        st.name = text;
      } else {
        st.locator = text;
        st.strategy = "edited";
        delete st.css;
      }
      saveSteps(); renderPanel();
    }

    // ---- recording state ---------------------------------------------------
    function notifyState() {
      try { doc.dispatchEvent(new CustomEvent("__rfrecState", { detail: recording })); } catch (e) { /* ignore */ }
    }
    function setRecording(on) {
      if (!running && on) start();
      recording = !!on;
      saveRecording();
      if (on) rememberUrl();
      if (panel) {
        panel.setRecording(recording);
        panel.setHint(recording ? HINT_RECORD : HINT_CAPTURE);
      }
      renderPanel();
      notifyState();
    }

    // Counts iframes whose document this frame cannot touch (cross-origin or
    // sandboxed): each one is a recording blind spot for this bundle instance.
    function crossOriginFrameCount() {
      var n = 0;
      try {
        var frames = doc.querySelectorAll("iframe");
        for (var i = 0; i < frames.length; i++) {
          try { if (!frames[i].contentDocument) n++; } catch (e) { n++; }
        }
      } catch (e) { /* ignore */ }
      return n;
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
        onPlay: play,
        onAddTest: function (name) { addStep({ type: "test", name: name }); },
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
        onEditStep: editStep,
        onNameInput: saveName,
      });
      panel.setTestName(loadName());
      panel.setHint(HINT_CAPTURE);
      // Cross-origin iframes are invisible to this bundle's listeners (the
      // console snippet only sees its own frame; the extension injects
      // allFrames, one panel per frame): warn in the TOP frame instead of
      // silently missing their steps. Ported from the SAPFX web recorder.
      if (global.top === global.self) panel.setFrameWarn(crossOriginFrameCount());
      renderPanel();
      doc.addEventListener("mousemove", onMove, true);
      doc.addEventListener("mousedown", onMouseDown, true);
      doc.addEventListener("click", onClick, true);
      doc.addEventListener("change", onChange, true);
      doc.addEventListener("keydown", onKey, true);
      doc.addEventListener("contextmenu", onContextMenu, true);
      global.addEventListener("hashchange", onNav, true);
      global.addEventListener("popstate", onNav, true);
      global.addEventListener("beforeunload", onBeforeUnload, true);
      if (loadRecording()) setRecording(true);   // recording survives navigation + re-injection
      console.info("[rf-web-recorder] Ready. Hover to highlight, click to capture, rec to record, " +
        "play to replay, +test to start a new test case. " +
        "Right-click while recording opens the assertion menu. Esc stops.");
    }
    function stop() {
      if (!running) return;
      cancelReplay(null);
      running = false;
      recording = false;
      saveRecording();                            // an explicit stop does not auto-resume later
      doc.removeEventListener("mousemove", onMove, true);
      doc.removeEventListener("mousedown", onMouseDown, true);
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
      console.info("[rf-web-recorder] stopped (steps kept: start again to resume).");
    }

    return {
      start: start,
      stop: stop,
      isRunning: function () { return running; },
      toggleRecording: function () { setRecording(!recording); },
      setRecording: setRecording,
      isRecording: function () { return recording; },
      play: play,
      isReplaying: function () { return replaying; },
      exportAs: exportAs,
    };
  }

  CORE.recorder = { create: createRecorder };
})(typeof window !== "undefined" ? window : globalThis);

// ---- src/main.js ---------------------------------------------------------
/*
 * rf-web-recorder: main.js
 *
 * Entry point: bootstraps the public `window.__RFREC` API and auto-starts
 * capture mode on injection. Idempotent: the bundle wrapper re-calls
 * `__RFREC.start()` instead of re-installing when pasted twice.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE || {};
  if (global.__RFREC) { global.__RFREC.start(); return; }

  var instance = CORE.recorder.create();

  global.__RFREC = {
    version: "0.4.1",
    start: instance.start,
    stop: instance.stop,
    isRunning: instance.isRunning,
    toggleRecording: instance.toggleRecording,
    setRecording: instance.setRecording,
    isRecording: instance.isRecording,
    play: instance.play,              // in-panel replay of the recorded steps
    isReplaying: instance.isReplaying,
    exportAs: instance.exportAs,      // "robot" | "resource-pair" | "body" (+ "selenium-" prefixes)
    core: CORE,                       // locator/step/emit/resolve internals for power users
  };

  instance.start();
})(typeof window !== "undefined" ? window : globalThis);
})();
