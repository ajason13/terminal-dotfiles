local wezterm = require 'wezterm'
local config = wezterm.config_builder()

local home = os.getenv('HOME')
local config_dir = _G.WEZTERM_PORTABLE_CONFIG_DIR or wezterm.config_dir or (home .. '/.config/wezterm')
local modules_dir = config_dir .. '/modules'
local env = {
  config_dir = config_dir,
  home = home,
}

local function file_exists(path)
  local file = io.open(path, 'r')
  if file then
    file:close()
    return true
  end

  return false
end

-- dofile, unlike require, does not add the loaded file to the config reload
-- watch list, so edits to a module silently no-op until something touches the
-- entry point. Register every file we load so automatically_reload_config sees it.
local function load_watched(path)
  wezterm.add_to_config_reload_watch_list(path)
  return dofile(path)
end

-- This file is itself reached by a dofile from the entry point, so it needs the
-- same treatment as the modules it loads.
wezterm.add_to_config_reload_watch_list(config_dir .. '/wezterm.lua')

local local_config_path = config_dir .. '/local.lua'
if file_exists(local_config_path) then
  local local_config = load_watched(local_config_path)
  if type(local_config) == 'table' then
    env.local_config = local_config
  elseif type(local_config) == 'function' then
    env.local_config = {
      apply = local_config,
    }
  end
end

load_watched(modules_dir .. '/links.lua').apply(config, wezterm, env)
load_watched(modules_dir .. '/general.lua').apply(config, wezterm, env)
load_watched(modules_dir .. '/appearance.lua').apply(config, wezterm, env)
load_watched(modules_dir .. '/backgrounds.lua').apply(config, wezterm, env)
load_watched(modules_dir .. '/macos.lua').apply(config, wezterm, env)

if env.local_config and type(env.local_config.apply) == 'function' then
  env.local_config.apply(config, wezterm, env)
end

return config
