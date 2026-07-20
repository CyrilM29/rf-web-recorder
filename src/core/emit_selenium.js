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

  // Selenium key names are UPPER_SNAKE: camel-case DOM keys split on the case
  // boundary (ArrowDown -> ARROW_DOWN) — a bare toUpperCase() would emit the
  // invalid ARROWDOWN for any key set through the panel's step editor.
  function seleniumKeyName(key) {
    return KEY_NAMES[key] ||
      String(key || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  }

  // One step -> one SeleniumLibrary keyword line (or a comment, never a loss).
  // `esc` (default rfEscape) — see emit_browser.emitStep.
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
  // first one — later tests continue the same session.
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
  function slugText(text) {
    return String(text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "").slice(0, 24).replace(/_+$/g, "");
  }
  function slugOf(step, fallback) {
    // Same rule as emit_browser: an empty/numeric slug names the value, not the
    // target — fall back to the locator before the generic ELEMENT_<n>.
    var s = slugText(step.name || step.value);
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

  function buildResourcePair(opts) {
    opts = opts || {};
    var steps = opts.steps || [];
    var resourceName = opts.resourceName || "recorded_keywords.resource";

    // 1. distinct TRANSLATED locators -> ${LOC_<N>_<SLUG>} variables
    // Object.create(null): see emit_browser — a locator spelled like an
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
