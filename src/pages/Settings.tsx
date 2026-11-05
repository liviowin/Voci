import { useEffect, useRef, useState, type ReactNode } from 'react'
import { buildBackup, markBackupDone, restoreBackup, saveSettings, useStore, wipeAll } from '../store/store'
import { downloadFile, parseBackup, wordsToCsv } from '../lib/backup'
import { requestPersistence } from '../lib/db'
import { frenchVoices, onVoicesChanged, speak, ttsAvailable } from '../lib/speech'
import { Button, Card, Field, Input, Kbd, PageHeader, Segmented, Select, Toggle, toast, useConfirm } from '../components/ui'
import { IconDownload, IconUpload } from '../components/icons'

function Section({ id, title, sub, children }: { id?: string; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20 p-6">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  )
}

export default function SettingsPage() {
  const s = useStore((x) => x.settings)
  const lists = useStore((x) => x.lists)
  const words = useStore((x) => x.words)
  const logs = useStore((x) => x.logs)
  const [voices, setVoices] = useState(frenchVoices())
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string>('')
  const [pendingRestore, setPendingRestore] = useState<ReturnType<typeof parseBackup> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { ask, node } = useConfirm()

  useEffect(() => onVoicesChanged(() => setVoices(frenchVoices())), [])
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB belegt`)).catch(() => undefined)
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [])

  const exportJson = async () => {
    const b = buildBackup()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`franzoesisch-backup-${stamp}.json`, JSON.stringify(b), 'application/json')
    await markBackupDone()
    toast('Sicherung heruntergeladen', 'good')
  }

  const onFile = async (f: File) => {
    if (f.size > 100 * 1024 * 1024) return toast('Datei zu gross.', 'bad')
    try {
      setPendingRestore(parseBackup(await f.text()))
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Tägliches Lernziel">
          <Segmented value={s.goalType} onChange={(v) => saveSettings({ goalType: v })} options={[{ value: 'minutes', label: 'Minuten' }, { value: 'words', label: 'Abfragen' }]} />
          {s.goalType === 'minutes' ? (
            <Field label="Minuten pro Tag">
              <Input type="number" min={1} max={240} value={s.goalMinutes} onChange={(e) => saveSettings({ goalMinutes: clamp(e.target.value, 1, 240) })} />
            </Field>
          ) : (
            <Field label="Abfragen pro Tag">
              <Input type="number" min={5} max={2000} value={s.goalWords} onChange={(e) => saveSettings({ goalWords: clamp(e.target.value, 5, 2000) })} />
            </Field>
          )}
        </Section>

        <Section title="Lernplanung (FSRS)" sub="Bestimmt, wie viele Karten täglich anfallen.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Neue Wörter pro Tag" hint="je Richtung">
              <Input type="number" min={0} max={200} value={s.newPerDay} onChange={(e) => saveSettings({ newPerDay: clamp(e.target.value, 0, 200) })} />
            </Field>
            <Field label="Max. Wiederholungen/Tag">
              <Input type="number" min={10} max={5000} value={s.maxReviewsPerDay} onChange={(e) => saveSettings({ maxReviewsPerDay: clamp(e.target.value, 10, 5000) })} />
            </Field>
          </div>
          <Field label="Gewünschte Behaltensquote" hint="Höher = sicherer, aber deutlich mehr Wiederholungen. 90 % ist ein bewährter Kompromiss.">
            <Select value={s.requestRetention} onChange={(e) => saveSettings({ requestRetention: Number(e.target.value) })}>
              {[0.8, 0.85, 0.9, 0.93, 0.95].map((r) => (
                <option key={r} value={r}>{Math.round(r * 100)} %{r === 0.9 ? ' (empfohlen)' : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Maximaler Abstand">
            <Select value={s.maximumIntervalDays} onChange={(e) => saveSettings({ maximumIntervalDays: Number(e.target.value) })}>
              {[[90, '3 Monate'], [180, '6 Monate'], [365, '1 Jahr'], [1095, '3 Jahre'], [3650, '10 Jahre']].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Toggle checked={s.productionAfterRecognition} onChange={(v) => saveSettings({ productionAfterRecognition: v })} label="Erst verstehen, dann produzieren" hint="DE → FR wird erst abgefragt, wenn du ein Wort wiedererkennst." />
        </Section>

        <Section title="Auswertung getippter Antworten">
          <Segmented
            value={s.strictness}
            onChange={(v) => saveSettings({ strictness: v })}
            options={[
              { value: 'tolerant', label: 'Tolerant' },
              { value: 'strict', label: 'Streng' },
            ]}
          />
          <p className="text-sm text-muted">
            {s.strictness === 'tolerant'
              ? 'Kleine Tippfehler, Akzentfehler und fehlende Artikel werden akzeptiert, aber markiert und nur als «Schwer» geplant.'
              : 'Nur die exakte Schreibweise inkl. Akzenten und Artikel zählt als richtig. Gross-/Kleinschreibung und œ/oe sind egal.'}
          </p>
        </Section>

        <Section title="Übungen im intelligenten Modus">
          <Toggle checked={s.includeContext} onChange={(v) => saveSettings({ includeContext: v })} label="Lückensätze" hint="Wörter mit Beispielsatz zusätzlich im Kontext abfragen" />
          <Toggle checked={s.includeListening} onChange={(v) => saveSettings({ includeListening: v })} label="Hören & Schreiben" hint="Gelegentlich Diktat statt Übersetzung" />
        </Section>

        <Section title="Sprachausgabe" sub={ttsAvailable() ? `${voices.length} französische Stimme(n) gefunden` : 'Dein Browser unterstützt keine Sprachausgabe.'}>
          {voices.length > 0 && (
            <Field label="Stimme">
              <Select value={s.voiceURI} onChange={(e) => saveSettings({ voiceURI: e.target.value })}>
                <option value="">Automatisch</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang}){v.localService ? '' : ' · online'}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={`Tempo: ${s.speechRate.toFixed(2)}×`}>
            <input type="range" min={0.5} max={1.3} step={0.05} value={s.speechRate} onChange={(e) => saveSettings({ speechRate: Number(e.target.value) })} className="w-full accent-[var(--c-accent)]" />
          </Field>
          <Button size="sm" onClick={() => speak("Bonjour ! Je m'appelle Claire et j'apprends l'allemand.", { rate: s.speechRate, voiceURI: s.voiceURI })} disabled={!ttsAvailable()}>
            Probe anhören
          </Button>
          <p className="text-xs text-muted">Stimmen stammen vom Betriebssystem. Mit «online» markierte Stimmen funktionieren nur mit Internet. Fehlt eine französische Stimme, kannst du sie in den System-Spracheinstellungen nachinstallieren.</p>
        </Section>

        <Section title="Darstellung">
          <Segmented value={s.theme} onChange={(v) => saveSettings({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }]} />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section id="backup" title="Sicherung & Wiederherstellung" sub="Alle Daten liegen nur in diesem Browser (IndexedDB). Erstelle regelmässig eine Sicherung – z. B. um auf ein anderes Gerät zu wechseln.">
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <div>{words.size} Wörter · {lists.length} Listen · {logs.length} Abfragen {usage && `· ${usage}`}</div>
            <div className="text-muted">Letzte Sicherung: {s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie'}</div>
            <div className="text-muted">
              Dauerhafter Speicher: {persisted ? 'aktiv' : persisted === false ? 'nicht aktiv – der Browser könnte bei Platzmangel Daten löschen' : 'unbekannt'}
              {!persisted && (
                <button className="ml-2 text-accent underline-offset-2 hover:underline" onClick={async () => setPersisted(await requestPersistence())}>
                  anfragen
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={exportJson}>
              <IconDownload size={17} /> Sicherung herunterladen (JSON)
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <IconUpload size={17} /> Wiederherstellen
            </Button>
            <Button variant="ghost" onClick={() => downloadFile('vokabeln.csv', wordsToCsv([...words.values()], lists), 'text/csv;charset=utf-8')}>
              Vokabeln als CSV
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
          </div>
          {pendingRestore && (
            <div className="rounded-xl border border-line p-4 text-sm">
              <p>
                Sicherung vom {pendingRestore.exportedAt ? new Date(pendingRestore.exportedAt).toLocaleString('de-CH') : '?'}: {pendingRestore.words.length} Wörter, {pendingRestore.lists.length} Listen, {pendingRestore.logs.length} Abfragen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await restoreBackup(pendingRestore, 'merge')
                    setPendingRestore(null)
                    toast('Sicherung zusammengeführt', 'good')
                  }}
                >
                  Zusammenführen
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!(await ask('Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?'))) return
                    await restoreBackup(pendingRestore, 'replace')
                    setPendingRestore(null)
                    toast('Sicherung wiederhergestellt', 'good')
                  }}
                >
                  Alles ersetzen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingRestore(null)}>Abbrechen</Button>
              </div>
              <p className="mt-2 text-xs text-muted">«Zusammenführen» behält bei gleichen Einträgen jeweils den neueren Stand.</p>
            </div>
          )}
        </Section>

        <Section title="Optionale KI-Erweiterung" sub="Nur für Beispielsätze. Standardmässig aus – die App funktioniert vollständig ohne.">
          <Toggle checked={s.aiEnabled} onChange={(v) => saveSettings({ aiEnabled: v })} label="KI-Beispielsätze aktivieren" hint="Fügt in Vokabellisten die Aktion «Beispielsätze per KI ergänzen» hinzu." />
          {s.aiEnabled && (
            <>
              <Field label="Anthropic API-Schlüssel" hint="Wird nur in diesem Browser gespeichert und nie in Sicherungen exportiert. Gesendet werden nur die ausgewählten Wörter.">
                <Input type="password" autoComplete="off" value={s.aiApiKey} onChange={(e) => saveSettings({ aiApiKey: e.target.value.trim() })} placeholder="sk-ant-…" />
              </Field>
              <Field label="Modell">
                <Input value={s.aiModel} onChange={(e) => saveSettings({ aiModel: e.target.value.trim() })} />
              </Field>
              <p className="text-xs text-muted">KI-Sätze werden nur übernommen, wenn das Wort darin gefunden wird, und als «KI» markiert. Prüfe sie trotzdem – Sprachmodelle können Fehler machen.</p>
            </>
          )}
        </Section>

        <Section title="Tastenkürzel">
          <ul className="grid gap-2 text-sm">
            <li className="flex justify-between"><span>Karte umdrehen / prüfen / weiter</span><span><Kbd>Leertaste</Kbd> <Kbd>Enter</Kbd></span></li>
            <li className="flex justify-between"><span>Bewerten (Nochmals, Schwer, Gut, Einfach)</span><span><Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd></span></li>
            <li className="flex justify-between"><span>Multiple-Choice-Antwort</span><span><Kbd>1</Kbd>–<Kbd>4</Kbd></span></li>
            <li className="flex justify-between"><span>Hinweis (nächster Buchstabe)</span><Kbd>↑</Kbd></li>
            <li className="flex justify-between"><span>Weiss ich nicht</span><Kbd>Esc</Kbd></li>
            <li className="flex justify-between"><span>Langsamer vorlesen (Hörmodus)</span><span><Kbd>Strg</Kbd>+<Kbd>Leertaste</Kbd></span></li>
            <li className="flex justify-between"><span>Letzte Antwort rückgängig</span><span><Kbd>Strg</Kbd>+<Kbd>Z</Kbd></span></li>
          </ul>
        </Section>

        <Section title="Daten löschen">
          <p className="text-sm text-muted">Löscht alle Listen, Wörter, Lernfortschritte und Einstellungen in diesem Browser. Lade vorher eine Sicherung herunter.</p>
          <Button variant="danger" onClick={async () => (await ask('Wirklich ALLE Daten in diesem Browser löschen? Das kann nicht rückgängig gemacht werden.')) && wipeAll().then(() => toast('Alle Daten gelöscht'))}>
            Alle Daten löschen
          </Button>
        </Section>
      </div>
      {node}
    </>
  )
}

const clamp = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)))
