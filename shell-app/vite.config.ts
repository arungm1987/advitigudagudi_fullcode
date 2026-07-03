import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const authMfeRemoteUrl =
    env.VITE_AUTH_MFE_REMOTE_URL ||
    (mode === "production"
      ? "https://dev.advitigudagudi.com/assets/remoteEntry.js"
      : "http://localhost:3001/assets/remoteEntry.js");

  return {
    plugins: [
      react(),

      federation({
        name: "shell_app",

        remotes: {
          auth_mfe: authMfeRemoteUrl,
        },

        shared: ["react", "react-dom"],
      }),
    ],

    server: {
      port: 3000,
    },
  };
});
