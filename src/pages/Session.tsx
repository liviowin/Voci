import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate, useQuery } from '../router'
import { getState, recordReview, undoReview, updateWords, useStore, type UndoToken } from '../store/store'
import {
  buildSmartQueue,
  cardId,
  chooseMode,
  clozeFor,
  currentR,
  dayStart,
  difficultyScore,
  eligibleWords,
  examPlanStatus,
  avgSecondsPerCard,
  isDue,
  newCard,
  requeuePosition,
  type QueueItem,
} from '../lib/engine'
import { CardState } from '../lib/fsrs'
import { ttsAvailable } from '../lib/speech'
import type { Direction, LearnMode } from '../lib/types'
import { Button, Card, Kbd, Progress, cx } from '../components/ui'
import { IconArrowLeft, IconCheck, IconUndo, IconX } from '../components/icons'
import { ChoiceExercise, FlashcardExercise, IntroExercise, TypingExercise, useKeys, type Answer } from '../learn/exercises'
import { Ring } from '../components/charts'

export interface SessionConfig {
  mode: LearnMode
  lists: string[]
  dir: Direction | 'mixed'
  scope: 'due' | 'all' | 'weak' | 'new'
  n: number
  exam?: string
  words?: string[]
}

export function sessionUrl(c: Partial<SessionConfig>): string {
  const q = new URLSearchParams()
  q.set('mode', c.mode ?? 'smart')
  if (c.lists?.length) q.set('lists', c.lists.join(','))
  if (c.dir) q.set('dir', c.dir)
  if (c.scope) q.set('scope', c.scope)
  if (c.n) q.set('n', String(c.n))
  if (c.exam) q.set('exam', c.exam)
  if (c.words?.length) q.set('words', c.words.join(','))
  return `/sitzung?${q}`
}

function readConfig(q: URLSearchParams): SessionConfig {
  return {
    mode: (q.get('mode') as LearnMode) || 'smart',
    lists: (q.get('lists') ?? '').split(',').filter(Boolean),
    dir: (q.get('dir') as SessionConfig['dir']) || 'mixed',
    scope: (q.get('scope') as SessionConfig['scope']) || 'due',
    n: Math.max(1, Math.min(500, Number(q.get('n')) || 20)),
    exam: q.get('exam') ?? undefined,
    words: (q.get('words') ?? '').split(',').filter(Boolean),
  }
}

const MODE_TITLE: Record<string, string> = {
  smart: 'Intelligentes Lernen',
  flashcard: 'Karteikarten',
  typing: 'Aktive Texteingabe',
  choice: 'Multiple Choice',
  listening: 'Hören & Schreiben',
  context: 'Lernen im Kontext',
  cram: 'Prüfungstraining',
}

/** Warteschlange für feste Lernmodi (B–F) */
function buildFixedQueue(cfg: SessionConfig, now: number): QueueItem[] {
  const st = getState()
  const data = { words: st.words, cards: st.cards, logs: st.logs }
  let words = eligibleWords(data, cfg.lists)
  if (cfg.words?.length) {
    const ids = new Set(cfg.words)
    words = [...st.words.values()].filter((w) => ids.has(w.id) && w.fr && w.de)
  }
  if (cfg.mode === 'context') words = words.filter((w) => clozeFor(w))
  const dirs: Direction[] =
    cfg.mode === 'typing' || cfg.mode === 'listening' || cfg.mode === 'context' ? ['de-fr'] : cfg.dir === 'mixed' ? ['fr-de', 'de-fr'] : [cfg.dir]
  let cards = words.flatMap((w) => dirs.map((d) => st.cards.get(cardId(w.id, d)) ?? newCard(w.id, d, now)))
  if (cfg.dir === 'mixed' && dirs.length === 2) {
    // pro Wort nur eine Richtung, zufällig
    const seen = new Set<string>()
    cards = cards.sort(() => Math.random() - 0.5).filter((c) => !seen.has(c.wordId) && seen.add(c.wordId))
  }
  if (cfg.scope === 'due') cards = cards.filter((c) => isDue(c, now)).sort((a, b) => currentR(a, now) - currentR(b, now))
  else if (cfg.scope === 'new') cards = cards.filter((c) => c.state === CardState.New)
  else if (cfg.scope === 'weak') cards = cards.filter((c) => c.state !== CardState.New).sort((a, b) => difficultyScore(b) - difficultyScore(a))
  else cards = cards.sort(() => Math.random() - 0.5)
  cards = cards.slice(0, cfg.n)
  if (cfg.scope !== 'all') cards = cards.sort(() => Math.random() - 0.5)
  return cards.map((c) => ({ cardId: c.id, mode: cfg.mode, isNew: c.state === CardState.New }))
}

function buildCramQueue(cfg: SessionConfig, now: number): QueueItem[] {
  const st = getState()
  const plan = st.exams.find((e) => e.id === cfg.exam)
  if (!plan) return []
  const data = { words: st.words, cards: st.cards, logs: st.logs }
  const status = examPlanStatus(plan, data, now, avgSecondsPerCard(st.logs))
  return status.todayCards.slice(0, cfg.n || 60).map((c) => ({
    cardId: c.id,
    isNew: c.state === CardState.New,
    mode: chooseMode(c, st.words.get(c.wordId)!, st.settings, { ttsAvailable: ttsAvailable(), poolSize: st.words.size }, Math.random),
  }))
}

interface Done {
  cardId: string
  correct: boolean
  answer?: string
}

export default function Session() {
  const q = useQuery()
  const cfg = useMemo(() => readConfig(q), []) // eslint-disable-line react-hooks/exhaustive-deps
  const settings = useStore((s) => s.settings)
  const words = useStore((s) => s.words)
  const cards = useStore((s) => s.cards)
  const logs = useStore((s) => s.logs)

  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const now = Date.now()
    const st = getState()
    if (cfg.mode === 'smart') return buildSmartQueue({ words: st.words, cards: st.cards, logs: st.logs }, st.settings, now, { listIds: cfg.lists, ttsAvailable: ttsAvailable() })
    if (cfg.mode === 'cram') return buildCramQueue(cfg, now)
    return buildFixedQueue(cfg, now)
  })
  const [initial] = useState(queue.length)
  const [done, setDone] = useState<Done[]>([])
  const [history, setHistory] = useState<{ queue: QueueItem[]; token: UndoToken | null; done: Done[] }[]>([])
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(Date.now())
  const startedAt = useRef(Date.now())

  const item = queue[0]
  const word = item ? words.get(item.cardId.split(':')[0]) : undefined
  const card = item ? cards.get(item.cardId) ?? newCard(item.cardId.split(':')[0], item.cardId.split(':')[1] as Direction, Date.now()) : undefined
  const pool = useMemo(() => [...words.values()].filter((w) => !w.excluded && w.fr && w.de), [words])

  const onAnswer = async (a: Answer) => {
    if (!item || !card || busy) return
    setBusy(true)
    const rest = queue.slice(1)
    const duration = Date.now() - shownAt.current
    try {
      if (item.mode === 'intro') {
        // Erst einprägen, dann aktiv abrufen (Lernen → Testen)
        const test: QueueItem = { cardId: item.cardId, mode: pool.length >= 4 ? 'choice' : 'flashcard', isNew: true }
        const pos = Math.min(rest.length, 3)
        setHistory((h) => [...h, { queue, token: null, done }])
        setQueue([...rest.slice(0, pos), test, ...rest.slice(pos)])
        return
      }
      if (a.addAlternative && word) await updateWords([word.id], { fr: `${word.fr}, ${a.addAlternative}` })
      const { card: next, undo } = await recordReview({
        cardId: item.cardId,
        rating: a.rating,
        mode: item.mode,
        correct: a.correct,
        hinted: a.hinted,
        durationMs: duration,
        answer: a.answer,
      })
      const pos = requeuePosition(next, Date.now(), rest.length)
      let nq = rest
      if (pos != null || (!a.correct && cfg.mode !== 'smart')) {
        const fixed = cfg.mode !== 'smart' && cfg.mode !== 'cram'
        const mode: LearnMode = fixed
          ? item.mode
          : next.direction === 'fr-de'
            ? next.stability < 2 && pool.length >= 4
              ? 'choice'
              : 'flashcard'
            : 'typing'
        const at = pos ?? Math.min(rest.length, 4)
        nq = [...rest.slice(0, at), { cardId: item.cardId, mode, isNew: false }, ...rest.slice(at)]
      }
      setHistory((h) => [...h, { queue, token: undo, done }])
      setDone((d) => [...d, { cardId: item.cardId, correct: a.correct, answer: a.answer }])
      setQueue(nq)
    } finally {
      shownAt.current = Date.now()
      setBusy(false)
    }
  }

  const undo = async () => {
    const last = history[history.length - 1]
    if (!last) return
    if (last.token) await undoReview(last.token)
    setQueue(last.queue)
    setDone(last.done)
    setHistory((h) => h.slice(0, -1))
  }

  useKeys((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement && e.target.value)) {
      e.preventDefault()
      undo()
    }
  }, [history])

  const correctCount = done.filter((d) => d.correct).length
  const total = done.length + queue.length
  const progress = total ? done.length / total : 1

  // Tagesziel
  const today = dayStart(Date.now())
  const todayLogs = logs.filter((l) => l.ts >= today)
  const goalValue = settings.goalType === 'minutes' ? todayLogs.reduce((s, l) => s + l.durationMs, 0) / 60000 : todayLogs.length
  const goal = settings.goalType === 'minutes' ? settings.goalMinutes : settings.goalWords

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pt-4 sm:pt-6">
        <button onClick={() => navigate(cfg.mode === 'cram' ? '/pruefungen' : cfg.mode === 'smart' ? '/lernen' : '/modi')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Sitzung beenden">
          <IconX />
        </button>
        <div className="flex-1">
          <Progress value={progress} />
        </div>
        <div className="min-w-[4.5rem] text-right text-sm text-muted tabular-nums">
          {done.length}/{total}
        </div>
        <button onClick={undo} disabled={!history.length} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Letzte Antwort rückgängig" title="Rückgängig (Strg+Z)">
          <IconUndo />
        </button>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 pt-1 text-xs text-faint">{MODE_TITLE[cfg.mode] ?? ''}</div>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-10">
        {item && word && card ? (
          <div key={`${item.cardId}-${item.mode}-${done.length}`} className="w-full">
            {item.mode === 'intro' ? (
              <IntroExercise word={word} card={card} mode={item.mode} settings={settings} pool={pool} onAnswer={onAnswer} />
            ) : item.mode === 'flashcard' ? (
              <FlashcardExercise word={word} card={card} mode={item.mode} settings={settings} pool={pool} onAnswer={onAnswer} />
            ) : item.mode === 'choice' ? (
              <ChoiceExercise word={word} card={card} mode={item.mode} settings={settings} pool={pool} onAnswer={onAnswer} />
            ) : (
              <TypingExercise word={word} card={card} mode={item.mode} settings={settings} pool={pool} onAnswer={onAnswer} />
            )}
          </div>
        ) : item && !word ? (
          <Skip onSkip={() => setQueue((q) => q.slice(1))} />
        ) : (
          <Summary
            initial={initial}
            done={done}
            correct={correctCount}
            minutes={(Date.now() - startedAt.current) / 60000}
            goalValue={goalValue}
            goal={goal}
            goalType={settings.goalType}
            mode={cfg.mode}
            words={words}
          />
        )}
      </main>

      {item && (
        <footer className="hidden pb-5 text-center text-xs text-faint sm:block">
          <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span><Kbd>Enter</Kbd> prüfen / weiter</span>
            <span><Kbd>1</Kbd>–<Kbd>4</Kbd> bewerten / wählen</span>
            <span><Kbd>↑</Kbd> Hinweis</span>
            <span><Kbd>Strg</Kbd>+<Kbd>Z</Kbd> rückgängig</span>
          </span>
        </footer>
      )}
    </div>
  )
}

function Skip({ onSkip }: { onSkip: () => void }) {
  // Wort wurde inzwischen gelöscht → überspringen
  useEffect(() => {
    onSkip()
  }, [onSkip])
  return null
}

function Summary({
  initial,
  done,
  correct,
  minutes,
  goalValue,
  goal,
  goalType,
  mode,
  words,
}: {
  initial: number
  done: Done[]
  correct: number
  minutes: number
  goalValue: number
  goal: number
  goalType: 'minutes' | 'words'
  mode: LearnMode
  words: Map<string, import('../lib/types').Word>
}) {
  const mistakes = [...new Map(done.filter((d) => !d.correct).map((d) => [d.cardId, d])).values()]
  if (initial === 0)
    return (
      <Card className="animate-pop w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-good">
          <IconCheck size={28} />
        </div>
        <h2 className="text-xl font-semibold">Nichts zu tun</h2>
        <p className="mt-2 text-muted">
          {mode === 'smart'
            ? 'Für heute ist alles erledigt. Morgen sind neue Wiederholungen fällig – Pausen gehören zum Lernen (Spacing-Effekt).'
            : 'Für diese Auswahl gibt es keine passenden Wörter. Wähle andere Listen oder «alle Wörter».'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/')}>
            <IconArrowLeft size={16} /> Dashboard
          </Button>
          <Button variant="primary" onClick={() => navigate('/modi')}>
            Frei üben
          </Button>
        </div>
      </Card>
    )
  const rate = done.length ? correct / done.length : 0
  return (
    <Card className="animate-pop w-full max-w-lg p-6 sm:p-8">
      <div className="flex items-center gap-5">
        <Ring value={goal ? goalValue / goal : 1}>
          <span className="text-lg font-semibold tabular-nums">{Math.round(goalValue)}</span>
          <span className="text-[10px] text-muted">/ {goal} {goalType === 'minutes' ? 'min' : 'Abfr.'}</span>
        </Ring>
        <div>
          <h2 className="text-xl font-semibold">Sitzung beendet</h2>
          <p className="mt-1 text-sm text-muted">
            {done.length} Abfragen · {Math.round(rate * 100)} % richtig · {Math.max(1, Math.round(minutes))} min
          </p>
          <p className="mt-1 text-sm text-muted">{goalValue >= goal ? 'Tagesziel erreicht.' : 'Tagesziel noch nicht erreicht.'}</p>
        </div>
      </div>
      {mistakes.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium">Fehler dieser Sitzung</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {mistakes.slice(0, 12).map((m) => {
              const w = words.get(m.cardId.split(':')[0])
              if (!w) return null
              return (
                <li key={m.cardId} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-serif text-[16px]">{w.fr}</span>
                  <span className="text-right text-muted">
                    {w.de}
                    {m.answer && <span className={cx('ml-2 text-bad line-through')}>{m.answer}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Falsche Wörter werden automatisch bald wieder abgefragt.</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button onClick={() => navigate('/')}>Dashboard</Button>
        <Button variant="primary" onClick={() => location.reload()}>
          Weiterlernen
        </Button>
      </div>
    </Card>
  )
}

