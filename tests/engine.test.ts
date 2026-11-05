import { describe, expect, it } from 'vitest'
import {
  buildSmartQueue,
  cardId,
  cardStage,
  clozeFor,
  distractors,
  examPlanStatus,
  newCard,
  separateSiblings,
  swissGrade,
  type LearnData,
} from '../src/lib/engine'
import { CardState, Rating, review, defaultParams } from '../src/lib/fsrs'
import { DEFAULT_SETTINGS, type Card, type Word } from '../src/lib/types'

const now = new Date(2026, 2, 10, 12).getTime()
const DAY = 86_400_000
let n = 0
const word = (fr: string, de: string, extra: Partial<Word> = {}): Word => ({
  id: `w${n++}`, listId: 'L1', fr, de, excluded: false, known: false, createdAt: n, updatedAt: n, ...extra,
})
const rand = () => 0.42

function data(words: Word[], cards: Card[] = []): LearnData {
  return { words: new Map(words.map((w) => [w.id, w])), cards: new Map(cards.map((c) => [c.id, c])), logs: [] }
}

describe('Stufen', () => {
  it('fünf Lernstufen', () => {
    const c = newCard('x', 'fr-de', now)
    expect(cardStage(c)).toBe('neu')
    expect(cardStage({ ...c, state: CardState.Learning })).toBe('lernend')
    expect(cardStage({ ...c, state: CardState.Relearning })).toBe('vergessen')
    expect(cardStage({ ...c, state: CardState.Review, stability: 5 })).toBe('wiederholung')
    expect(cardStage({ ...c, state: CardState.Review, stability: 30 })).toBe('beherrscht')
  })
})

describe('Tageswarteschlange', () => {
  it('neue Wörter: Limit, zuerst Erkennen, Produktion erst danach', () => {
    const ws = Array.from({ length: 30 }, (_, i) => word(`le mot${i}`, `Wort${i}`))
    const q = buildSmartQueue(data(ws), { ...DEFAULT_SETTINGS, newPerDay: 10 }, now, { ttsAvailable: false, rand })
    expect(q).toHaveLength(10)
    expect(q.every((x) => x.mode === 'intro' && x.cardId.endsWith('fr-de'))).toBe(true)
  })

  it('ausgeschlossene und bekannte Wörter werden nicht abgefragt', () => {
    const ws = [word('a', 'b', { excluded: true }), word('c', 'd', { known: true }), word('le pain', 'Brot')]
    const q = buildSmartQueue(data(ws), DEFAULT_SETTINGS, now, { ttsAvailable: false, rand })
    expect(q.map((x) => x.cardId)).toEqual([cardId(ws[2].id, 'fr-de')])
  })

  it('fällige Wiederholungen + freigeschaltete Produktion', () => {
    const w = word('la pomme', 'der Apfel')
    let rec = newCard(w.id, 'fr-de', now - 10 * DAY)
    rec = { ...rec, ...review(rec, Rating.Easy, now - 10 * DAY, defaultParams({ enableFuzz: false })) }
    const q = buildSmartQueue(data([w], [rec]), DEFAULT_SETTINGS, now, { ttsAvailable: false, rand })
    expect(q.map((x) => x.cardId).sort()).toEqual([cardId(w.id, 'de-fr'), cardId(w.id, 'fr-de')].sort())
    expect(q.find((x) => x.cardId.endsWith('de-fr'))!.mode).toBe('typing')
  })

  it('Geschwisterkarten nicht direkt hintereinander', () => {
    const q = separateSiblings([
      { cardId: 'a:fr-de', mode: 'flashcard', isNew: false },
      { cardId: 'a:de-fr', mode: 'typing', isNew: false },
      { cardId: 'b:fr-de', mode: 'flashcard', isNew: false },
    ])
    expect(q[1].cardId).toBe('b:fr-de')
  })
})

describe('Multiple Choice', () => {
  it('Ablenker: plausibel, keine Duplikate, nicht die Lösung', () => {
    const t = word('la table', 'der Tisch', { pos: 'Nomen', gender: 'f' })
    const pool = [t, word('la chaise', 'der Stuhl', { pos: 'Nomen', gender: 'f' }), word('le lit', 'das Bett', { pos: 'Nomen' }),
      word('manger', 'essen', { pos: 'Verb' }), word('la lampe', 'die Lampe', { pos: 'Nomen', gender: 'f' }), word('la table', 'der Tisch')]
    const d = distractors(t, pool, 'de', rand)
    expect(d).toHaveLength(3)
    expect(d.map((x) => x.de)).not.toContain('der Tisch')
    expect(d.map((x) => x.de)).not.toContain('essen')
  })
})

describe('Lückensatz', () => {
  it('findet exakte und flektierte Formen', () => {
    expect(clozeFor(word('la cuisine', 'Küche', { example: 'Je suis dans la cuisine.' }))!.answer).toBe('cuisine')
    const c = clozeFor(word('manger', 'essen', { example: 'Nous mangeons à midi.' }))!
    expect(c.answer).toBe('mangeons')
    expect(c.baseForm).toBe('manger')
    expect(clozeFor(word('le chat', 'Katze', { example: 'Il pleut.' }))).toBe(null)
  })
})

describe('Prüfung', () => {
  it('Plan verteilt neue Wörter auf die Tage bis zur Prüfung', () => {
    const ws = Array.from({ length: 20 }, (_, i) => word(`le mot${i}`, `Wort${i}`))
    const d = new Date(now + 5 * DAY)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const st = examPlanStatus({ id: 'p', name: 'Test', date, listIds: ['L1'], createdAt: now }, data(ws), now, 10)
    expect(st.daysLeft).toBe(5)
    expect(st.notStarted).toBe(40)
    expect(st.todayNew).toBe(5)
  })
  it('Schweizer Note', () => {
    expect(swissGrade(10, 10)).toBe(6)
    expect(swissGrade(0, 10)).toBe(1)
    expect(swissGrade(7, 10)).toBe(4.5)
  })
})
