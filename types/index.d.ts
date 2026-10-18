export type Stage =
  | 'grill'
  | 'audit'
  | 'awaiting-signature'
  | 'signed'
  | 'build'
  | 'review'
  | 'approve'
  | 'needs-decision'
  | 'needs-human'
  | 'merged'

/** Whether the engineer's signature still matches decisions.md and spec.md. */
export type Seal = 'unsigned' | 'valid' | 'stale'

export type Decisions = {
  live: number
  superseded: number
  engineer: number
  endorsed: number
  delegated: number
  /** "D7 · 429 body copy", for each live delegated decision. */
  delegatedTitles: string[]
}

export type Round = { name: string; verdicts: Record<string, string> }

export type Job = {
  id: string
  feature: string
  stage: string
  round: number
  branch: string
  worktree: string
  cold: boolean
  reviews: Record<string, string>
  seal: Seal
  signedBy: string | null
  signedAt: string | null
  decisions: Decisions
  /** First lines: "VERDICT: CLEAN", "STATUS: READY", "APPROVE". */
  audit: string | null
  build: string | null
  decision: string | null
  decisionWhy: string | null
  rounds: Round[]
  questions: { file: string; items: string[] } | null
  /** Paths relative to the job folder, in reading order. */
  files: string[]
  updatedMs: number
}

export type Board = {
  repo: string
  name: string
  jobs: Job[]
  backlog: string[]
}

export type View =
  | { kind: 'board' }
  | { kind: 'job'; id: string }
  | { kind: 'file'; id: string; path: string }

declare module 'claude-code' {
  interface PluginState {
    smithy: {
      /** The main checkout, or null outside a git repo. */
      repo: string | null
      /** The latest snapshot of smithy/jobs, or null when the repo has none. */
      board: Board | null
      view: View
      /** The job whose Sign button was pressed once and awaits the confirming press. */
      armed: string | null
    }
  }
}
