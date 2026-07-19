/*
 * Service worker (MV3). Two jobs:
 *   1. Toolbar badge — reflects the recording state relayed by bridge.js
 *      (REC = recording).
 *   2. Keyboard shortcut (Alt+Shift+U, command "toggle-record") — injects the
 *      recorder if absent (bridge ISOLATED + recorder MAIN, allFrames) and
 *      toggles recording without opening the popup.
 *
 * A user gesture (toolbar click or keyboard command) grants `activeTab` on the
 * current tab, so no host permissions are needed. `api` is `browser` on
 * Firefox, `chrome` on Chromium (cross-browser shim).
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
  // allFrames: apps embedded in iframes get their own recorder panel too
  // (cross-origin frames without host permissions are silently skipped).
  const probes = await api.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true }, world: "MAIN",
    func: () => !!window.__RFREC,
  });
  if (!(probes || []).some((p) => p && p.result)) {
    // not loaded yet — inject bridge (ISOLATED) then the recorder bundle (MAIN)
    await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["bridge.js"] });
    await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: "MAIN", files: ["recorder.js"] });
  }
  await api.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true }, world: "MAIN",
    func: () => window.__RFREC && window.__RFREC.toggleRecording(),
  });
});
