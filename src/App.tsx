import { useEffect } from 'react'
import { match, RouterProvider, useLocation } from './router'
import { clearError, load, useStore } from './store/store'
import { Layout, useThemeEffect } from './components/Layout'
import { Button, Empty, Toaster } from './components/ui'
import Dashboard from './pages/Dashboard'
import { LearnPage, ModesPage } from './pages/Learn'
import { ListDetailPage, ListsPage } from './pages/Lists'
import ImportPage from './pages/Import'
import Session from './pages/Session'
import { ExamsPage, TestRunPage } from './pages/Exams'
import StatsPage from './pages/Stats'
import SettingsPage from './pages/Settings'
import { navigate } from './router'
import { requestPersistence } from './lib/db'

function Routes() {
  const { path } = useLocation()
  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'Dashboard', '/lernen': 'Jetzt lernen', '/modi': 'Lernmodi', '/listen': 'Vokabellisten', '/import': 'Import',
      '/pruefungen': 'Prüfungen', '/statistik': 'Statistiken', '/einstellungen': 'Einstellungen', '/sitzung': 'Lernen',
    }
    document.title = `${titles[path] ?? 'Vokabeln'} · Vocabulaire`
  }, [path])

  if (path === '/sitzung') return <Layout focus><Session /></Layout>
  if (path === '/pruefungen/test') return <Layout focus><TestRunPage /></Layout>
  const list = match('/listen/:id', path)
  const page =
    path === '/' ? <Dashboard />
    : path === '/lernen' ? <LearnPage />
    : path === '/modi' ? <ModesPage />
    : path === '/listen' ? <ListsPage />
    : list ? <ListDetailPage id={list.id} key={list.id} />
    : path === '/import' ? <ImportPage />
    : path === '/pruefungen' ? <ExamsPage />
    : path === '/statistik' ? <StatsPage />
    : path === '/einstellungen' ? <SettingsPage />
    : <Empty title="Seite nicht gefunden" action={<Button onClick={() => navigate('/')}>Zum Dashboard</Button>} />
  return <Layout>{page}</Layout>
}

function Shell() {
  useThemeEffect()
  const loaded = useStore((s) => s.loaded)
  const error = useStore((s) => s.error)
  useEffect(() => {
    load()
    requestPersistence()
  }, [])
  if (!loaded)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Lädt" />
      </div>
    )
  return (
    <>
      {error && (
        <div role="alert" className="fixed top-3 left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl bg-bad px-4 py-2.5 text-sm text-white shadow-lg">
          {error}
          <button onClick={clearError} className="underline">OK</button>
        </div>
      )}
      <Routes />
      <Toaster />
    </>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  )
}
