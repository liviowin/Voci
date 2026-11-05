import { useMemo } from 'react'
import { useStore } from './store'
import {
  aggregateDays,
  cardId,
  cardStage,
  dayStart,
  difficultyScore,
  eligibleWords,
  forecast,
  overview,
  streak,
  successRate,
  wordStage,
  avgSecondsPerCard,
} from '../lib/engine'
import { DIRECTIONS, type Card, type Stage, type Word } from '../lib/types'

export const STAGES: Stage[] = ['neu', 'lernend', 'wiederholung', 'vergessen', 'beherrscht']

export function useLearnData() {
  const words = useStore((s) => s.words)
  const cards = useStore((s) => s.cards)
  const logs = useStore((s) => s.logs)
  return useMemo(() => ({ words, cards, logs }), [words, cards, logs])
}

export function useToday() {
  const data = useLearnData()
  const settings = useStore((s) => s.settings)
  return useMemo(() => {
    const now = Date.now()
    const ov = overview(data, settings, now)
    const start = dayStart(now)
    const todayLogs = data.logs.filter((l) => l.ts >= start)
    const minutes = todayLogs.reduce((s, l) => s + l.durationMs, 0) / 60000
    const dueCount = ov.due.length
    const newAvail = Math.min(ov.remainingNew, ov.newRecognition.length) + Math.min(ov.remainingNewProd, ov.newProduction.length)
    const sec = avgSecondsPerCard(data.logs)
    // neue Wörter brauchen ca. 3 Durchgänge am ersten Tag
    const estMinutes = Math.round(((dueCount * 1.3 + newAvail * 3) * sec) / 60)
    const goal = settings.goalType === 'minutes' ? settings.goalMinutes : settings.goalWords
    const goalValue = settings.goalType === 'minutes' ? minutes : todayLogs.length
    return { dueCount, newAvail, minutes, reviewsToday: todayLogs.length, estMinutes, goal, goalValue, sec }
  }, [data, settings])
}

export function useStats() {
  const data = useLearnData()
  const lists = useStore((s) => s.lists)
  return useMemo(() => {
    const now = Date.now()
    const days = aggregateDays(data.logs)
    const active = [...data.words.values()].filter((w) => !w.excluded)
    const stageCount: Record<Stage, number> = { neu: 0, lernend: 0, wiederholung: 0, vergessen: 0, beherrscht: 0 }
    const byList = new Map<string, Record<Stage, number>>()
    for (const w of active) {
      const st = wordStage(w, DIRECTIONS.map((d) => data.cards.get(cardId(w.id, d))))
      stageCount[st]++
      const m = byList.get(w.listId) ?? { neu: 0, lernend: 0, wiederholung: 0, vergessen: 0, beherrscht: 0 }
      m[st]++
      byList.set(w.listId, m)
    }
    const dirStages = Object.fromEntries(
      DIRECTIONS.map((d) => {
        const c: Record<Stage, number> = { neu: 0, lernend: 0, wiederholung: 0, vergessen: 0, beherrscht: 0 }
        for (const w of active) if (!w.known) c[cardStage(data.cards.get(cardId(w.id, d)))]++
        return [d, c]
      }),
    ) as Record<'fr-de' | 'de-fr', Record<Stage, number>>
    const hardest: { word: Word; card: Card; score: number }[] = []
    for (const c of data.cards.values()) {
      const w = data.words.get(c.wordId)
      if (!w || w.excluded || c.reps < 2) continue
      if (c.lapses === 0 && c.wrong === 0) continue
      hardest.push({ word: w, card: c, score: difficultyScore(c) })
    }
    hardest.sort((a, b) => b.score - a.score)
    const sr = successRate(data.logs, now)
    const learnable = eligibleWords(data)
    return {
      days,
      streak: streak(days, now),
      stageCount,
      dirStages,
      byList,
      lists,
      hardest,
      success: sr,
      forecast: forecast(data.cards.values(), now, 14),
      totalWords: active.length,
      learnable: learnable.length,
      totalMinutes: data.logs.reduce((s, l) => s + l.durationMs, 0) / 60000,
      totalReviews: data.logs.length,
    }
  }, [data, lists])
}

export const stageLabelShort: Record<Stage, string> = {
  neu: 'Neu',
  lernend: 'Lernend',
  wiederholung: 'Wiederholung',
  vergessen: 'Vergessen',
  beherrscht: 'Beherrscht',
}

export const fmtMin = (m: number) => (m < 1 && m > 0 ? '<1' : Math.round(m).toString())

export function last(n: number): string[] {
  const out: string[] = []
  const t = dayStart(Date.now())
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t - i * 86_400_000)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}

export const shortDate = (key: string) => new Date(key + 'T12:00').toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' })
