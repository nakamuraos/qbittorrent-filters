import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/index.ts",
      formats: ["cjs"],
    },
    rollupOptions: {
      external: ["fs", "path"], // Native modules to exclude
    },
    outDir: "dist",
    minify: true,
  },
});
