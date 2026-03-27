import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readVersion = (filePath: string) => {
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as { version?: string };
  return typeof parsed.version === "string" && parsed.version.trim() !== ""
    ? parsed.version.trim()
    : "";
};

const appVersion =
  readVersion(path.join(__dirname, "../package.json")) ||
  readVersion(path.join(__dirname, "package.json")) ||
  "0.0.0";

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
