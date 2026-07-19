/*
 * rf-web-recorder — main.js
 *
 * Entry point: bootstraps the public `window.__RFREC` API and auto-starts
 * capture mode on injection. Idempotent — the bundle wrapper re-calls
 * `__RFREC.start()` instead of re-installing when pasted twice.
 */
(function (global) {
  "use strict";
  var CORE = global.__RFREC_CORE || {};
  if (global.__RFREC) { global.__RFREC.start(); return; }

  var instance = CORE.recorder.create();

  global.__RFREC = {
    version: "0.3.0",
    start: instance.start,
    stop: instance.stop,
    isRunning: instance.isRunning,
    toggleRecording: instance.toggleRecording,
    setRecording: instance.setRecording,
    isRecording: instance.isRecording,
    play: instance.play,              // in-panel replay of the recorded steps
    isReplaying: instance.isReplaying,
    exportAs: instance.exportAs,      // "robot" | "resource-pair" | "body" (+ "selenium-" prefixes)
    core: CORE,                       // locator/step/emit/resolve internals for power users
  };

  instance.start();
})(typeof window !== "undefined" ? window : globalThis);
