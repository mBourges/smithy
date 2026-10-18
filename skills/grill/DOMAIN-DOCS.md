# Domain docs during the grill

Adapted from Matt Pocock's `domain-modeling` skill (MIT,
github.com/mattpocock/skills). Write these in the job's **worktree**, so they
are committed on the job branch and land with the feature.

## GLOSSARY.md

One `GLOSSARY.md` at the repo root, unless a `GLOSSARY-MAP.md` points to
per-context glossaries. Create it lazily, when the first term is resolved.

```markdown
# <Context name>

<One or two sentences on what this context is.>

## Language

**Signup Attempt**:
One submission of the signup form, successful or not.
_Avoid_: registration, signup request
```

- Be opinionated: one term per concept, alternatives under `_Avoid_`.
- One or two sentences. Define what it is, not how it is implemented.
- Only terms specific to this domain. No general programming concepts.
- When the engineer uses a word that clashes with the glossary, stop and ask
  which they mean before recording anything that depends on it.
- Commit glossary changes on the job branch with a one-line message, staging the
  file explicitly.

## ADRs

`docs/adr/NNNN-slug.md`, numbered after the highest existing one. Offer one
only when all three hold:

1. Hard to reverse.
2. Surprising without context: a future reader would wonder why.
3. The result of a real trade-off with genuine alternatives.

An ADR can be one paragraph: the context, the decision, and why. Show the
engineer the text and write it only when they approve it; record the ADR's
decision in `decisions.md` too, citing the ADR file. Commit it on the job branch.
