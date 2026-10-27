#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export CODEX_RESTORE_HOME="$tmp/state"
export TMUX_PANE='%42'
export HOOK_COMMAND_FILE="$tmp/hook-command"
export HOOK_PAYLOAD_FILE="$tmp/hook-payload"
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
# Model the documented CLI hook dispatch, using the installed config command.
bash -c "$(cat "$HOOK_COMMAND_FILE")" <"$HOOK_PAYLOAD_FILE"
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

# A minimal install fixture uses the real inventory, config, helper, and installers.
fixture="$tmp/repo"
mkdir -p "$fixture/scripts"
cp "$repo_root/install-macos.sh" "$repo_root/uninstall-macos.sh" "$fixture/"
cp "$repo_root/scripts/install-targets.sh" "$fixture/scripts/"
# shellcheck source=scripts/install-targets.sh
source "$fixture/scripts/install-targets.sh"
while IFS='|' read -r kind relative_source _ _; do
  source_path="$fixture/$relative_source"
  mkdir -p "$(dirname "$source_path")"
  if [[ "$kind" == tree ]]; then
    mkdir -p "$source_path"
  else
    printf 'fixture\n' >"$source_path"
  fi
done < <(install_targets "$fixture")
cp -p "$repo_root/bin/codex-restore" "$fixture/bin/codex-restore"
cp "$repo_root/codex/config.toml" "$fixture/codex/config.toml"

session_id='12345678-1234-1234-1234-123456789abc'
payload() {
  jq -n --arg id "$1" --arg source "${2:-startup}" \
    '{session_id:$id, hook_event_name:"SessionStart", source:$source,
      cwd:"/work/project", model:"fixture", permission_mode:"default",
      transcript_path:"/must/not/be/read"}' >"$HOOK_PAYLOAD_FILE"
}
run_hook() { bash -c "$(cat "$HOOK_COMMAND_FILE")" <"$HOOK_PAYLOAD_FILE"; }
file_mode() {
  if [[ "$(uname -s)" == Darwin ]]; then stat -f %Lp "$1"; else stat -c %a "$1"; fi
}
for mode in copy link; do
  export HOME="$tmp/home $mode"
  export CODEX_RESTORE_HOME="$HOME/.local/state/codex-restore"
  export TMUX_PANE='%42'
  DOTFILES_TARGET_HOME="$HOME" bash "$fixture/install-macos.sh" "--$mode" --skip-backgrounds >/dev/null
  bin="$HOME/.local/bin/codex-restore"
  # Parse TOML rather than duplicating the registration in this fixture.
  python3 - "$HOME/.codex/config.toml" >"$HOOK_COMMAND_FILE" <<'PYTHON'
import sys, tomllib
with open(sys.argv[1], 'rb') as f:
    group, = tomllib.load(f)['hooks']['SessionStart']
handler, = group['hooks']
assert handler['type'] == 'command' and handler['timeout'] == 5
assert 'matcher' not in group  # capture clear/resume/compact/fork as well
print(handler['command'])
PYTHON
  payload "$session_id"
  run_hook
  check "$mode unmanaged hook creates no state" false "$(test -e "$CODEX_RESTORE_HOME" && echo true || echo false)"
  "$bin" start
  check "$mode start records configured hook UUID" "$session_id" "$(cut -f1 <<<"$("$bin" list)")"
  check "$mode start removes managed marker" '0' "$(find "$CODEX_RESTORE_HOME/managed-panes" -type f | wc -l | tr -d ' ')"
  check "$mode private state directory" 700 "$(file_mode "$CODEX_RESTORE_HOME")"
  check "$mode private entry" 600 "$(file_mode "$CODEX_RESTORE_HOME/entries/$session_id")"
  check "$mode entry contains metadata only" 6 "$(wc -l <"$CODEX_RESTORE_HOME/entries/$session_id" | tr -d ' ')"
  if "$bin" restore </dev/null >/dev/null 2>&1; then
    check "$mode restore requires confirmation" refused allowed
  fi
  : >"$FAKE_TMUX_LOG"
  "$bin" restore --yes >/dev/null
  check "$mode exact UUID restore" \
    "send-keys -t %99 codex resume $session_id C-m" "$(<"$FAKE_TMUX_LOG")"
  "$bin" restore --yes >/dev/null
  check "$mode duplicate restore suppressed" 1 "$(wc -l <"$FAKE_TMUX_LOG" | tr -d ' ')"
  "$bin" forget "$session_id"
  check "$mode forget removes entry" '' "$("$bin" list)"

  # Force managed context so malformed inputs cannot pass via the unmanaged guard.
  : >"$CODEX_RESTORE_HOME/managed-panes/42"
  for invalid in '{}' '[]' 'null' 'broken' \
    '{"hook_event_name":"Stop","session_id":"12345678-1234-1234-1234-123456789abc"}' \
    '{"hook_event_name":"SessionStart","session_id":42}' \
    '{"hook_event_name":"SessionStart","session_id":"../../escaped"}' \
    '{"hook_event_name":"SessionStart","session_id":"----------------"}' \
    '{"hook_event_name":"SessionStart","session_id":"12345678-1234-1234-1234-123456789abc\n"}' \
    '{"hook_event_name":"SessionStart","session_id":"12345678-1234-1234-1234-123456789abc; touch /tmp/no"}' \
    '{"hook_event_name":"SessionStart","session_id":"12345678-1234-1234-1234-123456789abc"} {}'; do
    printf '%s' "$invalid" >"$HOOK_PAYLOAD_FILE"
    run_hook
    check "$mode invalid payload rejected" '' "$("$bin" list)"
  done
  payload "$session_id"
  TMUX_PANE='' run_hook
  check "$mode non-tmux ignored" '' "$("$bin" list)"
  TMUX_PANE='../42' run_hook
  check "$mode malformed pane ignored" '' "$("$bin" list)"
  for source in startup resume clear compact fork; do
    payload "$session_id" "$source"
    run_hook
    run_hook
    check "$mode $source duplicate capture leaves one record" 1 "$(find "$CODEX_RESTORE_HOME/entries" -type f | wc -l | tr -d ' ')"
  done
  replacement_id='abcdefab-1234-1234-1234-123456789abc'
  payload "$replacement_id" clear
  run_hook
  check "$mode clear replaces old identity" "$replacement_id" "$(cut -f1 <<<"$("$bin" list)")"
  "$bin" unmanage
  payload "$session_id"
  run_hook
  check "$mode unmanage stops capture" "$replacement_id" "$(cut -f1 <<<"$("$bin" list)")"

  DOTFILES_TARGET_HOME="$HOME" bash "$fixture/uninstall-macos.sh" --remove-only >/dev/null
  check "$mode config removed" false "$(test -e "$HOME/.codex/config.toml" && echo true || echo false)"
  check "$mode adapter removed" false "$(test -e "$bin" && echo true || echo false)"
  check "$mode uninstall preserves recovery state" true "$(test -f "$CODEX_RESTORE_HOME/entries/$replacement_id" && echo true || echo false)"
done

if (( failures > 0 )); then
  printf '\ntest-codex-restore: %d check(s) failed\n' "$failures" >&2
  exit 1
fi

echo 'codex-restore behaves correctly'
