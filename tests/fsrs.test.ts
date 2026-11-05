import { describe, expect, it } from 'vitest'
import {
  CardState,
  Rating,
  defaultParams,
  emptyState,
  initDifficulty,
  nextIntervalDays,
  retrievability,
  review,
} from '../src/lib/fsrs'

const DAY = 86_400_000
const p = defaultParams({ enableFuzz: false })
const t0 = new Date(2026, 0, 5, 10, 0).getTime()

describe('FSRS', () => {
  it('Vergessenskurve: R(S) = 90 %', () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5)
    expect(retrievability(0, 10)).toBeCloseTo(1, 5)
    expect(retrievability(30, 10)).toBeLessThan(0.9)
  })

  it('Intervall entspricht der Stabilität bei 90 % Zielquote', () => {
    expect(nextIntervalDays(20, p)).toBe(20)
    expect(nextIntervalDays(20, { ...p, requestRetention: 0.95 })).toBeLessThan(20)
  })

  it('Startschwierigkeit sinkt mit besserer Bewertung', () => {
    expect(initDifficulty(Rating.Again, p.w)).toBeGreaterThan(initDifficulty(Rating.Easy, p.w))
  })

  it('Neue Karte durchläuft die Lernschritte', () => {
    let s = review(emptyState(t0), Rating.Good, t0, p)
    expect(s.state).toBe(CardState.Learning)
    expect(s.due - t0).toBe(10 * 60_000)
    s = review(s, Rating.Good, s.due, p)
    expect(s.state).toBe(CardState.Review)
    expect(s.due).toBeGreaterThan(t0 + 12 * 3600_000)
  })

  it('Einfach überspringt die Lernschritte', () => {
    const s = review(emptyState(t0), Rating.Easy, t0, p)
    expect(s.state).toBe(CardState.Review)
  })

  it('Drei richtige Antworten machen ein Wort nicht dauerhaft «gelernt»', () => {
    let s = review(emptyState(t0), Rating.Good, t0, p)
    s = review(s, Rating.Good, s.due, p)
    s = review(s, Rating.Good, s.due, p)
    expect(s.stability).toBeLessThan(21)
  })

  it('Intervalle wachsen bei erfolgreichem Abruf', () => {
    const pl = { ...p, maximumInterval: 36500 }
    let s = review(emptyState(t0), Rating.Easy, t0, pl)
    const ivls: number[] = []
    for (let i = 0; i < 5; i++) {
      const before = s.due
      s = review(s, Rating.Good, s.due, pl)
      ivls.push(s.due - before)
    }
    for (let i = 1; i < ivls.length; i++) expect(ivls[i]).toBeGreaterThan(ivls[i - 1])
  })

  it('Vergessen → Wiederlernen, Lapse gezählt, Stabilität sinkt', () => {
    let s = review(emptyState(t0), Rating.Easy, t0, p)
    s = review(s, Rating.Good, s.due, p)
    const stab = s.stability
    s = review(s, Rating.Again, s.due, p)
    expect(s.state).toBe(CardState.Relearning)
    expect(s.lapses).toBe(1)
    expect(s.stability).toBeLessThan(stab)
    s = review(s, Rating.Good, s.due, p)
    expect(s.state).toBe(CardState.Review)
  })

  it('Schwer gibt kürzere Intervalle als Gut, Gut kürzere als Einfach', () => {
    let s = review(emptyState(t0), Rating.Easy, t0, p)
    s = review(s, Rating.Good, s.due, p)
    const at = s.due + 2 * DAY
    const h = review(s, Rating.Hard, at, p).due
    const g = review(s, Rating.Good, at, p).due
    const e = review(s, Rating.Easy, at, p).due
    expect(h).toBeLessThanOrEqual(g)
    expect(g).toBeLessThan(e)
  })
})
