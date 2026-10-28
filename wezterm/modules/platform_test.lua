-- Mocked platform regressions; native Windows/WSL still needs the guide's smoke checks.
local dir = arg[0]:match('(.*/)') or './'
local general = dofile(dir .. 'general.lua')
local links = dofile(dir .. 'links.lua')

local windows = { target_triple = 'x86_64-pc-windows-msvc' }
local config = {}
general.apply(config, windows, {})
assert(config.default_prog[1] == 'wsl.exe')
assert(config.default_prog[2] == '--cd' and config.default_prog[3] == '~')
assert(config.default_prog[4] == '--exec' and config.default_prog[5] == '/bin/sh')
assert(config.default_prog[6] == '-lc')
assert(config.default_prog[7]:find('exec tmux new%-session %-A %-s main'))
assert(not config.default_prog[7]:find('/opt/homebrew'))

general.apply(config, windows, { local_config = { wsl_distribution = 'Ubuntu Test' } })
assert(config.default_prog[2] == '--distribution')
assert(config.default_prog[3] == 'Ubuntu Test') -- one argv value, including spaces
assert(config.default_prog[4] == '--cd')
local loop = config.default_prog[#config.default_prog]
assert(loop:find('while tmux list%-sessions'))
assert(loop:find('tmux attach'))

for _, triple in ipairs({ 'aarch64-apple-darwin', 'x86_64-unknown-linux-gnu' }) do
  general.apply(config, { target_triple = triple }, {})
  assert(config.default_prog[1] == '/bin/sh' and config.default_prog[2] == '-c')
  assert(config.default_prog[3]:find('new%-session %-A %-s main'))
end

local handlers, opened, copied, toasted = {}, nil, nil, false
windows.default_hyperlink_rules = function() return {} end
windows.on = function(event, callback) handlers[event] = callback end
windows.action = {
  OpenLinkAtMouseCursor = 'open-link', Nop = 'nop',
  QuickSelectArgs = function(args) return args end,
}
windows.action_callback = function(callback) return callback end
windows.open_with = function(uri) opened = uri end
windows.run_child_process = function() error('Windows must not query host tmux') end
local selection
local window = {
  get_selection_text_for_pane = function() return selection end,
  copy_to_clipboard = function(_, value) copied = value end,
  toast_notification = function() toasted = true end,
}
local pane = setmetatable({}, { __index = function() error('Do not query Linux paths on Windows host') end })
links.apply(config, windows)
assert(#config.mouse_bindings == 4)
for _, binding in ipairs(config.mouse_bindings) do assert(binding.mods == 'CTRL|SHIFT') end
local select = config.keys[1].action.action
selection = '/home/test/a.md:12'
select(window, pane)
assert(copied == selection and toasted and opened == nil)
selection = 'https://example.com/docs'
select(window, pane)
assert(opened == selection)
selection = 'example.com'
select(window, pane)
assert(opened == 'https://example.com')
selection = './page.html'
select(window, pane)
assert(copied == selection)
assert(handlers['open-uri'](window, pane, 'wezterm-file:/home/test/a.md:1:') == false)
assert(handlers['open-uri'](window, pane, 'vscode://file/home/test/a.md') == false)
assert(handlers['open-uri'](window, pane, 'https://example.com') == nil)
windows.target_triple = 'aarch64-apple-darwin'
links.apply(config, windows)
for _, binding in ipairs(config.mouse_bindings) do assert(binding.mods == 'CMD') end

-- The shim must use WezTerm's home API even with no HOME environment variable.
local saved_getenv, saved_dofile = os.getenv, dofile
local saved_wezterm = package.loaded.wezterm
local saved_config_dir = _G.WEZTERM_PORTABLE_CONFIG_DIR
package.loaded.wezterm = { home_dir = 'C:/Users/Windows User' }
os.getenv = function() return nil end
local loaded
_G.dofile = function(path) loaded = path; return {} end
saved_dofile(dir .. '../.wezterm.lua')
assert(loaded == 'C:/Users/Windows User/.config/wezterm/wezterm.lua')
assert(_G.WEZTERM_PORTABLE_CONFIG_DIR == 'C:/Users/Windows User/.config/wezterm')
_G.dofile, os.getenv = saved_dofile, saved_getenv
package.loaded.wezterm = saved_wezterm
_G.WEZTERM_PORTABLE_CONFIG_DIR = saved_config_dir

print('all Windows/Unix platform tests passed')
