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
4. **Cypress mobile clearance.** Improve Cypress Run's full-target edge margin
   beyond the current approximately 3px minimum without changing course
   identity or weakening its route/clipping assertions.
5. **Opt-in live workflow.** Add a one-command, one-shot snapshot export and
   clearer explicit-refresh guidance. Retain no polling, daemon, automatic
   terminal access, browser file reread, or implicit collection.
6. **Third course.** After the route compiler lands, add one original
   medium-speed technical course through that compiler rather than hand-writing
   another responsive motion schedule.

Items 2–6 are ordered future work, not implementation scope for the browser
harness milestone.
