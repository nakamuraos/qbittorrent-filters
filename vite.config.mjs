import { defineConfig } from "vite";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/index.ts", // Replace with your entry file
      formats: ["cjs"],
    },
    commonjsOptions: {
      include: [],
    },
    rollupOptions: {
      plugins: [
        nodeResolve({ preferBuiltins: true }), // Resolves node modules
        commonjs(), // Converts CommonJS modules to ES6 for bundling
      ],
      external: ["fs", "path"], // Native modules to exclude
    },
    outDir: "dist", // Output directory
    minify: true, // Optional: minimize the output file
  },
  optimizeDeps: {
    include: [], // Explicitly include dependencies if needed
  },
});
