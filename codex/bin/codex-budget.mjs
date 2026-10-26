#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const START_RESERVE = 30;
const FINISH_RESERVE = 15;
const delay = ms => new Promise(r => setTimeout(r, ms));

function stopProcess(child, signal = 'SIGTERM') {
  try { process.kill(-child.pid, signal); } catch { child.kill(signal); }
}

// Only documented, read-only account/config RPCs. No turns or auth-file reads.
export function readAccountState({ cwd = process.cwd(), timeoutMs = 20000, executable = 'codex' } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
      cwd, detached: true, stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    let config;
    const timer = setTimeout(() => finish(new Error('Codex usage query timed out; no task started.')), timeoutMs);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      stopProcess(child, 'SIGKILL');
      if (error) reject(error); else resolveResult(result);
    }
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    child.on('error', () => finish(new Error('Cannot start codex app-server.')));
    child.on('exit', () => finish(new Error('Codex closed before returning usage.')));
    child.stdin.on('error', () => finish(new Error('Codex usage connection closed.')));
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        if (![1, 2, 3].includes(message.id)) return;
        if (message.error) return finish(new Error('Codex rejected a read-only usage/config request.'));
        if (message.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'config/read', params: { includeLayers: false, cwd } });
        } else if (message.id === 2) {
          config = message.result?.config;
          send({ id: 3, method: 'account/rateLimits/read' });
        } else {
          finish(null, { usage: message.result, model: config?.model, effort: config?.model_reasoning_effort });
        }
      } catch { finish(new Error('Invalid Codex usage response.')); }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'codex_budget', version: '1.0.0' } } });
  });
}

export function budgetDecision(usage, model, now = Date.now()) {
  const unknown = reason => ({ state: 'unknown', reason, windows: [] });
  if (!model || typeof model !== 'string') return unknown('Effective model is unavailable.');
  const buckets = usage?.rateLimitsByLimitId;
  const main = buckets?.codex ?? (usage?.rateLimits?.limitId === 'codex' ? usage.rateLimits : null);
  if (!main) return unknown('The shared Codex allowance is unavailable.');
  if (typeof main.planType !== 'string' || !main.planType || main.planType === 'unknown') {
    return unknown('The plan is unknown; required allowance windows cannot be established.');
  }
  const extra = Object.values(buckets ?? {}).filter(b => b !== main);
  if (extra.some(b => !b?.normalModelSlug && b?.limitId !== model && b?.limitName !== model)) {
    return unknown('An additional allowance cannot be mapped to the selected model.');
  }
  const applicable = [main, ...Object.values(buckets ?? {}).filter(b =>
    b !== main && (b.normalModelSlug === model || b.limitId === model || b.limitName === model))];
  const windows = [];
  for (const bucket of applicable) {
    const found = [bucket.primary, bucket.secondary].filter(Boolean);
    if (!found.length) return unknown('An applicable allowance has no window data.');
    if (bucket.planType === 'plus' && bucket === main &&
        ![300, 10080].every(duration => found.some(w => w.windowDurationMins === duration))) {
      return unknown('Plus five-hour or weekly allowance is missing.');
    }
    for (const window of found) {
      const { usedPercent, windowDurationMins, resetsAt } = window;
      if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100 ||
          !Number.isFinite(windowDurationMins) || windowDurationMins <= 0 ||
          !Number.isFinite(resetsAt) || resetsAt * 1000 <= now) {
        return unknown('An allowance window is malformed or stale; refresh usage.');
      }
      windows.push({ bucket: bucket.limitId, durationMins: windowDurationMins,
        remainingPercent: 100 - usedPercent, resetsAt });
    }
  }
  const minimum = Math.min(...windows.map(w => w.remainingPercent));
  const state = minimum <= 0 ? 'exhausted' : minimum < FINISH_RESERVE ? 'checkpoint' :
    minimum <= START_RESERVE ? 'finish-current' : 'ready';
  const constrained = windows.filter(w => w.remainingPercent <= START_RESERVE);
  // Both windows must recover. Re-read after the latest constraining reset.
  const nextCheckAt = constrained.length ? Math.max(...constrained.map(w => w.resetsAt * 1000)) + 5000 : null;
  if (usage?.ordinaryUsageAllowed === false || applicable.some(b => b.spendControlReached || b.rateLimitReachedType)) {
    return { state: 'blocked', reason: 'The service reports a usage or spending block.', windows, nextCheckAt };
  }
  return { state, minimumRemainingPercent: minimum, windows, nextCheckAt };
}

export async function waitForBudget({ read, model, wait = false, maxWaitMs = 86400000,
  now = Date.now, sleep = delay, onDecision = () => {} }) {
  const deadline = now() + maxWaitMs;
  for (;;) {
    const account = await read();
    const effectiveModel = model ?? account.model;
    const decision = budgetDecision(account.usage, effectiveModel, now());
    await onDecision(decision);
    if (decision.state === 'ready') return { account, model: effectiveModel, decision };
    if (!wait || !decision.nextCheckAt || decision.state === 'unknown' ||
        decision.nextCheckAt > deadline || decision.nextCheckAt <= now()) {
      throw new Error(`Task not started: usage ${decision.state}; inspect checkpoint or codex-budget status.`);
    }
    // Timer waits use no model calls. Short slices allow signals to stop the process.
    while (now() < decision.nextCheckAt) await sleep(Math.min(60000, decision.nextCheckAt - now()));
  }
}

const outputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['completed', 'paused', 'blocked'] },
    summary: { type: 'string' }, verification: { type: 'array', items: { type: 'string' } },
    remainingCriteria: { type: 'array', items: { type: 'string' } }, nextAction: { type: 'string' },
  }, required: ['status', 'summary', 'verification', 'remainingCriteria', 'nextAction'],
};

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function executeTask({ repo, model, effort, task, schemaPath, reportPath, executable = 'codex' }) {
  return new Promise((resolveResult, reject) => {
    const args = ['exec', '--approve-for-me', '--sandbox', 'workspace-write', '--model', model,
      '--json', '--output-schema', schemaPath, '--output-last-message', reportPath];
    if (effort) args.push('-c', `model_reasoning_effort=${JSON.stringify(effort)}`);
    args.push('-');
    const child = spawn(executable, args, { cwd: repo, detached: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let threadId = null;
    let interrupted = false;
    let killTimer;
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      try { const event = JSON.parse(line); if (event.type === 'thread.started') threadId = event.thread_id; } catch { /* No raw tool logs. */ }
    });
    const interrupt = () => {
      interrupted = true;
      stopProcess(child, 'SIGINT');
      killTimer ??= setTimeout(() => stopProcess(child, 'SIGKILL'), 10000);
      killTimer.unref();
    };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    const cleanup = () => { clearTimeout(killTimer); lines.close(); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); };
    child.on('error', error => { cleanup(); reject(error); });
    child.stdin.on('error', () => {});
    child.on('exit', (code, signal) => { cleanup(); resolveResult({ code, signal, threadId, interrupted }); });
    child.stdin.end(`Complete only this bounded task. Follow AGENTS.md and existing task authority.
Check codex-budget status --model ${model} before costly phases when available.
At low allowance finish the current safe step and return a paused checkpoint.
Preserve unrelated work. Use focused checks during iteration, required broader
checks and risk-triggered fresh review before completion. Do not start nested
task runners. Report verification and remaining criteria accurately; do not
claim completed if required review, testing, or delivery steps remain.

Task:\n${task}`);
  });
}

export async function runQueue(options, dependencies = {}) {
  const repo = realpathSync(resolve(options.repo ?? '.'));
  const taskFiles = options.tasks ?? [];
  if (!taskFiles.length) throw new Error('Provide one or more --task files.');
  const root = git(repo, 'rev-parse', '--show-toplevel');
  if (repo !== root) throw new Error('--repo must be the repository root.');
  if (git(repo, 'status', '--porcelain')) throw new Error('Use a clean repository or isolated worktree for unattended tasks.');
  const gitDir = resolve(repo, git(repo, 'rev-parse', '--git-common-dir'));
  const stateRoot = join(gitDir, 'codex-budget');
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const lockPath = join(stateRoot, 'runner.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new Error(`Runner lock exists: ${lockPath}. Inspect its process before removing a stale lock.`); }
  try {
    await lock.writeFile(String(process.pid));
    const runDir = join(stateRoot, randomUUID());
    await mkdir(runDir, { mode: 0o700 });
    const schemaPath = join(runDir, 'response-schema.json');
    await writeFile(schemaPath, JSON.stringify(outputSchema), { mode: 0o600 });
    const checkpoint = { repo, status: 'waiting', tasks: [], branch: git(repo, 'branch', '--show-current'), commit: git(repo, 'rev-parse', 'HEAD') };
    const checkpointPath = join(runDir, 'checkpoint.json');
    const save = () => writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n', { mode: 0o600 });
    const read = dependencies.read ?? (() => readAccountState({ cwd: repo }));
    const execute = dependencies.execute ?? executeTask;
    const log = dependencies.log ?? console.log;
    log(`Checkpoint: ${checkpointPath}`);
    for (const file of taskFiles) {
      const task = await readFile(resolve(file), 'utf8');
      if (!task.trim() || Buffer.byteLength(task) > 16000) throw new Error('Task files must contain 1–16000 bytes of scoped instructions.');
      const entry = { file: resolve(file), sha256: createHash('sha256').update(task).digest('hex'), status: 'waiting' };
      checkpoint.tasks.push(entry);
      checkpoint.status = 'waiting';
      await save();
      const ready = await waitForBudget({ read, model: options.model, wait: options.wait,
        maxWaitMs: options.maxWaitMs, ...(dependencies.timing ?? {}), onDecision: async decision => {
          checkpoint.usage = decision; await save(); log(`Allowance: ${decision.state}`);
        } });
      // The user or another session may have changed the repository while we waited.
      if (git(repo, 'status', '--porcelain') || git(repo, 'rev-parse', 'HEAD') !== checkpoint.commit ||
          git(repo, 'branch', '--show-current') !== checkpoint.branch) {
        throw new Error('Repository changed while waiting; inspect it before starting the queued task.');
      }
      if (await readFile(resolve(file), 'utf8') !== task) throw new Error('Task instructions changed while waiting; inspect before starting.');
      const reportPath = join(runDir, `task-${checkpoint.tasks.length}.json`);
      entry.status = 'running'; checkpoint.status = 'running'; await save();
      const result = await execute({ repo, task, model: ready.model, effort: options.effort ?? ready.account.effort, schemaPath, reportPath });
      entry.threadId = result.threadId;
      checkpoint.branch = git(repo, 'branch', '--show-current');
      checkpoint.commit = git(repo, 'rev-parse', 'HEAD');
      await save();
      if (result.code !== 0 || result.signal || result.interrupted) {
        entry.status = 'interrupted'; checkpoint.status = 'interrupted'; await save();
        throw new Error('Task interrupted or failed. Inspect its session and checkpoint before resuming; no task was retried.');
      }
      let report;
      try {
        report = JSON.parse(await readFile(reportPath, 'utf8'));
        if (!['completed', 'paused', 'blocked'].includes(report.status) || !Array.isArray(report.remainingCriteria) ||
            !report.remainingCriteria.every(x => typeof x === 'string') || !Array.isArray(report.verification) ||
            !report.verification.every(x => typeof x === 'string') || typeof report.summary !== 'string' || typeof report.nextAction !== 'string') {
          throw new Error('Invalid report.');
        }
      } catch {
        entry.status = 'needs-inspection'; checkpoint.status = 'needs-inspection'; await save();
        throw new Error('Missing or invalid task report; inspect the recorded session before continuing.');
      }
      entry.report = report; entry.status = report.status; checkpoint.status = report.status; await save();
      if (report.status !== 'completed' || report.remainingCriteria.length) throw new Error('Task has unfinished work; checkpoint saved.');
      // Always record the post-task observation, even after the final queued task.
      const after = await read(); checkpoint.usage = budgetDecision(after.usage, ready.model); await save();
      log(`Task completed: ${entry.file}`);
    }
    return checkpoint;
  } finally { await lock.close(); await unlink(lockPath); }
}

export function parseArgs(args) {
  const command = args.shift() ?? 'help';
  if (!['status', 'run', 'help', '--help', '-h'].includes(command)) throw new Error('Expected status or run.');
  const options = { repo: '.', tasks: [], wait: false, maxWaitMs: 86400000 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--wait') { options.wait = true; continue; }
    if (!['--repo', '--task', '--model', '--effort', '--max-wait-hours'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Unknown or missing option: ${arg}`);
    }
    const value = args[++i];
    if (arg === '--task') options.tasks.push(value);
    else if (arg === '--max-wait-hours') {
      if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 168) throw new Error('Wait bound must be 0–168 hours.');
      options.maxWaitMs = Number(value) * 3600000;
    } else options[arg.slice(2)] = value;
  }
  if (options.model && !/^[a-zA-Z0-9._-]+$/.test(options.model)) throw new Error('Invalid model name.');
  if (options.effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(options.effort)) throw new Error('Invalid effort.');
  return { command, options };
}

export async function main(args = process.argv.slice(2)) {
  const { command, options } = parseArgs(args);
  if (command === 'status') {
    const account = await readAccountState({ cwd: resolve(options.repo) });
    const model = options.model ?? account.model;
    const decision = budgetDecision(account.usage, model);
    console.log(JSON.stringify({ model, effort: options.effort ?? account.effort, ...decision }, null, 2));
    return decision.state === 'unknown' ? 2 : 0;
  }
  if (command === 'run') { await runQueue(options); return 0; }
  console.log('Usage: codex-budget status [--repo DIR] [--model MODEL]\n' +
    '       codex-budget run --repo DIR --task FILE [--task FILE ...] [--wait]\n' +
    '         [--model MODEL] [--effort medium|high] [--max-wait-hours 0..168]\n' +
    'Requires Node 22+, Codex ChatGPT sign-in, and a clean Git worktree.\n' +
    'Gates task boundaries; does not impose a hard in-flight spending cap.');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
