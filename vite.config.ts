import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { home: "index.html", test2: "test2/index.html", test3: "test3/index.html", test4: "test4/index.html" } } },
});
