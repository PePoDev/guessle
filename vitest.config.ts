import {
  configDefaults,
  coverageConfigDefaults,
  defineConfig,
} from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";

// Instrumented runs are several times slower, and the page suite's longest
// flows outlast the default 5s timeout under them.
const coverageRun = process.argv.some((arg) => arg.startsWith("--coverage"));

export default defineConfig({
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [
    svelte({
      hot: !process.env.VITEST,
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    ...(coverageRun ? { testTimeout: 30000 } : {}),
    include: ["src/**/*.{test,spec}.{js,ts}"],
    exclude: [
      ...configDefaults.exclude,
      "src/lib/firebase/firestore.rules.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,svelte}"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/tests/**",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, "./src/lib"),
      "$app/navigation": resolve(__dirname, "./src/tests/appNavigation.ts"),
    },
    conditions: ["browser"],
  },
});
