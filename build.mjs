/*
 * build.mjs — dependency-free bundler.
 *
 * Concatenates the src/ modules in order into a single IIFE and writes it to:
 *   dist/recorder_snippet.js   (standalone console-paste snippet)
 *   extension/recorder.js      (MAIN-world content script of the MV3 extension)
 *
 * Both outputs are byte-identical apart from nothing — one bundle, two homes —
 * and carry a generated-file header. Run: `node build.mjs`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Concatenation order matters: core modules first (recorder/panel read them
// from __RFREC_CORE), entry point last.
const ORDER = [
  "src/core/locators.js",
  "src/core/steps.js",
  "src/core/emit_browser.js",
  "src/core/emit_selenium.js",   // depends on emit_browser (rfEscape, splitScenarios)
  "src/core/resolve.js",         // depends on locators (ariaRole, accName, collapse)
  "src/panel/panel.js",
  "src/recorder.js",
  "src/main.js",
];

export function build() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const header = [
    "/*",
    " * rf-web-recorder v" + pkg.version + " — universal Robot Framework Browser-library recorder.",
    " *",
    " * Hover to highlight + click to capture locators; « rec » records your",
    " * interactions as replayable Browser-library keywords; « play » replays the",
    " * recorded steps in place; « +test » starts a new test case; « export »",
    " * downloads a .robot suite (or a .resource + .robot pair) and re-imports",
    " * one. Right-click while recording opens the assertion menu; double-click",
    " * a step row to edit it. Esc stops. API: window.__RFREC",
    " *",
    " * Two ways to run it on any web page:",
    " *   1. paste this whole file into the DevTools console, or",
    " *   2. load the browser extension in extension/ and click its icon.",
    " *",
    " * GENERATED FILE — do not edit. Sources live in src/; run `node build.mjs`.",
    " * License: Apache-2.0 (see LICENSE / NOTICE).",
    " */",
    "",
  ].join("\n");

  const parts = ORDER.map((rel) => {
    const code = readFileSync(path.join(ROOT, rel), "utf8").trim();
    return "// ---- " + rel + " " + "-".repeat(Math.max(4, 68 - rel.length)) + "\n" + code;
  });

  const bundle = header +
    "(() => {\n\"use strict\";\n" +
    parts.join("\n\n") +
    "\n})();\n";

  mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  const outputs = [
    path.join(ROOT, "dist", "recorder_snippet.js"),
    path.join(ROOT, "extension", "recorder.js"),
  ];
  for (const out of outputs) writeFileSync(out, bundle, "utf8");
  return { outputs, bytes: bundle.length, version: pkg.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = build();
  for (const out of r.outputs) console.log("wrote " + path.relative(ROOT, out) + " (" + r.bytes + " bytes)");
}
