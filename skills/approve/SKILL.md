---
name: approve
description: "Merge a smithy job that is waiting in needs-human, after the engineer has looked at it. Use for /smithy:approve <job-id>."
argument-hint: <job-id>
disable-model-invocation: true
---

# Smithy: approve

Arguments: `$ARGUMENTS`

The engineer has reviewed the job and wants it merged.

1. Find `<repo>/smithy/jobs/<job-id>` (`<repo>` is
   `$(git rev-parse --path-format=absolute --git-common-dir)/..`) and read
   `job.json`. The stage must be `needs-human`. If it is anything else, say what
   it is and stop.
2. If `SIGNED.json` is missing or the job has an open `questions-*.md` with no
   decisions recorded for it, the spec is not settled: say so and stop.
3. Run the **Merge** section of the smithy build skill: clean main checkout on
   `mainBranch` from `smithy/config.json` (default `main`), then
   `git merge --no-ff smithy/<job-id> -m "Merge smithy/<job-id>"`,
   `git worktree remove <worktree>`, `git branch -d smithy/<job-id>`. Set
   `stage: "merged"`. On a failed merge, `git merge --abort`, keep
   `needs-human` and report why. Never push.
