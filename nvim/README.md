# Neovim Config

A small, focused Neovim setup for this dotfiles repo. Scope is deliberately
narrow: navigate, open, git, edit, review. There is no LSP, no autocomplete,
and no linting here - this is a fast terminal editor for reading code, making
small edits, and reviewing branches, not an IDE.

Managed with [lazy.nvim](https://github.com/folke/lazy.nvim); plugin specs
live under `nvim/lua/plugins/`. See the top-level [README.md](../README.md)
for how this config gets installed (copy or symlink mode).

On first launch, nvim-treesitter (`main` branch) compiles syntax parsers in the
background. This needs the `tree-sitter` CLI (`brew install tree-sitter-cli`, in
the top-level requirements); highlighting and Markdown rendering come online once
the parsers finish building.

## Keymaps

Leader is `<space>`.

### Find (Telescope)

| Keys | Action |
|---|---|
| `<leader>ff` | Find files |
| `<leader>fg` | Live grep |
| `<leader>fb` | Buffers |
| `<leader>fh` | Help tags |

### Oil (file explorer)

| Keys | Action |
|---|---|
| `-` | Open parent directory (oil) |

### Git

| Keys | Action |
|---|---|
| `<leader>gg` | Open lazygit |
| `<leader>gd` | Review branch vs main (`DiffviewOpen main...HEAD`) |
| `<leader>gh` | File history (current file) |
| `]c` | Next git hunk |
| `[c` | Previous git hunk |
| `<leader>gs` | Stage hunk |
| `<leader>gr` | Reset hunk |
| `<leader>gb` | Blame line |

### Windows / general

| Keys | Action |
|---|---|
| `<C-h>` | Go to left split |
| `<C-j>` | Go to lower split |
| `<C-k>` | Go to upper split |
| `<C-l>` | Go to right split |
| `<leader>w` | Write file |
| `<leader>q` | Quit window |

## Common workflows

**Reading Markdown**

Opening a `.md` file renders it inline automatically - headings, code
blocks, tables, and lists are styled in the buffer instead of showing raw
markdown syntax. Run `:RenderMarkdown toggle` to switch back to the raw
source (and again to re-render), which is handy when you need to copy exact
text or edit the raw markup directly.

Long lines soft-wrap to the window width (prose filetypes only - code stays
unwrapped), so a narrow split stays readable. This is on by default via a
FileType autocmd; nothing to toggle.

**Open a file / grep for something**

`<leader>ff` to find a file by name, `<leader>fg` to live-grep across the
project. Both are Telescope pickers - type to filter, `<CR>` to open.

**Navigate and do file ops in oil**

Press `-` to open the parent directory as an editable buffer. Oil represents
a directory listing as normal text: move the cursor like any other buffer,
edit lines to rename, delete a line to delete that file, add a line to create
a new file, then `:w` to apply the changes. Nothing touches disk until you
write the buffer.

**Branch-review loop**

To review someone else's PR end to end:

```sh
gh pr checkout <n>
wt
nvim
```

Then, inside Neovim, either run `:DiffviewOpen main...HEAD` or press
`<leader>gd` (same thing, bound as a shortcut). This opens a diff view of the
whole branch against `main` so you can page through every changed file in one
place. Use `]c` / `[c` to jump between hunks, and `<leader>gh` for the file
history of whatever buffer you're on.

If a repo's default branch isn't `main`, run `:DiffviewOpen <base>...HEAD`
directly instead of `<leader>gd`.

**Full git UI**

`<leader>gg` opens [lazygit](https://github.com/jesseduffield/lazygit) in a
floating terminal for anything the inline gitsigns/diffview keymaps don't
cover (interactive rebase, stash management, etc).

## Learning vim

If you're new to modal editing, run `:Tutor` for the built-in interactive
tutorial.

Once running, just press `<space>` and wait - which-key pops up and shows
every keymap registered under that prefix (`f...` for find, `g...` for git),
so you don't need to memorize this table up front.

## Machine-local overrides

Create `nvim/lua/local.lua` to tweak options or add keymaps on a single
machine without touching tracked files. It's gitignored and `require`d last
in `init.lua`, after all plugins load, so it can override anything set
earlier.
