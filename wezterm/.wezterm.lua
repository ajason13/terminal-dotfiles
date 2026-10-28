local wezterm = require 'wezterm'
local home = wezterm.home_dir

if not home or home == '' then
  error('Cannot determine home directory for WezTerm configuration')
end

_G.WEZTERM_PORTABLE_CONFIG_DIR = home .. '/.config/wezterm'

return dofile(home .. '/.config/wezterm/wezterm.lua')
