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
