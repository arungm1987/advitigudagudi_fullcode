import { createApi } from "@reduxjs/toolkit/query/react";

import { baseQueryWithInterceptor } from "./baseApi";

export interface CurrentUserResponse {
  success: boolean;

  data: {
    userId: string;
    email?: string;
    name?: string;
    roles: string[];
  };
}

export interface AuthCallbackRequest {
  code: string;
}

export const authApi = createApi({
  reducerPath: "authApi",

  baseQuery: baseQueryWithInterceptor,

  tagTypes: ["CurrentUser"],

  endpoints: (builder) => ({
    getCurrentUser: builder.query<CurrentUserResponse, void>({
      query: () => ({
        url: "/auth/me",
        method: "GET",
      }),

      providesTags: ["CurrentUser"],
    }),

    authCallback: builder.mutation<{ success: boolean }, AuthCallbackRequest>({
      query: (body) => ({
        url: "/auth/callback",

        method: "POST",

        body,
      }),

      invalidatesTags: ["CurrentUser"],
    }),

    logout: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: "/auth/logout",

        method: "POST",
      }),

      invalidatesTags: ["CurrentUser"],
    }),
  }),
});

export const {
  useGetCurrentUserQuery,

  useAuthCallbackMutation,

  useLogoutMutation,
} = authApi;
