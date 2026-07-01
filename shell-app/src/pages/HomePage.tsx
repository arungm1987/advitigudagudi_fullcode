import { lazy, Suspense, useEffect } from "react";

import { useSelector, useDispatch } from "react-redux";
import { jwtDecode } from "jwt-decode";

import type { RootState, AppDispatch } from "../store/store";

import {
  clearCredentials,
  clearUserProfile,
  setCredentials,
  setUserProfile,
} from "../redux";

import { login, logout } from "../services/authService";
import RemoteErrorBoundary from "../components/RemoteErrorBoundary";

const AuthApp = lazy(() => import("auth_mfe/AuthApp"));

interface CognitoUser {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

const getDisplayName = (user: CognitoUser) =>
  user.name ||
  [user.given_name, user.family_name].filter(Boolean).join(" ") ||
  user.email;

const HomePage = () => {
  const dispatch = useDispatch<AppDispatch>();

  const { isAuthenticated, accessToken } = useSelector(
    (state: RootState) => state.auth,
  );

  const user = useSelector((state: RootState) => state.user.profile);

  useEffect(() => {
    if (user) {
      return;
    }

    const savedAccessToken = localStorage.getItem("accessToken");
    const savedIdToken = localStorage.getItem("idToken");

    if (!savedAccessToken || !savedIdToken) {
      return;
    }

    try {
      const decodedUser = jwtDecode<CognitoUser>(savedIdToken);

      dispatch(
        setCredentials({
          accessToken: savedAccessToken,
          idToken: savedIdToken,
          user: decodedUser,
        }),
      );

      dispatch(
        setUserProfile({
          userId: decodedUser.sub,
          name: getDisplayName(decodedUser),
          email: decodedUser.email,
          roles: ["USER"],
        }),
      );
    } catch (error) {
      console.error("Failed restoring Cognito user", error);
    }
  }, [dispatch, user]);

  const displayName = user?.name || user?.email || "there";

  const handleLogout = () => {
    dispatch(clearCredentials());

    dispatch(clearUserProfile());

    logout();
  };

  console.log("HOME REDUX STATE", {
    isAuthenticated,
    accessToken,
    user,
  });

  return (
    <div className="min-h-screen p-10">
      <div className="mb-8 rounded-xl border p-6">
        <h1 className="text-3xl font-bold">Advitigudagudi</h1>

        <p className="mt-2">
          {isAuthenticated
            ? `Hello, ${displayName}`
            : "Enterprise Interview Preparation Platform"}
        </p>

        <div className="mt-6 flex gap-4">
          {!isAuthenticated ? (
            <button onClick={login} className="rounded-lg border px-4 py-2">
              Login with Cognito / Google
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

        {isAuthenticated && user && (
          <div className="mt-6 rounded-lg border p-4">
            <h3 className="mb-3 text-lg font-semibold">Logged In User</h3>

            <p>
              <strong>Email:</strong> {user.email}
            </p>

            <p>
              <strong>User ID:</strong> {user.userId}
            </p>

            <p>
              <strong>Roles:</strong> {user.roles?.join(", ")}
            </p>
          </div>
        )}

        {isAuthenticated && (
          <div className="mt-6 break-all">
            <h3 className="mb-2 text-lg font-semibold">
              Access Token (Redux Memory)
            </h3>

            <p className="text-sm">{accessToken}</p>
          </div>
        )}
      </div>

      <RemoteErrorBoundary
        fallback={
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
            Auth MFE is not running. Start `auth-mfe` on port 3001 to load it here.
          </div>
        }
      >
        <Suspense fallback={<div>Loading Auth MFE...</div>}>
          <AuthApp />
        </Suspense>
      </RemoteErrorBoundary>
    </div>
  );
};

export default HomePage;
