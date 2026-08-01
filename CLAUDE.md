# CLAUDE.md

Guidance for AI assistants working in this repo. Keep it accurate — update it
when structure or conventions change, and keep `AGENTS.md` and
`.github/copilot-instructions.md` (condensed mirrors) in sync in the same
commit.

## Language

Respond to the user in French. READMEs are bilingual (EN original +
`README.fr.md` with cross-link banners — keep both in sync). Never translate
code, identifiers, Robot Framework keyword names or proper nouns.

## What this is

**rf-web-recorder** (v0.4.1) — a universal test recorder for modern web
interfaces that emits Robot Framework code targeting the **Browser library**
(Playwright-based). Framework-agnostic by design: it never talks to React/
Angular/Vue/Web Components — it reads the standards they all produce (DOM,
ARIA roles, accessible names) and emits stable locators (role + accessible
name, `data-testid`). Two delivery modes, one identical bundle: a Chrome MV3
extension and a standalone console-paste snippet (for locked-down
environments). Selenium IDE's good half is kept (in-panel replay, in-place
step editing, multi-test sessions, re-import of an exported suite) without
its control-flow recording.

Born 2026-07-19 as the generalist sibling of the SAPFX project
(`E:\QA_GenAI\SAP_library_custom`): the generic dom engine was ported from
there — attribution in `NOTICE` (Apache-2.0).

## Layout

| Path | Role |
|------|------|
| `src/` | Source of the bundle: `core/` (engines), `panel/` (UI), `recorder.js`, `main.js`. |
| `build.mjs` | Zero-dependency build (Node only) → `dist/recorder_snippet.js` + `extension/recorder.js`. |
| `extension/` | Chrome MV3 extension (manifest, popup, background, bridge; `recorder.js` is **generated** by the build — never edit it by hand). |
| `package_extension.mjs` | Store zip assembler (`npm run package`). |
| `test/` | `node --test` unit suites (build, Browser/Selenium emitters, locators, resolve, steps) + `test/e2e/recorder_live.robot`. |
| `demo/`, `docs/`, `comms/` | Scripted demo, docs assets, project communication material. |
| `dist/` | Generated artifacts — rebuild, never edit in place. |
| `memory/` | AI assistants' project memory (public-safe — see below). |

## Commands

```bash
node build.mjs        # or: npm run build — regenerates snippet + extension bundle
npm test              # node --test test/*.test.mjs (no browser needed)
npm run test:e2e      # robot test/e2e/recorder_live.robot (live Chromium)
npm run package       # store zip for the extension
```

## Conventions (do not break)

1. **Zero dependencies everywhere** — no npm packages, no bundler beyond Node
   itself. Think twice before adding any.
2. **Generated files are never edited by hand** (`dist/`,
   `extension/recorder.js`) — fix the source and rebuild.
3. **Locator preference order** stays user-intent-first: role + accessible
   name / `data-testid` before CSS paths.
4. Every behaviour change gets a `node --test` unit test; keep the e2e robot
   smoke green.
5. License Apache-2.0 — preserve `NOTICE` (SAPFX dom-engine attribution).

## Memory (three coexisting layers)

1. **Project memory (this repo, public-safe)**: `memory/` at the repo root —
   anonymized durable project facts (no personal data, no machine paths, no
   private URLs); index `memory/MEMORY.md`, rules in `memory/README.md`.
2. **Private cross-project base**: `E:\QA_GenAI\agent-memory\` — user
   profile/preferences, machine specifics, cross-project facts, research
   notes; contract in its `PROTOCOLE.md`. Never published.
3. **Claude Code auto-memory** (Claude only) — internal pointers, no
   duplication of the other layers.

Read both indexes at session start. New fact: publishable + project-specific
→ layer 1; personal/machine/cross-project → layer 2. One fact per file,
update the index in the same operation, never secrets anywhere.
