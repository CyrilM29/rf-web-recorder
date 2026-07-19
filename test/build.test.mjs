// node --test — build.mjs produces both bundles; manifest is valid MV3 JSON.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "../build.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("build() writes both bundles with the expected markers", () => {
  const result = build();
  assert.equal(result.outputs.length, 2);
  const snippet = readFileSync(path.join(ROOT, "dist", "recorder_snippet.js"), "utf8");
  const extBundle = readFileSync(path.join(ROOT, "extension", "recorder.js"), "utf8");
  assert.equal(snippet, extBundle, "snippet and extension bundle must be identical");
  for (const marker of [
    "GENERATED FILE",          // generated-file header
    "window.__RFREC",          // public namespace
    "__RFREC_CORE",            // internal namespace
    "ariaRole",                // locator core made it in
    "buildResourcePair",       // emitter made it in
    "parseSuite",              // .robot re-import made it in
    "resolveSelector",         // replay resolver made it in
    "createPanel",             // panel made it in
    "rf-web-recorder v" + result.version,
  ]) {
    assert.ok(snippet.includes(marker), "bundle should contain: " + marker);
  }
  assert.ok(snippet.trimStart().startsWith("/*"), "header comment first");
  assert.ok(snippet.includes("(() => {"), "bundle is an IIFE");
});

test("extension manifest is valid MV3 JSON with the expected surface", () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "extension", "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.3.0");
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.commands["toggle-record"].suggested_key.default, "Alt+Shift+U");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.icons, undefined, "no icon files shipped — none referenced");
});

test("package.json declares no dependencies at all", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.license, "Apache-2.0");
});
