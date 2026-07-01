import { jwtDecode } from "jwt-decode";

const domain = import.meta.env.VITE_COGNITO_DOMAIN;

const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

const redirectUri = import.meta.env.VITE_REDIRECT_URI;

const logoutUri = import.meta.env.VITE_LOGOUT_URI;

const responseType = import.meta.env.VITE_COGNITO_RESPONSE_TYPE;

const scope = import.meta.env.VITE_COGNITO_SCOPE;

const getEncodedScope = () =>
  encodeURIComponent(decodeURIComponent(scope.replace(/\+/g, " ")));

/**
 * Redirect to AWS Cognito Hosted UI
 */
export const login = () => {
  console.log("LOGIN CLICKED");

  console.log("COGNITO ENV VALUES", {
    domain,
    clientId,
    redirectUri,
    responseType,
    scope,
  });

  const loginUrl =
    `${domain}/login?` +
    `client_id=${clientId}&` +
    `response_type=${responseType}&` +
    `scope=${getEncodedScope()}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}`;

  window.location.href = loginUrl;
};

/**
 * Logout from Cognito
 */
export const logout = () => {
  const logoutUrl =
    `${domain}/logout?` +
    `client_id=${clientId}&` +
    `logout_uri=${encodeURIComponent(logoutUri)}`;

  localStorage.clear();

  window.location.href = logoutUrl;
};

/**
 * Get Cognito Access Token
 *
 * Supports:
 * - implicit flow (#access_token)
 * - authorization code callback later
 */
export const getAccessToken = () => {
  const hash = window.location.hash;

  if (!hash) {
    return localStorage.getItem("accessToken");
  }

  const params = new URLSearchParams(hash.substring(1));

  return params.get("access_token");
};

/**
 * Get Cognito ID Token
 */
export const getIdToken = () => {
  const hash = window.location.hash;

  if (!hash) {
    return localStorage.getItem("idToken");
  }

  const params = new URLSearchParams(hash.substring(1));

  return params.get("id_token");
};

/**
 * Decode logged in user
 */
export const getUserFromToken = () => {
  const token = getIdToken() || localStorage.getItem("idToken");

  if (!token) {
    return null;
  }

  try {
    return jwtDecode(token);
  } catch (error) {
    console.error("Failed decoding token", error);

    return null;
  }
};
