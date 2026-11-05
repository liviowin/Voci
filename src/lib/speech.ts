/** Französische Sprachausgabe über die Web Speech API des Browsers. */

export const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window

let voicesCache: SpeechSynthesisVoice[] = []

export function frenchVoices(): SpeechSynthesisVoice[] {
  if (!ttsAvailable()) return []
  const v = speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().startsWith('fr'))
  if (v.length) voicesCache = v
  return voicesCache
}

export function onVoicesChanged(cb: () => void): () => void {
  if (!ttsAvailable()) return () => undefined
  speechSynthesis.addEventListener('voiceschanged', cb)
  return () => speechSynthesis.removeEventListener('voiceschanged', cb)
}

export function speak(text: string, opts: { rate?: number; voiceURI?: string } = {}): boolean {
  if (!ttsAvailable() || !text) return false
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voices = frenchVoices()
  const voice = voices.find((v) => v.voiceURI === opts.voiceURI) ?? voices.find((v) => v.lang === 'fr-FR') ?? voices[0]
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'fr-FR'
  u.rate = opts.rate ?? 0.9
  speechSynthesis.speak(u)
  return true
}

export const hasFrenchVoice = () => frenchVoices().length > 0
