/**
 * PDF-Text im Browser extrahieren (PDF.js). Seiten ohne Textebene
 * (Scans) werden gerendert und mit Tesseract.js per OCR gelesen.
 * Beide Bibliotheken werden erst bei Bedarf geladen.
 */
import type { TextItem } from './parser'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export const MAX_PDF_BYTES = 50 * 1024 * 1024
export const MAX_PAGES = 300

export interface ExtractedPage {
  page: number
  items: TextItem[]
  ocr: boolean
}

export interface ExtractProgress {
  phase: 'lesen' | 'ocr-laden' | 'ocr'
  page: number
  pages: number
  ocrProgress?: number
}

export type OcrMode = 'auto' | 'force' | 'off'

export async function validatePdf(file: File): Promise<ArrayBuffer> {
  if (file.size > MAX_PDF_BYTES) throw new Error(`«${file.name}» ist grösser als 50 MB.`)
  const buf = await file.arrayBuffer()
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 1024)))
  if (!head.includes('%PDF-')) throw new Error(`«${file.name}» ist keine gültige PDF-Datei.`)
  return buf
}

type PdfJs = typeof import('pdfjs-dist')
let pdfjsPromise: Promise<PdfJs> | null = null
async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise)
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })()
  return pdfjsPromise
}

interface TessWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}
interface TessWorker {
  recognize: (img: HTMLCanvasElement, opts?: object, output?: object) => Promise<{ data: { words?: TessWord[]; blocks?: { paragraphs: { lines: { words: TessWord[] }[] }[] }[] | null } }>
  terminate: () => Promise<unknown>
}

async function createOcrWorker(onProgress: (p: number) => void): Promise<TessWorker> {
  const T = await import('tesseract.js')
  const createWorker = (T as unknown as { createWorker: (...a: unknown[]) => Promise<TessWorker> }).createWorker
  return createWorker(['fra', 'deu'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(m.progress)
    },
  })
}

function wordsFrom(data: Awaited<ReturnType<TessWorker['recognize']>>['data']): TessWord[] {
  if (data.words?.length) return data.words
  return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
}

export async function extractPdf(
  buf: ArrayBuffer,
  opts: { ocr: OcrMode; onProgress?: (p: ExtractProgress) => void; signal?: AbortSignal },
): Promise<ExtractedPage[]> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) })
  const doc = await task.promise
  const pages = Math.min(doc.numPages, MAX_PAGES)
  const out: ExtractedPage[] = []
  let worker: TessWorker | null = null
  try {
    for (let p = 1; p <= pages; p++) {
      if (opts.signal?.aborted) throw new Error('Abgebrochen')
      opts.onProgress?.({ phase: 'lesen', page: p, pages })
      const page = await doc.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      const items: TextItem[] = []
      for (const it of tc.items) {
        if (!('str' in it) || !it.str) continue
        const [a, b, c, d, e, f] = it.transform as number[]
        const h = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10
        items.push({ str: it.str, x: e, y: vp.height - f - h, w: it.width || it.str.length * h * 0.5, h })
      }
      const textChars = items.reduce((n, i) => n + i.str.trim().length, 0)
      const needsOcr = opts.ocr === 'force' || (opts.ocr === 'auto' && textChars < 25)
      if (!needsOcr) {
        out.push({ page: p, items, ocr: false })
        continue
      }
      if (!worker) {
        opts.onProgress?.({ phase: 'ocr-laden', page: p, pages })
        worker = await createOcrWorker((x) => opts.onProgress?.({ phase: 'ocr', page: p, pages, ocrProgress: x }))
      }
      const scale = 2.2
      const view = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(view.width)
      canvas.height = Math.ceil(view.height)
      await page.render({ canvas, viewport: view }).promise
      opts.onProgress?.({ phase: 'ocr', page: p, pages, ocrProgress: 0 })
      const res = await worker.recognize(canvas, {}, { blocks: true, text: true })
      const words = wordsFrom(res.data)
      out.push({
        page: p,
        ocr: true,
        items: words
          .filter((w) => w.text.trim())
          .map((w) => ({
            str: w.text,
            x: w.bbox.x0 / scale,
            y: w.bbox.y0 / scale,
            w: (w.bbox.x1 - w.bbox.x0) / scale,
            h: (w.bbox.y1 - w.bbox.y0) / scale,
            conf: w.confidence,
          })),
      })
      canvas.width = canvas.height = 0
    }
  } finally {
    if (worker) await worker.terminate().catch(() => undefined)
    await task.destroy().catch(() => undefined)
  }
  return out
}
