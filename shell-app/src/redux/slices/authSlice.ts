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

const initialState: AuthState = {
  accessToken: null,

  idToken: null,

  user: null,

  isAuthenticated: false,
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
    },
  },
});

export const {
  setCredentials,

  clearCredentials,
} = authSlice.actions;

export const authReducer = authSlice.reducer;
