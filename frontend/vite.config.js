import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, Vite passes every /api request on to the FastAPI server.
// To the browser, the page and the API then look like one site, so no CORS is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
