const domain = import.meta.env.VITE_COGNITO_DOMAIN;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const redirectUri = import.meta.env.VITE_REDIRECT_URI;
const logoutUri = import.meta.env.VITE_LOGOUT_URI;
const responseType = import.meta.env.VITE_COGNITO_RESPONSE_TYPE;
const scope = import.meta.env.VITE_COGNITO_SCOPE;
import { jwtDecode } from "jwt-decode";

export const login = () => {
  console.log("LOGIN CLICKED");

  const loginUrl =
    `${domain}/login?` +
    `client_id=${clientId}&` +
    `response_type=${responseType}&` +
    `scope=${scope}&` +
    `redirect_uri=${redirectUri}`;

  console.log(loginUrl);

  window.location.href = loginUrl;
};
export const logout = () => {
  const logoutUrl =
    `${domain}/logout?` + `client_id=${clientId}&` + `logout_uri=${logoutUri}`;

  localStorage.clear();

  window.location.href = logoutUrl;
};

export const getAccessToken = () => {
  const hash = window.location.hash;

  if (!hash) return null;

  const params = new URLSearchParams(hash.substring(1));

  return params.get("access_token");
};

export const getIdToken = () => {
  const hash = window.location.hash;

  if (!hash) return null;

  const params = new URLSearchParams(hash.substring(1));

  return params.get("id_token");
};

export const getUserFromToken = () => {
  const token = getIdToken() || localStorage.getItem("idToken");

  if (!token) {
    return null;
  }

  try {
    return jwtDecode(token);
  } catch (error) {
    console.error("Failed to decode token", error);

    return null;
  }
};
