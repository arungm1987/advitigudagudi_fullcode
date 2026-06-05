import { lazy, Suspense } from "react";

import { useSelector, useDispatch } from "react-redux";

import type { RootState, AppDispatch } from "../store/store";

import { clearCredentials, clearUserProfile } from "../redux";

import { login, logout } from "../services/authService";

const AuthApp = lazy(() => import("auth_mfe/AuthApp"));

const HomePage = () => {
  const dispatch = useDispatch<AppDispatch>();

  const {
    isAuthenticated,

    accessToken,

    user,
  } = useSelector((state: RootState) => state.auth);

  const handleLogout = () => {
    dispatch(clearCredentials());

    dispatch(clearUserProfile());

    logout();
  };

  return (
    <div className="min-h-screen p-10">
      <div className="mb-8 rounded-xl border p-6">
        <h1 className="text-3xl font-bold">Shell Application</h1>

        <p className="mt-2">Host MFE running on port 3000</p>

        <div className="mt-6 flex gap-4">
          {!isAuthenticated ? (
            <button onClick={login} className="rounded-lg border px-4 py-2">
              Login with Cognito
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded-lg border px-4 py-2"
            >
              Logout
            </button>
          )}
        </div>

        {user && (
          <div className="mt-6 rounded-lg border p-4">
            <h3 className="mb-3 text-lg font-semibold">Logged In User</h3>

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
              Access Token (Memory Only)
            </h3>

            <p className="text-sm">{accessToken}</p>
          </div>
        )}
      </div>

      <Suspense fallback={<div>Loading Auth MFE...</div>}>
        <AuthApp />
      </Suspense>
    </div>
  );
};

export default HomePage;
