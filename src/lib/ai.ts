/**
 * OPTIONALE Erweiterung: Beispielsätze per KI vorschlagen lassen.
 * Standardmässig ausgeschaltet. Es werden nur die ausgewählten Wörter
 * (Französisch + Deutsch) an die Anthropic-API gesendet – mit deinem
 * eigenen API-Schlüssel, direkt aus dem Browser. Vorschläge werden erst
 * nach deiner Prüfung übernommen und als «KI» gekennzeichnet.
 */
import type { Word } from './types'
import { clozeFor } from './engine'

export interface ExampleSuggestion {
  wordId: string
  example: string
  exampleDe: string
}

export async function suggestExamples(words: Word[], apiKey: string, model: string): Promise<ExampleSuggestion[]> {
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt (Einstellungen → Optionale KI-Erweiterung).')
  const batch = words.slice(0, 25)
  const list = batch.map((w, i) => `${i + 1}. ${w.fr} = ${w.de}`).join('\n')
  const prompt = `Du hilfst einer deutschsprachigen Person beim Französischlernen (Niveau A2–B1).
Schreibe für jedes Wort genau einen kurzen, natürlichen, grammatikalisch korrekten französischen Beispielsatz (5–12 Wörter), in dem das Wort in der angegebenen Bedeutung vorkommt, plus deutsche Übersetzung.
Antworte NUR mit JSON: [{"n":1,"fr":"...","de":"..."}]

${list}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`KI-Anfrage fehlgeschlagen (${res.status}). Schlüssel und Modell prüfen.`)
  const json = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = json.content?.find((c) => c.type === 'text')?.text ?? ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Die Antwort der KI konnte nicht gelesen werden.')
  const arr = JSON.parse(match[0]) as { n: number; fr: string; de: string }[]
  return arr
    .map((x) => {
      const w = batch[x.n - 1]
      if (!w || typeof x.fr !== 'string') return null
      const s: ExampleSuggestion = { wordId: w.id, example: x.fr.trim().slice(0, 300), exampleDe: String(x.de ?? '').trim().slice(0, 300) }
      // Nur Sätze übernehmen, in denen das Wort tatsächlich gefunden wird
      return clozeFor({ ...w, example: s.example }) ? s : null
    })
    .filter((x): x is ExampleSuggestion => !!x)
}
