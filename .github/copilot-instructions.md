# GitHub Copilot instructions

This repo is **rf-web-recorder** (universal web test recorder emitting Robot
Framework code for the Browser library: see `README.md` and `AGENTS.md`).
Respond to the user in French; keep READMEs bilingual (EN + `*.fr.md`).

Never use the em dash (« — ») anywhere in this repo (docs, READMEs, specs,
docstrings, comments, emitted strings, workflows, config): use a colon, a
comma, parentheses, or split the sentence (French puts a space before the
colon, English does not). Enforced by `tools/check-no-em-dash.mjs`, run by `npm test`.

## Memory (three coexisting layers)

1. **Project memory (this repo, public-safe)**: `memory/` at the repo root,
   anonymized durable project facts (no personal data, no machine paths, no
   private URLs); index `memory/MEMORY.md`, rules in `memory/README.md`.
2. **Private cross-project base**: `E:\QA_GenAI\agent-memory\` (add it to the
   VS Code workspace to read/write it natively): user profile/preferences,
   machine specifics, cross-project facts, research notes; contract in its
   `PROTOCOLE.md`. Never published.
3. **Claude Code auto-memory** (Claude only): do not duplicate it.

Read both indexes at the start of a task. New fact: publishable +
project-specific → layer 1; personal/machine/cross-project → layer 2. One
fact per file, update the index in the same operation, never secrets anywhere.
