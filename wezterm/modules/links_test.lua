-- Unit tests for the pure logic in links.lua.
--
-- Run via scripts/test-links-lua.sh (needs a standalone Lua interpreter).
-- WezTerm is never required: the functions under test do not touch it, and the
-- module is side-effect free at load time (all WezTerm use lives inside
-- M.apply, which we never call here).
--
-- What this guards: the tmux-client oracle that decides whether Ctrl+Shift+Space
-- opens a file in a tmux nvim split or falls back to VS Code. It cannot verify
-- WezTerm runtime behavior -- notably that get_foreground_process_name() reports
-- the client's shell rather than `tmux`, which is why that oracle was replaced.

local script_dir = arg[0]:match('(.*/)') or './'
local M = dofile(script_dir .. 'links.lua')

local failures = 0
local function check(name, cond)
  if cond then
    print('ok   - ' .. name)
  else
    failures = failures + 1
    print('FAIL - ' .. name)
  end
end

-- tmux client oracle --------------------------------------------------------

check('matches the only attached client', M._tty_is_client('/dev/ttys001', '/dev/ttys001\n') == true)

check(
  'matches one client among several',
  M._tty_is_client('/dev/ttys007', '/dev/ttys001\n/dev/ttys007\n/dev/ttys012\n') == true
)

check(
  'rejects a tty that is not attached',
  M._tty_is_client('/dev/ttys999', '/dev/ttys001\n/dev/ttys007\n') == false
)

check('rejects when no client is attached', M._tty_is_client('/dev/ttys001', '') == false)

check(
  'tolerates a trailing newline-free final line',
  M._tty_is_client('/dev/ttys007', '/dev/ttys001\n/dev/ttys007') == true
)

check(
  'tolerates carriage returns and trailing blanks',
  M._tty_is_client('/dev/ttys007', '/dev/ttys001\r\n/dev/ttys007  \r\n') == true
)

-- REGRESSION GUARD -----------------------------------------------------------
-- The bug this replaced: `display-message -c <bogus tty>` exits 0 and answers
-- for tmux's globally active pane, so exit status cannot detect "not a client".
-- Matching must be exact -- a substring or prefix match would let an unattached
-- tty borrow another client's pane and split nvim into the wrong window.
check(
  'regression: a prefix of an attached tty is not a match',
  M._tty_is_client('/dev/ttys00', '/dev/ttys001\n') == false
)

check(
  'regression: a superstring of an attached tty is not a match',
  M._tty_is_client('/dev/ttys0011', '/dev/ttys001\n') == false
)

print('')
if failures > 0 then
  print(failures .. ' failure(s)')
  os.exit(1)
end

print('all links.lua tests passed')
