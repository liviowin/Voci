import type { Rating, SchedulingState } from './fsrs'
import type { Strictness } from './answer'

/** fr-de = rezeptiv (Französisch verstehen), de-fr = produktiv (Französisch selbst bilden) */
export type Direction = 'fr-de' | 'de-fr'
export const DIRECTIONS: Direction[] = ['fr-de', 'de-fr']

export type ListCategory = 'thema' | 'kapitel' | 'pruefung'

export interface VocabList {
  id: string
  name: string
  category: ListCategory
  description?: string
  sourceFile?: string
  createdAt: number
  updatedAt: number
}

export interface Word {
  id: string
  listId: string
  fr: string // inkl. Artikel, z. B. "la voiture"
  de: string // Übersetzung(en), Alternativen durch Komma getrennt
  gender?: 'm' | 'f' | 'm/f' | ''
  plural?: string
  pos?: string // Wortart
  example?: string // französischer Beispielsatz
  exampleDe?: string
  exampleSource?: 'pdf' | 'user' | 'ai'
  notes?: string
  chapter?: string
  excluded: boolean // vom Lernen ausgeschlossen
  known: boolean // als bereits bekannt markiert
  createdAt: number
  updatedAt: number
}

export type LearnMode = 'smart' | 'flashcard' | 'typing' | 'choice' | 'listening' | 'context' | 'exam' | 'cram' | 'intro'

export interface Card extends SchedulingState {
  id: string // `${wordId}:${direction}`
  wordId: string
  direction: Direction
  correct: number
  wrong: number
  recentErrors: string[] // letzte falsche Eingaben
}

export interface ReviewLog {
  id: string
  cardId: string
  wordId: string
  direction: Direction
  ts: number
  rating: Rating
  mode: LearnMode
  correct: boolean
  hinted: boolean
  durationMs: number // gedeckelt auf 60 s
  stateBefore: number
  scheduled: boolean // false = Prüfungssimulation ohne Einfluss auf die Planung
  answer?: string
}

export interface ExamPlan {
  id: string
  name: string
  date: string // YYYY-MM-DD
  listIds: string[]
  chapters?: string[]
  createdAt: number
  archived?: boolean
}

export interface TestResult {
  id: string
  ts: number
  name: string
  listIds: string[]
  direction: Direction | 'mixed'
  difficulty: 'leicht' | 'mittel' | 'schwer'
  total: number
  correct: number
  percent: number
  grade: number
  durationMs: number
  mistakes: { wordId: string; prompt: string; expected: string; given: string }[]
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  goalType: 'minutes' | 'words'
  goalMinutes: number
  goalWords: number
  newPerDay: number
  maxReviewsPerDay: number
  requestRetention: number
  maximumIntervalDays: number
  strictness: Strictness
  productionAfterRecognition: boolean
  includeListening: boolean
  includeContext: boolean
  speechRate: number
  voiceURI: string
  lastBackupAt: number | null
  aiEnabled: boolean
  aiApiKey: string
  aiModel: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  goalType: 'minutes',
  goalMinutes: 15,
  goalWords: 50,
  newPerDay: 15,
  maxReviewsPerDay: 200,
  requestRetention: 0.9,
  maximumIntervalDays: 3 * 365,
  strictness: 'tolerant',
  productionAfterRecognition: true,
  includeListening: true,
  includeContext: true,
  speechRate: 0.9,
  voiceURI: '',
  lastBackupAt: null,
  aiEnabled: false,
  aiApiKey: '',
  aiModel: 'claude-haiku-5-5',
}

/** Darstellung für Nutzer:innen – die fünf Lernstufen aus der Anforderung */
export type Stage = 'neu' | 'lernend' | 'wiederholung' | 'beherrscht' | 'vergessen'
export const STAGE_LABEL: Record<Stage, string> = {
  neu: 'Noch nicht gelernt',
  lernend: 'Neu im Lernprozess',
  wiederholung: 'In Wiederholung',
  beherrscht: 'Gut beherrscht',
  vergessen: 'Erneut vergessen',
}
