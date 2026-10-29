// Issue #102: characterize current behavior; corpus text is data, never executed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'sf-shell-intent-'));
try {
  const cwd = join(fixture, 'repo');
  mkdirSync(join(cwd, 'child'), { recursive: true });
  mkdirSync(join(fixture, 'home'));
  writeFileSync(join(cwd, '.env'), 'SF_ORG_ALIAS=unused\nSF_BASE_URL=https://fake--orga.example.invalid\n');
  writeFileSync(join(cwd, 'child/.env'), 'SF_BASE_URL=https://fake--orgb.example.invalid\n');
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'test:unit': 'vitest run' } }));
  writeFileSync(join(fixture, 'map'), 'orga shared-a\norgb shared-b\n');
  const probe = join(fixture, 'probe.sh');
  writeFileSync(probe, `source "$1/claude/hooks/sf-lease-common.sh" || exit 90
effective="$(effective_cwd "$2" "$3")"
"$1/bin/sf-org-resolve" "$effective" "$3"
`);
  // Model only a rival holder, not store/TTL behavior. The real guard calls this
  // fixed fake binary; none of the supplied command text is run by it.
  const rival = join(fixture, 'rival.sh');
  writeFileSync(rival, '#!/usr/bin/env bash\ncase "$1" in claim) exit 1 ;; holder) printf "synthetic-rival\\n" ;; *) exit 91 ;; esac\n', { mode: 0o755 });
  const env = {
    PATH: process.env.PATH, HOME: join(fixture, 'home'), LC_ALL: 'C',
    SF_ORG_MAP: join(fixture, 'map'), SF_LEASE_HOME: join(fixture, 'store'),
    SF_LEASE_LOG: join(fixture, 'store/hook.log'), SF_LEASE_ENABLE: '1',
    SF_ORG_RESOLVE_BIN: join(repo, 'bin/sf-org-resolve'), SF_LEASE_BIN: rival,
  };
  const sentinel = join(fixture, 'MUST_NOT_EXIST');
  // name, text, intended shared org (null = prose/non-test), observed identity.
  // Intent is a hand-labelled possible execution, not a claim that branches run
  // or that arbitrary shell semantics have been evaluated.
  const cases = [
    ['literal-test', 'npx playwright test', 'shared-a', 'shared-a'],
    ['assignment', 'TEST_ENV=prod SF_ORG_ALIAS=orga npx playwright test', 'shared-a', 'shared-a'],
    ['npm-script', 'npm run test:unit', 'shared-a', 'shared-a'],
    ['non-test', 'npm run lint', null, null],
    ['single-line-prose', 'git commit -m "fix npx playwright test"', null, null],
    ['multiline-commit', 'git commit -m "fix\nnpx playwright test was red"', null, 'shared-a'],
    ['multiline-pr', 'gh pr create --body "Test plan\nnpx playwright test\n"', null, 'shared-a'],
    ['quoted-separator', 'git commit -m "wip; npx playwright test"', null, 'shared-a'],
    ['literal-heredoc', "cat <<'EOF'\nnpx playwright test\nEOF", null, 'shared-a'],
    ['plain-heredoc', 'cat <<EOF\nnpx playwright test\nEOF', null, 'shared-a'],
    ['quoted-heredoc-substitution', "cat <<'EOF'\n$(npx playwright test)\nEOF", null, 'shared-a'],
    ['expanding-heredoc-substitution', 'cat <<EOF\n$(npx playwright test)\nEOF', 'shared-a', 'shared-a'],
    ['subshell', '( npx playwright test )', 'shared-a', null],
    ['substitution', 'echo $(npx playwright test)', 'shared-a', null],
    ['backticks', 'echo `npx playwright test`', 'shared-a', null],
    ['quoted-command-word', '"npx" playwright test', 'shared-a', null],
    ['literal-cd', 'cd child && npx playwright test', 'shared-b', 'shared-b'],
    ['quoted-literal-cd', 'cd "child" && npx playwright test', 'shared-b', 'shared-b'],
    ['variable-cd', 'cd "$TARGET" && npx playwright test', 'shared-b', 'shared-a'],
    ['late-cd', 'echo ready; cd child && npx playwright test', 'shared-b', 'shared-a'],
    ['pushd', 'pushd child && npx playwright test', 'shared-b', 'shared-a'],
    ['nested-cd', '(cd child && npx playwright test)', 'shared-b', 'shared-a'],
    ['cd-hop-limit', 'cd . && cd . && cd . && cd . && cd child && npx playwright test', 'shared-b', 'shared-a'],
    ['failed-cd-and', 'cd missing && npx playwright test', null, 'shared-a'],
    ['text-must-not-run', `echo $(touch ${sentinel})`, null, null],
  ];
  const totals = { correct: 0, falseBlock: 0, missed: 0, wrongOrg: 0 };
  console.log('| Case | Intended org | Observed org | Guard rc with rival | Result |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const [name, command, intended, expected] of cases) {
    const observed = spawnSync('bash', [probe, repo, cwd, command], { env, encoding: 'utf8' });
    assert.ifError(observed.error);
    assert.equal(observed.status, expected === null ? 1 : 0, `${name}: resolver rc; ${observed.stderr}`);
    assert.equal(observed.stdout.trim(), expected ?? '', `${name}: identity`);
    const payload = { tool_name: 'Bash', session_id: 'synthetic-session', tool_use_id: 'synthetic-call', cwd, tool_input: { command } };
    const guard = spawnSync('bash', [join(repo, 'claude/hooks/sf-lease-guard.sh')], {
      env, input: JSON.stringify(payload), encoding: 'utf8',
    });
    assert.ifError(guard.error);
    assert.equal(guard.status, expected === null ? 0 : 2, `${name}: guard rc; ${guard.stderr}`);
    if (expected !== null) assert.match(guard.stderr, /synthetic-rival/);
    let result = 'correct';
    if (intended === null && expected !== null) result = 'falseBlock';
    else if (intended !== null && expected === null) result = 'missed';
    else if (intended !== expected) result = 'wrongOrg';
    totals[result]++;
    console.log(`| ${name} | ${intended ?? 'none'} | ${expected ?? 'none'} | ${guard.status} | ${result} |`);
  }
  assert.equal(existsSync(sentinel), false, 'corpus command text must never execute');
  // Ensure fixture identities and paths cannot accidentally point to this checkout.
  assert.notEqual(resolve(cwd), resolve(repo));
  console.log(`${cases.length} synthetic cases passed: ${JSON.stringify(totals)}.`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
