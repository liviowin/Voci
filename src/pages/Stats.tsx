import { useMemo, useState } from 'react'
import { fmtMin, last, shortDate, STAGES, stageLabelShort, useLearnData, useStats } from '../store/derived'
import { Bars, Heatmap, Legend, Line, StackBar } from '../components/charts'
import { Card, Empty, PageHeader, SectionTitle, Segmented, Stat } from '../components/ui'
import { IconChart } from '../components/icons'
import { currentR, dateKey, MASTERED_DAYS } from '../lib/engine'
import { CardState } from '../lib/fsrs'
import { useStore } from '../store/store'

export default function StatsPage() {
  const s = useStats()
  const data = useLearnData()
  const [range, setRange] = useState<'30' | '90'>('30')
  const keys = last(Number(range))

  const weekly = useMemo(() => {
    // Erfolgsquote pro Woche (nur Wiederholungen gelernter Karten)
    const out: { label: string; value: number | null }[] = []
    const now = Date.now()
    for (let w = 11; w >= 0; w--) {
      const from = now - (w + 1) * 7 * 86_400_000
      const to = now - w * 7 * 86_400_000
      const rel = data.logs.filter((l) => l.ts >= from && l.ts < to && l.stateBefore !== CardState.New && l.mode !== 'intro')
      out.push({ label: w === 0 ? 'diese Woche' : w === 11 ? 'vor 11 Wo.' : '', value: rel.length >= 5 ? rel.filter((l) => l.correct).length / rel.length : null })
    }
    return out
  }, [data.logs])

  const modeStats = useMemo(() => {
    const m = new Map<string, { n: number; ok: number }>()
    for (const l of data.logs) {
      if (l.mode === 'intro') continue
      const x = m.get(l.mode) ?? { n: 0, ok: 0 }
      x.n++
      if (l.correct) x.ok++
      m.set(l.mode, x)
    }
    return m
  }, [data.logs])

  const avgR = useMemo(() => {
    const now = Date.now()
    const rs = [...data.cards.values()].filter((c) => c.state !== CardState.New && data.words.get(c.wordId) && !data.words.get(c.wordId)!.excluded).map((c) => currentR(c, now))
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null
  }, [data])

  const lists = useStore((x) => x.lists)

  if (!s.totalReviews)
    return (
      <>
        <PageHeader title="Statistiken" />
        <Empty icon={<IconChart size={30} />} title="Noch keine Lerndaten">Sobald du lernst, erscheinen hier Verlauf, Erfolgsquote und Fortschritt.</Empty>
      </>
    )

  const MODE_LABEL: Record<string, string> = { smart: 'Intelligent', flashcard: 'Karteikarten', typing: 'Texteingabe', choice: 'Multiple Choice', listening: 'Hören', context: 'Kontext', exam: 'Prüfung', cram: 'Prüfungstraining' }

  return (
    <>
      <PageHeader title="Statistiken" sub="Alle Werte stammen aus deinem Lernprotokoll. Schätzungen sind als solche gekennzeichnet." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Lernzeit gesamt" value={s.totalMinutes < 60 ? `${fmtMin(s.totalMinutes)} min` : `${(s.totalMinutes / 60).toFixed(1)} h`} sub={`${s.totalReviews} Abfragen`} />
        <Stat label="Erfolgsquote (30 T)" value={s.success.rate == null ? '–' : `${Math.round(s.success.rate * 100)} %`} sub={`n = ${s.success.n}`} />
        <Stat label="Beherrscht" value={s.stageCount.beherrscht} sub={`≥ ${MASTERED_DAYS} Tage Stabilität`} tone="good" />
        <Stat
          label="Ø Abrufwahrscheinlichkeit"
          value={avgR == null ? '–' : `≈ ${Math.round(avgR * 20) * 5} %`}
          sub="Modellschätzung, auf 5 % gerundet"
          info="FSRS schätzt für jede gelernte Karte, wie wahrscheinlich du sie jetzt abrufen kannst. Das ist ein statistisches Modell mit Unsicherheit – deshalb nur grob gerundet."
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Lernminuten pro Tag" action={<Segmented value={range} onChange={setRange} options={[{ value: '30', label: '30 T' }, { value: '90', label: '90 T' }]} />} />
          <Bars data={keys.map((k) => ({ label: shortDate(k), value: Math.round((s.days.get(k)?.ms ?? 0) / 60000), sub: shortDate(k) }))} format={(v) => `${v} min`} color="var(--c-good)" highlightLast />
        </Card>
        <Card className="p-5">
          <SectionTitle title="Abfragen pro Tag" sub="Antippen für Details" />
          <Bars
            data={keys.map((k) => {
              const d = s.days.get(k)
              return { label: shortDate(k), value: d?.reviews ?? 0, sub: `${shortDate(k)} · ${d?.newCards ?? 0} neu · ${d ? Math.round((d.correct / d.reviews) * 100) : 0} % richtig` }
            })}
            format={(v) => `${v} Abfragen`}
            highlightLast
          />
        </Card>
        <Card className="p-5">
          <SectionTitle title="Erfolgsquote pro Woche" sub="Nur Wochen mit mindestens 5 Wiederholungen" />
          <Line points={weekly} format={(v) => `${Math.round(v * 100)} %`} min={0} max={1} />
          <p className="mt-2 text-xs text-muted">Bei 90 % Zielquote ist eine Erfolgsquote um 85–92 % erwartet. Deutlich höher heisst: Abstände könnten länger sein.</p>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Prognose" sub="Fällige Karten in den nächsten 14 Tagen" />
          <Bars data={s.forecast.map((v, i) => ({ label: i === 0 ? 'heute' : i === 13 ? '+13 T' : '', value: v, sub: i === 0 ? 'heute' : `in ${i} ${i === 1 ? 'Tag' : 'Tagen'}` }))} format={(v) => `${v} Karten`} />
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle title="Lernkalender" sub="Letzte 52 Wochen" />
        <Heatmap
          weeks={52}
          days={new Map([...s.days].map(([k, v]) => [k, Math.round(v.ms / 60000)]))}
          value={(k) => {
            const d = s.days.get(k)
            return d ? `${fmtMin(d.ms / 60000)} min · ${d.reviews} Abfragen · ${d.newCards} neu` : 'nicht gelernt'
          }}
        />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Stand je Richtung" />
          {(['fr-de', 'de-fr'] as const).map((d) => (
            <div key={d} className="mb-4">
              <div className="mb-1.5 text-sm">{d === 'fr-de' ? 'Verstehen (FR → DE)' : 'Produzieren (DE → FR)'}</div>
              <StackBar parts={STAGES.map((k) => ({ key: k, value: s.dirStages[d][k], label: stageLabelShort[k] }))} />
            </div>
          ))}
          <Legend parts={STAGES.map((k) => ({ key: k, value: s.stageCount[k], label: stageLabelShort[k] }))} />
          <p className="mt-3 text-xs text-muted">Zahlen der Legende: Wörter (beide Richtungen zusammengefasst).</p>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Nach Lernmodus" sub="Anteil richtiger Antworten" />
          <ul className="space-y-2.5">
            {[...modeStats].sort((a, b) => b[1].n - a[1].n).map(([m, v]) => (
              <li key={m} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0">{MODE_LABEL[m] ?? m}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(v.ok / v.n) * 100}%` }} />
                </div>
                <span className="w-24 text-right text-muted tabular-nums">{Math.round((v.ok / v.n) * 100)} % · {v.n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Leichtere Formate (Auswahl) haben naturgemäss höhere Quoten – das sagt wenig über den aktiven Wortschatz aus.</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Fortschritt je Liste" />
          <div className="space-y-4">
            {lists.map((l) => {
              const c = s.byList.get(l.id)
              const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : 0
              return (
                <div key={l.id}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{l.name}</span>
                    <span className="text-muted tabular-nums">{total ? Math.round(((c?.beherrscht ?? 0) / total) * 100) : 0} % beherrscht</span>
                  </div>
                  <StackBar parts={STAGES.map((k) => ({ key: k, value: c?.[k] ?? 0, label: stageLabelShort[k] }))} />
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Schwierigste Wörter" sub="mit wiederkehrenden Fehlern" />
          <ul className="divide-y divide-line">
            {s.hardest.slice(0, 15).map(({ word, card }) => (
              <li key={card.id} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-[17px]">{word.fr}</span>
                  <span className="text-xs text-muted">{card.direction === 'fr-de' ? 'FR→DE' : 'DE→FR'} · {card.wrong}× falsch · D {card.difficulty.toFixed(1)}</span>
                </div>
                <div className="text-sm text-muted">{word.de}</div>
                {card.recentErrors.length > 0 && <div className="mt-0.5 text-xs text-bad">zuletzt: {[...new Set(card.recentErrors)].slice(-3).map((e) => `«${e}»`).join(', ')}</div>}
              </li>
            ))}
            {!s.hardest.length && <li className="py-2 text-sm text-muted">Noch keine auffälligen Wörter.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-5 text-sm leading-relaxed text-muted">
        <h2 className="mb-2 text-[15px] font-semibold text-ink">So werden die Werte berechnet</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">Lernminuten:</strong> Summe der Zeit pro Antwort, maximal 60 s je Karte. Leerlauf zählt nicht.</li>
          <li><strong className="text-ink">Erfolgsquote:</strong> richtige Antworten / alle Wiederholungen bereits gelernter Karten. Erstbegegnungen zählen nicht.</li>
          <li><strong className="text-ink">Stufen:</strong> Neu = nie abgefragt · Lernend = in Lernschritten (Minuten) · Wiederholung = Stabilität &lt; {MASTERED_DAYS} T · Beherrscht = ≥ {MASTERED_DAYS} T · Vergessen = nach einem Fehler im Wiederlernen.</li>
          <li><strong className="text-ink">Stabilität:</strong> FSRS-Schätzung, nach wie vielen Tagen die Abrufwahrscheinlichkeit auf 90 % sinkt. Sie wächst mit jedem erfolgreichen Abruf und hängt von Abstand, Bewertung und Schwierigkeit ab.</li>
          <li><strong className="text-ink">Kalender:</strong> Tage beginnen um 04:00 Uhr (späte Lernsitzungen zählen zum Vortag). Heute: {dateKey(Date.now())}.</li>
          <li>Prüfungssimulationen werden protokolliert, ändern aber die Planung nicht.</li>
        </ul>
      </Card>
    </>
  )
}
