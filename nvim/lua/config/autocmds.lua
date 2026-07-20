-- Soft-wrap prose filetypes so long lines reflow to the window width instead of
-- running off-screen. `wrap` is off globally (better for code); enable it just
-- for reading/writing prose. `linebreak` wraps at word boundaries rather than
-- mid-word, and `breakindent` keeps wrapped lines aligned under where the line
-- started (so nested list items stay readable).
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'markdown', 'text', 'gitcommit' },
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.linebreak = true
    vim.opt_local.breakindent = true
  end,
})
