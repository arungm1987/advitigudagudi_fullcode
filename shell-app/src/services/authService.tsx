const domain = import.meta.env.VITE_COGNITO_DOMAIN;

const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

const redirectUri = import.meta.env.VITE_REDIRECT_URI;

const logoutUri = import.meta.env.VITE_LOGOUT_URI;

const responseType = import.meta.env.VITE_COGNITO_RESPONSE_TYPE;

const scope = import.meta.env.VITE_COGNITO_SCOPE;

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
    `scope=${encodeURIComponent(scope)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}`;

  window.location.href = loginUrl;
};

export const logout = () => {
  const logoutUrl =
    `${domain}/logout?` +
    `client_id=${clientId}&` +
    `logout_uri=${encodeURIComponent(logoutUri)}`;

  window.location.href = logoutUrl;
};
