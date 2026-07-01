import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface AuthUser {
  sub: string;

  email?: string;

  name?: string;
}

interface AuthState {
  accessToken: string | null;

  idToken: string | null;

  user: AuthUser | null;

  isAuthenticated: boolean;
}

const accessToken = localStorage.getItem("accessToken");
const idToken = localStorage.getItem("idToken");

const initialState: AuthState = {
  accessToken,

  idToken,

  user: null,

  isAuthenticated: Boolean(accessToken && idToken),
};

const authSlice = createSlice({
  name: "auth",

  initialState,

  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        accessToken: string;

        idToken: string;

        user: AuthUser;
      }>,
    ) => {
      state.accessToken = action.payload.accessToken;

      state.idToken = action.payload.idToken;

      state.user = action.payload.user;

      state.isAuthenticated = true;
    },

    clearCredentials: (state) => {
      state.accessToken = null;

      state.idToken = null;

      state.user = null;

      state.isAuthenticated = false;

      localStorage.removeItem("accessToken");
      localStorage.removeItem("idToken");
    },
  },
});

export const {
  setCredentials,

  clearCredentials,
} = authSlice.actions;

export const authReducer = authSlice.reducer;
