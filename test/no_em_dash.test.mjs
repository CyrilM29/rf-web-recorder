/*
 * Tests du garde anti-tiret cadratin.
 *
 * On teste la logique pure sur des cas construits, puis on vérifie que le VRAI
 * dépôt passe le garde : c'est ce dernier test qui empêche la règle de se
 * dégrader silencieusement au fil des commits.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { check, findOccurrences, isScanned } from "../tools/check-no-em-dash.mjs";

function scratch(rel, content) {
  const root = mkdtempSync(path.join(tmpdir(), "emdash-"));
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return { root, full };
}

test("findOccurrences donne la ligne et un extrait", () => {
  const found = findOccurrences("ligne propre\nun terme — son explication\n");
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
  assert.match(found[0].excerpt, /son explication/);
});

test("findOccurrences compte deux cadratins sur une même ligne", () => {
  // Une incise fermée en porte deux (un cadratin de chaque côté) : les
  // compter séparément, sinon elle passerait pour une seule violation.
  assert.equal(findOccurrences("a — b — c").length, 2);
});

test("findOccurrences ignore le demi-cadratin et le trait d'union", () => {
  // Le demi-cadratin (intervalles) et le trait d'union sont d'autres signes :
  // les confondre rendrait le garde inutilisable.
  assert.deepEqual(findOccurrences("plage 0.31–0.35, mot-composé"), []);
});

test("le périmètre exclut les bundles générés et les médias", () => {
  assert.equal(isScanned("src/core/locators.js"), true);
  assert.equal(isScanned("README.md"), true);
  assert.equal(isScanned("dist/recorder_snippet.js"), false);
  assert.equal(isScanned("node_modules/x/index.js"), false);
  assert.equal(isScanned("docs/demo.gif"), false);
});

test("check signale un cadratin et nomme le fichier", () => {
  const { root, full } = scratch("docs/x.md", "titre — sous-titre\n");
  const problems = check(root, [full]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /docs\/x\.md:1/);
});

test("check est muet sur un texte conforme", () => {
  const { root, full } = scratch("docs/x.md", "titre : sous-titre (ainsi).\n");
  assert.deepEqual(check(root, [full]), []);
});

test("check ignore le bundle généré", () => {
  // Le bundle vient de build.mjs : le garde doit pousser à corriger src/,
  // jamais la sortie, sinon la correction serait écrasée au prochain build.
  const { root, full } = scratch("dist/recorder_snippet.js", "// a — b\n");
  assert.deepEqual(check(root, [full]), []);
});

test("le dépôt réel passe le garde", () => {
  const problems = check();
  assert.deepEqual(problems, [], "tirets cadratins introduits :\n" + problems.join("\n"));
});
