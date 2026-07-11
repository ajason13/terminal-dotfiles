local M = {}

local rotation_seconds = 15 * 60
local refresh_interval_ms = 60 * 1000

local background_hsb = {
  brightness = 0.40,
  saturation = 0.90,
}
local background_image_fit = 'Contain'
local background_horizontal_align = 'Center'
local background_vertical_align = 'Middle'

-- Opacity is only applied when a background image is active. Keep
-- text_background_opacity below 1.0 so the wallpaper shows through
-- cells that paint an explicit background color (full-screen TUIs like editors
-- or Claude Code, and styled tmux status segments); at 1.0 those cells hide it.
local text_background_opacity = 0.55

local last_background_by_window = {}

local function file_exists(path)
  local file = io.open(path, 'r')
  if file then
    file:close()
    return true
  end

  return false
end

local function extend(list, values)
  for _, value in ipairs(values) do
    table.insert(list, value)
  end
end

local function exclude_set(values)
  local set = {}
  for _, value in ipairs(values or {}) do
    set[value] = true
  end

  return set
end

local function listed_background_groups(env)
  local manifest_dir = env.config_dir .. '/modules/background_manifests'

  -- Backgrounds stay on an explicit allowlist for predictability. Small
  -- manifest files scale better than one large flat table.
  return {
    dofile(manifest_dir .. '/general.lua'),
    dofile(manifest_dir .. '/vehicles.lua'),
    dofile(manifest_dir .. '/anime.lua'),
  }
end

local function all_background_files(env, local_config)
  local files = {}
  local excludes = exclude_set(local_config.background_excludes)

  for _, group in ipairs(listed_background_groups(env)) do
    for _, file in ipairs(group) do
      if not excludes[file] then
        table.insert(files, file)
      end
    end
  end

  return files
end

local function collect_backgrounds(env)
  local backgrounds = {}
  local dir = env.config_dir .. '/assets/backgrounds'
  local local_config = env.local_config or {}
  local background_files = all_background_files(env, local_config)

  for _, file in ipairs(background_files) do
    local path = dir .. '/' .. file
    if file_exists(path) then
      table.insert(backgrounds, path)
    end
  end

  return backgrounds
end

-- Pseudo-random but repeat-free rotation: each pass through the list uses a
-- fresh Fisher-Yates shuffle (every wallpaper shows once before any repeat),
-- reshuffled each pass. Stateless and time-derived, so machines with the same
-- list stay in sync.
local function shuffled_index(count, slot)
  local order = {}
  for i = 1, count do
    order[i] = i
  end

  -- Seed a small local LCG from the cycle number, so we never touch the global
  -- math.random state.
  local cycle = math.floor(slot / count)
  local seed = (cycle * 2654435761 + 1) % 2147483647
  for i = count, 2, -1 do
    seed = (seed * 1103515245 + 12345) % 2147483648
    local j = (seed % i) + 1
    order[i], order[j] = order[j], order[i]
  end

  return order[(slot % count) + 1]
end

local function current_background(backgrounds, interval)
  if #backgrounds == 0 then
    return nil
  end

  local slot = math.floor(os.time() / interval)
  return backgrounds[shuffled_index(#backgrounds, slot)]
end

local function forced_background(env, local_config)
  local forced = local_config.background_force_image
  if not forced or forced == '' then
    return nil
  end

  local path = env.config_dir .. '/assets/backgrounds/' .. forced
  if file_exists(path) then
    return path
  end

  return nil
end

local function build_background_layers(background, hsb, local_config)
  return {
    {
      source = { Color = '#000000' },
    },
    {
      source = { File = background },
      height = local_config.background_image_fit or background_image_fit,
      repeat_x = 'NoRepeat',
      repeat_y = 'NoRepeat',
      horizontal_align = local_config.background_horizontal_align or background_horizontal_align,
      vertical_align = local_config.background_vertical_align or background_vertical_align,
      hsb = hsb,
    },
  }
end

local function apply_window_background(window, background, hsb, text_opacity, local_config)
  local id = tostring(window:window_id())
  if last_background_by_window[id] == background then
    return
  end

  local overrides = window:get_config_overrides() or {}
  overrides.background = build_background_layers(background, hsb, local_config)
  overrides.text_background_opacity = text_opacity
  window:set_config_overrides(overrides)
  last_background_by_window[id] = background
end

function M.apply(config, wezterm, env)
  local backgrounds = collect_backgrounds(env)
  local local_config = env.local_config or {}
  local hsb = local_config.background_hsb or background_hsb
  local interval = local_config.background_rotation_seconds or rotation_seconds
  local text_opacity = local_config.text_background_opacity or text_background_opacity
  local initial_background = forced_background(env, local_config) or current_background(backgrounds, interval)

  if initial_background then
    config.background = build_background_layers(initial_background, hsb, local_config)
    config.text_background_opacity = text_opacity
  end

  config.status_update_interval = refresh_interval_ms

  -- wezterm.on handlers are never cleared on config reload, so registering here
  -- on every reload stacks duplicate rotation handlers that fight over the
  -- window background (each closes over a different snapshot of the wallpaper
  -- list, so they apply different images and visibly overlay/flicker). Tag each
  -- registration with a generation number and let only the newest one act; the
  -- superseded closures early-return and linger harmlessly until a restart.
  wezterm.GLOBAL.background_generation = (wezterm.GLOBAL.background_generation or 0) + 1
  local generation = wezterm.GLOBAL.background_generation

  wezterm.on('update-status', function(window)
    if generation ~= wezterm.GLOBAL.background_generation then
      return
    end
    local background = forced_background(env, local_config) or current_background(backgrounds, interval)
    if background then
      apply_window_background(window, background, hsb, text_opacity, local_config)
    end
  end)
end

return M
