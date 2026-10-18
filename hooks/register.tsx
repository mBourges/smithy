import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Job, View } from '../types'
import {
  NEEDS_YOU,
  PHASES,
  findJob,
  join,
  jobsDir,
  judge,
  loadBoard,
  nextStep,
  phaseOf,
  rank,
  reopen,
  repoRoot,
  sign,
} from './jobs'

const PANE = 'smithy'
const POLL_MS = 2000

const repoAtom = atom({ plugin: 'smithy', key: 'repo' } as const, null)
const boardAtom = atom({ plugin: 'smithy', key: 'board' } as const, null)
const viewAtom = atom({ plugin: 'smithy', key: 'view' } as const, { kind: 'board' } as View)
const armedAtom = atom({ plugin: 'smithy', key: 'armed' } as const, null)

// ------------------------------------------------------------------ text helpers

const LENS_SHORT: Record<string, string> = { conformance: 'conf', security: 'sec' }
const GLYPH: Record<string, [string, string]> = {
  PASS: ['✓', 'success'],
  CHANGES: ['✗', 'error'],
  DECIDE: ['?', 'warning'],
  pending: ['…', 'subtle'],
}
const STAGE: Record<string, [string, string]> = {
  'awaiting-signature': ['✍ awaiting your signature', 'warning'],
  'needs-decision': ['? needs your decision', 'warning'],
  'needs-human': ['⚑ needs your review', 'warning'],
  merged: ['merged', 'merged'],
}
const BAND_GLYPH: Record<string, string> = { 'awaiting-signature': '✍ sign', 'needs-decision': '? decide', 'needs-human': '⚑ review' }

const fit = (s: string, width: number): string => (s.length <= width ? s : `${s.slice(0, Math.max(1, width - 1))}…`)
const short = (job: Job): string => job.id.split('-')[0] ?? job.id
const needsYou = (job: Job): boolean => NEEDS_YOU.includes(job.stage)

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s >= 86400) return `${Math.floor(s / 86400)}d`
  if (s >= 3600) return `${Math.floor(s / 3600)}h`
  if (s >= 60) return `${Math.floor(s / 60)}m`
  return `${s}s`
}

function bar(job: Job): string {
  const { index, mark } = phaseOf(job)
  return PHASES.map((_, i) => (i <= index || mark === 'done' ? '▰' : '▱')).join('')
}

const chips = (verdicts: Record<string, string>): [string, string, string][] =>
  Object.entries(verdicts)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([lens, v]) => {
      const [glyph, color] = GLYPH[v] ?? ['!', 'error']
      return [LENS_SHORT[lens] ?? lens, glyph, color]
    })

const compactChips = (verdicts: Record<string, string>): string =>
  chips(verdicts).map(([, glyph]) => glyph).join('')

function provenance(job: Job): string {
  const d = job.decisions
  if (!d.live) return 'no decisions yet'
  return `${d.live} decision${d.live === 1 ? '' : 's'}: ${d.engineer} engineer · ${d.endorsed} endorsed · ${d.delegated} delegated`
}

function statusLine(board: Board | null): string | undefined {
  if (!board?.isSetUp || board.jobs.length === 0) return undefined
  const waiting = board.jobs.filter(needsYou)
  const active = board.jobs.filter(j => !needsYou(j) && j.stage !== 'merged')
  const parts = ['⚒ smithy']
  if (waiting.length) parts.push(`${waiting.length} need you: ${waiting.map(j => `${short(j)} ${BAND_GLYPH[j.stage]}`).join(' · ')}`)
  for (const j of active.slice(0, 3)) {
    if (j.stage === 'review' && Object.keys(j.reviews).length) parts.push(`${short(j)} review r${j.round} ${compactChips(j.reviews)}`)
    else if (j.stage === 'grill' || j.stage === 'audit') parts.push(`${short(j)} ${j.stage} ${j.decisions.live}D`)
    else parts.push(`${short(j)} ${j.stage}${j.round ? ` r${j.round}` : ''}`)
  }
  if (active.length > 3) parts.push(`+${active.length - 3}`)
  if (parts.length === 1) parts.push('idle')
  return parts.join(' │ ')
}

// ------------------------------------------------------------------ polling

/** The stages seen by this module, to raise a toast only on a change. Lost on reload by design. */
let seen: Map<string, string> | null = null
let lastJson = ''

const MESSAGES: Record<string, (job: Job) => string> = {
  'awaiting-signature': j => `${j.id} passed the spec audit and is waiting for your signature`,
  'needs-decision': j => `${j.id} stopped on a decision the spec doesn't make`,
  'needs-human': j => `${j.id} needs your review`,
  merged: j => `${j.id} merged`,
}

async function refresh($: EngineInterface, repo: string): Promise<void> {
  const board = await loadBoard($, repo)
  const body = JSON.stringify(board)
  if (body === lastJson) return
  lastJson = body
  await update($, boardAtom, () => board)
  $.ui.status(statusLine(board))

  const now = new Map(board.jobs.map(j => [j.id, j.stage]))
  if (seen !== null) {
    for (const job of board.jobs) {
      if (seen.get(job.id) === job.stage) continue
      const say = MESSAGES[job.stage]
      if (!say) continue
      $.ui.toast(say(job), { timeoutMs: 8000 })
      if (needsYou(job)) void $.ui.notify(say(job), { title: 'smithy' }).catch(() => undefined)
    }
  }
  seen = now
}

async function open($: EngineInterface, view?: View): Promise<void> {
  if (view) await update($, viewAtom, () => view)
  await $.ui.open({ id: PANE, title: 'smithy', focus: true })
}

// ------------------------------------------------------------------ register

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command
      .register({
        name: 'smithy',
        description: 'Open the smithy board: every job, what needs you, and each job’s files',
        argumentHint: '[job-id] | sign <job-id> | reopen <job-id>',
      })
      .catch(err => $.ui.log(`smithy: /smithy was not registered: ${String(err)}`, { to: 'debug' }))
    const repo = await repoRoot($, e.cwd)
    await update($, repoAtom, () => repo)
    if (repo) {
      await refresh($, repo)
      $.clock.every(POLL_MS, () => refresh($, repo))
    }
    return started
  })

  // /smithy, /smithy <job>, /smithy sign <job>, /smithy reopen <job>
  on('command.run', { command: 'smithy' }, async ($, e) => {
    const repo = await read($, repoAtom)
    if (!repo) return { text: 'This session is not in a git repository, so there is no smithy board here.' }
    const [verb = '', ref = ''] = e.args.trim().split(/\s+/)
    if (verb === 'sign' || verb === 'reopen') {
      if (e.origin.kind !== 'composer') return { text: `Only the engineer can ${verb} a spec, from the prompt or the board.` }
      if (!ref) return { text: `Which job? /smithy ${verb} <job-id>` }
      const outcome = verb === 'sign' ? await sign($, repo, ref) : await reopen($, repo, ref)
      await refresh($, repo)
      return { text: outcome.message }
    }
    const board = (await read($, boardAtom)) ?? (await loadBoard($, repo))
    await update($, boardAtom, () => board)
    const job = verb ? findJob(board, verb) : null
    await open($, job ? { kind: 'job', id: job.id } : { kind: 'board' })
    if (verb && !job) return { text: `No single job matches "${verb}"; opened the board.` }
    if (!board.isSetUp) return { text: 'Opened the board. smithy is not set up in this repo yet: run /smithy:init.' }
    return { text: job ? `Opened ${job.id} in the board.` : 'Opened the board.' }
  })

  // Typed as a plain message: `smithy sign 003`, `smithy reopen 003`. Only the person's own Enter counts:
  // a peer session, a channel, a scheduled trigger or a plugin submitting the same words is refused.
  on('prompt.submit', async ($, e, next) => {
    const m = /^\s*smithy\s+(sign|reopen)\s+(\S+)\s*$/i.exec(e.text)
    if (!m || e.command) return next(e)
    if (e.origin.kind !== 'composer' || e.isMeta) {
      return { drop: `smithy: only the engineer can ${(m[1] ?? '').toLowerCase()} a spec, by typing it at the prompt or pressing the button in /smithy.` }
    }
    const repo = await read($, repoAtom)
    if (!repo) return { drop: 'smithy: this session is not in a git repository.' }
    const verb = (m[1] ?? '').toLowerCase()
    const outcome = verb === 'sign' ? await sign($, repo, m[2] ?? '') : await reopen($, repo, m[2] ?? '')
    await refresh($, repo)
    if (!outcome.ok) return { drop: `smithy: ${outcome.message}` }
    return next({ ...e, context: [...(e.context ?? []), `[smithy] ${outcome.message} Acknowledge in one line.`] })
  }).catch(($, e, next) => (next.called ? next(e) : { drop: 'smithy: the sign/reopen check failed, so nothing was signed.' }))

  // The guards: signatures and signed specs are the engineer's.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Agent', 'Task'].includes(tool)) return next(e)
    const reason = await judge($, await read($, repoAtom), tool, e as unknown as Record<string, unknown>)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'smithy: its guard failed, so the call was refused. Try again.' }))

  // ---------------------------------------------------------------- the band above the prompt

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const board = await read($, boardAtom)
    const waiting = (board?.jobs ?? []).filter(needsYou)
    if (!waiting.length) return next(e)
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE && p.isPlaced)) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const summary = waiting.map(j => `${j.id} ${BAND_GLYPH[j.stage]}`).join(' · ')
    return (
      <Box flexDirection="row" gap={1}>
        <Text color="warning" bold>
          smithy
        </Text>
        <Text wrap="truncate-end">{fit(`${waiting.length} waiting for you: ${summary}`, Math.max(10, width - 24))}</Text>
        <Button key="open-board" label="Open board" hotkey="o" variant="primary" onPress={() => open($, { kind: 'board' })} />
      </Box>
    )
  })

  // ---------------------------------------------------------------- the pane

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns)
    const board = await read($, boardAtom)
    const view = await read($, viewAtom)
    const armed = await read($, armedAtom)
    const repo = await read($, repoAtom)
    const now = await $.clock.now()
    const go = (to: View) => () => update($, viewAtom, () => to)

    if (!board) {
      return (
        <Box flexDirection="column">
          <Text bold>⚒ smithy</Text>
          <Text color="subtle">{repo ? 'Reading the repository…' : 'This session is not in a git repository.'}</Text>
        </Box>
      )
    }

    // ------------------------------------------------------------ before /smithy:init
    if (!board.isSetUp) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>⚒ smithy · {board.name}</Text>
          <Text wrap="wrap">smithy isn’t set up in this repository yet.</Text>
          <Box flexDirection="column">
            <Text wrap="wrap">1. Run /smithy:init to create smithy/backlog.md and smithy/config.json.</Text>
            <Text wrap="wrap">2. Start a job with /smithy:grill &lt;feature&gt;.</Text>
          </Box>
          <Text color="subtle" wrap="wrap">
            The board fills in by itself once the first job appears.
          </Text>
        </Box>
      )
    }

    // ------------------------------------------------------------ one file
    if (view.kind === 'file') {
      const job = findJob(board, view.id)
      const body = repo && job ? await $.fs.read(join(jobsDir(repo), job.id, view.path)).catch(() => null) : null
      const isMarkdown = view.path.endsWith('.md')
      const text = body === null ? '_This file is gone._' : isMarkdown ? (body as string) : `\`\`\`json\n${body as string}\n\`\`\``
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1}>
            <Button key="back" label={`← ${view.id}`} hotkey="b" onPress={go({ kind: 'job', id: view.id })} />
            <Text bold>{fit(view.path, width - view.id.length - 10)}</Text>
          </Box>
          <Markdown key="file" text={text} />
        </Box>
      )
    }

    // ------------------------------------------------------------ one job
    if (view.kind === 'job') {
      const job = findJob(board, view.id)
      if (!job) {
        return (
          <Box flexDirection="column">
            <Button key="back" label="← Board" hotkey="b" onPress={go({ kind: 'board' })} />
            <Text color="subtle">{view.id} is gone.</Text>
          </Box>
        )
      }
      const [label, color] = STAGE[job.stage] ?? [job.stage, 'suggestion']
      const { index, mark } = phaseOf(job)
      const canSign = job.stage === 'awaiting-signature' && job.audit === 'VERDICT: CLEAN' && job.seal !== 'valid'
      const canReopen = job.seal !== 'unsigned' && ['signed', 'needs-decision', 'needs-human'].includes(job.stage)
      const isArmed = armed === job.id
      const signNow = async () => {
        if (!repo) return
        const outcome = await sign($, repo, job.id)
        await update($, armedAtom, () => null)
        await refresh($, repo)
        $.ui.toast(outcome.message, { timeoutMs: 6000 })
      }
      const reopenNow = async () => {
        if (!repo) return
        const outcome = await reopen($, repo, job.id)
        await refresh($, repo)
        $.ui.toast(outcome.message, { timeoutMs: 6000 })
      }
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Button key="back" label="← Board" hotkey="b" onPress={go({ kind: 'board' })} />
            <Box flexDirection="row" gap={1}>
              <Text bold>{job.id}</Text>
              <Text color={color} bold>
                {label}
              </Text>
            </Box>
            {job.feature ? <Text wrap="wrap">{job.feature}</Text> : null}
            <Text color="subtle" wrap="truncate-middle">
              {job.branch}
              {job.worktree ? ` · ${job.worktree}` : ''}
            </Text>
          </Box>

          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {PHASES.map((phase, i) => (
              <Text
                color={i < index || mark === 'done' ? 'success' : i === index ? (mark === 'stop' ? 'warning' : 'suggestion') : 'subtle'}
                bold={i === index}
              >
                {phase} {i < index || mark === 'done' ? '✓' : i === index ? (mark === 'stop' ? '⚑' : '●') : '·'}
              </Text>
            ))}
          </Box>

          <Box flexDirection="column">
            <Text color={job.seal === 'stale' ? 'error' : job.seal === 'valid' ? 'success' : 'subtle'}>
              {job.seal === 'unsigned'
                ? '✍ not signed'
                : `✍ signed by ${job.signedBy ?? '?'} · ${job.signedAt ?? ''}${job.seal === 'stale' ? ' · files changed since' : ''}`}
            </Text>
            <Text>◆ {provenance(job)}</Text>
            {job.decisions.delegatedTitles.map(t => (
              <Text color="warning"> delegated: {fit(t, width - 14)}</Text>
            ))}
            {job.cold ? <Text color="suggestion">❄ cold mode: no recommendations</Text> : null}
            {job.audit ? (
              <Text color={job.audit.includes('CLEAN') ? 'success' : 'error'}>⌕ audit {job.audit.replace('VERDICT: ', '')}</Text>
            ) : null}
            {job.build ? (
              <Text color={job.build.endsWith('READY') ? 'success' : job.build.endsWith('QUESTION') ? 'warning' : 'error'}>
                ⚙ build {job.build.replace('STATUS: ', '')}
              </Text>
            ) : null}
          </Box>

          {job.rounds.length ? (
            <Box flexDirection="column">
              <Text bold>Review rounds</Text>
              {job.rounds.map(r => (
                <Box flexDirection="row" columnGap={1} flexWrap="wrap">
                  <Text color="subtle">{r.name}</Text>
                  {chips(r.verdicts).map(([lens, glyph, c]) => (
                    <Text>
                      {lens} <Text color={c}>{glyph}</Text>
                    </Text>
                  ))}
                </Box>
              ))}
            </Box>
          ) : null}

          {job.decision ? (
            <Box flexDirection="column">
              <Text bold>
                Decision <Text color={job.decision === 'APPROVE' ? 'success' : 'warning'}>{job.decision}</Text>
              </Text>
              {job.decisionWhy ? <Text wrap="wrap">{job.decisionWhy}</Text> : null}
            </Box>
          ) : null}

          {job.stage === 'needs-decision' && job.questions ? (
            <Box flexDirection="column">
              <Text color="warning" bold>
                Open questions ({job.questions.file})
              </Text>
              {job.questions.items.map(q => (
                <Text wrap="wrap"> {q}</Text>
              ))}
            </Box>
          ) : null}

          <Box flexDirection="column">
            <Text bold>Files</Text>
            {job.files.map(path => (
              <Button key={`file:${path}`} plain onPress={go({ kind: 'file', id: job.id, path })}>
                {'  '}
                {path}
              </Button>
            ))}
          </Box>

          {canSign && !isArmed ? (
            <Button key="sign" label="Sign the spec" hotkey="s" variant="primary" onPress={() => update($, armedAtom, () => job.id)} />
          ) : null}
          {canSign && isArmed ? (
            <Box flexDirection="column">
              <Text color="warning" wrap="wrap">
                Sign {job.id}? This locks decisions.md and spec.md and lets agents build exactly what they say.
              </Text>
              <Box flexDirection="row" gap={1}>
                <Button key="confirm-sign" label="Yes, sign it" hotkey="y" variant="primary" onPress={signNow} />
                <Button key="cancel-sign" label="Cancel" hotkey="n" onPress={() => update($, armedAtom, () => null)} />
              </Box>
            </Box>
          ) : null}
          {canReopen ? <Button key="reopen" label="Reopen the spec" hotkey="r" onPress={reopenNow} /> : null}
          {nextStep(job) ? <Text color="suggestion">next → {nextStep(job)}</Text> : null}
        </Box>
      )
    }

    // ------------------------------------------------------------ the board
    const waiting = board.jobs.filter(needsYou)
    const active = board.jobs.filter(j => !needsYou(j) && j.stage !== 'merged')
    const done = board.jobs.filter(j => j.stage === 'merged')
    const ordered = [...waiting, ...active, ...done]
    const hotkey = (job: Job): string | undefined => {
      const i = ordered.indexOf(job)
      return i >= 0 && i < 9 ? String(i + 1) : undefined
    }
    const idWidth = Math.min(24, Math.max(...board.jobs.map(j => j.id.length), 8))
    const row = (job: Job, detail: string, color: string) => (
      <Button key={`job:${job.id}`} plain hotkey={hotkey(job)} onPress={go({ kind: 'job', id: job.id })}>
        {fit(job.id, idWidth).padEnd(idWidth + 1)}
        <Text color={color}>{fit(detail, Math.max(8, width - idWidth - 12))}</Text>
        <Text color="subtle"> {ago(job.updatedMs, now)}</Text>
      </Button>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold>⚒ smithy · {board.name}</Text>
          {waiting.length ? (
            <Text color="warning" bold>
              {waiting.length} need{waiting.length === 1 ? 's' : ''} you
            </Text>
          ) : null}
        </Box>

        {waiting.length ? (
          <Box flexDirection="column">
            <Text color="warning" bold>
              NEEDS YOU
            </Text>
            {waiting.map(job => (
              <Box flexDirection="column">
                {row(job, (STAGE[job.stage] ?? [job.stage])[0], 'warning')}
                <Text color="suggestion"> → {fit(nextStep(job), width - 6)}</Text>
              </Box>
            ))}
          </Box>
        ) : null}

        {active.length ? (
          <Box flexDirection="column">
            <Text color="suggestion" bold>
              IN PROGRESS
            </Text>
            {active.map(job => (
              <Box flexDirection="column">
                {row(job, `${bar(job)} ${PHASES[phaseOf(job).index]}${job.round ? ` r${job.round}` : ''}`, 'suggestion')}
                {job.stage === 'review' && Object.keys(job.reviews).length ? (
                  <Box flexDirection="row" columnGap={1} flexWrap="wrap">
                    <Text> </Text>
                    {chips(job.reviews).map(([lens, glyph, c]) => (
                      <Text>
                        {lens} <Text color={c}>{glyph}</Text>
                      </Text>
                    ))}
                  </Box>
                ) : null}
                {job.stage === 'grill' || job.stage === 'audit' ? <Text color="subtle"> {provenance(job)}</Text> : null}
              </Box>
            ))}
          </Box>
        ) : null}

        {done.length ? (
          <Box flexDirection="column">
            <Text color="merged" bold>
              DONE
            </Text>
            {done.slice(0, 6).map(job => row(job, 'merged', 'merged'))}
            {done.length > 6 ? <Text color="subtle"> … {done.length - 6} more</Text> : null}
          </Box>
        ) : null}

        {board.jobs.length === 0 ? <Text color="subtle">No jobs yet. Start one with /smithy:grill &lt;feature&gt;.</Text> : null}

        {board.backlog.length ? (
          <Box flexDirection="column">
            <Text color="subtle" bold>
              BACKLOG
            </Text>
            {board.backlog.slice(0, 5).map(item => (
              <Text color="subtle" wrap="truncate-end">
                {' '}○ {item}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    )
  })
}
