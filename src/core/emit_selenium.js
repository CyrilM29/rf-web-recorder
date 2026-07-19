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
