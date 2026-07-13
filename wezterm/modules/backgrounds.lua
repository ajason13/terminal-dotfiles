local M = {}

local rotation_seconds = 15 * 60
-- How often the rotation timer wakes to check whether the wallpaper slot has
-- changed. Capped so that long rotation intervals still take effect within a
-- minute of a slot boundary, while short (test) intervals poll just as often.
local poll_interval_seconds = 60

-- A rotation timer is treated as dead if it has not refreshed its heartbeat
-- within this window, at which point another timer takes over. Comfortably
-- longer than the maximum poll interval so a healthy owner is never mistaken
-- for dead.
local timer_stale_seconds = 2 * poll_interval_seconds + 30

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

local function build_background_layers(background, hsb, fit, h_align, v_align)
  return {
    {
      source = { Color = '#000000' },
    },
    {
      source = { File = background },
      height = fit,
      repeat_x = 'NoRepeat',
      repeat_y = 'NoRepeat',
      horizontal_align = h_align,
      vertical_align = v_align,
      hsb = hsb,
    },
  }
end

local function apply_window_background(wezterm, window, background, hsb, text_opacity, fit, h_align, v_align)
  local id = tostring(window:window_id())

  -- Cache the last-applied wallpaper per window in wezterm.GLOBAL so the cache
  -- is shared across every rotation timer alive in the process (see the timer
  -- comment in M.apply). This collapses redundant work: when several timers
  -- coexist, only the first to observe a change re-renders; the rest no-op.
  local cache = wezterm.GLOBAL.last_background_by_window or {}
  if cache[id] == background then
    return
  end

  local overrides = window:get_config_overrides() or {}
  overrides.background = build_background_layers(background, hsb, fit, h_align, v_align)
  overrides.text_background_opacity = text_opacity
  window:set_config_overrides(overrides)

  cache[id] = background
  wezterm.GLOBAL.last_background_by_window = cache
end

-- Pure ownership decision for the rotation timer, factored out so it can be
-- unit-tested without WezTerm (see scripts/test-backgrounds-lua.sh). Given the
-- current owner claim (`{ id, beat }` or nil), this timer's id, the current
-- time, and the staleness window, returns true if this timer should keep
-- running (claim or refresh ownership) and false if it should retire because a
-- different timer is alive and owns rotation. The decision is made purely by
-- proof-of-life -- a fresh heartbeat -- never by id ordering; see the timer
-- comment in M.apply for why that distinction is load-bearing.
local function should_keep_running(owner, my_id, now, stale)
  if owner and owner.id ~= my_id and (now - owner.beat) < stale then
    return false
  end

  return true
end

function M.apply(config, wezterm, env)
  local backgrounds = collect_backgrounds(env)
  local local_config = env.local_config or {}
  local hsb = local_config.background_hsb or background_hsb
  local interval = local_config.background_rotation_seconds or rotation_seconds
  local text_opacity = local_config.text_background_opacity or text_background_opacity
  local fit = local_config.background_image_fit or background_image_fit
  local h_align = local_config.background_horizontal_align or background_horizontal_align
  local v_align = local_config.background_vertical_align or background_vertical_align
  local forced = forced_background(env, local_config)
  local initial_background = forced or current_background(backgrounds, interval)

  if initial_background then
    config.background = build_background_layers(initial_background, hsb, fit, h_align, v_align)
    config.text_background_opacity = text_opacity
  end

  -- Publish the current rotation state where the timer can read it.
  -- wezterm.GLOBAL persists across config reloads, so the timer always sees the
  -- latest values (list, interval, opacity, forced). Everything stored here is
  -- JSON-serializable (no functions).
  wezterm.GLOBAL.background_state = {
    images = backgrounds,
    interval = interval,
    hsb = hsb,
    text_opacity = text_opacity,
    fit = fit,
    h_align = h_align,
    v_align = v_align,
    forced = forced,
  }

  -- Drive rotation with a chained call_after timer. The obvious choice,
  -- update-status, is unreliable for this: WezTerm suspends that event's
  -- periodic firing whenever the terminal is idle (it is coupled to the
  -- render/event loop), so an idle screen never rotates. call_after is a real
  -- timer that fires regardless of idle state.
  --
  -- Every config load starts a timer, but at most one stays alive: timers
  -- coordinate through a heartbeat in wezterm.GLOBAL. Whichever timer actually
  -- *ticks* first claims ownership and refreshes a wall-clock heartbeat on every
  -- tick; other timers see a fresh heartbeat under a different id and retire. If
  -- the owner ever stops beating (e.g. a tick raised), another timer finds the
  -- heartbeat stale and takes over, so rotation never strands.
  --
  -- Ownership is decided by proof-of-life (a fresh heartbeat), NOT by eval order
  -- or a "newest wins" counter. WezTerm evaluates the config several times
  -- (throwaway evaluations on startup and reload) and every evaluation mutates
  -- GLOBAL, yet only some evaluations' call_after callbacks ever fire. A counter-
  -- or flag-based scheme advances on an evaluation whose timer never runs and
  -- disables the one that does -- which is exactly how earlier versions froze. A
  -- throwaway evaluation's timer never ticks, so it never claims ownership and
  -- never displaces a live timer. my_id is only an identity tag so the owner can
  -- recognize its own heartbeat; it never orders or ranks timers.
  local my_id = (wezterm.GLOBAL.rotation_timer_id or 0) + 1
  wezterm.GLOBAL.rotation_timer_id = my_id

  local function rotation_tick()
    local now = os.time()
    if not should_keep_running(wezterm.GLOBAL.rotation_owner, my_id, now, timer_stale_seconds) then
      -- A different timer is alive and owns rotation; retire this one.
      return
    end
    wezterm.GLOBAL.rotation_owner = { id = my_id, beat = now }

    local state = wezterm.GLOBAL.background_state
    local delay = poll_interval_seconds
    if state then
      delay = math.max(1, math.min(state.interval, poll_interval_seconds))
      local background = state.forced or current_background(state.images, state.interval)
      if background then
        -- call_after has no window argument, so reach live windows through the
        -- mux. gui_window() is nil for windows not shown in a GUI (skip those).
        for _, mux_window in ipairs(wezterm.mux.all_windows()) do
          local gui_window = mux_window:gui_window()
          if gui_window then
            apply_window_background(
              wezterm,
              gui_window,
              background,
              state.hsb,
              state.text_opacity,
              state.fit,
              state.h_align,
              state.v_align
            )
          end
        end
      end
    end

    wezterm.time.call_after(delay, rotation_tick)
  end

  -- Defer the first tick: during config evaluation the mux does not exist yet
  -- (calling wezterm.mux here fails with "cannot get Mux!?"). The initial
  -- wallpaper is already set via config.background above, so a short delay
  -- before the timer takes over is invisible.
  wezterm.time.call_after(1, rotation_tick)
end

-- Exposed for unit tests only (see scripts/test-backgrounds-lua.sh); not part
-- of the module's runtime API. These functions are pure and never touch WezTerm.
M._should_keep_running = should_keep_running
M._current_background = current_background
M._shuffled_index = shuffled_index

return M
