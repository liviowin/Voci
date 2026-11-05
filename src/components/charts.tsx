import { useState, type ReactNode } from 'react'
import { cx } from './ui'

export function Bars({
  data,
  height = 120,
  color = 'var(--c-accent)',
  format = (v: number) => String(v),
  highlightLast,
}: {
  data: { label: string; value: number; sub?: string }[]
  height?: number
  color?: string
  format?: (v: number) => string
  highlightLast?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const shown = hover ?? (highlightLast ? data.length - 1 : null)
  return (
    <div>
      <div className="mb-2 h-5 text-sm text-muted">
        {shown != null && data[shown] && (
          <span>
            <span className="font-medium text-ink tabular-nums">{format(data[shown].value)}</span> · {data[shown].sub ?? data[shown].label}
          </span>
        )}
      </div>
      <div className="flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={i} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <div
              className="w-full rounded-t-[3px] transition-all"
              style={{
                height: d.value ? `${Math.max(3, (d.value / max) * 100)}%` : 2,
                background: d.value ? color : 'var(--c-line)',
                opacity: shown == null || shown === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

export function Ring({ value, size = 92, stroke = 9, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface-2)" strokeWidth={stroke} />
        {v > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={v >= 1 ? 'var(--c-good)' : 'var(--c-accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

export const STAGE_COLORS: Record<string, string> = {
  neu: 'var(--c-faint)',
  lernend: '#e3a33b',
  wiederholung: 'var(--c-accent)',
  beherrscht: 'var(--c-good)',
  vergessen: 'var(--c-bad)',
}

export function StackBar({ parts, className }: { parts: { key: string; value: number; label: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        {parts.map((p) => (
          <div key={p.key} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: STAGE_COLORS[p.key] }} />
        ))}
      </div>
    </div>
  )
}

export function Legend({ parts }: { parts: { key: string; value: number; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {parts.map((p) => (
        <span key={p.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STAGE_COLORS[p.key] }} />
          {p.label} <span className="tabular-nums text-ink">{p.value}</span>
        </span>
      ))}
    </div>
  )
}

/** Kalender-Heatmap der letzten Wochen (Montag oben). */
export function Heatmap({ days, weeks = 26, value, title }: { days: Map<string, number>; weeks?: number; value: (key: string) => string; title?: string }) {
  const [sel, setSel] = useState<string | null>(null)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const dow = (today.getDay() + 6) % 7
  const start = new Date(today)
  start.setDate(today.getDate() - dow - (weeks - 1) * 7)
  const max = Math.max(1, ...days.values())
  const cols: { key: string; v: number; future: boolean; date: Date }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start)
      dt.setDate(start.getDate() + w * 7 + d)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      col.push({ key, v: days.get(key) ?? 0, future: dt > today, date: dt })
    }
    cols.push(col)
  }
  const level = (v: number) => (v === 0 ? 0 : v / max < 0.25 ? 1 : v / max < 0.5 ? 2 : v / max < 0.8 ? 3 : 4)
  const months: { i: number; label: string }[] = []
  cols.forEach((c, i) => {
    if (c[0].date.getDate() <= 7) months.push({ i, label: c[0].date.toLocaleDateString('de-CH', { month: 'short' }) })
  })
  return (
    <div>
      <div className="overflow-x-auto scrollbar-thin">
        <div className="inline-block">
          <div className="relative mb-1 h-4 text-[10px] text-faint">
            {months.map((m) => (
              <span key={m.i} className="absolute" style={{ left: m.i * 14 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {cols.map((c, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {c.map((d) => (
                  <button
                    key={d.key}
                    aria-label={`${d.key}: ${value(d.key)}`}
                    onClick={() => setSel(d.key)}
                    className={cx('h-[11px] w-[11px] rounded-[3px]', d.future && 'opacity-0', sel === d.key && 'ring-2 ring-ink')}
                    style={{
                      background:
                        level(d.v) === 0 ? 'var(--c-heat-0)' : `color-mix(in oklab, var(--c-accent) ${[0, 30, 55, 78, 100][level(d.v)]}%, var(--c-heat-0))`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-muted">
        {sel ? (
          <>
            <span className="text-ink">{new Date(sel + 'T12:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</span> · {value(sel)}
          </>
        ) : (
          title ?? 'Tippe auf einen Tag für Details.'
        )}
      </div>
    </div>
  )
}

export function Line({ points, height = 120, min = 0, max = 1, format }: { points: { label: string; value: number | null }[]; height?: number; min?: number; max?: number; format: (v: number) => string }) {
  const w = 300
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as { label: string; value: number; i: number }[]
  const x = (i: number) => (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * (w - 16) + 8)
  const y = (v: number) => height - 8 - ((v - min) / (max - min || 1)) * (height - 16)
  const d = valid.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.value)}`).join(' ')
  const last = valid[valid.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={w} y1={y(min + (max - min) * g)} y2={y(min + (max - min) * g)} stroke="var(--c-line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={d} fill="none" stroke="var(--c-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {valid.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r="3" fill="var(--c-surface)" stroke="var(--c-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>{points[0]?.label}</span>
        {last && <span className="text-muted">zuletzt {format(last.value)}</span>}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}
