import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { budgetDecision, waitForBudget, runQueue, readAccountState, executeTask, parseArgs } from '../codex/bin/codex-budget.mjs';

const now = 1800000000000;
function usage(primary = 10, secondary = 10) {
  return { ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: {
    limitId: 'codex', planType: 'plus',
    primary: { usedPercent: primary, windowDurationMins: 300, resetsAt: now / 1000 + 100 },
    secondary: { usedPercent: secondary, windowDurationMins: 10080, resetsAt: now / 1000 + 1000 },
  } } };
}
const account = value => ({ usage: value, model: 'gpt-6.1-sol', effort: 'medium' });

test('either window constrains work at exact reserve thresholds', () => {
  for (const [used, expected] of [[69, 'ready'], [70, 'finish-current'], [85, 'finish-current'], [86, 'checkpoint'], [100, 'exhausted']]) {
    assert.equal(budgetDecision(usage(used), 'gpt-6.1-sol', now).state, expected);
    assert.equal(budgetDecision(usage(0, used), 'gpt-6.1-sol', now).state, expected);
  }
});

test('missing, invalid, and stale data never permit a task', () => {
  for (const raw of [null, {}, { rateLimitsByLimitId: {} }, usage(NaN), usage(-1), usage(101)]) {
    assert.equal(budgetDecision(raw, 'gpt-6.1-sol', now).state, 'unknown');
  }
  const missing = usage(); missing.rateLimitsByLimitId.codex.secondary = null;
  assert.equal(budgetDecision(missing, 'gpt-6.1-sol', now).state, 'unknown');
  const stale = usage(); stale.rateLimitsByLimitId.codex.primary.resetsAt = now / 1000;
  assert.equal(budgetDecision(stale, 'gpt-6.1-sol', now).state, 'unknown');
  const blocked = usage(); blocked.ordinaryUsageAllowed = false;
  assert.equal(budgetDecision(blocked, 'gpt-6.1-sol', now).state, 'blocked');
  assert.equal(budgetDecision(usage(), null, now).state, 'unknown');
  const unknownPlan = usage(); delete unknownPlan.rateLimitsByLimitId.codex.planType;
  assert.equal(budgetDecision(unknownPlan, 'gpt-6.1-sol', now).state, 'unknown');
  unknownPlan.rateLimitsByLimitId.codex.planType = 'unknown'; unknownPlan.rateLimitsByLimitId.codex.secondary = null;
  assert.equal(budgetDecision(unknownPlan, 'gpt-6.1-sol', now).state, 'unknown');
});

test('applicable model-specific bucket also constrains the shared allowance', () => {
  const raw = usage(); raw.rateLimitsByLimitId.astra = { ...raw.rateLimitsByLimitId.codex,
    limitId: 'astra', normalModelSlug: 'gpt-6-astra', primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: now / 1000 + 500 } };
  assert.equal(budgetDecision(raw, 'gpt-6.1-sol', now).state, 'ready');
  assert.equal(budgetDecision(raw, 'gpt-6-astra', now).state, 'checkpoint');
});

test('unidentifiable extra allowances stop work instead of assuming inapplicability', () => {
  const raw = usage(); raw.rateLimitsByLimitId.opaque = { limitId: 'opaque', normalModelSlug: null,
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: now / 1000 + 500 } };
  assert.equal(budgetDecision(raw, 'gpt-6.1-sol', now).state, 'unknown');
});

test('waits until both constraining resets, then re-reads service values', async () => {
  let clock = now; let reads = 0; let sleeps = 0;
  const result = await waitForBudget({ model: 'gpt-6.1-sol', wait: true,
    now: () => clock, sleep: async ms => { clock += ms; sleeps++; },
    read: async () => account(++reads === 1 ? usage(100, 100) : {
      rateLimitsByLimitId: { codex: { ...usage().rateLimitsByLimitId.codex,
        primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: clock / 1000 + 100 },
        secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: clock / 1000 + 1000 } } } }),
  });
  assert.equal(result.decision.state, 'ready'); assert.equal(reads, 2);
  assert.ok(sleeps > 1); assert.equal(clock, now + 1005000);
});

test('unknown data and bounded waits stop without sleeping or starting work', async () => {
  const sleep = () => assert.fail('must not wait');
  await assert.rejects(waitForBudget({ read: async () => account({}), wait: true, now: () => now, sleep }), /unknown/);
  await assert.rejects(waitForBudget({ read: async () => account(usage(100)), wait: true,
    maxWaitMs: 1000, now: () => now, sleep }), /exhausted/);
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'codex-budget-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo'); await mkdir(repo);
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'initial', '--allow-empty']);
  const task = join(dir, 'task.md'); await writeFile(task, 'Make one bounded change.');
  return { dir, repo, task };
}

const report = status => ({ status, summary: 'Test', verification: ['test passed'], remainingCriteria: [], nextAction: 'None' });

test('clean task writes a compact report and checks allowance before and after', async t => {
  const { repo, task } = await fixture(t); let reads = 0; let executions = 0;
  const result = await runQueue({ repo, tasks: [task] }, {
    read: async () => { reads++; return account(usage()); }, timing: { now: () => now }, log: () => {},
    execute: async options => { executions++; assert.equal(options.model, 'gpt-6.1-sol');
      await writeFile(options.reportPath, JSON.stringify(report('completed')));
      return { code: 0, threadId: 'test-thread' }; },
  });
  assert.equal(result.status, 'completed'); assert.equal(reads, 2); assert.equal(executions, 1);
  const entries = await readdir(join(repo, '.git', 'codex-budget'));
  assert.equal(entries.includes('runner.lock'), false);
});

test('failed task is recorded once and never replayed', async t => {
  const { repo, task } = await fixture(t); let executions = 0;
  await assert.rejects(runQueue({ repo, tasks: [task, task] }, {
    read: async () => account(usage()), timing: { now: () => now }, log: () => {},
    execute: async () => { executions++; return { code: 1, threadId: 'failed-thread' }; },
  }), /no task was retried/);
  assert.equal(executions, 1);
  const root = join(repo, '.git', 'codex-budget'); const [run] = await readdir(root);
  const saved = JSON.parse(await readFile(join(root, run, 'checkpoint.json')));
  assert.equal(saved.status, 'interrupted'); assert.equal(saved.tasks[0].threadId, 'failed-thread');
});

test('an interrupted task cannot advance the queue even with a successful exit', async t => {
  const { repo, task } = await fixture(t); let executions = 0;
  await assert.rejects(runQueue({ repo, tasks: [task, task] }, {
    read: async () => account(usage()), timing: { now: () => now }, log: () => {},
    execute: async () => { executions++; return { code: 0, interrupted: true }; },
  }), /interrupted/);
  assert.equal(executions, 1);
});

test('unfinished work stops the queue', async t => {
  const { repo, task } = await fixture(t); let executions = 0;
  await assert.rejects(runQueue({ repo, tasks: [task, task] }, {
    read: async () => account(usage()), timing: { now: () => now }, log: () => {},
    execute: async options => { executions++; await writeFile(options.reportPath, JSON.stringify(report('paused'))); return { code: 0 }; },
  }), /unfinished work/);
  assert.equal(executions, 1);
});

test('a missing report retains the session and records that inspection is needed', async t => {
  const { repo, task } = await fixture(t);
  await assert.rejects(runQueue({ repo, tasks: [task] }, {
    read: async () => account(usage()), timing: { now: () => now }, log: () => {},
    execute: async () => ({ code: 0, threadId: 'inspect-this-thread' }),
  }), /Missing or invalid/);
  const root = join(repo, '.git', 'codex-budget'); const [run] = await readdir(root);
  const saved = JSON.parse(await readFile(join(root, run, 'checkpoint.json')));
  assert.equal(saved.status, 'needs-inspection'); assert.equal(saved.tasks[0].threadId, 'inspect-this-thread');
});

test('changed worktree prevents queued work and credentials are never needed in tests', async t => {
  const { repo, task } = await fixture(t);
  await writeFile(join(repo, 'user-work'), 'preserve');
  await assert.rejects(runQueue({ repo, tasks: [task] }), /clean repository/);
  assert.equal(await readFile(join(repo, 'user-work'), 'utf8'), 'preserve');
});

test('a repository change while waiting prevents execution', async t => {
  const { repo, task } = await fixture(t);
  await assert.rejects(runQueue({ repo, tasks: [task] }, {
    read: async () => { await writeFile(join(repo, 'new-work'), 'preserve'); return account(usage()); },
    timing: { now: () => now }, log: () => {}, execute: () => assert.fail('must not execute'),
  }), /changed while waiting/);
});

test('switching branches at the same commit while waiting prevents execution', async t => {
  const { repo, task } = await fixture(t);
  await assert.rejects(runQueue({ repo, tasks: [task] }, {
    read: async () => { execFileSync('git', ['-C', repo, 'checkout', '-qb', 'other']); return account(usage()); },
    timing: { now: () => now }, log: () => {}, execute: () => assert.fail('must not execute'),
  }), /changed while waiting/);
});

test('changed task instructions while waiting prevent execution', async t => {
  const { repo, task } = await fixture(t);
  await assert.rejects(runQueue({ repo, tasks: [task] }, {
    read: async () => { await writeFile(task, 'Different scope'); return account(usage()); },
    timing: { now: () => now }, log: () => {}, execute: () => assert.fail('must not execute'),
  }), /instructions changed/);
});

test('an existing repository lock blocks a second runner', async t => {
  const { repo, task } = await fixture(t);
  const root = join(repo, '.git', 'codex-budget'); await mkdir(root);
  await writeFile(join(root, 'runner.lock'), '123');
  await assert.rejects(runQueue({ repo, tasks: [task] }), /Runner lock exists/);
  assert.equal(await readFile(join(root, 'runner.lock'), 'utf8'), '123');
});

test('protocol client handles initialization, reads only config and limits, and closes the process', async t => {
  const { dir } = await fixture(t); const fake = join(dir, 'fake-codex');
  await writeFile(fake, `#!/usr/bin/env node\nconst rl=require('node:readline').createInterface({input:process.stdin});
rl.on('line',s=>{const m=JSON.parse(s); const allowed=['initialize','initialized','config/read','account/rateLimits/read'];
 if(!allowed.includes(m.method))process.exit(2);
 if(m.method==='initialized')return;
 if(m.method==='config/read'&&!m.params.cwd)process.exit(3);
 const result=m.method==='config/read'?{config:{model:'gpt-6.1-sol',model_reasoning_effort:'medium'}}:m.method==='account/rateLimits/read'?{rateLimits:{limitId:'codex'}}:{};
 process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');});`, { mode: 0o700 });
  const result = await readAccountState({ executable: fake, timeoutMs: 2000 });
  assert.equal(result.model, 'gpt-6.1-sol'); assert.equal(result.usage.rateLimits.limitId, 'codex');
});

test('protocol errors and timeouts fail closed', async t => {
  const { dir } = await fixture(t); const fake = join(dir, 'error-codex');
  await writeFile(fake, '#!/usr/bin/env node\nprocess.stdin.on("data",()=>process.stdout.write(JSON.stringify({id:1,error:{message:"no"}})+"\\n"));', { mode: 0o700 });
  await assert.rejects(readAccountState({ executable: fake, timeoutMs: 2000 }), /rejected/);
  const hanging = join(dir, 'hanging-codex');
  await writeFile(hanging, '#!/usr/bin/env node\nprocess.stdin.resume();', { mode: 0o700 });
  await assert.rejects(readAccountState({ executable: hanging, timeoutMs: 100 }), /timed out/);
});

test('exec uses argv and stdin rather than a shell, with sandbox and automatic approval review', async t => {
  const { dir, repo } = await fixture(t); const fake = join(dir, 'exec-codex');
  const output = join(dir, 'argv.json');
  await writeFile(fake, `#!/usr/bin/env node\nlet text='';process.stdin.on('data',x=>text+=x);process.stdin.on('end',()=>{require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({args:process.argv.slice(2),text}));console.log(JSON.stringify({type:'thread.started',thread_id:'thread'}));});`, { mode: 0o700 });
  const result = await executeTask({ repo, model: 'gpt-6.1-sol', effort: 'high', task: 'Literal $(touch no) and `shell`',
    schemaPath: '/tmp/schema', reportPath: '/tmp/report', executable: fake });
  assert.equal(result.code, 0); const saved = JSON.parse(await readFile(output));
  assert.ok(saved.args.includes('--approve-for-me')); assert.ok(saved.args.includes('workspace-write'));
  assert.ok(saved.text.includes('$(touch no)')); assert.ok(!saved.args.some(x => x.includes('bypass')));
});

test('arguments reject unsupported switches and invalid wait bounds', () => {
  assert.throws(() => parseArgs(['run', '--max-wait-hours', '-1']), /bound/);
  assert.throws(() => parseArgs(['run', '--max-wait-hours', 'Infinity']), /bound/);
  assert.throws(() => parseArgs(['run', '--effort', 'ultra']), /effort/);
  assert.throws(() => parseArgs(['run', '--dangerously-bypass-approvals-and-sandbox']), /Unknown/);
});

test('SIGINT remains an interruption when the child handles it and exits zero', async t => {
  const { dir, repo } = await fixture(t);
  const fake = join(dir, 'signal-codex'); const driver = join(dir, 'driver.mjs');
  const ready = join(dir, 'ready');
  await writeFile(fake, `#!/usr/bin/env node\nprocess.stdin.resume();setInterval(()=>{},1000);process.on('SIGINT',()=>process.exit(0));
process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'signal-thread'})+'\\n');
require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');`, { mode: 0o700 });
  const moduleUrl = new URL('../codex/bin/codex-budget.mjs', import.meta.url).href;
  await writeFile(driver, `import {executeTask} from ${JSON.stringify(moduleUrl)};
const result=await executeTask({repo:${JSON.stringify(repo)},executable:${JSON.stringify(fake)},
 model:'gpt-6.1-sol',task:'test',schemaPath:'/tmp/schema',reportPath:'/tmp/report'});
console.log(JSON.stringify(result));`);
  // An isolated driver receives the signal so the test runner is unaffected.
  const child = spawn(process.execPath, [driver], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let text = ''; child.stdout.on('data', chunk => { text += chunk; });
  let started = false;
  for (let tries = 0; tries < 500 && !started; tries++) {
    try { await readFile(ready); started = true; } catch { await new Promise(r => setTimeout(r, 10)); }
  }
  assert.ok(started, 'fake Codex child must be ready before interrupting');
  const closed = new Promise(r => child.on('close', r));
  child.kill('SIGINT');
  const code = await closed;
  assert.equal(code, 0);
  const result = JSON.parse(text); assert.equal(result.code, 0); assert.equal(result.interrupted, true);
});
