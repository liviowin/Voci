import { useMemo, useState } from 'react'
import { Link, navigate } from '../router'
import { addWords, createList, deleteList, deleteWords, getState, resetProgress, updateList, updateWords, useStore } from '../store/store'
import { STAGES, stageLabelShort, useLearnData, useStats } from '../store/derived'
import { cardId, cardStage, currentR, wordStage } from '../lib/engine'
import { formatInterval } from '../lib/fsrs'
import { downloadFile, wordsToCsv } from '../lib/backup'
import { suggestExamples } from '../lib/ai'
import { DIRECTIONS, STAGE_LABEL, type ListCategory, type Stage, type VocabList, type Word } from '../lib/types'
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Segmented, Select, Textarea, Toggle, cx, toast, useConfirm } from '../components/ui'
import { Legend, StackBar, STAGE_COLORS } from '../components/charts'
import { IconDownload, IconEdit, IconList, IconPlay, IconPlus, IconSearch, IconSparkle, IconTrash, IconUpload } from '../components/icons'
import { sessionUrl } from './Session'

export const CATEGORY_LABEL: Record<ListCategory, string> = { thema: 'Thema', kapitel: 'Kapitel', pruefung: 'Prüfung' }

export function ListForm({ initial, onSave, onCancel }: { initial?: Partial<VocabList>; onSave: (v: Pick<VocabList, 'name' | 'category' | 'description'>) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<ListCategory>(initial?.category ?? 'kapitel')
  const [description, setDescription] = useState(initial?.description ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSave({ name: name.trim().slice(0, 120), category, description: description.slice(0, 500) })
      }}
      className="space-y-4"
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Unité 4 – La ville" autoFocus required maxLength={120} />
      </Field>
      <div>
        <div className="mb-1.5 text-sm font-medium">Ordnen nach</div>
        <Segmented value={category} onChange={setCategory} options={(['kapitel', 'thema', 'pruefung'] as ListCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
      </div>
      <Field label="Beschreibung (optional)">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel}>Abbrechen</Button>
        <Button variant="primary" type="submit" disabled={!name.trim()}>Speichern</Button>
      </div>
    </form>
  )
}

export function ListsPage() {
  const lists = useStore((s) => s.lists)
  const words = useStore((s) => s.words)
  const s = useStats()
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'alle' | ListCategory>('alle')
  const shown = lists.filter((l) => filter === 'alle' || l.category === filter)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const w of words.values()) c[w.listId] = (c[w.listId] ?? 0) + 1
    return c
  }, [words])

  return (
    <>
      <PageHeader
        title="Vokabellisten"
        sub={`${lists.length} Listen · ${words.size} Wörter`}
        action={
          <>
            <Button onClick={() => setCreating(true)}>
              <IconPlus size={17} /> Neue Liste
            </Button>
            <Button variant="primary" onClick={() => navigate('/import')}>
              <IconUpload size={17} /> Importieren
            </Button>
          </>
        }
      />
      {lists.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[{ value: 'alle', label: 'Alle' }, ...(['kapitel', 'thema', 'pruefung'] as ListCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
          />
          <Button variant="ghost" size="sm" onClick={() => downloadFile('vokabeln.csv', wordsToCsv([...words.values()], lists), 'text/csv;charset=utf-8')}>
            <IconDownload size={16} /> Alle als CSV
          </Button>
        </div>
      )}
      {lists.length === 0 ? (
        <Empty icon={<IconList size={30} />} title="Noch keine Listen" action={<Button variant="primary" onClick={() => navigate('/import')}>PDF importieren</Button>}>
          Importiere eine PDF oder lege eine Liste an und trage Wörter von Hand ein.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => {
            const c = s.byList.get(l.id)
            const total = counts[l.id] ?? 0
            return (
              <Link key={l.id} to={`/listen/${l.id}`} className="group rounded-2xl border border-line bg-surface p-5 transition hover:border-faint hover:shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium group-hover:text-accent">{l.name}</div>
                  <Badge>{CATEGORY_LABEL[l.category]}</Badge>
                </div>
                {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{l.description}</p>}
                <div className="mt-4 mb-2 flex justify-between text-sm text-muted">
                  <span>{total} Wörter</span>
                  <span className="tabular-nums">{c?.beherrscht ?? 0} beherrscht</span>
                </div>
                <StackBar parts={STAGES.map((k) => ({ key: k, value: c?.[k] ?? 0, label: stageLabelShort[k] }))} />
              </Link>
            )
          })}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Neue Liste">
        <ListForm
          onCancel={() => setCreating(false)}
          onSave={async (v) => {
            const l = await createList(v)
            setCreating(false)
            navigate(`/listen/${l.id}`)
          }}
        />
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- Liste im Detail

type Filter = 'alle' | Stage | 'ausgeschlossen' | 'bekannt' | 'ohne-satz'

const emptyWord = (listId: string): Word => ({
  id: '',
  listId,
  fr: '',
  de: '',
  gender: '',
  plural: '',
  pos: '',
  example: '',
  exampleDe: '',
  notes: '',
  chapter: '',
  excluded: false,
  known: false,
  createdAt: 0,
  updatedAt: 0,
})

export function ListDetailPage({ id }: { id: string }) {
  const list = useStore((s) => s.lists.find((l) => l.id === id))
  const lists = useStore((s) => s.lists)
  const settings = useStore((s) => s.settings)
  const data = useLearnData()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [chapter, setChapter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Word | null>(null)
  const [editList, setEditList] = useState(false)
  const [limit, setLimit] = useState(150)
  const [aiBusy, setAiBusy] = useState(false)
  const { ask, node } = useConfirm()

  const all = useMemo(() => [...data.words.values()].filter((w) => w.listId === id).sort((a, b) => a.createdAt - b.createdAt), [data.words, id])
  const chapters = useMemo(() => [...new Set(all.map((w) => w.chapter).filter(Boolean))] as string[], [all])
  const stageOf = (w: Word) => wordStage(w, DIRECTIONS.map((d) => data.cards.get(cardId(w.id, d))))
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((w) => {
      if (needle && !`${w.fr} ${w.de} ${w.notes ?? ''}`.toLowerCase().includes(needle)) return false
      if (chapter && w.chapter !== chapter) return false
      if (filter === 'alle') return true
      if (filter === 'ausgeschlossen') return w.excluded
      if (filter === 'bekannt') return w.known
      if (filter === 'ohne-satz') return !w.example
      return !w.excluded && stageOf(w) === filter
    })
  }, [all, q, filter, chapter, data.cards]) // eslint-disable-line react-hooks/exhaustive-deps
  const stageCounts = useMemo(() => {
    const c: Record<Stage, number> = { neu: 0, lernend: 0, wiederholung: 0, vergessen: 0, beherrscht: 0 }
    all.forEach((w) => !w.excluded && c[stageOf(w)]++)
    return c
  }, [all, data.cards]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!list) return <Empty title="Liste nicht gefunden" action={<Button onClick={() => navigate('/listen')}>Zu den Listen</Button>} />

  const sel = [...selected]
  const toggle = (wid: string) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(wid)) n.delete(wid)
    else n.add(wid)
    return n
  })
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id))

  const runAi = async () => {
    const targets = (sel.length ? sel.map((x) => data.words.get(x)!) : rows).filter((w) => w && !w.example).slice(0, 25)
    if (!targets.length) return toast('Alle ausgewählten Wörter haben bereits einen Beispielsatz.')
    setAiBusy(true)
    try {
      const res = await suggestExamples(targets, settings.aiApiKey, settings.aiModel)
      for (const r of res) await updateWords([r.wordId], { example: r.example, exampleDe: r.exampleDe, exampleSource: 'ai' })
      toast(`${res.length} Beispielsätze ergänzt (als «KI» markiert – bitte prüfen).`, 'good')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/listen" className="text-muted hover:text-ink">← Vokabellisten</Link>
      </div>
      <PageHeader
        title={list.name}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge>{CATEGORY_LABEL[list.category]}</Badge> {all.length} Wörter {list.sourceFile && <span>· aus «{list.sourceFile}»</span>}
          </span>
        }
        action={
          <>
            <Button variant="ghost" onClick={() => setEditList(true)} aria-label="Liste bearbeiten">
              <IconEdit size={17} />
            </Button>
            <Button onClick={() => navigate(`/import?list=${id}`)}>
              <IconUpload size={17} /> Importieren
            </Button>
            <Button onClick={() => setEditing(emptyWord(id))}>
              <IconPlus size={17} /> Wort
            </Button>
            <Button variant="primary" onClick={() => navigate(sessionUrl({ mode: 'smart', lists: [id] }))} disabled={!all.length}>
              <IconPlay size={17} /> Lernen
            </Button>
          </>
        }
      />

      <Card className="mb-5 p-4">
        <StackBar parts={STAGES.map((k) => ({ key: k, value: stageCounts[k], label: stageLabelShort[k] }))} />
        <div className="mt-3">
          <Legend parts={STAGES.map((k) => ({ key: k, value: stageCounts[k], label: STAGE_LABEL[k] }))} />
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …" className="pl-9" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="w-auto">
          <option value="alle">Alle Wörter</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s]}</option>
          ))}
          <option value="bekannt">Als bekannt markiert</option>
          <option value="ausgeschlossen">Ausgeschlossen</option>
          <option value="ohne-satz">Ohne Beispielsatz</option>
        </Select>
        {chapters.length > 0 && (
          <Select value={chapter} onChange={(e) => setChapter(e.target.value)} className="w-auto max-w-[220px]">
            <option value="">Alle Kapitel</option>
            {chapters.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        )}
      </div>

      {sel.length > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm lg:top-2">
          <span className="px-2 text-sm font-medium">{sel.length} ausgewählt</span>
          <Button size="sm" variant="ghost" onClick={() => updateWords(sel, { excluded: true }).then(() => setSelected(new Set()))}>Ausschliessen</Button>
          <Button size="sm" variant="ghost" onClick={() => updateWords(sel, { excluded: false }).then(() => setSelected(new Set()))}>Einschliessen</Button>
          <Button size="sm" variant="ghost" onClick={() => updateWords(sel, { known: true }).then(() => setSelected(new Set()))}>Als bekannt</Button>
          <Button size="sm" variant="ghost" onClick={() => updateWords(sel, { known: false }).then(() => setSelected(new Set()))}>Nicht bekannt</Button>
          {lists.length > 1 && (
            <Select
              className="h-8 w-auto py-0 text-sm"
              value=""
              onChange={(e) => e.target.value && updateWords(sel, { listId: e.target.value }).then(() => { setSelected(new Set()); toast('Verschoben') })}
            >
              <option value="">Verschieben nach …</option>
              {lists.filter((l) => l.id !== id).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          )}
          <Button size="sm" variant="ghost" onClick={async () => (await ask(`Lernfortschritt von ${sel.length} Wörtern zurücksetzen?`)) && resetProgress(sel).then(() => setSelected(new Set()))}>
            Fortschritt zurücksetzen
          </Button>
          <Button size="sm" variant="danger" onClick={async () => (await ask(`${sel.length} Wörter endgültig löschen?`)) && deleteWords(sel).then(() => setSelected(new Set()))}>
            <IconTrash size={15} /> Löschen
          </Button>
        </div>
      )}

      {all.length === 0 ? (
        <Empty title="Diese Liste ist leer" action={<Button variant="primary" onClick={() => navigate(`/import?list=${id}`)}>Wörter importieren</Button>}>
          Importiere eine PDF, füge Text ein oder lege Wörter einzeln an.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[36px_1.2fr_1.2fr_0.8fr_130px] gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted md:grid">
            <input type="checkbox" checked={allSel} onChange={() => setSelected(allSel ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Alle auswählen" />
            <span>Französisch</span>
            <span>Deutsch</span>
            <span>Kapitel</span>
            <span>Stand</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.slice(0, limit).map((w) => {
              const st = stageOf(w)
              return (
                <li key={w.id} className={cx('grid grid-cols-[28px_1fr] items-center gap-x-3 px-4 py-2.5 transition hover:bg-surface-2/60 md:grid-cols-[36px_1.2fr_1.2fr_0.8fr_130px]', w.excluded && 'opacity-50')}>
                  <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} aria-label={`${w.fr} auswählen`} />
                  <button onClick={() => setEditing(w)} className="min-w-0 text-left md:contents">
                    <span className="block truncate font-serif text-[17px]">{w.fr}</span>
                    <span className="block truncate text-sm text-muted md:text-[15px] md:text-ink">{w.de}</span>
                    <span className="hidden truncate text-sm text-muted md:block">{w.chapter}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted md:mt-0">
                      <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[st] }} />
                      {w.excluded ? 'ausgeschlossen' : stageLabelShort[st]}
                      {w.example && <span title="Beispielsatz vorhanden" className="text-faint">· Satz</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {rows.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 300)}>Weitere {rows.length - limit} anzeigen</Button>
            </div>
          )}
        </Card>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => downloadFile(`${list.name}.csv`, wordsToCsv(all, [list]), 'text/csv;charset=utf-8')}>
            <IconDownload size={16} /> CSV exportieren
          </Button>
          {settings.aiEnabled && (
            <Button variant="ghost" size="sm" onClick={runAi} disabled={aiBusy}>
              <IconSparkle size={16} /> {aiBusy ? 'KI arbeitet …' : 'Beispielsätze per KI ergänzen'}
            </Button>
          )}
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={async () => {
            if (await ask(`Liste «${list.name}» mit allen ${all.length} Wörtern und dem Lernfortschritt löschen?`)) {
              await deleteList(id)
              navigate('/listen')
            }
          }}
        >
          <IconTrash size={15} /> Liste löschen
        </Button>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Wort bearbeiten' : 'Neues Wort'} wide>
        {editing && <WordEditor word={editing} chapters={chapters} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={editList} onClose={() => setEditList(false)} title="Liste bearbeiten">
        <ListForm initial={list} onCancel={() => setEditList(false)} onSave={(v) => updateList(id, v).then(() => setEditList(false))} />
      </Modal>
      {node}
    </>
  )
}

function WordEditor({ word, chapters, onClose }: { word: Word; chapters: string[]; onClose: () => void }) {
  const [w, setW] = useState<Word>(word)
  const cards = useStore((s) => s.cards)
  const { ask, node } = useConfirm()
  const set = (p: Partial<Word>) => setW((x) => ({ ...x, ...p }))
  const valid = w.fr.trim() && w.de.trim()
  const save = async () => {
    const clean = {
      ...w,
      fr: w.fr.trim().slice(0, 300),
      de: w.de.trim().slice(0, 300),
      example: w.example?.trim().slice(0, 600),
      exampleDe: w.exampleDe?.trim().slice(0, 600),
      exampleSource: w.example !== word.example ? ('user' as const) : w.exampleSource,
    }
    if (!word.id) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = clean
      void _id; void _c; void _u
      await addWords([rest])
      toast('Wort hinzugefügt', 'good')
      setW({ ...word })
      return
    }
    await updateWords([word.id], clean)
    onClose()
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Französisch (mit Artikel)" hint="Alternativen mit Komma trennen, optionale Teile in Klammern: (se) promener">
          <Input value={w.fr} onChange={(e) => set({ fr: e.target.value })} lang="fr" autoFocus className="font-serif text-[17px]" />
        </Field>
        <Field label="Deutsch" hint="Mehrere Bedeutungen mit Komma trennen">
          <Input value={w.de} onChange={(e) => set({ de: e.target.value })} />
        </Field>
        <Field label="Genus">
          <Select value={w.gender ?? ''} onChange={(e) => set({ gender: e.target.value as Word['gender'] })}>
            <option value="">–</option>
            <option value="m">maskulin</option>
            <option value="f">feminin</option>
            <option value="m/f">m/f</option>
          </Select>
        </Field>
        <Field label="Plural">
          <Input value={w.plural ?? ''} onChange={(e) => set({ plural: e.target.value })} lang="fr" />
        </Field>
        <Field label="Wortart">
          <Input value={w.pos ?? ''} onChange={(e) => set({ pos: e.target.value })} list="pos-list" />
          <datalist id="pos-list">
            {['Nomen', 'Verb', 'Verb (pronominal)', 'Adjektiv', 'Adverb', 'Präposition', 'Konjunktion', 'Pronomen', 'Ausdruck'].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Kapitel / Lektion">
          <Input value={w.chapter ?? ''} onChange={(e) => set({ chapter: e.target.value })} list="chapter-list" />
          <datalist id="chapter-list">
            {chapters.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Beispielsatz (Französisch)" hint="Wird im Kontextmodus als Lückensatz verwendet, wenn das Wort darin vorkommt.">
        <Textarea rows={2} value={w.example ?? ''} onChange={(e) => set({ example: e.target.value })} lang="fr" className="font-serif" />
      </Field>
      <Field label="Übersetzung des Beispielsatzes">
        <Input value={w.exampleDe ?? ''} onChange={(e) => set({ exampleDe: e.target.value })} />
      </Field>
      <Field label="Notizen">
        <Input value={w.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Toggle checked={w.excluded} onChange={(v) => set({ excluded: v })} label="Vom Lernen ausschliessen" />
        <Toggle checked={w.known} onChange={(v) => set({ known: v })} label="Bereits bekannt" hint="Wird nicht abgefragt, zählt als beherrscht" />
      </div>
      {word.id && (
        <div className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-2">
          {DIRECTIONS.map((d) => {
            const c = cards.get(cardId(word.id, d))
            return (
              <div key={d}>
                <div className="font-medium">{d === 'fr-de' ? 'FR → DE' : 'DE → FR'}</div>
                {c && c.reps > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-muted">
                    <li>{STAGE_LABEL[cardStage(c)]} · {c.reps}× abgefragt</li>
                    <li>{c.correct} richtig, {c.wrong} falsch, {c.lapses}× vergessen</li>
                    <li>Stabilität ≈ {c.stability < 1 ? '<1' : Math.round(c.stability)} Tage · Abruf jetzt ≈ {Math.round(currentR(c, Date.now()) * 100)} %</li>
                    <li>Nächste Abfrage: {c.due <= Date.now() ? 'jetzt fällig' : `in ${formatInterval(c.due - Date.now())}`}</li>
                    {c.recentErrors.length > 0 && <li>Letzte Fehler: {c.recentErrors.map((x) => `«${x}»`).join(', ')}</li>}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted">Noch nicht gelernt</p>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <div className="flex gap-2">
          {word.id && (
            <>
              <Button variant="danger" onClick={async () => (await ask('Dieses Wort löschen?')) && deleteWords([word.id]).then(onClose)}>
                <IconTrash size={15} /> Löschen
              </Button>
              <Button variant="ghost" onClick={async () => (await ask('Lernfortschritt dieses Wortes zurücksetzen?')) && resetProgress([word.id]).then(onClose)}>
                Zurücksetzen
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onClose}>{word.id ? 'Abbrechen' : 'Fertig'}</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {word.id ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </div>
      </div>
      {node}
    </div>
  )
}

export const listName = (id: string) => getState().lists.find((l) => l.id === id)?.name ?? ''
