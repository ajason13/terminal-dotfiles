# Dashboard live-adapter isolated tmux evidence

**Date:** 2026-07-22

**Purpose:** Close QA findings NB-1 and NB-2 before implementation

**Target:** `/usr/local/bin/tmux`, tmux 3.7

**Isolation:** Disposable explicit sockets under `/private/tmp`; the user's
default tmux socket, repository runtime, configuration, and startup flow were
not read or changed.

## NB-1: UTF-8 byte-length framing

The successful sample was produced by a synthetic pane process emitting its
own OSC title. This avoids relying on `select-pane -T`, which did not commit a
title containing a C0 control character during an earlier rejected attempt.

The pane title payload was:

```text
pre⠧mid✳<U+0085>post
```

U+0085 is a C1 control character. The exact setup and read were:

```zsh
mkdir -p /private/tmp/dashboard-live-qa-root
/usr/local/bin/tmux \
  -S /private/tmp/dashboard-live-qa-root/tmux.sock \
  -f /dev/null new-session -d -s alpha -n first
/usr/local/bin/tmux \
  -S /private/tmp/dashboard-live-qa-root/tmux.sock \
  new-window -d -t alpha -n oscc1 \
  "/bin/zsh -c \"printf '\\033]2;pre⠧mid✳\\u0085post\\007'; /bin/sleep 600\""
/usr/local/bin/tmux \
  -S /private/tmp/dashboard-live-qa-root/tmux.sock \
  list-panes -t alpha:oscc1 \
  -F 'T1#{n:pane_title}:#{pane_title}' | xxd -g 1
```

Captured stdout, byte for byte:

```text
00000000: 54 31 31 38 3a 70 72 65 e2 a0 a7 6d 69 64 e2 9c  T118:pre...mid..
00000010: b3 c2 85 70 6f 73 74 0a                          ...post.
```

The payload arithmetic is:

```text
"pre"       3 bytes
"⠧"         3 bytes
"mid"       3 bytes
"✳"         3 bytes
U+0085      2 bytes (c2 85)
"post"      4 bytes
payload    18 bytes across 13 Unicode code points
```

The emitted prefix is the ASCII bytes for `18:`, and exactly 18 payload bytes
follow before tmux's final LF. With the two-byte `T1` magic, three-byte length
and colon, 18-byte payload, and one-byte LF, the complete record is 24 bytes.
This demonstrates that tmux 3.7 `#{n:pane_title}` reports UTF-8 bytes rather
than Unicode code points for the multibyte/control-bearing sample.

The installed tmux 3.7 manual independently documents that the `n` modifier
expands to a variable's length. The byte dump above establishes the unit that
the manual leaves implicit.

The exact complete nine-field format from the resolved design was then run
against a fresh isolated server with the same synthetic title:

```zsh
mkdir -p /private/tmp/dashboard-live-qa-full
/usr/local/bin/tmux \
  -S /private/tmp/dashboard-live-qa-full/tmux.sock \
  -f /dev/null new-session -d -s synthetic -n synthetic \
  "/bin/zsh -c \"printf '\\033]2;pre⠧mid✳\\u0085post\\007'; /bin/sleep 600\""
/usr/local/bin/tmux \
  -S /private/tmp/dashboard-live-qa-full/tmux.sock \
  list-panes -a \
  -F 'T1#{n:socket_path}:#{socket_path}#{n:start_time}:#{start_time}#{n:session_id}:#{session_id}#{n:window_id}:#{window_id}#{n:pane_id}:#{pane_id}#{n:pane_index}:#{pane_index}#{n:window_name}:#{window_name}#{n:pane_title}:#{pane_title}#{n:pane_current_command}:#{pane_current_command}' \
  | xxd -g 1
```

```text
00000000: 54 31 34 35 3a 2f 70 72 69 76 61 74 65 2f 74 6d  T145:/private/tm
00000010: 70 2f 64 61 73 68 62 6f 61 72 64 2d 6c 69 76 65  p/dashboard-live
00000020: 2d 71 61 2d 66 75 6c 6c 2f 74 6d 75 78 2e 73 6f  -qa-full/tmux.so
00000030: 63 6b 31 30 3a 31 37 38 34 37 37 33 38 34 37 32  ck10:17847738472
00000040: 3a 24 30 32 3a 40 30 32 3a 25 30 31 3a 30 39 3a  :$02:@02:%01:09:
00000050: 73 79 6e 74 68 65 74 69 63 31 38 3a 70 72 65 e2  synthetic18:pre.
00000060: a0 a7 6d 69 64 e2 9c b3 c2 85 70 6f 73 74 35 3a  ..mid.....post5:
00000070: 73 6c 65 65 70 0a                                sleep.
```

The decoded field lengths are `45, 10, 2, 2, 2, 1, 9, 18, 5`, followed by one
LF. In particular, the complete production format preserves the same 18-byte
title boundary before the `5:sleep` command frame, so the multibyte/control
payload cannot shift the following field.

## NB-2: server-scoped `start_time`

The exact format variable is `start_time`; the installed tmux 3.7 manual labels
it “Server start time.” A separate disposable server was populated with two
concurrent sessions, three windows, and six panes:

```zsh
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  -f /dev/null new-session -d -s alpha -n control 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  split-window -d -t 'alpha:control' 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  new-window -d -t alpha -n work 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  split-window -d -t 'alpha:work' 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  new-session -d -s beta -n review 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  split-window -d -t 'beta:review' 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  list-panes -a \
  -F '#{session_id} session=#{session_name} #{window_id} window=#{window_name} #{pane_id} start_time=#{start_time}'
```

Raw synthetic output:

```text
$0 session=alpha @0 window=control %0 start_time=1784773438
$0 session=alpha @0 window=control %1 start_time=1784773438
$0 session=alpha @1 window=work %2 start_time=1784773438
$0 session=alpha @1 window=work %3 start_time=1784773438
$1 session=beta @2 window=review %4 start_time=1784773438
$1 session=beta @2 window=review %5 start_time=1784773438
```

Computed annotations from those raw rows:

```text
first_server_row_count=6
first_server_unique_start_times=1
```

All six rows returned the same value. The server was then restarted on the same
explicit socket path after two seconds:

```zsh
/usr/local/bin/tmux \
  -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock kill-server
sleep 2
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  -f /dev/null new-session -d -s gamma -n restarted 'sleep 600'
/usr/local/bin/tmux -S /private/tmp/dashboard-live-adapter-tmux.Bo0Ufn/server.sock \
  list-panes -a \
  -F '#{session_id} session=#{session_name} #{window_id} window=#{window_name} #{pane_id} start_time=#{start_time}'
```

Raw synthetic output:

```text
$0 session=gamma @0 window=restarted %0 start_time=1784773440
```

Computed comparison from the two raw runs:

```text
start_time_comparison first=1784773438 second=1784773440 delta_seconds=2
```

The value is therefore constant for one tmux 3.7 server epoch across multiple
sessions and changes after the server restarts on the same socket path.

## Cleanup and limits

All disposable servers and their temporary directories were removed. A later
focused DEL-title attempt also used and removed only
`/private/tmp/dashboard-live-qa-del`; tmux rejected that title and its output is
not relied upon. No default socket or real pane value was queried.

These observations establish behavior for the pinned tmux 3.7 target only.
Other tmux versions remain outside the first implementation's verified
contract unless the same evidence test passes.
