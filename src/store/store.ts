/**
 * Zentraler App-Zustand: im Speicher gehalten (schnell), jede Änderung
 * wird sofort in IndexedDB geschrieben (dauerhaft).
 */
import { useSyncExternalStore } from 'react'
import { clearAll, getAll, getKv, setKv, uid, write, type WriteOp } from '../lib/db'
import { review, type Rating } from '../lib/fsrs'
import { cardId, newCard, paramsFrom } from '../lib/engine'
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupData } from '../lib/backup'
import {
  DEFAULT_SETTINGS,
  DIRECTIONS,
  type Card,
  type ExamPlan,
  type LearnMode,
  type ReviewLog,
  type Settings,
  type TestResult,
  type VocabList,
  type Word,
} from '../lib/types'

export interface AppState {
  loaded: boolean
  error: string | null
  lists: VocabList[]
  words: Map<string, Word>
  cards: Map<string, Card>
  logs: ReviewLog[]
  exams: ExamPlan[]
  tests: TestResult[]
  settings: Settings
  dataVersion: number // zählt Änderungen (für Backup-Hinweis)
  backupVersion: number
}

let state: AppState = {
  loaded: false,
  error: null,
  lists: [],
  words: new Map(),
  cards: new Map(),
  logs: [],
  exams: [],
  tests: [],
  settings: DEFAULT_SETTINGS,
  dataVersion: 0,
  backupVersion: 0,
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
function set(patch: Partial<AppState>, changed = true) {
  state = { ...state, ...patch, dataVersion: changed ? state.dataVersion + 1 : state.dataVersion }
  emit()
}

export const getState = () => state
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
  )
}

async function persist(ops: WriteOp[]) {
  try {
    await write(ops)
    await setKv('dataVersion', state.dataVersion)
  } catch (e) {
    set({ error: `Speichern fehlgeschlagen: ${(e as Error).message}` }, false)
  }
}

export async function load() {
  try {
    const [lists, words, cards, logs, exams, tests, settings, dataVersion, backupVersion] = await Promise.all([
      getAll<VocabList>('lists'),
      getAll<Word>('words'),
      getAll<Card>('cards'),
      getAll<ReviewLog>('logs'),
      getAll<ExamPlan>('exams'),
      getAll<TestResult>('tests'),
      getKv<Settings>('settings'),
      getKv<number>('dataVersion'),
      getKv<number>('backupVersion'),
    ])
    logs.sort((a, b) => a.ts - b.ts)
    lists.sort((a, b) => a.createdAt - b.createdAt)
    state = {
      ...state,
      loaded: true,
      lists,
      words: new Map(words.map((w) => [w.id, w])),
      cards: new Map(cards.map((c) => [c.id, c])),
      logs,
      exams,
      tests: tests.sort((a, b) => b.ts - a.ts),
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      dataVersion: dataVersion ?? 0,
      backupVersion: backupVersion ?? 0,
    }
    emit()
  } catch (e) {
    set({ loaded: true, error: (e as Error).message }, false)
  }
}

export const clearError = () => set({ error: null }, false)

// ------------------------------------------------------------------ Einstellungen

export async function saveSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch }
  set({ settings }, false)
  await setKv('settings', settings)
}

// ------------------------------------------------------------------ Listen

export async function createList(data: Pick<VocabList, 'name' | 'category'> & Partial<VocabList>): Promise<VocabList> {
  const now = Date.now()
  const list: VocabList = { description: '', ...data, id: uid(), createdAt: now, updatedAt: now }
  set({ lists: [...state.lists, list] })
  await persist([{ store: 'lists', put: [list] }])
  return list
}

export async function updateList(id: string, patch: Partial<VocabList>) {
  const lists = state.lists.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: Date.now() } : l))
  set({ lists })
  await persist([{ store: 'lists', put: lists.filter((l) => l.id === id) }])
}

export async function deleteList(id: string) {
  const wordIds = [...state.words.values()].filter((w) => w.listId === id).map((w) => w.id)
  await deleteWords(wordIds)
  set({ lists: state.lists.filter((l) => l.id !== id), exams: state.exams.map((e) => ({ ...e, listIds: e.listIds.filter((x) => x !== id) })) })
  await persist([{ store: 'lists', del: [id] }, { store: 'exams', put: state.exams }])
}

// ------------------------------------------------------------------ Wörter

export type NewWord = Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'excluded' | 'known'> & Partial<Pick<Word, 'excluded' | 'known'>>

export async function addWords(items: NewWord[]): Promise<Word[]> {
  const now = Date.now()
  const words = new Map(state.words)
  const cards = new Map(state.cards)
  const created: Word[] = []
  const newCards: Card[] = []
  items.forEach((it, i) => {
    const w: Word = { excluded: false, known: false, ...it, id: uid(), createdAt: now + i, updatedAt: now + i }
    words.set(w.id, w)
    created.push(w)
    for (const d of DIRECTIONS) {
      const c = newCard(w.id, d, now)
      cards.set(c.id, c)
      newCards.push(c)
    }
  })
  set({ words, cards })
  await persist([
    { store: 'words', put: created },
    { store: 'cards', put: newCards },
  ])
  return created
}

export async function updateWords(ids: string[], patch: Partial<Word> | ((w: Word) => Partial<Word>)) {
  const words = new Map(state.words)
  const changed: Word[] = []
  for (const id of ids) {
    const w = words.get(id)
    if (!w) continue
    const p = typeof patch === 'function' ? patch(w) : patch
    const nw = { ...w, ...p, id: w.id, updatedAt: Date.now() }
    words.set(id, nw)
    changed.push(nw)
  }
  set({ words })
  await persist([{ store: 'words', put: changed }])
}

export async function deleteWords(ids: string[]) {
  if (!ids.length) return
  const idSet = new Set(ids)
  const words = new Map(state.words)
  const cards = new Map(state.cards)
  const cardIds: string[] = []
  for (const id of ids) {
    words.delete(id)
    for (const d of DIRECTIONS) {
      cards.delete(cardId(id, d))
      cardIds.push(cardId(id, d))
    }
  }
  const removedLogs = state.logs.filter((l) => idSet.has(l.wordId)).map((l) => l.id)
  set({ words, cards, logs: state.logs.filter((l) => !idSet.has(l.wordId)) })
  await persist([
    { store: 'words', del: ids },
    { store: 'cards', del: cardIds },
    { store: 'logs', del: removedLogs },
  ])
}

/** Lernfortschritt einzelner Wörter zurücksetzen */
export async function resetProgress(wordIds: string[]) {
  const cards = new Map(state.cards)
  const put: Card[] = []
  for (const id of wordIds)
    for (const d of DIRECTIONS) {
      const c = newCard(id, d, Date.now())
      cards.set(c.id, c)
      put.push(c)
    }
  set({ cards })
  await persist([{ store: 'cards', put }])
}

// ------------------------------------------------------------------ Bewertungen

export interface ReviewInput {
  cardId: string
  rating: Rating
  mode: LearnMode
  correct: boolean
  hinted?: boolean
  durationMs: number
  answer?: string
  /** false = nur protokollieren (Prüfungssimulation), Planung bleibt unverändert */
  scheduled?: boolean
}

export interface UndoToken {
  prev: Card
  logId: string
}

export async function recordReview(r: ReviewInput): Promise<{ card: Card; undo: UndoToken }> {
  const now = Date.now()
  const [wordId, direction] = r.cardId.split(':') as [string, Card['direction']]
  const prev = state.cards.get(r.cardId) ?? newCard(wordId, direction, now)
  const scheduled = r.scheduled !== false
  let card: Card = { ...prev }
  if (scheduled) card = { ...card, ...review(prev, r.rating, now, paramsFrom(state.settings)) }
  if (r.correct) card.correct++
  else {
    card.wrong++
    if (r.answer && r.answer.trim()) card.recentErrors = [...card.recentErrors, r.answer.trim().slice(0, 100)].slice(-5)
  }
  const log: ReviewLog = {
    id: uid(),
    cardId: r.cardId,
    wordId,
    direction,
    ts: now,
    rating: r.rating,
    mode: r.mode,
    correct: r.correct,
    hinted: !!r.hinted,
    durationMs: Math.min(60_000, Math.max(0, Math.round(r.durationMs))),
    stateBefore: prev.state,
    scheduled,
    answer: r.answer?.slice(0, 200),
  }
  const cards = new Map(state.cards)
  cards.set(card.id, card)
  set({ cards, logs: [...state.logs, log] })
  await persist([
    { store: 'cards', put: [card] },
    { store: 'logs', put: [log] },
  ])
  return { card, undo: { prev, logId: log.id } }
}

export async function undoReview(t: UndoToken) {
  const cards = new Map(state.cards)
  cards.set(t.prev.id, t.prev)
  set({ cards, logs: state.logs.filter((l) => l.id !== t.logId) })
  await persist([
    { store: 'cards', put: [t.prev] },
    { store: 'logs', del: [t.logId] },
  ])
}

/** Karte nach einer Prüfungssimulation gezielt als «vergessen» markieren */
export async function markForgotten(cardIds: string[]) {
  for (const id of cardIds) {
    const c = state.cards.get(id)
    if (!c || c.state === 0) continue
    await recordReview({ cardId: id, rating: 1, mode: 'exam', correct: false, durationMs: 0 })
  }
}

// ------------------------------------------------------------------ Prüfungen

export async function saveExam(e: ExamPlan) {
  const exams = state.exams.some((x) => x.id === e.id) ? state.exams.map((x) => (x.id === e.id ? e : x)) : [...state.exams, e]
  set({ exams })
  await persist([{ store: 'exams', put: [e] }])
}
export async function deleteExam(id: string) {
  set({ exams: state.exams.filter((e) => e.id !== id) })
  await persist([{ store: 'exams', del: [id] }])
}
export async function saveTestResult(t: TestResult) {
  set({ tests: [t, ...state.tests] })
  await persist([{ store: 'tests', put: [t] }])
}

// ------------------------------------------------------------------ Sicherung

export function buildBackup(): BackupData {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    lists: state.lists,
    words: [...state.words.values()],
    cards: [...state.cards.values()],
    logs: state.logs,
    exams: state.exams,
    tests: state.tests,
    settings: { ...state.settings, aiApiKey: '' },
  }
}

export async function markBackupDone() {
  const settings = { ...state.settings, lastBackupAt: Date.now() }
  set({ settings, backupVersion: state.dataVersion }, false)
  await setKv('settings', settings)
  await setKv('backupVersion', state.dataVersion)
}

export async function restoreBackup(b: BackupData, mode: 'replace' | 'merge') {
  if (mode === 'replace') {
    await clearAll()
    const settings = { ...b.settings, aiApiKey: state.settings.aiApiKey }
    await write([
      { store: 'lists', put: b.lists },
      { store: 'words', put: b.words },
      { store: 'cards', put: b.cards },
      { store: 'logs', put: b.logs },
      { store: 'exams', put: b.exams },
      { store: 'tests', put: b.tests },
    ])
    await setKv('settings', settings)
  } else {
    // Zusammenführen: vorhandene IDs behalten den neueren Stand
    const newer = <T extends { id: string; updatedAt?: number }>(cur: Map<string, T>, inc: T[]) =>
      inc.filter((x) => !cur.has(x.id) || (x.updatedAt ?? 0) > (cur.get(x.id)!.updatedAt ?? 0))
    const lists = newer(new Map(state.lists.map((l) => [l.id, l])), b.lists)
    const words = newer(state.words, b.words)
    const cards = b.cards.filter((c) => {
      const cur = state.cards.get(c.id)
      return !cur || (c.lastReview ?? 0) > (cur.lastReview ?? 0)
    })
    const logIds = new Set(state.logs.map((l) => l.id))
    await write([
      { store: 'lists', put: lists },
      { store: 'words', put: words },
      { store: 'cards', put: cards },
      { store: 'logs', put: b.logs.filter((l) => !logIds.has(l.id)) },
      { store: 'exams', put: b.exams.filter((e) => !state.exams.some((x) => x.id === e.id)) },
      { store: 'tests', put: b.tests.filter((t) => !state.tests.some((x) => x.id === t.id)) },
    ])
  }
  await load()
}

export async function wipeAll() {
  await clearAll()
  await load()
}
