#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/tmux-agent-resume"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export CLAUDE_SESSIONS_DIR="$tmp/sessions"
mkdir -p "$CLAUDE_SESSIONS_DIR" "$tmp/fake-bin"

cat >"$tmp/fake-bin/tmux" <<'FAKE'
#!/usr/bin/env bash
printf 'work\t1\t0\t%%1\nwork\t2\t0\t%%2\nwork\t3\t0\t%%3\nwork\t4\t0\t%%4\n'
FAKE
chmod +x "$tmp/fake-bin/tmux"
export PATH="$tmp/fake-bin:$PATH"

live=$$ dead=999999
session() { # pid pane uuid updatedAt [kind]
  printf '{"pid":%s,"sessionId":"%s","tmux":"work:@1.%s","updatedAt":%s,"kind":"%s"}\n' \
    "$1" "$3" "$2" "$4" "${5:-interactive}" >"$CLAUDE_SESSIONS_DIR/$1-$4.json"
}
a=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa b=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
session "$live" %1 "$a" 1
session "$live" %1 "$b" 2            # newer record for the same pane wins
session "$dead" %2 "$a" 3            # dead pid never pins a pane
session "$live" %4 "$a" 4 sdk        # non-interactive sessions are ignored

save="$tmp/save.txt"
pane() { printf 'pane\twork\t%s\t1\t:*\t0\ttitle\t:/repo\t1\t%s\t:%s\n' "$1" "$2" "$3"; }
{
  pane 1 2.1.310 'claude --resume Old Name'
  pane 2 2.1.310 '-claude --resume Gone'
  pane 3 nvim 'nvim CLAUDE.md'
  pane 4 2.1.310 'claude'
  printf 'window\twork\t1\t:main\t1\t:*\tlayout\t:\n'
} >"$save"
"$bin" "$save"

failures=0
check() {
  local label="$1" want="$2" got="$3"
  if [[ "$want" == "$got" ]]; then
    printf '  ok   %s\n' "$label"
  else
    printf '  FAIL %s\n       want: [%s]\n       got:  [%s]\n' "$label" "$want" "$got" >&2
    failures=$((failures + 1))
  fi
}
cmd() { awk -F'\t' -v w="$1" '$1 == "pane" && $3 == w { print $11 }' "$save"; }

check 'live pane is pinned to its newest session' ":claude --resume $b" "$(cmd 1)"
check 'claude pane with no live session is blanked' ':' "$(cmd 2)"
check 'non-claude command is untouched' ':nvim CLAUDE.md' "$(cmd 3)"
check 'non-interactive session is not pinned' ':' "$(cmd 4)"
check 'non-pane lines are untouched' $'window\twork\t1\t:main\t1\t:*\tlayout\t:' "$(grep '^window' "$save")"

if (( failures > 0 )); then
  printf '\ntest-tmux-agent-resume: %d check(s) failed\n' "$failures" >&2
  exit 1
fi

echo 'tmux-agent-resume behaves correctly'
