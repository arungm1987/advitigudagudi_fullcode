import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthCallbackMutation } from "../../services/authApi";

const AuthCallback = () => {
  const navigate = useNavigate();

  const [exchangeCode] = useAuthCallbackMutation();

  useEffect(() => {
    const processLogin = async () => {
      const params = new URLSearchParams(window.location.search);

      const code = params.get("code");

      if (!code) {
        navigate("/");
        return;
      }

      await exchangeCode({
        code,
      }).unwrap();

      navigate("/dashboard");
    };

    processLogin();
  }, [exchangeCode, navigate]);

  return <div>Completing login...</div>;
};

export default AuthCallback;
