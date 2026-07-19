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
