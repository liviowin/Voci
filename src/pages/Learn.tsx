import { useMemo, useState } from 'react'
import { navigate } from '../router'
import { useStore } from '../store/store'
import { STAGES, stageLabelShort, useLearnData, useStats } from '../store/derived'
import { overview, eligibleWords, clozeFor } from '../lib/engine'
import { Button, Card, Info, ListPicker, PageHeader, SectionTitle, Segmented, Select, Field, cx } from '../components/ui'
import { Legend, StackBar } from '../components/charts'
import { IconBrain, IconCards, IconHeadphones, IconKeyboard, IconPlay, IconQuote, IconTarget } from '../components/icons'
import { sessionUrl, type SessionConfig } from './Session'
import type { LearnMode } from '../lib/types'

export function LearnPage() {
  const data = useLearnData()
  const settings = useStore((s) => s.settings)
  const lists = useStore((s) => s.lists)
  const [sel, setSel] = useState<string[]>([])
  const ov = useMemo(() => overview(data, settings, Date.now(), sel), [data, settings, sel])
  const s = useStats()
  const newCount = Math.min(ov.remainingNew, ov.newRecognition.length)
  const prodCount = Math.min(ov.remainingNewProd, ov.newProduction.length)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const w of data.words.values()) if (!w.excluded) c[w.listId] = (c[w.listId] ?? 0) + 1
    return c
  }, [data.words])

  return (
    <>
      <PageHeader title="Jetzt lernen" sub="Die App stellt deine Lerneinheit automatisch zusammen – auf Basis deines bisherigen Lernverhaltens." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <SectionTitle title="Heutige Lerneinheit" />
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-2xl font-semibold tabular-nums">{ov.due.length}</div>
              <div className="text-xs text-muted">fällig zur Wiederholung</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-2xl font-semibold text-accent tabular-nums">{newCount}</div>
              <div className="text-xs text-muted">neue Wörter (FR → DE)</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-2xl font-semibold text-accent tabular-nums">{prodCount}</div>
              <div className="text-xs text-muted">neu aktiv (DE → FR)</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-sm font-medium">Listen</div>
            <ListPicker lists={lists} value={sel} onChange={setSel} counts={counts} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" disabled={!ov.due.length && !newCount && !prodCount} onClick={() => navigate(sessionUrl({ mode: 'smart', lists: sel }))}>
              <IconPlay size={18} /> Lerneinheit starten
            </Button>
            {!ov.due.length && !newCount && !prodCount && <span className="text-sm text-muted">Für heute ist alles erledigt.</span>}
          </div>
        </Card>
        <Card className="p-6">
          <SectionTitle title="So funktioniert's" />
          <ol className="space-y-2.5 text-sm text-muted">
            <li><strong className="text-ink">Neue Wörter</strong> siehst du zuerst mit Übersetzung, dann rufst du sie direkt ab.</li>
            <li><strong className="text-ink">Erst verstehen, dann produzieren:</strong> DE→FR wird freigeschaltet, sobald du ein Wort wiedererkennst.</li>
            <li><strong className="text-ink">FSRS</strong> plant jede Richtung separat – kurz bevor du das Wort vermutlich vergessen würdest.</li>
            <li><strong className="text-ink">Je sicherer</strong> ein Wort sitzt, desto anspruchsvoller die Übung: Auswahl → Karte → Tippen → Satz/Hören.</li>
            <li><strong className="text-ink">Fehler</strong> kommen in derselben Sitzung nochmals.</li>
          </ol>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <SectionTitle title="Stand je Richtung" sub="Rezeptiv (verstehen) und produktiv (selbst schreiben) werden getrennt bewertet." />
        <div className="grid gap-6 sm:grid-cols-2">
          {(['fr-de', 'de-fr'] as const).map((d) => (
            <div key={d}>
              <div className="mb-2 text-sm font-medium">{d === 'fr-de' ? 'Französisch → Deutsch' : 'Deutsch → Französisch'}</div>
              <StackBar parts={STAGES.map((k) => ({ key: k, value: s.dirStages[d][k], label: stageLabelShort[k] }))} />
              <div className="mt-3">
                <Legend parts={STAGES.map((k) => ({ key: k, value: s.dirStages[d][k], label: stageLabelShort[k] }))} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- Lernmodi

const MODES: { id: LearnMode; title: string; text: string; icon: typeof IconPlay; tag?: string; dirs?: boolean }[] = [
  { id: 'typing', title: 'Aktive Texteingabe', text: 'Deutsches Wort sehen, Französisch tippen. Der wirksamste Modus für den aktiven Wortschatz.', icon: IconKeyboard, tag: 'Empfohlen' },
  { id: 'flashcard', title: 'Karteikarten', text: 'Klassisch umdrehen und selbst bewerten: Nochmals, Schwer, Gut, Einfach.', icon: IconCards, dirs: true },
  { id: 'choice', title: 'Multiple Choice', text: 'Vier Antworten, eine richtig. Für den Einstieg und zur Wiedererkennung.', icon: IconTarget, dirs: true },
  { id: 'listening', title: 'Hören & Schreiben', text: 'Ein französisches Wort wird vorgelesen – schreibe es korrekt auf.', icon: IconHeadphones },
  { id: 'context', title: 'Lernen im Kontext', text: 'Ergänze das fehlende Wort in einem französischen Beispielsatz.', icon: IconQuote },
]

export function ModesPage() {
  const data = useLearnData()
  const lists = useStore((s) => s.lists)
  const [mode, setMode] = useState<LearnMode>('typing')
  const [cfg, setCfg] = useState<Pick<SessionConfig, 'lists' | 'dir' | 'scope' | 'n'>>({ lists: [], dir: 'mixed', scope: 'all', n: 20 })
  const words = useMemo(() => eligibleWords(data, cfg.lists), [data, cfg.lists])
  const contextCount = useMemo(() => words.filter((w) => clozeFor(w)).length, [words])
  const m = MODES.find((x) => x.id === mode)!

  return (
    <>
      <PageHeader title="Lernmodi" sub="Gezielt üben. Alle Modi fliessen in dieselbe Wiederholungsplanung ein." />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <IconBrain />
          </div>
          <div>
            <div className="font-medium">Intelligentes Lernen</div>
            <div className="text-sm text-muted">Hauptmodus: kombiniert alle Übungen automatisch nach deinem Lernstand.</div>
          </div>
        </div>
        <Button variant="primary" onClick={() => navigate('/lernen')}>Öffnen</Button>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((x) => (
          <button
            key={x.id}
            onClick={() => setMode(x.id)}
            className={cx('rounded-2xl border bg-surface p-5 text-left transition', mode === x.id ? 'border-accent ring-4 ring-accent-soft' : 'border-line hover:border-faint')}
          >
            <div className="flex items-center justify-between">
              <x.icon size={22} className="text-accent" />
              {x.tag && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">{x.tag}</span>}
            </div>
            <div className="mt-3 font-medium">{x.title}</div>
            <p className="mt-1 text-sm text-muted">{x.text}</p>
          </button>
        ))}
      </div>

      <Card className="mt-6 p-6">
        <SectionTitle title={m.title} sub="Einstellungen für diese Übung" />
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-medium">Listen</div>
            <ListPicker lists={lists} value={cfg.lists} onChange={(v) => setCfg({ ...cfg, lists: v })} />
          </div>
          <div className="flex flex-wrap gap-6">
            {m.dirs && (
              <div>
                <div className="mb-2 text-sm font-medium">Richtung</div>
                <Segmented
                  value={cfg.dir}
                  onChange={(v) => setCfg({ ...cfg, dir: v })}
                  options={[
                    { value: 'fr-de', label: 'FR → DE' },
                    { value: 'de-fr', label: 'DE → FR' },
                    { value: 'mixed', label: 'Gemischt' },
                  ]}
                />
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center gap-1 text-sm font-medium">
                Auswahl
                <Info>«Fällig» folgt der Wiederholungsplanung. «Alle» und «Schwierige» sind freies Üben – die Antworten werden trotzdem in die Planung übernommen (FSRS berücksichtigt, wie früh du wiederholst).</Info>
              </div>
              <Segmented
                value={cfg.scope}
                onChange={(v) => setCfg({ ...cfg, scope: v })}
                options={[
                  { value: 'due', label: 'Fällige' },
                  { value: 'all', label: 'Alle' },
                  { value: 'weak', label: 'Schwierige' },
                  { value: 'new', label: 'Neue' },
                ]}
              />
            </div>
            <div className="w-32">
              <Field label="Anzahl">
                <Select value={cfg.n} onChange={(e) => setCfg({ ...cfg, n: Number(e.target.value) })}>
                  {[10, 20, 30, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          {mode === 'context' && (
            <p className="text-sm text-muted">
              {contextCount} Wörter haben einen Beispielsatz, in dem das Wort vorkommt. Beispielsätze stammen aus deinen PDFs oder von dir – optional per KI (Einstellungen).
            </p>
          )}
          {mode === 'listening' && typeof window !== 'undefined' && !('speechSynthesis' in window) && (
            <p className="text-sm text-bad">Dein Browser unterstützt keine Sprachausgabe.</p>
          )}
          <Button
            variant="primary"
            size="lg"
            disabled={!words.length || (mode === 'context' && !contextCount)}
            onClick={() => navigate(sessionUrl({ mode, ...cfg }))}
          >
            <IconPlay size={18} /> Starten
          </Button>
        </div>
      </Card>
    </>
  )
}
