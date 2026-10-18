# The engineering tree

The grill is not done until every branch below is visited: it has at least one
decision, or the engineer has said it does not apply (recorded as a decision,
for example `D9. No feature flag; ships directly.`). These are the root
branches; each sprouts its own sub-questions as answers come in. Skip nothing
silently. Order is a suggestion: ask whatever is on the frontier.

| Branch          | What it settles                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `problem`       | The problem, from the user's side. Who has it. What changes for them when it is solved.                     |
| `domain`        | The terms this feature introduces or touches, and what each means. Conflicts with `GLOSSARY.md`.             |
| `behaviour`     | The happy path, step by step, and every edge case the engineer cares about: empty, duplicate, concurrent, huge, partial. |
| `interface`     | Every boundary the change crosses: public functions other modules call, HTTP/RPC shapes, events, CLI flags, UI entry points. Names and shapes, not file paths. |
| `data`          | What is stored, where, its shape, its lifetime, and how existing data gets there (migration, backfill, none). |
| `failure`       | What can fail, what the user sees when it does, what is retried, what is logged, what must never happen.    |
| `security`      | Who may do this, how that is checked, what input is untrusted, what must not leak, abuse limits.             |
| `performance`   | Expected volume and any limit that matters (latency, size, rate). "Nothing special" is a valid answer.       |
| `observability` | How the engineer will know in production that it works or is broken.                                         |
| `rollout`       | Flag or no flag, backwards compatibility, ordering of deploys, how to undo it.                               |
| `testing`       | The seams to test at (prefer existing seams, as high as possible, as few as possible) and the acceptance criteria: each one an observable behaviour plus how to check it. The engineer decides what "done" means. |
| `scope`         | The explicit no's: what a helpful builder might add that must not be added.                                   |

## Good questions sound like

- "When two requests for the same Order arrive within the same second, should
  the second one fail, wait, or be merged?"
- "F4 shows the existing `retry()` helper backs off exponentially up to 5 tries.
  Reuse it as is, or does this path need different limits?"
- "You said 'account'. The glossary has **Customer** (who pays) and **User**
  (who signs in). Which one owns this setting?"
- "If this migration runs on 40M rows, is a table lock acceptable, or must it
  be online?"

## Questions that are not yours to ask

- Anything a scout can look up: "Which ORM do you use?", "Where is the router?"
- Pure implementation detail: private helper names, loop structure, how a
  function is split internally.
