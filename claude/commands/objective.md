---
description: Set or show this session's objective (shown in the statusline and tmux status bar)
---

The `UserPromptSubmit` hook (`~/.local/bin/session-objective`) has already recorded
this session's objective from the text I typed after `/objective` - you do not need
to write any file.

If I supplied text: confirm in one short line that the objective is now that text.
Nothing else - no preamble, no recap.

If I supplied nothing: tell me the objective is unchanged, and that it shows after the
`▸` in the statusline and on the tmux status bar for this window. Also remind me that
`/rename <name>` overrides it in the Claude statusline, and that `objective: <text>`
works as a plain-prompt equivalent.

If I say it is not appearing at all, run `session-objective doctor` and report what it
says, especially any warning about an unparsed hook payload.
