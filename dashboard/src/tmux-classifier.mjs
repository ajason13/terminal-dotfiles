const COMMANDS = new Set(['codex', 'claude', 'gemini', 'aider', 'opencode']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const BRAILLE_SPINNER = /^[\u2800-\u28ff]/u;
const OTHER_SPINNER = /^(?:◐ |◓ |◑ |◒ |- |\\ |\| |\/ )/u;
const CODEX_STATIC = /^\[[^\]\r\n]+\] [^\r\n]*\|/u;
const CLAUDE_STATIC = /^✳/u;

function hasToken(title, token) {
  let start = title.indexOf(token);
  while (start !== -1) {
    const before = start === 0 ? '' : title[start - 1];
    const after = title[start + token.length] ?? '';
    if ((!before || !/[A-Za-z]/.test(before)) && (!after || !/[A-Za-z]/.test(after))) return true;
    start = title.indexOf(token, start + 1);
  }
  return false;
}

function commandBasename(command) {
  const slash = command.lastIndexOf('/');
  return slash === -1 ? command : command.slice(slash + 1);
}

export function classifyPane(record) {
  const title = record.pane_title;
  const commandCandidate = COMMANDS.has(commandBasename(record.pane_current_command));
  if (CONTROL_CHARACTERS.test(title)) {
    return commandCandidate
      ? Object.freeze({
        status: 'unknown', permissionState: 'unknown',
        confidence: 'none', provenance: 'tmux_command_candidate',
      })
      : null;
  }

  const spinner = BRAILLE_SPINNER.test(title) || OTHER_SPINNER.test(title);
  const codexStatic = CODEX_STATIC.test(title);
  const claudeStatic = CLAUDE_STATIC.test(title);
  if (!(spinner || codexStatic || claudeStatic || commandCandidate)) return null;

  if (hasToken(title, 'Action Required')) {
    return Object.freeze({
      status: 'waiting_for_permission', permissionState: 'requested',
      confidence: 'low', provenance: 'tmux_title_action_required',
    });
  }
  if (hasToken(title, 'Thinking')) {
    return Object.freeze({
      status: 'thinking', permissionState: 'unknown',
      confidence: 'medium', provenance: 'tmux_title_thinking',
    });
  }
  if (spinner) {
    return Object.freeze({
      status: 'active', permissionState: 'unknown',
      confidence: 'medium', provenance: 'tmux_title_spinner',
    });
  }
  if (['Working', 'Running', 'Processing', 'Executing', 'Loading'].some((token) => hasToken(title, token))) {
    return Object.freeze({
      status: 'active', permissionState: 'unknown',
      confidence: 'medium', provenance: 'tmux_title_working',
    });
  }
  if (['Ready', 'Idle'].some((token) => hasToken(title, token))) {
    return Object.freeze({
      status: 'idle', permissionState: 'unknown',
      confidence: 'low', provenance: 'tmux_title_ready_idle',
    });
  }
  if (codexStatic || claudeStatic) {
    return Object.freeze({
      status: 'idle', permissionState: 'unknown',
      confidence: 'low', provenance: 'tmux_title_static_provider',
    });
  }
  return Object.freeze({
    status: 'unknown', permissionState: 'unknown',
    confidence: 'none', provenance: 'tmux_command_candidate',
  });
}

export function canonicalizeDisplayName(value) {
  return value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function clampPoints(value, maximum) {
  const points = [...value];
  if (points.length <= maximum) return value;
  return `${points.slice(0, Math.max(0, maximum - 1)).join('')}…`;
}

// ▸ is structural, so it is stripped here: exactly one can appear in a display
// name, letting parseWorkRef find the session boundary without guessing.
function cleanSegment(value) {
  return canonicalizeDisplayName(String(value ?? '')).replaceAll('▸', ' ')
    .replace(/\s+/gu, ' ').trim();
}

// `<session> ▸ <window>`. The session segment disambiguates windows that share a
// name across tmux sessions, which is otherwise invisible on the board. There is
// no pane segment: the convention is one agent pane per window, so a pane index
// on every card was noise. It survives only where a window has no usable name.
export function sanitizeDisplayName(windowName, paneIndex, sessionName = '') {
  const session = cleanSegment(sessionName);
  const body = cleanSegment(windowName) || `Pane ${paneIndex}`;
  if (!session) return clampPoints(body, LIVE_MAX_POINTS);

  // The window name carries the ticket or PR the operator navigates by, so it is
  // served first; the session prefix takes only what is left over.
  const separator = ' ▸ ';
  const fixed = [...separator].length;
  const bodyText = clampPoints(body, Math.max(0, LIVE_MAX_POINTS - fixed - MIN_SESSION_POINTS));
  const sessionRoom = LIVE_MAX_POINTS - fixed - [...bodyText].length;
  return `${clampPoints(session, sessionRoom)}${separator}${bodyText}`;
}

const LIVE_MAX_POINTS = 80;
// Floor reserved for the session prefix, so a very long window name cannot squeeze
// the disambiguator down to nothing and undo the point of having it.
const MIN_SESSION_POINTS = 6;
