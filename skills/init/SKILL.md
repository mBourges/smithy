---
name: init
description: "Set up smithy in the current repo (state folder, backlog, config, gitignore) and check the repo is ready for it. Use for /smithy:init."
disable-model-invocation: true
---

# Smithy: init

Run in the main checkout (`$(git rev-parse --path-format=absolute --git-common-dir)/..`).

1. Create, only if missing:
   - `smithy/backlog.md`:
     ```markdown
     # Backlog

     `/smithy:grill next` grills the first unchecked item and checks it off with its job id.

     - [ ] <feature, one line>
     ```
   - `smithy/config.json`:
     ```json
     {
       "mainBranch": "main",
       "autoMerge": true,
       "maxResumes": 2,
       "reviewers": ["conformance", "code", "security", "ux", "ui"]
     }
     ```
     Set `mainBranch` from `git symbolic-ref --short refs/remotes/origin/HEAD`
     (minus `origin/`) or the current branch. If the repo has no UI, ask the
     engineer whether to drop `ux` and `ui`.
2. Add `/smithy/jobs/` to `.gitignore` if it isn't there. Job folders are
   runtime state.
3. Check readiness and report each item as ok / missing:
   - `AGENTS.md` or `CLAUDE.md` says how to set up a fresh checkout, run the
     dev server on a given port, and run tests, build, lint and type-check.
     Agents read all repo specifics from there. If something is missing, offer
     to draft the section with the engineer; don't invent commands.
   - `agent-browser` is on the PATH, if `ux` or `ui` are enabled.
   - The working tree is clean and on `mainBranch`.
4. Tell the engineer where to watch the factory: `/smithy` opens the board
   pane (it docks beside the transcript in the fullscreen terminal, and draws
   in the desktop app too). A band above the prompt and a status entry appear
   by themselves whenever a job needs them.
5. Don't commit anything. Show the engineer what you created and tell them to
   commit it, then start with `/smithy:grill <feature>`.
