> 🇬🇧 English original: [README.md](README.md)

# rf-web-recorder

**Un enregistreur de tests universel pour interfaces web modernes, qui émet du
code Robot Framework ciblant la [bibliothèque Browser](https://robotframework-browser.org/)
(basée sur Playwright).**

Indépendant du framework : il fonctionne à l'identique sur des pages React,
Angular, Vue, HTML vanilla et Web Components, parce qu'il ne parle jamais à un
framework — il lit les standards que tous les frameworks finissent par
produire : le DOM, les rôles ARIA et les noms accessibles.

Deux modes de livraison, un seul et même bundle :

1. **Extension Chrome (Manifest V3)** — un clic sur l'icône de la barre d'outils.
2. **Snippet console autonome** — collez un fichier dans les DevTools. Pour les
   environnements verrouillés où installer une extension est interdit.

Zéro dépendance : pas de paquet npm, pas de bundler, pas d'outillage au-delà de
Node lui-même. Licence : Apache-2.0.

## Pourquoi pas Playwright codegen ou Selenium IDE ?

Ce sont de bons enregistreurs — pour leurs propres écosystèmes. `playwright
codegen` émet du code de test Playwright (TypeScript/Python…), Selenium IDE son
format `.side` ou des bindings Selenium. **Aucun des deux n'émet des keywords
de la bibliothèque Browser de Robot Framework** : les équipes RF finissent par
traduire chaque étape à la main. rf-web-recorder émet des lignes `Click` /
`Fill Text` / `Get Text` à coller telles quelles dans un `.robot` — ou exporte
directement une suite exécutable, ou une **paire resource-first** où les
localisateurs vivent dans un `.resource` et où le test se lit comme du langage
métier (le patron que les équipes RF maintiennent réellement).

## Démarrage rapide

### A. Snippet console (sans installation)

```
node build.mjs
```

Ouvrez ensuite votre application, les DevTools (F12) → Console, et collez le
contenu complet de `dist/recorder_snippet.js`. Le panneau apparaît en bas à
droite ; vous êtes en mode capture. `Échap` arrête (les steps sont conservés ;
recoller ou `window.__RFREC.start()` reprend).

### B. Extension Chrome

```
node build.mjs        # génère extension/recorder.js
```

Puis `chrome://extensions` → activer le *Mode développeur* → *Charger
l'extension non empaquetée* → sélectionner le dossier `extension/`. Cliquez sur
l'icône → **Start capture** ou **Start record**. Le raccourci `Alt+Shift+U`
bascule l'enregistrement sans ouvrir le popup ; le badge affiche `REC` pendant
l'enregistrement.

> L'extension est livrée sans fichiers d'icônes, volontairement (le dépôt reste
> 100 % texte et constructible) ; Chrome affiche son icône par défaut. Ajoutez
> des PNG + la clé `icons` du manifest pour une publication sur le Web Store.

### Rejouer un export

```
pip install robotframework robotframework-browser
rfbrowser init
robot recorded-scenario.robot
```

## Stratégie de localisation (le cœur du projet)

Pour chaque élément, l'enregistreur génère des candidats par ordre de priorité
et retient le **premier qui résout de façon unique sur la page** (l'unicité est
re-vérifiée au moment de la capture). La stratégie retenue s'affiche en pastille
sur chaque step : la robustesse se juge d'un coup d'œil.

| # | Stratégie | Exemple | Notes |
|---|-----------|---------|-------|
| 1 | Attribut de test | `[data-testid="save-btn"]` | `data-testid`, `data-test-id`, `data-test`, `data-cy` |
| 2 | Rôle calculé + nom accessible | `role=button[name="Submit"]` | Attribut `role` explicite ou sémantique HTML implicite ; accname via `aria-label(ledby)`, `<label>`, `alt`, texte… Le localisateur « intention utilisateur ». |
| 3 | Placeholder (champs de formulaire) | `[placeholder="Search"]` | |
| 4 | Id stable | `id=login-form` | Les ids générés (`ember123`, `:r0:`, `radix-…`, suites de 3 chiffres et plus) sont rejetés |
| 5 | Texte court unique | `text="Log in"` | Trimé, ≤ 40 caractères |
| 6 | Chemin CSS ancré | `[id="main"] > form:nth-of-type(1) > button:nth-of-type(2)` | Ancêtre à id stable le plus proche + chaîne `nth-of-type`. Toujours disponible. |

Shadow DOM : le moteur CSS de Playwright perce automatiquement les shadow roots
**ouverts** — les chemins CSS restent donc valables sur les pages Web
Components ; le constructeur de chemin franchit les frontières de shadow root
ouvertes avec un combinateur descendant.

## Comportement de l'enregistreur

**Mode capture** (par défaut) : le survol surligne l'élément et affiche son
meilleur localisateur ; un clic copie une ligne `Get Element    <locator>`
prête à coller et liste l'élément dans le panneau, avec un bouton de copie par
stratégie candidate.

**Mode record** (bouton `rec`, popup, ou `Alt+Shift+U`) : vos manipulations
deviennent des steps ordonnés —

| Interaction | Keyword émis |
|---|---|
| clic | `Click    <locator>` |
| saisie dans input/textarea | `Fill Text    <locator>    <valeur>` (mots de passe → `<PASSWORD>`) |
| choix d'une option | `Select Options By    <locator>    label    <libellé>` |
| cocher / décocher une case | `Check Checkbox` / `Uncheck Checkbox` |
| clic sur un bouton radio | `Click    <locator>` |
| Entrée / Tab | `Keyboard Key    press    Enter` |
| navigation hash / historique | `Wait For Load State    load` |

La compaction est automatique : les steps identiques consécutifs sont dédoublonnés,
les saisies consécutives sur le même champ ne gardent que la valeur finale, les
attentes de chargement consécutives fusionnent. Les steps survivent aux
rechargements de page (sessionStorage), se réordonnent (↑ ↓) et se suppriment
(✕) dans le panneau ; le nom du test est éditable.

**Menu d'assertions** : pendant l'enregistrement, **clic droit** sur un élément :

| Entrée du menu | Keyword émis |
|---|---|
| Assert visible | `Get Element States    <loc>    contains    visible` |
| Assert text | `Get Text    <loc>    ==    <texte courant>` |
| Assert value | `Get Property    <loc>    value    ==    <valeur courante>` |
| Assert count | `Get Element Count    <loc>    ==    <n>` |

Le menu se ferme sur Échap ou clic à côté ; le menu contextuel natif n'est
supprimé que pendant le mode record.

## Raccourcis clavier

| Raccourci | Effet |
|---|---|
| `Alt+Shift+U` | Bascule l'enregistrement (extension ; injecte l'enregistreur si besoin) |
| Clic droit | Menu d'assertions (mode record uniquement) |
| `Échap` | Ferme le menu d'assertions, sinon arrête l'enregistreur (steps conservés) |

## Formats d'export

Le bouton `export` du panneau propose cinq formats (le bouton **Export** du
popup utilise le premier) :

1. **Suite `.robot` complète (Browser)** — `Library    Browser`, un test nommé
   d'après le champ de nom éditable, démarrant par
   `New Browser    chromium    headless=False` puis `New Page    <url>`.
   Téléchargée et copiée dans le presse-papiers.
2. **Paire resource-first (Browser)** — `recorded_keywords.resource` (chaque
   localisateur distinct devient une variable `${LOC_<N>_<SLUG>}` + de petits
   keywords d'action comme `Fill Username`) et une suite `.robot` qui n'appelle
   **que ces keywords** : aucun localisateur n'apparaît dans le test.
3. **Suite `.robot` complète (SeleniumLibrary)** — le même enregistrement, émis
   en keywords SeleniumLibrary (`Click Element`, `Input Text`,
   `Select From List By Label`, `Element Text Should Be`,
   `Press Keys    None    ENTER`…), amorcé par `Open Browser    <url>    Chrome`.
4. **Paire resource-first (SeleniumLibrary)** — le même patron sans
   localisateur dans le test, saveur SeleniumLibrary.
5. **Corps de steps brut** — presse-papiers uniquement (keywords Browser), pour
   coller dans un test existant.

### Traduction des localisateurs vers SeleniumLibrary

Selenium n'a pas les moteurs de sélecteurs Playwright ; l'adaptateur traduit
chaque localisateur enregistré :

| Enregistré (Browser/Playwright) | Émis (SeleniumLibrary) |
|---|---|
| `[data-testid="save"]`, `[placeholder="…"]`, chemins CSS | `css:` + le même sélecteur |
| `id=login` | `id:login` |
| `role=button[name="Submit"]`, `text="…"` | `css:` + le **repli chemin CSS** enregistré avec chaque step |

Les steps enregistrés avant la v0.2 (sans repli CSS stocké) qui utilisaient un
sélecteur `role=`/`text=` sont conservés en commentaires `# untranslatable…` —
rien n'est perdu en silence. Limite assumée : le CSS de Playwright perce les
shadow roots ouverts, celui de Selenium non — un step capturé dans du shadow
DOM peut ne pas se rejouer sous SeleniumLibrary.

## Développement

```
node build.mjs                  # concatène src/ -> dist/recorder_snippet.js + extension/recorder.js
node --test "test/*.test.mjs"   # tests unitaires (node:test, sans jsdom — cœur duck-typé)
node package_extension.mjs      # zippe extension/ -> dist/rf-web-recorder-extension-<version>.zip
```

Arborescence :

| Chemin | Rôle |
|--------|------|
| `src/core/locators.js` | Rôle calculé, nom accessible, chemin CSS, génération + scoring d'unicité des candidats. Pur, duck-typé. |
| `src/core/steps.js` | Modèle de step + règles de dédup/compaction. Pur. |
| `src/core/emit_browser.js` | Step → lignes de keywords Browser ; constructeur de suite ; constructeur resource-first. Pur. |
| `src/core/emit_selenium.js` | Second adaptateur d'émission : step → lignes de keywords SeleniumLibrary, avec traduction des localisateurs Browser→Selenium (repli CSS par step). Pur. |
| `src/panel/panel.js` | Panneau flottant déplaçable, surlignage, menu flottant. Navigateur uniquement. |
| `src/recorder.js` | Câblage des événements : modes capture/record, menu d'assertions, persistance, export. |
| `src/main.js` | Bootstrap `window.__RFREC` (API start/stop/export). |
| `extension/` | Extension MV3 (`recorder.js` y est généré par le build). |
| `test/` | Suites `node --test` du cœur pur + des sorties de build. |

Les modules `core/` n'exigent jamais un vrai DOM : ils acceptent tout objet
exposant `tagName` / `getAttribute()` / `textContent` / `parentElement` /
`children`… C'est ce qui les rend testables avec de minuscules faux nœuds — le
vrai DOM se trouve simplement satisfaire la même interface à l'exécution.

## Limites connues

- Un champ qui ré-émet un `change` natif au blur (après d'autres steps) est
  enregistré une seconde fois — sans effet au rejeu, supprimez le step en trop
  dans le panneau.
- Entrée sur un bouton focalisé enregistre la touche ET le clic synthétisé par
  le navigateur.
- Les iframes cross-origin n'ont leur panneau qu'en mode extension (le snippet
  ne franchit pas les origines ; l'extension injecte en `allFrames` là où c'est
  permis).
- L'unicité d'un localisateur est évaluée au moment de la capture, sur l'état
  courant du DOM.

## Licence

Apache-2.0. Le cœur de localisation a été développé à l'origine pour le projet
SAPFX, du même auteur — voir [NOTICE](NOTICE).
