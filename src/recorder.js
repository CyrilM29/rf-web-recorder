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
