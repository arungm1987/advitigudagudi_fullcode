import { createSlice } from "@reduxjs/toolkit";

import type { PayloadAction } from "@reduxjs/toolkit";

interface UserProfile {
  userId: string;

  email?: string;

  name?: string;

  roles: string[];
}

interface UserState {
  profile: UserProfile | null;
}

const initialState: UserState = {
  profile: null,
};

const userSlice = createSlice({
  name: "user",

  initialState,

  reducers: {
    setUserProfile: (state, action: PayloadAction<UserProfile>) => {
      state.profile = action.payload;
    },

    clearUserProfile: (state) => {
      state.profile = null;
    },
  },
});

export const {
  setUserProfile,

  clearUserProfile,
} = userSlice.actions;

export const userReducer = userSlice.reducer;
