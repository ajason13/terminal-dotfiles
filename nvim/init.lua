-- Leader must be set before lazy.nvim loads (plugin specs read it at setup).
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

require('config.options')
require('config.keymaps')
require('config.autocmds')

-- Bootstrap lazy.nvim.
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    'git', 'clone', '--filter=blob:none',
    'https://github.com/folke/lazy.nvim.git',
    '--branch=stable', lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require('lazy').setup('plugins', {
  change_detection = { notify = false },
})

-- Machine-local overrides (gitignored), loaded last so a machine can tweak
-- options or add keymaps without editing tracked files.
pcall(require, 'local')
