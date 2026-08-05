# AGENTS.md

Condensed guide for AI coding assistants working on **rf-web-recorder**
(universal web test recorder emitting Robot Framework code for the Browser
library: see `README.md` / `README.fr.md`, kept bilingual with cross-link
banners). Respond to the user in French; code, keyword names and identifiers
stay in English. Sibling of the SAPFX project (`E:\QA_GenAI\SAP_library_custom`)
its generic dom engine was ported from there (attribution in `NOTICE`).

Never use the em dash (« — ») anywhere in this repo (docs, READMEs, specs,
docstrings, comments, emitted strings, workflows, config): use a colon, a
comma, parentheses, or split the sentence (French puts a space before the
colon, English does not). Enforced by `tools/check-no-em-dash.mjs`, run by `npm test`.

## Memory (three coexisting layers)

1. **Project memory (this repo, public-safe)**: `memory/` at the repo root,
   anonymized durable project facts (no personal data, no machine paths, no
   private URLs); index `memory/MEMORY.md`, rules in `memory/README.md`.
2. **Private cross-project base**: `E:\QA_GenAI\agent-memory\`, user
   profile/preferences, machine specifics, cross-project facts, research
   notes; contract in its `PROTOCOLE.md`. Never published.
3. **Claude Code auto-memory** (Claude only): internal pointers, no
   duplication of the other layers.

Read both indexes at session start. New fact: publishable + project-specific
→ layer 1; personal/machine/cross-project → layer 2. One fact per file,
update the index in the same operation, never secrets anywhere.
