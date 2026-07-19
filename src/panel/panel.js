/*
 * rf-web-recorder — panel/panel.js
 *
 * Floating in-page UI: draggable/collapsible panel with rec/play/+test/export/
 * clear/stop buttons, an editable test name, the ordered step list (move
 * up/down, delete, double-click inline edit, scenario-marker rows, replay row
 * status), a hover highlight overlay, and a small floating menu used both for
 * the export-format picker and the right-click assertion menu.
 *
 * Browser-only (touches the DOM). Ported from the author's SAPFX recorder
 * panel (Apache-2.0) and generalized — see NOTICE.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE = global.__RFREC_CORE || {};

  var ACCENT = "#4f46e5";   // indigo — panel identity color
  var REC_RED = "#d0021b";

  // ---- hover highlight overlay ---------------------------------------------
  function createOverlay(doc) {
    var box = doc.createElement("div");
    box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;" +
      "border:2px solid " + ACCENT + ";background:rgba(79,70,229,0.10);border-radius:2px;" +
      "display:none;transition:all .03s linear;";
    var chip = doc.createElement("div");
    chip.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;" +
      "background:" + ACCENT + ";color:#fff;font:12px/1.4 monospace;padding:2px 6px;" +
      "border-radius:3px;white-space:nowrap;display:none;max-width:80vw;overflow:hidden;" +
      "text-overflow:ellipsis;";
    doc.documentElement.appendChild(box);
    doc.documentElement.appendChild(chip);
    return {
      show: function (rect, label) {
        box.style.left = rect.left + "px"; box.style.top = rect.top + "px";
        box.style.width = rect.width + "px"; box.style.height = rect.height + "px";
        box.style.display = "block";
        chip.textContent = label;
        var top = rect.top - 20;
        if (top < 0) top = rect.top + rect.height + 2;
        chip.style.left = rect.left + "px"; chip.style.top = top + "px";
        chip.style.display = "block";
      },
      hide: function () { box.style.display = "none"; chip.style.display = "none"; },
      flash: function () {
        var orig = box.style.background;
        box.style.background = "rgba(22,163,74,0.25)";
        setTimeout(function () { box.style.background = orig; }, 150);
      },
      destroy: function () { box.remove(); chip.remove(); },
    };
  }

  // ---- floating menu (export picker + assertion context menu) --------------
  // Closes on Escape or click-away; only one open at a time.
  function createMenu(doc) {
    var menuEl = null;
    function close() {
      if (!menuEl) return;
      doc.removeEventListener("mousedown", onAway, true);
      doc.removeEventListener("keydown", onKey, true);
      menuEl.remove(); menuEl = null;
    }
    function onAway(e) { if (menuEl && !menuEl.contains(e.target)) close(); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    function open(x, y, items) {
      close();
      menuEl = doc.createElement("div");
      menuEl.className = "__rfrecMenu";
      menuEl.style.cssText = "position:fixed;z-index:2147483647;background:#fff;color:#222;" +
        "border:1px solid #b3b3b3;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
        "font:12px/1.5 -apple-system,Segoe UI,sans-serif;min-width:180px;overflow:hidden;padding:4px 0;";
      items.forEach(function (item) {
        var row = doc.createElement("div");
        row.textContent = item.label;
        row.style.cssText = "padding:5px 12px;cursor:pointer;white-space:nowrap;";
        row.addEventListener("mouseenter", function () { row.style.background = "#eef2ff"; });
        row.addEventListener("mouseleave", function () { row.style.background = ""; });
        row.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          close();
          try { item.onPick(); } catch (err) { /* handler error must not break the page */ }
        });
        menuEl.appendChild(row);
      });
      doc.documentElement.appendChild(menuEl);
      // keep on-screen
      var r = menuEl.getBoundingClientRect();
      var left = Math.min(x, (global.innerWidth || 9999) - r.width - 8);
      var top = Math.min(y, (global.innerHeight || 9999) - r.height - 8);
      menuEl.style.left = Math.max(0, left) + "px";
      menuEl.style.top = Math.max(0, top) + "px";
      doc.addEventListener("mousedown", onAway, true);
      doc.addEventListener("keydown", onKey, true);
    }
    return { open: open, close: close, isOpen: function () { return !!menuEl; },
             contains: function (node) { return !!(menuEl && node && menuEl.contains(node)); } };
  }

  // ---- main panel ----------------------------------------------------------
  // handlers: onToggleRec(), onPlay(), onAddTest(name), onExport(anchorRect),
  //           onClear(), onStop(), onMoveStep(i, delta), onRemoveStep(i),
  //           onEditStep(i, text), onNameInput(value)
  function createPanel(doc, handlers) {
    var panel = doc.createElement("div");
    panel.id = "__rfrecPanel";
    // 470px: the header row carries 7 controls (collapse/rec/play/+test/export/
    // clear/stop) — at 400px it wrapped onto two lines and pushed `stop` under
    // the title (seen in the first recorded demo).
    panel.style.cssText = "position:fixed;z-index:2147483647;right:12px;bottom:12px;" +
      "width:470px;max-height:55vh;display:flex;flex-direction:column;background:#fff;" +
      "border:1px solid #b3b3b3;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
      "font:12px/1.45 -apple-system,Segoe UI,sans-serif;color:#222;overflow:hidden;";

    var head = doc.createElement("div");
    head.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 10px;" +
      "background:" + ACCENT + ";color:#fff;font-weight:600;cursor:move;";
    var dot = doc.createElement("span");   // blinking recording indicator
    dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:" + REC_RED +
      ";display:none;flex:0 0 auto;box-shadow:0 0 4px " + REC_RED + ";";
    var title = doc.createElement("span");
    // nowrap + ellipsis: the title must never push the buttons onto a 2nd row
    title.style.cssText = "flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    var btnCollapse = doc.createElement("button");
    var btnRec = doc.createElement("button");
    var btnPlay = doc.createElement("button");
    var btnAddTest = doc.createElement("button");
    var btnExport = doc.createElement("button");
    var btnClear = doc.createElement("button");
    var btnClose = doc.createElement("button");
    [btnCollapse, btnRec, btnPlay, btnAddTest, btnExport, btnClear, btnClose].forEach(function (b) {
      b.style.cssText = "border:1px solid #fff;background:transparent;color:#fff;" +
        "border-radius:4px;cursor:pointer;font:11px monospace;padding:2px 6px;";
    });
    btnCollapse.textContent = "▾";  // expanded marker
    btnRec.textContent = "rec"; btnPlay.textContent = "play";
    btnAddTest.textContent = "+test"; btnExport.textContent = "export";
    btnClear.textContent = "clear"; btnClose.textContent = "stop";
    btnPlay.title = "Replay the recorded steps on this page";
    btnAddTest.title = "Start a new test case (scenario marker)";
    head.appendChild(dot); head.appendChild(title); head.appendChild(btnCollapse);
    head.appendChild(btnRec); head.appendChild(btnPlay); head.appendChild(btnAddTest);
    head.appendChild(btnExport); head.appendChild(btnClear); head.appendChild(btnClose);

    var nameRow = doc.createElement("div");
    nameRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid #eee;";
    var nameLbl = doc.createElement("span"); nameLbl.textContent = "Test:"; nameLbl.style.color = "#666";
    var nameInput = doc.createElement("input");
    nameInput.type = "text";
    nameInput.style.cssText = "flex:1;font:11px monospace;border:1px solid #ccc;border-radius:3px;padding:2px 5px;";
    nameInput.addEventListener("input", function () { handlers.onNameInput(nameInput.value); });
    nameRow.appendChild(nameLbl); nameRow.appendChild(nameInput);

    var list = doc.createElement("div");
    list.style.cssText = "overflow:auto;padding:6px;";
    var hint = doc.createElement("div");
    hint.style.cssText = "padding:6px 10px;color:#666;border-top:1px solid #eee;";
    panel.appendChild(head); panel.appendChild(nameRow); panel.appendChild(list); panel.appendChild(hint);
    doc.documentElement.appendChild(panel);

    // +test inline prompt: a temporary one-line input above the step list;
    // Enter commits the next scenario's name, Escape cancels.
    var scenarioRow = null;
    function promptScenario() {
      if (scenarioRow) {
        var existing = scenarioRow.lastChild;
        if (existing && existing.focus) existing.focus();
        return;
      }
      scenarioRow = doc.createElement("div");
      scenarioRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid #eee;";
      var lbl = doc.createElement("span");
      lbl.textContent = "New test:"; lbl.style.color = "#666";
      var inp = doc.createElement("input");
      inp.type = "text";
      inp.placeholder = "next scenario name (Enter = add, Esc = cancel)";
      inp.style.cssText = "flex:1;font:11px monospace;border:1px solid " + ACCENT + ";border-radius:3px;padding:2px 5px;";
      function closePrompt() { if (scenarioRow) { scenarioRow.remove(); scenarioRow = null; } }
      inp.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") {
          var name = inp.value.trim();
          closePrompt();
          if (name) handlers.onAddTest(name);
        } else if (e.key === "Escape") { closePrompt(); }
      });
      scenarioRow.appendChild(lbl); scenarioRow.appendChild(inp);
      panel.insertBefore(scenarioRow, list);
      inp.focus();
    }

    var styleEl = doc.createElement("style");
    styleEl.textContent = "@keyframes __rfrecBlink{50%{opacity:.25}}";
    doc.documentElement.appendChild(styleEl);

    // collapse (header only)
    var collapsed = false;
    function setCollapsed(c) {
      collapsed = c;
      nameRow.style.display = c ? "none" : "";
      list.style.display = c ? "none" : "";
      hint.style.display = c ? "none" : "";
      btnCollapse.textContent = c ? "▸" : "▾";
    }
    btnCollapse.addEventListener("click", function () { setCollapsed(!collapsed); });

    // drag by the header (switches right/bottom anchoring to left/top)
    var drag = null;
    function onDragDown(e) {
      if (e.target.tagName === "BUTTON") return;
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      panel.style.right = "auto"; panel.style.bottom = "auto";
      panel.style.left = r.left + "px"; panel.style.top = r.top + "px";
      e.preventDefault();
    }
    function onDragMove(e) {
      if (!drag) return;
      panel.style.left = (e.clientX - drag.dx) + "px";
      panel.style.top = (e.clientY - drag.dy) + "px";
    }
    function onDragUp() { drag = null; }
    head.addEventListener("mousedown", onDragDown, true);
    doc.addEventListener("mousemove", onDragMove, true);
    doc.addEventListener("mouseup", onDragUp, true);

    btnRec.addEventListener("click", function () { handlers.onToggleRec(); });
    btnPlay.addEventListener("click", function () { handlers.onPlay(); });
    btnAddTest.addEventListener("click", function () { promptScenario(); });
    btnExport.addEventListener("click", function () {
      handlers.onExport(btnExport.getBoundingClientRect());
    });
    btnClear.addEventListener("click", function () { handlers.onClear(); });
    btnClose.addEventListener("click", function () { handlers.onStop(); });

    function stepBtn(label, fn) {
      var b = doc.createElement("button");
      b.textContent = label;
      b.style.cssText = "margin-left:3px;border:1px solid #b3b3b3;background:#fff;cursor:pointer;" +
        "font:10px monospace;border-radius:3px;padding:0 4px;";
      b.addEventListener("click", fn);
      return b;
    }
    function strategyChip(strategy) {
      var chip = doc.createElement("span");
      chip.textContent = strategy || "?";
      chip.style.cssText = "flex:0 0 auto;font:9px monospace;color:" + ACCENT +
        ";border:1px solid " + ACCENT + ";border-radius:8px;padding:0 5px;";
      return chip;
    }

    var frameTag = (global.top !== global.self) ? " [iframe]" : "";

    // Double-click inline editor: swaps the row text for an input. Enter
    // commits through onEditStep (the recorder re-renders), Escape cancels.
    function editRow(row, txt, i) {
      var inp = doc.createElement("input");
      inp.type = "text";
      inp.value = row.__rfrecEditValue;
      inp.style.cssText = "flex:1;font:11px monospace;border:1px solid " + ACCENT +
        ";border-radius:3px;padding:1px 4px;min-width:0;";
      row.replaceChild(inp, txt);
      inp.focus(); inp.select();
      var done = false;
      function cancel() {
        if (done) return;
        done = true;
        try { row.replaceChild(txt, inp); } catch (e) { /* row already re-rendered */ }
      }
      inp.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") { done = true; handlers.onEditStep(i, inp.value); }
        else if (e.key === "Escape") cancel();
      });
      inp.addEventListener("blur", cancel);
    }

    // Replay row status: "active" (current step), "fail" (stopped here), null.
    var rowEls = [];
    function applyRowStatus(row, status) {
      if (status === "active") {
        row.style.outline = "2px solid " + ACCENT; row.style.outlineOffset = "-2px";
        row.style.background = row.__rfrecBg || "";
      } else if (status === "fail") {
        row.style.outline = "2px solid " + REC_RED; row.style.outlineOffset = "-2px";
        row.style.background = "#fdecea";
      } else {
        row.style.outline = ""; row.style.background = row.__rfrecBg || "";
      }
    }

    return {
      root: panel,
      setRecording: function (on) {
        btnRec.textContent = on ? "pause" : "rec";
        btnRec.style.background = on ? REC_RED : "transparent";
        dot.style.display = on ? "inline-block" : "none";
        dot.style.animation = on ? "__rfrecBlink 1s infinite" : "none";
      },
      setHint: function (text) { hint.textContent = text; },
      getTestName: function () { return nameInput.value; },
      setTestName: function (v) { nameInput.value = v; },
      // step rows: "N. <line>" + strategy chip + up/down/delete; scenario
      // markers render as a distinct "— Test: name —" row with delete only.
      // Double-click any row to edit it inline (value if the step carries
      // one, else key/name/locator).
      renderSteps: function (steps, lines, recording) {
        title.textContent = (recording ? "Recording" : "Steps") + " — " +
          steps.length + " step(s)" + frameTag;
        list.textContent = "";
        rowEls = [];
        steps.forEach(function (st, i) {
          var isMarker = st.type === "test";
          var row = doc.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 4px;border-bottom:1px solid #f0f0f0;";
          var txt = doc.createElement("span");
          txt.style.cssText = "flex:1;font:11px monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          if (isMarker) {
            txt.textContent = "— Test: " + (st.name || "?") + " —";
            txt.style.color = ACCENT; txt.style.fontWeight = "600";
            row.style.background = "#eef2ff";
          } else {
            txt.textContent = (i + 1) + ". " + lines[i];
            txt.title = lines[i] + " — double-click to edit";
          }
          row.__rfrecBg = row.style.background;
          var editable = ("value" in st) ? st.value
            : st.type === "press" ? st.key
            : isMarker ? st.name
            : st.locator;
          row.__rfrecEditValue = editable === undefined || editable === null ? "" : String(editable);
          txt.addEventListener("dblclick", function (e) {
            e.preventDefault(); e.stopPropagation();
            editRow(row, txt, i);
          });
          row.appendChild(txt);
          if (!isMarker) {
            if (st.strategy) row.appendChild(strategyChip(st.strategy));
            row.appendChild(stepBtn("↑", function () { handlers.onMoveStep(i, -1); }));
            row.appendChild(stepBtn("↓", function () { handlers.onMoveStep(i, 1); }));
          }
          row.appendChild(stepBtn("✕", function () { handlers.onRemoveStep(i); }));
          list.appendChild(row);
          rowEls.push(row);
        });
      },
      // replay feedback: mark row i "active"/"fail" (clears the others);
      // setRowStatus(-1, null) clears everything.
      setRowStatus: function (i, status) {
        for (var j = 0; j < rowEls.length; j++) {
          applyRowStatus(rowEls[j], j === i ? status : null);
        }
        if (status && rowEls[i] && typeof rowEls[i].scrollIntoView === "function") {
          try { rowEls[i].scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ }
        }
      },
      // capture rows: label + one copy button per candidate strategy
      renderCaptures: function (captures, copyFn) {
        title.textContent = "RF Web Recorder — " + captures.length + " captured" + frameTag;
        list.textContent = "";
        captures.forEach(function (rec, i) {
          var row = doc.createElement("div");
          row.style.cssText = "padding:5px 4px;border-bottom:1px solid #f0f0f0;";
          var lab = doc.createElement("div");
          lab.style.cssText = "color:" + ACCENT + ";font:11px monospace;margin-bottom:3px;" +
            "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          lab.textContent = (i + 1) + ". [" + rec.strategy + "] " + rec.label;
          lab.title = rec.selector;
          row.appendChild(lab);
          var bar = doc.createElement("div");
          rec.candidates.forEach(function (cand) {
            var b = doc.createElement("button");
            b.textContent = cand.strategy;
            b.style.cssText = "margin:0 4px 0 0;border:1px solid " + ACCENT + ";background:#fff;" +
              "color:" + ACCENT + ";border-radius:4px;cursor:pointer;font:11px monospace;padding:1px 7px;";
            b.addEventListener("click", function () { copyFn(cand.selector, b); });
            bar.appendChild(b);
          });
          row.appendChild(bar);
          list.appendChild(row);
        });
      },
      contains: function (node) {
        return !!(node && node.closest && node.closest("#__rfrecPanel"));
      },
      destroy: function () {
        doc.removeEventListener("mousemove", onDragMove, true);
        doc.removeEventListener("mouseup", onDragUp, true);
        panel.remove(); styleEl.remove();
      },
    };
  }

  CORE.panel = { createPanel: createPanel, createOverlay: createOverlay, createMenu: createMenu };
})(typeof window !== "undefined" ? window : globalThis);
