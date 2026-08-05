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
