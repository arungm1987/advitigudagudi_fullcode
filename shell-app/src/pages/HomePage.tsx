import { useEffect } from "react";

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

  const { isAuthenticated } = useSelector(
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

  return (
    <div className="home-page">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">A</span>
          <span>Advitigudagudi</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a href="#practice">Practice</a>
          <a href="#calendar">Calendar</a>
          <a href="#progress">Progress</a>
          <a href="#resources">Resources</a>
        </nav>

        {!isAuthenticated ? (
          <button onClick={login} className="primary-action">
            Login
          </button>
        ) : (
          <button onClick={handleLogout} className="secondary-action">
            Logout
          </button>
        )}
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">Interview preparation workspace</p>
            <h1>
              {isAuthenticated
                ? `Welcome, ${displayName}`
                : "Prepare smarter for every interview round."}
            </h1>
            <p className="hero-text">
              A focused place for practice plans, calendar reminders, progress
              tracking, and interview resources. Content modules will be added
              here as the product grows.
            </p>
            <div className="hero-actions">
              {!isAuthenticated ? (
                <button onClick={login} className="primary-action large">
                  Login with Google
                </button>
              ) : (
                <a className="primary-action large" href="#practice">
                  Continue
                </a>
              )}
            </div>
          </div>

          <div className="hero-panel" aria-label="Preparation summary">
            <div>
              <span className="panel-label">Today</span>
              <strong>Mock interview plan</strong>
            </div>
            <div className="panel-row">
              <span>System design</span>
              <span>Placeholder</span>
            </div>
            <div className="panel-row">
              <span>DSA practice</span>
              <span>Placeholder</span>
            </div>
            <div className="panel-row">
              <span>Resume review</span>
              <span>Placeholder</span>
            </div>
          </div>
        </section>

        <section className="feature-grid" aria-label="Homepage sections">
          <article id="practice" className="feature-card">
            <span className="feature-icon">01</span>
            <h2>Practice</h2>
            <p>Placeholder for coding, behavioral, and role-specific drills.</p>
          </article>

          <article id="calendar" className="feature-card">
            <span className="feature-icon">02</span>
            <h2>Calendar</h2>
            <p>Placeholder for interviews, reminders, and preparation blocks.</p>
          </article>

          <article id="progress" className="feature-card">
            <span className="feature-icon">03</span>
            <h2>Progress</h2>
            <p>Placeholder for readiness score, streaks, and completed tasks.</p>
          </article>

          <article id="resources" className="feature-card">
            <span className="feature-icon">04</span>
            <h2>Resources</h2>
            <p>Placeholder for notes, links, templates, and curated guides.</p>
          </article>
        </section>
      </main>
    </div>
  );
};

export default HomePage;
