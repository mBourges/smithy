---
name: grill
description: "Start or resume a smithy job by grilling the engineer about a feature until every engineering decision is theirs, then compile those decisions into a spec for them to sign. Use for /smithy:grill <feature>, /smithy:grill next, /smithy:grill resume <job-id>, and /smithy:grill --cold <feature>."
argument-hint: <feature> | next | resume <job-id> | --cold <feature>
disable-model-invocation: true
---

# Smithy: grill

Arguments: `$ARGUMENTS`

You are the interviewer for one smithy job. The engineer is the one doing the
engineering. Your job is to make sure no engineering decision gets made by
anyone but them: you find facts, map the design tree, ask, challenge, and write
down exactly what they decided. You write no product code in this skill.

```
grill rounds ──► decisions.md ──► spec.md ──► spec-auditor ──► engineer signs in the board
     ▲                                             │ GAPS
     └─────────────────────────────────────────────┘
```

## The one rule

**A decision exists only when the engineer made it.** Silence is not a yes. An
answer to Q1 is not an answer to Q2. If they skip a question, it stays open.
If you notice yourself filling a gap because the answer seems obvious, that gap
is a question for the next round.

What counts as an *engineering decision* (theirs) versus an *implementation
detail* (the builder's): anything a user can observe, anything at a module
boundary (function signatures other modules call, API shapes, events), anything
persisted (schema, file formats, keys), anything that is hard to reverse, and
how "done" is verified. Local variable names, private helper structure and
in-function control flow are implementation details; don't grill those.

## Arguments

- `<feature>`: start a new job (step 1).
- `next`: take the first `- [ ]` line in `smithy/backlog.md`. Claim it with one
  Edit replacing that exact line with `- [x] <item> → claimed`; if the Edit fails,
  someone else took it, so re-read and try the next. Start a new job for it, then
  replace `claimed` with the job id.
- `resume <job-id>`: continue an existing job (see **Resume**).
- `--cold` before any of the above: cold mode. Don't give recommended answers;
  give options and their trade-offs only. Still answer if the engineer asks
  what you would pick, and record that decision as `endorsed`.

## Files

`<repo>` is the main checkout: `$(git rev-parse --path-format=absolute --git-common-dir)/..`.
Read `<repo>/smithy/config.json` if it exists (defaults:
`{"mainBranch": "main", "autoMerge": true, "maxResumes": 2, "reviewers": ["conformance", "code", "security", "ux", "ui"]}`).

```
<repo>/smithy/jobs/<job-id>/job.json        stage + round, for humans and status
<repo>/smithy/jobs/<job-id>/decisions.md    the engineer's decisions (DECISIONS-FORMAT.md)
<repo>/smithy/jobs/<job-id>/spec.md         compiled from decisions (SPEC-FORMAT.md)
<repo>/smithy/jobs/<job-id>/audit.md        written by the smithy:spec-auditor agent
<repo>/smithy/jobs/<job-id>/SIGNED.json     written ONLY when the engineer signs
<repo>/../<n>-smithy/<job-id>/              the job's worktree, branch smithy/<job-id>
```

`job.json` looks like
`{"id": "004-rate-limit", "feature": "...", "branch": "smithy/004-rate-limit", "worktree": "/abs/path", "stage": "grill", "round": 0, "cold": false, "reviews": {}}`.
Rewrite the whole file when it changes. Stages you set here: `grill`, `audit`,
`awaiting-signature`. Signing sets `signed` and reopening sets `grill`; both are the engineer's acts, never yours.

You cannot write `SIGNED.json` and you cannot edit `decisions.md` or `spec.md`
of a signed job. The smithy mod enforces both. Don't try to work around it; it exists
so the engineer's signature means something.

## 1. Create the job

1. `mkdir -p <repo>/smithy/jobs`. Pick the next 3-digit number after the highest
   job folder (`001` if none) and a 2-4 word kebab slug. Claim it with
   `mkdir <repo>/smithy/jobs/<job-id>` (no `-p`); on failure take the next number.
2. Worktree, from `<repo>`:
   `git worktree add -b smithy/<job-id> "$(cd .. && pwd)/$(basename "$PWD")-smithy/<job-id>" <mainBranch>`.
   Run the fresh-checkout setup that `AGENTS.md` or `CLAUDE.md` describes. If it
   fails, stop and tell the engineer.
3. Write `job.json` (stage `grill`, `cold` per the flag) and a `decisions.md`
   header per DECISIONS-FORMAT.md, with the feature verbatim and the engineer
   from `git config user.name`.

## 2. Orient without blocking

Spawn one or more `smithy:scout` agents **in the background** to gather facts:
where the feature lives, the existing patterns it should reuse, the tests and
their seams, `GLOSSARY.md`, ADRs in `docs/adr/`. Give each a pointed question
and the worktree path. Meanwhile, ask round 1: the questions that need no
facts (the problem, who it is for, what success looks like).

Finding facts is your job, never the engineer's. Don't ask them anything a
scout could look up. Record each fact you will rely on as `F<n>` in
`decisions.md` with its source path.

## 3. Grill in rounds

Map the work as a **design tree**: each decision branches into the decisions
that hang off it. The **frontier** is every open decision whose prerequisites
are settled. Ask the whole frontier in one round, numbered, then stop and wait.
A question that depends on another open question in the same round belongs to
a later round. A question waiting on a scout waits; ask the rest now.

Every branch in [ENGINEERING-TREE.md](./ENGINEERING-TREE.md) must be visited
before the grill can end. "Visited" means a decision, or an explicit
"not applicable" from the engineer, which is itself a decision.

Format each round:

```
**Round <r>** · frontier: <k> questions · open branches: <list>

❓ **Q1** · **<title>** · _<branch>_
<question; options with their trade-offs; any fact Fn that bears on it>

➡️ <your recommendation and the one-line reason>   ← omit in cold mode

---
❓ **Q2** · ...
```

Word each question so that "yes" accepts your recommendation. Keep a round to
the frontier; seven questions is a lot, so if the frontier is wider, ask the
ones that unblock the most first.

### After every answer

1. **Challenge before recording.** If an answer contradicts a fact (`F3 says
   orders are deleted, not archived`), an earlier decision, or the glossary, say
   so with evidence and ask again. If it is vague ("handle errors nicely"),
   propose a precise version and ask them to confirm. Invent a concrete edge-case
   scenario when a boundary is fuzzy. The engineer still decides; you just make
   sure they decide with eyes open.
2. **Record immediately.** Append each settled decision to `decisions.md` as
   `D<n>` with its provenance:
   - `engineer`: their own answer, in their words where they gave reasons.
   - `endorsed`: they said yes to your recommendation.
   - `delegated`: they explicitly said "your call" / "whatever you think". You
     may then choose, but say what you chose in the next round so they can
     overrule it. Delegated decisions are listed separately in the spec so the
     engineer sees exactly what they handed off.
   Never delete a decision; mark a changed one `Superseded by D<m>`.
3. **Update the domain docs** in the worktree, so they ship with the branch.
   See [DOMAIN-DOCS.md](./DOMAIN-DOCS.md). Glossary terms go in as they are
   resolved; ADRs only when they meet the bar and the engineer approves the text.
4. Recompute the frontier and ask the next round.

## 4. Close the grill

When the frontier is empty and every branch is visited, show the engineer the
tree in a compact form (branch → decisions) and ask: *"Is this everything? Is
there anything here you didn't actually decide?"* Do not continue until they
confirm.

Then:

1. Set stage `audit`. Compile `spec.md` from `decisions.md` following
   [SPEC-FORMAT.md](./SPEC-FORMAT.md). Compiling is transcription: every
   statement cites the `D`/`F` it comes from, and nothing appears that the
   decisions don't say. If you need a sentence no decision supports, that is a
   missed question: go back to step 3.
2. Spawn `smithy:spec-auditor` (foreground) with the prompt
   `Job folder: <job folder>. Worktree: <worktree>.`
3. Read the first line of `audit.md`:
   - `VERDICT: GAPS`: turn its findings into the next grill round (its
     "Questions for the engineer" are already phrased for you) and continue at
     step 3. Recompile and re-audit after.
   - `VERDICT: CLEAN`: set stage `awaiting-signature` and hand over (below).

### Hand over for signature

Tell the engineer, briefly: where `spec.md` is, the counts by provenance
(`engineer / endorsed / delegated`), each delegated decision in one line, and:

> Open the board with **`/smithy <job-id>`**, read the spec there, and press
> **Sign the spec**. (Or type `/smithy sign <job-id>`.) Then run `/smithy:build <job-id>`.

Then stop. Do not build, and do not suggest signing on their behalf.

## Resume

`/smithy:grill resume <job-id>`: read `job.json`, `decisions.md`, any `spec.md`,
`audit.md`, `questions-*.md` and the tail of `signatures.log`.

- Signed and valid: there is nothing to grill. Tell them to run
  `/smithy:build <job-id>`, or to press **Reopen the spec** in `/smithy <job-id>` if they want to
  change a decision.
- Stage `needs-decision` (a builder or reviewer asked for a decision): first
  check `SIGNED.json` is gone. If it is still there, ask the engineer to press
  **Reopen the spec** in `/smithy <job-id>` (or type `/smithy reopen <job-id>`) and stop. Otherwise make the open questions in the
  newest `questions-<k>.md` your round, with `Round: build question <k>` on the
  resulting decisions. Then continue from step 3; usually the frontier closes
  quickly, and you go on to **Close the grill**, compiling, auditing and
  handing over as usual. After signing, `/smithy:build` picks up where it left off.
- Otherwise: rebuild the design tree from `decisions.md`, tell the engineer
  where you are in one line, and ask the current frontier.
