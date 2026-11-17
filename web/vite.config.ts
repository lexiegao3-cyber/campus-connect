import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxy = { "/api": "http://localhost:8787", "/socket.io": { target: "http://localhost:8787", ws: true } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
