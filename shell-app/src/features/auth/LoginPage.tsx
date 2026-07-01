const domain = import.meta.env.VITE_COGNITO_DOMAIN;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const redirectUri = import.meta.env.VITE_REDIRECT_URI;
const responseType = import.meta.env.VITE_COGNITO_RESPONSE_TYPE;
const scope = import.meta.env.VITE_COGNITO_SCOPE;

const getEncodedScope = () =>
  encodeURIComponent(decodeURIComponent(scope.replace(/\+/g, " ")));

const LoginPage = () => {
  const login = () => {
    console.log("=========== COGNITO DEBUG ===========");

    console.log({
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

    console.log("LOGIN URL:", loginUrl);

    window.location.href = loginUrl;
  };

  return (
    <div>
      <h1>Advitigudagudi</h1>

      <p>Enterprise Interview Preparation Platform</p>

      <button onClick={login}>Login with Cognito / Google</button>
    </div>
  );
};

export default LoginPage;
