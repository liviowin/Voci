/**
 * Auswertung getippter Antworten (Französisch und Deutsch).
 * Unterscheidet exakte Treffer, Tippfehler, Akzentfehler, fehlende/falsche Artikel
 * und falsche Antworten – und erzeugt eine verständliche Erklärung.
 */
import { Rating } from './fsrs'

export type Strictness = 'strict' | 'tolerant'

export type Verdict =
  | 'correct' // exakt richtig
  | 'accent' // nur Akzente falsch/fehlend
  | 'typo' // kleiner Tippfehler
  | 'article-missing'
  | 'article-wrong'
  | 'base-form' // Grundform statt der Form im Satz (Kontextmodus)
  | 'wrong'
  | 'empty'

export interface CheckResult {
  verdict: Verdict
  accepted: boolean // zählt als richtig
  rating: Rating // Vorschlag für die Planung
  expected: string // die Lösung, die am nächsten lag
  explanation: string
  diff: DiffPart[]
}

export interface DiffPart {
  text: string
  kind: 'same' | 'missing' | 'extra' | 'changed'
}

const FR_ARTICLES = ['le', 'la', 'les', "l'", 'un', 'une', 'des', 'du', "de l'", 'de la', 'se', "s'"]
const DE_ARTICLES = ['der', 'die', 'das', 'ein', 'eine', 'sich']

/** Einheitliche Schreibweise: Kleinschrift, Apostroph, Leerzeichen, Ligaturen. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’`´‘ʼ]/g, "'")
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[«»“”"!?.;:,]/g, ' ')
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
}

/** Deutsche Umschreibungen ae/oe/ue als Umlaut akzeptieren. */
function germanFold(s: string): string {
  return s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
}

/** Zerlegt einen Eintrag in akzeptierte Varianten: "la voiture, l'auto (f) / le char" */
export function expandVariants(entry: string): string[] {
  const out = new Set<string>()
  const cleaned = entry.replace(/\[[^\]]*\]/g, ' ') // Zusatzinfos in eckigen Klammern ignorieren
  for (const raw of cleaned.split(/\s*[,;/|]\s*/)) {
    let part = raw.replace(/\((?:m|f|pl|fpl|mpl|nm|nf|ugs|fam|qc|qn|jdn|jdm|etw)\.?\)/gi, ' ').trim()
    if (!part) continue
    // optionale Teile in runden Klammern: "(se) promener" → "promener" und "se promener"
    const opt = part.match(/\(([^)]*)\)/)
    if (opt) {
      out.add(normalize(part.replace(opt[0], opt[1])))
      out.add(normalize(part.replace(opt[0], ' ')))
    } else out.add(normalize(part))
    part = ''
  }
  return [...out].filter(Boolean)
}

/** Artikel vom Wort trennen. */
export function splitArticle(s: string, lang: 'fr' | 'de' = 'fr'): { article: string; word: string } {
  const n = normalize(s)
  const arts = lang === 'fr' ? FR_ARTICLES : DE_ARTICLES
  for (const a of [...arts].sort((x, y) => y.length - x.length)) {
    if (a.endsWith("'")) {
      if (n.startsWith(a)) return { article: a, word: n.slice(a.length) }
    } else if (n.startsWith(a + ' ')) return { article: a, word: n.slice(a.length + 1) }
  }
  return { article: '', word: n }
}

/** Damerau-Levenshtein-Distanz (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[m][n]
}

/** Zeichengenauer Vergleich für die Fehleranzeige. */
export function diffChars(given: string, expected: string): DiffPart[] {
  const a = given
  const b = expected
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const parts: DiffPart[] = []
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = parts[parts.length - 1]
    if (last && last.kind === kind) last.text += text
    else parts.push({ text, kind })
  }
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push(b[j], 'same')
      i++
      j++
    } else if (stripAccents(a[i]) === stripAccents(b[j])) {
      push(b[j], 'changed')
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i], 'extra')
      i++
    } else {
      push(b[j], 'missing')
      j++
    }
  }
  if (i < m) push(a.slice(i), 'extra')
  if (j < n) push(b.slice(j), 'missing')
  return parts
}

const typoBudget = (len: number) => (len <= 3 ? 0 : len <= 7 ? 1 : 2)

interface Candidate {
  verdict: Verdict
  expected: string
  score: number
  detail?: string
}

function compareOne(given: string, variant: string, lang: 'fr' | 'de'): Candidate {
  if (given === variant) return { verdict: 'correct', expected: variant, score: 0 }
  const fold = (s: string) => (lang === 'de' ? germanFold(s) : s)
  if (fold(given) === fold(variant)) return { verdict: 'correct', expected: variant, score: 0 }

  const g = splitArticle(given, lang)
  const v = splitArticle(variant, lang)
  const sameWord = (x: string, y: string) => x === y || fold(x) === fold(y)

  if (v.article && sameWord(g.word, v.word)) {
    if (!g.article) return { verdict: 'article-missing', expected: variant, score: 1, detail: v.article }
    if (g.article !== v.article)
      return { verdict: 'article-wrong', expected: variant, score: 1, detail: `${g.article} → ${v.article}` }
  }
  // Artikel angegeben, aber in der Lösung keiner: Wort zählt
  if (!v.article && g.article && sameWord(g.word, v.word))
    return { verdict: 'correct', expected: variant, score: 0.2 }

  if (stripAccents(given) === stripAccents(variant)) return { verdict: 'accent', expected: variant, score: 0.5 }
  if (v.article && g.article === v.article && stripAccents(g.word) === stripAccents(v.word))
    return { verdict: 'accent', expected: variant, score: 0.5 }

  const dist = editDistance(stripAccents(fold(given)), stripAccents(fold(variant)))
  if (dist <= typoBudget(variant.length)) return { verdict: 'typo', expected: variant, score: 1 + dist }
  return { verdict: 'wrong', expected: variant, score: 10 + dist }
}

function explain(c: Candidate, given: string): string {
  switch (c.verdict) {
    case 'correct':
      return 'Richtig.'
    case 'accent':
      return 'Akzent fehlt oder ist falsch. Achte auf é/è/ê, à, ç usw.'
    case 'typo':
      return `Kleiner Tippfehler: „${given}“ statt „${c.expected}“.`
    case 'article-missing':
      return `Der Artikel fehlt: „${c.detail}“. Lerne Nomen immer mit Artikel – er zeigt das Genus.`
    case 'article-wrong':
      return `Falscher Artikel (${c.detail}) – das Genus stimmt nicht.`
    case 'base-form':
      return 'Das ist die Grundform – im Satz ist eine angepasste Form nötig.'
    case 'empty':
      return 'Keine Antwort.'
    default:
      return 'Leider falsch.'
  }
}

/**
 * Prüft eine Antwort gegen die Lösung (inkl. Alternativen).
 * - strict: nur exakte Schreibweise (Gross/klein & Satzzeichen egal) gilt.
 * - tolerant: Tippfehler, Akzente und fehlende Artikel werden akzeptiert,
 *   aber nur mit «Schwer» bewertet und klar markiert.
 */
export function checkAnswer(
  input: string,
  solutions: string[],
  opts: { strictness: Strictness; lang: 'fr' | 'de'; baseForm?: string },
): CheckResult {
  const given = normalize(input)
  const variants = solutions.flatMap(expandVariants)
  const shown = solutions[0] ?? ''
  if (!given)
    return { verdict: 'empty', accepted: false, rating: Rating.Again, expected: shown, explanation: explain({ verdict: 'empty', expected: shown, score: 99 }, ''), diff: [] }

  let best: Candidate = { verdict: 'wrong', expected: variants[0] ?? '', score: Infinity }
  for (const v of variants) {
    const c = compareOne(given, v, opts.lang)
    if (c.score < best.score) best = c
  }
  if (best.verdict === 'wrong' && opts.baseForm) {
    const bf = compareOne(given, normalize(opts.baseForm), opts.lang)
    if (bf.verdict === 'correct' || bf.verdict === 'typo' || bf.verdict === 'accent')
      best = { verdict: 'base-form', expected: best.expected, score: 5 }
  }

  const tolerant = opts.strictness === 'tolerant'
  let accepted = best.verdict === 'correct'
  let rating: Rating = accepted ? Rating.Good : Rating.Again
  if (!accepted && tolerant && ['accent', 'typo', 'article-missing', 'article-wrong', 'base-form'].includes(best.verdict)) {
    accepted = true
    rating = Rating.Hard
  }
  // Originalschreibweise der Lösung für die Anzeige finden
  const display =
    solutions.find((s) => expandVariants(s).includes(best.expected)) ?? shown
  return {
    verdict: best.verdict,
    accepted,
    rating,
    expected: best.verdict === 'wrong' ? shown : display,
    explanation: explain(best, given),
    // Vergleich nur zeigen, wenn die Antwort der Lösung ähnelt (sonst verwirrend)
    diff:
      best.verdict === 'correct' ||
      (best.verdict === 'wrong' && editDistance(stripAccents(given), stripAccents(best.expected)) > Math.max(2, best.expected.length * 0.45))
        ? []
        : diffChars(given, best.expected),
  }
}

/** Hinweis: die ersten n Buchstaben des Wortes (Artikel wird immer gezeigt). */
export function hintFor(solution: string, level: number): string {
  const first = solution.split(/\s*[,;/]\s*/)[0].trim()
  const { article } = splitArticle(first)
  const rest = article ? first.slice(first.toLowerCase().indexOf(article) + article.length).trimStart() : first
  const prefix = article ? first.slice(0, first.length - rest.length) : ''
  const shownChars = Math.min(rest.length, level)
  return prefix + rest.slice(0, shownChars) + rest.slice(shownChars).replace(/[^\s'-]/g, '·')
}
