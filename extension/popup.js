/*
 * Popup controller. Injects the recorder bundle into the active tab's MAIN
 * world (same JS context as the page) plus a small ISOLATED bridge (toolbar
 * badge), and drives it: Start capture / Start record / Export / Stop.
 * Uses `activeTab` — access is granted for the current tab when the user
 * clicks the toolbar icon, so no host permissions are needed.
 */
const api = (typeof browser !== "undefined") ? browser : chrome;

async function getActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

// Runs `func` in the MAIN world of ALL frames (embedded apps get a panel too).
// Returns the first truthy result, else the main frame's. Cross-origin frames
// without host permissions are skipped silently by Chrome.
async function runInPage(tabId, func) {
  try {
    const results = await api.scripting.executeScript({
      target: { tabId, allFrames: true }, world: "MAIN", func,
    });
    const hit = (results || []).find((r) => r && r.result);
    if (hit) return hit.result;
    return results && results[0] ? results[0].result : null;
  } catch (err) {
    setStatus("Error: " + err);
    return null;
  }
}

async function ensureInjected(tabId) {
  const loaded = await runInPage(tabId, () => !!window.__RFREC);
  if (loaded) {
    await runInPage(tabId, () => { window.__RFREC.start(); return true; });
    return;
  }
  // bridge (ISOLATED) for the badge, then the recorder bundle (MAIN world)
  await api.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["bridge.js"] });
  await api.scripting.executeScript({ target: { tabId, allFrames: true }, world: "MAIN", files: ["recorder.js"] });
}

async function refresh() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  const running = await runInPage(tab.id, () => !!(window.__RFREC && window.__RFREC.isRunning()));
  const recording = running &&
    await runInPage(tab.id, () => !!(window.__RFREC && window.__RFREC.isRecording()));
  document.getElementById("export").disabled = !running;
  document.getElementById("stop").disabled = !running;
  setStatus(running ? (recording ? "Recording…" : "Capture mode") : "Not started");
}

document.getElementById("capture").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  try {
    await ensureInjected(tab.id);
    await runInPage(tab.id, () => { window.__RFREC.setRecording(false); return true; });
    await refresh();
  } catch (err) {
    setStatus("Could not start: " + err);
  }
});

document.getElementById("record").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  try {
    await ensureInjected(tab.id);
    await runInPage(tab.id, () => { window.__RFREC.setRecording(true); return true; });
    await refresh();
  } catch (err) {
    setStatus("Could not start: " + err);
  }
});

document.getElementById("export").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  await runInPage(tab.id, () => window.__RFREC && window.__RFREC.exportAs("robot"));
  setStatus("Exported .robot (see downloads)");
});

document.getElementById("stop").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  await runInPage(tab.id, () => window.__RFREC && window.__RFREC.stop());
  await refresh();
});

refresh();
