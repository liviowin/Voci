/**
 * Vokabel-Erkennung aus positionierten Textfragmenten (PDF.js oder OCR)
 * bzw. aus reinem Text. Arbeitet rein heuristisch und erfindet nichts:
 * Fehlt eine Übersetzung, bleibt das Feld leer und der Eintrag wird markiert.
 */
import { normalize, splitArticle, stripAccents } from './answer'

export interface TextItem {
  str: string
  x: number // links, in Punkten
  y: number // oben (0 = Seitenanfang)
  w: number
  h: number // Schrifthöhe
  conf?: number // OCR-Konfidenz 0..100
}

export interface ParsedEntry {
  tempId: string
  fr: string
  de: string
  gender: '' | 'm' | 'f' | 'm/f'
  plural: string
  pos: string
  example: string
  exampleDe: string
  notes: string
  chapter: string
  page: number
  issues: string[]
  confidence: number // 0..1
  include: boolean
  duplicateOf?: string // Hinweis auf vorhandenes Wort
}

interface Cell {
  text: string
  x: number
  conf: number
}
interface Line {
  cells: Cell[]
  y: number
  h: number
  page: number
}

// ---------------------------------------------------------------- Sprache

const FR_WORDS = new Set(
  'le la les un une des du au aux de et ou à avec pour dans sur sous sans ne pas plus est sont être avoir faire je tu il elle on nous vous ils elles qui que quoi où ce cette ces mon ma mes ton ta tes son sa ses notre votre leur très bien aussi mais donc car comme quand chez se en y'.split(' '),
)
const DE_WORDS = new Set(
  'der die das den dem des ein eine einen einem einer und oder mit für in im auf unter ohne nicht kein keine ist sind sein haben werden machen ich du er sie es wir ihr man wer was wo dieser diese dieses mein dein sehr gut auch aber also weil wenn bei zu zum zur sich etwas jemand jdn jdm etw jmdn jmdm von vom aus nach'.split(' '),
)

export function languageScore(text: string): { fr: number; de: number } {
  const t = text.trim()
  const low = t.toLowerCase()
  let fr = 0
  let de = 0
  if (/[éèêëàâîïôûùçœ]/i.test(t)) fr += 3
  if (/[äöüß]/i.test(t)) de += 4
  if (/^(l'|l’|d'|d’|qu'|j'|n'|s'|c')/i.test(low) || /\b(l|d|qu|j|n|s|c)['’]\w/i.test(low)) fr += 3
  const words = low.replace(/[’']/g, "' ").split(/[^a-zàâäçéèêëîïôöûùüœß']+/).filter(Boolean)
  words.forEach((w, i) => {
    const bare = w.replace(/'$/, "'")
    if (FR_WORDS.has(bare)) fr += i === 0 ? 2.5 : 1
    if (DE_WORDS.has(bare)) de += i === 0 ? 2.5 : 1
  })
  if (/(eau|oux|oir|eux|euse|ette|ille|aine|ée|gn|qu)\b/i.test(low) || /(eau|oi|ou)/.test(low)) fr += 1
  if (/(tion|ment|age|ence|ance|ière|ier|eur)\b/.test(low)) fr += 0.7
  if (/(ung|heit|keit|schaft|lich|chen|isch|ig|nis)\b/.test(low)) de += 2
  if (/(sch|tz|ck|pf|chs|ei|ieh|äu|eu)/.test(low)) de += 1
  if (/^(être|avoir|[a-zéè]+(er|ir|re|oir))$/.test(low)) fr += 0.8
  // Deutsche Nomen sind grossgeschrieben (auch nach Artikel)
  const firstReal = t.replace(/^(der|die|das|ein|eine)\s+/i, '')
  if (/^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(firstReal) && !/^(Le|La|Les|Un|Une)\b/.test(t)) de += t === firstReal ? 1 : 2.5
  return { fr, de }
}

const frBias = (t: string) => {
  const s = languageScore(t)
  return s.fr - s.de
}

// ---------------------------------------------------------------- Zellen

const INFO_RE =
  /^\(?(m|f|n|nm|nf|m\/f|f\/m|mf|mpl|fpl|pl|adj|adv|v|vt|vi|vpr|v\.\s?pr|prép|prep|conj|pron|loc|expr|interj|nom|verbe|subst)\.?\)?$/i
const PLURAL_RE = /^\(?\s*(pl\.?|plur\.?|plural|pluriel)\s*[:.]?\s*([^)]*)\)?$/i
const HEADING_RE =
  /^(lektion|kapitel|unité|unite|leçon|lecon|chapitre|thème|theme|thema|dossier|module|unit|étape|etape|einheit|teil|partie)\b\s*[\w.\-–:]*/i
const HEADER_ROW_RE = /^(französisch|franzoesisch|français|francais|französisch\s*\/\s*deutsch|deutsch|allemand|vokabel|wort|mot|übersetzung|traduction)$/i

function isInfo(text: string) {
  return INFO_RE.test(text.trim()) || PLURAL_RE.test(text.trim())
}

/** Inline-Trenner wie "la maison – das Haus" auflösen. */
function splitInline(text: string): string[] {
  const t = text.trim()
  const seps = [/\t+/, /\s{3,}/, /\s+[–—]\s+/, /\s+-\s+/, /\s+=\s+/, /\s*;\s+(?=\S)/, /\s+:\s+/, /\s*→\s*/, /\s*\|\s*/]
  for (const s of seps) {
    const parts = t.split(s).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2 && parts.length <= 4) return parts
  }
  return [t]
}

const cleanPrefix = (s: string) =>
  s
    .replace(/^\s*(\d{1,4}[.)]|[•·▪◦●○\-–*]|[a-z]\))\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

// ---------------------------------------------------------------- Zeilen

/** Positionierte Fragmente → Zeilen mit Zellen (Spalten über grosse Lücken). */
export function itemsToLines(items: TextItem[], page: number): Line[] {
  const its = items.filter((i) => i.str.trim().length > 0).sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: TextItem[][] = []
  for (const it of its) {
    const row = rows[rows.length - 1]
    if (row) {
      const ref = row[0]
      const tol = Math.max(2, Math.min(ref.h, it.h) * 0.55)
      if (Math.abs(it.y + it.h / 2 - (ref.y + ref.h / 2)) <= tol) {
        row.push(it)
        continue
      }
    }
    rows.push([it])
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    const h = median(row.map((r) => r.h)) || 10
    const gap = Math.max(h * 1.1, 6)
    const cells: Cell[] = []
    let cur: { parts: TextItem[] } | null = null
    for (const it of row) {
      const last = cur?.parts[cur.parts.length - 1]
      if (cur && last && it.x - (last.x + last.w) <= gap) cur.parts.push(it)
      else {
        if (cur) cells.push(toCell(cur.parts))
        cur = { parts: [it] }
      }
    }
    if (cur) cells.push(toCell(cur.parts))
    return { cells, y: row[0].y, h, page }
  })
}

function toCell(parts: TextItem[]): Cell {
  let text = ''
  parts.forEach((p, i) => {
    if (i > 0) {
      const prev = parts[i - 1]
      const space = p.x - (prev.x + prev.w) > p.h * 0.12 && !text.endsWith(' ') && !p.str.startsWith(' ')
      text += space ? ' ' : ''
    }
    text += p.str
  })
  const confs = parts.map((p) => p.conf ?? 100)
  return { text: text.replace(/\s+/g, ' ').trim(), x: parts[0].x, conf: Math.min(...confs) }
}

/** Reiner Text (Einfügen, CSV ohne Kopf) → Zeilen. */
export function textToLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((l, i) => ({ cells: [{ text: l.trim(), x: 0, conf: 100 }], y: i * 12, h: 10, page: 1 }))
    .filter((l) => l.cells[0].text)
}

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// ---------------------------------------------------------------- Einträge

let counter = 0
const newEntry = (page: number, chapter: string): ParsedEntry => ({
  tempId: `p${Date.now().toString(36)}${(counter++).toString(36)}`,
  fr: '',
  de: '',
  gender: '',
  plural: '',
  pos: '',
  example: '',
  exampleDe: '',
  notes: '',
  chapter,
  page,
  issues: [],
  confidence: 1,
  include: true,
})

function applyInfo(e: ParsedEntry, info: string) {
  const t = info.trim()
  const pl = t.match(PLURAL_RE)
  if (pl) {
    if (pl[2]) e.plural = pl[2].trim()
    else e.pos = e.pos || 'Nomen (Plural)'
    return
  }
  const k = t.replace(/[().]/g, '').toLowerCase()
  if (['m', 'nm'].includes(k)) e.gender = 'm'
  else if (['f', 'nf'].includes(k)) e.gender = 'f'
  else if (['m/f', 'f/m', 'mf'].includes(k)) e.gender = 'm/f'
  else if (k === 'mpl') { e.gender = 'm'; e.pos = 'Nomen (Plural)' }
  else if (k === 'fpl') { e.gender = 'f'; e.pos = 'Nomen (Plural)' }
  else e.pos = posLabel(k) || e.pos
  if (['m', 'f', 'nm', 'nf', 'm/f', 'mf', 'f/m'].includes(k) && !e.pos) e.pos = 'Nomen'
}

function posLabel(k: string): string {
  const map: Record<string, string> = {
    adj: 'Adjektiv', adv: 'Adverb', v: 'Verb', vt: 'Verb', vi: 'Verb', vpr: 'Verb (pronominal)', 'v pr': 'Verb (pronominal)',
    prép: 'Präposition', prep: 'Präposition', conj: 'Konjunktion', pron: 'Pronomen', loc: 'Ausdruck', expr: 'Ausdruck',
    interj: 'Interjektion', nom: 'Nomen', subst: 'Nomen', verbe: 'Verb', n: 'Nomen',
  }
  return map[k] ?? ''
}

/** Zusatzangaben innerhalb des französischen Felds herauslösen. */
function extractFrenchExtras(e: ParsedEntry) {
  let fr = e.fr
  // "(pl. chevaux)" / "pl: chevaux"
  fr = fr.replace(/\(\s*(?:pl|plur|pluriel)\.?\s*:?\s*([^)]+)\)/i, (_, p) => ((e.plural = p.trim()), ''))
  // ", -aux" bzw. ", -s" als Pluralendung
  fr = fr.replace(/,\s*(-\w+)\s*$/, (_, p) => ((e.plural = p), ''))
  // Genus/Wortart in Klammern oder am Ende
  fr = fr.replace(/\(\s*(m|f|nm|nf|m\/f|mpl|fpl|adj|adv|v|vt|vi|vpr|prép|conj|pron|loc)\.?\s*\)/gi, (_, k) => (applyInfo(e, k), ''))
  fr = fr.replace(/\s+(nm|nf|m|f|adj|adv|vt|vi|vpr)\.\s*$/i, (_, k) => (applyInfo(e, k), ''))
  e.fr = fr.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()
  if (!e.gender) {
    const { article } = splitArticle(e.fr)
    if (article === 'le' || article === 'un') e.gender = 'm'
    else if (article === 'la' || article === 'une') e.gender = 'f'
  }
  if (!e.pos) {
    const { article, word } = splitArticle(e.fr)
    if (['le', 'la', "l'", 'les', 'un', 'une'].includes(article)) e.pos = 'Nomen'
    else if (article === 'se' || article === "s'") e.pos = 'Verb (pronominal)'
    else if (/^[a-zàâçéèêëîïôûù]+(er|ir|re|oir)$/.test(word) && !word.includes(' ')) e.pos = ''
  }
}

const isSentence = (t: string) => t.split(/\s+/).length >= 4 && (/[.!?…]$/.test(t) || /^[A-ZÀÂÇÉÈÊ]/.test(t))

/** Hauptfunktion: Zeilen → Vokabeln */
export function parseLines(lines: Line[], opts: { defaultChapter?: string } = {}): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  let chapter = opts.defaultChapter ?? ''
  let frFirstVotes = 0 // >0: Französisch steht meist links
  const bodyHeight = median(lines.map((l) => l.h)) || 10

  // 1. Durchgang: Reihenfolge der Sprachen bestimmen (Kopfzeile oder Mehrheit)
  for (const l of lines) {
    const texts = l.cells.flatMap((c) => splitInline(c.text)).map(cleanPrefix).filter((t) => t && !isInfo(t))
    if (texts.length === 2) {
      if (HEADER_ROW_RE.test(texts[0]) && HEADER_ROW_RE.test(texts[1])) {
        frFirstVotes += /fran/i.test(texts[0]) ? 50 : -50
        continue
      }
      const d = frBias(texts[0]) - frBias(texts[1])
      if (Math.abs(d) >= 1) frFirstVotes += Math.sign(d)
    }
  }
  const frFirst = frFirstVotes >= 0

  let last: ParsedEntry | null = null
  for (const line of lines) {
    const rawJoined = line.cells.map((c) => cleanPrefix(c.text)).join(' ').trim()
    // Überschriften (Kapitel/Lektion) – über Schlüsselwort oder grössere Schrift
    if (
      (HEADING_RE.test(rawJoined) && rawJoined.length < 70 && !/\s[–—=-]\s/.test(rawJoined)) ||
      (line.cells.length === 1 && line.h > bodyHeight * 1.3 && rawJoined.length < 50 && !isSentence(rawJoined))
    ) {
      chapter = rawJoined.replace(/[:.]$/, '')
      last = null
      continue
    }
    // Zellen aufbereiten
    const cells: Cell[] = []
    for (const c of line.cells)
      for (const part of splitInline(c.text)) {
        const t = cleanPrefix(part)
        if (t) cells.push({ text: t, x: c.x, conf: c.conf })
      }
    if (!cells.length) continue
    const lowConf = cells.some((c) => c.conf < 70)
    const joined = cells.map((c) => c.text).join(' ')

    if (cells.every((c) => HEADER_ROW_RE.test(c.text))) continue
    if (/^(seite|page)\s*\d+$|^\d{1,3}$/i.test(joined)) continue

    const infos = cells.filter((c) => isInfo(c.text))
    const words = cells.filter((c) => !isInfo(c.text))

    // Gruppen von Wortpaaren bilden (mehrspaltige Listen: 4 Zellen = 2 Paare)
    const groups: Cell[][] = []
    if (words.length >= 4 && words.length % 2 === 0 && !words.some((w) => isSentence(w.text)))
      for (let i = 0; i < words.length; i += 2) groups.push(words.slice(i, i + 2))
    else groups.push(words)

    for (const g of groups) {
      if (g.length === 0) {
        if (last) infos.forEach((i) => applyInfo(last!, i.text))
        continue
      }
      if (g.length === 1) {
        const t = g[0].text
        if (last && isSentence(t)) {
          // Beispielsatz zum vorherigen Wort
          if (frBias(t) > 0 && !last.example) last.example = t
          else if (frBias(t) < 0 && !last.exampleDe) last.exampleDe = t
          else if (!last.example) last.example = t
          continue
        }
        if (last && !last.de && frBias(t) < 0) {
          last.de = t
          last.issues = last.issues.filter((x) => x !== 'Übersetzung fehlt')
          continue
        }
        const e = newEntry(line.page, chapter)
        if (frBias(t) >= 0) e.fr = t
        else e.de = t
        e.issues.push(e.fr ? 'Übersetzung fehlt' : 'Französisches Wort fehlt')
        e.confidence = 0.3
        infos.forEach((i) => applyInfo(e, i.text))
        finalize(e, lowConf)
        entries.push(e)
        last = e
        continue
      }
      // Zwei oder mehr Zellen: die zwei «Wort»-Zellen bestimmen, Sätze als Beispiele
      const sentences = g.filter((c) => isSentence(c.text) && c.text.length > 25)
      let pair = g.filter((c) => !sentences.includes(c))
      if (pair.length < 2) pair = g.slice(0, 2)
      const [a, b] = pair
      const extra = pair.slice(2)
      const e = newEntry(line.page, chapter)
      const d = frBias(a.text) - frBias(b.text)
      let aIsFr: boolean
      if (Math.abs(d) >= 1) aIsFr = d > 0
      else {
        aIsFr = frFirst
        e.issues.push('Sprachzuordnung unsicher')
        e.confidence = 0.6
      }
      if (aIsFr !== frFirst && Math.abs(d) < 3) {
        e.issues.push('Reihenfolge weicht vom Rest ab')
        e.confidence = Math.min(e.confidence, 0.7)
      }
      e.fr = aIsFr ? a.text : b.text
      e.de = aIsFr ? b.text : a.text
      for (const s of sentences) {
        if (frBias(s.text) >= 0 && !e.example) e.example = s.text
        else if (!e.exampleDe) e.exampleDe = s.text
      }
      if (extra.length) {
        e.notes = extra.map((x) => x.text).join(' · ')
      }
      infos.forEach((i) => applyInfo(e, i.text))
      finalize(e, lowConf)
      entries.push(e)
      last = e
    }
  }
  return entries.map(cleanupEntry)
}

function finalize(e: ParsedEntry, lowConf: boolean) {
  extractFrenchExtras(e)
  if (lowConf) {
    e.issues.push('OCR-Erkennung unsicher')
    e.confidence = Math.min(e.confidence, 0.5)
  }
  if (e.fr.length > 80 || e.de.length > 80) {
    e.issues.push('Ungewöhnlich lang')
    e.confidence = Math.min(e.confidence, 0.6)
  }
  if (/\d{3,}|[{}<>@#$%^*_=~]/.test(e.fr + e.de)) {
    e.issues.push('Sonderzeichen – evtl. Erkennungsfehler')
    e.confidence = Math.min(e.confidence, 0.6)
  }
}

function cleanupEntry(e: ParsedEntry): ParsedEntry {
  return { ...e, issues: [...new Set(e.issues)] }
}

/** Schlüssel zur Duplikaterkennung: französisches Wort ohne Artikel, ohne Akzente. */
export function duplicateKey(fr: string): string {
  return stripAccents(splitArticle(normalize(fr)).word)
}

export function markDuplicates(
  entries: ParsedEntry[],
  existing: { id: string; fr: string; de: string; listName: string }[],
): ParsedEntry[] {
  const known = new Map<string, { fr: string; listName: string }>()
  for (const w of existing) known.set(duplicateKey(w.fr), { fr: w.fr, listName: w.listName })
  const seen = new Map<string, ParsedEntry>()
  return entries.map((e) => {
    if (!e.fr) return e
    const k = duplicateKey(e.fr)
    const out = { ...e, issues: [...e.issues] }
    const ex = known.get(k)
    if (ex) {
      out.duplicateOf = `bereits in «${ex.listName}»: ${ex.fr}`
      out.issues.push('Duplikat')
      out.include = false
    } else if (seen.has(k)) {
      out.duplicateOf = `doppelt in dieser Datei (S. ${seen.get(k)!.page})`
      out.issues.push('Duplikat')
      out.include = false
    } else seen.set(k, e)
    return out
  })
}
