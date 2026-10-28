import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "EchoFeedback",
      formats: ["es", "iife"],
      fileName: format => (format === "es" ? "echo-feedback.js" : "echo-feedback.iife.js"),
    },
    minify: true,
    sourcemap: false,
  },
});
