import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePoller } from '../src/live-poller.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

const harness = (overrides = {}) => {
  const intervals = [];
  const cleared = [];
  let hidden = false;
  const subscribers = [];
  const events = { results: [], failures: [], exhausted: 0 };
  const poller = createLivePoller({
    pollOnce: overrides.pollOnce ?? (async () => ({ ok: true })),
    onResult: (s) => events.results.push(s),
    onFailure: (n) => events.failures.push(n),
    onExhausted: () => { events.exhausted += 1; },
    intervalMs: overrides.intervalMs ?? 5000,
    maxFailures: overrides.maxFailures ?? 3,
    setIntervalFn: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; },
    clearIntervalFn: (id) => cleared.push(id),
    visibility: {
      isHidden: () => hidden,
      subscribe: (fn) => { subscribers.push(fn); return () => {}; },
    },
  });
  return {
    poller, events, intervals, cleared,
    setHidden: (v) => { hidden = v; },
    fireVisibility: async () => { for (const fn of subscribers) fn(); await settle(); },
    tick: async () => { await intervals[0].fn(); await settle(); },
  };
};

test('start does an immediate poll and schedules the interval', async () => {
  const h = harness();
  await h.poller.start();
  await settle();
  assert.equal(h.events.results.length, 1);
  assert.equal(h.intervals[0].delay, 5000);
});

test('a failing tick counts up and keeps polling', async () => {
  const h = harness({ pollOnce: async () => { throw new Error('boom'); } });
  await h.poller.start();
  await settle();
  await h.tick();
  assert.deepEqual(h.events.failures, [1, 2]);
  assert.equal(h.events.exhausted, 0);
});

test('reaching maxFailures fires onExhausted and stops', async () => {
  const h = harness({ pollOnce: async () => { throw new Error('boom'); } });
  await h.poller.start();
  await settle();      // failure 1
  await h.tick();      // failure 2
  await h.tick();      // failure 3 -> exhausted
  assert.equal(h.events.exhausted, 1);
  assert.equal(h.cleared.length, 1);
  assert.equal(h.poller.isRunning(), false);
});

test('a success resets the failure counter', async () => {
  let calls = 0;
  const h = harness({ pollOnce: async () => { calls += 1; if (calls === 1 || calls === 3) throw new Error('boom'); return { ok: true }; } });
  await h.poller.start();  // fail -> count 1
  await settle();
  await h.tick();          // success -> reset
  await h.tick();          // fail -> count 1 again, not 2
  assert.deepEqual(h.events.failures, [1, 1]);
});

test('hidden tab skips polling; becoming visible triggers a tick', async () => {
  const h = harness();
  h.setHidden(true);
  await h.poller.start();  // hidden: immediate tick skipped
  await settle();
  assert.equal(h.events.results.length, 0);
  h.setHidden(false);
  await h.fireVisibility();
  assert.equal(h.events.results.length, 1);
});

test('an onResult that throws does not count as a failure or trip onExhausted', async () => {
  // Built directly (not via harness) so onResult can throw, observable independent of pollOnce.
  // start()'s initial tick is awaited directly (not fire-and-forgotten like the interval
  // path), so the rejection from onResult is caught here rather than becoming unhandled.
  const cleared = [];
  const events = { results: 0, failures: [], exhausted: 0 };
  const poller = createLivePoller({
    pollOnce: async () => ({ ok: true }),
    onResult: () => { events.results += 1; throw new Error('render blew up'); },
    onFailure: (n) => events.failures.push(n),
    onExhausted: () => { events.exhausted += 1; },
    intervalMs: 5000,
    maxFailures: 1,
    setIntervalFn: () => 1,
    clearIntervalFn: (id) => cleared.push(id),
  });

  await poller.start().catch(() => {});
  await settle();

  assert.equal(events.results, 1);
  assert.deepEqual(events.failures, []);
  assert.equal(events.exhausted, 0);
  assert.equal(poller.isRunning(), true);
});

test('reentrancy guard: prevents onExhausted from firing twice on overlapping failures', async () => {
  let callCount = 0;
  let deferred = null;
  const h = harness({
    maxFailures: 1,
    pollOnce: async () => {
      callCount += 1;
      return new Promise((resolve, reject) => {
        deferred = { resolve, reject };
      });
    }
  });

  h.poller.start().catch(() => {});  // don't await, allow test to continue
  await settle();

  // First tick is now pending, waiting for the deferred
  assert.equal(callCount, 1);

  // Try to fire a second tick while first is still pending
  await h.tick();
  await settle();

  // Reentrancy guard should prevent the second tick from running
  // so callCount should still be 1
  assert.equal(callCount, 1);

  // Reject the deferred to fail the tick
  deferred.reject(new Error('fail'));
  await settle();

  // One failure should be recorded
  assert.equal(h.events.failures.length, 1);
  // onExhausted should have been called exactly once
  assert.equal(h.events.exhausted, 1);
  assert.equal(h.poller.isRunning(), false);
});

test('a hanging request times out, aborts, retries, and reaches fallback', async () => {
  const deadlines = new Map();
  let nextTimer = 0;
  let interval;
  const signals = [];
  const events = [];
  const poller = createLivePoller({
    pollOnce: (signal) => { signals.push(signal); return new Promise(() => {}); },
    onResult: () => events.push('result'),
    onFailure: (count) => events.push(count),
    onExhausted: () => events.push('exhausted'),
    intervalMs: 5000, maxFailures: 3, requestTimeoutMs: 10000,
    setIntervalFn: (fn) => { interval = fn; return 1; },
    clearIntervalFn: () => {},
    setTimeoutFn: (fn, delay) => { assert.equal(delay, 10000); deadlines.set(++nextTimer, fn); return nextTimer; },
    clearTimeoutFn: (id) => deadlines.delete(id),
  });
  const first = poller.start();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(signals.length, attempt + 1);
    [...deadlines.values()][0]();
    await settle();
    assert.equal(signals[attempt].aborted, true);
    assert.equal(deadlines.size, 0);
    if (attempt < 2) interval();
  }
  await first;
  assert.deepEqual(events, [1, 2, 3, 'exhausted']);
  assert.equal(poller.isRunning(), false);
});

test('stop aborts an in-flight request and discards its late result', async () => {
  let resolveRequest;
  let signal;
  const events = [];
  const poller = createLivePoller({
    pollOnce: (value) => { signal = value; return new Promise((resolve) => { resolveRequest = resolve; }); },
    onResult: () => events.push('result'), onFailure: () => events.push('failure'),
    onExhausted: () => events.push('exhausted'), intervalMs: 5000, maxFailures: 3,
    setIntervalFn: () => 1, clearIntervalFn: () => {},
  });
  const pending = poller.start();
  poller.stop();
  assert.equal(signal.aborted, true);
  resolveRequest({ late: true });
  await pending;
  assert.deepEqual(events, []);
});
