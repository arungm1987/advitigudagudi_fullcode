import {
  combineReducers,
} from "@reduxjs/toolkit";


import {
  authReducer,
  userReducer,
} from "../redux";


export const rootReducer =
  combineReducers({

    auth: authReducer,

    user: userReducer,

  });


export type RootState =
  ReturnType<
    typeof rootReducer
  >;