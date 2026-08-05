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
