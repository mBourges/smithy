---
name: rework
description: "Send a smithy job back to the builder with the engineer's note, without changing the signed decisions. Use for /smithy:rework <job-id> <note>."
argument-hint: <job-id> <note>
disable-model-invocation: true
---

# Smithy: rework

Arguments: `$ARGUMENTS`

The first word is the job id; the rest is the engineer's note.

1. Find the job folder and read `job.json`. The stage must be `needs-human`.
2. Read the note against `decisions.md`. A rework fixes *how* the branch meets
   the signed spec. If the note changes *what* was decided (new behaviour, a
   different interface, a new limit), it is a decision change, not a rework:
   say which decision it touches, and ask the engineer to
   press **Reopen the spec** in `/smithy <job-id>` and run `/smithy:grill resume <job-id>` instead. Stop.
3. Otherwise write the note verbatim to `<job folder>/rework-<k>.md` (next
   unused `k`).
4. Run `/smithy:build <job-id>` from **Start or continue**, but prompt the fresh
   `smithy:builder` with
   `<paths> Rework: read rework-<k>.md and address it, then update build.md for round <N+1>. Port: <port>.`
   A rework gets a fresh `maxResumes`. Continue from **Build check**.
