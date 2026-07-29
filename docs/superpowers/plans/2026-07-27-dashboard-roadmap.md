# Night Pass dashboard roadmap

This roadmap preserves the approved sequence for the optional, local-only
dashboard. It does not authorize changes to tmux or WezTerm configuration, the
wallpaper workflow, LLM-status behavior, default startup, or live collector
behavior. The dashboard remains browser-local: no backend, daemon, polling,
automatic terminal access, or app/runtime dependency is introduced.

1. **Browser regression harness — complete.** Keep the checked-in,
   fixture-only Playwright suite reproducible at 1440x900 and 390x844. The test
   runner owns a loopback static server for the test lifetime and retains only
   failure artifacts by default. Continue to keep the exhaustive geometry and
   live-import audits available as manual checks where automation would be
   brittle or cross the fixture-only boundary.
2. **Route compiler — complete.** Compile
   one canonical SVG path into route anchors and distance-calibrated
   desktop/mobile keyframes. Preserve deterministic slot order, the current
   allocation contract, and reduced-motion static anchors. A Builder dry run
   proved that Ridge desktop cannot meet the `0.5px` deviation limit with only
   the former 513 uniform visible frames. The revised contract keeps the 513
   equal-distance base grid and inserts exact internal cubic-boundary frames.
   The focused independent re-review passed and the base-plus-boundary
   compiler, checked-in artifacts, atomic startup hydration, and regression
   coverage are implemented. Final independent post-change re-review passed
   with no blockers; commit/push is authorized. Delivery evidence and sign-off
   are recorded in
   `docs/superpowers/specs/2026-07-28-dashboard-route-compiler-design.md`.
3. **Tangent orientation and atmosphere — complete.** Focused independent
   pre-implementation and final post-change reviews returned PASS with no
   blockers. The compiler emits responsive tangent and static slot headings;
   the runtime fails static unless all four registered-angle properties
   succeed; and active/thinking cars use bounded deterministic drift and a
   heading-following pointer-inert atmosphere sibling. Verification passed:
   `routes:check`, 127/127 unit tests, 22/22 desktop/mobile Playwright cases,
   browser syntax, and `git diff --check`; ports 43917/43918 were clear and
   six screenshots were refreshed. The mobile thinking-puff selector cascade
   is corrected to 3px/3.2s/0s. Remaining manual-only risk is nonblocking:
   normal-speed reviews accepted the authored abrupt Ridge boundary 8, and
   the capability browser matrix samples active smoke while mobile thinking
   gating is static plus a supported-browser test. Delivery evidence and
   handoff are in
   `docs/superpowers/specs/2026-07-28-dashboard-tangent-atmosphere-design.md`.
3a. **Corner-aware drifting — complete.** The compiler now derives a generic,
   deterministic signed corner envelope from canonical route geometry: eight
   corners each for Ridge Pass and Cypress Run in every responsive profile.
   Existing route keyframes serialize same-sign smoothstep tail-out yaw from
   `15..42deg` in the actual turn direction. Route positions, frame counts,
   geometry, anchors,
   phases, contracts, and the constant `64s linear` traversal are unchanged.
   Verification passed: 140/140 unit tests, 22/22 browser tests,
   `routes:check`, browser syntax checks, `git diff --check`, generated-artifact
   validation, port cleanup, and protected-boundary audits. Six deterministic
   screenshots, normal-speed laps of both courses, and three Ridge boundary-8
   repeats per viewport passed visual review. Independent pre- and post-change
   QA both passed; there was no model exception and runtime observability
   remains unchanged (none added). Delivery evidence is in
   `docs/superpowers/specs/2026-07-28-dashboard-corner-aware-drift-design.md`.
4. **Cypress mobile clearance — complete.** The approved Cypress-mobile-only
   `0.94` centered presentation scale and exact `1.0638297872340425` wrapper
   counter-scale raise the full-target minimum from approximately `3.0px` to
   `12.612213px` (focus `9.612213px`; phased separation `63.296069px`).
   Reduced-motion and failed-capability static audits measured `13.493469px`
   target / `10.493469px` focus clearance and `57.384033px` separation.
   Both independent QA gates passed; verification passed: `routes:check`,
   141/141 Node, 32/32 browser, syntax/diff/generated/ports/protected-boundary
   audits, four normal-speed 64s reviews, and only the mobile Cypress
   screenshot changed. Inherited tooltip clipping was confirmed no worse and
   remains a protected non-regression decision. The external predecessor is
   `bee9df6`; `anime.lua` is clean. No model exception, observability change,
   or Notion synchronization occurred. Commit and push are authorized; release
   status is established by Git history. Final evidence is in
   `docs/superpowers/specs/2026-07-28-dashboard-cypress-mobile-clearance-design.md`.
5. **Opt-in live workflow — next recommended; not implemented.** Add a one-command, one-shot snapshot export and
   clearer explicit-refresh guidance. Retain no polling, daemon, automatic
   terminal access, browser file reread, or implicit collection.
6. **Third course — deferred after item 5; not implemented.** After the route compiler lands, add one original
   medium-speed technical course through that compiler rather than hand-writing
   another responsive motion schedule.

Item 4 is complete. Item 5 is the next recommended task; item 6 remains
deferred after it. Neither is part of item 4 or authorized by this roadmap
status update.
