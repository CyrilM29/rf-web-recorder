/*
 * ISOLATED-world <-> service-worker relay. The recorder runs in the MAIN world
 * (same JS context as the page) where the chrome.* APIs do not exist. This
 * small script, injected into the ISOLATED world, listens for the DOM state
 * event dispatched by the recorder and relays it to the service worker, which
 * updates the toolbar badge. Both worlds share the DOM, so the CustomEvent
 * crosses the boundary.
 */
(function () {
  if (window.__rfrecBridge) return;     // idempotent
  window.__rfrecBridge = true;
  var api = (typeof browser !== "undefined") ? browser : chrome;
  document.addEventListener("__rfrecState", function (e) {
    try { api.runtime.sendMessage({ type: "rfrecState", recording: !!e.detail }); } catch (err) { /* ignore */ }
  }, true);
})();
