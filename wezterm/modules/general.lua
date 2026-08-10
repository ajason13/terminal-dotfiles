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

function M.apply(config)
  config.automatically_reload_config = true
  config.check_for_updates = false
  -- Attach the most recently used session rather than a fixed name, so renaming a
  -- session does not make the next window spawn a stray empty one. Bare `attach`
  -- exits nonzero only when no server is running, which is when `main` is created.
  local tmux = tmux_path()
  -- `-A` on the fallback so an attach that failed for some other reason still lands
  -- in `main` instead of erroring out with "duplicate session".
  config.default_prog = { '/bin/sh', '-c', tmux .. ' attach || exec ' .. tmux .. ' new-session -A -s main' }
  config.scrollback_lines = 20000
  config.enable_scroll_bar = true
  config.enable_tab_bar = false
  config.use_fancy_tab_bar = true
  config.show_new_tab_button_in_tab_bar = false
  config.window_close_confirmation = 'NeverPrompt'

  config.inactive_pane_hsb = {
    saturation = 0.85,
    brightness = 0.80,
  }
  config.pane_focus_follows_mouse = false
  config.adjust_window_size_when_changing_font_size = false
end

return M
