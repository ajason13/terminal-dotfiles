local M = {}

function M.apply(config, wezterm, env)
  config.font = wezterm.font_with_fallback({
    'JetBrains Mono',
    'SF Mono',
    'Menlo',
    'Noto Color Emoji',
  })
  config.font_size = 13.0
  config.line_height = 1.05
  config.harfbuzz_features = { 'calt=0', 'liga=0' }

  -- TokyoNightStorm with a brighter, near-white default foreground: the stock
  -- ~#c0caf5 blue-gray reads dim over the dark rotating wallpapers. Override the
  -- scheme itself, because with color_scheme set, config.colors.foreground is
  -- ignored. ANSI colors are unchanged; machines can still override foreground
  -- via local.lua.
  local scheme = wezterm.color.get_builtin_schemes()['TokyoNightStorm (Gogh)']
  scheme.foreground = '#f2f3f7'
  config.color_schemes = { ['TokyoNightStorm (Gogh)'] = scheme }
  config.color_scheme = 'TokyoNightStorm (Gogh)'

  config.window_padding = {
    left = 10,
    right = 10,
    top = 8,
    bottom = 8,
  }
  -- window_background_opacity / text_background_opacity are managed in
  -- backgrounds.lua so the wallpaper stays visible. Leaving them at the WezTerm
  -- default of 1.0 here would paint an opaque layer over the background image.
end

return M
