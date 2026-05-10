import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), nitro(), viteReact()],
  optimizeDeps: {
    exclude: ["onnxruntime-node"],
  },
  ssr: {
    external: ["onnxruntime-node"],
  },
  build: {
    rollupOptions: {
      external: ["onnxruntime-node"],
    },
  },
  server: {
    port: 3003,
  },
});
