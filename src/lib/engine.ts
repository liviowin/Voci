/**
 * Zentrale Lernlogik: Kartenstufen, Tageswarteschlange, Übungsauswahl,
 * Ablenker für Multiple Choice, Prüfungsplan und Statistik-Helfer.
 * Reine Funktionen ohne Seiteneffekte – dadurch gut testbar.
 */
import {
  CardState,
  daysBetween,
  emptyState,
  retrievability,
  type FsrsParams,
  defaultParams,
} from './fsrs'
import { normalize, splitArticle } from './answer'
import type { Card, Direction, ExamPlan, LearnMode, ReviewLog, Settings, Stage, Word } from './types'

export const MASTERED_DAYS = 21
const DAY = 86_400_000

export const cardId = (wordId: string, d: Direction) => `${wordId}:${d}`

export function newCard(wordId: string, direction: Direction, now: number): Card {
  return { ...emptyState(now), id: cardId(wordId, direction), wordId, direction, correct: 0, wrong: 0, recentErrors: [] }
}

export function paramsFrom(s: Settings): FsrsParams {
  return defaultParams({ requestRetention: s.requestRetention, maximumInterval: s.maximumIntervalDays })
}

export function cardStage(c: Card | undefined): Stage {
  if (!c || c.state === CardState.New) return 'neu'
  if (c.state === CardState.Learning) return 'lernend'
  if (c.state === CardState.Relearning) return 'vergessen'
  return c.stability >= MASTERED_DAYS ? 'beherrscht' : 'wiederholung'
}

export function wordStage(w: Word, cards: (Card | undefined)[]): Stage {
  if (w.known) return 'beherrscht'
  const st = cards.map(cardStage)
  if (st.every((s) => s === 'neu')) return 'neu'
  if (st.includes('vergessen')) return 'vergessen'
  if (st.includes('lernend')) return 'lernend'
  if (st.every((s) => s === 'beherrscht')) return 'beherrscht'
  return 'wiederholung'
}

/** Beginn des «Lerntags» (04:00 Uhr) */
export function dayStart(now: number): number {
  const d = new Date(now)
  if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  d.setHours(4, 0, 0, 0)
  return d.getTime()
}
export const dayEnd = (now: number) => dayStart(now) + DAY

export function dateKey(ts: number): string {
  const d = new Date(dayStart(ts))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Aktuelle Abrufwahrscheinlichkeit (Modellschätzung) */
export function currentR(c: Card, now: number): number {
  if (c.state === CardState.New || c.lastReview == null) return 0
  return retrievability(Math.max(0, (now - c.lastReview) / DAY), c.stability)
}

export function isDue(c: Card, now: number): boolean {
  if (c.state === CardState.New) return false
  if (c.state === CardState.Learning || c.state === CardState.Relearning) return c.due <= now + 20 * 60_000
  return c.due < dayEnd(now)
}

// ------------------------------------------------------------ Warteschlange

export interface QueueItem {
  cardId: string
  mode: LearnMode
  isNew: boolean
}

export interface LearnData {
  words: Map<string, Word>
  cards: Map<string, Card>
  logs: ReviewLog[]
}

export interface TodayCounts {
  newDone: number
  newProdDone: number
  reviewsDone: number
}

export function todayCounts(logs: ReviewLog[], now: number): TodayCounts {
  const start = dayStart(now)
  let newDone = 0
  let newProdDone = 0
  let reviewsDone = 0
  for (const l of logs) {
    if (l.ts < start || !l.scheduled) continue
    if (l.stateBefore === CardState.New) {
      if (l.direction === 'fr-de') newDone++
      else newProdDone++
    } else reviewsDone++
  }
  return { newDone, newProdDone, reviewsDone }
}

export function eligibleWords(data: LearnData, listIds?: string[]): Word[] {
  const set = listIds && listIds.length ? new Set(listIds) : null
  return [...data.words.values()].filter((w) => !w.excluded && !w.known && w.fr && w.de && (!set || set.has(w.listId)))
}

export interface DayOverview {
  due: Card[]
  newRecognition: Card[]
  newProduction: Card[]
  remainingNew: number
  remainingNewProd: number
}

export function overview(data: LearnData, s: Settings, now: number, listIds?: string[]): DayOverview {
  const words = eligibleWords(data, listIds)
  const counts = todayCounts(data.logs, now)
  const due: Card[] = []
  const newRec: Card[] = []
  const newProd: Card[] = []
  for (const w of words) {
    const rec = data.cards.get(cardId(w.id, 'fr-de')) ?? newCard(w.id, 'fr-de', now)
    const prod = data.cards.get(cardId(w.id, 'de-fr')) ?? newCard(w.id, 'de-fr', now)
    for (const c of [rec, prod]) if (isDue(c, now)) due.push(c)
    if (rec.state === CardState.New) newRec.push(rec)
    if (prod.state === CardState.New) {
      // Produktion erst, wenn das Wort wiedererkannt wird (rezeptiv → produktiv)
      if (!s.productionAfterRecognition || rec.state === CardState.Review) newProd.push(prod)
    }
  }
  return {
    due,
    newRecognition: newRec,
    newProduction: newProd,
    remainingNew: Math.max(0, s.newPerDay - counts.newDone),
    remainingNewProd: Math.max(0, s.newPerDay - counts.newProdDone),
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Übungsform je Karte – «wünschenswerte Erschwernisse»:
 * je stabiler die Erinnerung, desto anspruchsvoller der Abruf.
 */
export function chooseMode(c: Card, w: Word, s: Settings, opts: { ttsAvailable: boolean; poolSize: number }, rand: () => number): LearnMode {
  if (c.direction === 'fr-de') {
    if (c.state === CardState.New) return 'intro'
    if (c.stability < 2 && opts.poolSize >= 4 && c.state !== CardState.Review) return 'choice'
    return 'flashcard'
  }
  if (c.state === CardState.Review && c.stability >= 3) {
    const r = rand()
    if (s.includeContext && w.example && clozeFor(w) && r < 0.35) return 'context'
    if (s.includeListening && opts.ttsAvailable && r >= 0.35 && r < 0.55) return 'listening'
  }
  return 'typing'
}

export function buildSmartQueue(
  data: LearnData,
  s: Settings,
  now: number,
  opts: { listIds?: string[]; ttsAvailable: boolean; rand?: () => number; limit?: number },
): QueueItem[] {
  const rand = opts.rand ?? Math.random
  const ov = overview(data, s, now, opts.listIds)
  const counts = todayCounts(data.logs, now)
  const reviewBudget = Math.max(0, s.maxReviewsPerDay - counts.reviewsDone)
  // Fällige zuerst nach Dringlichkeit (niedrigste Abrufwahrscheinlichkeit), dann gemischt
  const due = [...ov.due].sort((a, b) => currentR(a, now) - currentR(b, now)).slice(0, reviewBudget)
  const reviews = shuffle(due, rand)
  const newRec = ov.newRecognition.slice(0, ov.remainingNew)
  const newProd = ov.newProduction.slice(0, ov.remainingNewProd)
  const fresh = interleave(newProd, newRec)
  const poolSize = data.words.size
  const mk = (c: Card, isNew: boolean): QueueItem => ({
    cardId: c.id,
    isNew,
    mode: chooseMode(c, data.words.get(c.wordId)!, s, { ttsAvailable: opts.ttsAvailable, poolSize }, rand),
  })

  // Neue Karten gleichmässig zwischen die Wiederholungen streuen (Interleaving)
  const out: QueueItem[] = []
  const gap = fresh.length ? Math.max(1, Math.floor(reviews.length / fresh.length)) : Infinity
  let ri = 0
  let fi = 0
  while (ri < reviews.length || fi < fresh.length) {
    for (let k = 0; k < gap && ri < reviews.length; k++) out.push(mk(reviews[ri++], false))
    if (fi < fresh.length) out.push(mk(fresh[fi++], true))
    if (gap === Infinity) break
  }
  while (ri < reviews.length) out.push(mk(reviews[ri++], false))
  const q = separateSiblings(out)
  return opts.limit ? q.slice(0, opts.limit) : q
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < b.length) out.push(b[i])
    if (i < a.length) out.push(a[i])
  }
  return out
}

/** Beide Richtungen eines Wortes nicht direkt hintereinander abfragen. */
export function separateSiblings(q: QueueItem[]): QueueItem[] {
  const out = [...q]
  const wid = (x: QueueItem) => x.cardId.split(':')[0]
  for (let i = 1; i < out.length; i++) {
    if (wid(out[i]) === wid(out[i - 1])) {
      const j = out.findIndex((x, k) => k > i && wid(x) !== wid(out[i - 1]) && (k + 1 >= out.length || wid(out[k + 1]) !== wid(out[i])))
      if (j > 0) [out[i], out[j]] = [out[j], out[i]]
    }
  }
  return out
}

/** Nach einer Antwort: Karte erneut einreihen, falls sie in derselben Sitzung wieder fällig wird. */
export function requeuePosition(c: Card, now: number, queueLength: number): number | null {
  if (c.state !== CardState.Learning && c.state !== CardState.Relearning) return null
  const mins = (c.due - now) / 60_000
  if (mins > 60) return null
  const offset = mins <= 2 ? 3 : mins <= 6 ? 5 : 9
  return Math.min(queueLength, offset)
}

// ------------------------------------------------------------ Multiple Choice

export function distractors(target: Word, pool: Word[], field: 'fr' | 'de', rand: () => number = Math.random, n = 3): Word[] {
  const tVal = normalize(target[field])
  const tWord = splitArticle(target.fr).word
  const scored = pool
    .filter((w) => w.id !== target.id && w[field] && normalize(w[field]) !== tVal && splitArticle(w.fr).word !== tWord)
    .map((w) => {
      let sc = rand() * 1.5
      if (w.listId === target.listId) sc += 3
      if (w.pos && w.pos === target.pos) sc += 2
      if (w.gender && w.gender === target.gender) sc += 1
      if (w.chapter && w.chapter === target.chapter) sc += 1
      sc -= Math.abs(w[field].length - target[field].length) / 6
      if (normalize(w[field])[0] === tVal[0]) sc += 0.5
      return { w, sc }
    })
    .sort((a, b) => b.sc - a.sc)
  const seen = new Set<string>()
  const out: Word[] = []
  for (const { w } of scored) {
    const k = normalize(w[field])
    if (seen.has(k)) continue
    seen.add(k)
    out.push(w)
    if (out.length >= n) break
  }
  return out
}

// ------------------------------------------------------------ Kontext (Lückensatz)

export interface Cloze {
  before: string
  answer: string
  after: string
  baseForm: string
}

/** Sucht das Wort (ggf. flektiert) im Beispielsatz. Liefert null, wenn es nicht eindeutig vorkommt. */
export function clozeFor(w: Word): Cloze | null {
  const sentence = w.example?.trim()
  if (!sentence) return null
  const firstVariant = w.fr.split(/\s*[,;/]\s*/)[0]
  const base = splitArticle(firstVariant.replace(/\([^)]*\)/g, '').trim()).word
  if (!base) return null
  const tokens = [...sentence.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿœŒ]+(?:[-'’][A-Za-zÀ-ÖØ-öø-ÿœŒ]+)*/g)]
  const baseTokens = base.split(/\s+/)
  // 1. exakter (mehrteiliger) Treffer
  const lowSentence = sentence.toLowerCase()
  const idx = lowSentence.indexOf(base.toLowerCase())
  if (idx >= 0) {
    const okBefore = idx === 0 || /[^A-Za-zÀ-ÿœ]/.test(lowSentence[idx - 1])
    const end = idx + base.length
    const okAfter = end >= lowSentence.length || /[^A-Za-zÀ-ÿœ]/.test(lowSentence[end])
    if (okBefore && okAfter)
      return { before: sentence.slice(0, idx), answer: sentence.slice(idx, end), after: sentence.slice(end), baseForm: firstVariant }
  }
  // 2. flektierte Form eines einzelnen Wortes (gemeinsamer Wortstamm)
  if (baseTokens.length === 1) {
    const b = base.toLowerCase()
    const stem = b.replace(/(er|ir|re|oir|e|s|x)$/, '')
    if (stem.length < 3) return null
    const matches = tokens.filter((t) => {
      const tl = t[0].toLowerCase()
      return tl.startsWith(stem.slice(0, Math.max(3, Math.ceil(stem.length * 0.75)))) && Math.abs(tl.length - b.length) <= 4
    })
    if (matches.length === 1) {
      const m = matches[0]
      const i = m.index!
      return { before: sentence.slice(0, i), answer: m[0], after: sentence.slice(i + m[0].length), baseForm: firstVariant }
    }
  }
  return null
}

// ------------------------------------------------------------ Prüfungsplan

export interface ExamPlanStatus {
  daysLeft: number
  total: number
  ready: number // geschätzt ≥ 90 % am Prüfungstag
  atRisk: number
  notStarted: number
  todayCards: Card[]
  todayNew: number
  estMinutesToday: number
  secondsPerCard: number
}

export function examPlanStatus(plan: ExamPlan, data: LearnData, now: number, avgSecondsPerCard: number): ExamPlanStatus {
  const examTs = new Date(plan.date + 'T08:00:00').getTime()
  const daysLeft = Math.max(0, daysBetween(now, examTs))
  const listSet = new Set(plan.listIds)
  const chapterSet = plan.chapters?.length ? new Set(plan.chapters) : null
  const words = [...data.words.values()].filter(
    (w) => listSet.has(w.listId) && !w.excluded && w.fr && w.de && (!chapterSet || chapterSet.has(w.chapter ?? '')),
  )
  const today = dayStart(now)
  let ready = 0
  let atRisk = 0
  const fresh: Card[] = []
  const weak: { c: Card; score: number }[] = []
  for (const w of words) {
    for (const d of ['fr-de', 'de-fr'] as Direction[]) {
      const c = data.cards.get(cardId(w.id, d)) ?? newCard(w.id, d, now)
      if (w.known) {
        ready++
        continue
      }
      if (c.state === CardState.New || c.lastReview == null) {
        fresh.push(c)
        continue
      }
      const rExam = retrievability(Math.max(0, (examTs - c.lastReview) / DAY), c.stability)
      if (rExam >= 0.9) ready++
      else atRisk++
      const reviewedToday = c.lastReview >= today
      if ((rExam < 0.9 || c.state !== CardState.Review) && !reviewedToday)
        weak.push({ c, score: rExam - c.difficulty / 40 - c.lapses / 20 })
      else if (isDue(c, now)) weak.push({ c, score: rExam })
    }
  }
  // Neue Wörter gleichmässig auf die verbleibenden Tage verteilen; letzter Tag nur Wiederholung
  const learnDays = Math.max(1, daysLeft - 1)
  const freshWords = fresh.filter((c) => c.direction === 'fr-de')
  const todayNewWords = daysLeft <= 1 ? freshWords.length : Math.ceil(freshWords.length / learnDays)
  const freshToday = freshWords.slice(0, todayNewWords)
  const prodFresh = fresh.filter((c) => c.direction === 'de-fr' && data.cards.get(cardId(c.wordId, 'fr-de'))?.state === CardState.Review)
  weak.sort((a, b) => a.score - b.score)
  const todayCards = [...weak.map((x) => x.c), ...prodFresh.slice(0, todayNewWords), ...freshToday]
  return {
    daysLeft,
    total: words.length * 2,
    ready,
    atRisk,
    notStarted: fresh.length,
    todayCards,
    todayNew: freshToday.length,
    estMinutesToday: Math.round((todayCards.length * 1.6 * avgSecondsPerCard) / 60),
    secondsPerCard: avgSecondsPerCard,
  }
}

// ------------------------------------------------------------ Statistik

export interface DayAgg {
  key: string
  reviews: number
  correct: number
  ms: number
  newCards: number
}

export function aggregateDays(logs: ReviewLog[]): Map<string, DayAgg> {
  const m = new Map<string, DayAgg>()
  for (const l of logs) {
    const key = dateKey(l.ts)
    const a = m.get(key) ?? { key, reviews: 0, correct: 0, ms: 0, newCards: 0 }
    a.reviews++
    if (l.correct) a.correct++
    a.ms += l.durationMs
    if (l.stateBefore === CardState.New) a.newCards++
    m.set(key, a)
  }
  return m
}

export function streak(days: Map<string, DayAgg>, now: number): number {
  let n = 0
  let t = dayStart(now)
  if (!days.has(dateKey(t))) t -= DAY // heute noch nicht gelernt: Serie zählt bis gestern
  while (days.has(dateKey(t))) {
    n++
    t -= DAY
  }
  return n
}

/** Erfolgsquote: Anteil richtiger Abrufe bei bereits gelernten Karten (ohne Erstbegegnung). */
export function successRate(logs: ReviewLog[], now: number, days = 30): { rate: number | null; n: number } {
  const since = now - days * DAY
  const rel = logs.filter((l) => l.ts >= since && l.stateBefore !== CardState.New && l.mode !== 'intro')
  if (!rel.length) return { rate: null, n: 0 }
  return { rate: rel.filter((l) => l.correct).length / rel.length, n: rel.length }
}

export function forecast(cards: Iterable<Card>, now: number, days = 14): number[] {
  const out = Array(days).fill(0)
  const start = dayStart(now)
  for (const c of cards) {
    if (c.state === CardState.New) continue
    const idx = Math.floor((Math.max(c.due, start) - start) / DAY)
    if (idx < days) out[idx]++
  }
  return out
}

export function difficultyScore(c: Card): number {
  const total = c.correct + c.wrong
  return c.difficulty + c.lapses * 1.5 + (total ? (c.wrong / total) * 4 : 0)
}

export function avgSecondsPerCard(logs: ReviewLog[]): number {
  const recent = logs.slice(-300).map((l) => l.durationMs / 1000).filter((x) => x > 0)
  if (recent.length < 10) return 12
  recent.sort((a, b) => a - b)
  return Math.max(4, Math.min(40, recent[Math.floor(recent.length / 2)]))
}

/** Schweizer Note: 5 × Anteil + 1, auf Zehntel gerundet */
export function swissGrade(correct: number, total: number): number {
  if (!total) return 1
  return Math.round((5 * (correct / total) + 1) * 10) / 10
}
