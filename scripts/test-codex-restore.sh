#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/codex-restore"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export CODEX_RESTORE_HOME="$tmp/state"
export TMUX_PANE='%42'
export RESTORE_BIN="$bin"
export FAKE_TMUX_LOG="$tmp/tmux.log"
mkdir -p "$tmp/fake-bin"

cat >"$tmp/fake-bin/tmux" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  display-message)
    format="${!#}"
    case "$format" in
      '#{session_name}') printf 'project\n' ;;
      '#{window_index}') printf '3\n' ;;
      '#{pane_index}') printf '1\n' ;;
      '#{pane_current_path}') printf '/work/project\n' ;;
      '#{pid}') printf '4321\n' ;;
      *) exit 2 ;;
    esac
    ;;
  list-panes)
    printf 'project\t3\t1\t%%99\t/work/project\n'
    ;;
  send-keys)
    printf '%s\n' "$*" >>"$FAKE_TMUX_LOG"
    ;;
  *) exit 2 ;;
esac
EOF

cat >"$tmp/fake-bin/codex" <<'EOF'
#!/usr/bin/env bash
"$RESTORE_BIN" capture 12345678-1234-1234-1234-123456789abc
EOF
chmod +x "$tmp/fake-bin/tmux" "$tmp/fake-bin/codex"
export PATH="$tmp/fake-bin:$PATH"

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

"$bin" start
session_id='12345678-1234-1234-1234-123456789abc'
check 'start records the hook UUID' "$session_id" "$(cut -f1 <<<"$($bin list)")"
check 'start removes its temporary managed marker' '0' "$(find "$CODEX_RESTORE_HOME/managed-panes" -type f | wc -l | tr -d ' ')"

"$bin" restore --yes >/dev/null
check 'restore targets the exact saved UUID' \
  "send-keys -t %99 codex resume $session_id C-m" "$(<"$FAKE_TMUX_LOG")"

"$bin" restore --yes >/dev/null
check 'same tmux server does not resume a UUID twice' '1' "$(wc -l <"$FAKE_TMUX_LOG" | tr -d ' ')"

"$bin" forget "$session_id"
check 'forget removes the entry' '' "$("$bin" list)"

if (( failures > 0 )); then
  printf '\ntest-codex-restore: %d check(s) failed\n' "$failures" >&2
  exit 1
fi

echo 'codex-restore behaves correctly'
