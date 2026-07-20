/*
 * Service worker (MV3). Two jobs:
 *   1. Toolbar badge — reflects the recording state relayed by bridge.js
 *      (REC = recording).
 *   2. Keyboard shortcut (Alt+Shift+U, command "toggle-record") — injects the
 *      recorder if absent (bridge ISOLATED + recorder MAIN, allFrames) and
 *      toggles recording without opening the popup.
 *
 * A user gesture (toolbar click or keyboard command) grants `activeTab` on the
 * current tab, so no host permissions are needed. Chromium (MV3 service
 * worker + scripting world MAIN, Chrome 111+) is the supported target; the
 * `browser` fallback below is defensive only — Firefox would additionally
 * need background.scripts and browser_specific_settings to run this.
 */
const api = (typeof browser !== "undefined") ? browser : chrome;

function setBadge(tabId, recording) {
  if (tabId == null) return;
  api.action.setBadgeText({ tabId, text: recording ? "REC" : "" });
  if (recording) api.action.setBadgeBackgroundColor({ tabId, color: "#d0021b" });
}

// Badge driven by the in-page recorder (panel rec button, shortcut...) via bridge.js.
api.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "rfrecState" && sender.tab) {
    setBadge(sender.tab.id, msg.recording);
  }
});

api.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-record") return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    // Read the current state BEFORE (re-)injecting, then set ONE explicit
    // target state on every frame: per-frame toggles would drift frames
    // anti-phase (one starts recording as another stops).
    const probes = await api.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true }, world: "MAIN",
      func: () => !!(window.__RFREC && window.__RFREC.isRecording()),
    });
    const anyRecording = (probes || []).some((p) => p && p.result);
    // Always inject, allFrames: both files are idempotent, so already-loaded
    // frames no-op and iframes added since the last injection get instrumented
    // too (bridge ISOLATED for the badge, recorder bundle in MAIN).
    await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["bridge.js"] });
    await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: "MAIN", files: ["recorder.js"] });
    await api.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true }, world: "MAIN",
      args: [!anyRecording],
      func: (on) => { if (window.__RFREC) window.__RFREC.setRecording(on); },
    });
  } catch (e) {
    // chrome://, the Web Store, the PDF viewer...: injection is not allowed
    // there — say so on the badge instead of dying as an unhandled rejection.
    api.action.setBadgeText({ tabId: tab.id, text: "n/a" });
    setTimeout(() => api.action.setBadgeText({ tabId: tab.id, text: "" }), 1500);
  }
});
