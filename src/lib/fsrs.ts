/**
 * FSRS-6 (Free Spaced Repetition Scheduler) – eigenständige, nachvollziehbare
 * TypeScript-Implementierung.
 *
 * Modell (DSR): Jede Karte hat
 *  - Stabilität S  = Anzahl Tage, nach denen die Abrufwahrscheinlichkeit auf 90 % fällt
 *  - Schwierigkeit D ∈ [1, 10]
 *  - Abrufwahrscheinlichkeit R(t) = (1 + factor · t / S)^decay   (Potenzgesetz-Vergessenskurve)
 *
 * Formeln und Standardparameter entsprechen der Referenzimplementierung
 * von open-spaced-repetition (FSRS-6, 21 Parameter).
 */

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const
export type Rating = (typeof Rating)[keyof typeof Rating]

export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const
export type CardState = (typeof CardState)[keyof typeof CardState]

export const DEFAULT_W: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]

export const S_MIN = 0.001
export const S_MAX = 36500
const MINUTE = 60_000
const DAY = 86_400_000

export interface SchedulingState {
  state: CardState
  due: number // Unix ms
  stability: number // Tage
  difficulty: number // 1..10
  reps: number
  lapses: number
  step: number // Index im Lern-/Wiederlernschritt
  lastReview: number | null // Unix ms
}

export interface FsrsParams {
  w: readonly number[]
  requestRetention: number // gewünschte Behaltensquote, z. B. 0.9
  maximumInterval: number // Tage
  learningSteps: number[] // Minuten
  relearningSteps: number[] // Minuten
  enableFuzz: boolean
}

export const defaultParams = (overrides: Partial<FsrsParams> = {}): FsrsParams => ({
  w: DEFAULT_W,
  requestRetention: 0.9,
  maximumInterval: 365 * 3,
  learningSteps: [1, 10],
  relearningSteps: [10],
  enableFuzz: true,
  ...overrides,
})

export const emptyState = (now: number): SchedulingState => ({
  state: CardState.New,
  due: now,
  stability: 0,
  difficulty: 0,
  reps: 0,
  lapses: 0,
  step: 0,
  lastReview: null,
})

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const r8 = (x: number) => Math.round(x * 1e8) / 1e8

export const decayOf = (w: readonly number[]) => -w[20]
export const factorOf = (w: readonly number[]) => Math.pow(0.9, 1 / decayOf(w)) - 1

/** Abrufwahrscheinlichkeit nach t Tagen bei Stabilität S. */
export function retrievability(tDays: number, s: number, w: readonly number[] = DEFAULT_W): number {
  if (s <= 0) return 0
  return Math.pow(1 + (factorOf(w) * Math.max(0, tDays)) / s, decayOf(w))
}

export const initStability = (g: Rating, w: readonly number[]) => Math.max(w[g - 1], S_MIN)

export const initDifficulty = (g: Rating, w: readonly number[]) =>
  r8(w[4] - Math.exp((g - 1) * w[5]) + 1)

export function nextDifficulty(d: number, g: Rating, w: readonly number[]): number {
  const delta = -w[6] * (g - 3)
  const damped = d + (delta * (10 - d)) / 9
  const reverted = w[7] * initDifficulty(Rating.Easy, w) + (1 - w[7]) * damped
  return clamp(r8(reverted), 1, 10)
}

export function nextRecallStability(d: number, s: number, r: number, g: Rating, w: readonly number[]) {
  const hard = g === Rating.Hard ? w[15] : 1
  const easy = g === Rating.Easy ? w[16] : 1
  const next =
    s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard * easy)
  return clamp(r8(next), S_MIN, S_MAX)
}

export function nextForgetStability(d: number, s: number, r: number, w: readonly number[]) {
  const next = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14])
  return clamp(r8(next), S_MIN, S_MAX)
}

export function nextShortTermStability(s: number, g: Rating, w: readonly number[]) {
  let sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]))
  if (g >= Rating.Hard) sinc = Math.max(sinc, 1)
  return clamp(r8(s * sinc), S_MIN, S_MAX)
}

/** Intervall (Tage) für eine gewünschte Behaltensquote. */
export function nextIntervalDays(s: number, p: FsrsParams, rand: () => number = Math.random): number {
  const decay = decayOf(p.w)
  const modifier = (Math.pow(p.requestRetention, 1 / decay) - 1) / factorOf(p.w)
  let ivl = Math.max(1, Math.round(s * modifier))
  ivl = Math.min(ivl, p.maximumInterval)
  if (p.enableFuzz && ivl >= 3) {
    // ±~5 % Zufallsstreuung, damit sich Wiederholungen nicht auf einzelne Tage ballen
    const delta = Math.max(1, Math.round(ivl * 0.05))
    ivl = ivl - delta + Math.round(rand() * 2 * delta)
    ivl = clamp(ivl, 1, p.maximumInterval)
  }
  return ivl
}

/** Ganze Kalendertage (lokale Zeit) zwischen zwei Zeitpunkten. */
export function daysBetween(a: number, b: number): number {
  const da = new Date(a)
  const db = new Date(b)
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate())
  return Math.round((ub - ua) / DAY)
}

/** Fälligkeit auf den Tagesbeginn (lokale Zeit) + n Tage setzen. */
function dueInDays(now: number, days: number): number {
  const d = new Date(now)
  d.setHours(4, 0, 0, 0) // Tageswechsel um 04:00, wie in Anki
  if (new Date(now).getHours() < 4) d.setDate(d.getDate() - 1)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/**
 * Wendet eine Bewertung an und liefert den neuen Zustand.
 * Lern- und Wiederlernschritte (Minuten) werden wie in Anki behandelt,
 * Stabilität/Schwierigkeit aber immer durch FSRS berechnet.
 */
export function review(
  prev: SchedulingState,
  g: Rating,
  now: number,
  p: FsrsParams = defaultParams(),
  rand: () => number = Math.random,
): SchedulingState {
  const w = p.w
  const next: SchedulingState = { ...prev, reps: prev.reps + 1, lastReview: now }

  if (prev.state === CardState.New || prev.stability <= 0) {
    next.stability = initStability(g, w)
    next.difficulty = clamp(initDifficulty(g, w), 1, 10)
  } else {
    const t = prev.lastReview == null ? 0 : daysBetween(prev.lastReview, now)
    const r = retrievability(t, prev.stability, w)
    next.difficulty = nextDifficulty(prev.difficulty, g, w)
    if (t === 0) {
      next.stability = nextShortTermStability(prev.stability, g, w)
    } else if (g === Rating.Again) {
      const failS = nextForgetStability(prev.difficulty, prev.stability, r, w)
      const minS = prev.stability / Math.exp(w[17] * w[18])
      next.stability = clamp(r8(minS), S_MIN, failS)
    } else {
      next.stability = nextRecallStability(prev.difficulty, prev.stability, r, g, w)
    }
  }

  const toReview = () => {
    next.state = CardState.Review
    next.step = 0
    next.due = dueInDays(now, nextIntervalDays(next.stability, p, rand))
  }
  const inSteps = (steps: number[], state: CardState) => {
    if (steps.length === 0) return toReview()
    let step = prev.state === state ? prev.step : 0
    if (g === Rating.Again) step = 0
    else if (g === Rating.Good) step = step + 1
    else if (g === Rating.Easy) return toReview()
    // Hard: Schritt bleibt, Wartezeit = Mittel aus aktuellem und nächstem Schritt
    if (step >= steps.length) return toReview()
    next.state = state
    next.step = step
    let mins = steps[step]
    if (g === Rating.Hard) mins = step + 1 < steps.length ? (steps[step] + steps[step + 1]) / 2 : steps[step] * 1.5
    next.due = now + mins * MINUTE
  }

  switch (prev.state) {
    case CardState.New:
    case CardState.Learning:
      inSteps(p.learningSteps, CardState.Learning)
      break
    case CardState.Relearning:
      inSteps(p.relearningSteps, CardState.Relearning)
      break
    case CardState.Review:
      if (g === Rating.Again) {
        next.lapses = prev.lapses + 1
        if (p.relearningSteps.length === 0) toReview()
        else {
          next.state = CardState.Relearning
          next.step = 0
          next.due = now + p.relearningSteps[0] * MINUTE
        }
      } else toReview()
      break
  }
  return next
}

/** Vorschau: Intervall jeder Bewertung (für die Anzeige auf den Buttons). */
export function previewIntervals(prev: SchedulingState, now: number, p: FsrsParams) {
  const noFuzz = { ...p, enableFuzz: false }
  return ([1, 2, 3, 4] as Rating[]).map((g) => review(prev, g, now, noFuzz).due - now)
}

export function formatInterval(ms: number): string {
  const min = ms / MINUTE
  if (min < 60) return `${Math.max(1, Math.round(min))} min`
  const h = min / 60
  if (h < 20) return `${Math.round(h)} h`
  const d = ms / DAY
  if (d < 30) return `${Math.round(d)} T`
  if (d < 365) return `${Math.round(d / 30)} Mt`
  return `${(d / 365).toFixed(1)} J`
}
