import { describe, expect, it } from 'vitest'
import { checkAnswer, expandVariants, hintFor, normalize } from '../src/lib/answer'
import { Rating } from '../src/lib/fsrs'

const fr = (input: string, sol: string[], strictness: 'strict' | 'tolerant' = 'tolerant') =>
  checkAnswer(input, sol, { strictness, lang: 'fr' })

describe('Antwortprüfung', () => {
  it('exakte Antwort, Gross/klein und Apostroph egal', () => {
    expect(fr("L’école", ["l'école"]).verdict).toBe('correct')
    expect(fr('  LA Maison ', ['la maison']).rating).toBe(Rating.Good)
  })

  it('œ und oe sind gleichwertig', () => {
    expect(fr('le coeur', ['le cœur']).verdict).toBe('correct')
  })

  it('Akzentfehler: tolerant akzeptiert (Schwer), streng falsch', () => {
    const t = fr('lecole', ["l'école"])
    expect(fr('la fenetre', ['la fenêtre']).verdict).toBe('accent')
    expect(fr('la fenetre', ['la fenêtre']).accepted).toBe(true)
    expect(fr('la fenetre', ['la fenêtre']).rating).toBe(Rating.Hard)
    expect(fr('la fenetre', ['la fenêtre'], 'strict').accepted).toBe(false)
    expect(t.verdict).toBe('typo') // fehlender Apostroph zählt als Tippfehler
  })

  it('Tippfehler werden erkannt', () => {
    const r = fr('la voitrue', ['la voiture'])
    expect(r.verdict).toBe('typo')
    expect(r.accepted).toBe(true)
    expect(fr('la voitrue', ['la voiture'], 'strict').accepted).toBe(false)
    expect(fr('le chien', ['le chat']).verdict).toBe('wrong')
  })

  it('fehlender und falscher Artikel', () => {
    expect(fr('maison', ['la maison']).verdict).toBe('article-missing')
    expect(fr('le maison', ['la maison']).verdict).toBe('article-wrong')
    expect(fr('le maison', ['la maison']).explanation).toMatch(/Genus/)
  })

  it('Alternativen und optionale Teile', () => {
    expect(fr('la bicyclette', ['le vélo, la bicyclette']).verdict).toBe('correct')
    expect(expandVariants('(se) promener')).toEqual(expect.arrayContaining(['se promener', 'promener']))
    expect(fr('ami', ['ami(e)']).verdict).toBe('correct')
    expect(fr('amie', ['ami(e)']).verdict).toBe('correct')
  })

  it('Deutsch: Umlaut-Umschreibung', () => {
    const r = checkAnswer('die Tuer', ['die Tür'], { strictness: 'strict', lang: 'de' })
    expect(r.verdict).toBe('correct')
  })

  it('leere Antwort ist falsch', () => {
    expect(fr('', ['la maison']).rating).toBe(Rating.Again)
  })

  it('Grundform im Kontextmodus', () => {
    const r = checkAnswer('manger', ['mangeons'], { strictness: 'tolerant', lang: 'fr', baseForm: 'manger' })
    expect(r.verdict).toBe('base-form')
    expect(r.rating).toBe(Rating.Hard)
  })

  it('Hinweis zeigt Artikel und erste Buchstaben', () => {
    expect(hintFor('la maison', 2)).toBe('la ma····')
    expect(normalize('  Hé  ! ')).toBe('hé')
  })
})
