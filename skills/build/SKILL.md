---
name: build
description: "Build a smithy job whose spec the engineer has signed. Runs builder \u2192 parallel reviewers \u2192 approver \u2192 merge, and stops to hand any new engineering decision back to the engineer. Use for /smithy:build <job-id>."
argument-hint: <job-id>
disable-model-invocation: true
---

# Smithy: build

Arguments: `$ARGUMENTS`

You orchestrate one signed job. You spawn the agents, keep `job.json` current,
and route results. You never write code, reviews or decisions yourself, and you
never answer an engineering question on the engineer's behalf: those go back to
them.

```
signed spec → builder ─┬─ READY ──► [conformance, code, security, ux, ui] ── WAIT FOR ALL
                       ├─ BLOCKED ─► needs-human                              │
                       └─ QUESTION ► needs-decision ◄── any DECIDE ───────────┤
                  ▲                                                           │
                  └──────────── any CHANGES (resumes left) ◄──────────────────┤
                                                                  all PASS    ▼
                                     merge ◄── APPROVE ── approver ── ESCALATE ► needs-human
```

## Setup

`<repo>` is the main checkout: `$(git rev-parse --path-format=absolute --git-common-dir)/..`.
Find the job folder `<repo>/smithy/jobs/<job-id>` (a prefix like `004` is fine
if it is unique). Read `job.json` and `<repo>/smithy/config.json` (defaults:
`mainBranch: "main"`, `autoMerge: true`, `maxResumes: 2`,
`reviewers: ["conformance", "code", "security", "ux", "ui"]`).

The job must be signed: `SIGNED.json` exists in the job folder. If not, tell
the engineer to finish `/smithy:grill resume <job-id>` and type
sign it in `/smithy <job-id>`, and stop. The smithy mod also refuses to start a builder on an
unsigned or changed spec; if it blocks you, relay its message and stop.

Your session stays in the main checkout. Agents work in the worktree from
`job.json`. Only **Merge** touches the main checkout.

### Prompts

Every agent prompt starts with
`Job folder: <job folder>. Worktree: <worktree>. Branch: smithy/<job-id>. Main: <mainBranch>.`
(`<paths>` below). With `n` the job number (`004` → 4), the builder gets port
`5100 + 10n`, `reviewer-ux` `5101 + 10n`, `reviewer-ui` `5102 + 10n`, appended
as ` Port: <port>.`

Agent types are `smithy:builder`, `smithy:reviewer-<lens>` and `smithy:approver`.

## Start or continue

- No `build.md` yet: round 1. Set `stage: "build"`, spawn `smithy:builder` with
  `<paths> Build round 1. Port: <port>.` Wait, then **Build check**.
- `build.md` exists (the job is coming back from a decision break or a rework):
  set `stage: "build"` and spawn a fresh `smithy:builder` with
  `<paths> Continue: the engineer amended decisions.md (see the newest questions-*.md and signatures.log). Bring the branch in line with the signed spec, then update build.md for round <N+1>. Port: <port>.`
  where `N` is `job.json`'s round. A decision break gives a fresh `maxResumes`.

## Build check

First line of `build.md`:

- `STATUS: READY`: next **Review round**.
- `STATUS: QUESTION`: **Decision break**, with the questions under
  `## Questions` in `build.md`.
- `STATUS: BLOCKED`: **Needs human**.

## Review round N

1. Set `stage: "review"`, `round: N`, and `reviews` to `pending` for each lens
   in `reviewers`. Create `<job folder>/round-<N>/`.
2. Spawn every reviewer **in one message** so they run in parallel, each with
   `<paths> Review round N.` (plus the port for `ux` and `ui`).
3. **Wait for all.** As each finishes, read the first line of its
   `round-<N>/review-<lens>.md` (`VERDICT: PASS`, `VERDICT: CHANGES` or
   `VERDICT: DECIDE`) and write it into `job.json` at once. The round is done
   only when every file exists. If a reviewer ends without its file, or with a
   first line that is not a verdict, stop and tell the engineer.
4. Route, in this order:
   - **Any DECIDE**: **Decision break**, with the items under
     `## Decisions needed` in those files. (Wait for the round to finish first:
     the CHANGES from the same round are passed to the builder after the break.)
   - **Any CHANGES, resumes left**: set `stage: "build"` and resume the same
     builder by `SendMessage` (or a fresh `smithy:builder` if you can't):
     `Round N reviews are in <job folder>/round-<N>/. Address every finding in a VERDICT: CHANGES file, commit, and update build.md for round N+1.`
     Then **Build check**.
   - **Any CHANGES, no resumes left**: write `decision.md` reading `ESCALATE`, a
     blank line, then `Review rounds exhausted. Outstanding CHANGES in round-<N>/ from: <lenses>.`
     Then **Needs human**.
   - **All PASS**: **Approve**.

## Decision break

The builder or a reviewer found an engineering decision the spec does not
make. That is the engineer's, not yours and not the agents'.

1. Write `<job folder>/questions-<k>.md` (`k` = next unused number) listing each
   question with its source (`build.md` or `round-<N>/review-<lens>.md`), the
   context the agent gave, and the options. Keep the agent's recommendation
   unless `job.json` says `cold: true`.
2. Set `stage: "needs-decision"`.
3. Show the engineer the questions in the grill format, then say:

   > These need your call before the build can continue.
   > Press **Reopen the spec** in `/smithy <job-id>`, then run `/smithy:grill resume <job-id>`. When
   > the amended spec is signed again, run `/smithy:build <job-id>`.

4. Stop. The worktree and branch stay as they are.

## Approve

Set `stage: "approve"`. Spawn `smithy:approver` with `<paths> Final round: N.`
First line of `decision.md`:

- `APPROVE` and `autoMerge` is true: **Merge**.
- `APPROVE` and `autoMerge` is false: set `stage: "needs-human"`, tell the
  engineer it is approved and waiting for `/smithy:approve <job-id>`.
- `ESCALATE`: **Needs human**.

## Merge

The main checkout must be clean (apart from `smithy/backlog.md`) and on
`mainBranch`: `git status --porcelain -- . ':!smithy/backlog.md'` prints
nothing and `git branch --show-current` prints `mainBranch`. If not, set
`stage: "needs-human"` and tell the engineer to run `/smithy:approve <job-id>`
once it is clean. Otherwise, in the main checkout:

```bash
git merge --no-ff smithy/<job-id> -m "Merge smithy/<job-id>"
git worktree remove <worktree>
git branch -d smithy/<job-id>
```

Set `stage: "merged"`. If the merge fails, `git merge --abort` if one is in
progress, set `stage: "needs-human"` and say why. If only the worktree removal
fails, the job is still merged; report what git printed. Never push.

## Needs human

Set `stage: "needs-human"`. Tell the engineer which job, the worktree path, and
quote `decision.md` or the `## Blocked` section of `build.md`. Their options:
`/smithy:approve <job-id>`, `/smithy:rework <job-id> <note>`, or
**Reopen the spec** in `/smithy <job-id>` + `/smithy:grill resume <job-id>` if a decision was wrong.

## Reporting

One short line per transition, e.g.
`004-rate-limit: round 2 · conformance DECIDE, code CHANGES, others PASS → decision break`.
At the end, say whether it merged, needs a decision, or needs a human, and why.
