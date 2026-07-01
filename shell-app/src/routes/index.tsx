import { Routes, Route } from "react-router-dom";

import LoginPage from "../features/auth/LoginPage";
import AuthCallback from "../features/auth/AuthCallback";
import AuthBootstrap from "../features/auth/AuthBootstrap";
import HomePage from "../pages/HomePage";

const AppRoutes = () => {
  return (
    <Routes>

      {/* Main shell page */}
      <Route 
        path="/" 
        element={<HomePage />} 
      />

      <Route
        path="/login"
        element={<LoginPage />}
      />

      {/* Cognito redirects here */}
      <Route
        path="/auth/callback"
        element={<AuthCallback />}
      />

      {/* Temporary protected test page */}
      <Route
        path="/dashboard"
        element={<AuthBootstrap />}
      />

    </Routes>
  );
};

export default AppRoutes;
