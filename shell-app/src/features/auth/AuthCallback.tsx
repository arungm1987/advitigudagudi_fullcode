import { useEffect } from "react";

import { useDispatch } from "react-redux";

import { useNavigate } from "react-router-dom";

import { jwtDecode } from "jwt-decode";

import type { AppDispatch } from "../../store/store";

import { setCredentials, setUserProfile } from "../../redux";

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
      const user = jwtDecode<CognitoUser>(idToken);

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("idToken", idToken);

      dispatch(
        setCredentials({
          accessToken,

          idToken,

          user,
        }),
      );

      dispatch(
        setUserProfile({
          userId: user.sub,

          name: getDisplayName(user),

          email: user.email,

          roles: ["USER"],
        }),
      );

      window.history.replaceState(
        {},

        document.title,

        "/",
      );

      navigate("/");
    }
  }, [dispatch, navigate]);

  return <div>Completing login...</div>;
};

export default AuthCallback;
