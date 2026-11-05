import { useMemo, useRef, useState } from 'react'
import { navigate, useQuery } from '../router'
import { addWords, createList, getState, useStore } from '../store/store'
import { extractPdf, validatePdf, type ExtractProgress, type OcrMode } from '../lib/pdf'
import { itemsToLines, markDuplicates, parseLines, textToLines, type ParsedEntry } from '../lib/parser'
import { parseCsv } from '../lib/backup'
import type { ListCategory } from '../lib/types'
import { Badge, Button, Card, Field, Input, PageHeader, Progress, Segmented, Select, Textarea, cx, toast } from '../components/ui'
import { IconAlert, IconCheck, IconFile, IconTrash, IconUpload } from '../components/icons'
import { CATEGORY_LABEL } from './Lists'

interface Row extends ParsedEntry {
  file: string
}

type Source = 'pdf' | 'text' | 'csv'

export default function ImportPage() {
  const q = useQuery()
  const lists = useStore((s) => s.lists)
  const [source, setSource] = useState<Source>('pdf')
  const [target, setTarget] = useState<string>(q.get('list') ?? 'new')
  const [category, setCategory] = useState<ListCategory>('kapitel')
  const [newName, setNewName] = useState('')
  const [ocr, setOcr] = useState<OcrMode>('auto')
  const [rows, setRows] = useState<Row[]>([])
  const [raw, setRaw] = useState<{ file: string; page: number; ocr: boolean; text: string }[]>([])
  const [busy, setBusy] = useState<null | { file: string; p: ExtractProgress }>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [text, setText] = useState('')
  const [view, setView] = useState<'alle' | 'pruefen' | 'aus'>('alle')
  const [drag, setDrag] = useState(false)
  const [limit, setLimit] = useState(200)
  const abort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const existing = () => {
    const st = getState()
    const names = new Map(st.lists.map((l) => [l.id, l.name]))
    return [...st.words.values()].map((w) => ({ id: w.id, fr: w.fr, de: w.de, listName: names.get(w.listId) ?? '' }))
  }

  const finishParse = (entries: Row[]) => {
    setRows((prev) => {
      const combined = [...prev, ...entries]
      const base = combined.map((e) => ({ ...e, duplicateOf: undefined, issues: e.issues.filter((i) => i !== 'Duplikat') }))
      return markDuplicates(base, existing()).map((e, i) => ({
        ...e,
        issues: [...new Set(e.issues)],
        file: combined[i].file,
        include: i < prev.length ? prev[i].include && !e.duplicateOf : e.include && !!e.fr && !!e.de,
      }))
    })
  }

  const handleFiles = async (files: FileList | File[]) => {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) return toast('Bitte PDF-Dateien wählen.', 'bad')
    if (!newName && target === 'new' && pdfs.length === 1) setNewName(pdfs[0].name.replace(/\.pdf$/i, ''))
    const ctrl = new AbortController()
    abort.current = ctrl
    const errs: string[] = []
    for (const f of pdfs) {
      try {
        const buf = await validatePdf(f)
        const pages = await extractPdf(buf, { ocr, signal: ctrl.signal, onProgress: (p) => setBusy({ file: f.name, p }) })
        const entries: Row[] = []
        let chapter = ''
        for (const pg of pages) {
          const parsed = parseLines(itemsToLines(pg.items, pg.page), { defaultChapter: chapter })
          if (parsed.length) chapter = parsed[parsed.length - 1].chapter
          entries.push(...parsed.map((e) => ({ ...e, file: f.name })))
          setRaw((r) => [...r, { file: f.name, page: pg.page, ocr: pg.ocr, text: pg.items.map((i) => i.str).join(' ').slice(0, 4000) }])
        }
        if (!entries.length) errs.push(`In «${f.name}» wurden keine Wortpaare erkannt. Prüfe den Rohtext unten oder versuche «OCR erzwingen».`)
        finishParse(entries)
      } catch (e) {
        errs.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setErrors(errs)
    setBusy(null)
  }

  const parseText = () => {
    if (!text.trim()) return
    const entries = parseLines(textToLines(text.slice(0, 500_000))).map((e) => ({ ...e, file: 'Text' }))
    finishParse(entries)
    if (!entries.length) toast('Keine Wortpaare erkannt. Trenne Französisch und Deutsch z. B. mit «–», «=», Tab oder Semikolon.', 'bad')
  }

  const parseCsvText = (content: string, name: string) => {
    const table = parseCsv(content)
    if (!table.length) return toast('Die CSV-Datei ist leer.', 'bad')
    const head = table[0].map((h) => h.toLowerCase())
    const idx = (re: RegExp, d: number) => {
      const i = head.findIndex((h) => re.test(h))
      return i >= 0 ? i : d
    }
    const hasHead = head.some((h) => /franz|fran[cç]ais|deutsch|allemand/.test(h))
    const iFr = idx(/franz|fran[cç]ais|french/, 0)
    const iDe = idx(/deutsch|allemand|german/, 1)
    const iEx = idx(/^beispiel$|exemple|example/, -1)
    const iExDe = idx(/beispiel \(de\)/, -1)
    const iCh = idx(/kapitel|lektion|chapitre|unité/, -1)
    const iG = idx(/genus|genre/, -1)
    const iPl = idx(/plural|pluriel/, -1)
    const iPos = idx(/wortart|nature/, -1)
    const entries: Row[] = (hasHead ? table.slice(1) : table).map((r, n) => {
      const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '') : '')
      const fr = get(iFr)
      const de = get(iDe)
      const g = get(iG)
      return {
        tempId: `csv${n}`,
        fr,
        de,
        gender: (['m', 'f', 'm/f'].includes(g) ? g : '') as Row['gender'],
        plural: get(iPl),
        pos: get(iPos),
        example: get(iEx),
        exampleDe: get(iExDe),
        notes: '',
        chapter: get(iCh),
        page: n + 1,
        issues: !fr ? ['Französisches Wort fehlt'] : !de ? ['Übersetzung fehlt'] : [],
        confidence: fr && de ? 1 : 0.3,
        include: !!(fr && de),
        file: name,
      }
    })
    finishParse(entries.filter((e) => e.fr || e.de))
  }

  const update = (tempId: string, p: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.tempId !== tempId) return r
        const n = { ...r, ...p }
        if (('fr' in p || 'de' in p) && n.fr && n.de) n.issues = n.issues.filter((i) => i !== 'Übersetzung fehlt' && i !== 'Französisches Wort fehlt')
        if (!n.fr || !n.de) n.include = false
        return n
      }),
    )

  const stats = useMemo(
    () => ({
      total: rows.length,
      included: rows.filter((r) => r.include).length,
      flagged: rows.filter((r) => r.issues.length).length,
      dups: rows.filter((r) => r.duplicateOf).length,
      incomplete: rows.filter((r) => !r.fr || !r.de).length,
    }),
    [rows],
  )
  const shown = rows.filter((r) => (view === 'pruefen' ? r.issues.length > 0 || !r.fr || !r.de : view === 'aus' ? !r.include : true))

  const doImport = async () => {
    const chosen = rows.filter((r) => r.include && r.fr.trim() && r.de.trim())
    if (!chosen.length) return
    let listIds: Record<string, string> = {}
    if (target === 'new') {
      const files = [...new Set(chosen.map((r) => r.file))]
      for (const f of files) {
        const name = files.length === 1 && newName.trim() ? newName.trim() : f === 'Text' ? 'Eingefügte Vokabeln' : f.replace(/\.(pdf|csv|txt)$/i, '')
        const l = await createList({ name: name.slice(0, 120) || 'Import', category, sourceFile: f })
        listIds[f] = l.id
      }
    } else listIds = Object.fromEntries(chosen.map((r) => [r.file, target]))
    await addWords(
      chosen.map((r) => ({
        listId: listIds[r.file],
        fr: r.fr.trim().slice(0, 300),
        de: r.de.trim().slice(0, 300),
        gender: r.gender,
        plural: r.plural,
        pos: r.pos,
        example: r.example,
        exampleDe: r.exampleDe,
        exampleSource: r.example ? 'pdf' : undefined,
        notes: r.notes,
        chapter: r.chapter,
      })),
    )
    toast(`${chosen.length} Wörter importiert`, 'good')
    const first = Object.values(listIds)[0]
    navigate(first ? `/listen/${first}` : '/listen')
  }

  return (
    <>
      <PageHeader title="Vokabeln importieren" sub="PDF (auch eingescannt), eingefügter Text oder CSV. Du prüfst alles vor dem Import." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: 'pdf', label: 'PDF' },
              { value: 'text', label: 'Text einfügen' },
              { value: 'csv', label: 'CSV' },
            ]}
          />
          <div className="mt-5">
            {source === 'pdf' && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDrag(true)
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDrag(false)
                    if (!busy) handleFiles(e.dataTransfer.files)
                  }}
                  onClick={() => !busy && fileInput.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
                  className={cx(
                    'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition',
                    drag ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-faint',
                  )}
                >
                  <IconUpload size={30} className="text-faint" />
                  <p className="mt-3 font-medium">PDF hierher ziehen oder klicken</p>
                  <p className="mt-1 text-sm text-muted">Mehrere Dateien möglich · max. 50 MB · Verarbeitung nur in deinem Browser</p>
                  <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files).finally(() => (e.target.value = ''))} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted">Texterkennung (OCR):</span>
                  <Segmented
                    value={ocr}
                    onChange={setOcr}
                    options={[
                      { value: 'auto', label: 'Automatisch' },
                      { value: 'force', label: 'Immer' },
                      { value: 'off', label: 'Aus' },
                    ]}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  «Automatisch» nutzt OCR nur für Seiten ohne Textebene (Scans). Beim ersten OCR-Einsatz werden einmalig ca. 10–20 MB Sprachdaten (Französisch, Deutsch) aus dem Internet geladen.
                </p>
              </>
            )}
            {source === 'text' && (
              <>
                <Textarea
                  rows={9}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'la maison – das Haus\nle chien = der Hund\nmanger\tessen'}
                  className="font-mono text-sm"
                />
                <div className="mt-3 flex justify-between gap-2">
                  <p className="text-xs text-muted">Eine Vokabel pro Zeile. Trenner: – , =, Tab, «;» oder « : ». Überschriften wie «Unité 3» werden als Kapitel erkannt.</p>
                  <Button variant="primary" onClick={parseText} disabled={!text.trim()}>Erkennen</Button>
                </div>
              </>
            )}
            {source === 'csv' && (
              <div className="rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center">
                <IconFile size={28} className="mx-auto text-faint" />
                <p className="mt-2 text-sm text-muted">CSV mit Spalten «Französisch» und «Deutsch» (optional Genus, Plural, Wortart, Beispiel, Kapitel). Trennzeichen ; , oder Tab.</p>
                <label className="mt-4 inline-block">
                  <span className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-line bg-surface px-4 text-[15px] font-medium hover:bg-surface-2">Datei wählen</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      if (f.size > 10 * 1024 * 1024) return toast('Datei zu gross (max. 10 MB).', 'bad')
                      parseCsvText(await f.text(), f.name)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            )}
          </div>
          {busy && (
            <div className="mt-5 rounded-xl bg-surface-2 p-4">
              <div className="flex justify-between text-sm">
                <span className="truncate font-medium">{busy.file}</span>
                <span className="text-muted">
                  {busy.p.phase === 'ocr-laden' ? 'OCR wird geladen …' : busy.p.phase === 'ocr' ? `OCR Seite ${busy.p.page}/${busy.p.pages}` : `Seite ${busy.p.page}/${busy.p.pages}`}
                </span>
              </div>
              <Progress className="mt-2" value={busy.p.phase === 'ocr' && busy.p.ocrProgress != null ? (busy.p.page - 1 + busy.p.ocrProgress) / busy.p.pages : busy.p.page / busy.p.pages} />
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => abort.current?.abort()}>Abbrechen</Button>
            </div>
          )}
          {errors.map((e) => (
            <p key={e} className="mt-3 flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              <IconAlert size={16} className="mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </Card>

        <Card className="space-y-4 p-5">
          <Field label="Importieren in">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">Neue Liste {source === 'pdf' ? '(pro Datei)' : ''}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          {target === 'new' && (
            <>
              <Field label="Name der Liste" hint="Leer lassen = Dateiname">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Unité 3" />
              </Field>
              <div>
                <div className="mb-1.5 text-sm font-medium">Kategorie</div>
                <Segmented value={category} onChange={setCategory} options={(['kapitel', 'thema', 'pruefung'] as ListCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
              </div>
            </>
          )}
          {rows.length > 0 && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex justify-between"><span>Erkannt</span><span className="tabular-nums">{stats.total}</span></div>
              <div className="flex justify-between text-warn"><span>Zu prüfen</span><span className="tabular-nums">{stats.flagged}</span></div>
              <div className="flex justify-between text-muted"><span>Duplikate (abgewählt)</span><span className="tabular-nums">{stats.dups}</span></div>
              <div className="flex justify-between text-muted"><span>Unvollständig</span><span className="tabular-nums">{stats.incomplete}</span></div>
              <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium"><span>Wird importiert</span><span className="tabular-nums">{stats.included}</span></div>
            </div>
          )}
          <Button variant="primary" className="w-full" disabled={!stats.included || !!busy} onClick={doImport}>
            <IconCheck size={17} /> {stats.included} Wörter importieren
          </Button>
          {rows.length > 0 && (
            <Button variant="ghost" className="w-full" onClick={() => { setRows([]); setRaw([]); setErrors([]) }}>
              Vorschau leeren
            </Button>
          )}
        </Card>
      </div>

      {rows.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div>
              <h2 className="font-semibold">Vorschau</h2>
              <p className="text-sm text-muted">Felder direkt bearbeiten. Unvollständige Einträge können erst nach Ergänzung importiert werden – es wird nichts erfunden.</p>
            </div>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'alle', label: `Alle (${rows.length})` },
                { value: 'pruefen', label: `Prüfen (${rows.filter((r) => r.issues.length || !r.fr || !r.de).length})` },
                { value: 'aus', label: 'Abgewählt' },
              ]}
            />
          </div>
          <div className="hidden grid-cols-[32px_1fr_1fr_0.7fr_92px] gap-2 bg-surface-2 px-4 py-2 text-xs font-medium text-muted md:grid">
            <input
              type="checkbox"
              aria-label="Alle sichtbaren an/aus"
              checked={shown.length > 0 && shown.every((r) => r.include)}
              onChange={(e) => {
                const ids = new Set(shown.map((r) => r.tempId))
                setRows((rs) => rs.map((r) => (ids.has(r.tempId) && r.fr && r.de ? { ...r, include: e.target.checked } : r)))
              }}
            />
            <span>Französisch</span>
            <span>Deutsch</span>
            <span>Kapitel</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {shown.slice(0, limit).map((r) => (
              <PreviewRow key={r.tempId} r={r} update={update} remove={() => setRows((rs) => rs.filter((x) => x.tempId !== r.tempId))} />
            ))}
          </ul>
          {shown.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 300)}>Weitere {shown.length - limit} anzeigen</Button>
            </div>
          )}
        </Card>
      )}

      {raw.length > 0 && (
        <details className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">Erkannter Rohtext ({raw.length} Seiten)</summary>
          <div className="mt-3 max-h-80 space-y-3 overflow-auto text-xs text-muted">
            {raw.map((p) => (
              <div key={p.file + p.page}>
                <div className="font-medium text-ink">
                  {p.file} · Seite {p.page} {p.ocr && <Badge tone="warn">OCR</Badge>}
                </div>
                <p className="mt-1 font-mono whitespace-pre-wrap">{p.text || '(kein Text)'}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function PreviewRow({ r, update, remove }: { r: Row; update: (id: string, p: Partial<Row>) => void; remove: () => void }) {
  const [open, setOpen] = useState(false)
  const incomplete = !r.fr || !r.de
  return (
    <li className={cx('px-4 py-2.5', !r.include && 'bg-surface-2/50', r.issues.length > 0 && r.include && 'bg-warn-soft/30')}>
      <div className="grid grid-cols-[28px_1fr] items-center gap-2 md:grid-cols-[32px_1fr_1fr_0.7fr_92px]">
        <input type="checkbox" checked={r.include} disabled={incomplete} onChange={(e) => update(r.tempId, { include: e.target.checked })} aria-label="Übernehmen" />
        <div className="grid gap-2 md:contents">
          <Input value={r.fr} onChange={(e) => update(r.tempId, { fr: e.target.value })} placeholder="Französisch fehlt" lang="fr" className={cx('h-9 font-serif', !r.fr && 'border-bad')} />
          <Input value={r.de} onChange={(e) => update(r.tempId, { de: e.target.value })} placeholder="Übersetzung fehlt" className={cx('h-9', !r.de && 'border-bad')} />
          <Input value={r.chapter} onChange={(e) => update(r.tempId, { chapter: e.target.value })} placeholder="Kapitel" className="h-9 text-sm" />
          <div className="flex items-center justify-end gap-0.5">
            <button onClick={() => update(r.tempId, { fr: r.de, de: r.fr })} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" title="Sprachen tauschen" aria-label="Sprachen tauschen">⇄</button>
            <button onClick={() => setOpen(!open)} className="rounded-lg p-1.5 text-xs text-muted hover:bg-surface-2" aria-expanded={open}>mehr</button>
            <button onClick={remove} className="rounded-lg p-1.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label="Entfernen"><IconTrash size={15} /></button>
          </div>
        </div>
      </div>
      {(r.issues.length > 0 || r.gender || r.plural || r.pos || r.example) && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-[36px] md:pl-[40px]">
          {r.issues.map((i) => (
            <Badge key={i} tone={i === 'Duplikat' ? 'neutral' : 'warn'}>{i}</Badge>
          ))}
          {r.duplicateOf && <span className="text-xs text-muted">{r.duplicateOf}</span>}
          {r.gender && <Badge>{r.gender}</Badge>}
          {r.pos && <Badge>{r.pos}</Badge>}
          {r.plural && <Badge>Pl. {r.plural}</Badge>}
          {r.example && <Badge tone="accent">Beispielsatz</Badge>}
          <span className="text-xs text-faint">S. {r.page}</span>
        </div>
      )}
      {open && (
        <div className="mt-3 grid gap-2 pl-[36px] sm:grid-cols-3 md:pl-[40px]">
          <Select value={r.gender} onChange={(e) => update(r.tempId, { gender: e.target.value as Row['gender'] })} className="h-9 text-sm">
            <option value="">Genus –</option>
            <option value="m">maskulin</option>
            <option value="f">feminin</option>
            <option value="m/f">m/f</option>
          </Select>
          <Input value={r.plural} onChange={(e) => update(r.tempId, { plural: e.target.value })} placeholder="Plural" className="h-9 text-sm" />
          <Input value={r.pos} onChange={(e) => update(r.tempId, { pos: e.target.value })} placeholder="Wortart" className="h-9 text-sm" />
          <Input value={r.example} onChange={(e) => update(r.tempId, { example: e.target.value })} placeholder="Beispielsatz (FR)" className="h-9 text-sm sm:col-span-2" lang="fr" />
          <Input value={r.exampleDe} onChange={(e) => update(r.tempId, { exampleDe: e.target.value })} placeholder="Übersetzung des Satzes" className="h-9 text-sm" />
        </div>
      )}
    </li>
  )
}
