import { describe, expect, it } from 'vitest'
import { itemsToLines, languageScore, markDuplicates, parseLines, textToLines, type TextItem } from '../src/lib/parser'

const item = (str: string, x: number, y: number, h = 10): TextItem => ({ str, x, y, w: str.length * h * 0.5, h })

describe('Spracherkennung', () => {
  it('erkennt Französisch und Deutsch', () => {
    const a = languageScore('la fenêtre')
    const b = languageScore('das Fenster')
    expect(a.fr).toBeGreaterThan(a.de)
    expect(b.de).toBeGreaterThan(b.fr)
    const c = languageScore('Haus')
    expect(c.de).toBeGreaterThan(c.fr)
  })
})

describe('PDF-Tabellen', () => {
  it('zweispaltige Tabelle mit Kapitel und Kopfzeile', () => {
    const items = [
      item('Unité 3 : La maison', 40, 20, 16),
      item('Französisch', 40, 50),
      item('Deutsch', 260, 50),
      item('la maison', 40, 70),
      item('das Haus', 260, 70),
      item("l'escalier (m)", 40, 85),
      item('die Treppe', 260, 85),
      item('le cheval, -aux', 40, 100),
      item('das Pferd', 260, 100),
      item('nettoyer', 40, 115),
      item('putzen, reinigen', 260, 115),
    ]
    const e = parseLines(itemsToLines(items, 1))
    expect(e).toHaveLength(4)
    expect(e[0]).toMatchObject({ fr: 'la maison', de: 'das Haus', gender: 'f', chapter: 'Unité 3 : La maison' })
    expect(e[1]).toMatchObject({ fr: "l'escalier", gender: 'm' })
    expect(e[2]).toMatchObject({ fr: 'le cheval', plural: '-aux' })
    expect(e[3]).toMatchObject({ fr: 'nettoyer', de: 'putzen, reinigen' })
  })

  it('mehrspaltige Liste (2 Paare pro Zeile)', () => {
    const items = [
      item('le chat', 40, 70), item('die Katze', 160, 70), item('le chien', 320, 70), item('der Hund', 440, 70),
      item('la souris', 40, 85), item('die Maus', 160, 85), item("l'oiseau", 320, 85), item('der Vogel', 440, 85),
    ]
    const e = parseLines(itemsToLines(items, 1))
    expect(e.map((x) => x.fr)).toEqual(['le chat', 'le chien', 'la souris', "l'oiseau"])
    expect(e.map((x) => x.de)).toEqual(['die Katze', 'der Hund', 'die Maus', 'der Vogel'])
  })

  it('Deutsch links, Französisch rechts wird erkannt', () => {
    const items = [item('das Haus', 40, 70), item('la maison', 260, 70), item('die Schule', 40, 85), item("l'école", 260, 85)]
    const e = parseLines(itemsToLines(items, 1))
    expect(e[0]).toMatchObject({ fr: 'la maison', de: 'das Haus' })
    expect(e[1]).toMatchObject({ fr: "l'école", de: 'die Schule' })
  })

  it('Beispielsätze werden zugeordnet, fehlende Übersetzungen nicht erfunden', () => {
    const items = [
      item('la cuisine', 40, 70), item('die Küche', 260, 70),
      item('Nous mangeons dans la cuisine.', 60, 85),
      item('le grenier', 40, 100),
    ]
    const e = parseLines(itemsToLines(items, 1))
    expect(e[0].example).toBe('Nous mangeons dans la cuisine.')
    expect(e[1].fr).toBe('le grenier')
    expect(e[1].de).toBe('')
    expect(e[1].issues).toContain('Übersetzung fehlt')
  })
})

describe('Texteingabe', () => {
  it('verschiedene Trenner', () => {
    const e = parseLines(textToLines('la table – der Tisch\nle livre = das Buch\ndie Lampe\tla lampe\n1. le stylo - der Kugelschreiber'))
    expect(e.map((x) => [x.fr, x.de])).toEqual([
      ['la table', 'der Tisch'],
      ['le livre', 'das Buch'],
      ['la lampe', 'die Lampe'],
      ['le stylo', 'der Kugelschreiber'],
    ])
  })
})

describe('Duplikate', () => {
  it('erkennt Duplikate in Datei und Bestand', () => {
    const e = parseLines(textToLines('la table – der Tisch\nla table - der Tisch\nle livre - das Buch'))
    const m = markDuplicates(e, [{ id: '1', fr: 'le livre', de: 'Buch', listName: 'Liste A' }])
    expect(m[0].include).toBe(true)
    expect(m[1].issues).toContain('Duplikat')
    expect(m[2].duplicateOf).toMatch(/Liste A/)
  })
})
