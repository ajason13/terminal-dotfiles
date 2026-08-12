#!/usr/bin/env bash
set -euo pipefail

# Behavioural tests for bin/sf-org-resolve. Uses fixture .env files in a temp
# dir so it never reads a real org's configuration.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/sf-org-resolve"

if ! command -v jq >/dev/null 2>&1; then
  echo "test-sf-org-resolve: jq not found (brew install jq)" >&2
  exit 1
fi

fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT

# Isolate from any real map this machine has at the default path - the whole
# point of the "no map" cases below is to prove behaviour with none present.
export SF_ORG_MAP="$fixture/no-such-map"

# Two fake repos with fake orgs. No real hostnames anywhere.
mkdir -p "$fixture/my-e2e-repo" "$fixture/my-api-repo"
printf 'SF_BASE_URL=https://qa-box-ab--orga.sandbox.my.salesforce.com\n' \
  > "$fixture/my-e2e-repo/.env"
printf 'SF_BASE_URL=https://qa-box-ab--orgb.sandbox.my.salesforce.com\n' \
  > "$fixture/my-e2e-repo/.env.prod"
printf 'AM_SANDBOX_NAME=someone+orga@example.com\n' \
  > "$fixture/my-api-repo/.env"

failures=0
has() { case "$1" in *"$2"*) printf yes ;; *) printf no ;; esac; }
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
  resolve_with "$bin" "$1" "$2"
}
# Same, against an arbitrary binary - that is how the mutation runs below drive
# deliberately-broken variants of the resolver.
resolve_with() {
  local b="$1" out rc
  out="$("$b" "$2" "$3" 2>/dev/null)" && rc=0 || rc=$?
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
# An allowlist, not a denylist. As a denylist `no` fell through to "pooled", so a
# run that shares the org took no lease at all - the same defect SF_LEASE_ENABLE
# was converted for. An unrecognised value must leave leasing ON.
check 'SF_SCRATCH_POOL=no still takes a lease' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_SCRATCH_POOL=no npx playwright test')"
check 'SF_SCRATCH_POOL=off still takes a lease' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_SCRATCH_POOL=off npx playwright test')"
check 'SF_SCRATCH_POOL=true is a pool run' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_SCRATCH_POOL=true npx playwright test')"
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

# --- Task 1b: regression guard, explicit ------------------------------------
# All 15 cases above already ran under SF_ORG_MAP pointed at a nonexistent
# file. State that in one more explicit case rather than leaving it implicit.
check 'with no map, resolution is unchanged (explicit regression guard)' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'npx playwright test')"

# --- Task 1b: SFDC_ORG_ID -----------------------------------------------------
printf 'SFDC_ORG_ID=00Dfake0000000001\nDB_PASSWORD=hunter2\n' \
  > "$fixture/my-api-repo/.env"
check 'SFDC_ORG_ID in the env file resolves too' '00Dfake0000000001|0' \
  "$(resolve "$fixture/my-api-repo" 'npx playwright test')"

out="$("$bin" "$fixture/my-api-repo" 'npx playwright test' 2>&1)"
case "$out" in
  *hunter2*|*DB_PASSWORD*)
    printf '  FAIL SFDC_ORG_ID resolution leaked another key\n       got: [%s]\n' "$out" >&2
    failures=$((failures + 1)) ;;
  *) printf '  ok   SFDC_ORG_ID resolution emits only the id, never other keys\n' ;;
esac
printf 'AM_SANDBOX_NAME=someone+orga@example.com\n' > "$fixture/my-api-repo/.env"

# --- Task 1b: npm-script env-file lookup --------------------------------------
# A repo (like canary) that never uses TEST_ENV=, and instead bakes the env
# file into each npm script with `dotenv -e <file>`.
mkdir -p "$fixture/my-npm-repo"
cat > "$fixture/my-npm-repo/package.json" <<'JSON'
{
  "scripts": {
    "test:staging": "rm -rf allure-results && dotenv -e .env -- vitest run",
    "test:prod": "rm -rf allure-results && dotenv -e .env.prod -- vitest run"
  }
}
JSON
printf 'SF_BASE_URL=https://box--orga.sandbox.my.salesforce.com\n' \
  > "$fixture/my-npm-repo/.env"
printf 'SFDC_ORG_ID=00Dfake0000000001\n' \
  > "$fixture/my-npm-repo/.env.prod"

check 'npm run test:staging resolves via its own dotenv -e .env' 'orga|0' \
  "$(resolve "$fixture/my-npm-repo" 'npm run test:staging')"
check 'npm run test:prod picks .env.prod, not .env' '00Dfake0000000001|0' \
  "$(resolve "$fixture/my-npm-repo" 'npm run test:prod')"
check 'an npm run whose script does not exist resolves to nothing' '|1' \
  "$(resolve "$fixture/my-npm-repo" 'npm run test:missing')"

# A script with no dotenv -e flag and no plain .env in its cwd falls back to
# the bare script name - it is real (defined in package.json), just not wired
# to an env file this resolver understands yet.
mkdir -p "$fixture/my-npm-repo-nodotenv"
cat > "$fixture/my-npm-repo-nodotenv/package.json" <<'JSON'
{
  "scripts": {
    "test:bare": "vitest run"
  }
}
JSON
check 'a script with no dotenv -e and no env file falls back to its own name' 'test:bare|0' \
  "$(resolve "$fixture/my-npm-repo-nodotenv" 'npm run test:bare')"

# --- Task 1b: canonicalization through the map --------------------------------
cat > "$fixture/map" <<'MAP'
# raw                  canonical
orga                   shared-one
orga                   this-second-line-must-never-win
00Dfake0000000001      shared-one
MAP
export SF_ORG_MAP="$fixture/map"

check 'a raw orga canonicalizes to shared-one' 'shared-one|0' \
  "$(resolve "$fixture/my-e2e-repo" 'npx playwright test')"
check 'first match wins over a later duplicate' 'shared-one|0' \
  "$(resolve "$fixture/my-e2e-repo" 'npx playwright test')"
check 'an unmapped raw value passes through unchanged' 'otherorg|0' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_ORG_ALIAS=otherorg npx playwright test')"
# This is the live canary path: an org id resolved from SFDC_ORG_ID, then
# canonicalized through the map to the same name e2e's hostname maps to.
check 'a mapped SFDC_ORG_ID canonicalizes through the map' 'shared-one|0' \
  "$(resolve "$fixture/my-npm-repo" 'npm run test:prod')"

unset SF_ORG_MAP
export SF_ORG_MAP="$fixture/no-such-map"

# --- Fix round 2: reviewer findings -------------------------------------------

# Finding 1: an inline "# ..." comment on an env line must not leak into the
# identity, and must never reach stdout.
printf 'SFDC_ORG_ID=00Dfake0000000009 # staging org, do not change\n' \
  > "$fixture/my-api-repo/.env"
check 'an inline # comment does not leak into the identity' '00Dfake0000000009|0' \
  "$(resolve "$fixture/my-api-repo" 'npx playwright test')"
out="$("$bin" "$fixture/my-api-repo" 'npx playwright test' 2>&1)"
case "$out" in
  *'staging org'*|*'do not change'*)
    printf '  FAIL inline comment text leaked into resolver output\n       got: [%s]\n' "$out" >&2
    failures=$((failures + 1)) ;;
  *) printf '  ok   inline # comment text never reaches stdout\n' ;;
esac
printf 'AM_SANDBOX_NAME=someone+orga@example.com\n' > "$fixture/my-api-repo/.env"

# Finding 2: when an npm script declares its own env file and that file is
# missing, do not fall back to $cwd/.env (a possibly different org) - fall
# through to the bare script name instead.
mkdir -p "$fixture/my-npm-repo-missing-file"
cat > "$fixture/my-npm-repo-missing-file/package.json" <<'JSON'
{
  "scripts": {
    "test:prod": "dotenv -e .env.prod -- vitest run"
  }
}
JSON
printf 'SF_BASE_URL=https://box--orga.sandbox.my.salesforce.com\n' \
  > "$fixture/my-npm-repo-missing-file/.env"
# .env.prod is deliberately absent.
check 'a missing declared env file does not fall back to cwd/.env' 'test:prod|0' \
  "$(resolve "$fixture/my-npm-repo-missing-file" 'npm run test:prod')"

# Finding 3: a map that exists but cannot be read must fail loudly (refuse to
# resolve), never silently fall through to the raw, uncanonicalized value.
#
# Final review F2: and it must not fail as rc 1 either. rc 1 is "not a test
# command", both fail open at the hook, so an unreadable map turned the whole
# mechanism off with zero trace. rc 3 = config present but unusable.
printf 'orga   shared-one\n' > "$fixture/unreadable-map"
chmod 000 "$fixture/unreadable-map"
export SF_ORG_MAP="$fixture/unreadable-map"
check 'an unreadable map is rc 3, not rc 1 or a raw pass-through' '|3' \
  "$(resolve "$fixture/my-e2e-repo" 'npx playwright test')"
map_err="$("$bin" "$fixture/my-e2e-repo" 'npx playwright test' 2>&1 || true)"
check 'and it names the file it could not read' 'yes' "$(has "$map_err" 'unreadable-map')"
check 'and says that is what went wrong'        'yes' "$(has "$map_err" 'not readable')"
chmod 644 "$fixture/unreadable-map"
export SF_ORG_MAP="$fixture/no-such-map"

# An env file present but unreadable is the same class - the run WOULD load it.
mkdir -p "$fixture/unreadable-env-repo"
printf 'SF_BASE_URL=https://box--orga.sandbox.my.salesforce.com\n' \
  > "$fixture/unreadable-env-repo/.env"
chmod 000 "$fixture/unreadable-env-repo/.env"
check 'an unreadable env file is rc 3, not silence' '|3' \
  "$(resolve "$fixture/unreadable-env-repo" 'npx playwright test')"
chmod 644 "$fixture/unreadable-env-repo/.env"
check 'and the same repo resolves normally once it is readable' 'orga|0' \
  "$(resolve "$fixture/unreadable-env-repo" 'npx playwright test')"

# A map that resolves to something unusable as a lease name is also config
# present but unusable - rc 3, where a bad ALIAS on the command line is bad
# input and stays rc 1 (checked above).
printf 'orga   ../../etc/pwned\n' > "$fixture/bad-map"
export SF_ORG_MAP="$fixture/bad-map"
check 'a map entry that is not a usable identity is rc 3' '|3' \
  "$(resolve "$fixture/my-e2e-repo" 'npx playwright test')"
export SF_ORG_MAP="$fixture/no-such-map"

# Mutation run: collapse rc 3 back into rc 1 and the checks above must go red -
# that indistinguishability is the whole defect.
mut_rc="$(mktemp -d)"
sed 's/exit 3/exit 1/g' "$bin" > "$mut_rc/rc1"
chmod +x "$mut_rc/rc1"
check 'the rc-1 variant differs from the real resolver' 'differs' \
  "$(cmp -s "$bin" "$mut_rc/rc1" && echo IDENTICAL || echo differs)"
export SF_ORG_MAP="$fixture/unreadable-map"
chmod 000 "$fixture/unreadable-map"
check 'without rc 3 an unreadable map looks like "not a test command"' '|1' \
  "$(resolve_with "$mut_rc/rc1" "$fixture/my-e2e-repo" 'npx playwright test')"
chmod 644 "$fixture/unreadable-map"
export SF_ORG_MAP="$fixture/no-such-map"
rm -rf "$mut_rc"

# Finding 4: the emitted identity is a future lease-store filename - reject
# anything outside a safe charset, such as a path-traversal attempt.
check 'a path-traversal alias is rejected, not emitted' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'SF_ORG_ALIAS=../../etc/pwned npx playwright test')"

# --- final review F1: a match must START a command segment --------------------
# The resolver matches command TEXT, and the guard BLOCKS on a resolved identity,
# so every one of these was a false block (guard rc 2) while a rival held the org.
# A false block is the worst outcome this design has - worse than a missed lease.
check 'a commit message mentioning a test command resolves to nothing' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'git commit -m "fix flake in npx playwright test"')"
check 'echoing a test command into a file resolves to nothing' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'echo "npx playwright test" >> notes.md')"
check 'a PR body quoting a test command resolves to nothing' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'gh pr create --body "reproduce with npx playwright test"')"
check 'a git log --grep for a test command resolves to nothing' '|1' \
  "$(resolve "$fixture/my-e2e-repo" 'git log --grep="playwright test" --oneline')"
# ...and the segment boundary is what a real chained invocation needs, so it must
# keep resolving. These two are the reason the fix is a boundary, not an anchor.
check 'a test command after && still resolves' 'orga|0' \
  "$(resolve "$fixture/my-npm-repo" 'cd whatever && npm run test:staging')"
check 'a test command after ; still resolves' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'set -o pipefail; npx playwright test')"
check 'a path-prefixed runner still resolves' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" './node_modules/.bin/playwright test --project DB')"
# F5 minor: `test(:[a-z-]+)?` rejected digits, so a numbered script ran unleased.
check 'a digit in the npm script name still resolves' 'orga|0' \
  "$(resolve "$fixture/my-e2e-repo" 'npm run test:bookit2')"

# Mutation run: strip the boundary requirement and the four checks above must
# start matching again - that is the only thing proving they discriminate.
mut="$(mktemp -d)"
trap 'rm -rf "$fixture" "$mut"' EXIT
sed 's|^seg_start=.*|seg_start=""|' "$bin" > "$mut/anywhere"
chmod +x "$mut/anywhere"
check 'the text-anywhere variant differs from the real resolver' 'differs' \
  "$(cmp -s "$bin" "$mut/anywhere" && echo IDENTICAL || echo differs)"
check 'without the boundary a commit message resolves - so those checks bite' 'orga|0' \
  "$(resolve_with "$mut/anywhere" "$fixture/my-e2e-repo" 'git commit -m "fix flake in npx playwright test"')"

# ...and the same for the pool allowlist: restore the denylist and `no` reads as
# "pooled, no lease needed" again.
sed "s#^  1|on|On|ON|true|True|TRUE|yes|Yes|YES) exit 1 ;;#  ''|0|false|FALSE) ;; *) exit 1 ;;#" \
  "$bin" > "$mut/denylist"
chmod +x "$mut/denylist"
check 'the denylist variant differs from the real resolver' 'differs' \
  "$(cmp -s "$bin" "$mut/denylist" && echo IDENTICAL || echo differs)"
check 'as a denylist SF_SCRATCH_POOL=no takes NO lease - the defect' '|1' \
  "$(resolve_with "$mut/denylist" "$fixture/my-e2e-repo" 'SF_SCRATCH_POOL=no npx playwright test')"

if [[ $failures -gt 0 ]]; then
  printf '%d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'sf-org-resolve behaves correctly\n'
