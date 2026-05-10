import { lazy, Suspense, useEffect, useState } from 'react'

import {
  login,
  logout,
  getAccessToken,
  getIdToken,
  getUserFromToken,
} from '../services/authService'

const AuthApp = lazy(() => import('auth_mfe/AuthApp'))

const HomePage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const [accessToken, setAccessToken] = useState<string | null>(null)

  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const initializeAuth = async () => {
      const token = getAccessToken()
      const idToken = getIdToken()

      if (token && idToken) {
        localStorage.setItem('accessToken', token)

        localStorage.setItem('idToken', idToken)

        requestAnimationFrame(() => {
          setAccessToken(token)

          setIsAuthenticated(true)

          const decodedUser = getUserFromToken()

          setUser(decodedUser)
        })

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        )
      } else {
        const existingToken =
          localStorage.getItem('accessToken')

        if (existingToken) {
          requestAnimationFrame(() => {
            setAccessToken(existingToken)

            setIsAuthenticated(true)

            const decodedUser = getUserFromToken()

            setUser(decodedUser)
          })
        }
      }
    }

    initializeAuth()
  }, [])

  return (
    <div className="min-h-screen p-10">
      <div className="mb-8 rounded-xl border p-6">
        <h1 className="text-3xl font-bold">
          Shell Application
        </h1>

        <p className="mt-2">
          Host MFE running on port 3000
        </p>

        <div className="mt-6 flex gap-4">
          {!isAuthenticated ? (
            <button
              onClick={login}
              className="rounded-lg border px-4 py-2"
            >
              Login with Cognito
            </button>
          ) : (
            <button
              onClick={logout}
              className="rounded-lg border px-4 py-2"
            >
              Logout
            </button>
          )}
        </div>

        {user && (
          <div className="mt-6 rounded-lg border p-4">
            <h3 className="mb-3 text-lg font-semibold">
              Logged In User
            </h3>

            <p>
              <strong>Name:</strong> {user.name}
            </p>

            <p>
              <strong>Email:</strong> {user.email}
            </p>

            <p>
              <strong>User ID:</strong> {user.sub}
            </p>
          </div>
        )}

        {isAuthenticated && (
          <div className="mt-6 break-all">
            <h3 className="mb-2 text-lg font-semibold">
              Access Token
            </h3>

            <p className="text-sm">
              {accessToken}
            </p>
          </div>
        )}
      </div>

      <Suspense fallback={<div>Loading Auth MFE...</div>}>
        <AuthApp />
      </Suspense>
    </div>
  )
}

export default HomePage