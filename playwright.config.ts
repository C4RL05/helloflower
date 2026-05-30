import { defineConfig } from "@playwright/test";

/**
 * E2E/visual verification config. Uses SwiftShader so WebGL works headlessly.
 * The webServer builds the app and serves it; an already-running preview on
 * 4173 is reused.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:4173",
    // Portrait viewport so flowers frame consistently for the color-sample checks.
    viewport: { width: 480, height: 630 },
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
