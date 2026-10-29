#!/usr/bin/env python3
"""Synthetic homes and executables; never inspect the operator's settings."""
from contextlib import redirect_stdout
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
loader = importlib.machinery.SourceFileLoader('doctor', str(ROOT / 'bin/dotfiles-doctor'))
spec = importlib.util.spec_from_loader(loader.name, loader)
doctor = importlib.util.module_from_spec(spec)
loader.exec_module(doctor)


class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.home = self.root / 'home'
        self.repo = self.root / 'repo'
        self.fakebin = self.root / 'bin'
        self.fakebin.mkdir()
        (self.repo / 'scripts').mkdir(parents=True)
        (self.home / '.local/bin').mkdir(parents=True)
        (self.repo / 'scripts/install-targets.sh').write_text((ROOT / 'scripts/install-targets.sh').read_text())
        inventory = subprocess.check_output(['/bin/bash', '-c',
            'source "$1/scripts/install-targets.sh"; install_targets "$1"', 'test', str(self.repo)], text=True)
        self.rows = [line.split('|') for line in inventory.splitlines()]
        for kind, source, target, mode in self.rows:
            source, target = self.repo / source, self.home / target
            source.parent.mkdir(parents=True, exist_ok=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            if kind == 'file':
                source.write_text('fixture\n')
                source.chmod(int(mode, 8))
            else:
                source.mkdir(exist_ok=True)
            target.symlink_to(source)
        self.env = patch.dict(os.environ, {'PATH': str(self.home / '.local/bin') + os.pathsep + str(self.fakebin) + os.pathsep + os.defpath,
                                          'SF_LEASE_ENABLE': ''})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.check = doctor.Doctor(self.repo, self.home)
        # macOS may scan newly created executable fixtures on first launch.
        # Test the hard time bound separately with a short explicit deadline.
        timeout_patch = patch.object(doctor, 'TIMEOUT', 10)
        timeout_patch.start()
        self.addCleanup(timeout_patch.stop)

    def binary(self, name, body="printf 'tool 22.0\\n'"):
        path = self.fakebin / name
        path.write_text('#!/bin/sh\n' + body + '\n')
        path.chmod(0o755)
        return path

    def output(self, method, *args):
        stream = io.StringIO()
        with redirect_stdout(stream):
            method(*args)
        return stream.getvalue()

    def claude_settings(self, data):
        # Replace fixture link so test writes never follow it to source.
        path = self.home / '.claude/settings.json'
        path.write_text(json.dumps(data))

    def full_hooks(self):
        events = ('UserPromptSubmit', 'PostToolBatch', 'Stop', 'StopFailure', 'SubagentStart',
                  'SubagentStop', 'SessionStart', 'SessionEnd', 'Notification')
        return {'hooks': {event: [{**({'matcher': 'permission_prompt|elicitation_dialog'} if event == 'Notification' else {}),
                                  'hooks': [{'type': 'command', 'command': '$HOME/.claude/hooks/tmux-agent-depth.sh'}]}]
                          for event in events},
                'statusLine': {'type': 'command', 'command': '~/.claude/statusline.sh'}}

    def test_targets_healthy_links_and_copies(self):
        self.assertNotIn('FAIL', self.output(self.check.targets))
        target = self.home / '.tmux.conf'
        target.unlink()
        target.write_text('customized copy accepted\n')
        self.assertNotIn('FAIL', self.output(self.check.targets))

    def test_absent_stale_wrong_and_nonexecutable_targets(self):
        target = self.home / '.tmux.conf'
        target.unlink()
        self.assertIn('missing or wrong type', self.output(self.check.targets))
        target.symlink_to(self.root / 'absent')
        self.assertIn('stale link', self.output(self.check.targets))
        target.unlink()
        other = self.root / 'other'
        other.write_text('unrelated')
        target.symlink_to(other)
        self.assertIn('wrong link', self.output(self.check.targets))
        (self.repo / 'bin/dotfiles-doctor').chmod(0o644)
        self.assertIn('not executable', self.output(self.check.targets))
        self.assertEqual(other.read_text(), 'unrelated')

    def test_tools_missing_old_supported_and_private_output(self):
        with patch('shutil.which', return_value=None):
            self.assertIn('missing on PATH', self.output(self.check.tool, 'node'))
        self.binary('node', "printf 'v20.0.0\\n'")
        self.assertIn('requires version 22+', self.output(self.check.tool, 'node', ('--version',), 22))
        self.binary('node', "printf 'v22.1.0 SECRET_TOKEN\\n'")
        output = self.output(self.check.tool, 'node', ('--version',), 22)
        self.assertIn('OK node', output)
        self.assertNotIn('SECRET_TOKEN', output)

    def test_agent_binaries_never_execute(self):
        marker = self.root / 'executed'
        self.binary('claude', f'touch "{marker}"; exit 1')
        self.claude_settings(self.full_hooks())
        self.assertNotIn('FAIL', self.output(self.check.claude))
        self.assertFalse(marker.exists())

    def test_partial_hook_and_wrong_matcher(self):
        self.binary('claude')
        config = self.full_hooks()
        del config['hooks']['StopFailure']
        config['hooks']['Notification'][0]['matcher'] = 'permission_prompt'
        self.claude_settings(config)
        output = self.output(self.check.claude)
        self.assertIn('FAIL StopFailure', output)
        self.assertIn('FAIL Notification', output)
        self.assertIn('OK UserPromptSubmit', output)

    def test_malformed_settings_do_not_leak_and_are_bounded(self):
        self.binary('claude')
        path = self.home / '.claude/settings.json'
        for text in ('SECRET_TOKEN: malformed', '{"hooks": "SECRET_TOKEN"}',
                     '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":{"SECRET_TOKEN":1}}]}]}}',
                     'SECRET_TOKEN' * doctor.LIMIT):
            path.write_text(text)
            output = self.output(self.check.claude)
            self.assertIn('FAIL', output)
            self.assertNotIn('SECRET_TOKEN', output)
        path.unlink()
        os.mkfifo(path)
        start = time.monotonic()
        self.assertIn('FAIL', self.output(self.check.claude))
        self.assertLess(time.monotonic() - start, 1)

    def test_disabled_leases_skip_identity_files(self):
        self.binary('claude')
        self.assertIn('OFF leases', self.output(self.check.claude, True))
        self.claude_settings({'env': {'SF_LEASE_ENABLE': 'typo', 'SECRET_TOKEN': 'secret'}})
        self.assertIn('OFF leases', self.output(self.check.claude, True))
        self.assertFalse((self.home / '.local/state/sf-leases').exists())

    def test_enabled_lease_registrations(self):
        self.binary('claude')
        os.environ.pop('SF_LEASE_ENABLE', None)
        config = {'env': {'SF_LEASE_ENABLE': 'true'}, 'hooks': {}}
        for event, script, matcher in [('PreToolUse', 'guard', 'Bash'), ('PostToolUse', 'post', 'Bash'),
                                       ('SessionEnd', 'end', ''), ('SessionStart', 'table', '')]:
            config['hooks'][event] = [{'matcher': matcher, 'hooks': [{'type': 'command',
                'command': f'$HOME/.claude/hooks/sf-lease-{script}.sh'}]}]
        self.claude_settings(config)
        output = self.output(self.check.claude, True)
        self.assertNotIn('FAIL', output)
        self.assertIn('registration only', output)

    def test_codex_toml_is_not_executed_or_disclosed(self):
        marker = self.root / 'executed'
        self.binary('codex', f'touch "{marker}"')
        self.binary('node')
        config = self.home / '.codex/config.toml'
        config.unlink()
        config.write_text('secret = "SECRET_TOKEN"\n[[hooks.SessionStart]]\n[[hooks.SessionStart.hooks]]\n'
                          'type = "command"\ncommand = \'"$HOME/.local/bin/codex-restore" capture-hook\'\n')
        output = self.output(self.check.codex)
        self.assertNotIn('FAIL', output)
        self.assertNotIn('SECRET_TOKEN', output)
        self.assertIn('manually review /hooks trust', output)
        self.assertFalse(marker.exists())
        config.write_text('secret = "SECRET_TOKEN"\n[broken')
        output = self.output(self.check.codex)
        self.assertIn('FAIL', output)
        self.assertNotIn('SECRET_TOKEN', output)

    def test_settings_links_cannot_redirect_to_private_files(self):
        private = self.root / 'private'
        private.write_text('{"secret":"SECRET_TOKEN"}')
        path = self.home / '.claude/settings.json'
        path.symlink_to(private)
        with patch.object(doctor, 'settings', side_effect=AssertionError('unsafe settings read')):
            self.assertIn('unsafe link', self.output(self.check.read_settings, '.claude/settings.json', json.loads))
            config = self.home / '.codex/config.toml'
            config.unlink()
            config.symlink_to(private)
            self.assertIn('unsafe link', self.output(self.check.read_settings, '.codex/config.toml', doctor.tomllib.loads))
        # Preserve the installer's legitimate --link mode for managed Codex config.
        config.unlink()
        config.symlink_to(self.repo / 'codex/config.toml')
        (self.repo / 'codex/config.toml').write_text('model = "fixture"')
        self.assertEqual(self.check.read_settings('.codex/config.toml', doctor.tomllib.loads), {'model': 'fixture'})
        # The low-level open also rejects a link that appears after validation.
        with self.assertRaises(OSError):
            doctor.settings(path, json.loads)

    def test_probe_time_and_output_limits(self):
        sleeper = self.binary('sleeper', 'sleep 10')
        start = time.monotonic()
        with patch.object(doctor, 'TIMEOUT', 0.15), self.assertRaises(ValueError):
            doctor.probe([str(sleeper)])
        self.assertLess(time.monotonic() - start, 2)
        flood = self.binary('flood', 'while :; do printf "SECRET_TOKEN%.0s" 1 2 3 4 5 6 7 8 9; done')
        with self.assertRaisesRegex(ValueError, 'output exceeded limit'):
            doctor.probe([str(flood)])

    def test_cli_healthy_optional_disabled_and_exit_codes(self):
        for name in ('git', 'cc', 'curl', 'tmux', 'nvim', 'tree-sitter', 'rg', 'jq', 'wezterm', 'code'):
            (self.fakebin / name).symlink_to('/bin/echo')
        # Default checks must not parse private settings, even malformed data.
        config = self.home / '.codex/config.toml'
        config.unlink()
        config.write_text('SECRET_TOKEN: invalid TOML')
        (self.home / '.claude/settings.json').write_text('SECRET_TOKEN: invalid JSON')
        command = [sys.executable, str(ROOT / 'bin/dotfiles-doctor'), '--repo', str(self.repo), '--home', str(self.home)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('OFF codex', result.stdout)
        self.assertNotIn('FAIL', result.stdout)
        self.assertNotIn('SECRET_TOKEN', result.stdout)
        with patch.object(sys, 'argv', command[1:]), patch.object(doctor, 'settings', side_effect=AssertionError('unselected settings read')):
            self.assertNotIn('FAIL', self.output(doctor.main))
        (self.home / '.tmux.conf').unlink()
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 1)
        result = subprocess.run(command + ['--integration', 'unsupported'], capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
