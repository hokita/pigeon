import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './firebase'
import { parseRoute, routePath, type Route } from './router'
import LoginPage from './pages/LoginPage'
import FeedPage from './pages/FeedPage'
import ItemPage from './pages/ItemPage'

const routeFromLocation = () => parseRoute(window.location.pathname, window.location.search)

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [route, setRoute] = useState<Route>(routeFromLocation)

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(next: Route) {
    window.history.pushState(null, '', routePath(next))
    window.scrollTo?.(0, 0)
    setRoute(next)
  }

  if (user === undefined) return null
  if (!user) return <LoginPage />
  return (
    <>
      {/* Lets the owner switch accounts, e.g. after signing in with one not in ALLOWED_EMAILS. */}
      <div className="max-w-3xl mx-auto px-4 pt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void signOut(auth)}
          className="text-sm text-muted-foreground rounded-md border border-border px-3 py-1"
        >
          Sign out
        </button>
      </div>
      {route.page === 'item' ? (
        <ItemPage key={route.id} id={route.id} navigate={navigate} />
      ) : (
        <FeedPage key={route.type ?? ''} type={route.type} navigate={navigate} />
      )}
    </>
  )
}
