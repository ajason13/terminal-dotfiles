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
