---
name: add
description: "Add a feature to the smithy backlog (smithy/backlog.md), which the board lists and /smithy:grill next takes from. Use for /smithy:add, or when the engineer asks to put something on the backlog."
argument-hint: "[--top] <feature, one line>"
---

# Smithy: add

Arguments: `$ARGUMENTS`

The backlog lives in the main checkout, even when this session is in a job
worktree: `<repo>/smithy/backlog.md`, where `<repo>` is
`$(git rev-parse --path-format=absolute --git-common-dir)/..`. If it is
missing, tell the engineer to run `/smithy:init` first and stop.

1. The item is the arguments without `--top`, joined onto one line, with
   surrounding whitespace and any leading `- [ ]` removed. If nothing is left,
   ask the engineer for the feature in one line. Keep their words; don't
   rephrase or split it.
2. If an unchecked line (`- [ ] `) already says the same thing, ignoring case,
   tell the engineer and stop.
3. Write `- [ ] <item>` at the start of the line, with no indent: the board and
   `/smithy:grill next` read only lines that start exactly with `- [ ] `.
   - If the file still has the `/smithy:init` placeholder
     `- [ ] <feature, one line>`, replace that line.
   - With `--top`, insert it just above the first unchecked line, so
     `/smithy:grill next` takes it first.
   - Otherwise, insert it just below the last unchecked line, or at the end of
     the file if there is none.
   Touch nothing else in the file.
4. Tell the engineer in one line where it landed (`3rd of 7 unchecked`). If
   it is below the 5th, say the board shows only the first five. Don't
   commit.
