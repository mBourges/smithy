import type { EngineInterface } from 'claude-code'

import type { Board, Decisions, Job, Round, Seal } from '../types'

type $ = EngineInterface

export const SEALED = ['decisions.md', 'spec.md'] as const
export const SIGNATURE = 'SIGNED.json'
export const LOG = 'signatures.log'
export const NEEDS_YOU = ['awaiting-signature', 'needs-decision', 'needs-human']
export const PHASES = ['grill', 'sign', 'build', 'review', 'approve', 'merge'] as const
export const LENSES = ['conformance', 'code', 'security', 'ux', 'ui']

// ------------------------------------------------------------------ paths

export const join = (...parts: string[]): string => parts.join('/').replace(/\/{2,}/g, '/')
export const dirname = (path: string): string => path.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'
export const basename = (path: string): string => path.replace(/\/+$/, '').split('/').pop() ?? path
export const jobsDir = (repo: string): string => join(repo, 'smithy', 'jobs')

/** The main checkout for a directory, even from one of its worktrees. */
export async function repoRoot($: $, cwd: string): Promise<string | null> {
  try {
    const ran = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd })
    return ran.exitCode === 0 && ran.stdout.trim() ? dirname(ran.stdout.trim()) : null
  } catch {
    return null
  }
}

export async function engineerName($: $, repo: string): Promise<string> {
  try {
    const ran = await $.process.run(['git', 'config', 'user.name'], { cwd: repo })
    return ran.stdout.trim() || 'engineer'
  } catch {
    return 'engineer'
  }
}

// ------------------------------------------------------------------ small readers

async function text($: $, path: string): Promise<string | null> {
  try {
    return (await $.fs.read(path)) as string
  } catch {
    return null
  }
}

const firstLine = (body: string | null): string | null => body?.split('\n', 1)[0]?.trim() || null

async function json<T>($: $, path: string): Promise<T | null> {
  const body = await text($, path)
  if (body === null) return null
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

const num = (name: string): number => Number(name.replace(/\D/g, '')) || 0

export async function sha256(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------------ parsers

export function parseDecisions(body: string): Decisions {
  const out: Decisions = { live: 0, superseded: 0, engineer: 0, endorsed: 0, delegated: 0, delegatedTitles: [] }
  for (const block of body.split(/^(?=### D\d+)/m).filter(b => b.startsWith('### D'))) {
    const head = block.split('\n', 1)[0] ?? ''
    if (head.includes('~~') || /Superseded by/.test(block)) {
      out.superseded += 1
      continue
    }
    out.live += 1
    const provenance = /Provenance:\s*(\w+)/.exec(block)?.[1]
    if (provenance === 'engineer' || provenance === 'endorsed' || provenance === 'delegated') out[provenance] += 1
    if (provenance === 'delegated') out.delegatedTitles.push(head.replace(/^###\s*/, '').replace(/\.\s*/, ' · '))
  }
  return out
}

export function parseQuestions(body: string): string[] {
  const headed = [...body.matchAll(/^#{2,3}\s*(Q\d+.*)$/gm)].map(m => (m[1] ?? '').trim())
  return headed.length ? headed : [...body.matchAll(/^❓\s*(.*)$/gm)].map(m => (m[1] ?? '').trim())
}

const VERDICT = /^(?:VERDICT:\s*)?(PASS|CHANGES|DECIDE)\b/

// ------------------------------------------------------------------ seal

type Signature = { job?: string; signed_by?: string; signed_at?: string; files?: Record<string, string> }

export async function digest($: $, job: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const name of SEALED) {
    const body = await text($, join(job, name))
    if (body !== null) out[name] = await sha256(body)
  }
  return out
}

export async function sealOf($: $, job: string): Promise<{ seal: Seal; signature: Signature | null }> {
  const signature = await json<Signature>($, join(job, SIGNATURE))
  if (!signature?.files) return { seal: 'unsigned', signature: null }
  const now = await digest($, job)
  const same = SEALED.every(n => signature.files?.[n] !== undefined && signature.files[n] === now[n])
  return { seal: same ? 'valid' : 'stale', signature }
}

// ------------------------------------------------------------------ board

async function loadJob($: $, folder: string): Promise<Job | null> {
  const data = await json<Record<string, unknown>>($, join(folder, 'job.json'))
  if (!data) return null
  const id = basename(folder)
  const entries = await $.fs.list(folder).catch(() => [])
  const names = new Set(entries.map(e => e.name))
  let updatedMs = Math.max(0, ...entries.map(e => e.mtimeMs))

  const rounds: Round[] = []
  const roundFiles: string[] = []
  for (const dir of entries.filter(e => e.kind === 'dir' && /^round-\d+$/.test(e.name)).sort((a, b) => num(a.name) - num(b.name))) {
    const inside = (await $.fs.list(join(folder, dir.name)).catch(() => [])).filter(e => e.kind === 'file')
    updatedMs = Math.max(updatedMs, ...inside.map(e => e.mtimeMs))
    const verdicts: Record<string, string> = {}
    const reviews = inside.filter(e => /^review-.+\.md$/.test(e.name))
    reviews.sort((a, b) => rank(lensOf(a.name)) - rank(lensOf(b.name)))
    for (const file of reviews) {
      const verdict = VERDICT.exec(firstLine(await text($, join(folder, dir.name, file.name))) ?? '')?.[1]
      verdicts[lensOf(file.name)] = verdict ?? '?'
    }
    rounds.push({ name: dir.name, verdicts })
    roundFiles.push(...inside.map(e => `${dir.name}/${e.name}`).sort())
  }

  const { seal, signature } = await sealOf($, folder)
  const decisionsBody = await text($, join(folder, 'decisions.md'))
  const questionFile = [...names].filter(n => /^questions-\d+\.md$/.test(n)).sort((a, b) => num(b) - num(a))[0]
  const decisionBody = await text($, join(folder, 'decision.md'))
  const why = decisionBody ? /## Why\s*\n([\s\S]+?)(\n#|$)/.exec(decisionBody)?.[1]?.trim() ?? null : null

  const order = ['job.json', 'decisions.md', 'spec.md', 'audit.md', SIGNATURE, LOG, 'build.md']
  const top = order.filter(n => names.has(n))
  const rest = [...names].filter(n => n.endsWith('.md') && !order.includes(n) && n !== 'decision.md').sort()
  const files = [...top, ...rest, ...roundFiles, ...(names.has('decision.md') ? ['decision.md'] : [])]

  return {
    id,
    feature: String(data.feature ?? ''),
    stage: String(data.stage ?? 'grill'),
    round: Number(data.round ?? 0) || 0,
    branch: String(data.branch ?? `smithy/${id}`),
    worktree: String(data.worktree ?? ''),
    cold: data.cold === true,
    reviews: (data.reviews as Record<string, string> | undefined) ?? {},
    seal,
    signedBy: signature?.signed_by ?? null,
    signedAt: signature?.signed_at ?? null,
    decisions: parseDecisions(decisionsBody ?? ''),
    audit: firstLine(await text($, join(folder, 'audit.md'))),
    build: firstLine(await text($, join(folder, 'build.md'))),
    decision: firstLine(decisionBody),
    decisionWhy: why,
    rounds,
    questions: questionFile
      ? { file: questionFile, items: parseQuestions((await text($, join(folder, questionFile))) ?? '') }
      : null,
    files,
    updatedMs,
  }
}

const lensOf = (file: string): string => file.replace(/^review-/, '').replace(/\.md$/, '')
export const rank = (lens: string): number => (LENSES.includes(lens) ? LENSES.indexOf(lens) : LENSES.length)

export async function loadBoard($: $, repo: string): Promise<Board | null> {
  const dir = jobsDir(repo)
  if (!(await $.fs.exists(dir).catch(() => false))) return null
  const entries = await $.fs.list(dir).catch(() => [])
  const jobs: Job[] = []
  for (const entry of entries.filter(e => e.kind === 'dir')) {
    const job = await loadJob($, join(dir, entry.name))
    if (job) jobs.push(job)
  }
  jobs.sort((a, b) => b.id.localeCompare(a.id))
  const backlog = ((await text($, join(repo, 'smithy', 'backlog.md'))) ?? '')
    .split('\n')
    .filter(line => line.startsWith('- [ ] '))
    .map(line => line.slice(6))
  return { repo, name: basename(repo), jobs, backlog }
}

export function findJob(board: Board | null, ref: string): Job | null {
  const clean = basename(ref.trim())
  const hits = (board?.jobs ?? []).filter(j => j.id === clean || j.id.startsWith(`${clean}-`))
  return hits.length === 1 ? (hits[0] ?? null) : null
}

// ------------------------------------------------------------------ what the engineer should do next

export function nextStep(job: Job): string {
  const short = job.id.split('-')[0] ?? job.id
  switch (job.stage) {
    case 'awaiting-signature':
      return 'read spec.md, then sign it here'
    case 'needs-decision':
      return `reopen, then /smithy:grill resume ${short}`
    case 'needs-human':
      return `/smithy:approve ${short} or /smithy:rework ${short} <note>`
    case 'signed':
      return `/smithy:build ${short}`
    case 'grill':
      return `/smithy:grill resume ${short}`
    default:
      return ''
  }
}

export function phaseOf(job: Job): { index: number; mark: 'now' | 'stop' | 'done' } {
  const at: Record<string, number> = { grill: 0, audit: 0, 'awaiting-signature': 1, signed: 1, build: 2, review: 3, approve: 4 }
  if (job.stage === 'merged') return { index: 5, mark: 'done' }
  if (job.stage in at) return { index: at[job.stage] ?? 0, mark: 'now' }
  if (job.stage === 'needs-decision') return { index: job.build === 'STATUS: QUESTION' || !job.round ? 2 : 3, mark: 'stop' }
  if (job.stage === 'needs-human') return { index: job.decision ? 4 : 2, mark: 'stop' }
  return { index: 0, mark: 'now' }
}

// ------------------------------------------------------------------ the engineer's acts

export type Outcome = { ok: boolean; message: string }

async function writeJobStage($: $, job: string, stage: string): Promise<void> {
  const data = (await json<Record<string, unknown>>($, join(job, 'job.json'))) ?? { id: basename(job) }
  await $.fs.write(join(job, 'job.json'), `${JSON.stringify({ ...data, stage }, null, 2)}\n`)
}

async function appendLog($: $, job: string, entry: Record<string, unknown>): Promise<void> {
  const before = (await text($, join(job, LOG))) ?? ''
  await $.fs.write(join(job, LOG), `${before}${JSON.stringify(entry)}\n`)
}

/** Signs a job's spec. Only ever called from the engineer's own press or prompt. */
export async function sign($: $, repo: string, ref: string): Promise<Outcome> {
  const board = await loadBoard($, repo)
  const found = findJob(board, ref)
  if (!found) return { ok: false, message: `no single job matches "${ref}"` }
  const job = join(jobsDir(repo), found.id)
  for (const name of SEALED) {
    if (!(await $.fs.exists(join(job, name)))) return { ok: false, message: `${found.id} has no ${name} yet; finish the grill first` }
  }
  if (found.audit !== 'VERDICT: CLEAN') {
    return { ok: false, message: `${found.id}: the spec audit is missing or not CLEAN, so it can't be signed yet` }
  }
  const audited = (await $.fs.stat(join(job, 'audit.md'))).mtimeMs
  for (const name of SEALED) {
    if ((await $.fs.stat(join(job, name))).mtimeMs > audited) {
      return { ok: false, message: `${found.id}: ${name} changed after the last audit; ask Claude to re-run the spec audit` }
    }
  }
  const record = {
    job: found.id,
    signed_by: await engineerName($, repo),
    signed_at: new Date(await $.clock.now()).toISOString(),
    files: await digest($, job),
  }
  await $.fs.write(join(job, SIGNATURE), `${JSON.stringify(record, null, 2)}\n`)
  await appendLog($, job, { event: 'sign', ...record })
  await writeJobStage($, job, 'signed')
  return { ok: true, message: `${record.signed_by} signed ${found.id}. decisions.md and spec.md are locked.` }
}

export async function reopen($: $, repo: string, ref: string): Promise<Outcome> {
  const board = await loadBoard($, repo)
  const found = findJob(board, ref)
  if (!found) return { ok: false, message: `no single job matches "${ref}"` }
  const job = join(jobsDir(repo), found.id)
  const previous = await json<Signature>($, join(job, SIGNATURE))
  if (!previous?.files) return { ok: true, message: `${found.id} was not signed; its decisions are already editable.` }
  const removed = await $.process.run(['rm', '-f', join(job, SIGNATURE)]).catch(() => null)
  if (!removed || removed.exitCode !== 0) {
    // No delete on $.fs: an emptied signature counts as unsigned.
    await $.fs.write(join(job, SIGNATURE), `${JSON.stringify({ reopened: true })}\n`)
  }
  await appendLog($, job, { event: 'reopen', job: found.id, by: await engineerName($, repo), at: new Date(await $.clock.now()).toISOString(), previous })
  await writeJobStage($, job, 'grill')
  return { ok: true, message: `${found.id} reopened. Its decisions can change; it must be audited and signed again before it builds.` }
}

// ------------------------------------------------------------------ guards

const JOB_FILE = /(^|\/)smithy\/jobs\/([^/]+)\/([^/]+)$/
const WRITEISH = /(>|\btee\b|\bsed\s+-i|\bperl\s+-i|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bdd\b|\bpython3?\b|\bnode\b|\bbun\b|\bgit\s+(checkout|restore)\b)/
const isSealed = (name: string): boolean => (SEALED as readonly string[]).includes(name)
const isProtected = (name: string): boolean => name === SIGNATURE || name === LOG

/**
 * What smithy refuses about one tool call, or null to let it through.
 * The engineer's signature is theirs: no agent writes it, and a signed spec
 * stays as signed until the engineer reopens it.
 */
export async function judge($: $, repo: string | null, tool: string, input: Record<string, unknown>): Promise<string | null> {
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const path = String(input.file_path ?? input.notebook_path ?? '')
    const m = JOB_FILE.exec(path)
    if (!m) return null
    const [, , id = '', name = ''] = m
    if (isProtected(name)) {
      return `smithy: ${name} is written only when the engineer signs ${id} in the smithy board (or types /smithy sign ${id}). You cannot sign or edit a signature.`
    }
    if (isSealed(name) && (await sealOf($, dirname(path))).seal !== 'unsigned') {
      return `smithy: ${id} is signed, so ${name} is locked. Decisions belong to the engineer: ask them to reopen ${id} in the smithy board if the spec must change.`
    }
    return null
  }

  if (tool === 'Bash') {
    const command = String(input.command ?? '')
    if (!WRITEISH.test(command)) return null
    if (command.includes(SIGNATURE) || command.includes(LOG)) {
      return 'smithy: signature files are written only when the engineer signs in the smithy board. Read them with a plain `cat` if you need to.'
    }
    if (!command.includes('smithy/jobs') || !SEALED.some(n => command.includes(n)) || !repo) return null
    for (const m of command.matchAll(/smithy\/jobs\/([^/\s'"]+)\//g)) {
      const job = join(jobsDir(repo), m[1] ?? '')
      if ((await sealOf($, job)).seal !== 'unsigned') {
        return `smithy: ${m[1]} is signed; its decisions.md and spec.md are locked. Ask the engineer to reopen it in the smithy board.`
      }
    }
    return null
  }

  if (tool === 'Agent' || tool === 'Task') {
    const kind = String(input.subagent_type ?? '').split(':').pop()
    if (kind !== 'builder') return null
    const folder = /Job folder:\s*(\S+?)\.?(\s|$)/.exec(String(input.prompt ?? ''))?.[1]
    if (!folder) return "smithy: a builder prompt must start with 'Job folder: <path>.' so the signature can be checked."
    const { seal } = await sealOf($, folder.replace(/\/+$/, ''))
    const id = basename(folder)
    if (seal === 'unsigned') return `smithy: ${id} is not signed. Agents only build specs the engineer has signed in the smithy board.`
    if (seal === 'stale') return `smithy: decisions.md or spec.md of ${id} changed after it was signed. The engineer must reopen, re-audit and sign it again.`
    return null
  }

  return null
}
