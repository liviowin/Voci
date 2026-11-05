import { useMemo } from 'react'
import { Link, navigate } from '../router'
import { useStore } from '../store/store'
import { fmtMin, last, shortDate, STAGES, stageLabelShort, useStats, useToday, useLearnData } from '../store/derived'
import { Bars, Heatmap, Legend, Ring, StackBar } from '../components/charts'
import { Badge, Button, Card, Empty, Info, PageHeader, SectionTitle, Stat } from '../components/ui'
import { IconArrowRight, IconCalendar, IconFlame, IconPlay, IconUpload } from '../components/icons'
import { examPlanStatus, avgSecondsPerCard } from '../lib/engine'
import { sessionUrl } from './Session'

export default function Dashboard() {
  const t = useToday()
  const s = useStats()
  const data = useLearnData()
  const exams = useStore((x) => x.exams)
  const hasWords = useStore((x) => x.words.size > 0)
  const goalType = useStore((x) => x.settings.goalType)

  const nextExam = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const e = exams.filter((x) => !x.archived && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
    return e ? { plan: e, status: examPlanStatus(e, data, Date.now(), avgSecondsPerCard(data.logs)) } : null
  }, [exams, data])

  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'

  if (!hasWords)
    return (
      <>
        <PageHeader title={`${greet} !`} sub="Willkommen. Starte mit deinen eigenen Vokabeln." />
        <Empty
          icon={<IconUpload size={32} />}
          title="Noch keine Vokabeln"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => navigate('/import')}>
                <IconUpload size={17} /> PDF importieren
              </Button>
              <Button onClick={() => navigate('/listen')}>Liste von Hand anlegen</Button>
            </div>
          }
        >
          Lade deine Vokabel-PDFs hoch (auch eingescannte). Die App erkennt französische Wörter und deutsche Übersetzungen – du prüfst alles, bevor es importiert wird.
        </Empty>
      </>
    )

  const days30 = last(30)
  const goalPct = t.goal ? t.goalValue / t.goal : 0

  return (
    <>
      <PageHeader title={`${greet} !`} sub={new Date().toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-sm text-muted">Heute</div>
              <div className="mt-2 flex items-baseline gap-6">
                <div>
                  <div className="text-4xl font-semibold tabular-nums">{t.dueCount}</div>
                  <div className="text-sm text-muted">fällige Wiederholungen</div>
                </div>
                <div>
                  <div className="text-4xl font-semibold text-accent tabular-nums">{t.newAvail}</div>
                  <div className="text-sm text-muted">neue Karten</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted">
                Geschätzt ca. {Math.max(1, t.estMinutes)} min
                <Info>
                  Schätzung = (fällige Karten × 1,3 + neue Karten × 3) × deine mittlere Antwortzeit ({Math.round(t.sec)} s). Neue Wörter werden am ersten Tag mehrmals abgefragt.
                </Info>
              </p>
            </div>
            <Ring value={goalPct} size={104}>
              <span className="text-xl font-semibold tabular-nums">{t.goal ? Math.round(t.goalValue) : 0}</span>
              <span className="text-[11px] text-muted">
                / {t.goal} {goalType === 'minutes' ? 'min' : 'Abfr.'}
              </span>
            </Ring>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => navigate(sessionUrl({ mode: 'smart' }))} disabled={!t.dueCount && !t.newAvail}>
              <IconPlay size={18} /> {t.dueCount || t.newAvail ? 'Jetzt lernen' : 'Alles erledigt'}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => navigate('/modi')}>
              Frei üben
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Beherrscht"
            value={s.stageCount.beherrscht}
            sub={`von ${s.totalWords} Wörtern`}
            tone="good"
            info={`Ein Wort gilt als beherrscht, wenn beide Richtungen (FR→DE und DE→FR) eine geschätzte Stabilität von mindestens 21 Tagen haben oder du es als «bekannt» markiert hast.`}
          />
          <Stat
            label="Erfolgsquote"
            value={s.success.rate == null ? '–' : `${Math.round(s.success.rate * 100)} %`}
            sub={s.success.n ? `${s.success.n} Abrufe, 30 Tage` : 'noch keine Daten'}
            info="Anteil richtiger Antworten bei Wiederholungen bereits gelernter Karten in den letzten 30 Tagen (ohne Erstbegegnung). Mit «Hinweis» gelöste Wörter zählen als richtig, werden aber schwächer geplant."
          />
          <Stat label="Heute gelernt" value={`${fmtMin(t.minutes)} min`} sub={`${t.reviewsToday} Abfragen`} info="Gemessen wird die Zeit pro Antwort, höchstens 60 s pro Karte – Pausen zählen nicht." />
          <Stat
            label="Serie"
            value={
              <span className="inline-flex items-center gap-1">
                {s.streak}
                <IconFlame size={20} className={s.streak ? 'text-warn' : 'text-faint'} />
              </span>
            }
            sub={s.streak === 1 ? 'Tag in Folge' : 'Tage in Folge'}
          />
        </div>
      </div>

      {nextExam && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-soft text-warn">
              <IconCalendar />
            </div>
            <div>
              <div className="font-medium">
                {nextExam.plan.name} <Badge tone="warn">in {nextExam.status.daysLeft} {nextExam.status.daysLeft === 1 ? 'Tag' : 'Tagen'}</Badge>
              </div>
              <div className="text-sm text-muted">
                {Math.round((nextExam.status.ready / Math.max(1, nextExam.status.total)) * 100)} % prüfungsbereit · heute {nextExam.status.todayCards.length} Karten (~{nextExam.status.estMinutesToday} min)
              </div>
            </div>
          </div>
          <Button onClick={() => navigate(sessionUrl({ mode: 'cram', exam: nextExam.plan.id, n: 80 }))}>
            Prüfungstraining <IconArrowRight size={16} />
          </Button>
        </Card>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Nächste Wiederholungen" sub="Fällige Karten in den nächsten 14 Tagen" />
          <Bars
            data={s.forecast.map((v, i) => {
              const d = new Date(Date.now() + i * 86_400_000)
              return { label: i === 0 ? 'heute' : i === 13 ? 'in 13 T' : '', value: v, sub: i === 0 ? 'heute' : i === 1 ? 'morgen' : d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' }) }
            })}
            format={(v) => `${v} Karten`}
            highlightLast={false}
          />
        </Card>
        <Card className="p-5">
          <SectionTitle title="Lernminuten" sub="Letzte 30 Tage" action={<Link to="/statistik" className="text-sm text-accent">Statistiken</Link>} />
          <Bars data={days30.map((k) => ({ label: shortDate(k), value: Math.round((s.days.get(k)?.ms ?? 0) / 60000), sub: shortDate(k) }))} format={(v) => `${v} min`} color="var(--c-good)" highlightLast />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Fortschritt je Liste" action={<Link to="/listen" className="text-sm text-accent">Alle Listen</Link>} />
          <div className="space-y-4">
            {s.lists.slice(0, 6).map((l) => {
              const c = s.byList.get(l.id)
              const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : 0
              return (
                <Link key={l.id} to={`/listen/${l.id}`} className="block">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-muted tabular-nums">{c ? `${c.beherrscht}/${total}` : '0'}</span>
                  </div>
                  <StackBar parts={STAGES.map((k) => ({ key: k, value: c?.[k] ?? 0, label: stageLabelShort[k] }))} />
                </Link>
              )
            })}
          </div>
          <div className="mt-4">
            <Legend parts={STAGES.map((k) => ({ key: k, value: s.stageCount[k], label: stageLabelShort[k] }))} />
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Schwierigste Wörter" sub="Nach Fehlern, Vergessen und geschätzter Schwierigkeit" />
          {s.hardest.length ? (
            <ul className="divide-y divide-line">
              {s.hardest.slice(0, 7).map(({ word, card }) => (
                <li key={card.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[17px]">{word.fr}</div>
                    <div className="truncate text-sm text-muted">{word.de}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted">
                    <div>{card.direction === 'fr-de' ? 'FR→DE' : 'DE→FR'}</div>
                    <div className="tabular-nums">
                      {card.wrong}× falsch{card.lapses ? ` · ${card.lapses}× vergessen` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Noch keine Fehler – oder noch zu wenige Daten.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle title="Lernkalender" sub="Abfragen pro Tag, letzte 26 Wochen" />
        <Heatmap
          days={new Map([...s.days].map(([k, v]) => [k, v.reviews]))}
          value={(k) => {
            const d = s.days.get(k)
            return d ? `${d.reviews} Abfragen · ${fmtMin(d.ms / 60000)} min · ${Math.round((d.correct / d.reviews) * 100)} % richtig` : 'nicht gelernt'
          }}
        />
      </Card>
    </>
  )
}
