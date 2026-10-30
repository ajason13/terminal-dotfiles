#!/usr/bin/env python3
"""Synthetic store/lifecycle tests; never inspect the operator's tmux or state."""
import copy
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import sys
sys.dont_write_bytecode = True
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
loader = importlib.machinery.SourceFileLoader('observation', str(ROOT / 'bin/tmux-agent-observation'))
spec = importlib.util.spec_from_loader(loader.name, loader)
obs = importlib.util.module_from_spec(spec)
loader.exec_module(obs)


class Tmux:
    def __init__(self, identity):
        self.identity = identity

    def panes(self):
        return {self.identity['id']: copy.deepcopy(self.identity)}

    def token(self, pane, value):
        assert pane == self.identity['id']
        self.identity['token'] = value


class Observations(unittest.TestCase):
    def setUp(self):
        # realpath resolves macOS's /var -> /private/var before testing safe walks.
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.store = str(self.root / 'store')
        self.gen = obs.generation(obs.process(os.getpid()))
        self.identity = dict(server=self.gen, pane=self.gen, id='%0', token='', epoch='123')
        self.tmux = Tmux(self.identity)
        self.now = time.time_ns()
        self.env = patch.dict(os.environ, TMUX_PANE='%0', TMUX=f'/synthetic,{os.getpid()},0')
        self.env.start()
        self.producer = patch.object(obs, 'producer', return_value=self.gen)
        self.producer.start()
        self.fire('SessionStart')

    def tearDown(self):
        self.producer.stop()
        self.env.stop()
        self.temp.cleanup()

    def fire(self, event, session='session', agent='', notification='', at=None):
        self.now += 1000000
        obs.observe(self.tmux, self.store, event, session, agent, notification,
                    now=self.now if at is None else at)

    def read(self, now=None):
        return obs.read(self.tmux, self.store, ['%0'], now=self.now if now is None else now)['%0']

    def path(self, suffix='.json'):
        return Path(self.store) / (obs.record_key(self.identity) + suffix)

    def test_presence_does_not_establish_active(self):
        self.assertEqual(self.read()['state'], 'unknown')
        self.fire('PostToolBatch')
        self.assertEqual(self.read()['state'], 'unknown')

    def test_wait_precedence_and_own_clear(self):
        self.fire('UserPromptSubmit')
        self.fire('SubagentStart', agent='a')
        self.fire('SubagentStart', agent='b')
        self.fire('Notification', agent='a', notification='elicitation_dialog')
        self.assertEqual(self.read()['state'], 'question')
        self.fire('Notification', agent='b', notification='permission_prompt')
        self.assertEqual(self.read()['state'], 'permission')
        self.fire('PostToolBatch')
        self.assertEqual(self.read()['state'], 'permission')
        self.fire('SubagentStop', agent='b')
        self.assertEqual(self.read()['state'], 'question')
        self.fire('PostToolBatch', agent='a')
        self.assertEqual(self.read()['state'], 'active')
        self.assertEqual(self.read()['agents'], 1)

    def test_each_fact_expires_independently_and_exactly(self):
        self.fire('UserPromptSubmit')
        self.fire('SubagentStart', agent='a')
        self.fire('Notification', agent='a', notification='permission_prompt')
        parked = self.now
        self.fire('PostToolBatch', at=parked + obs.TTL_NS - 10000000)
        self.assertEqual(self.read(now=parked + obs.TTL_NS - 1)['state'], 'permission')
        self.assertEqual(self.read(now=parked + obs.TTL_NS)['state'], 'active')
        self.assertEqual(self.read(now=parked + 2 * obs.TTL_NS)['state'], 'unknown')

    def test_heartbeat_cannot_reopen_expired_turn(self):
        self.fire('UserPromptSubmit')
        self.now += obs.TTL_NS
        self.fire('PostToolBatch')
        self.assertEqual(self.read()['state'], 'unknown')

    def test_stop_is_ended_not_success_and_subagent_cannot_end_lead(self):
        self.fire('UserPromptSubmit')
        self.fire('Stop', agent='other')
        self.assertEqual(self.read()['state'], 'active')
        self.fire('StopFailure')
        self.assertEqual(self.read()['state'], 'ended')
        self.assertNotIn('success', json.dumps(self.read()))
        self.fire('PostToolBatch')
        self.assertEqual(self.read()['state'], 'ended')
        self.assertEqual(self.read(now=self.now + obs.TTL_NS)['state'], 'unknown')

    def test_end_invalidates_and_old_session_cannot_update_new(self):
        self.fire('UserPromptSubmit')
        self.fire('SessionEnd')
        self.fire('UserPromptSubmit')
        self.assertEqual(self.read()['state'], 'unknown')
        self.fire('SessionStart', session='new')
        self.fire('UserPromptSubmit', session='new')
        self.fire('Stop', session='session')
        self.assertEqual(self.read()['state'], 'active')

    def test_subagent_sessionstart_does_not_clear_lead(self):
        self.fire('UserPromptSubmit')
        self.fire('SessionStart', agent='child')
        self.assertEqual(self.read()['state'], 'active')

    def test_out_of_order_and_future_clock_rejected(self):
        self.fire('UserPromptSubmit')
        old = self.now
        self.fire('Stop')
        self.fire('UserPromptSubmit', at=old)
        self.assertEqual(self.read()['state'], 'ended')
        self.assertEqual(self.read(now=old)['state'], 'unknown')

    def test_identity_reuse_and_server_change(self):
        self.fire('UserPromptSubmit')
        for key in ('pane', 'server'):
            original = self.identity[key]
            self.identity[key] = {**original, 'start': '1:1'}
            self.assertEqual(self.read()['state'], 'unknown')
            self.identity[key] = original
        old = self.identity['token']
        self.identity['token'] = '0' * 32
        self.assertEqual(self.read()['state'], 'unknown')
        self.identity['token'] = old
        with patch.object(obs, 'alive', return_value=False):
            self.assertEqual(self.read()['state'], 'unknown')

    def test_read_rechecks_identity_and_server_snapshot(self):
        self.fire('UserPromptSubmit')
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now, server_start='wrong'), {})
        calls = 0
        original = self.tmux.panes
        def changing():
            nonlocal calls
            calls += 1
            value = original()
            if calls == 2:
                value['%0']['token'] = '0' * 32
            return value
        with patch.object(self.tmux, 'panes', changing):
            self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})

    def test_reject_wrong_producer_and_inherited_server(self):
        self.fire('UserPromptSubmit')
        before = self.path().read_bytes()
        with patch.object(obs, 'producer', side_effect=ValueError):
            with self.assertRaises(ValueError):
                self.fire('Stop')
        with patch.dict(os.environ, TMUX='/synthetic,1,0'):
            self.fire('Stop')
        self.assertEqual(self.path().read_bytes(), before)

    def test_symlink_and_permissions_fail_closed(self):
        self.fire('UserPromptSubmit')
        path = self.path()
        external = self.root / 'external'
        external.write_bytes(path.read_bytes())
        path.unlink()
        path.symlink_to(external)
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})
        before = external.read_bytes()
        with self.assertRaises(OSError):
            self.fire('Stop')
        self.assertEqual(before, external.read_bytes())
        path.unlink()
        path.write_bytes(before)
        path.chmod(0o644)
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})
        path.chmod(0o600)
        Path(self.store).chmod(0o755)
        with self.assertRaises(ValueError):
            obs.read(self.tmux, self.store, ['%0'], now=self.now)

    def test_reject_directory_symlink_hardlink_fifo_and_oversize(self):
        linked = self.root / 'link'
        linked.symlink_to(self.store)
        with self.assertRaises(OSError):
            obs.safe_dir(str(linked))
        self.fire('UserPromptSubmit')
        path = self.path()
        os.link(path, self.root / 'hardlink')
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})
        path.unlink()
        os.mkfifo(path, 0o600)
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})
        path.unlink()
        path.write_bytes(b'x' * (obs.MAX_BYTES + 1))
        path.chmod(0o600)
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})

    def test_malformed_duplicate_and_extra_metadata_not_adopted(self):
        self.fire('UserPromptSubmit')
        path = self.path()
        data = json.loads(path.read_text())
        self.assertTrue(obs.valid(data))
        data['prompt'] = 'never export this'
        path.write_text(json.dumps(data))
        self.assertEqual(self.read()['state'], 'unknown')
        self.fire('Stop')
        self.assertEqual(json.loads(path.read_text()), data)
        path.write_text('{"version":1,"version":1}')
        self.assertEqual(obs.read(self.tmux, self.store, ['%0'], now=self.now), {})

    def test_safe_directory_descriptor_survives_path_replacement(self):
        directory = obs.safe_dir(self.store)
        try:
            moved = self.root / 'moved'
            Path(self.store).rename(moved)
            Path(self.store).symlink_to(self.root)
            obs.save(directory, 'test', {'safe': True})
            self.assertTrue((moved / 'test.json').is_file())
            self.assertFalse((self.root / 'test.json').exists())
        finally:
            os.close(directory)

    def test_lock_contention_does_not_overwrite(self):
        import fcntl
        directory = obs.safe_dir(self.store)
        lock = obs.safe_open(directory, 'store.lock', os.O_RDWR)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.fire('UserPromptSubmit')
            self.assertEqual(self.read()['state'], 'unknown')
        finally:
            os.close(lock)
            os.close(directory)

    def test_total_store_capacity_reclaims_only_expired_records(self):
        with patch.object(obs, 'MAX_RECORDS', 2):
            self.identity['id'] = '%1'
            with patch.dict(os.environ, TMUX_PANE='%1'):
                self.fire('SessionStart')
            self.identity['id'] = '%2'
            with patch.dict(os.environ, TMUX_PANE='%2'):
                with self.assertRaisesRegex(ValueError, 'store capacity'):
                    self.fire('SessionStart')
            self.assertEqual(len(list(Path(self.store).glob('*.json'))), 2)
            self.assertEqual(len(list(Path(self.store).glob('*.lock'))), 1)
            self.now += obs.TTL_NS
            with patch.dict(os.environ, TMUX_PANE='%2'):
                self.fire('SessionStart')
            self.assertEqual(len(list(Path(self.store).glob('*.json'))), 1)
            self.assertTrue(self.path().exists())

    def test_store_rejects_unsafe_retained_entries_and_recovers_temporary(self):
        temporary = Path(self.store) / ('.' + 'f' * 32)
        temporary.write_bytes(b'incomplete')
        temporary.chmod(0o600)
        self.fire('UserPromptSubmit')
        self.assertFalse(temporary.exists())
        unexpected = Path(self.store) / 'unrelated'
        unexpected.write_bytes(b'do not touch')
        with self.assertRaisesRegex(ValueError, 'unknown store entry'):
            self.fire('Stop')
        self.assertEqual(unexpected.read_bytes(), b'do not touch')
        unexpected.unlink()
        unsafe = Path(self.store) / ('f' * 64 + '.json')
        unsafe.symlink_to(self.root / 'not-a-record')
        with self.assertRaises(OSError):
            self.fire('Stop')

    def test_process_generation_and_ancestry(self):
        self.assertTrue(obs.descendant(os.getpid(), self.gen))
        self.assertEqual(obs.generation(obs.process(os.getpid())), self.gen)
        self.assertFalse(obs.valid_generation({'pid': os.getpid(), 'start': 'garbage'}))


if __name__ == '__main__':
    unittest.main()
