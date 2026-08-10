export const LIVE_CONSTANTS = Object.freeze({
  SCHEMA_V2: 2,
  COLLECTOR_VERSION: '1.0.0',
  MAX_IMPORT_FILE_BYTES: 262144,
  MAX_SESSION_COUNT: 64,
  MAX_IMPORT_AGE_MS: 900000,
  MAX_FUTURE_SKEW_MS: 120000,
  STALE_LABEL_TICK_MS: 60000,
  LIVE_POLL_INTERVAL_MS: 5000,
  LIVE_MAX_CONSECUTIVE_FAILURES: 3,
  LIVE_SERVER_DEFAULT_PORT: 4173,
  LIVE_SNAPSHOT_ROUTE: '/live/snapshot',
  LIVE_TOKEN_PLACEHOLDER: '%%LIVE_TOKEN%%',
  LIVE_TOKEN_HEADER: 'x-live-token',
  FRESH_DISPLAY_AGE_MS: 300000,
  TMUX_TIMEOUT_MS: 3000,
  TMUX_MAX_BUFFER_BYTES: 1048576,
  TMUX_KILL_SIGNAL: 'SIGKILL',
  MAX_RAW_RECORDS: 256,
  MAX_LENGTH_DIGITS: 7,
  TMUX_FIELD_COUNT: 10,
  MAX_SOCKET_BYTES: 4096,
  MAX_NAME_OR_TITLE_BYTES: 4096,
  MAX_COMMAND_BYTES: 256,
  MAX_ID_FIELD_BYTES: 64,
  MAX_DISPLAY_NAME_CODE_POINTS: 80,
  UNKNOWN_HOLD_ANCHORS: 3,
  SHA256_EMITTED_HEX_CHARS: 32,
});

export const TMUX_BINARIES = Object.freeze([
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
]);

// Order is load-bearing: the frame parser indexes TMUX_FIELDS and FIELD_LIMITS in
// lockstep, and LENGTH_PREFIXED_FORMAT must emit the fields in this same order.
export const TMUX_FIELDS = Object.freeze([
  'socket_path',
  'start_time',
  'session_id',
  'session_name',
  'window_id',
  'pane_id',
  'pane_index',
  'window_name',
  'pane_title',
  'pane_current_command',
]);

export const LENGTH_PREFIXED_FORMAT =
  'T1#{n:socket_path}:#{socket_path}#{n:start_time}:#{start_time}'
  + '#{n:session_id}:#{session_id}#{n:session_name}:#{session_name}'
  + '#{n:window_id}:#{window_id}'
  + '#{n:pane_id}:#{pane_id}#{n:pane_index}:#{pane_index}'
  + '#{n:window_name}:#{window_name}#{n:pane_title}:#{pane_title}'
  + '#{n:pane_current_command}:#{pane_current_command}';

export const COLLECTOR_ERROR_CODES = Object.freeze([
  'TMUX_BINARY_UNAVAILABLE',
  'TMUX_SOCKET_REJECTED',
  'TMUX_TIMEOUT',
  'TMUX_OUTPUT_LIMIT',
  'TMUX_NONZERO_EXIT',
  'TMUX_STDERR',
  'TMUX_FRAME_INVALID',
  'TMUX_UTF8_INVALID',
  'TMUX_FIELD_INVALID',
  'TMUX_IDENTITY_COLLISION',
]);

export const LIVE_REQUEST_FORBIDDEN = 'LIVE_REQUEST_FORBIDDEN';
