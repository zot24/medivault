import path from "path";
import { defineConfig, devices } from "@playwright/test";

const appBase = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "harness",
      testMatch: "dicom-canvas.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4177",
      },
    },
    {
      name: "app",
      testMatch: "viewer-app.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: appBase ?? "http://127.0.0.1:3002",
      },
    },
  ],
  webServer: {
    // pnpm exec runs from the workspace root (e2e has no package.json), so a
    // relative --config would resolve to the app's vite.config.ts.
    command: `pnpm exec vite --config ${path.resolve(import.meta.dirname, "vite.config.ts")} --host 127.0.0.1 --port 4177 --strictPort`,
    cwd: path.resolve(import.meta.dirname),
    url: "http://127.0.0.1:4177",
    reuseExistingServer: !process.env.CI,
  },
});
