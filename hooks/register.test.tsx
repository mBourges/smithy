import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { sha256 } from './jobs'

// ------------------------------------------------------------------ an in-memory repository beneath the mod

const REPO = '/repo'
const J = `${REPO}/smithy/jobs`

type Repo = { files: Map<string, { text: string; mtimeMs: number }>; tick: () => number; ran: string[][] }

function fakeRepo(on: On, seed: Record<string, string>): Repo {
  let clock = 1_000
  const tick = () => (clock += 10)
  const files = new Map<string, { text: string; mtimeMs: number }>()
  for (const [path, text] of Object.entries(seed)) files.set(path, { text, mtimeMs: tick() })
  const ran: string[][] = []
  const isDir = (p: string) => [...files.keys()].some(f => f.startsWith(`${p.replace(/\/$/, '')}/`))

  const ok = <T,>(value: T) => ({ value })
  const run = (stdout: string, exitCode = 0) => ok({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    return f ? ok(f.text) : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, { text: e.text, mtimeMs: tick() })
    return ok(undefined)
  })
  on('fs.exists', ($, e) => ok(files.has(e.path) || isDir(e.path)))
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    if (f) return ok({ kind: 'file' as const, size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })
    if (isDir(e.path)) return ok({ kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })
    return { deny: `ENOENT: ${e.path}` }
  })
  on('fs.list', ($, e) => {
    const base = `${e.path.replace(/\/$/, '')}/`
    const seen = new Map<string, { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }>()
    for (const [path, f] of files) {
      if (!path.startsWith(base)) continue
      const [name = '', ...rest] = path.slice(base.length).split('/')
      if (rest.length) seen.set(name, { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
      else seen.set(name, { name, kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })
    }
    return seen.size || isDir(e.path) ? ok([...seen.values()]) : { deny: `ENOENT: ${e.path}` }
  })
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    if (argv[0] === 'git' && argv[1] === 'rev-parse') return run(`${REPO}/.git\n`)
    if (argv[0] === 'git' && argv[1] === 'config') return run('Ada Engineer\n')
    if (argv[0] === 'rm') {
      files.delete(argv[argv.length - 1] ?? '')
      return run('')
    }
    return run('', 1)
  })
  return { files, tick, ran }
}

const DECISIONS = `# Decisions: CSV export

### D1. Export per Customer
- Provenance: engineer

### D2. UTF-8 with BOM
- Provenance: endorsed

### D3. Column order
- Provenance: delegated

### D4. ~~Async export~~
- Superseded by D5

### D5. Sync export up to 10k rows
- Provenance: engineer
`

async function seed(): Promise<Record<string, string>> {
  const spec3 = '# Rate limit\n'
  const dec3 = '### D1. Per email\n- Provenance: engineer\n'
  return {
    [`${REPO}/smithy/backlog.md`]: '# Backlog\n\n- [ ] Passwordless login\n',
    [`${J}/002-csv-export/job.json`]: JSON.stringify({ id: '002-csv-export', feature: 'Export invoices as CSV', stage: 'awaiting-signature', round: 0 }),
    [`${J}/002-csv-export/decisions.md`]: DECISIONS,
    [`${J}/002-csv-export/spec.md`]: '# CSV export\n\nAC1. ...\n',
    // written last, so the audit is newer than the spec
    [`${J}/002-csv-export/audit.md`]: 'VERDICT: CLEAN\n\n## Findings\nNone.\n',
    [`${J}/003-rate-limit/job.json`]: JSON.stringify({ id: '003-rate-limit', feature: 'Rate limit signups', stage: 'review', round: 2, reviews: { conformance: 'PASS', code: 'CHANGES', security: 'pending', ux: 'PASS', ui: 'PASS' } }),
    [`${J}/003-rate-limit/decisions.md`]: dec3,
    [`${J}/003-rate-limit/spec.md`]: spec3,
    [`${J}/003-rate-limit/SIGNED.json`]: JSON.stringify({ signed_by: 'Ada Engineer', signed_at: '2026-10-18T09:00:00Z', files: { 'decisions.md': await sha256(dec3), 'spec.md': await sha256(spec3) } }),
    [`${J}/003-rate-limit/round-1/review-code.md`]: 'VERDICT: CHANGES\n',
    [`${J}/003-rate-limit/round-1/review-conformance.md`]: 'VERDICT: PASS\n',
    [`${J}/004-audit-log/job.json`]: JSON.stringify({ id: '004-audit-log', feature: 'Audit log', stage: 'needs-decision', round: 1 }),
    [`${J}/004-audit-log/build.md`]: 'STATUS: QUESTION\n',
    [`${J}/004-audit-log/questions-1.md`]: '# Questions\n\n### Q1 · Retention period · data\n',
  }
}

const PANE = (bodyColumns = 70) =>
  ({
    component: 'Pane',
    requestId: 'smithy',
    props: { title: 'smithy', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

const start = async ($: Engine, on: On) => {
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', ($, e) => (statuses.push(e.text), { value: undefined }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: false as const, reason: 'no-surface' as const } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.panes', () => ({ value: [] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', () => h('Box', {}) as never)
  on('tool.call', () => ({ result: 'ran' }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  const clock = mock.clock(on)
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
  return { statuses, toasts, clock }
}

// ------------------------------------------------------------------ tests

describe('board', () => {
  test('lists what needs the engineer first, with review chips and the backlog', async ($, on) => {
    fakeRepo(on, await seed())
    const { statuses } = await start($, on)
    expect(statuses.at(-1)).toMatch(/2 need you: 004 \? decide · 002 ✍ sign/)
    expect(statuses.at(-1)).toMatch(/003 review r2 ✓✗…✓✓/)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'smithy', surface, ...PANE() })
      expect(await ui.find({ text: /2 need/ })).toBeDefined()
      expect(await ui.find({ key: 'job:002-csv-export' })).toBeDefined()
      expect(await ui.find({ text: /awaiting your signature/ })).toBeDefined()
      expect(await ui.find({ text: /Passwordless login/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('opens a job, lists its decisions by provenance, and reads a file', async ($, on) => {
    fakeRepo(on, await seed())
    await start($, on)
    const ui = await $.ui.mount({ plugin: 'smithy', surface: 'terminal', ...PANE() })
    await ui.press({ key: 'job:002-csv-export' })
    expect(await ui.find({ text: /4 decisions: 2 engineer · 1 endorsed · 1 delegated/ })).toBeDefined()
    expect(await ui.find({ text: /delegated: D3 · Column order/ })).toBeDefined()
    expect(await ui.find({ key: 'sign' })).toBeDefined()
    await ui.press({ key: 'file:spec.md' })
    expect(await ui.find({ key: 'file' })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'job:003-rate-limit' })).toBeDefined()
  })

  test('draws on mobile, which has no Input or Select', async ($, on) => {
    fakeRepo(on, await seed())
    await start($, on)
    const ui = await $.ui.mount({ plugin: 'smithy', surface: 'mobile', ...PANE(40) })
    expect(await ui.find({ key: 'job:004-audit-log' })).toBeDefined()
  })
})

describe('signing', () => {
  test('takes two presses, writes the hashes and locks the spec', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    await start($, on)
    const ui = await $.ui.mount({ plugin: 'smithy', surface: 'terminal', ...PANE() })
    await ui.press({ key: 'job:002-csv-export' })
    await ui.press({ key: 'sign' })
    expect(repo.files.has(`${J}/002-csv-export/SIGNED.json`)).toBe(false)
    await ui.press({ key: 'confirm-sign' })

    const signed = JSON.parse(repo.files.get(`${J}/002-csv-export/SIGNED.json`)?.text ?? '{}')
    expect(signed.signed_by).toBe('Ada Engineer')
    expect(signed.files['spec.md']).toBe(await sha256('# CSV export\n\nAC1. ...\n'))
    expect(JSON.parse(repo.files.get(`${J}/002-csv-export/job.json`)?.text ?? '{}').stage).toBe('signed')
    expect(repo.files.get(`${J}/002-csv-export/signatures.log`)?.text).toMatch(/"event":"sign"/)

    const edit = await $.tool.call({ tool: 'Edit', file_path: `${J}/002-csv-export/spec.md`, old_string: 'a', new_string: 'b' } as never)
    expect(edit.deny).toMatch(/is signed, so spec.md is locked/)
  })

  test('refuses to sign before the audit is clean', async ($, on) => {
    const s = await seed()
    s[`${J}/002-csv-export/audit.md`] = 'VERDICT: GAPS\n'
    const repo = fakeRepo(on, s)
    await start($, on)
    const answer = await $.prompt.submit(typed('smithy sign 002'))
    expect(answer.drop).toMatch(/not CLEAN/)
    expect(repo.files.has(`${J}/002-csv-export/SIGNED.json`)).toBe(false)
  })

  test('a typed `smithy sign` signs and tells the model', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    await start($, on)
    const answer = await $.prompt.submit(typed('smithy sign 002'))
    expect(answer.context?.[0]).toMatch(/Ada Engineer signed 002-csv-export/)
    expect(repo.files.has(`${J}/002-csv-export/SIGNED.json`)).toBe(true)
  })

  test('another session typing the same words cannot sign', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    await start($, on)
    const answer = await $.prompt.submit({ text: 'smithy sign 002', wait: false, origin: { kind: 'peer' } } as never)
    expect(answer.drop).toMatch(/only the engineer/)
    expect(repo.files.has(`${J}/002-csv-export/SIGNED.json`)).toBe(false)
  })

  test('only the person at the prompt can sign through /smithy', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    await start($, on)
    const presentation = { isFullscreen: true, columns: 120 } as never
    const byPlugin = await $.command.run({ command: 'smithy', args: 'sign 002', origin: { kind: 'plugin', name: 'other' }, presentation } as never)
    expect(byPlugin.text).toMatch(/only the engineer/)
    expect(repo.files.has(`${J}/002-csv-export/SIGNED.json`)).toBe(false)
    const byPerson = await $.command.run({ command: 'smithy', args: 'sign 002', origin: { kind: 'composer' }, presentation } as never)
    expect(byPerson.text).toMatch(/signed 002-csv-export/)
  })

  test('reopen removes the signature and unlocks the spec', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    await start($, on)
    await $.prompt.submit(typed('smithy reopen 003'))
    expect(repo.files.has(`${J}/003-rate-limit/SIGNED.json`)).toBe(false)
    const edit = await $.tool.call({ tool: 'Edit', file_path: `${J}/003-rate-limit/spec.md`, old_string: 'a', new_string: 'b' } as never)
    expect(edit.deny).toBeUndefined()
  })
})

describe('guards', () => {
  test('no agent writes a signature, by tool or by shell', async ($, on) => {
    fakeRepo(on, await seed())
    await start($, on)
    const write = await $.tool.call({ tool: 'Write', file_path: `${J}/002-csv-export/SIGNED.json`, content: '{}' } as never)
    expect(write.deny).toMatch(/You cannot sign/)
    const bash = await $.tool.call({ tool: 'Bash', command: `echo '{}' > smithy/jobs/002-csv-export/SIGNED.json` } as never)
    expect(bash.deny).toMatch(/signature files/)
    const cat = await $.tool.call({ tool: 'Bash', command: 'cat smithy/jobs/003-rate-limit/SIGNED.json' } as never)
    expect(cat.deny).toBeUndefined()
  })

  test('a signed spec cannot be changed from the shell', async ($, on) => {
    fakeRepo(on, await seed())
    await start($, on)
    const bash = await $.tool.call({ tool: 'Bash', command: 'echo x >> smithy/jobs/003-rate-limit/decisions.md' } as never)
    expect(bash.deny).toMatch(/003-rate-limit is signed/)
    const unsigned = await $.tool.call({ tool: 'Bash', command: 'echo x >> smithy/jobs/002-csv-export/decisions.md' } as never)
    expect(unsigned.deny).toBeUndefined()
  })

  test('a builder starts only on a valid signature', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    await start($, on)
    const call = (id: string) =>
      $.tool.call({ tool: 'Agent', subagent_type: 'smithy:builder', description: 'build', prompt: `Job folder: ${J}/${id}/. Worktree: /w.` } as never)
    expect((await call('002-csv-export')).deny).toMatch(/is not signed/)
    expect((await call('003-rate-limit')).deny).toBeUndefined()
    // tamper behind the hooks' back: the hashes no longer match
    repo.files.set(`${J}/003-rate-limit/spec.md`, { text: '# changed\n', mtimeMs: repo.tick() })
    expect((await call('003-rate-limit')).deny).toMatch(/changed after it was signed/)
    const reviewer = await $.tool.call({ tool: 'Agent', subagent_type: 'smithy:reviewer-code', description: 'r', prompt: 'x' } as never)
    expect(reviewer.deny).toBeUndefined()
  })
})

describe('around the prompt', () => {
  test('the band shows what is waiting and opens the board', async ($, on) => {
    fakeRepo(on, await seed())
    await start($, on)
    const band = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} } } as const
    const ui = await $.ui.mount({ plugin: 'smithy', surface: 'terminal', ...band })
    expect(await ui.find({ text: /2 waiting for you/ })).toBeDefined()
    await ui.press({ key: 'open-board' })
  })

  test('a job that starts needing the engineer raises a toast on the next poll', async ($, on) => {
    const repo = fakeRepo(on, await seed())
    const { toasts, clock } = await start($, on)
    expect(toasts).toHaveLength(0)
    const job = `${J}/003-rate-limit/job.json`
    repo.files.set(job, { text: JSON.stringify({ id: '003-rate-limit', stage: 'needs-human', round: 2 }), mtimeMs: repo.tick() })
    await clock.advance(2000)
    expect(toasts.at(-1)).toMatch(/003-rate-limit needs your review/)
  })
})
