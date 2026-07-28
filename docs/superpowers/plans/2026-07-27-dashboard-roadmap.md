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
3. **Tangent orientation and atmosphere — next.** Derive car orientation from the
   route tangent and add only subtle drift/smoke effects. Every effect must be
   safe under `prefers-reduced-motion` and must not obscure state or controls.
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
