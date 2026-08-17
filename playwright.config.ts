import { defineConfig, devices } from "@playwright/test";
import { REPOS, PORTS, BACKEND_E2E_ENV } from "./config/env";

/**
 * E9.2 — Config única del harness central E2E.
 *
 * Proyectos: setup (genera storageStates) + angular-storefront / next-storefront /
 * dashboard. Un único `webServer` array levanta backend (E2E aislado) + los 3
 * frontends. workers: 1 para estabilidad sobre la BD E2E compartida.
 *
 * Aislamiento: el backend se arranca SIEMPRE por Playwright con env E2E
 * (NODE_ENV=test, MONGODB_URI=hypermarket_e2e, STORAGE_LOCAL_DIR=.tmp/e2e-storage).
 * Si hay otro proceso escuchando en :3000, el arranque falla a propósito
 * (señal clara de que un backend de dev sigue vivo).
 */
export default defineConfig({
  testDir: "./",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 120_000,
  globalSetup: "./global-setup",
  globalTeardown: "./global-teardown",
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\/setup\/.*\.ts$/,
    },
    {
      name: "angular-storefront",
      testMatch: /specs\/angular\/.*\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORTS.angular}` },
    },
    {
      name: "next-storefront",
      testMatch: /specs\/next\/.*\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORTS.next}` },
    },
    {
      name: "dashboard",
      testMatch: /specs\/dashboard\/.*\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORTS.dashboard}` },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: REPOS.backend,
      env: BACKEND_E2E_ENV,
      url: `http://localhost:${PORTS.backend}/health`,
      timeout: 60_000,
    },
    {
      command: "npm start",
      cwd: REPOS.angular,
      url: `http://localhost:${PORTS.angular}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'cmd /c "rmdir /s /q .next 2>nul & npm run dev"',
      cwd: REPOS.next,
      url: `http://localhost:${PORTS.next}`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        PORT: String(PORTS.next),
        NEXT_PUBLIC_API_URL: `http://localhost:${PORTS.backend}/api`,
        API_URL: `http://localhost:${PORTS.backend}/api`,
        NEXT_PUBLIC_STORAGE_PUBLIC_URL: `http://localhost:${PORTS.backend}`,
      },
    },
    {
      command: "npx ng serve --port 4201",
      cwd: REPOS.dashboard,
      url: `http://localhost:${PORTS.dashboard}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});