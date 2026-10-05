---
name: three-replay-defects-ported-from-sapfx
description: 2026-10-04, three export/recording defects found in the sibling SAPFX recorder reproduced here too (Enter recorded before its fill, page closed between scenarios, fallback decided by an immediate count) and fixed
type: projet
date: 2026-10-04
---

Three defects first found by replaying exports of the SAPFX recorder with `robot`,
then reproduced in this recorder on 2026-10-04:

1. **Enter before its fill.** A page that handles Enter itself (keydown +
   `preventDefault`: search boxes, chat inputs, many SPA forms) fires no `change`
   before the blur. The one-tick deferral of the key press did not help: the order
   recorded was `click, press=Enter, fill=Aussie`. Fix: `createFillTracker`
   (`src/core/steps.js`) marks a field on `input`; Enter/Tab commits its value first
   and the late `change` is skipped.
2. **Second scenario without a page.** The bootstrap lives in the first test only and
   the Browser library closes a test's pages at its end by default: "Could not find
   active page". Fix: `Library    Browser    auto_closing_level=SUITE` when an export
   has several scenarios (in the resource for the resource-first pair).
3. **Fallback taken on a page still rendering.** `Get Element Count` does not wait: an
   element rendered 1.5 s after load counted 0, the keyword took the CSS fallback and
   logged a false "Primary locator not found". Fix: `Run Keyword And Return Status    Wait
   For Elements State    <primary>    attached    timeout=${RECORDED_STEP_TIMEOUT}` (10 s).

**Why:** none of the three shows in unit tests of the emitters alone; they appear when
an export is replayed by `robot` on a real page.
**How to apply:** when a recorder fix lands in either sibling, check the other one; the
e2e smoke `Enter Records The Typed Value Before The Key` is red on the old bundle.
