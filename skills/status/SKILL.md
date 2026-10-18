---
name: status
description: "Summarise the smithy factory in chat: every job, what needs the engineer, review verdicts, backlog; or one job in detail. Use when the engineer asks what the factory is doing, or for /smithy:status [job-id]. The live view is the /smithy board pane."
argument-hint: "[job-id]"
---

# Smithy: status

Arguments: `$ARGUMENTS`

Read-only. The engineer's live view is the board pane, opened with `/smithy`
(or `/smithy <job-id>` for one job). This skill answers in chat.

`<repo>` is `$(git rev-parse --path-format=absolute --git-common-dir)/..`.

**No argument**: for each folder in `<repo>/smithy/jobs/`, read `job.json` and
write one line, jobs that need the engineer first (`awaiting-signature`,
`needs-decision`, `needs-human`), then the rest, newest first:

`004-rate-limit · review r2 · conformance PASS, code CHANGES, security pending · signed by Ada`

The signer comes from `SIGNED.json` (`signed_by`); write `unsigned` if it is
missing. Then list the unchecked items in `smithy/backlog.md`.

**With a job id**: also give the feature, the worktree, decision counts by
provenance from `decisions.md` (naming each `delegated` one), any open
`questions-*.md`, the last three lines of `signatures.log`, and the first line
plus `## Why` of `decision.md` if it exists.

End with the one thing the engineer most likely wants next, and remind them
that `/smithy <job-id>` shows it live.
