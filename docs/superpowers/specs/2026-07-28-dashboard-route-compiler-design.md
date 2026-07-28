# Dashboard Route Compiler Design

Date: 2026-07-28

Status: complete — final independent post-change re-review PASS; no blockers;
commit/push authorized

Delivery mode: Gated Delivery

## Objective

Replace the Night Pass dashboard's hand-synchronized route geometry with a
dependency-free, checked-in Node compiler. A route author supplies one
continuous SVG cubic path plus segment and anchor-placement metadata. The
compiler deterministically produces:

1. the existing deeply validated track-catalog input and sixteen route anchors;
2. the full and per-segment SVG path data used by the browser; and
3. separately distance-calibrated desktop and mobile CSS motion schedules.

The minimum useful outcome is that changing a canonical route source and
running one command updates every route-owned geometric representation, while
`--check` fails when committed generated artifacts do not match their sources.

## Delivery classification

This milestone uses **Gated Delivery**. It creates a cross-module authored and
generated data contract spanning route source files, the runtime catalog, SVG
hydration, CSS animation, unit tests, and browser verification. Builder work
must not begin until an independent pre-implementation review returns PASS or
all blocking findings have been resolved and re-reviewed.

## Evidence: facts in the current repository

These are observations, not new decisions:

- `dashboard/index.html` contains a full centerline and six separately copied
  segment paths for each course.
- `dashboard/src/track-catalog.mjs` independently contains sixteen `x`/`y`
  anchors per course.
- `dashboard/styles.css` contains four hand-authored responsive schedules:
  Ridge desktop/mobile and Cypress desktop/mobile.
- Each canonical centerline is one explicit uppercase absolute `M`, followed
  only by explicit uppercase absolute `C` commands. Ridge has 15 cubics;
  Cypress has 21.
- Ridge segment curve counts are `1/5/2/2/4/1`. Cypress segment curve counts
  are `1/4/3/4/4/5`.
- Ridge's current SVG route is inside
  `transform="translate(1000 0) scale(-1 1)"`, while its catalog anchors and
  CSS positions use displayed (already mirrored) coordinates.
- The SVG, vehicle layer, and tooltip layer all stretch to the map stage. The
  SVG uses `viewBox="0 0 1000 760"` and `preserveAspectRatio="none"`, so equal
  source-path distance is not equal screen distance at different aspect ratios.
- Cypress already has 513 visible motion positions. Ridge has 65. All four
  schedules then use the same `98.8%`, `99.2%`, `99.6%`, and `100%` hidden-reset
  sequence.
- Existing browser evidence uses representative map-stage dimensions
  `1160×682` desktop and `372×580` mobile.
- The current contracts require exactly 16 route slots, IDs `R01..R16`,
  segment capacity `2/3/3/3/3/2`, a 64-second CSS animation duration,
  four-second negative phase spacing, linear timing, hover/focus/pin pause,
  a hidden reset, and no route motion under `prefers-reduced-motion`.
- The fixture and manual one-shot live-import source axis is independent from
  track selection and placement.

### Verified pre-implementation blocker

Builder's geometry dry run reproduced an incompatibility in the previously
approved fixed-frame contract before any production implementation was kept.
With the prescribed adaptive length model, unchanged route geometry, final
four-decimal CSS serialization, and the representative `1160×682` desktop
profile, Ridge's 513-point uniform grid produced a maximum chord deviation of
`2.1104982310px`. The failure occurred in visible base interval `251` at its
`3/8` audit point. An internal cubic boundary with a sharp outgoing tangent
lies at equal-distance frame coordinate `251.3936 / 512`, so the CSS chord
crossed the join instead of ending at it.

The same dry run measured Ridge mobile at `0.2295544231px`, Cypress desktop at
`0.2024848339px`, and Cypress mobile at `0.3053174168px`. Those three profiles
passed, but they do not make the Ridge desktop failure optional. Exact 513
uniform visible positions, unchanged Ridge geometry, and the `<=0.5px`
serialized-output bound cannot all remain requirements. The partial compiler
implementation used to obtain these measurements was removed.

Decision: retain the 513-point uniform equal-screen-distance base grid and
merge every internal cubic boundary into the visible schedule at its own
screen-distance-derived percentage. This directly prevents interpolation
across every cubic join while preserving route geometry, the equal-distance
base cadence, 64-second timing, and the accuracy bound. Merely choosing a
denser uniform grid is rejected: it does not structurally prevent a chord from
crossing a sharp join, makes the new density arbitrary, and generates more
frames across the entire route rather than only at authored joins.

Gate impact: numbered acceptance criteria `1..3` and `5..10` are unchanged.
Acceptance criterion `4` now names the 513-base-plus-boundary construction,
collision policy, and derived count instead of a fixed visible-frame count.
The former general pre-implementation packet is replaced below by a focused
re-review packet for this correction. That focused review returned PASS and
authorized Builder implementation. The final independent post-change
re-review subsequently passed.

## Approved decisions

### Scope

The Builder may:

- add trusted, repository-owned route source modules under `dashboard/routes/`;
- add a dependency-free compiler under `dashboard/scripts/`;
- add two checked-in generated artifacts;
- replace route-owned `d` attributes in HTML with validated placeholders;
- import generated catalog input and synchronously hydrate SVG `d` attributes
  before existing application preflight;
- move route traversal assignments and keyframes from `styles.css` to the
  generated stylesheet;
- add focused compiler, drift, runtime-hydration, and browser tests;
- update dashboard run and verification documentation.

No route name, segment name, visible track shape, terrain treatment, selection
schedule, session contract, source behavior, slot allocation, interaction, or
timing contract is intentionally redesigned.

### Non-goals

- Tangent-derived car orientation, drift angle, tire smoke, or atmosphere.
  Generated anchor `angle` remains exactly `0`.
- A third course or a route editor.
- General SVG support. Version 1 accepts only the strict `M`/`C` subset below.
- Browser-side compilation, SVG DOM length APIs, a JavaScript animation loop,
  acceleration, braking, or corner easing.
- Runtime fetching of route files or generated fragments.
- A framework, runtime dependency, backend, daemon, persistence, telemetry,
  network service, process polling, or live tmux/WezTerm integration.
- Changes to fixture/live schema, the one-shot collector, tmux, WezTerm,
  wallpaper, LLM-status, installers, or default startup.

## File and component boundaries

### Authored inputs

```text
dashboard/routes/route-config.mjs
dashboard/routes/ridge-pass.route.mjs
dashboard/routes/cypress-run.route.mjs
```

`route-config.mjs` is the sole owner of stable catalog order, the `1000×760`
view box, and responsive calibration profiles. Each `*.route.mjs` file is the
sole human-authored owner of its road centerline, ordered segment-to-curve
mapping, and anchor locators. Decorative terrain/facility art and label
coordinates remain authored in `dashboard/index.html`; they are not route
geometry.

The modules are trusted repository code, not user input or a runtime security
boundary. Using ESM avoids silently accepting duplicate JSON object keys. Each
module must have exactly one default export, and compiler validation still
enforces exact closed object key sets and primitive types. Accepted records
must be plain objects with `Object.prototype` or `null` prototype; arrays,
dates, class instances, accessors, functions, symbols, and bigint values are
invalid anywhere in the source graph.

### Compiler

```text
dashboard/scripts/compile-routes.mjs
dashboard/scripts/lib/route-compiler.mjs
dashboard/scripts/lib/svg-cubic-path.mjs
```

- `compile-routes.mjs` owns argument parsing, source loading, digesting,
  byte-comparison, atomic writes, messages, and exit codes. It contains no
  geometry math.
- `route-compiler.mjs` owns schema validation, segment/anchor derivation,
  responsive schedule generation, invariants, and deterministic serialization.
  Its pure functions are directly unit tested.
- `svg-cubic-path.mjs` owns strict tokenization, cubic evaluation/derivatives,
  adaptive arc-length integration, distance inversion, path slicing, and
  canonical path serialization. It has no DOM or browser dependency.

### Generated artifacts

```text
dashboard/src/generated/route-geometry.mjs
dashboard/generated/route-motion.css
```

`route-geometry.mjs` exports only:

```text
GENERATED_TRACK_INPUT
GENERATED_ROUTE_GEOMETRY
```

`GENERATED_TRACK_INPUT` has the current track key set:

```text
id, title, artId, centerlineId, desktopAnimationName,
mobileAnimationName, segments, routeAnchors
```

Every generated route anchor has the current exact key set:

```text
id, poolLabel, x, y, angle
```

`GENERATED_ROUTE_GEOMETRY` contains an ordered object per track with exact keys
`id`, `centerlineD`, and `segmentPaths`. `segmentPaths` has six entries in
segment order, each with exact keys `cssClass` and `d`.

Both exported arrays, their objects, segment/path arrays, and anchors are
deeply frozen. `track-catalog.mjs` still validates and constructs its own
frozen public catalog rather than trusting generated freezing as validation.

Both generated files start with this ownership form, adapted to the file's
comment syntax:

```text
@generated by dashboard/scripts/compile-routes.mjs; DO NOT EDIT.
sources-sha256: <64 lowercase hex characters>
Run: npm --prefix dashboard run routes:write
```

The digest is SHA-256 over UTF-8 source bytes in this exact order, with a NUL
byte between the repo-relative path and contents and between entries:
`route-config.mjs`, then route files in `trackOrder`. There is no timestamp,
host path, username, locale-dependent text, or random value.

Generated MJS objects are first reconstructed with their documented fixed key
order. Anchor `x`/`y` values use the same four-decimal rounding and
negative-zero normalization as CSS coordinates; `angle` is the integer `0`.
The two values are rendered with `JSON.stringify(value, null, 2)` and wrapped
by one fixed, non-exported recursive `deepFreeze` helper. JSON string escaping,
two-space indentation, blank-line placement, declaration order, and the final
newline are therefore deterministic and golden-tested.

### Runtime integration

```text
dashboard/src/track-catalog.mjs
dashboard/src/hydrate-route-geometry.mjs
dashboard/src/app.mjs
dashboard/index.html
dashboard/styles.css
```

- `track-catalog.mjs` imports `GENERATED_TRACK_INPUT` and passes it through the
  existing catalog validator. Its public exports and the public track/anchor
  key sets do not change.
- `hydrate-route-geometry.mjs` uses
  `GENERATED_ROUTE_GEOMETRY`. It requires exactly one matching centerline
  placeholder and exactly six ordered segment placeholders inside each
  matching track-art group. It sets `d` with `setAttribute`; it never uses
  `innerHTML`.
- `startDashboard()` calls hydration synchronously before
  `preflightDocument()`. Any missing, duplicate, reordered, or mismatched
  placeholder throws into the existing fatal UI. No partial snapshot renders.
- `preflightDocument()` continues to verify each centerline is a unique
  `fill="none"` path inside the correct track group and additionally rejects
  an empty hydrated `d`.

## Authored contract

### Route config

The default export of `route-config.mjs` has this exact shape and no other
keys:

```js
{
  schemaVersion: 1,
  trackOrder: ['ridge-pass', 'cypress-run'],
  viewBox: { width: 1000, height: 760 },
  profiles: [
    { id: 'desktop', width: 1160, height: 682, targetDiameter: 52 },
    { id: 'mobile', width: 372, height: 580, targetDiameter: 44 },
  ],
}
```

Version 1 requires those two profile IDs in that order. The dimensions are
calibration dimensions, not claims that every browser will have those exact
map-stage pixels. They match the repository's regression viewports and account
for the non-uniform `preserveAspectRatio="none"` stretch. The CSS still uses
percentages, so it scales continuously at other dimensions.

`trackOrder` controls generated catalog order and therefore the current
workday automatic course selection. The compiler loads exactly
`<id>.route.mjs` for every ordered ID and rejects a duplicate ID, unsafe ID,
missing source, or extra `*.route.mjs` not named by the config.

Compiler validation retains the existing identifier boundaries before
generation:

- track IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- art, centerline, animation, and segment CSS class references match
  `^[a-z][a-z0-9-]*$`;
- title and segment labels are nonempty strings that are already equal to
  their trimmed form;
- track IDs, art IDs, centerline IDs, all desktop/mobile animation names, and
  segment CSS classes are unique in their relevant global sets;
- the route source `id` equals the config entry used to load it.

The compiler does not trim, coerce, repair, deduplicate, or infer any invalid
source value.

### Route source

Each route module's default export has this exact shape:

```js
{
  schemaVersion: 1,
  id: 'ridge-pass',
  title: 'Ridge Pass',
  artId: 'ridge-pass-art',
  centerlineId: 'ridge-pass-centerline',
  desktopAnimationName: 'ridge-pass-traverse-desktop',
  mobileAnimationName: 'ridge-pass-traverse-mobile',
  path: 'M82 72 C122 80 ... C861 716 912 728',
  segments: [
    {
      label: 'High Moor',
      cssClass: 'segment-high-moor',
      curveCount: 1,
      anchors: [
        { at: 0, lateralOffset: 0 },
        { at: 1, lateralOffset: 0 },
      ],
    },
    // Five more segments.
  ],
}
```

Route sources use **displayed coordinate space**. Ridge's canonical authored
path is therefore the exact horizontal complement of its current source path,
starting at displayed `(82,72)` and ending at `(912,728)`. The road geometry
is moved outside Ridge's mirrored decoration group. The existing decorative
terrain may remain under the transform. The route compiler does not implement
SVG transforms.

Every route has exactly six segments. `curveCount` assigns the next contiguous
canonical cubics to that segment. Counts must be positive integers and must sum
to the parsed path's cubic count. Version 1 locks the checked-in mappings to:

```text
ridge-pass:  1 / 5 / 2 / 2 / 4 / 1 = 15
cypress-run: 1 / 4 / 3 / 4 / 4 / 5 = 21
```

Segment anchor array lengths must be exactly `2/3/3/3/3/2`. The compiler
generates IDs `R01..R16`, labels from the containing segment, and `angle: 0`.

`at` is a finite segment-local arc-length ratio in the unscaled `1000×760`
display coordinate space. It is inclusive `0..1`. Values must be strictly
increasing within a segment. The compiler evaluates the point at that fraction
of the complete segment length, even when the segment spans several cubics.

`lateralOffset` is a finite signed distance in view-box units from that route
point. Zero is the centerline. Positive is to the left of forward travel using
the normalized map-space normal `(-dy, dx)`; negative is to the right. Version
1 permits `-27..27`, matching half the authored 54-unit road-surface width.
This scalar exists to preserve intentionally staggered reduced-motion anchors
without reintroducing authored `x`/`y` geometry. A zero-magnitude derivative at
an anchor is invalid because its normal is undefined.

At an exact internal cubic boundary, tangent evaluation uses the outgoing
cubic at `t=0`. Segment `at=0` uses the first cubic at `t=0`; segment `at=1`
uses the final cubic at `t=1`. This removes a normal-direction ambiguity at
joined curves.

After anchor generation, the compiler rejects:

- a non-finite coordinate;
- a center outside the `1000×760` view box;
- a target clipped at either calibration profile after applying its
  `targetDiameter`;
- any pair of anchors whose screen-space center distance is less than the
  profile's target diameter;
- any generated ID, segment order, or capacity different from the fixed
  contract.

The existing runtime catalog validator remains a second boundary.

### Strict SVG path grammar

Version 1 accepts exactly:

```text
M x y C x1 y1 x2 y2 x y C x1 y1 x2 y2 x y ...
```

- Commands must be explicit uppercase absolute `M` and `C`.
- There is exactly one `M`, it is first, and at least one `C` follows.
- Every cubic has its own explicit `C`; implicit repeated coordinate packs are
  rejected.
- Between numeric tokens, a separator is either one or more ASCII whitespace
  characters, or one comma surrounded by optional ASCII whitespace. Empty
  tokens, repeated commas, and a trailing comma are rejected.
- Numbers match `-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?`. Leading `+`, exponent
  notation, omitted leading zero, `NaN`, and `Infinity` are rejected.
- Any unconsumed character, relative command, close path, line, quadratic,
  arc, shorthand, or extra coordinate is rejected.
- Every point and control point must be inside the inclusive configured view
  box. Every cubic must have positive arc length.

The generated canonical `d` uses `M`/`C`, one ASCII space between every token,
no commas, and normalized finite decimals with no exponent, leading `+`,
negative zero, or unnecessary trailing zeros.

## Numerical algorithm and accuracy contract

There is no fixed 4,096-sample approximation. Distance is computed from each
cubic's analytic derivative with deterministic adaptive Simpson integration in
the relevant coordinate space.

For a cubic `B(t)`, `t ∈ [0,1]`, integrate `|B'(t)|` as follows:

1. Compute Simpson's estimate over `[a,b]` and over its two equal halves.
2. If `abs(Sleft + Sright - Swhole) <= 15 × epsilon`, return the corrected
   estimate `Sleft + Sright + (Sleft + Sright - Swhole) / 15`.
3. Otherwise recurse into both halves, passing `epsilon / 2` to each.
4. The initial absolute epsilon is `1e-7` units per cubic in the coordinate
   space being integrated. Maximum recursion depth is 24. Reaching that depth
   without convergence is a compile error, not a best-effort result.

For source anchors, coordinates are the `1000×760` map units. For each motion
profile, first transform all points by `width/1000` and `height/760`, then
integrate in profile pixels. Thus desktop and mobile schedules traverse the
same canonical curve but are independently screen-distance calibrated.

To locate a requested cumulative distance:

1. select the containing cubic from its cumulative integrated lengths;
2. bisect cubic `t` in `[0,1]`;
3. compare the adaptively integrated partial length to the requested local
   distance;
4. stop at residual `<= 1e-7` profile pixels/map units, or after 60
   iterations;
5. after 60 iterations, residual greater than `1e-5` is a compile error.

Version 1 starts with exactly **513 base positions**: endpoints of 512 equal
profile-distance intervals. It then adds one candidate at every internal cubic
boundary, using that profile's cumulative screen-space distance to derive the
candidate's timeline percentage. The base grid and boundary candidates are
computed independently for desktop and mobile because non-uniform responsive
scaling changes cumulative distance.

For each profile and route, candidate construction and percentage collision
handling are exact:

1. Base candidate `i=0..512` has route-distance fraction `i / 512`, kind
   `base`, and base index `i`.
2. Boundary candidate `k=1..curveCount-1` is the shared point after cubic `k`
   and before cubic `k+1`. Its route-distance fraction is the cumulative
   profile-space length through cubic `k` divided by total profile length. It
   has kind `boundary` and boundary index `k`.
3. Each candidate independently derives `98.8 × route-distance fraction` and
   serializes that percentage with the shared four-decimal rule before any
   collision decision.
4. Candidates are first ordered by unrounded route-distance fraction, then
   kind (`boundary` before `base`), then their numeric index. They are grouped
   by the exact serialized percentage string.
5. A group containing two distinct boundary candidates is a compile error.
   An internal boundary that serializes to endpoint `0%` or `98.8%` is also a
   compile error. The compiler never discards a boundary or either route
   endpoint.
6. A group containing one boundary and one or more interior base candidates
   retains only the boundary candidate. A base-only group must contain exactly
   one candidate; otherwise compilation fails. Retained groups are emitted in
   strictly increasing numeric percentage order.

The retained boundary coordinate is the exact canonical point at its
unrounded boundary distance, then serialized through the normal four-decimal
coordinate rule. The percentage remains the already serialized
screen-distance-derived percentage. Consequently, percentage rounding can
place that coordinate a tiny distance from the ideal point for the serialized
time; the output audit below includes the retained keyframe itself and must
still pass.

The visible frame count is therefore deterministic but profile/route
dependent:

```text
visible count =
  513 + internal boundary count
      - boundaries that collide with an interior base percentage
```

Subject to the collision rejections above, Ridge has `513..527` visible
frames and Cypress has `513..533`. The compiler must not pad either result to a
common count, omit a non-colliding boundary, or silently increase base-grid
density.

The deviation audit reconstructs positions from the final serialized
keyframe percentages and coordinates, uses the browser's piecewise-linear CSS
interpolation for every adjacent pair of retained visible frames, and evaluates
each interval at temporal fractions `0/8..8/8`. It compares against the exact
responsive curve position at the same overall serialized timeline fraction,
where route-distance fraction is `timelinePercent / 98.8`. Including `0/8` and
`8/8` explicitly audits base and boundary keyframe centers as well as their
chords. The maximum screen-space deviation must be `<=0.5px` in both profiles.
The audit therefore includes percentage and coordinate rounding rather than
auditing only unrounded compiler values. Any current or future course that
fails this bound fails compilation; frame density or tolerance cannot change
without a reviewed contract/version change.

Every serialized visible keyframe center must also contain the profile's
complete target circle inside the profile rectangle. Because a rectangle is
convex, the linear interpolation between two contained centers remains
contained.

The compiler retains the 65 serialized base-grid percentage milestones whose
base indexes are `0, 8, 16, ... 512`. If a boundary replaces a base candidate
at one of those percentages, the retained boundary frame is that milestone.
For each of the 64 consecutive milestone ranges, the compiler sums all
serialized CSS chord portions in that range, including every inserted boundary
frame. For each profile and track:

```text
(maximum group length - minimum group length) / mean group length × 100 <= 5
```

The calculation uses final serialized coordinates converted back to profile
pixels and the final retained-frame ordering. This preserves the current
constant-speed acceptance rule without treating an inserted boundary as an
extra equal-duration base interval.

Finally, the compiler evaluates the full 16-slot phased CSS schedule at 512
uniform timeline samples over the 64-second animation, including reset opacity.
For every pair whose interpolated opacity is greater than zero, screen-space
center distance must be at least that profile's target diameter. This
deterministic compile-time audit supplements, but does not replace, the
continuous browser sweep.

## CSS timeline and deterministic serialization

The CSS animation duration remains `64s`, timing remains `linear`, and the
runtime phase remains `-slotIndex × 4s`. The forward traversal occupies the
existing `0%..98.8%` portion of that animation. This design does not relabel it
as a literal 64-second visible leg: the exact existing CSS behavior is the
protected contract.

For base position index `i=0..512`:

```text
timeline percent = 98.8 × i / 512
route distance   = total profile length × i / 512
left percent     = source x / 1000 × 100
top percent      = source y / 760 × 100
```

Internal-boundary positions use the same formulas with `i / 512` replaced by
their profile-space cumulative-distance fraction. Base and boundary candidates
then follow the ordering and post-serialization collision rules in the
numerical contract.

Percentages and `left`/`top` values are rounded with JavaScript `toFixed(4)`,
then trailing zeroes and a trailing decimal point are removed. `-0` serializes
as `0`. A serialized percentage is emitted once only. Properties are emitted
in the fixed order `left`, `top`, `opacity` where opacity is present. Each
declaration and brace follows a fixed template; tracks follow `trackOrder`;
desktop precedes mobile. UTF-8 output ends with one newline.

The base endpoint remains the sole visible frame at `98.8%` and is emitted
once with `opacity: 1`, followed by the existing hidden reset. Boundary
insertion never adds, moves, merges, or renumbers a reset milestone:

```css
99.2% { left: <last>; top: <last>; opacity: 0; }
99.6% { left: <first>; top: <first>; opacity: 0; }
100% { left: <first>; top: <first>; opacity: 1; }
```

`route-motion.css` owns, per track:

- the desktop active/thinking animation shorthand using the generated desktop
  name, `var(--route-lap-duration) linear infinite`, and the existing
  `var(--route-phase, 0s)` delay;
- both generated `@keyframes`;
- a single `@media (max-width: 759px)` override to the mobile animation name
  for active/thinking cars.

`index.html` loads `generated/route-motion.css` **before** `styles.css`.
`styles.css` keeps the later hover/focus/pin pause selectors and reduced-motion
`animation: none !important` rule, so the generated shorthand cannot override
inspection or accessibility behavior. Hand-authored track animation
assignments and all four hand-authored keyframe blocks are removed from
`styles.css`.

## SVG hydration and first-paint decision

The route centerline and six colored segment paths remain actual static SVG
`<path>` elements in `index.html`, but their route-owned `d` attributes are
removed. Segment placeholders use exact ordered
`data-route-segment-index="0"` through `"5"` markers and retain their existing
classes. Road `<use>` elements continue to reference the centerline ID.

Generated JS synchronously supplies all seven `d` values before application
preflight and before any snapshot render. The source path is therefore the
only human-authored route geometry; full and segment paths may be duplicated
only in generated output.

Decision: a road-less pre-JavaScript paint is acceptable. The map background
and decorative course art still paint, the app already requires JavaScript to
render any session, and the existing `<noscript>` message states that
requirement. Keeping a second generated copy embedded in hand-maintained HTML
would weaken the sole-source contract. Hydration failure must render the
existing visible fatal state, never a silent or partially interactive map.

## CLI contract

Add these scripts to `dashboard/package.json` without adding a dependency:

```json
"routes:write": "node scripts/compile-routes.mjs --write",
"routes:check": "node scripts/compile-routes.mjs --check",
"test:unit": "node --test tests/*.test.mjs"
```

The CLI accepts exactly one of `--write` or `--check`.

- `--check` compiles entirely in memory and performs byte-for-byte comparison
  with both generated artifacts. It never writes.
- `--write` validates and compiles both outputs in memory before writing
  either. If either committed artifact differs, it stages and replaces both
  artifacts through same-directory temporary files followed by rename, then
  reports `routes: wrote 2 artifacts`. If neither differs, it reports
  `routes: up to date`. If preparing or staging either output fails, neither
  committed artifact is changed. A rename/IO failure is reported as exit `2`;
  the next `--check` remains authoritative because no filesystem offers an
  atomic transaction across these two directories. Temporary names contain
  the artifact basename and process ID and are removed on handled failure.
- Paths in messages are repository-relative. Successful output is one concise
  line: either `routes: generated artifacts are current`,
  `routes: up to date`, or `routes: wrote 2 artifacts`.
- Drift/missing output under `--check` lists only the affected generated paths,
  one per line. Validation errors identify the source and field/segment/anchor
  index but do not print whole source objects.

Exit codes:

```text
0   successful check or write
1   --check found missing or byte-different generated artifacts
2   source load, schema, geometry, invariant, digest, read, or write failure
64  missing, extra, or unsupported CLI argument
```

## Migration plan

1. Capture the current displayed centerline controls, sixteen anchors, and four
   schedule blocks before deleting duplication.
2. Write both canonical source paths in displayed coordinates. For Ridge,
   horizontally complement every path x/control-x exactly once and move only
   route-owned road/segment paths outside the mirrored decoration group.
3. Seed each anchor's segment-local `at` and signed `lateralOffset` by fitting
   the current displayed anchor to its labeled segment. Values are authored
   scalars; generated `x`/`y` are not copied back into route source.
4. Run `routes:write`, then compare legacy and generated geometry before
   removing the legacy blocks.
5. Switch catalog, hydration, HTML placeholders, and CSS loading in one
   coherent change. No commit may contain a runtime import of an absent
   generated artifact.
6. Run all static and browser verification, record measured migration results
   in `dashboard/tests/BROWSER_VERIFICATION.md`, and obtain post-implementation
   review before calling the roadmap item complete.

Required migration tolerances:

- centerline and six segment curves: identical displayed Bézier control points
  after canonical serialization (zero geometric change);
- every reduced-motion anchor center: no more than `0.5` view-box unit from
  its legacy `x`/`y`;
- at every legacy visible keyframe percentage, the generated/interpolated
  center: no more than `0.75px` from the legacy center at each calibration
  profile;
- generated base-plus-boundary keyframes and their intervening CSS chords: no
  more than `0.5px` from the responsive canonical centerline under the
  compiler's serialized-output audit and no more than `1px` under browser
  measurement;
- no lower edge clearance, pairwise center separation, or target-containment
  assertion may be weakened to make migration pass.

If an existing anchor cannot be represented within tolerance using
`at` plus a permitted lateral offset, implementation stops for architecture
review; the Builder must not raise the `27`-unit bound or copy `x`/`y` into the
source.

## Data, privacy, security, and protected boundaries

- Route modules and compiler output contain only original local visual
  geometry and public display labels. They never consume fixture or live
  session data.
- The compiler reads the named config, its ordered route modules, the route
  directory names needed to reject orphan sources, and its two generated
  targets. It does not follow a source-provided path or invoke a shell, child
  process, browser, tmux, WezTerm, or network API.
- Runtime hydration imports a checked-in local module. It does not read the
  filesystem, fetch, poll, persist, or execute generated strings.
- Generated CSS/JS contains no external URL, source map URL, runtime timer, or
  analytics.
- Existing one-shot live-adapter validation and privacy rules are unchanged.
- No file outside `dashboard/` changes except this spec, the existing roadmap,
  and durable verification documentation.

## Accessibility and interaction preservation

- Route geometry remains `aria-hidden`; meaningful state and location text
  still comes from the same buttons, tooltips/readout, segment labels, and
  status rail.
- Generated anchors preserve segment labels and IDs, so accessible location
  names do not change.
- Hover, focus-within, Enter/Space pinning, Escape clear, and visible focus
  behavior remain unchanged.
- The generated stylesheet is ordered so pause selectors retain precedence.
- `prefers-reduced-motion` disables both route and nested car animation. Cars
  remain at deterministic generated static anchors with the same accessible
  state.
- Desktop targets remain 52px; mobile targets remain true 44px circles.
- Hydration adds no keyboard control and no live-region announcement.

## Verification plan

### Compiler/unit tests

Add `dashboard/tests/route-compiler.test.mjs` and focused fixtures as needed.
Tests must cover:

- exact schema acceptance for both checked-in sources;
- unsupported/missing keys at config, route, segment, and anchor depth;
- unsafe/duplicate/missing/extra track IDs and source files;
- strict path grammar acceptance plus rejection of relative, implicit,
  shorthand, close, extra, exponent, non-finite, out-of-range, and malformed
  inputs;
- exact parsed cubic counts and segment mappings for both tracks;
- known cubic point/derivative values and line-equivalent cubic arc length;
- adaptive integration convergence and explicit max-depth failure;
- distance inversion at `0`, curve boundaries, and total length;
- anchor ID/label/capacity/order generation, lateral-offset sign, angle `0`,
  bounds, profile containment, and pairwise separation;
- exactly 513 base candidates, every internal cubic-boundary candidate, the
  pinned post-four-decimal collision rules, and the derived profile/route
  visible-frame count;
- rejection of two boundaries at one serialized percentage or a boundary at a
  serialized endpoint; boundary-over-base precedence at an interior collision;
- all retained boundary frames occur at their deterministic
  screen-distance-derived percentage and no non-colliding boundary is omitted;
- a Ridge desktop regression reproduces the former base-only interval `251`
  failure, emits the boundary at equal-distance coordinate `251.3936 / 512`,
  and verifies the revised serialized schedule passes `<=0.5px`;
- the sole `98.8%` visible endpoint is followed by exactly three reset frames;
- monotonically increasing unique visible percentages;
- profile-specific coordinates from the same canonical path;
- final serialized base/boundary keyframe and chord deviation `<=0.5px`, plus
  64 base-milestone-group distance variation `<=5%`;
- complete visible-frame containment and 16-phase separation using the pinned
  compiler audit;
- deterministic source digest, order, precision, negative-zero handling,
  newline, and byte-identical repeated compilation;
- `--check` current/drift/missing behavior and exit `0/1`;
- validation/IO and usage exit `2/64`;
- `--check` performs no write and `--write` does not leave one artifact updated
  when preparation fails;
- generated ownership headers and absence of timestamps/absolute paths.

Update existing tests to verify:

- the public track and anchor key sets remain exact and deeply frozen;
- `R01..R16`, `2/3/3/3/3/2`, allocation/collision/overflow, phase, and source
  independence remain unchanged;
- every placeholder hydrates once with the generated path for its track;
- missing/duplicate/reordered placeholders and empty paths fail visibly;
- generated animation definitions and assignments are unique;
- base CSS loads after generated CSS and still owns pause/reduced motion;
- no hand-authored route `d` or route `@keyframes` remains in HTML/base CSS.

### Commands

From the repository root:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
git diff --check
```

Also run `node --check` on every changed or generated `.mjs` file.

### Browser verification

Use fixture mode only at 1440×900 and 390×844 for both tracks:

- dashboard and route are nonblank after hydration;
- centerline, road uses, and six colored segment paths are present;
- 24-session fixture renders without console warning/error;
- normal active/thinking motion runs and remains within `1px` of the displayed
  centerline;
- computed animation duration is `64s`, timing is `linear`, correct track and
  responsive animation names apply, and four-second phase spacing remains;
- hover, keyboard focus, and pin pause route plus nested motion; leave/blur and
  Escape resume according to the existing interaction contract;
- reduced motion produces `animation-name: none` and uses generated static
  anchors;
- desktop/mobile full targets have zero clipping/overlap and the document has
  zero horizontal overflow;
- track switching preserves source snapshot, button identity, focus, and pin;
- neutral desktop/mobile screenshots remain correctly framed. Pixel identity
  is not required because Ridge gains denser curve-following frames.

A sixteen-route synthetic fixture remains a manual/exhaustive geometry check;
it must never read the user's tmux server.

## Acceptance criteria

Implementation is acceptable only when:

1. each track has one human-authored continuous displayed-coordinate path and
   no hand-copied route coordinates in catalog, HTML `d`, or base CSS;
2. the generated catalog retains the exact public keys, sixteen anchors,
   `R01..R16`, segment order/capacity, and `angle:0`;
3. full/segment SVG geometry is generated from contiguous canonical cubics;
4. desktop/mobile schedules are independently calibrated in screen pixels and
   satisfy the pinned 513-base-plus-boundary construction, collision,
   variable-count, deviation, distance-variation, precision, and reset
   contracts;
5. `routes:check` detects any missing or stale generated artifact without
   writing;
6. app startup hydrates and validates geometry before snapshot render and
   fails visibly on mismatch;
7. fixture/live source behavior, workday course selection, allocation,
   overflow, focus/pin/pause, and reduced motion have no regression;
8. unit and Playwright suites pass with clean browser consoles and no
   clipping/overlap/horizontal overflow at both target widths;
9. no dependency, backend, network, storage, telemetry, process integration,
   default-startup, tmux, WezTerm, wallpaper, or LLM-status change is present;
10. implementation receives an independent post-change review before the
    roadmap item is marked complete.

## Observability impact

Runtime observability impact is **none**. No logging, telemetry, polling,
timer, network call, or persisted state is added. Hydration failures use the
existing visible fatal-state path and browser regression continues to reject
console warnings/errors.

Build-time observability is limited to the compiler's deterministic one-line
success message or bounded path/field diagnostics. Generated artifact drift is
observable through `routes:check` exit code `1`.

## Rollback and removability

The compiler is local to `dashboard/routes`, `dashboard/scripts`,
`dashboard/generated`, and `dashboard/src/generated`, plus the small runtime
hydrator/import changes. Rollback is a single revert restoring the prior
catalog input, HTML `d` attributes, and CSS keyframes. It does not require a
data migration because there is no persistence and no session-schema change.

The whole optional dashboard remains removable without affecting terminal
configuration. Removing only the compiler while keeping generated artifacts is
not a supported steady state because it would remove drift verification.

## Final gated-delivery handoff

Gate decision: **complete**. The delivery record is: initial independent PASS;
one contract correction with focused re-review PASS; implementation review
FAIL with four blockers; focused fixes; and final independent post-change
re-review PASS with no blockers. Commit/push is authorized. There are no
unresolved Builder choices. Any future change to the strict path subset,
513-point base grid, mandatory boundary insertion, collision policy, numeric
tolerances, anchor offset bound, generated public key set, or first-paint
decision returns to Lead Architect review.

Authoritative verification: `routes:check` passed; syntax checks passed;
Node checks passed 116/116; and Playwright passed 12/12 across desktop/mobile,
including seven deterministic timeline samples with `<=1px` centerline
alignment, `>=52/44px` separation, and zero clipping. Ridge audited 527/527
frames and Cypress 533/533; maximum audited deviation/distance variation was
`0.42554/0.03614px` (Ridge) and `0.17530/0.09880px` (Cypress), with maximum
anchor delta `0.0048` view-box unit. Screenshots were unchanged, the test
server was stopped, the protected-boundary scan was clean, and no dependency
or lockfile changed. `npm audit` was unavailable because sandbox DNS failed
and escalation was policy-rejected; it is not recorded as a successful audit.

Runtime observability remains unchanged; deterministic build-time CLI
diagnostics are sufficient. Next owner/task: Lead Architect — roadmap item 3,
tangent orientation and atmosphere, respecting the compiler tangent-metadata
boundary.

## Focused independent re-review packet

```text
Role:
You are the independent lead auditor for the optional Night Pass dashboard
route-compiler frame-contract correction.

Stage:
Focused pre-implementation re-review after a verified numerical blocker.
Builder's partial implementation was removed. Builder must not resume unless
your verdict is PASS.

Scope:
Audit only the revised visible-frame construction, percentage
serialization/collision rules, deviation and constant-speed audits, reset
sequence, derived counts, tests, and their effect on acceptance criterion 4.
Confirm that the correction closes the measured Ridge failure without creating
hidden Builder choices. Previously approved unrelated compiler boundaries are
out of scope unless this correction contradicts one.

Context:
The former contract required exactly 513 equal-distance visible positions,
unchanged geometry, and <=0.5px maximum deviation after CSS serialization.
Builder's dry run measured Ridge desktop at 2.1104982310px in base interval
251 at 3/8. A sharp internal cubic boundary lies at equal-distance coordinate
251.3936/512. Ridge mobile measured 0.2295544231px; Cypress desktop
0.2024848339px; Cypress mobile 0.3053174168px. The partial implementation was
removed.

Protected behavior:
- canonical route geometry and 513-point equal-distance base grid;
- 64s linear animation, -4s per slot, hidden 98.8/99.2/99.6/100 reset;
- hover/focus/pin pause, Escape/resume, reduced-motion static anchors;
- <=0.5px compiler deviation and <=5% 64-group distance variation;
- no terminal/config/live-collector change.

Revised frame contract:
- create 513 uniform equal-screen-distance base candidates per profile;
- add every internal cubic boundary at its profile-space cumulative-distance
  percentage;
- serialize percentages to four decimals before grouping;
- reject multiple boundaries at one serialized percentage and any internal
  boundary at 0%/98.8%; at an interior boundary/base collision retain the
  boundary; otherwise retain the sole base;
- emit retained groups in strictly increasing percentage order, yielding the
  documented profile/route-dependent count;
- audit each adjacent retained interval at 0/8..8/8 against the exact route at
  the serialized time, including keyframe centers;
- retain 64 constant-speed groups delimited by every eighth base-grid
  percentage and sum any boundary-split chords inside each group;
- leave the sole 98.8% visible endpoint and all hidden reset milestones
  unchanged.

Acceptance criteria:
Review revised acceptance criterion 4 and confirm all other numbered criteria
remain coherent and unchanged.

Protected boundaries:
No tmux, WezTerm, wallpaper, LLM-status, installer, startup, collector,
fixture/live schema, runtime network, storage, daemon, polling, telemetry,
third-party asset, framework, or new dependency.

Relevant source contents:
- docs/superpowers/specs/2026-07-28-dashboard-route-compiler-design.md
- docs/superpowers/plans/2026-07-27-dashboard-roadmap.md

Verification:
Recompute the count formula and collision cases. Challenge percentage rounding
at inserted boundaries, endpoint preservation, monotonic CSS emission, the
0.5px serialized-output audit, the 64 base-milestone groups, and the unchanged
reset sequence. Confirm tests exercise boundary/base collision, multi-boundary
and endpoint rejection, the measured Ridge join, and all four route/profile
outputs.

Known non-goals:
No geometry redesign, acceleration/easing, tangent orientation, general SVG
support, third track, runtime compiler, dependency, or live integration.

Output required:
1. PASS or FAIL verdict.
2. Explicit Builder authorization: may begin / must not begin.
3. Blocking findings, each with minimal resolution.
4. Collision/count/deviation/distance-group/reset invariant audit.
5. Missing focused tests and non-blocking recommendations.
6. Cross-cutting acceptance and existing-contract audit.
7. Protected-boundary and observability audit.
8. Explicit sign-off status and exact remaining conditions.
```
