/**
 * Minimaler clientseitiger Router für GitHub Pages.
 * Berücksichtigt das Unterverzeichnis (Vite «base»). Direkte Aufrufe und
 * Neuladen von Unterseiten funktionieren über die 404.html-Kopie der App.
 */
import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

export const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

const readLocation = () => {
  let path = window.location.pathname
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length)
  return { path: path.replace(/\/+$/, '') || '/', search: window.location.search }
}

type Loc = ReturnType<typeof readLocation>
const RouterCtx = createContext<Loc>({ path: '/', search: '' })

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = BASE + (to.startsWith('/') ? to : '/' + to)
  if (opts.replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  window.dispatchEvent(new Event('app:navigate'))
  window.scrollTo({ top: 0 })
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState(readLocation)
  useEffect(() => {
    const update = () => setLoc(readLocation())
    window.addEventListener('popstate', update)
    window.addEventListener('app:navigate', update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('app:navigate', update)
    }
  }, [])
  return <RouterCtx.Provider value={loc}>{children}</RouterCtx.Provider>
}

export const useLocation = () => useContext(RouterCtx)
export const useQuery = () => new URLSearchParams(useContext(RouterCtx).search)

/** Pfadmuster wie "/listen/:id" prüfen */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      {...rest}
      href={BASE + to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
    />
  )
}
