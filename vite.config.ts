import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Workspace runs on its own. Gym is native React (no Melani iframe / no PIN).
// Optional: proxy only /melani/* if you open live Melani in a new tab later.
const MELANI_TARGET = "http://127.0.0.1:8781";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Do NOT proxy /static or /gym — that broke Notion workspace assets
      // and made Gym look like the Notion part was deleted.
      "/melani": {
        target: MELANI_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/melani/, "") || "/",
      },
      // Real Gmail IMAP bridge (server/gmail_api.py on :8790)
      "/api/gmail": {
        target: "http://127.0.0.1:8790",
        changeOrigin: true,
      },
      // Melani AI (Grok) bridge (server/melani_ai.py on :8791)
      "/api/melani-ai": {
        target: "http://127.0.0.1:8791",
        changeOrigin: true,
      },
    },
  },
});
