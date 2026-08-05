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
