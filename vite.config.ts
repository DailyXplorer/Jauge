import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "charts", test: /node_modules[\\/].*(recharts|d3-|victory-vendor|es-toolkit|immer|reselect|redux)/ },
            { name: "react", test: /node_modules[\\/].*[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "ui", test: /node_modules[\\/].*(radix-ui|@radix-ui|cmdk|@phosphor-icons)/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5174,
    host: true,
    // Optional extra dev hosts, e.g. a tunnel: DEV_ALLOWED_HOSTS=".example.com" in .env.local
    allowedHosts: (process.env.DEV_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
  },
});
