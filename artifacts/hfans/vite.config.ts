import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: process.env.BASE_PATH || "/",

  plugins: [
    react(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },

  server: {
    port: Number(process.env.PORT) || 5173,
    host: "0.0.0.0",
  },

  preview: {
    port: Number(process.env.PORT) || 5173,
    host: "0.0.0.0",
  },
});
