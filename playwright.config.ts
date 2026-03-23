import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "bash scripts/start-e2e-emulators.sh",
      url: "http://127.0.0.1:4000",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1 NEXT_PUBLIC_E2E_MOCK_GOOGLE_LOGIN=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=gymbrosar-e2e NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=9099 NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT=8080 GOOGLE_GENAI_API_KEY= GEMINI_API_KEY= NEXT_TELEMETRY_DISABLED=1 npm run dev -- --port 3100",
      url: `${baseURL}/login`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
