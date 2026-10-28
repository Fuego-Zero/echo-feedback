import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  html: { cspNonce: "__ECHO_NONCE__" },
  build: { sourcemap: false },
});
