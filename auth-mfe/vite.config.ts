import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "auth_mfe",
      filename: "remoteEntry.js",

      exposes: {
        "./AuthApp": "./src/App.tsx",
      },

      shared: ["react", "react-dom"],
    }),
  ],

  build: {
    target: "esnext",
    minify: false,
  },

  server: {
    port: 3001,
  },
  preview: {
    port: 3001,
  },
});
