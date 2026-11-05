import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { checkAnswer, hintFor, type CheckResult, type DiffPart } from '../lib/answer'
import { clozeFor, distractors } from '../lib/engine'
import { CardState, formatInterval, previewIntervals, Rating, type Rating as RatingT } from '../lib/fsrs'
import { speak, ttsAvailable } from '../lib/speech'
import type { Card, LearnMode, Settings, Word } from '../lib/types'
import { paramsFrom } from '../lib/engine'
import { Badge, Button, cx, Kbd } from '../components/ui'
import { IconCheck, IconLightbulb, IconSound, IconX } from '../components/icons'

export interface Answer {
  rating: RatingT
  correct: boolean
  hinted: boolean
  answer?: string
  /** Antwort als Alternative zum Wort speichern */
  addAlternative?: string
}

export interface ExerciseProps {
  word: Word
  card: Card
  mode: LearnMode
  settings: Settings
  pool: Word[]
  onAnswer: (a: Answer) => void
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

export function useKeys(handler: (e: KeyboardEvent) => void, deps: unknown[]) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const h = (e: KeyboardEvent) => ref.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function SpeakButton({ text, settings, className, label }: { text: string; settings: Settings; className?: string; label?: string }) {
  if (!ttsAvailable()) return null
  return (
    <button
      onClick={() => speak(text, { rate: settings.speechRate, voiceURI: settings.voiceURI })}
      className={cx('inline-flex items-center gap-1.5 rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-accent', className)}
      aria-label={label ?? 'Aussprache anhören'}
      title="Aussprache anhören"
    >
      <IconSound size={20} />
    </button>
  )
}

function WordMeta({ w }: { w: Word }) {
  const bits = [w.pos, w.gender === 'm' ? 'maskulin' : w.gender === 'f' ? 'feminin' : w.gender === 'm/f' ? 'm/f' : '', w.plural ? `Pl. ${w.plural}` : ''].filter(Boolean)
  if (!bits.length) return null
  return <div className="mt-2 text-sm text-muted">{bits.join(' · ')}</div>
}

function Example({ w, settings }: { w: Word; settings: Settings }) {
  if (!w.example) return null
  return (
    <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-left">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-serif text-[17px] leading-snug italic">{w.example}</p>
        <SpeakButton text={w.example} settings={settings} className="-m-1.5 p-1.5" />
      </div>
      {w.exampleDe && <p className="mt-1 text-sm text-muted">{w.exampleDe}</p>}
      {w.exampleSource === 'ai' && <Badge className="mt-2">KI-Satz</Badge>}
    </div>
  )
}

const Shell = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="animate-fade mx-auto w-full max-w-xl">
    <div className="mb-3 text-center text-xs font-medium tracking-wider text-faint uppercase">{label}</div>
    {children}
  </div>
)

// -------------------------------------------------------------- Neues Wort

export function IntroExercise({ word, settings, onAnswer }: ExerciseProps) {
  useEffect(() => {
    if (ttsAvailable()) speak(word.fr, { rate: settings.speechRate, voiceURI: settings.voiceURI })
  }, [word.id, word.fr, settings.speechRate, settings.voiceURI])
  const next = () => onAnswer({ rating: Rating.Good, correct: true, hinted: false })
  useKeys((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      next()
    }
  }, [word.id])
  return (
    <Shell label="Neues Wort">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2">
          <h2 className="font-serif text-4xl leading-tight font-medium sm:text-5xl">{word.fr}</h2>
          <SpeakButton text={word.fr} settings={settings} />
        </div>
        <WordMeta w={word} />
        <div className="mx-auto my-6 h-px w-16 bg-line" />
        <p className="text-xl">{word.de}</p>
        <Example w={word} settings={settings} />
      </div>
      <p className="mt-4 text-center text-sm text-muted">Präge dir das Wort ein – gleich wird es abgefragt.</p>
      <div className="mt-6 flex justify-center">
        <Button variant="primary" size="lg" onClick={next} autoFocus>
          Weiter <Kbd>Enter</Kbd>
        </Button>
      </div>
    </Shell>
  )
}

// -------------------------------------------------------------- Karteikarte

export function FlashcardExercise({ word, card, settings, onAnswer }: ExerciseProps) {
  const [flipped, setFlipped] = useState(false)
  useEffect(() => setFlipped(false), [card.id])
  const recog = card.direction === 'fr-de'
  const front = recog ? word.fr : word.de
  const now = useMemo(() => Date.now(), [card.id])
  const ivls = useMemo(() => previewIntervals(card, now, paramsFrom(settings)), [card, now, settings])
  const rate = (g: RatingT) => onAnswer({ rating: g, correct: g >= Rating.Hard, hinted: false })
  useKeys((e) => {
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      setFlipped(true)
      if (!recog && ttsAvailable()) speak(word.fr, { rate: settings.speechRate, voiceURI: settings.voiceURI })
    } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as RatingT)
    else if (flipped && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      rate(Rating.Good)
    }
  }, [card.id, flipped])
  useEffect(() => {
    if (recog && ttsAvailable()) speak(word.fr, { rate: settings.speechRate, voiceURI: settings.voiceURI })
  }, [card.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell label={recog ? 'Französisch → Deutsch' : 'Deutsch → Französisch'}>
      <div className="flip-scene">
        <div
          className={cx('flip-card relative grid min-h-[260px] cursor-pointer', flipped && 'is-flipped')}
          onClick={() => !flipped && setFlipped(true)}
          role="button"
          aria-label={flipped ? 'Rückseite' : 'Karte umdrehen'}
        >
          <div className="flip-face col-start-1 row-start-1 flex flex-col items-center justify-center rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
            <div className="flex items-center gap-2">
              <h2 className={cx('leading-tight font-medium', recog ? 'font-serif text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl')}>{front}</h2>
              {recog && <SpeakButton text={word.fr} settings={settings} />}
            </div>
            {!recog && word.pos && <div className="mt-2 text-sm text-muted">{word.pos}</div>}
            <p className="mt-8 text-sm text-faint">Tippen oder <Kbd>Leertaste</Kbd> zum Umdrehen</p>
          </div>
          <div className="flip-face flip-back col-start-1 row-start-1 flex flex-col items-center justify-center rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
            <div className="text-sm text-muted">{front}</div>
            <div className="mt-3 flex items-center gap-2">
              <h2 className={cx('leading-tight font-medium', !recog ? 'font-serif text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl')}>{recog ? word.de : word.fr}</h2>
              {!recog && <SpeakButton text={word.fr} settings={settings} />}
            </div>
            <WordMeta w={word} />
            <Example w={word} settings={settings} />
          </div>
        </div>
      </div>
      <div className={cx('mt-6 grid grid-cols-4 gap-2 transition-opacity', flipped ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        {(
          [
            [Rating.Again, 'Nochmals', 'text-bad'],
            [Rating.Hard, 'Schwer', 'text-warn'],
            [Rating.Good, 'Gut', 'text-good'],
            [Rating.Easy, 'Einfach', 'text-accent'],
          ] as const
        ).map(([g, label, color]) => (
          <button key={g} onClick={() => rate(g)} className="flex flex-col items-center rounded-2xl border border-line bg-surface py-3 transition hover:bg-surface-2 active:scale-[0.98]">
            <span className={cx('text-[15px] font-medium', color)}>{label}</span>
            <span className="mt-0.5 text-xs text-faint tabular-nums">
              {formatInterval(ivls[g - 1])} · <span className="hidden sm:inline">Taste </span>
              {g}
            </span>
          </button>
        ))}
      </div>
    </Shell>
  )
}

// -------------------------------------------------------------- Multiple Choice

export function ChoiceExercise({ word, card, pool, settings, onAnswer }: ExerciseProps) {
  const recog = card.direction === 'fr-de'
  const field = recog ? 'de' : 'fr'
  const options = useMemo(() => {
    const opts = [word, ...distractors(word, pool, field)]
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[opts[i], opts[j]] = [opts[j], opts[i]]
    }
    return opts
  }, [card.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => setPicked(null), [card.id])
  const correct = picked === word.id
  const finish = (id: string) => {
    const ok = id === word.id
    // MC ist nur Wiedererkennung: bei etablierten Karten zurückhaltend bewerten
    const rating = !ok ? Rating.Again : card.state === CardState.Review || !recog ? Rating.Hard : Rating.Good
    onAnswer({ rating, correct: ok, hinted: false, answer: ok ? undefined : options.find((o) => o.id === id)?.[field] })
  }
  const pick = (id: string) => {
    if (picked) return
    setPicked(id)
    if (recog || id === word.id) speak(word.fr, { rate: settings.speechRate, voiceURI: settings.voiceURI })
  }
  useKeys((e) => {
    if (!picked && ['1', '2', '3', '4'].includes(e.key)) {
      const o = options[Number(e.key) - 1]
      if (o) pick(o.id)
    } else if (picked && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      finish(picked)
    }
  }, [card.id, picked])

  return (
    <Shell label="Auswahl">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2">
          <h2 className={cx('leading-tight font-medium', recog ? 'font-serif text-4xl' : 'text-3xl')}>{recog ? word.fr : word.de}</h2>
          {recog && <SpeakButton text={word.fr} settings={settings} />}
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((o, i) => {
          const isRight = o.id === word.id
          const state = !picked ? 'idle' : isRight ? 'right' : picked === o.id ? 'wrong' : 'dim'
          return (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              disabled={!!picked}
              className={cx(
                'flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition',
                state === 'idle' && 'border-line bg-surface hover:border-accent hover:bg-accent-soft/40',
                state === 'right' && 'animate-pop border-good bg-good-soft',
                state === 'wrong' && 'animate-shake border-bad bg-bad-soft',
                state === 'dim' && 'border-line bg-surface opacity-50',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-xs text-muted">{i + 1}</span>
              <span className={cx('text-[16px]', !recog && 'font-serif text-[18px]')}>{o[field]}</span>
            </button>
          )
        })}
      </div>
      {picked && (
        <div className="animate-fade mt-5 flex flex-col items-center gap-3">
          <p className={cx('text-sm font-medium', correct ? 'text-good' : 'text-bad')}>
            {correct ? 'Richtig!' : `Richtig wäre: ${word[field]}`}
          </p>
          {!correct && <Example w={word} settings={settings} />}
          <Button variant="primary" onClick={() => finish(picked)} autoFocus>
            Weiter <Kbd>Enter</Kbd>
          </Button>
        </div>
      )}
    </Shell>
  )
}

// -------------------------------------------------------------- Texteingabe (auch Hören & Kontext)

const ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'û', 'ù', 'œ', '’']

export function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <span className="font-mono text-[15px]">
      {parts.map((p, i) => (
        <span
          key={i}
          className={cx(
            p.kind === 'missing' && 'rounded bg-good-soft text-good underline decoration-dotted',
            p.kind === 'extra' && 'rounded bg-bad-soft text-bad line-through',
            p.kind === 'changed' && 'rounded bg-warn-soft text-warn',
          )}
        >
          {p.text}
        </span>
      ))}
    </span>
  )
}

const VERDICT_LABEL: Record<CheckResult['verdict'], string> = {
  correct: 'Richtig',
  accent: 'Akzentfehler',
  typo: 'Tippfehler',
  'article-missing': 'Artikel fehlt',
  'article-wrong': 'Falscher Artikel',
  'base-form': 'Grundform',
  wrong: 'Falsch',
  empty: 'Nicht gewusst',
}

export function TypingExercise({ word, card, mode, settings, onAnswer }: ExerciseProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [hints, setHints] = useState(0)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [rating, setRating] = useState<RatingT>(Rating.Good)
  const [override, setOverride] = useState(false)
  const cloze = useMemo(() => (mode === 'context' ? clozeFor(word) : null), [word, mode])
  const listening = mode === 'listening'
  const solution = cloze ? cloze.answer : word.fr
  const hintSource = cloze ? cloze.answer : word.fr

  useEffect(() => {
    setValue('')
    setHints(0)
    setResult(null)
    setOverride(false)
    setTimeout(() => inputRef.current?.focus(), 30)
    if (listening) setTimeout(() => speak(word.fr, { rate: settings.speechRate, voiceURI: settings.voiceURI }), 250)
  }, [card.id, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (ch: string) => {
    const el = inputRef.current
    if (!el || result) return
    const s = el.selectionStart ?? value.length
    const e = el.selectionEnd ?? value.length
    const v = value.slice(0, s) + ch + value.slice(e)
    setValue(v)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + ch.length, s + ch.length)
    })
  }

  const check = (giveUp = false) => {
    if (result) return
    const r = checkAnswer(giveUp ? '' : value, [solution], {
      strictness: settings.strictness,
      lang: 'fr',
      baseForm: cloze ? cloze.baseForm : undefined,
    })
    let g = r.rating
    // Mit Hinweisen gelöst = nicht vollständig beherrscht
    const letters = hintSource.replace(/[^\p{L}]/gu, '').length || 1
    if (r.accepted && hints > 0) g = hints / letters >= 0.5 ? Rating.Again : Math.min(g, Rating.Hard) as RatingT
    setResult(r)
    setRating(g)
    inputRef.current?.blur()
    speak(listening || !cloze ? word.fr : (cloze.before + cloze.answer + cloze.after), { rate: settings.speechRate, voiceURI: settings.voiceURI })
  }

  const finalize = (g = rating, extra: Partial<Answer> = {}) => {
    if (!result) return
    const correct = override || (result.accepted && g >= Rating.Hard)
    onAnswer({ rating: g, correct, hinted: hints > 0, answer: value, ...extra })
  }

  useKeys((e) => {
    if (!result) {
      if (e.key === 'Enter') {
        e.preventDefault()
        check()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHints((h) => h + 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        check(true)
      } else if (listening && e.key === ' ' && e.ctrlKey) {
        e.preventDefault()
        speak(word.fr, { rate: settings.speechRate * 0.75, voiceURI: settings.voiceURI })
      }
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      finalize()
    } else if (result.accepted && ['2', '3', '4'].includes(e.key) && !isTyping(e)) {
      finalize(Number(e.key) as RatingT)
    }
  }, [card.id, result, value, hints, rating, override])

  const prompt = cloze ? (
    <div>
      <p className="font-serif text-2xl leading-relaxed sm:text-[28px]">
        {cloze.before}
        <span className={cx('mx-0.5 inline-block min-w-[4ch] border-b-2 px-1 align-baseline', result ? (result.accepted ? 'border-good text-good' : 'border-bad text-bad') : 'border-accent text-transparent')}>
          {result ? cloze.answer : '·'.repeat(Math.max(3, cloze.answer.length))}
        </span>
        {cloze.after}
      </p>
      <p className="mt-3 text-sm text-muted">
        Gesucht: <span className="text-ink">{word.de}</span>
        {cloze.baseForm.toLowerCase() !== cloze.answer.toLowerCase() && <span> · Grundform anpassen</span>}
      </p>
    </div>
  ) : listening ? (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => speak(word.fr, { rate: settings.speechRate, voiceURI: settings.voiceURI })}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent transition hover:scale-105"
        aria-label="Nochmals abspielen"
      >
        <IconSound size={34} />
      </button>
      <button className="text-sm text-muted underline-offset-4 hover:underline" onClick={() => speak(word.fr, { rate: settings.speechRate * 0.7, voiceURI: settings.voiceURI })}>
        Langsamer abspielen
      </button>
      {!ttsAvailable() && <p className="text-sm text-bad">Dein Browser unterstützt keine Sprachausgabe.</p>}
    </div>
  ) : (
    <div>
      <h2 className="text-3xl leading-tight font-medium sm:text-4xl">{word.de}</h2>
      {word.pos && <div className="mt-2 text-sm text-muted">{word.pos}</div>}
    </div>
  )

  return (
    <Shell label={cloze ? 'Lücke im Satz ergänzen' : listening ? 'Hören & schreiben' : 'Auf Französisch schreiben'}>
      <div className="rounded-3xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8">
        {prompt}
        <div className="mt-6">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={!!result}
            lang="fr"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder={hints ? hintFor(hintSource, hints) : 'Antwort eintippen …'}
            aria-label="Antwort"
            className={cx(
              'h-14 w-full rounded-2xl border-2 bg-bg px-4 text-center font-serif text-2xl transition outline-none',
              !result && 'border-line focus:border-accent',
              result && (result.accepted ? 'border-good' : 'animate-shake border-bad'),
            )}
          />
          {!result && (
            <div className="mt-3 flex flex-wrap justify-center gap-1">
              {ACCENTS.map((a) => (
                <button key={a} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(a)} className="h-9 w-9 rounded-lg border border-line bg-surface font-serif text-lg text-muted transition hover:border-accent hover:text-ink">
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {result && (
          <div className="animate-fade mt-6 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={result.verdict === 'correct' ? 'good' : result.accepted ? 'warn' : 'bad'}>
                {result.accepted ? <IconCheck size={13} /> : <IconX size={13} />}
                {VERDICT_LABEL[result.verdict]}
              </Badge>
              {hints > 0 && <Badge tone="warn">mit Hinweis</Badge>}
              {override && <Badge tone="good">als richtig gewertet</Badge>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-serif text-2xl">{listening || !cloze ? word.fr : cloze.answer}</span>
              <SpeakButton text={word.fr} settings={settings} />
            </div>
            {listening && <div className="text-muted">{word.de}</div>}
            {result.diff.length > 0 && value && (
              <div className="mt-2 text-sm text-muted">
                Deine Antwort im Vergleich: <Diff parts={result.diff} />
              </div>
            )}
            {result.verdict !== 'correct' && <p className="mt-2 text-sm text-muted">{result.explanation}</p>}
            {card.recentErrors.length >= 2 && !result.accepted && (
              <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                Wiederkehrender Fehler – zuletzt: {[...new Set(card.recentErrors.slice(-3))].map((x) => `«${x}»`).join(', ')}
              </p>
            )}
            {!cloze && <Example w={word} settings={settings} />}
          </div>
        )}
      </div>

      {!result ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button variant="ghost" onClick={() => setHints((h) => h + 1)}>
            <IconLightbulb size={17} /> Hinweis <Kbd>↑</Kbd>
          </Button>
          <Button variant="ghost" onClick={() => check(true)}>
            Weiss nicht <Kbd>Esc</Kbd>
          </Button>
          <Button variant="primary" onClick={() => check()}>
            Prüfen <Kbd>Enter</Kbd>
          </Button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-3">
          {result.accepted || override ? (
            <div className="flex flex-wrap justify-center gap-2">
              {([Rating.Hard, Rating.Good, Rating.Easy] as RatingT[]).map((g) => (
                <Button key={g} variant={g === rating ? 'primary' : 'secondary'} onClick={() => finalize(g)}>
                  {g === Rating.Hard ? 'Schwer' : g === Rating.Good ? 'Gut' : 'Einfach'} <Kbd>{g}</Kbd>
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => finalize()} autoFocus>
                Weiter <Kbd>Enter</Kbd>
              </Button>
              {value.trim() && !cloze && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOverride(true)
                      setRating(Rating.Good)
                    }}
                  >
                    Ich lag richtig
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onAnswer({ rating: Rating.Good, correct: true, hinted: false, answer: value, addAlternative: value.trim() })}>
                    Als Alternative speichern
                  </Button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-faint">
            {result.accepted || override ? 'Enter übernimmt die markierte Bewertung.' : 'Das Wort kommt in dieser Sitzung nochmals.'}
          </p>
        </div>
      )}
    </Shell>
  )
}
