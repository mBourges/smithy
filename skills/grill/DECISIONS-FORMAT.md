# decisions.md format

`decisions.md` is the source of truth for a job. The spec is compiled from it,
the conformance reviewer checks the code against it, and the engineer signs it.

```markdown
# Decisions: <short title>

> Feature: <the request, verbatim>
> Engineer: <git config user.name>

## Facts

F1. Rate limits today live in `src/http/limits.ts`, keyed by IP, in-memory. (scout)
F2. The test suite uses Vitest with request-level tests in `test/http/`. (scout)

## Decisions

### D1. Limit signups per email, not per IP
Signups are limited per normalised email address. IP limits stay as they are.
- Why: "Our abuse comes from one script rotating IPs, not from one IP."
- Provenance: engineer
- Branch: behaviour
- Round: 1

### D2. Reuse the existing limiter store
Use the store behind F1, extended with an email key.
- Provenance: endorsed
- Branch: interface
- Round: 2

### D7. Response body copy for the 429
- Provenance: delegated
- Branch: behaviour
- Round: 3
- Chose: "Too many attempts. Try again in a few minutes." (told the engineer in round 4)

### D3. ~~Lock out for 1 hour~~
- Superseded by D8
```

## Rules

- Numbers are never reused or renumbered. Superseded decisions stay, struck
  through, pointing at their replacement.
- One decision per entry. If an answer settles two things, write two entries.
- Write decisions in the glossary's terms.
- `Why` is optional, but when the engineer gives a reason, keep their words.
- `Round` is a grill round number, or `build question <k>` for decisions made
  after the builder or a reviewer asked.
- Facts are things that are true of the repo today, each with a source. They are
  not decisions; "the engineer agrees we should reuse X" is a decision citing a fact.
