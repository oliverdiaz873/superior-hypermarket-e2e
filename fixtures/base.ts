import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { adminLogin } from "../helpers/admin-api";

/**
 * E9.2 — Fixtures base.
 *
 * - `uniqueEmail` (test-scoped): email único por test (register/contacto).
 * - `adminApi` (worker-scoped): UN solo login de admin por worker (workers:1 →
 *   una única llamada a /auth/login por corrida). Evita superar el rate-limit
 *   de login del backend (10/15min por IP), que NO se desactiva en NODE_ENV=test.
 */

export interface AdminApi {
  ctx: APIRequestContext;
  token: string;
}

export const test = base.extend<{ uniqueEmail: string }, { adminApi: AdminApi }>({
  uniqueEmail: async ({}, use) => {
    await use(`e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`);
  },
  adminApi: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext();
      const token = await adminLogin(ctx);
      await use({ ctx, token });
      await ctx.dispose();
    },
    { scope: "worker" },
  ],
});

export { expect };