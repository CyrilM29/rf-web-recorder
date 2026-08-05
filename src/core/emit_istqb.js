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
