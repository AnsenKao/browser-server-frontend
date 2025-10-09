/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url))
        }
    },
    server: {
        port: 5173,
        open: true,
        proxy: {
            "/api": {
                target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, "")
            }
        }
    },
    test: {
        environment: "jsdom",
        setupFiles: "./src/setupTests.ts"
    }
});
