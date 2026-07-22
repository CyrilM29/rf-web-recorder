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
métier (le patron que les équipes RF maintiennent réellement). Il reprend
aussi les bons côtés du workflow Selenium IDE — rejeu dans le panneau,
édition des steps sur place, plusieurs tests par session, ré-import d'une
suite exportée — sans adopter son enregistrement de contrôle de flux (voir
les non-objectifs assumés plus bas).

## Démarrage rapide

### A. Snippet console (sans installation)

```
node build.mjs
```

Ouvrez ensuite votre application, les DevTools (F12) → Console, et collez le
contenu complet de `dist/recorder_snippet.js`. Le panneau apparaît en bas à
droite ; vous êtes en mode capture. `Échap` arrête (les steps sont conservés ;
recoller ou `window.__RFREC.start()` reprend).

> ⚠️ Ne collez que du code que vous avez construit vous-même depuis des
> sources que vous pouvez lire (`node build.mjs`). Coller du JavaScript non
> vérifié dans la console DevTools lui donne le contrôle total de la page
> (self-XSS) — n'étendez jamais cette habitude à du code venu de chats, gists
> ou sites que vous n'avez pas audités. Voir
> [Sécurité et confidentialité](#sécurité-et-confidentialité).

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
| saisie dans input/textarea | `Fill Text    <locator>    <valeur>` (mots de passe → `<PASSWORD>`, champs paiement/OTP → `<SECRET>`) |
| choix d'une option | `Select Options By    <locator>    label    <libellé>` |
| cocher / décocher une case | `Check Checkbox` / `Uncheck Checkbox` |
| clic sur un bouton radio | `Click    <locator>` |
| Entrée / Tab | `Keyboard Key    press    Enter` |
| navigation hash / historique | `Wait For Load State    load` |

La compaction est automatique : les doublons quasi simultanés sont
dédoublonnés (un second clic VOLONTAIRE sur le même bouton est conservé), les
saisies consécutives sur le même champ ne gardent que la valeur finale, les
attentes de chargement consécutives fusionnent. Les steps — et l'état
d'enregistrement — survivent aux rechargements de page (sessionStorage) :
après une navigation complète, ré-injectez (recollez le snippet ou
`Alt+Shift+U`) et l'enregistrement reprend où il en était. Les steps se
réordonnent (↑ ↓) et se suppriment (✕) dans le panneau ; le nom du test est
éditable.

**Rejeu dans le panneau** (bouton `play`) : les steps enregistrés se rejouent
séquentiellement (~350 ms d'intervalle) sur la page vivante — les clics
émettent de vrais événements mousedown/mouseup/click, les saisies posent la
valeur puis émettent input+change, les selects choisissent l'option par
libellé, les touches partent vers l'élément focalisé, et les **assertions
enregistrées sont évaluées sur place** (visible / texte / valeur / compte).
L'élément de chaque step est surligné pendant l'exécution et la ligne courante
est marquée dans le panneau ; un échec arrête le rejeu, marque la ligne en
rouge et nomme la raison dans la ligne d'indice ; un succès affiche
`replay OK (N steps)`. `Échap` annule un rejeu en cours. Le rejeu n'enregistre
jamais ses propres événements synthétiques. Les saisies passent par le
**setter natif** de l'élément avec un vrai focus, donc les inputs contrôlés
(React et consorts) les voient ; les frameworks qui n'acceptent que les
gestes authentiques peuvent encore ignorer les clics synthétiques — la suite
exportée, elle, se rejoue via la vraie bibliothèque Browser.

**Édition sur place** : double-cliquez sur une ligne de step pour l'éditer en
ligne — la valeur pour les steps qui en portent une (saisie / select /
assertions), sinon la touche (press), le nom du scénario (marqueurs) ou le
localisateur. Entrée valide, Échap annule. Éditer un localisateur à la main
efface sa pastille de stratégie et son repli CSS enregistrés (ils ne
décrivent plus le nouveau localisateur).

**Plusieurs tests par session** (bouton `+test`) : nommez le scénario suivant
dans l'invite en ligne et continuez d'enregistrer — une ligne de marqueur de
scénario (`— Test: nom —`) est ajoutée, et chaque export découpe
l'enregistrement en plusieurs entrées `*** Test Cases ***` : le premier test
porte le nom éditable et l'amorce `New Browser`/`New Page`, chaque marqueur
nomme le test suivant, et les tests suivants **continuent la même session
navigateur** (pas de ré-amorçage). Le rejeu traite les marqueurs comme des
séparateurs.

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
| Double-clic sur une ligne | Édite le step en ligne (Entrée valide, Échap annule) |
| `Échap` | Annule un rejeu en cours, sinon ferme le menu d'assertions, sinon arrête l'enregistreur (steps conservés) |

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
   **que ces keywords** : aucun localisateur n'apparaît dans le test. Quand le
   repli chemin-CSS enregistré d'un step diffère de son localisateur gagnant,
   la resource reçoit aussi une variable `${LOC_<N>_<SLUG>_FALLBACK}` et le
   corps du keyword devient du vrai contrôle de flux Robot Framework
   auto-réparant :

   ```robotframework
   Click Username
       ${found}=    Get Element Count    ${LOC_1_USERNAME}
       IF    ${found} > 0
           Click    ${LOC_1_USERNAME}
       ELSE
           Log    Primary locator not found - falling back to the recorded CSS path    WARN
           Click    ${LOC_1_USERNAME_FALLBACK}
       END
   ```

   Le localisateur principal est essayé d'abord ; le chemin CSS ne prend le
   relais que s'il ne résout plus, et le WARN rend la dérive visible dans le
   log au lieu de la masquer. Les keywords à valeur gardent leur `[Arguments]`
   et utilisent l'argument dans les deux branches. (L'émetteur SeleniumLibrary
   reste volontairement inchangé : il consomme déjà directement le repli CSS
   pour les localisateurs `role=`/`text=` — un IF/ELSE ne ferait que rejouer
   le même sélecteur.)
3. **Suite `.robot` complète (SeleniumLibrary)** — le même enregistrement, émis
   en keywords SeleniumLibrary (`Click Element`, `Input Text`,
   `Select From List By Label`, `Element Text Should Be`,
   `Press Keys    None    ENTER`…), amorcé par `Open Browser    <url>    Chrome`.
4. **Paire resource-first (SeleniumLibrary)** — le même patron sans
   localisateur dans le test, saveur SeleniumLibrary.
5. **Corps de steps brut** — presse-papiers uniquement (keywords Browser), pour
   coller dans un test existant.

Le même menu propose aussi **Import .robot…** : choisissez une suite
Browser exportée précédemment et elle est reconvertie en liste de steps
(remplaçant les steps courants), noms de tests compris — plusieurs tests
deviennent des marqueurs de scénario, le premier restaure le nom du test,
`New Page` restaure l'URL de départ. Les lignes que l'analyseur ne comprend
pas (appels de keywords resource, `[Tags]`, `Log`…) sont comptées comme
ignorées dans la ligne d'indice — jamais perdues en silence.
Export → import → export boucle sans perte sur l'ensemble des steps
supportés.

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

## Sécurité et confidentialité

- **Les valeurs enregistrées persistent en clair** dans le `sessionStorage`
  de l'onglet (`__rfrecSteps`) — c'est ce qui permet à un enregistrement de
  survivre aux rechargements de page. Tout ce qui est saisi pendant
  l'enregistrement (hors champs sensibles masqués, ci-dessous) est lisible
  par tout script de la même origine, et y reste jusqu'au bouton `clear` du
  panneau ou à la fermeture de l'onglet. Effacez l'enregistrement quand vous
  avez terminé, et évitez d'enregistrer de vraies données personnelles sur
  des pages auxquelles vous ne faites pas confiance.
- **Les champs sensibles sont masqués à la capture.** Les champs mot de passe
  enregistrent `<PASSWORD>` ; les champs paiement et code à usage unique
  enregistrent `<SECRET>` (détection via les jetons `autocomplete` —
  `cc-number`, `cc-csc`, `cc-exp`, `one-time-code`, `current-password`,
  `new-password` — ou un name/id/aria-label ressemblant à un numéro de
  carte / CVC / OTP). La vraie valeur n'atteint jamais la liste de steps, le
  sessionStorage, le presse-papiers ni un export ; remplacez le placeholder
  par une variable Robot Framework dans la suite exportée. La détection est
  heuristique : relisez un export avant de le partager.
- **Le snippet console a par nature la forme d'un self-XSS** : il n'existe
  que pour les environnements où les extensions sont interdites.
  Construisez-le vous-même, lisez-le si vous voulez (c'est de la simple
  concaténation de sources), et ne collez jamais dans une console du code
  que vous n'avez pas audité.

## Développement

```
node build.mjs                  # concatène src/ -> dist/recorder_snippet.js + extension/recorder.js
node --test "test/*.test.mjs"   # tests unitaires (node:test, sans jsdom — cœur duck-typé)
node package_extension.mjs      # zippe extension/ -> dist/rf-web-recorder-extension-<version>.zip
npm run test:e2e                # E2E optionnel : pilote le bundle CONSTRUIT dans un vrai Chromium
```

La suite E2E (`test/e2e/recorder_live.robot`) est la seule partie du dépôt
avec des dépendances — celles que vous avez déjà en tant qu'utilisateur des
exports : `pip install robotframework robotframework-browser` +
`rfbrowser init`. Elle injecte `dist/recorder_snippet.js` dans une page de
checkout fixture et vérifie en live : masquage des champs sensibles (mot de
passe / carte / CVC / OTP n'atteignent jamais le sessionStorage ni un export
en clair), enregistrement, reprise après rechargement de page, rejeu dans la
page, et les deux saveurs d'export.

Arborescence :

| Chemin | Rôle |
|--------|------|
| `src/core/locators.js` | Rôle calculé, nom accessible, chemin CSS, génération + scoring d'unicité des candidats. Pur, duck-typé. |
| `src/core/steps.js` | Modèle de step + règles de dédup/compaction. Pur. |
| `src/core/emit_browser.js` | Step → lignes de keywords Browser ; constructeur de suite ; constructeur resource-first. Pur. |
| `src/core/emit_selenium.js` | Second adaptateur d'émission : step → lignes de keywords SeleniumLibrary, avec traduction des localisateurs Browser→Selenium (repli CSS par step). Pur. |
| `src/core/resolve.js` | L'inverse de la génération de localisateurs : sélecteur → élément(s) (`resolveSelector`/`countSelector`), planification du rejeu (`planStep`) et évaluation d'assertions sur place (`evalAssertion`). Pur, duck-typé. |
| `src/panel/panel.js` | Panneau flottant déplaçable, surlignage, menu flottant, éditeurs en ligne, statut de ligne du rejeu. Navigateur uniquement. |
| `src/recorder.js` | Câblage des événements : modes capture/record, rejeu dans le panneau, menu d'assertions, persistance, export + import .robot. |
| `src/main.js` | Bootstrap `window.__RFREC` (API start/stop/export). |
| `extension/` | Extension MV3 (`recorder.js` y est généré par le build). |
| `test/` | Suites `node --test` du cœur pur + des sorties de build. |
| `test/e2e/` | Suite Robot Framework Browser optionnelle pilotant le bundle construit dans un vrai Chromium (masquage, enregistrement, reprise, rejeu, exports). |

Les modules `core/` n'exigent jamais un vrai DOM : ils acceptent tout objet
exposant `tagName` / `getAttribute()` / `textContent` / `parentElement` /
`children`… C'est ce qui les rend testables avec de minuscules faux nœuds — le
vrai DOM se trouve simplement satisfaire la même interface à l'exécution.

## Non-objectifs assumés

- **Pas d'enregistrement de contrôle de flux** (pas de if/else, boucles ou
  variables capturés depuis l'interface, contrairement à Selenium IDE) : la
  logique appartient à Robot Framework — keywords resource, templates,
  `IF`/`FOR` écrits là où on peut les relire et les maintenir — pas à un
  enregistrement. Un enregistrement est un brouillon linéaire ; le seul
  contrôle de flux que l'enregistreur émette est le patron de repli de
  localisateur ci-dessus, et il le génère, il ne l'enregistre pas.

## Limites connues

- Un champ qui ré-émet un `change` natif au blur (après d'autres steps) est
  enregistré une seconde fois — sans effet au rejeu, supprimez le step en trop
  dans le panneau.
- Entrée sur un bouton focalisé enregistre la touche ET le clic synthétisé par
  le navigateur.
- Une navigation complète décharge l'enregistreur : les steps ET l'état
  d'enregistrement sont conservés, mais il faut le ré-injecter (`Alt+Shift+U`
  ou re-coller le snippet) avant que les interactions suivantes soient
  capturées.
- Les changements d'un `<input type="file">` ne sont pas enregistrés — un vrai
  upload demande un `Upload File By Selector` écrit à la main.
- Les iframes cross-origin n'ont leur panneau qu'en mode extension (le snippet
  ne franchit pas les origines ; l'extension injecte en `allFrames` là où c'est
  permis).
- L'unicité d'un localisateur est évaluée au moment de la capture, sur l'état
  courant du DOM (shadow roots ouverts compris).
- L'unicité du chemin CSS ancré est vérifiée avec le moteur CSS de la page ;
  quand la cible est dans un shadow tree que ce moteur ne voit pas, la
  construction du chemin est considérée fiable plutôt que re-vérifiée.

## Licence

Apache-2.0. Le cœur de localisation a été développé à l'origine pour le projet
SAPFX, du même auteur — voir [NOTICE](NOTICE).
