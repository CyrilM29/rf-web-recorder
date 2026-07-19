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
 *       A step whose recorded CSS-path fallback differs from its winning
 *       locator additionally gets a ${LOC_<N>_<SLUG>_FALLBACK} variable and an
 *       IF/ELSE keyword body that falls back to the CSS path (with a WARN log)
 *       when the primary locator no longer matches.
 *
 * `test` marker steps ({ type: "test", name }) split every export shape into
 * multiple *** Test Cases *** entries; the session bootstrap (New Browser /
 * New Page) is emitted only in the FIRST test — later tests continue the same
 * browser session.
 *
 * parseSuite(text) is the inverse of buildSuite: it reads an exported .robot
 * back into { testName, url, steps, skipped } — unparseable lines land in
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
      case "test": return ["# --- Test: " + (step.name || "Test") + " ---"]; // scenario marker (comment in a body paste)
      default: return [];
    }
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
    var varByLocator = {};
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
    var keywordByShape = {}; // "<type> <locator>" -> name
    var usedNames = {};
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
        // Variable references pass through rfEscape untouched, so emitStep is
        // reused verbatim to build the keyword body.
        function actionLine(ref) {
          return emitStep({ type: st.type, locator: ref,
                            value: shape.arg ? argRef : st.value, key: st.key })[0];
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
      suiteCalls.push(shape.arg ? kwName + SEP + rfEscape(st.value) : kwName);
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
  //   - anything else unparseable lands in `skipped` — never silently dropped.
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
      if (!/^\s/.test(line)) {                       // unindented: a test-case name
        if (testName === null) testName = line.trim();
        else steps.push({ type: "test", name: line.trim() });
        continue;
      }
      var body = line.replace(/^\s+/, "");
      if (body.charAt(0) === "#") continue;          // comments carry no step
      var tokens = body.split(/ {2,}/);
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
    rfUnescape: rfUnescape,
    emitStep: emitStep,
    emitBody: emitBody,
    splitScenarios: splitScenarios,
    scenarioName: scenarioName,
    buildSuite: buildSuite,
    buildResourcePair: buildResourcePair,
    parseSuite: parseSuite,
  };
});
