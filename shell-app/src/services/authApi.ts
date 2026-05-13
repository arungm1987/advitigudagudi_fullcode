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
  }),
});

export const { useGetCurrentUserQuery } = authApi;
