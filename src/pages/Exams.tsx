import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate, useQuery } from '../router'
import { deleteExam, getState, markForgotten, recordReview, saveExam, saveTestResult, useStore } from '../store/store'
import { useLearnData } from '../store/derived'
import { avgSecondsPerCard, cardId, distractors, examPlanStatus, swissGrade } from '../lib/engine'
import { checkAnswer } from '../lib/answer'
import { uid } from '../lib/db'
import { Rating } from '../lib/fsrs'
import type { Direction, ExamPlan, TestResult, Word } from '../lib/types'
import { Badge, Button, Card, Empty, Field, Info, Input, ListPicker, Modal, PageHeader, Progress, SectionTitle, Segmented, Select, cx, toast, useConfirm } from '../components/ui'
import { IconCalendar, IconClock, IconExam, IconPlay, IconPlus, IconTrash, IconX } from '../components/icons'
import { sessionUrl } from './Session'
import { useKeys } from '../learn/exercises'

type Difficulty = TestResult['difficulty']

interface TestCfg {
  lists: string[]
  chapters: string[]
  n: number
  dir: Direction | 'mixed'
  minutes: number
  difficulty: Difficulty
}

function testUrl(c: TestCfg) {
  const q = new URLSearchParams({ n: String(c.n), dir: c.dir, min: String(c.minutes), lvl: c.difficulty })
  if (c.lists.length) q.set('lists', c.lists.join(','))
  if (c.chapters.length) q.set('ch', c.chapters.join('|'))
  return `/pruefungen/test?${q}`
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExamsPage() {
  const lists = useStore((s) => s.lists)
  const exams = useStore((s) => s.exams)
  const tests = useStore((s) => s.tests)
  const data = useLearnData()
  const [cfg, setCfg] = useState<TestCfg>({ lists: [], chapters: [], n: 20, dir: 'de-fr', minutes: 0, difficulty: 'mittel' })
  const [planEdit, setPlanEdit] = useState<ExamPlan | null>(null)
  const [showResult, setShowResult] = useState<TestResult | null>(null)
  const { ask, node } = useConfirm()
  const pool = useMemo(() => eligibleWordsIncludingKnown(data.words, cfg.lists, cfg.chapters), [data.words, cfg.lists, cfg.chapters])
  const chapters = useMemo(
    () => [...new Set([...data.words.values()].filter((w) => !cfg.lists.length || cfg.lists.includes(w.listId)).map((w) => w.chapter).filter(Boolean))] as string[],
    [data.words, cfg.lists],
  )
  const sec = avgSecondsPerCard(data.logs)
  const plans = exams.filter((e) => !e.archived).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <PageHeader title="Prüfungen" sub="Prüfung simulieren oder gezielt auf ein Prüfungsdatum hinlernen." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle
            title="Prüfungssimulation"
            sub={
              <>
                Test ohne Hilfen, Auswertung mit Note.{' '}
                <Info>Ergebnisse verändern deine Wiederholungsplanung nicht. Am Ende kannst du falsch beantwortete Wörter bewusst als «vergessen» markieren.</Info>
              </>
            }
          />
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">Listen</div>
              <ListPicker lists={lists} value={cfg.lists} onChange={(v) => setCfg({ ...cfg, lists: v, chapters: [] })} />
            </div>
            {chapters.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Nur bestimmte Lektionen</div>
                <ListPicker lists={chapters.map((c) => ({ id: c, name: c }))} value={cfg.chapters} onChange={(v) => setCfg({ ...cfg, chapters: v })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Fragen">
                <Select value={cfg.n} onChange={(e) => setCfg({ ...cfg, n: Number(e.target.value) })}>
                  {[10, 20, 30, 40, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Field label="Zeitlimit">
                <Select value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: Number(e.target.value) })}>
                  <option value={0}>keines</option>
                  {[5, 10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
                </Select>
              </Field>
              <Field label="Richtung">
                <Select value={cfg.dir} onChange={(e) => setCfg({ ...cfg, dir: e.target.value as TestCfg['dir'] })}>
                  <option value="de-fr">DE → FR</option>
                  <option value="fr-de">FR → DE</option>
                  <option value="mixed">gemischt</option>
                </Select>
              </Field>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1 text-sm font-medium">
                Schwierigkeit
                <Info>Leicht: Auswahl aus 4 Antworten. Mittel: Eintippen, kleine Tipp-/Akzentfehler geben halbe Punkte. Schwer: Eintippen, nur exakte Schreibweise inkl. Akzente und Artikel zählt.</Info>
              </div>
              <Segmented value={cfg.difficulty} onChange={(v) => setCfg({ ...cfg, difficulty: v })} options={[{ value: 'leicht', label: 'Leicht' }, { value: 'mittel', label: 'Mittel' }, { value: 'schwer', label: 'Schwer' }]} />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="primary" disabled={!pool.length} onClick={() => navigate(testUrl(cfg))}>
                <IconPlay size={17} /> Test starten
              </Button>
              <span className="text-sm text-muted">{pool.length} Wörter verfügbar</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle
            title="Prüfungsvorbereitung"
            sub="Lernplan bis zu einem Prüfungsdatum"
            action={
              <Button size="sm" onClick={() => setPlanEdit({ id: '', name: '', date: '', listIds: [], chapters: [], createdAt: Date.now() })} disabled={!lists.length}>
                <IconPlus size={16} /> Plan
              </Button>
            }
          />
          {plans.length === 0 ? (
            <Empty icon={<IconCalendar size={28} />} title="Kein Prüfungsplan">
              Lege ein Prüfungsdatum und die relevanten Listen fest. Die App verteilt neue Wörter auf die verbleibenden Tage und priorisiert schwache Wörter.
            </Empty>
          ) : (
            <div className="space-y-3">
              {plans.map((p) => {
                const st = examPlanStatus(p, data, Date.now(), sec)
                const past = p.date < today()
                return (
                  <div key={p.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-sm text-muted">
                          {new Date(p.date + 'T12:00').toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'long' })} ·{' '}
                          {past ? 'vorbei' : st.daysLeft === 0 ? 'heute' : `in ${st.daysLeft} ${st.daysLeft === 1 ? 'Tag' : 'Tagen'}`}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setPlanEdit(p)} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2">Bearbeiten</button>
                        <button onClick={async () => (await ask(`Plan «${p.name}» löschen? Der Lernfortschritt bleibt erhalten.`)) && deleteExam(p.id)} className="rounded-lg p-1.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label="Löschen">
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className="bg-good" style={{ width: `${(st.ready / Math.max(1, st.total)) * 100}%` }} />
                      <div className="bg-warn" style={{ width: `${(st.atRisk / Math.max(1, st.total)) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span><span className="text-good">●</span> {st.ready} sicher</span>
                      <span><span className="text-warn">●</span> {st.atRisk} gefährdet</span>
                      <span>○ {st.notStarted} noch nicht gelernt</span>
                      <Info>
                        Pro Karte (beide Richtungen) schätzt FSRS die Abrufwahrscheinlichkeit am Prüfungstag. «Sicher» = mindestens 90 %. Das ist eine Modellschätzung, keine Garantie.
                      </Info>
                    </div>
                    {!past && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                        <span className="text-sm">
                          Heute: <strong>{st.todayCards.length}</strong> Karten ({st.todayNew} neue Wörter) · ~{st.estMinutesToday} min
                        </span>
                        <Button size="sm" variant="primary" disabled={!st.todayCards.length} onClick={() => navigate(sessionUrl({ mode: 'cram', exam: p.id, n: 150 }))}>
                          Trainieren
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="text-xs leading-relaxed text-muted">
                <strong>Kurzfristig vs. langfristig:</strong> Vor einer Prüfung werden Wörter zusätzlich wiederholt, deren Abrufwahrscheinlichkeit am Prüfungstag unter 90 % läge. Diese frühen Wiederholungen bringen kurzfristig Sicherheit, aber nur wenig zusätzliche Langzeitstabilität – FSRS berücksichtigt das automatisch. Nach der Prüfung läuft die normale Langzeitplanung weiter.
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <SectionTitle title="Bisherige Tests" />
        {tests.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Prüfungssimulation.</p>
        ) : (
          <ul className="divide-y divide-line">
            {tests.slice(0, 30).map((t) => (
              <li key={t.id}>
                <button onClick={() => setShowResult(t)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-accent">
                  <div>
                    <div className="text-[15px]">{t.name}</div>
                    <div className="text-xs text-muted">
                      {new Date(t.ts).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })} · {t.total} Fragen · {t.difficulty}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cx('text-lg font-semibold tabular-nums', t.grade >= 4 ? 'text-good' : 'text-bad')}>{t.grade.toFixed(1)}</div>
                    <div className="text-xs text-muted tabular-nums">{Math.round(t.percent)} %</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!planEdit} onClose={() => setPlanEdit(null)} title={planEdit?.id ? 'Prüfungsplan bearbeiten' : 'Neuer Prüfungsplan'}>
        {planEdit && <PlanForm plan={planEdit} onClose={() => setPlanEdit(null)} />}
      </Modal>
      <Modal open={!!showResult} onClose={() => setShowResult(null)} title="Testergebnis" wide>
        {showResult && <ResultView r={showResult} />}
      </Modal>
      {node}
    </>
  )
}

function eligibleWordsIncludingKnown(words: Map<string, Word>, listIds: string[], chapters: string[]) {
  const ls = listIds.length ? new Set(listIds) : null
  const ch = chapters.length ? new Set(chapters) : null
  return [...words.values()].filter((w) => !w.excluded && w.fr && w.de && (!ls || ls.has(w.listId)) && (!ch || ch.has(w.chapter ?? '')))
}

function PlanForm({ plan, onClose }: { plan: ExamPlan; onClose: () => void }) {
  const lists = useStore((s) => s.lists)
  const words = useStore((s) => s.words)
  const [p, setP] = useState(plan)
  const chapters = useMemo(() => [...new Set([...words.values()].filter((w) => p.listIds.includes(w.listId)).map((w) => w.chapter).filter(Boolean))] as string[], [words, p.listIds])
  const valid = p.name.trim() && p.date >= today() && p.listIds.length
  return (
    <div className="space-y-4">
      <Field label="Name">
        <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="z. B. Französisch-Test Unité 3" autoFocus maxLength={120} />
      </Field>
      <Field label="Prüfungsdatum">
        <Input type="date" min={today()} value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} />
      </Field>
      <div>
        <div className="mb-2 text-sm font-medium">Prüfungsrelevante Listen</div>
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => {
            const on = p.listIds.includes(l.id)
            return (
              <button key={l.id} onClick={() => setP({ ...p, listIds: on ? p.listIds.filter((x) => x !== l.id) : [...p.listIds, l.id], chapters: [] })} className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}>
                {l.name}
              </button>
            )
          })}
        </div>
      </div>
      {chapters.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Nur bestimmte Lektionen (optional)</div>
          <ListPicker lists={chapters.map((c) => ({ id: c, name: c }))} value={p.chapters ?? []} onChange={(v) => setP({ ...p, chapters: v })} />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={async () => {
            await saveExam({ ...p, id: p.id || uid(), name: p.name.trim() })
            onClose()
          }}
        >
          Speichern
        </Button>
      </div>
    </div>
  )
}

function ResultView({ r, onDone }: { r: TestResult; onDone?: () => void }) {
  const [marked, setMarked] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-6">
        <div className={cx('flex h-20 w-20 flex-col items-center justify-center rounded-2xl', r.grade >= 4 ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
          <span className="text-3xl font-semibold tabular-nums">{r.grade.toFixed(1)}</span>
          <span className="text-[10px]">Note</span>
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{Math.round(r.percent)} %</div>
          <div className="text-sm text-muted">
            {r.correct} von {r.total} Punkten · {Math.round(r.durationMs / 60000)} min
          </div>
          <div className="mt-1 text-xs text-muted">Note nach Schweizer Skala: 5 × Anteil + 1 (6 = beste Note, 4 = genügend).</div>
        </div>
      </div>
      {r.mistakes.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-sm font-medium">Fehlerübersicht ({r.mistakes.length})</h3>
          <ul className="max-h-80 divide-y divide-line overflow-auto rounded-xl border border-line">
            {r.mistakes.map((m, i) => (
              <li key={i} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-3">
                <span className="text-muted">{m.prompt}</span>
                <span className="font-serif text-[16px] text-good">{m.expected}</span>
                <span className="text-bad">{m.given ? <span className="line-through">{m.given}</span> : '—'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => navigate(sessionUrl({ mode: 'typing', words: [...new Set(r.mistakes.map((m) => m.wordId))], scope: 'all', n: 200 }))}
            >
              Fehler jetzt üben
            </Button>
            <Button
              disabled={marked}
              onClick={async () => {
                const st = getState()
                const ids = r.mistakes.map((m) => cardId(m.wordId, r.direction === 'fr-de' ? 'fr-de' : 'de-fr')).filter((id) => st.cards.has(id))
                await markForgotten(ids)
                setMarked(true)
                toast('Falsche Wörter werden bald wiederholt.', 'good')
                onDone?.()
              }}
            >
              {marked ? 'In Lernplanung übernommen' : 'Falsche Wörter als «vergessen» markieren'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Testdurchlauf

interface Question {
  word: Word
  dir: Direction
  options?: Word[]
}

export function TestRunPage() {
  const q = useQuery()
  const [cfg] = useState(() => ({
    n: Number(q.get('n')) || 20,
    dir: (q.get('dir') as TestCfg['dir']) || 'de-fr',
    minutes: Number(q.get('min')) || 0,
    difficulty: (q.get('lvl') as Difficulty) || 'mittel',
    lists: (q.get('lists') ?? '').split(',').filter(Boolean),
    chapters: (q.get('ch') ?? '').split('|').filter(Boolean),
  }))
  const [questions] = useState<Question[]>(() => {
    const st = getState()
    const pool = eligibleWordsIncludingKnown(st.words, cfg.lists, cfg.chapters)
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, cfg.n)
    return picked.map((w, i) => {
      const dir: Direction = cfg.dir === 'mixed' ? (i % 2 ? 'fr-de' : 'de-fr') : cfg.dir
      const opts = cfg.difficulty === 'leicht' ? [w, ...distractors(w, pool, dir === 'fr-de' ? 'de' : 'fr')].sort(() => Math.random() - 0.5) : undefined
      return { word: w, dir, options: opts }
    })
  })
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [value, setValue] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [now, setNow] = useState(Date.now())
  const started = useRef(Date.now())
  const shown = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const deadline = cfg.minutes ? started.current + cfg.minutes * 60000 : 0

  useEffect(() => {
    if (!deadline || result) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [deadline, result])
  useEffect(() => {
    if (deadline && now >= deadline && !result) finish(answers)
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setValue('')
    inputRef.current?.focus()
    shown.current = Date.now()
  }, [i])

  const finish = async (ans: string[]) => {
    let points = 0
    const mistakes: TestResult['mistakes'] = []
    for (let k = 0; k < questions.length; k++) {
      const qq = questions[k]
      const given = ans[k] ?? ''
      const expected = qq.dir === 'fr-de' ? qq.word.de : qq.word.fr
      const prompt = qq.dir === 'fr-de' ? qq.word.fr : qq.word.de
      let pts = 0
      if (qq.options) pts = given === qq.word.id ? 1 : 0
      else {
        const r = checkAnswer(given, [expected], { strictness: cfg.difficulty === 'schwer' ? 'strict' : 'tolerant', lang: qq.dir === 'fr-de' ? 'de' : 'fr' })
        pts = r.verdict === 'correct' ? 1 : r.accepted ? 0.5 : 0
      }
      points += pts
      if (pts < 1) {
        const givenText = qq.options ? (qq.options.find((o) => o.id === given)?.[qq.dir === 'fr-de' ? 'de' : 'fr'] ?? '') : given
        mistakes.push({ wordId: qq.word.id, prompt, expected, given: givenText + (pts === 0.5 ? ' (½ Punkt)' : '') })
      }
    }
    const total = questions.length
    const res: TestResult = {
      id: uid(),
      ts: Date.now(),
      name: cfg.lists.length ? cfg.lists.map((id) => getState().lists.find((l) => l.id === id)?.name).filter(Boolean).join(', ') : 'Alle Listen',
      listIds: cfg.lists,
      direction: cfg.dir,
      difficulty: cfg.difficulty,
      total,
      correct: points,
      percent: total ? (points / total) * 100 : 0,
      grade: swissGrade(points, total),
      durationMs: Date.now() - started.current,
      mistakes,
    }
    setResult(res)
    await saveTestResult(res)
  }

  const answer = async (a: string) => {
    const qq = questions[i]
    const next = [...answers]
    next[i] = a
    setAnswers(next)
    // nur protokollieren – Wiederholungsplanung bleibt unverändert
    const ok = qq.options ? a === qq.word.id : checkAnswer(a, [qq.dir === 'fr-de' ? qq.word.de : qq.word.fr], { strictness: 'tolerant', lang: qq.dir === 'fr-de' ? 'de' : 'fr' }).accepted
    recordReview({ cardId: cardId(qq.word.id, qq.dir), rating: ok ? Rating.Good : Rating.Again, mode: 'exam', correct: ok, durationMs: Date.now() - shown.current, answer: a, scheduled: false })
    if (i + 1 >= questions.length) finish(next)
    else setI(i + 1)
  }

  useKeys((e) => {
    if (result) return
    const qq = questions[i]
    if (!qq) return
    if (qq.options && ['1', '2', '3', '4'].includes(e.key)) {
      const o = qq.options[Number(e.key) - 1]
      if (o) answer(o.id)
    } else if (!qq.options && e.key === 'Enter') {
      e.preventDefault()
      answer(value)
    }
  }, [i, value, result])

  if (!questions.length) return <div className="p-10"><Empty title="Keine Wörter für diesen Test" action={<Button onClick={() => navigate('/pruefungen')}>Zurück</Button>} /></div>

  const qq = questions[i]
  const left = deadline ? Math.max(0, deadline - now) : 0
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pt-4 sm:pt-6">
        <button onClick={() => navigate('/pruefungen')} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Test abbrechen"><IconX /></button>
        <div className="flex-1"><Progress value={result ? 1 : i / questions.length} tone="warn" /></div>
        <span className="text-sm text-muted tabular-nums">{Math.min(i + 1, questions.length)}/{questions.length}</span>
        {deadline > 0 && !result && (
          <span className={cx('inline-flex items-center gap-1 text-sm tabular-nums', left < 60000 ? 'text-bad' : 'text-muted')}>
            <IconClock size={15} /> {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}
          </span>
        )}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        {result ? (
          <Card className="animate-pop w-full max-w-2xl p-6 sm:p-8">
            <div className="mb-4 flex items-center gap-2"><IconExam className="text-accent" /> <h2 className="text-xl font-semibold">Auswertung</h2></div>
            <ResultView r={result} />
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => navigate('/pruefungen')}>Zu den Prüfungen</Button>
            </div>
          </Card>
        ) : (
          <div key={i} className="animate-fade w-full max-w-xl">
            <div className="mb-3 text-center text-xs font-medium tracking-wider text-faint uppercase">
              {qq.dir === 'fr-de' ? 'Übersetze ins Deutsche' : 'Übersetze ins Französische'} <Badge tone="warn" className="ml-1">Prüfung</Badge>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
              <h2 className={cx('leading-tight font-medium', qq.dir === 'fr-de' ? 'font-serif text-4xl' : 'text-3xl')}>{qq.dir === 'fr-de' ? qq.word.fr : qq.word.de}</h2>
              {!qq.options && (
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  lang={qq.dir === 'fr-de' ? 'de' : 'fr'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Antwort"
                  placeholder="Antwort …"
                  className="mt-6 h-14 w-full rounded-2xl border-2 border-line bg-bg px-4 text-center font-serif text-2xl outline-none focus:border-accent"
                />
              )}
            </div>
            {qq.options ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {qq.options.map((o, k) => (
                  <button key={o.id} onClick={() => answer(o.id)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left hover:border-accent">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-xs text-muted">{k + 1}</span>
                    {qq.dir === 'fr-de' ? o.de : <span className="font-serif text-lg">{o.fr}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="ghost" onClick={() => answer('')}>Überspringen</Button>
                <Button variant="primary" onClick={() => answer(value)}>Weiter</Button>
              </div>
            )}
            <p className="mt-4 text-center text-xs text-faint">Keine Hinweise – die Auflösung folgt am Ende.</p>
          </div>
        )}
      </main>
    </div>
  )
}

