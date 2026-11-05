import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { IconInfo, IconX } from './icons'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'good'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-bad-soft text-bad hover:brightness-95',
  good: 'bg-good text-white hover:brightness-110 shadow-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none select-none',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-[15px]',
        size === 'lg' && 'h-12 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx('rounded-2xl border border-line bg-surface', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  )
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'good' | 'bad' | 'warn'; children: ReactNode; className?: string }) {
  const t = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
  }[tone]
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', t, className)}>{children}</span>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-muted">{children}</kbd>
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft'

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, 'h-10', className)} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, className)} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, 'h-10 pr-8', className)} />

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('inline-flex flex-wrap rounded-xl bg-surface-2 p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-medium transition', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; className?: string }) {
  const c = { accent: 'bg-accent', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone]
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', c)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

export function Info({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button aria-label="Erklärung" onClick={() => setOpen(!open)} className="text-faint hover:text-muted">
        <IconInfo size={15} />
      </button>
      {open && (
        <span className="animate-fade absolute top-6 left-1/2 z-30 w-64 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-left text-xs leading-relaxed font-normal text-muted shadow-xl">
          {children}
        </span>
      )}
    </span>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('animate-pop max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Schliessen">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, info, tone }: { label: string; value: ReactNode; sub?: ReactNode; info?: ReactNode; tone?: 'good' | 'bad' | 'accent' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        {label}
        {info && <Info>{info}</Info>}
      </div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums tracking-tight', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad', tone === 'accent' && 'text-accent')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  )
}

/** Bestätigung ohne window.confirm (funktioniert auch als installierte PWA) */
export function useConfirm() {
  const [state, setState] = useState<{ text: string; resolve: (v: boolean) => void; danger?: boolean } | null>(null)
  const ask = (text: string, danger = true) => new Promise<boolean>((resolve) => setState({ text, resolve, danger }))
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const node = (
    <Modal open={!!state} onClose={() => close(false)} title="Bitte bestätigen">
      <p className="text-[15px] text-muted">{state?.text}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={() => close(false)}>Abbrechen</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
          Bestätigen
        </Button>
      </div>
    </Modal>
  )
  return { ask, node }
}

let toastFn: ((t: string, tone?: 'good' | 'bad') => void) | null = null
export const toast = (t: string, tone?: 'good' | 'bad') => toastFn?.(t, tone)

export function Toaster() {
  const [items, setItems] = useState<{ id: number; t: string; tone?: 'good' | 'bad' }[]>([])
  useEffect(() => {
    toastFn = (t, tone) => {
      const id = Date.now() + Math.random()
      setItems((x) => [...x, { id, t, tone }])
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500)
    }
    return () => {
      toastFn = null
    }
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={cx('animate-pop rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg', i.tone === 'bad' ? 'bg-bad text-white' : i.tone === 'good' ? 'bg-good text-white' : 'bg-ink text-bg')}>
          {i.t}
        </div>
      ))}
    </div>
  )
}

export function ListPicker({ lists, value, onChange, counts }: { lists: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; counts?: Record<string, number> }) {
  const all = value.length === 0
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onChange([])} className={cx('rounded-full border px-3 py-1.5 text-sm transition', all ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink')}>
        Alle Listen
      </button>
      {lists.map((l) => {
        const on = value.includes(l.id)
        return (
          <button
            key={l.id}
            onClick={() => onChange(on ? value.filter((x) => x !== l.id) : [...value, l.id])}
            className={cx('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink')}
          >
            {l.name}
            {counts && <span className="ml-1.5 text-xs opacity-70">{counts[l.id] ?? 0}</span>}
          </button>
        )
      })}
    </div>
  )
}
