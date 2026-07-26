# Dashboard live-adapter QA FAIL response

**Auditor verdict:** FAIL
**Builder authorization:** Blocked
**Response scope:** Specification only; no runtime implementation

The ten findings were accepted as valid. Their resolutions are authoritative in
`docs/superpowers/specs/2026-07-21-dashboard-live-adapter-resolved-design.md`.

## BF-1 — Staleness conflict

**Fixed.** Import rejects only when age is greater than 900000 ms or future skew
is greater than 120000 ms; exact boundaries pass. After acceptance, one
display-only 60000 ms interval updates fresh/aging/stale labels and never
revalidates, reloads, rejects, or changes source. This interval is an explicit
exception to the timer ban and is not data polling.

## BF-2 — Missing closed enums and compatibility matrix

**Fixed.** The resolved design defines closed enums for source kind, status,
permission, activity kind, confidence, and provenance, followed by an exhaustive
source/status/activity/permission/confidence/provenance matrix. Unlisted
combinations reject the whole snapshot.

## BF-3 — Missing numeric limits

**Fixed.** The design pins 262144 input bytes, 64 normalized sessions, 15-minute
import age, 2-minute future skew, 1-minute label tick, 256 raw records, 1 MiB
process buffers, and all relevant per-field/display-name limits.

## BF-4 — Ambiguous tmux framing

**Fixed.** Delimiter splitting and tmux `q` are prohibited. The exact `-F`
argument uses `#{n:field}:#{field}` byte-length framing for nine named fields.
The Buffer parser consumes a fixed record magic, digit length, colon, exact byte
count, and final LF; fatal UTF-8 and semantic validation follow. Any malformed,
partial, extra, inconsistent, or excessive data rejects the collection. Tests
must include delimiters, newlines, control bytes, colons, backslashes, and record
magic inside synthetic titles.

## BF-5 — Server epoch unavailable in one command

**Fixed with observed evidence.** tmux 3.7 expanded both `socket_path` and server
`start_time`, plus all pane identifiers, through one `list-panes -a -F` call.
`start_time` is the epoch. No second tmux command is required.

## BF-6 — execFile hardening unspecified

**Fixed.** The design pins two absolute Homebrew binaries, current-UID default
socket validation, a minimal explicit environment, `cwd:/`, `shell:false`,
Buffer encoding, 3000 ms timeout, 1 MiB maxBuffer, and SIGKILL. It defines exact
success conditions and closed sanitized error codes. Any stderr, nonzero exit,
timeout, signal, truncation, spawn failure, partial output, or parse error
discards stdout and emits no JSON.

## BF-7 — Hash confidentiality and construction

**Fixed.** The claim is now opacity/stability, not confidentiality. SHA-256 input
is the exact UTF-8 sequence `dashboard-tmux-id-v1 NUL socket_path NUL start_time
NUL pane_id`; output is `tmux-` plus the first 32 lowercase hex characters.
Duplicate pane IDs or hashes reject the entire collection; recovery is forbidden.

## BF-8 — Mixed-source lifecycle undefined

**Fixed.** A closed fixtures/validating/live/rejected_fixtures state machine now
defines success, failure, reimport, and reset. Validation is off-DOM; every
transition clears pin/focus/tooltip and age timer; every committed result is a
fresh full render. Per-render AbortControllers tear down listeners. The file
input resets after every attempt.

## BF-9 — Unknown placement/capacity ambiguity

**Fixed.** Unknown no longer shares the six idle/complete anchors. Pit Stop gains
a hidden-when-empty, structurally distinct `Unclassified hold` with three gray
`?` anchors and independent deterministic allocation/overflow. Unknown never
displaces idle or complete. Total capacity becomes 37.

## BF-10 — Raw title/name leakage

**Fixed.** The design defines exact window-name normalization and an 80-code-point
output limit. Pane titles are never emitted or displayed. Diagnostics and error
messages allow only closed codes/enums/versions/counts, never raw names, paths,
IDs, commands, filenames, Node messages, or stacks. Tooltips use sanitized
display names via text nodes. Tests/screenshots use synthetic data only; captured
runtime observations are forbidden in committed artifacts.

## Additional precision added

- Candidate LLM-pane admission is explicit; unrelated panes are omitted rather
  than mislabeled unknown.
- Classifier precedence and ASCII token boundaries are pinned.
- Control-bearing titles cannot drive keyword classification.
- Custom tmux sockets and non-Homebrew binaries are explicit future scope.
- The sole authorized timer is UI-only staleness text; data polling remains
  prohibited.

## Verification performed

- One read-only tmux 3.7 `list-panes -a -F` query confirmed all required format
  variables expand in one command.
- Local tmux 3.7 source/manual review confirmed `#{n:field}` is UTF-8 byte length
  and `q` is not a control-character-safe codec.
- Node v24 `execFile` behavior was reviewed for Buffer encoding, timeout,
  maxBuffer, partial output, and nonzero exit behavior.
- `git diff --check` passes after the documentation changes.

No implementation or runtime configuration changed. Builder remains blocked
pending Claude PASS and explicit “Builder may begin.”
