/** Sicherung (JSON) und Austausch (CSV) – inklusive Validierung importierter Daten. */
import type { Card, ExamPlan, ReviewLog, Settings, TestResult, VocabList, Word } from './types'
import { DEFAULT_SETTINGS } from './types'

export const BACKUP_FORMAT = 'franzoesisch-lernen-backup'
export const BACKUP_VERSION = 1

export interface BackupData {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  lists: VocabList[]
  words: Word[]
  cards: Card[]
  logs: ReviewLog[]
  exams: ExamPlan[]
  tests: TestResult[]
  settings: Settings
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown, max = 2000) => (typeof x === 'string' ? x.slice(0, max) : '')
const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
const bool = (x: unknown) => x === true

/** Prüft und bereinigt eine Sicherungsdatei. Wirft verständliche Fehler. */
export function parseBackup(raw: string): BackupData {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.')
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new Error('Das ist keine Sicherung dieser App.')
  if (num(data.version) > BACKUP_VERSION) throw new Error('Die Sicherung stammt aus einer neueren Version der App.')
  const arr = (k: string) => (Array.isArray(data[k as keyof typeof data]) ? (data[k as keyof typeof data] as unknown[]) : []).filter(isObj)

  const lists: VocabList[] = arr('lists')
    .filter((l) => str(l.id))
    .map((l) => ({
      id: str(l.id, 64),
      name: str(l.name, 200) || 'Ohne Namen',
      category: (['thema', 'kapitel', 'pruefung'].includes(str(l.category)) ? l.category : 'thema') as VocabList['category'],
      description: str(l.description, 1000),
      sourceFile: str(l.sourceFile, 300),
      createdAt: num(l.createdAt, Date.now()),
      updatedAt: num(l.updatedAt, Date.now()),
    }))
  const listIds = new Set(lists.map((l) => l.id))
  const words: Word[] = arr('words')
    .filter((w) => str(w.id) && listIds.has(str(w.listId, 64)))
    .map((w) => ({
      id: str(w.id, 64),
      listId: str(w.listId, 64),
      fr: str(w.fr, 300),
      de: str(w.de, 300),
      gender: (['m', 'f', 'm/f'].includes(str(w.gender)) ? w.gender : '') as Word['gender'],
      plural: str(w.plural, 200),
      pos: str(w.pos, 60),
      example: str(w.example, 600),
      exampleDe: str(w.exampleDe, 600),
      exampleSource: (['pdf', 'user', 'ai'].includes(str(w.exampleSource)) ? w.exampleSource : undefined) as Word['exampleSource'],
      notes: str(w.notes, 1000),
      chapter: str(w.chapter, 200),
      excluded: bool(w.excluded),
      known: bool(w.known),
      createdAt: num(w.createdAt, Date.now()),
      updatedAt: num(w.updatedAt, Date.now()),
    }))
  const wordIds = new Set(words.map((w) => w.id))
  const cards: Card[] = arr('cards')
    .filter((c) => wordIds.has(str(c.wordId, 64)) && ['fr-de', 'de-fr'].includes(str(c.direction)))
    .map((c) => ({
      id: `${str(c.wordId, 64)}:${str(c.direction)}`,
      wordId: str(c.wordId, 64),
      direction: c.direction as Card['direction'],
      state: Math.min(3, Math.max(0, Math.round(num(c.state)))) as Card['state'],
      due: num(c.due, Date.now()),
      stability: Math.max(0, num(c.stability)),
      difficulty: Math.min(10, Math.max(0, num(c.difficulty))),
      reps: num(c.reps),
      lapses: num(c.lapses),
      step: num(c.step),
      lastReview: c.lastReview == null ? null : num(c.lastReview),
      correct: num(c.correct),
      wrong: num(c.wrong),
      recentErrors: Array.isArray(c.recentErrors) ? c.recentErrors.map((e) => str(e, 100)).slice(-5) : [],
    }))
  const logs: ReviewLog[] = arr('logs')
    .filter((l) => wordIds.has(str(l.wordId, 64)))
    .map((l) => ({
      id: str(l.id, 64),
      cardId: str(l.cardId, 100),
      wordId: str(l.wordId, 64),
      direction: (l.direction === 'de-fr' ? 'de-fr' : 'fr-de') as ReviewLog['direction'],
      ts: num(l.ts),
      rating: Math.min(4, Math.max(1, num(l.rating, 3))) as ReviewLog['rating'],
      mode: str(l.mode, 20) as ReviewLog['mode'],
      correct: bool(l.correct),
      hinted: bool(l.hinted),
      durationMs: Math.min(60_000, Math.max(0, num(l.durationMs))),
      stateBefore: num(l.stateBefore),
      scheduled: l.scheduled !== false,
      answer: str(l.answer, 200),
    }))
  const exams: ExamPlan[] = arr('exams').map((e) => ({
    id: str(e.id, 64),
    name: str(e.name, 200),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(e.date)) ? str(e.date) : new Date().toISOString().slice(0, 10),
    listIds: Array.isArray(e.listIds) ? e.listIds.map((x) => str(x, 64)).filter((x) => listIds.has(x)) : [],
    chapters: Array.isArray(e.chapters) ? e.chapters.map((x) => str(x, 200)) : [],
    createdAt: num(e.createdAt, Date.now()),
    archived: bool(e.archived),
  }))
  const tests: TestResult[] = arr('tests').map((t) => ({
    id: str(t.id, 64),
    ts: num(t.ts),
    name: str(t.name, 200),
    listIds: Array.isArray(t.listIds) ? t.listIds.map((x) => str(x, 64)) : [],
    direction: (['fr-de', 'de-fr', 'mixed'].includes(str(t.direction)) ? t.direction : 'mixed') as TestResult['direction'],
    difficulty: (['leicht', 'mittel', 'schwer'].includes(str(t.difficulty)) ? t.difficulty : 'mittel') as TestResult['difficulty'],
    total: num(t.total),
    correct: num(t.correct),
    percent: num(t.percent),
    grade: num(t.grade, 1),
    durationMs: num(t.durationMs),
    mistakes: Array.isArray(t.mistakes)
      ? t.mistakes.filter(isObj).map((m) => ({ wordId: str(m.wordId, 64), prompt: str(m.prompt, 300), expected: str(m.expected, 300), given: str(m.given, 300) }))
      : [],
  }))
  const s = isObj(data.settings) ? data.settings : {}
  const settings: Settings = { ...DEFAULT_SETTINGS }
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = s[k]
    if (v !== undefined && typeof v === typeof DEFAULT_SETTINGS[k]) (settings as unknown as Record<string, unknown>)[k] = v
  }
  settings.aiApiKey = '' // API-Schlüssel werden nie aus Dateien übernommen
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: str(data.exportedAt), lists, words, cards, logs, exams, tests, settings }
}

// ------------------------------------------------------------------ CSV

const csvCell = (v: string) => {
  // Formel-Injection in Tabellenprogrammen verhindern
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function wordsToCsv(words: Word[], lists: VocabList[]): string {
  const names = new Map(lists.map((l) => [l.id, l.name]))
  const head = ['Französisch', 'Deutsch', 'Genus', 'Plural', 'Wortart', 'Beispiel', 'Beispiel (DE)', 'Kapitel', 'Liste', 'Notizen']
  const rows = words.map((w) =>
    [w.fr, w.de, w.gender ?? '', w.plural ?? '', w.pos ?? '', w.example ?? '', w.exampleDe ?? '', w.chapter ?? '', names.get(w.listId) ?? '', w.notes ?? ''].map(csvCell).join(';'),
  )
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}

/** Einfacher CSV-Parser (Trennzeichen ; , oder Tab, Anführungszeichen). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const firstLine = t.split(/\r?\n/)[0] ?? ''
  const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
