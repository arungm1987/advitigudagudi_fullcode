import { useEffect } from "react";

import { useDispatch } from "react-redux";

import { useNavigate } from "react-router-dom";

import { jwtDecode } from "jwt-decode";

import type { AppDispatch } from "../../store/store";

import { setCredentials, setUserProfile } from "../../redux";

const AuthCallback = () => {
  const dispatch = useDispatch<AppDispatch>();

  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash) {
      navigate("/");

      return;
    }

    const params = new URLSearchParams(hash.substring(1));

    const accessToken = params.get("access_token");

    const idToken = params.get("id_token");

    if (accessToken && idToken) {
      const user = jwtDecode<any>(idToken);

      dispatch(
        setCredentials({
          accessToken,
          idToken,
        }),
      );

      dispatch(
        setUserProfile({
          sub: user.sub,
          name: user.name,
          email: user.email,
        }),
      );

      window.history.replaceState({}, document.title, "/");

      navigate("/");
    }
  }, [dispatch, navigate]);

  return <div>Completing login...</div>;
};

export default AuthCallback;
