# smithy

A software factory for Claude Code where **the engineer does the engineering**.

Most agent factories hand a one-line feature to a spec-writing agent, which
quietly makes dozens of engineering decisions and records the risky ones as
"assumptions". smithy flips that: every feature is **grilled** first. Claude
finds the facts and asks the questions; you make every decision; the spec is a
transcription of your decisions; and agents build only from a spec **you have
signed**. If they hit a decision you didn't make, the build stops and asks you.

It's a Claude Code **mod**, so the factory lives inside Claude Code: a live
board pane, a band above the prompt when something waits for you, a status
entry, and toasts.

```
/smithy:grill ─► rounds of questions ─► decisions.md ─► spec.md ─► spec-auditor
                    ▲  you decide                                     │ GAPS
                    └─────────────────────────────────────────────────┘
                                                                      │ CLEAN
                              you press Sign in the /smithy board  ◄┘
                                                    │
/smithy:build ─► builder ─► [conformance, code, security, ux, ui] ─► approver ─► merge
                  │ QUESTION              │ DECIDE                    │ ESCALATE
                  └────────► back to you ◄┘                           └► back to you
```

Built on two ideas:

- The grilling method from Matt Pocock's
  [`grill-with-docs`](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs)
  (design tree, rounds of the frontier, facts are Claude's job and decisions
  are yours, glossary and ADRs written as you go). MIT.
- The file-based agent loop from the zazencodes
  [software factory](https://github.com/zazencodes/zazencodes-season-3/tree/main/src/software-factory-claude-code)
  (one worktree per job, parallel review lenses, an approver, a job folder per
  feature). The agent prompts here are rewritten, not copied.

## Install

smithy is a Claude Code **mod**: a plugin whose hooks module draws the board
inside Claude Code and guards the spec. Mods are early access, so use a recent
Claude Code (built against 2.1.302).

From GitHub, inside Claude Code:

```
/plugin install smithy --marketplace mBourges/smithy
```

or from your shell:

```bash
claude plugin install smithy --marketplace mBourges/smithy
```

In the desktop app: **+** → **Plugins** → **Add marketplace**, enter
`mBourges/smithy`, then **Add plugin** on smithy.

From a local clone, for one session: `claude --plugin-dir ./smithy`.

Needs `git`. The UX and UI reviewers use the
[`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI. Then, in
your repo: `/smithy:init`.

## Commands

| You do                                | What happens                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/smithy:init`                        | Creates `smithy/backlog.md` and `smithy/config.json`, gitignores `smithy/jobs/`, checks `AGENTS.md`. |
| `/smithy:grill <feature>`             | New job and worktree. Grills you round by round, then compiles and audits the spec.            |
| `/smithy:grill --cold <feature>`      | Same, but Claude gives options and trade-offs without recommending an answer.                  |
| `/smithy:grill next`                  | Grills the first unchecked backlog item.                                                        |
| `/smithy:grill resume <id>`           | Continues a grill, or answers the questions a build stopped on.                                |
| `/smithy [id]`                        | Opens the board pane, or one job in it.                                                         |
| **Sign the spec** (in the board)      | Signs the spec after a clean audit, with a confirming press. Also `/smithy sign <id>`.         |
| **Reopen the spec** (in the board)    | Unlocks a signed spec so decisions can change. Also `/smithy reopen <id>`.                     |
| `/smithy:build <id>`                  | Runs the build/review loop on a signed spec.                                                    |
| `/smithy:approve <id>`                | Merges a job that is waiting for you.                                                           |
| `/smithy:rework <id> <note>`          | Sends a job back to the builder. Refuses if the note is really a decision change.              |
| `/smithy:status [id]`                 | The same picture as the board, written in chat.                                                 |

## What "the engineer does the engineering" means here

**An engineering decision** is anything a user can observe, anything at a
module boundary, anything persisted, anything hard to reverse, and how "done"
is verified. Those are yours. Private names and internal structure are the
builder's.

**The grill visits every branch** of an engineering tree (problem, domain,
behaviour, interface, data, failure, security, performance, observability,
rollout, testing, scope) before it can end. "Not applicable" is fine, but you
have to say it. Acceptance criteria and test seams are decided by you, not
generated.

**Every decision has provenance**: `engineer` (your answer), `endorsed` (you
said yes to Claude's recommendation), or `delegated` (you said "your call").
The spec lists delegated decisions separately, and the approver escalates when
a weighty one made it into the code. Use `--cold` if you don't want
recommendations at all.

**The spec cites everything.** Every statement in `spec.md` points at a `D#`
decision or `F#` repo fact. A fresh-context `spec-auditor` rejects anything
untraced: that is a decision nobody made, and it turns into a question.

**Agents can't decide for you mid-build.** The builder stops with
`STATUS: QUESTION` at an unmade decision. The `conformance` reviewer checks the
diff against your decisions and returns `VERDICT: DECIDE` when it finds a
silent one (a timeout, an error code, a column type). Both route back to you.

**Domain docs ship with the feature.** Glossary terms and ADRs agreed during
the grill are committed on the job branch.

## The board

`/smithy` opens a pane that Claude Code draws natively: docked beside the
transcript in the fullscreen terminal (inline otherwise), and in the desktop
and mobile apps. It refreshes every two seconds from the job folders.

`/smithy` opens in any git repository. Before `/smithy:init` it explains how to
set smithy up; after it, it shows the empty board and your backlog until the
first `/smithy:grill` starts a job, and it fills in by itself as jobs appear.

- **Board**: jobs that need you first, each with the one thing to do next;
  jobs in progress with a progress bar and review chips
  (`conf ✓ code ✗ sec … ux ✓ ui ✓`); merged jobs; the backlog. Digits `1`–`9`
  open a job.
- **Job**: the pipeline, the signature, the decision counts by provenance with
  every delegated decision named, each review round, open questions, the
  approver's decision, and every file in the job folder.
- **File**: any of those files, rendered as Markdown, right in the pane.
- **Sign / Reopen**: the buttons that make the spec yours (below).

When the pane is closed you still see the factory: in a repo where smithy is
set up, a **band above the prompt** carries an **Open board** button (`o`), the
quickest way back to the pane, and turns loud with the list of jobs whenever
one is waiting for you; the **status entry** under the prompt reads like
`⚒ smithy │ 2 need you: 004 ? decide · 002 ✍ sign │ 003 review r2 ✓✗…✓✓`, and a
**toast** plus a native notification fire the moment a job starts waiting for
you or merges, which matters when jobs run in several sessions.

## The signature, and what the mod enforces

The mod's hooks (`hooks/register.tsx`, `hooks/jobs.ts`) enforce the line
between your decisions and the agents' work:

- **Only you sign.** A job is signed by pressing **Sign the spec** and then
  **Yes, sign it** in the board, or by typing `/smithy sign <id>` (or
  `smithy sign <id>`) at the prompt yourself; a command run by anything but
  your Enter is refused. It signs only after a `VERDICT: CLEAN` audit that is
  newer than the spec, writing `SIGNED.json` with SHA-256 hashes of
  `decisions.md` and `spec.md`, your `git config user.name` and the time.
  **Reopen** removes it. Both are appended to `signatures.log`.
- **No agent writes a signature**, and while a job is signed, its
  `decisions.md` and `spec.md` are locked: Write/Edit calls are refused, for
  subagents too, and so are Bash commands that look like writes to them.
- **No builder starts on an unsigned or changed spec**: the hashes must match
  the files on disk.

This is a guardrail, not cryptography. It makes the honest path the easy one
and stops accidental or "helpful" edits; it does not defend against someone
determined to bypass it (the Bash check is a pattern match, for instance).

## Files

```
smithy/                           the plugin
  .claude-plugin/plugin.json      names the state contract (types/index.d.ts)
  .claude-plugin/marketplace.json
  hooks/hooks.json                { "modules": ["./register.tsx"] }
  hooks/register.tsx              the mod: pane, band, status, toasts, /smithy, guards
  hooks/jobs.ts                   reads jobs, seals, signs, judges tool calls
  hooks/register.test.tsx         20 engine tests (claude plugin test .)
  types/index.d.ts                the mod's $.state contract
  skills/grill/                   the interview, plus its reference files:
    ENGINEERING-TREE.md             branches that must be visited
    DECISIONS-FORMAT.md             decisions.md format
    SPEC-FORMAT.md                  spec.md format
    DOMAIN-DOCS.md                  glossary and ADR rules
  skills/{build,approve,rework,status,init}/
  agents/                         scout, spec-auditor, builder, approver,
                                  reviewer-{conformance,code,security,ux,ui}

<your repo>/smithy/               runtime state (jobs/ is gitignored)
  backlog.md   config.json
  jobs/<id>/   job.json decisions.md spec.md audit.md SIGNED.json signatures.log
               build.md round-N/review-*.md questions-K.md rework-K.md decision.md
<your repo>/../<repo>-smithy/<id>/ the job's worktree on branch smithy/<id>
```

`smithy/config.json`: `mainBranch`, `autoMerge` (set `false` to always merge by
hand), `maxResumes`, and `reviewers` (drop `ux` and `ui` for backend repos).

Like the original factory, nothing repo-specific lives in the plugin: every
agent reads setup, dev-server, test, build and lint commands from your
`AGENTS.md` or `CLAUDE.md`. Run several jobs at once by opening one Claude
session per job; every session's board shows all of them.

## Developing the mod

```bash
claude plugin validate ./smithy   # what the engine sees the module hook and call
claude plugin test ./smithy       # the engine tests, against an in-memory repo
claude --plugin-dir ./smithy      # run it; saving a file hot-reloads the module
```

The mod API is early access and moves between releases. When Claude Code
updates, re-run the two commands above first.
