# Salesforce Org Lease for Concurrent Claude Sessions - Implementation Plan

## Decisions you need from me

None open. Three were settled before execution began:

1. **Reuse the existing resolver rather than a rules file.** `~/.claude/hooks/track-crm-org.sh` already resolves org identity from `SF_ORG_ALIAS` / `SF_BASE_URL` / `TEST_ENV` / `SF_SCRATCH_POOL` and reads the real `.env.<TEST_ENV>`. Its logic is extracted into a committed, tested `bin/sf-org-resolve`; no rules table, no org names in git.
2. **Hooks ship behind `SF_LEASE_ENABLE`.** A blocking `PreToolUse` hook takes effect immediately in every live session; a bug would block every Bash call everywhere, including the session you'd need to fix it from. Opt-in until Task 4 verification passes.
3. **Advisory, single-machine, Claude-driven runs only.** TTL-based release, not pid-based. A command typed in a bare terminal is not covered.

## Assumptions I have not verified

- **That a bare `npx playwright test` in `e2e-automation` resolves to the same org that `canary`'s `npm run test:staging` targets.** This is the whole premise: if they resolve to different identities, no collision is ever detected. Task 1 Step 8 verifies it against the real `.env` files before anything is built on top.
- **That `SessionEnd` fires in this Claude Code version.** It is the clean release path. If absent, the TTL is the only backstop - degraded, not broken.
- **That there are only two shared orgs today** - one covering staging-shaped runs, one covering prod-shaped runs - with more expected later. (Real names live only in the local, uncommitted `~/.config/sf-org-identity/map`, never in this plan.)

**Verified during pre-flight, no longer assumptions:** `.cwd` is present in `PreToolUse` payloads (`~/.claude/hooks/track-crm-org.sh:12` reads it in production). `jq` is at `/usr/bin/jq` 1.7.1-apple.

## Known hazard, out of scope

`~/.claude/statusline.sh` is a **plain copy, not a symlink**, and has drifted 130 lines from `claude/statusline.sh`. The installed copy has a session-aware `resolve_crm_org "$ROOT" "$SESSION_ID"` reading the `session-orgs` store; the committed version does not. **The next `./install-macos.sh` run will overwrite the installed copy and destroy that feature.** A live peer session is working in this repo and may own that drift, so this plan does not touch it. Converging `track-crm-org.sh` and the statusline onto `bin/sf-org-resolve` is deliberate follow-up work, not part of this branch.

---

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop two concurrent Claude sessions from running test suites against the same Salesforce org, where the collision currently surfaces as flake rather than as a conflict.

**Architecture:** Four layers, each independently testable. `bin/sf-org-resolve` answers "which org would this command touch?" by reading the same config the run itself reads. `bin/sf-lease` owns an advisory lease store keyed on that identity. A `PreToolUse` hook composes the two: resolve, claim, block with the holder named. `PostToolUse` and `SessionEnd` release; a TTL is the backstop for a session that dies. Enforcement sits at the Bash tool because that is how Claude sessions run suites - so no team repo is touched and CI is never involved.

**Tech Stack:** bash + `jq`. No new dependencies.

## Global Constraints

- **Everything ships in this repo.** No file in `e2e-automation`, `canary`, `bearoku`, or `FuzzyMatcher` is created or modified.
- **Do not modify `~/.claude/hooks/track-crm-org.sh` or `~/.claude/statusline.sh`.** Untracked, live, and possibly owned by another session. See the hazard note above.
- **No LeanData identifiers in committed files.** No real Salesforce org alias, sandbox login tag, org id, or `*.my.salesforce.com` host in any tracked file - real values live only in the local, uncommitted `~/.config/sf-org-identity/map`. Tests and examples use `orga` / `orgb` / `my-e2e-repo` / `00Dfake0000000001` / `shared-one` placeholders only. Task 4 Step 4 scans every tracked file to enforce this (a staged-diff grep cannot see an already-committed one). This repo's `origin` is a public personal dotfiles remote, so this is not a formality.
- **Resolvers may read `.env*`; nothing may print its contents.** `bin/sf-org-resolve` extracts an org identity and emits only that identity. It must never echo a full line, a URL, or any other value from an env file. This is the same boundary `track-crm-org.sh` already operates within: `block-env-read.sh` stops *Claude* from reading `.env` through Bash, and says nothing about a hook extracting one field.
- **Hooks fail open.** Missing binary, unreadable config, or internal error exits 0. Only a live competing holder exits 2.
- **Match existing conventions exactly:**
  - Shell scripts: `#!/usr/bin/env bash`, `set -euo pipefail` (or `set -uo pipefail` where non-zero returns are signal).
  - State dirs: `${<NAME>_HOME:-$HOME/.local/state/<name>}`, as `bin/session-objective:17`.
  - **Tests follow `scripts/test-session-objective.sh`**: `repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"`, a `jq` presence check, an isolated store via the `_HOME` env var with `mktemp -d` + `trap ... EXIT`, a `check() { label want got }` helper printing `  ok   ` / `  FAIL ` with want/got, a `failures` counter, and a final summary line. Do not invent a different assert harness.
  - `bin/` scripts install to `$HOME/.local/bin` mode 0755 via `install_file`; `claude/` files to `$HOME/.claude`.
- **macOS only.** `stat -f %m` is BSD syntax.
- Atomic commits: each task commits separately.

## File Structure

| File | Responsibility |
|---|---|
| `bin/sf-org-resolve` | **Create.** "Which org would this command touch?" Reads env prefixes and `.env*`. Emits an identity or nothing. No lease knowledge. |
| `scripts/test-sf-org-resolve.sh` | **Create.** Resolution cases against fixture env files. |
| `bin/sf-lease` | **Create.** The lease store: `claim`, `release`, `release-session`, `holder`, `list`, `sweep`. No org knowledge. |
| `scripts/test-sf-lease.sh` | **Create.** Contention, re-entrancy, release ownership, staleness. |
| `claude/hooks/sf-lease-guard.sh` | **Create.** `PreToolUse`: resolve, claim, block. |
| `claude/hooks/sf-lease-post.sh` | **Create.** `PostToolUse`: release what this call claimed. |
| `claude/hooks/sf-lease-end.sh` | **Create.** `SessionEnd`: release everything this session holds. |
| `claude/hooks/sf-lease-table.sh` | **Create.** `SessionStart`: print current holders. |
| `scripts/test-sf-lease-hooks.sh` | **Create.** Hook behaviour against synthetic payloads. |
| `install-macos.sh` | **Modify.** Install the binaries and hooks; print the settings.json snippet. |
| `README.md` | **Modify.** Setup, the advisory/Claude-only caveats, `SF_LEASE_ENABLE`. |

Tasks 1 and 2 are independent of each other. Task 3 consumes both. Task 4 consumes all three.

---

### Task 1: `bin/sf-org-resolve`

**Files:**
- Create: `bin/sf-org-resolve`
- Test: `scripts/test-sf-org-resolve.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: `sf-org-resolve <cwd> <command>` - prints a normalized org identity on stdout and exits 0 when the command would touch a shared org; prints nothing and exits 1 otherwise (not a test command, or the run provisions its own scratch org). Tasks 3 depends on this contract exactly.

**Derived from** `~/.claude/hooks/track-crm-org.sh` (read it for the resolution logic to preserve). Two deliberate differences: (1) a bare test command with no env prefix must resolve the default `.env`, where the tracker writes a `default` sentinel - leasing needs a real identity; (2) sandbox hosts are normalized to the sandbox segment so two repos naming the same org differently collide correctly.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-sf-org-resolve.sh`, following `scripts/test-session-objective.sh`'s harness exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Behavioural tests for bin/sf-org-resolve. Uses fixture .env files in a temp
# dir so it never reads a real org's configuration.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/sf-org-resolve"

fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT

# Two fake repos with fake orgs. No real hostnames anywhere.
mkdir -p "$fixture/my-e2e-repo" "$fixture/my-api-repo"
printf 'SF_BASE_URL=https://qa-box-ab--orga.sandbox.my.salesforce.com\n' \
  > "$fixture/my-e2e-repo/.env"
printf 'SF_BASE_URL=https://qa-box-ab--orgb.sandbox.my.salesforce.com\n' \
  > "$fixture/my-e2e-repo/.env.prod"
printf 'AM_SANDBOX_NAME=someone+orga@example.com\n' \
  > "$fixture/my-api-repo/.env"

failures=0
check() {
  local label="$1" want="$2" got="$3"
  if [[ "$want" == "$got" ]]; then
    printf '  ok   %s\n' "$label"
  else
    printf '  FAIL %s\n       want: [%s]\n       got:  [%s]\n' "$label" "$want" "$got" >&2
    failures=$((failures + 1))
  fi
}

# Prints "<identity>|<rc>" so one helper covers both channels.
resolve() {
  local out rc
  out="$("$bin" "$1" "$2" 2>/dev/null)" && rc=0 || rc=$?
  printf '%s|%s' "$out" "$rc"
}

# --- default resolution -------------------------------------------------------
check 'bare playwright run resolves the default .env' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'npx playwright test --project DB')"
check 'test:last-failed is a test command too' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'npm run test:last-failed')"
check 'AM_SANDBOX_NAME email compacts to the org tag' 'orga|0' \
  "$(resolve "$fixture/my-api-repo" 'npx playwright test')"

# --- env-prefix overrides -----------------------------------------------------
check 'TEST_ENV=prod resolves .env.prod' 'orgb|0' \
  "$(resolve "$fixture/my-e2e-repo" 'TEST_ENV=prod npx playwright test --project DB')"
check 'explicit SF_BASE_URL wins over the env file' 'orgc|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_BASE_URL=https://x--orgc.sandbox.my.salesforce.com npx playwright test')"
check 'SF_ORG_ALIAS wins over everything' 'myalias|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_ORG_ALIAS=myalias npx playwright test')"

# --- normalization ------------------------------------------------------------
check 'the sandbox segment after -- is the identity' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_BASE_URL=https://totally-different-box--orga.sandbox.my.salesforce.com npx playwright test')"
check 'identity is lowercased' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_BASE_URL=https://Box--OrgA.sandbox.my.salesforce.com npx playwright test')"

# --- no lease wanted ----------------------------------------------------------
check 'a scratch-pool run needs no lease' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_SCRATCH_POOL=1 npx playwright test')"
check 'SF_SCRATCH_POOL=0 is not a pool run' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_SCRATCH_POOL=0 npx playwright test')"
check 'lint is not a test command' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'npm run lint')"
check 'a git command is not a test command' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'git status')"
check 'an unknown directory yields nothing' '|1' \
  "$(resolve "$fixture/nope" 'npx playwright test')"
check 'a repo with no env file yields nothing' '|1' \
  "$(resolve "$fixture" 'npx playwright test')"

# --- the secrecy boundary -----------------------------------------------------
printf 'SF_BASE_URL=https://qa--orga.sandbox.my.salesforce.com\nSF_CLIENT_SECRET=shhh-do-not-leak\n' \
  > "$fixture/my-e2e-repo/.env"
out="$("$bin" "$fixture/my-e2e-repo" 'npx playwright test' 2>&1)"
case "$out" in
  *shhh*|*salesforce.com*|*SF_CLIENT_SECRET*)
    printf '  FAIL resolver leaked env content\n       got: [%s]\n' "$out" >&2
    failures=$((failures + 1)) ;;
  *) printf '  ok   resolver emits only the identity, never env content\n' ;;
esac

if [[ $failures -gt 0 ]]; then
  printf '%d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'sf-org-resolve behaves correctly\n'
```

```bash
chmod +x scripts/test-sf-org-resolve.sh
```

- [ ] **Step 2: Run it to verify it fails**

```bash
scripts/test-sf-org-resolve.sh
```

Expected: fails because `bin/sf-org-resolve` does not exist.

- [ ] **Step 3: Read the source of truth**

Read `~/.claude/hooks/track-crm-org.sh` in full. Preserve its `arg()` extraction, its `.env.<TEST_ENV>` lookup, and its email-compaction of `AM_SANDBOX_NAME`. **Do not edit that file.**

- [ ] **Step 4: Write `bin/sf-org-resolve`**

Create `bin/sf-org-resolve`:

```bash
#!/usr/bin/env bash
# Answers "which shared Salesforce org would this command touch?" by reading the
# same configuration the run itself reads. Resolution logic is derived from
# ~/.claude/hooks/track-crm-org.sh; that hook observes, this one is also used to
# gate leases, so it must resolve the default .env rather than a sentinel.
#
# Emits ONLY a normalized identity. It reads .env files and must never print any
# other field from them.
#
# Usage: sf-org-resolve <cwd> <command>
#   rc 0 + identity  — this command would touch a shared org
#   rc 1 + no output — not a test command, or the run provisions its own org
set -uo pipefail

cwd="${1:-}"
cmd="${2:-}"
[[ -n "$cwd" && -n "$cmd" ]] || exit 1

# React only to test invocations; everything else is a no-op.
printf '%s' "$cmd" \
  | grep -qE 'playwright[[:space:]]+test|npx[[:space:]]+playwright|test:last-failed|npm[[:space:]]+run[[:space:]]+test(:[a-z-]+)?([[:space:]]|$)|vitest[[:space:]]+run' \
  || exit 1

# Pull an inline "KEY=value" env prefix out of the command string.
arg() {
  printf '%s' "$cmd" \
    | grep -oE "(^|[[:space:]])$1=[^[:space:]]+" | tail -n1 | sed -E "s/.*$1=//"
}

# Reads one key from an env file. Emits the raw value; callers must normalize it
# into an identity and never echo it.
read_env_key() {
  [[ -f "$1" ]] || return 1
  grep -E "^[[:space:]]*$2=" "$1" 2>/dev/null | tail -n1 \
    | sed -E 's/^[^=]*=//; s/^["'\'']//; s/["'\''][[:space:]]*$//'
}

# Host -> identity. Salesforce sandbox hosts embed the sandbox after '--'; take
# the last such segment so two repos naming one org differently still collide.
identity_from_url() {
  local host="${1#*://}"
  host="${host%%/*}"
  host="${host%%.*}"
  [[ "$host" == *--* ]] && host="${host##*--}"
  printf '%s' "$host" | tr '[:upper:]' '[:lower:]'
}

# someone+orgtag@example.com -> orgtag
identity_from_login() {
  local id="$1"
  id="${id%@*}"
  [[ "$id" == *+* ]] && id="${id##*+}"
  printf '%s' "$id" | tr '[:upper:]' '[:lower:]'
}

emit() { [[ -n "${1:-}" ]] || return 1; printf '%s\n' "$1"; exit 0; }

alias_arg="$(arg SF_ORG_ALIAS)"
baseurl_arg="$(arg SF_BASE_URL)"
tenv_arg="$(arg TEST_ENV)"
pool_arg="$(arg SF_SCRATCH_POOL)"

# A pooled run claims its own scratch org and locks it independently.
case "$pool_arg" in
  ''|0|false|FALSE) ;;
  *) exit 1 ;;
esac

[[ -n "$alias_arg" ]] && emit "$(printf '%s' "$alias_arg" | tr '[:upper:]' '[:lower:]')"
[[ -n "$baseurl_arg" ]] && emit "$(identity_from_url "$baseurl_arg")"

# Otherwise the org comes from the env file the run would load.
env_file="$cwd/.env"
[[ -n "$tenv_arg" ]] && env_file="$cwd/.env.$tenv_arg"
[[ -f "$env_file" ]] || exit 1

url="$(read_env_key "$env_file" SF_BASE_URL || true)"
[[ -n "$url" ]] && emit "$(identity_from_url "$url")"

login="$(read_env_key "$env_file" AM_SANDBOX_NAME || true)"
[[ -n "$login" ]] && emit "$(identity_from_login "$login")"

exit 1
```

```bash
chmod +x bin/sf-org-resolve
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
scripts/test-sf-org-resolve.sh
```

Expected: 15 `ok` lines and `sf-org-resolve behaves correctly`.

- [ ] **Step 6: Confirm it cannot leak an env value**

```bash
d=$(mktemp -d); printf 'SF_BASE_URL=https://q--orga.sandbox.my.salesforce.com\nDB_PASSWORD=hunter2\n' > "$d/.env"
./bin/sf-org-resolve "$d" 'npx playwright test' 2>&1
# Expected: exactly "orga" — no URL, no password, nothing else.
rm -rf "$d"
```

- [ ] **Step 7: Commit**

```bash
git add bin/sf-org-resolve scripts/test-sf-org-resolve.sh
git commit -m "feat: add sf-org-resolve, a shared org-identity resolver

Extracted from the logic in track-crm-org.sh so identity resolution has one
tested implementation instead of a second, guessier one. Resolves the default
.env (the tracker only needed a sentinel there) and normalizes sandbox hosts to
the segment after '--' so two repos naming one org differently still collide."
```

- [ ] **Step 8: Verify the premise against real config, then report**

This is the assumption the whole branch rests on. Run it and **report the two identities in your task report**:

```bash
./bin/sf-org-resolve ~/Apps/e2e-automation 'npx playwright test --project DB'
./bin/sf-org-resolve ~/Apps/canary/bearoku 'npm run test:staging'
./bin/sf-org-resolve ~/Apps/e2e-automation 'TEST_ENV=prod npx playwright test --project DB'
./bin/sf-org-resolve ~/Apps/canary/bearoku 'npm run test:prod'
./bin/sf-org-resolve ~/Apps/e2e-automation 'SF_SCRATCH_POOL=1 npx playwright test'
```

Expected: lines 1 and 2 print the **same** identity; lines 3 and 4 print the same **other** identity; line 5 prints nothing.

**If lines 1 and 2 differ, stop and report it** with the two values. It means the two suites' shared org is expressed differently than assumed and no collision would ever be detected - a plan defect, not a code defect. Do not paste any `.env` contents into the report; the identities alone are the finding.

---

### Task 1b: Bridge canary's vocabulary (amendment after Step 8 failed)

Step 8 found that `canary` resolves to nothing: it reads `API_ORG_BASE_URL` / `ORG_BASE_URL` / `HANDOFF_ORG_BASE_URL` / `SFDC_ORG_ID` (never `SF_BASE_URL` or `AM_SANDBOX_NAME`), and selects its env file with `dotenv -e <file>` inside each npm script rather than a `TEST_ENV=` prefix. Leasing on the Step 1-7 contract would gate `e2e-automation` and never gate `canary`.

**Ruling (human, 2026-08-10):** add a minimal local canonicalization map. The resolver keeps reading real config; the map only translates whatever it finds into one canonical name.

**Files:** modify `bin/sf-org-resolve`, extend `scripts/test-sf-org-resolve.sh`.

**The map** lives at `${SF_ORG_MAP:-$HOME/.config/sf-org-identity/map}`. Two whitespace-separated columns, `#` comments, first match wins. Deliberately **not** three columns - raw values are distinctive enough that a `kind` column earns nothing:

```
# raw-value            canonical
orga                   shared-one
00Dfake0000000001      shared-one
test:staging           shared-one
test:prod              shared-two
```

(Illustrative shape only - fixture placeholders, not real values. The real
map lives at `~/.config/sf-org-identity/map`, outside the repo, and is never
committed.)

**Resolution order.** Steps 1-3 are the existing behaviour and must not regress:

1. `SF_ORG_ALIAS=` command prefix.
2. `SF_BASE_URL=` command prefix.
3. `SF_BASE_URL`, then `AM_SANDBOX_NAME`, from the env file (`$cwd/.env`, or `$cwd/.env.$TEST_ENV` when a `TEST_ENV=` prefix is present).
4. **New:** `SFDC_ORG_ID` from that same env file.
5. **New:** env-file selection for npm scripts - when the command is `npm run <script>`, read `$cwd/package.json`, take that script's body, and parse `dotenv -e <file>` out of it to pick the env file.

   **This takes precedence over the default `$cwd/.env`, not the reverse.** (Corrected 2026-08-10 after implementation: the original wording said "retry steps 3-4 against it", implying the default `.env` is tried first. That is wrong and dangerous here - canary's default `.env` carries a resolvable `SFDC_ORG_ID` for the *staging* org, so `npm run test:prod` would resolve to staging and lease the wrong org while reporting prod as protected. Reproduced against real config with a fixture before switching the order: under strict "naive-first" ordering, `npm run test:prod` resolved to the exact same raw identity as `npm run test:staging` - the staging org's id - instead of its own prod org's id.) This is also what makes `npm run test:staging` resolvable at all.
6. **New, last resort:** the bare `<script>` name from `npm run <script>`.

Then **canonicalize**: look the raw identity up in the map's first column and emit the second. **If the map is missing or has no entry, emit the raw identity unchanged** - so the 15 existing tests keep passing with no map present, and a new org works before you get round to mapping it.

- [ ] **Step 9: Extend the test first**

Add cases to `scripts/test-sf-org-resolve.sh`, keeping the existing harness and all 15 current cases green:

- With no map file: every existing case resolves exactly as it does today (regression guard - assert this explicitly, do not assume it).
- With a fixture map (`SF_ORG_MAP` pointing at a temp file, fake values only): a raw `orga` canonicalizes to `shared-one`; an unmapped raw value passes through unchanged.
- A fixture `package.json` whose `scripts.test:staging` is `rm -rf x && dotenv -e .env -- vitest run`: `npm run test:staging` resolves via that `.env`.
- Same, where the env file contains only `SFDC_ORG_ID=00Dfake0000000001`: resolves to that id, then canonicalizes through the map.
- `npm run test:prod` with `dotenv -e .env.prod` picks `.env.prod`, not `.env`.
- A script name with no `dotenv -e` and no resolvable env file falls back to the bare script name.
- An `npm run` whose script does not exist in `package.json` resolves to nothing, rc 1.
- The secrecy check still holds: `SFDC_ORG_ID` resolution must not print the id's surrounding line or any other key.

- [ ] **Step 10: Implement steps 4-6 plus canonicalization**

Keep `set -uo pipefail`. Parse `package.json` with `jq -r --arg s "$script" '.scripts[$s] // empty'`. Guard the whole npm-script branch on `[[ -f "$cwd/package.json" ]]`. Do not shell out to `npm`.

- [ ] **Step 11: Verify the premise again**

Create `~/.config/sf-org-identity/map` with the real values, then re-run the Step 8 commands. **Lines 1 and 2 must now print the same canonical name, and lines 3 and 4 the same other name.** Report all five identities. Do not commit the map, and do not paste `.env` contents.

- [ ] **Step 12: Confirm no real values are staged**

Derive the forbidden pattern from your own local, uncommitted map rather than hardcoding real org names into this plan - the plan file is committed to a public remote, the map is not:

```bash
git diff --cached | grep -niE "$(awk '!/^#/ && NF>=2 {print $1"|"$2}' ~/.config/sf-org-identity/map | paste -sd'|' -)"
```

Expected: no matches. Fixtures use `orga` / `00Dfake0000000001` / `shared-one` and fake `*.sandbox.my.salesforce.com` hosts, all permitted - so do **not** additionally grep for `\.my\.salesforce\.com` or a bare `00D` prefix; both match allowed fixtures and turn this gate into noise you learn to ignore.

- [ ] **Step 13: Commit**

```bash
git add bin/sf-org-resolve scripts/test-sf-org-resolve.sh
git commit -m "feat: resolve canary's org vocabulary and canonicalize identities

canary reads SFDC_ORG_ID/ORG_BASE_URL and selects its env file via dotenv -e
inside npm scripts, so it resolved to nothing while e2e resolved to a hostname.
Adds npm-script env-file lookup, SFDC_ORG_ID, and a local two-column map that
translates either repo's native value to one canonical org name. Absent map =
previous behaviour."
```

---

### Task 2: `bin/sf-lease`

**Files:**
- Create: `bin/sf-lease`
- Test: `scripts/test-sf-lease.sh`

**Interfaces:**
- Consumes: nothing. Knows nothing about Salesforce - identities are opaque strings.
- Produces:
  - `sf-lease claim <identity> <session> <cmd>` - rc 0 on success, including a re-entrant claim by the same session; rc 1 if another session holds it; **rc 75 if the store was busy** (see exit codes).
  - `sf-lease release <identity> <session>` - rc 0 when it released the lease or there was nothing to do; removes only if `session` matches; **rc 75 if the store was busy, in which case it released nothing**.
  - `sf-lease release-session <session>` - releases every lease that session holds; same rc 75 caveat.
  - `sf-lease holder <identity>` - prints `session=<id> age=<N>m cmd=<...>`, or nothing. Read-only.
  - `sf-lease list` - human table; prints nothing when no leases exist. Read-only, except for the wedged-mutex warning below.
  - `sf-lease sweep <identity>` - drop it if stale; rc 75 if the store was busy.
  - `sf-lease unwedge [--force]` - manual recovery for a mutex whose holder was SIGKILLed.

**Exit codes** (a caller must be able to tell these apart):

| rc | Meaning |
|---|---|
| 0 | The request was carried out - held, released, or nothing to do. |
| 1 | Refused: another session holds that lease. |
| 64 | Bad invocation: missing/empty identity or session, unknown subcommand or flag, or a non-numeric / non-positive value in `SF_LEASE_TTL_MINUTES`, `SF_LEASE_MUTEX_TIMEOUT_MS`, or `SF_LEASE_MUTEX_WEDGE_SECONDS`. |
| 70 | `sf-lease` aborted before deciding anything - a bug in `sf-lease` itself. **Never a grant.** It exists because bash 3.2 exits **0** when `set -u` kills the shell from inside an arithmetic context, so without this backstop a fatal abort in the claim path reads to the caller as "you hold the org". Every deliberate exit sets a completion flag; the `EXIT` trap turns anything else into 70. |
| 75 | The store was busy or wedged. Nothing was read, decided, or changed. **A `release` that returns 75 has not released anything** - callers on the `SessionEnd` cleanup path must not treat it as success, or the org leaks for a full TTL. Distinct from rc 1 on purpose: "come back later" is not "org taken". |
| 130 / 143 | Killed by `SIGINT` / `SIGTERM` inside the critical section. The mutation did **not** complete. The handler releases the mutex and exits rather than resuming outside the critical section and reporting 0. Note `SIGINT` is ignored on entry for a background job in a non-interactive shell, so a hook launched that way can only ever see 143. |

**Callers must treat anything other than 0 as "you do not hold the org."** The only code that means "held" is 0; 1, 64, 70, 75, 130 and 143 all mean the claim did not take effect, and a `release` returning anything but 0 has not released.

State lives at `${SF_LEASE_HOME:-$HOME/.local/state/sf-leases}` as `sf-<identity>.lease`, a **directory** containing one `meta` file of TAB-separated `key<TAB>value` lines: `session`, `started` (epoch seconds), `cmd`.

Atomicity: `mkdir` is the gate - it fails if the directory exists. Metadata is written to a temp file and `mv`'d in, because a *file* rename is atomic while `mv` of a directory onto an existing directory moves it *inside*. Never `mkdir` then write metadata directly.

**The store-wide mutex and its ownership token.** Every mutating subcommand (`claim`, `release`, `release-session`, `sweep`) runs its whole read-modify-write inside one store-wide critical section, gated by `mkdir "$SF_LEASE_HOME/.claiming"`. `holder` and `list` never take it and never delete anything - they are read-only reporters, so a stale lease shows its real age rather than vanishing when someone reads it. Acquire retries for `${SF_LEASE_MUTEX_TIMEOUT_MS:-5000}`ms, then prints a `store busy` line on stderr and returns rc 75.

Per-step atomicity tricks do not substitute for this. An atomic `mv`-aside and an inode fingerprint were each tried and each failed the same way: both are "validate, then act", which is itself a check-then-use race no matter how atomic either half is. Two atomic half-steps never compose into one atomic whole.

The mutex directory carries an `owner` file holding a token of `<pid>:<nonce>:<epoch>`. The nonce matters because PIDs are recycled, so `$$` alone is not an identity. The governing rule, which three earlier attempts each broke in a different place: **nothing removes a lock it has not proven it owns.**
- The exit trap removes the mutex only while that exact token is still on disk. If it is not, the mutex was cleared from under this process and now belongs to someone else who is inside their critical section; it says so on stderr, returns non-zero, and touches nothing. Deleting it would un-protect that holder *and every claim after them*.
- `INT`/`TERM` handlers release the mutex and then **exit** (130/143). Releasing without exiting lets the interrupted mutation resume outside the critical section and still report rc 0 - which is exactly what a hook killed on timeout does.
- `claim`'s abandon-on-write-failure `rm -rf` first confirms the lease dir has no meta or meta naming this session.

**`unwedge` and its refusal rule.** The one accepted gap is a SIGKILL inside the critical section. `unwedge` is the manual recovery, and it is the most dangerous command in the tool: an operator cannot tell a live mutex from a wedged one by looking, because a real claim holds it for tens of milliseconds and so `list`'s warning never fires for one. It therefore **refuses (rc 75) unless the mutex is older than `${SF_LEASE_MUTEX_WEDGE_SECONDS:-60}` AND no live owner can be found** (checked with `ps -p`, not `kill -0`, which reports another user's live process as dead). It prints what it found - age, token, pid, liveness - either way.

Past the age threshold it clears two shapes on its own: a token whose pid is gone, and **no token at all** - a live acquire stamps its token microseconds after the `mkdir`, so nothing still running could have left an aged unstamped mutex behind. Below the age threshold it refuses regardless, which is what protects a live acquire caught in that stamp window.

`--force` is kept for exactly one genuinely ambiguous state: an aged mutex whose recorded pid **is** alive but may be a recycled, unrelated pid. Its warning says plainly that it can grant one org to two sessions at once, including sessions that claim after it. Do not widen `--force` beyond that case - making the operator reach for it in situations its warning does not describe is how the warning stops being read.

`list` breaks its silence contract for exactly one thing: a mutex held longer than the wedge threshold, warning that `unwedge` will refuse unless the owner is genuinely gone.

Staleness: `started` older than `${SF_LEASE_TTL_MINUTES:-120}` minutes, or no `meta` at all (or an unparseable `started`) and directory mtime older than 60s (interrupted mid-claim). A per-lease TTL exists because a lease is held for minutes by a process that can die; the mutex is held for milliseconds, which is why it gets a loud manual recovery rather than an age-based auto-break - an age-check-then-remove rule for the mutex would recreate the exact race it exists to close, one level down.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-sf-lease.sh` using the same harness as Task 1 (`check() { label want got }`, `failures`, `mktemp -d` + `trap`, jq check not needed here). Cover exactly these cases:

```bash
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/sf-lease"

SF_LEASE_HOME="$(mktemp -d)"
export SF_LEASE_HOME SF_LEASE_TTL_MINUTES=120
trap 'rm -rf "$SF_LEASE_HOME"' EXIT

failures=0
check() {
  local label="$1" want="$2" got="$3"
  if [[ "$want" == "$got" ]]; then
    printf '  ok   %s\n' "$label"
  else
    printf '  FAIL %s\n       want: [%s]\n       got:  [%s]\n' "$label" "$want" "$got" >&2
    failures=$((failures + 1))
  fi
}
rc_of() { "$bin" "$@" >/dev/null 2>&1 && printf 0 || printf 1; }
session_of() { "$bin" holder "$1" | sed -n 's/.*session=\([^ ]*\).*/\1/p'; }

# --- claim and contention -----------------------------------------------------
check 'first claim succeeds'                0 "$(rc_of claim orga sess-A 'playwright test')"
check 'a second session is refused'         1 "$(rc_of claim orga sess-B 'playwright test')"
check 'the same session is re-entrant'      0 "$(rc_of claim orga sess-A 'playwright test --last-failed')"
check 'a different org is independent'      0 "$(rc_of claim orgb sess-B 'playwright test')"
check 'holder names the owning session'     'sess-A' "$(session_of orga)"
check 'holder of an unheld org is empty'    '' "$("$bin" holder orgc)"

# --- release ownership --------------------------------------------------------
"$bin" release orga sess-B
check 'a non-owner cannot release'          'sess-A' "$(session_of orga)"
"$bin" release orga sess-A
check 'the owner can release'               '' "$(session_of orga)"
check 'release of an unheld org is quiet'   0 "$(rc_of release orga sess-A)"

"$bin" claim orga sess-B 'x' >/dev/null
"$bin" release-session sess-B
check 'release-session clears orga'         '' "$(session_of orga)"
check 'release-session clears orgb too'     '' "$(session_of orgb)"

# --- staleness ----------------------------------------------------------------
"$bin" claim orga sess-C 'playwright test' >/dev/null
aged=$(( $(date +%s) - 3 * 60 * 60 ))
printf 'session\tsess-C\nstarted\t%s\ncmd\tplaywright test\n' "$aged" \
  > "$SF_LEASE_HOME/sf-orga.lease/meta"
check 'a lease past its TTL is reclaimed'   0 "$(rc_of claim orga sess-D 'playwright test')"
check 'the reclaiming session owns it'      'sess-D' "$(session_of orga)"
"$bin" release-session sess-D

mkdir -p "$SF_LEASE_HOME/sf-orga.lease"   # metadata-less: interrupted mid-claim
check 'a fresh metadata-less lease is respected' 1 "$(rc_of claim orga sess-E 'x')"
touch -A -020000 "$SF_LEASE_HOME/sf-orga.lease" 2>/dev/null \
  || touch -t "$(date -v-2H +%Y%m%d%H%M)" "$SF_LEASE_HOME/sf-orga.lease"
check 'an old metadata-less lease is reclaimed'  0 "$(rc_of claim orga sess-E 'x')"

# --- list ---------------------------------------------------------------------
check 'list names the held org' 'yes' \
  "$("$bin" list | grep -q orga && echo yes || echo no)"
"$bin" release-session sess-E
check 'list is silent with no leases' '' "$("$bin" list)"

if [[ $failures -gt 0 ]]; then
  printf '%d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'sf-lease behaves correctly\n'
```

```bash
chmod +x scripts/test-sf-lease.sh
```

- [ ] **Step 2: Run it to verify it fails**

```bash
scripts/test-sf-lease.sh
```

Expected: fails because `bin/sf-lease` does not exist.

- [ ] **Step 3: Write `bin/sf-lease`**

Implement the interface above. Requirements the tests encode, stated plainly so you do not have to reverse-engineer them:

- `claim` sweeps first, then `mkdir` the lease dir; on success write `meta` via temp-file + `mv`; on failure return 0 only if the existing `meta`'s `session` equals this one.
- `release` is a no-op unless `meta`'s `session` matches. Never fails.
- `release-session` iterates `sf-*.lease` and calls the same ownership-checked release.
- `holder` sweeps, then prints `session=<s> age=<N>m cmd=<c>` on one line, or nothing.
- `list` sweeps each lease and prints a header plus one row per lease; prints **nothing** when there are none, so a clean session start stays quiet. It may also surface `${SCRATCH_POOL_LOCK_DIR:-/tmp/e2e-scratch-pool}/*.lock` rows for context - that is the separate scratch-org pool, labelled as such - but **only when at least one org lease exists**. (Adjudicated 2026-08-10: as originally written these two requirements contradicted each other, because the pool is a live external directory that gains locks during the other repo's normal operation, so unconditional pool rows make `list` non-silent at every SessionStart. Silence wins; the pool rows are context for a lease you already have, not a reason to speak.)
- Unknown subcommand: usage on stderr, exit 64.
- Use `set -uo pipefail` (not `-e`): several subcommands use non-zero returns as signal.
- Guard every glob loop with `[[ -d "$dir" ]] || continue` so an empty directory does not iterate a literal pattern.
- `date +%s` for now; `stat -f %m` for mtime.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
scripts/test-sf-lease.sh
```

Expected: 16 `ok` lines and `sf-lease behaves correctly`.

- [ ] **Step 5: Verify concurrent claims by hand**

```bash
export SF_LEASE_HOME=$(mktemp -d)
./bin/sf-lease claim orga s1 'npx playwright test'; echo "first=$?  (want 0)"
./bin/sf-lease claim orga s2 'npx playwright test'; echo "second=$? (want 1)"
./bin/sf-lease holder orga
./bin/sf-lease list
rm -rf "$SF_LEASE_HOME"; unset SF_LEASE_HOME
```

- [ ] **Step 6: Commit**

```bash
git add bin/sf-lease scripts/test-sf-lease.sh
git commit -m "feat: add sf-lease, an advisory single-machine org lease store

Two concurrent local test runs against one org collide on shared data and
surface as flake rather than as a conflict. Advisory and TTL-bounded: a session
that dies releases when its lease expires. Identities are opaque strings; all
Salesforce knowledge lives in sf-org-resolve."
```

---

### Task 3: The hooks

**Files:**
- Create: `claude/hooks/sf-lease-guard.sh`, `claude/hooks/sf-lease-post.sh`, `claude/hooks/sf-lease-end.sh`, `claude/hooks/sf-lease-table.sh`
- Test: `scripts/test-sf-lease-hooks.sh`

**Interfaces:**
- Consumes: Task 1's `sf-org-resolve <cwd> <cmd>` and Task 2's `sf-lease` subcommands.
- Produces: hook scripts Task 4 installs.

All four resolve their dependencies as `${SF_ORG_RESOLVE_BIN:-$HOME/.local/bin/sf-org-resolve}` and `${SF_LEASE_BIN:-$HOME/.local/bin/sf-lease}` so the tests can point at the worktree copies.

**All four exit 0 unless `SF_LEASE_ENABLE` is set to a truthy value.** This is the safety gate from Decision 2: the hooks are installed and registered but inert until you opt in.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-sf-lease-hooks.sh`. Build payloads with `jq -nc --arg ...` as `scripts/test-session-objective.sh` does. Point `SF_LEASE_BIN` / `SF_ORG_RESOLVE_BIN` at `$repo_root/bin/...`, use an isolated `SF_LEASE_HOME`, and use a fixture repo dir with a fake `.env` (`SF_BASE_URL=https://q--orga.sandbox.my.salesforce.com`) so resolution works without real config. Cover:

| Case | Expectation |
|---|---|
| `SF_LEASE_ENABLE` unset, test command | guard rc 0, **no lease taken** |
| enabled, `npm run lint` | rc 0, no lease taken |
| enabled, non-Bash tool (`tool_name: "Read"`) | rc 0, no lease taken |
| enabled, test command, org free | rc 0, lease held by that session |
| enabled, same command, different session | **rc 2**, stderr is valid JSON with an `error` key naming the holder |
| enabled, same command, same session again | rc 0 (re-entrant) |
| post hook, same command + session | lease released |
| post hook, `git status` while a lease is held | **lease still held** (an unrelated call must not release) |
| end hook with that session id | all its leases released |
| `SF_LEASE_BIN=/nonexistent`, test command | rc 0 (fails open) |
| `SF_ORG_RESOLVE_BIN=/nonexistent`, test command | rc 0 (fails open) |
| table hook, lease held | prints a line naming the org |
| table hook, no leases | prints nothing |

The "unrelated call must not release" case is the one that catches a naive PostToolUse that releases everything for the session.

- [ ] **Step 2: Run it to verify it fails**

```bash
scripts/test-sf-lease-hooks.sh
```

Expected: fails because no hook scripts exist.

- [ ] **Step 3: Write the four hooks**

`sf-lease-guard.sh` (`PreToolUse`) - the shape all four follow:

```bash
#!/usr/bin/env bash
# PreToolUse: claim the org lease a test command needs, or block the call.
# Exit 2 = block, exit 0 = allow. Fails OPEN — a broken lease setup must never
# wedge every Bash call in every session. Inert unless SF_LEASE_ENABLE is set.
set -uo pipefail

case "${SF_LEASE_ENABLE:-}" in ''|0|false|FALSE) exit 0 ;; esac

RESOLVE="${SF_ORG_RESOLVE_BIN:-$HOME/.local/bin/sf-org-resolve}"
LEASE="${SF_LEASE_BIN:-$HOME/.local/bin/sf-lease}"
[[ -x "$RESOLVE" && -x "$LEASE" ]] || exit 0

payload="$(cat)"
[[ "$(printf '%s' "$payload" | jq -r '.tool_name // empty')" == "Bash" ]] || exit 0

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
sid="$(printf '%s' "$payload" | jq -r '.session_id // empty')"
[[ -n "$cmd" && -n "$cwd" && -n "$sid" ]] || exit 0

identity="$("$RESOLVE" "$cwd" "$cmd" 2>/dev/null)" || exit 0
[[ -n "$identity" ]] || exit 0

"$LEASE" claim "$identity" "$sid" "$cmd" 2>/dev/null && exit 0

holder="$("$LEASE" holder "$identity" 2>/dev/null || true)"
jq -cn --arg id "$identity" --arg h "${holder:-unknown}" '{error:
  "Org \($id) is leased by another Claude session (\($h)). Wait for it, ask that session to release it, or run against a scratch org (SF_SCRATCH_POOL=1). Force-clear with: sf-lease release \($id) <session>."
}' >&2
exit 2
```

`sf-lease-post.sh` (`PostToolUse`) - identical preamble, then **re-resolve** and release only that identity, so an unrelated Bash call cannot drop a live lease:

```bash
identity="$("$RESOLVE" "$cwd" "$cmd" 2>/dev/null)" || exit 0
[[ -n "$identity" ]] && "$LEASE" release "$identity" "$sid" 2>/dev/null
exit 0
```

`sf-lease-end.sh` (`SessionEnd`) - needs only `session_id`:

```bash
sid="$(cat | jq -r '.session_id // empty')"
[[ -n "$sid" ]] && "$LEASE" release-session "$sid" 2>/dev/null
exit 0
```

`sf-lease-table.sh` (`SessionStart`) - no payload needed:

```bash
[[ -x "$LEASE" ]] && "$LEASE" list
exit 0
```

```bash
chmod +x claude/hooks/sf-lease-*.sh
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
scripts/test-sf-lease-hooks.sh
```

Expected: every case `ok`.

- [ ] **Step 5: Commit**

```bash
git add claude/hooks/sf-lease-guard.sh claude/hooks/sf-lease-post.sh \
        claude/hooks/sf-lease-end.sh claude/hooks/sf-lease-table.sh \
        scripts/test-sf-lease-hooks.sh
git commit -m "feat: enforce org leases via PreToolUse/PostToolUse/SessionEnd hooks

Enforcement belongs at the Bash tool because that is how Claude sessions run
suites — a shell alias would be bypassed by the npx invocation the e2e repo
documents. Fails open so a broken setup cannot wedge every Bash call, and stays
inert until SF_LEASE_ENABLE is set."
```

---

### Task 4: Install, document, enable

**Files:**
- Modify: `install-macos.sh` (the `link_path` block near line 156, the `install_file` block near line 194, and the hooks notice at lines 163 and 212)
- Modify: `README.md`

**Two pre-arming prerequisites** (added 2026-08-10 by the Task 3 re-review, which found both by measurement). Both must land **before** the hooks are registered and `SF_LEASE_ENABLE` is exported, because this is the task that arms them.

- [ ] **Step 0a: Give `SF_LEASE_MUTEX_TIMEOUT_MS` a literal cap**

It is the last regex-only numeric knob on the hook's hot path. `bin/sf-lease:87,99` validate it with a regex but nothing bounds it, and it drives the `acquire_mutex` spin at `bin/sf-lease:141-148`. Measured with the real binaries against a wedged mutex: `=20000` made the `PreToolUse` guard take **26s for one Bash call**; `=86400000` (the obvious milliseconds-per-day typo) left the guard **still running after 30s**. It exits 0 eventually, so fail-open holds in the limit, but it stalls every Bash call meanwhile — and a stalled session is the outcome this design ranks worst.

This is the fourth instance on this branch of a bash numeric knob failing toward a hang rather than an error (after `SF_LEASE_MUTEX_TIMEOUT_MS=5s`, an arithmetic context exiting 0 under `set -u`, and `SF_LEASE_HOOK_RETRIES=08` read as octal). Cap it with a literal internal bound — a regex is demonstrably not enough — mirroring the knob-independent ceiling `sf-lease-post.sh` now uses for retries. Add a test with hostile values (non-numeric, zero, leading-zero, hex-shaped, enormous, int64-overflow) asserting each terminates.

- [ ] **Step 0b: Move the test-suite deadline into `run` itself**

`run_bounded` in `scripts/test-sf-lease-hooks.sh` covers only the retry checks, and that gap is reachable **today**: a hanging `SessionStart` hook got 47 checks in, stopped dead, reported **no failure**, and was still running at 44s. A hook does not need a loop of its own to hang — it needs a child that blocks, and the guard and post hooks invoke `sf-lease` and `sf-org-resolve` with no timeout. Move the deadline into `run` so every check is bounded, and verify by making a hook hang unconditionally that the suite reports a failure rather than hanging.

- [ ] **Step 1: Wire the installer**

Add to the `install_file` block near line 194, and mirror into the `link_path` block near line 156 so `--link` mode works:

```bash
install_file "$root_dir/bin/sf-org-resolve" "$HOME/.local/bin/sf-org-resolve" 0755
install_file "$root_dir/bin/sf-lease" "$HOME/.local/bin/sf-lease" 0755
install_file "$root_dir/claude/hooks/sf-lease-guard.sh" "$HOME/.claude/hooks/sf-lease-guard.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-post.sh" "$HOME/.claude/hooks/sf-lease-post.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-end.sh" "$HOME/.claude/hooks/sf-lease-end.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-table.sh" "$HOME/.claude/hooks/sf-lease-table.sh" 0755
```

Replace the hooks notice at lines 163 and 212 so it names what to paste:

```bash
printf 'Claude Code hooks are NOT installed automatically. Add to ~/.claude/settings.json:\n'
printf '  PreToolUse  (Bash) -> ~/.claude/hooks/sf-lease-guard.sh\n'
printf '  PostToolUse (Bash) -> ~/.claude/hooks/sf-lease-post.sh\n'
printf '  SessionEnd         -> ~/.claude/hooks/sf-lease-end.sh\n'
printf '  SessionStart       -> ~/.claude/hooks/sf-lease-table.sh\n'
printf 'Then export SF_LEASE_ENABLE=1 to arm them (they are inert without it).\n'
```

An automatic jq merge is deliberately avoided: `.[0] * .[1]` replaces arrays, so it would drop the `track-crm-org.sh` and `session-objective` hooks already registered.

- [ ] **Step 2: Run the installer and the full test suite**

```bash
./install-macos.sh
command -v sf-lease sf-org-resolve && ls -l ~/.claude/hooks/sf-lease-*.sh
scripts/test-sf-org-resolve.sh && scripts/test-sf-lease.sh && scripts/test-sf-lease-hooks.sh
```

**`install-macos.sh` overwrites `~/.claude/statusline.sh`, which has drifted 130 lines.** Back it up first: `cp ~/.claude/statusline.sh /tmp/statusline.installed.bak`. Report in your task report whether the installer changed it.

- [ ] **Step 3: Document it**

Add a `## Salesforce org leases` section to `README.md` covering: what it does; that it is **advisory, single-machine, and covers only Claude-driven Bash calls** (a hand-typed command bypasses it); the two binaries and what each owns; `SF_LEASE_ENABLE` as the arming switch and `SF_LEASE_TTL_MINUTES` (default 120); `sf-lease list` to inspect and `sf-lease release <org> <session>` to force-clear; and that `~/.claude/hooks/track-crm-org.sh` still has its own copy of the resolution logic, with converging it noted as follow-up.

- [ ] **Step 4: Confirm nothing sensitive is committed**

Scan the **tree**, not `git diff --cached`: a staged-diff grep cannot see a file that is already committed, which is most of the branch by the time this step runs. Match whole words too (`-w`) - an unbounded pattern can never come back empty on this repo, because at least one short raw alias in the map is a substring of an ordinary word in the tracked Neovim config.

```bash
map_pattern="$(awk '!/^[[:space:]]*#/ && NF>=2 {printf "%s|%s|", $1, $2}' ~/.config/sf-org-identity/map | sed 's/|$//')"
if git grep -nIwEi -- "$map_pattern"; then
  echo 'STOP: internal identifiers are tracked'; else echo 'clean'; fi
git grep -nIE '00D[A-Za-z0-9]{15}'                     # only 00Dfake... is allowed
git grep -nIoE '[A-Za-z0-9_.-]+\.my\.salesforce\.com'  # only orga/orgb-style fakes
```

Expected: `clean`, and every host/org-id hit a fixture. The test fixtures use `orga`/`orgb`/`00Dfake0000000001`/`q--orga.sandbox.my.salesforce.com`-style fakes only. The forbidden-value half of the pattern is derived from your own local, uncommitted map, so this plan never names a real org, alias or login handle to check for one - do not paste literal values into this file either.

- [ ] **Step 5: Commit**

```bash
git add install-macos.sh README.md
git commit -m "feat: install and document the org lease hooks"
```

- [ ] **Step 6: End-to-end acceptance, two live sessions**

Manual, and the criterion for the whole branch. Requires registering the hooks in `~/.claude/settings.json` and exporting `SF_LEASE_ENABLE=1`.

1. Session A in `~/Apps/e2e-automation`: run the suite.
2. While it runs, session B in `~/Apps/canary/bearoku`: ask for `npm run test:staging`.

Expected: B's Bash call is blocked before executing, naming session A. Then: A finishes, B's retry succeeds; a third session's SessionStart table lists the lease while A holds it; `npm run lint` is never blocked.

**This step needs a human** - it requires two live Claude sessions and a settings.json edit. Report it as pending rather than attempting it.

---

## Deferred, deliberately

- **Converging `track-crm-org.sh` onto `bin/sf-org-resolve`.** It keeps its own copy of the logic for now. It is untracked, live, and its statusline consumer has drifted; touching it belongs with resolving that drift, which has another owner.
- **Committing the statusline drift.** 130 lines, not this branch's work. See the hazard note.
- **Unifying with `scratch_org_pool.ts`.** Different resource, different lifetime, already works. `sf-lease list` surfaces both roots so you see one picture.
- **Bare-terminal coverage.** A shell wrapper would be bypassed by the documented `npx playwright test` invocation anyway.
- **Anything off this machine.** Out of scope by decision; it would need a server-side lock.
