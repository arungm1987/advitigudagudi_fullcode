const loginUrl = `${import.meta.env.VITE_COGNITO_DOMAIN}/login?client_id=${import.meta.env.VITE_COGNITO_CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${import.meta.env.VITE_COGNITO_REDIRECT_URI}`;

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-[420px]">
        <h1 className="text-3xl font-bold text-center mb-3">Advitigudagudi</h1>

        <p className="text-gray-600 text-center mb-8">
          Enterprise Interview Preparation Platform
        </p>

        <button
          onClick={() => {
            window.location.href = loginUrl;
          }}
          className="w-full bg-black text-white py-3 rounded-xl hover:opacity-90 transition"
        >
          Continue to Login
        </button>
      </div>
    </div>
  );
}
