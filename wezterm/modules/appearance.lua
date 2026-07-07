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
