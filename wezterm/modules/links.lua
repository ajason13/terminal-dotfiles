local M = {}

local function file_exists(path)
  local file = io.open(path, 'r')
  if file then
    file:close()
    return true
  end

  return false
end

local function tmux_path()
  if file_exists('/opt/homebrew/bin/tmux') then
    return '/opt/homebrew/bin/tmux'
  end

  if file_exists('/usr/local/bin/tmux') then
    return '/usr/local/bin/tmux'
  end

  return 'tmux'
end

local function nvim_path()
  if file_exists('/opt/homebrew/bin/nvim') then
    return '/opt/homebrew/bin/nvim'
  end

  if file_exists('/usr/local/bin/nvim') then
    return '/usr/local/bin/nvim'
  end

  return 'nvim'
end

local function split_file_uri_payload(payload)
  local path, line, column = payload:match('^(.-):(%d+):(%d+)$')
  if path then
    return path, line, column
  end

  path, line = payload:match('^(.-):(%d+):$')
  if path then
    return path, line, nil
  end

  return payload:match('^(.-)::$') or payload, nil, nil
end

local function trim_trailing_path_punctuation(path)
  return (path:gsub('[%.,%;%)%]>]+$', ''))
end

local function trim_selection(text)
  local trimmed = text:gsub('^%s+', ''):gsub('%s+$', '')
  trimmed = trimmed:gsub('^[`"\']+', ''):gsub('[`"\']+$', '')
  return trim_trailing_path_punctuation(trimmed)
end

local function uri_escape_path(path)
  return (path:gsub(' ', '%%20'))
end

-- Wrap a value in single quotes for a POSIX shell, escaping embedded quotes,
-- so tmux can hand it to `sh -c` intact (paths may contain spaces).
local function shell_single_quote(value)
  return "'" .. value:gsub("'", "'\\''") .. "'"
end

local web_tlds = {
  ai = true,
  app = true,
  com = true,
  dev = true,
  edu = true,
  gov = true,
  io = true,
  net = true,
  org = true,
}

local function has_web_domain(target)
  local lower = target:lower()
  lower = lower:gsub('^https?://', '')
  lower = lower:gsub('^www%.', '')

  local host = lower:match('^([a-z0-9_.-]+)')
  if not host then
    return false
  end

  local tld = host:match('%.([a-z0-9]+)$')
  return tld ~= nil and web_tlds[tld] == true
end

local function pane_cwd(pane)
  local uri = pane:get_current_working_dir()
  if not uri then
    return nil
  end

  if type(uri) == 'table' and uri.file_path then
    return uri.file_path
  end

  local cwd = tostring(uri)
  cwd = cwd:gsub('^file://', '')
  cwd = cwd:gsub('%%20', ' ')
  return cwd
end

local function tmux_display_cwd(wezterm, extra_args)
  local args = { tmux_path(), 'display-message' }
  for _, arg in ipairs(extra_args) do
    table.insert(args, arg)
  end
  table.insert(args, '-p')
  table.insert(args, '#{pane_current_path}')

  local success, stdout = wezterm.run_child_process(args)
  if not success or not stdout then
    return nil
  end

  local cwd = stdout:gsub('%s+$', '')
  if #cwd == 0 then
    return nil
  end

  return cwd
end

local function pane_runs_tmux(pane)
  local proc = pane and pane:get_foreground_process_name()
  return proc ~= nil and proc:find('tmux') ~= nil
end

-- The working directory of the pane that triggered the action.
-- Only ask tmux when this pane is actually running tmux, and then target the
-- pane's own client tty: an untargeted `display-message` returns whichever
-- pane tmux considers globally active, which may be a different window or an
-- unrelated tmux server. For a non-tmux pane, WezTerm's own cwd is
-- authoritative; querying tmux at all would return a stray path.
local function pane_effective_cwd(wezterm, pane)
  if pane_runs_tmux(pane) then
    local tty = pane:get_tty_name()
    return (tty and tmux_display_cwd(wezterm, { '-c', tty }))
      or tmux_display_cwd(wezterm, {})
      or pane_cwd(pane)
  end

  return pane_cwd(pane) or tmux_display_cwd(wezterm, {})
end

-- The tmux pane id (e.g. "%5") for the WezTerm pane that triggered the action,
-- found via its client tty, or nil when this pane is not running tmux.
local function tmux_target_pane(wezterm, pane)
  if not pane_runs_tmux(pane) then
    return nil
  end

  local tty = pane:get_tty_name()
  if not tty then
    return nil
  end

  local success, stdout =
    wezterm.run_child_process({ tmux_path(), 'display-message', '-c', tty, '-p', '#{pane_id}' })
  if not success or not stdout then
    return nil
  end

  local id = stdout:gsub('%s+$', '')
  if #id == 0 then
    return nil
  end

  return id
end

local function resolve_editor_path(wezterm, pane, path)
  if path:sub(1, 2) == '~/' then
    return (os.getenv('HOME') or '~') .. path:sub(2)
  end

  if path:sub(1, 1) == '/' then
    return path
  end

  -- Resolve relative paths against the pane that triggered the action.
  local cwd = pane_effective_cwd(wezterm, pane)
  if cwd and #cwd > 0 then
    return cwd .. '/' .. path
  end

  return path
end

local function is_web_target(target)
  local lower = target:lower()

  if lower:match('^https?://') then
    return true
  end

  if lower:match('^www%.') then
    return true
  end

  if lower:match('%.html$') or lower:match('%.htm$') then
    return true
  end

  if lower:match('%.html[?#]') or lower:match('%.htm[?#]') then
    return true
  end

  return has_web_domain(lower)
end

local function open_external_uri(wezterm, uri)
  if wezterm.open_with then
    wezterm.open_with(uri)
    return
  end

  if wezterm.target_triple:find('darwin') then
    wezterm.background_child_process({ 'open', uri })
  elseif wezterm.target_triple:find('windows') then
    wezterm.background_child_process({ 'cmd.exe', '/c', 'start', '', uri })
  else
    wezterm.background_child_process({ 'xdg-open', uri })
  end
end

local function open_browser_target(wezterm, pane, target)
  if target:lower():match('^https?://') then
    open_external_uri(wezterm, target)
    return
  end

  if target:lower():match('^www%.') or has_web_domain(target) then
    open_external_uri(wezterm, 'https://' .. target)
    return
  end

  local path = resolve_editor_path(wezterm, pane, target)
  open_external_uri(wezterm, 'file://' .. uri_escape_path(path))
end

local function open_vscode_target(wezterm, pane, target)
  local path, line, column = split_file_uri_payload(target)
  path = trim_trailing_path_punctuation(path)

  local editor_uri = 'vscode://file' .. resolve_editor_path(wezterm, pane, path)
  if line then
    editor_uri = editor_uri .. ':' .. line
    if column then
      editor_uri = editor_uri .. ':' .. column
    end
  end

  open_external_uri(wezterm, editor_uri)
end

-- Open a file path in nvim, in a new tmux pane split to the right of the pane
-- that triggered the action. Falls back to the editor when there is no tmux
-- pane to split (e.g. a bare WezTerm pane not running tmux).
local function open_in_tmux_nvim(wezterm, pane, target)
  local tmux_pane = tmux_target_pane(wezterm, pane)
  if not tmux_pane then
    open_vscode_target(wezterm, pane, target)
    return
  end

  local path, line = split_file_uri_payload(target)
  path = trim_trailing_path_punctuation(path)
  local resolved = resolve_editor_path(wezterm, pane, path)

  -- Invoke nvim by absolute path: tmux runs the split's shell-command with a
  -- non-interactive `sh -c`, which does not source shell rc files, so
  -- /opt/homebrew/bin is not on PATH and a bare `nvim` fails with exit 127.
  local editor = nvim_path()
  if line then
    editor = editor .. ' +' .. line
  end
  editor = editor .. ' -- ' .. shell_single_quote(resolved)

  local args = { tmux_path(), 'split-window', '-h', '-t', tmux_pane }
  local cwd = pane_effective_cwd(wezterm, pane)
  if cwd and #cwd > 0 then
    table.insert(args, '-c')
    table.insert(args, cwd)
  end
  table.insert(args, editor)

  wezterm.background_child_process(args)
end

local function open_selected_text(wezterm, window, pane)
  local target = trim_selection(window:get_selection_text_for_pane(pane))
  if #target == 0 then
    return
  end

  if is_web_target(target) then
    open_browser_target(wezterm, pane, target)
    return
  end

  open_in_tmux_nvim(wezterm, pane, target)
end

function M.apply(config, wezterm)
  config.hyperlink_rules = wezterm.default_hyperlink_rules()
  table.insert(config.hyperlink_rules, 1, {
    regex = [[(/[A-Za-z0-9_./@%+-]+\.[A-Za-z0-9_+-]+):(\d+):(\d+)]],
    format = 'vscode://file$1:$2:$3',
  })
  table.insert(config.hyperlink_rules, 2, {
    regex = [[(/[A-Za-z0-9_./@%+-]+\.[A-Za-z0-9_+-]+):(\d+)]],
    format = 'vscode://file$1:$2',
  })
  table.insert(config.hyperlink_rules, 3, {
    regex = [[(/[A-Za-z0-9_./@%+-]+\.[A-Za-z0-9_+-]+)]],
    format = 'vscode://file$1',
  })
  table.insert(config.hyperlink_rules, {
    regex = [[((?:/|~/|\./|\../|[A-Za-z0-9_.-]+/)[A-Za-z0-9_./@%+-]+)(?::(\d+))?(?::(\d+))?]],
    format = 'wezterm-file:$1:$2:$3',
  })
  table.insert(config.hyperlink_rules, {
    regex = [[\b([A-Za-z0-9_.-]+\.(?:astro|css|csv|env|html|js|json|jsx|log|lua|md|mdx|mjs|py|rb|rs|sh|toml|ts|tsx|txt|yaml|yml|zsh))(?::(\d+))?(?::(\d+))?\b]],
    format = 'wezterm-file:$1:$2:$3',
  })

  wezterm.on('open-uri', function(_, pane, uri)
    local payload = uri:match('^wezterm%-file:(.+)$')
    if not payload then
      return
    end

    open_vscode_target(wezterm, pane, payload)
    return false
  end)

  config.mouse_bindings = {
    {
      event = { Up = { streak = 1, button = 'Left' } },
      mods = 'CMD',
      action = wezterm.action.OpenLinkAtMouseCursor,
    },
  }

  config.keys = {
    {
      key = 'Space',
      mods = 'CTRL|SHIFT',
      action = wezterm.action.QuickSelectArgs({
        patterns = {
          [[https?://[^\s"'`<>]+]],
          [[www\.[A-Za-z0-9_.-]+\.[A-Za-z]{2,}[^\s"'`<>]*]],
          [[\b[A-Za-z0-9_.-]+\.(?:com|org|net|io|dev|app|ai|edu|gov)(?:[:/?#][^\s"'`<>]*)?]],
          [[(?:/|~/|\./|\../|[A-Za-z0-9_.-]+/)[A-Za-z0-9_./@%+~:-]+\.[A-Za-z0-9_+-]+(?::\d+)?(?::\d+)?]],
          [[\b[A-Za-z0-9_.-]+\.(?:astro|css|csv|env|html|js|json|jsx|log|lua|md|mdx|mjs|py|rb|rs|sh|toml|ts|tsx|txt|yaml|yml|zsh)(?::\d+)?(?::\d+)?\b]],
        },
        action = wezterm.action_callback(function(window, pane)
          open_selected_text(wezterm, window, pane)
        end),
      }),
    },
  }
end

return M
