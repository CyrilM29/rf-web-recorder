/*
 * check-no-em-dash.mjs — garde mécanique du tiret cadratin.
 *
 * Le caractère « — » (U+2014) est le tic n°1 qui trahit un texte généré par IA.
 * La règle (voir CLAUDE.md) le refuse dans TOUTE la rédaction du dépôt : docs,
 * README, commentaires, chaînes affichées par le panneau, config. Le
 * remplacement se choisit selon le contexte, jamais mécaniquement : deux-points,
 * virgule, parenthèses, ou couper la phrase. En français l'espace précède le
 * deux-points (« terme : explication ») ; en anglais non (`term: explanation`).
 *
 * Ne sont PAS visés le demi-cadratin « – » ni le trait d'union « - », qui sont
 * d'autres signes. Écrit en JS et non en Python : ce dépôt est Node, un garde
 * dans une autre langue y ajouterait une dépendance de plus.
 *
 * Usage :
 *   node tools/check-no-em-dash.mjs            # tout l'arbre suivi par git
 *   node tools/check-no-em-dash.mjs README.md  # ciblé
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EM_DASH = "—";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Hors périmètre : bundles générés (corriger la source, pas la sortie) et
// dépendances tierces.
export const EXEMPT_PREFIXES = ["dist/", "node_modules/", "results/"];

export const EXEMPT_SUFFIXES = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".mp4", ".webm", ".zip", ".pdf",
];

// Fichiers autorisés à CITER le caractère, avec le compte EXACT attendu : une
// occurrence de plus fait échouer le garde. Une exemption non bornée
// redeviendrait une porte ouverte.
export const ALLOWED = new Map([
  ["CLAUDE.md", [1, "énonce la règle de rédaction"]],
  ["AGENTS.md", [1, "miroir condensé de la règle"]],
  [".github/copilot-instructions.md", [1, "miroir condensé de la règle"]],
  ["tools/check-no-em-dash.mjs", [3, "ce garde nomme le caractère qu'il refuse"]],
  ["test/no_em_dash.test.mjs", [5, "teste le garde sur des cas portant le caractère"]],
]);

export function isScanned(rel) {
  const posix = rel.replace(/\\/g, "/");
  if (EXEMPT_PREFIXES.some((p) => posix.startsWith(p))) return false;
  return !EXEMPT_SUFFIXES.some((s) => posix.toLowerCase().endsWith(s));
}

/** `{ line, excerpt }` par occurrence : le message doit dire QUOI corriger. */
export function findOccurrences(text) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    let from = 0;
    for (;;) {
      const at = line.indexOf(EM_DASH, from);
      if (at === -1) break;
      found.push({
        line: index + 1,
        excerpt: line.slice(Math.max(0, at - 30), at + 31).trim(),
      });
      from = at + 1;
    }
  });
  return found;
}

export function trackedFiles(root = ROOT) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

export function check(root = ROOT, targets = null) {
  const problems = [];
  const files = (targets
    ? targets.map((t) => path.relative(root, path.resolve(t)).replace(/\\/g, "/"))
        .filter((rel) => !rel.startsWith("..") && isScanned(rel))
    : trackedFiles(root).filter(isScanned));

  const seen = new Map();
  for (const rel of files) {
    let text;
    try {
      if (!statSync(path.join(root, rel)).isFile()) continue;
      text = readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    const found = findOccurrences(text);
    if (found.length === 0) continue;
    if (ALLOWED.has(rel)) {
      seen.set(rel, found.length);
      continue;
    }
    for (const { line, excerpt } of found) {
      problems.push(
        `${rel}:${line} : tiret cadratin, à remplacer par un deux-points, une ` +
          `virgule, des parenthèses, ou en coupant la phrase\n      … ${excerpt} …`
      );
    }
  }

  // Les citations autorisées sont BORNÉES, et seulement sur les fichiers
  // réellement scannés (un fichier pas encore suivi par git sortirait sinon un
  // échec fantôme « 0 occurrence attendues N »).
  const scanned = new Set(files);
  for (const [rel, [expected, reason]] of ALLOWED) {
    if (!scanned.has(rel)) continue;
    const actual = seen.get(rel) ?? 0;
    if (actual !== expected) {
      problems.push(
        `${rel} : ${actual} occurrence(s) alors que l'allowlist en attend ` +
          `${expected} (${reason}) : si la citation a bougé, ajuster ALLOWED ` +
          `dans tools/check-no-em-dash.mjs ; sinon corriger le texte.`
      );
    }
  }
  return problems;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const targets = process.argv.slice(2);
  const problems = check(ROOT, targets.length ? targets : null);
  if (problems.length) {
    console.error("[check-no-em-dash] ÉCHEC :");
    for (const problem of problems) console.error("  - " + problem);
    console.error(
      "\n  Règle : jamais de tiret cadratin dans la rédaction du dépôt " +
        "(CLAUDE.md).\n  En français l'espace précède le deux-points " +
        "(« terme : explication ») ; en anglais non (term: explanation)."
    );
    process.exit(1);
  }
  console.log(
    `[check-no-em-dash] OK (${targets.length ? "ciblé" : "arbre suivi"}) : ` +
      "aucun tiret cadratin hors citations autorisées."
  );
}
