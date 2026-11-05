import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from '../router'
import { getState, saveSettings, useStore } from '../store/store'
import { cx } from './ui'
import { IconChart, IconExam, IconGrid, IconHome, IconList, IconMenu, IconMoon, IconPlay, IconSettings, IconSun, IconX } from './icons'

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconHome },
  { to: '/lernen', label: 'Jetzt lernen', icon: IconPlay },
  { to: '/modi', label: 'Lernmodi', icon: IconGrid },
  { to: '/listen', label: 'Vokabellisten', icon: IconList },
  { to: '/pruefungen', label: 'Prüfungen', icon: IconExam },
  { to: '/statistik', label: 'Statistiken', icon: IconChart },
  { to: '/einstellungen', label: 'Einstellungen', icon: IconSettings },
]

const isActive = (to: string, path: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'))

export function useThemeEffect() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121316' : '#f6f5f1')
    }
    apply()
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* privater Modus */
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function ThemeButton() {
  const theme = useStore((s) => s.settings.theme)
  const dark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <button
      onClick={() => saveSettings({ theme: dark ? 'light' : 'dark' })}
      className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
      aria-label={dark ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren'}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent font-serif text-lg font-semibold text-accent-ink">é</span>
      <span className="font-semibold tracking-tight">Vocabulaire</span>
    </Link>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { path } = useLocation()
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = isActive(n.to, path)
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition',
              active ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            <n.icon size={18} />
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}

function BackupHint() {
  const dataVersion = useStore((s) => s.dataVersion)
  const backupVersion = useStore((s) => s.backupVersion)
  const last = useStore((s) => s.settings.lastBackupAt)
  const words = useStore((s) => s.words.size)
  const old = !last || Date.now() - last > 7 * 86_400_000
  if (!words || dataVersion === backupVersion || !old) return null
  return (
    <Link to="/einstellungen#backup" className="mx-3 mt-4 block rounded-xl bg-warn-soft p-3 text-xs leading-relaxed text-warn">
      <strong className="block text-[13px]">Sicherung empfohlen</strong>
      {last ? `Letzte Sicherung vor ${Math.floor((Date.now() - last) / 86_400_000)} Tagen.` : 'Noch keine Sicherung erstellt.'} Deine Daten liegen nur in diesem Browser.
    </Link>
  )
}

export function Layout({ children, focus }: { children: ReactNode; focus?: boolean }) {
  const [open, setOpen] = useState(false)
  const { path } = useLocation()
  useEffect(() => setOpen(false), [path])

  if (focus) return <div className="min-h-dvh bg-bg">{children}</div>

  return (
    <div className="min-h-dvh lg:flex">
      {/* Seitenleiste (Desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center justify-between px-2">
          <Brand />
          <ThemeButton />
        </div>
        <NavItems />
        <div className="mt-auto">
          <BackupHint />
        </div>
      </aside>

      {/* Kopfzeile (Mobil/Tablet) */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center">
          <ThemeButton />
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Menü öffnen">
            <IconMenu />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="animate-fade absolute top-0 right-0 flex h-full w-72 flex-col bg-bg p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex justify-end">
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Menü schliessen">
                <IconX />
              </button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
            <BackupHint />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-10">{children}</div>
      </main>
    </div>
  )
}

export const hasData = () => getState().words.size > 0
