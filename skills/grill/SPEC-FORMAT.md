# spec.md format

The spec is a compiled view of `decisions.md` for the builder and reviewers.
Compiling it is transcription, not authoring. Every statement ends with the
`[D#]` or `[F#]` it comes from; the spec auditor rejects anything untraced.

```markdown
# <short title>

> Feature: <verbatim>
> Compiled from decisions.md. Every statement cites the engineer's decision or a repo fact.

## Problem
<one paragraph> [D1]

## Behaviour
1. <what happens> [D3]
2. <edge case and what happens> [D4, D5]

## Interfaces
- <boundary: name and shape> [D6]

## Data
- <what is stored, shape, migration> [D9]   (or "No data changes. [D10]")

## Failure handling
- <failure → what the user sees / what is logged> [D11]

## Security
## Performance
## Observability
## Rollout
(same pattern; a branch the engineer marked N/A reads "Not applicable. [D#]")

## Acceptance criteria
AC1. <observable behaviour>. Verify: <command to run, page and what it shows, or file and its content>. [D14]
AC2. ...

## Test plan
<which seams, which existing tests are prior art> [D15, F2]

## Out of scope
- <explicit no> [D16]

## Delegated decisions
The engineer handed these to Claude. Builder and reviewers treat them like any
other decision; they are listed here so the engineer saw them before signing.
- D7: 429 body copy, chose "Too many attempts. Try again in a few minutes."

## Facts relied on
- F1: <fact> (`path`)
```

## Rules

- No file paths or code in Behaviour/Interfaces/Data unless a decision states
  them; describe modules and shapes. Facts may cite paths.
- Each acceptance criterion must be checkable by someone with only the repo.
  If a decision only says "it should be fast", that is a gap, not a criterion.
- Superseded decisions never appear.
- Keep the engineer's words where they are precise. Don't make them sound
  grander, and don't soften "must" into "should".
