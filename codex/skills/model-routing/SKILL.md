---
name: model-routing
description: Choose a model or reasoning effort when task complexity or allowance requires a routing decision.
---

# Model Routing

The installed config and role profiles own model pins. Inspect them only when
choosing or changing routing; do not maintain another model table in skills.

Use the default for routine delivery, the architecture profile for hard
regressions and public/security contracts, and the research profile only for
ambiguous investigations. Mechanical work can use a lighter model when it is
available. Report unavailable selections rather than silently substituting.

Choose at a task boundary. Avoid starting a new session just to summarize an
existing diff, and do not delegate routine sequential phases. Check
`codex-budget status --model <selected-model>` before costly work. A lower
model does not replenish shared allowance.
