import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    try {
      if (import.meta.env.VITE_E2E === 'true') {
        await signInWithEmailAndPassword(
          auth,
          import.meta.env.VITE_E2E_TEST_EMAIL,
          import.meta.env.VITE_E2E_TEST_PASSWORD
        )
      } else {
        const provider = new GoogleAuthProvider()
        await signInWithPopup(auth, provider)
      }
      setError(null)
    } catch {
      setError('Sign-in failed.')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-6 px-4">
      <div className="flex flex-col items-center gap-4 bg-card border border-border rounded-lg shadow-sm px-10 py-8">
        <h1 className="text-2xl font-bold m-0">pigeon</h1>
        <p className="text-sm text-muted-foreground m-0">What Muse found for you</p>
        <button
          onClick={handleSignIn}
          className="px-6 py-3 text-base cursor-pointer rounded-md border border-border hover:bg-muted"
        >
          Sign in with Google
        </button>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  )
}
