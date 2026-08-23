import { test as setup, expect, type Response } from "@playwright/test";
import { BASE_URLS, CREDENTIALS, AUTH_STATES } from "../../config/env";

/**
 * E9.2 — Generación de storageStates (proyecto `setup`).
 *
 * Los proyectos de aplicación dependen de este proyecto, por lo que los
 * estados de sesión se generan ANTES de ejecutar los specs:
 *   - admin.dashboard.json   → JWT en localStorage['hs.auth-token'] (dashboard)
 *   - customer.angular.json  → cookie httpOnly hypermarket_auth (storefront Angular)
 *   - customer.next.json     → cookie httpOnly hypermarket_auth (storefront Next)
 *
 * Etiquetados @smoke para que `npm run e2e:smoke` también regeneren/verifiquen
 * la autenticación de la infraestructura.
 */

setup("@smoke @p0 setup storageState — admin (dashboard)", async ({ page }) => {
  await page.goto(`${BASE_URLS.dashboard}/login`);
  await page.getByLabel("Correo electrónico", { exact: true }).fill(CREDENTIALS.admin.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(CREDENTIALS.admin.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForFunction(() => localStorage.getItem("hs.auth-token") !== null);
  await page.context().storageState({ path: AUTH_STATES.adminDashboard });
});

setup("@smoke @p0 setup storageState — customer (angular storefront)", async ({ page }) => {
  await page.goto(`${BASE_URLS.angular}/login`);
  // SSR: esperar hidratación antes de interactuar; si no, el submit del form
  // dispara una navegación nativa GET (/login?) sin controlador de Angular.
  await page.waitForSelector('html[data-hydrated="true"]', { state: "attached" });
  await page.fill("#login-email", CREDENTIALS.customer.email);
  await page.fill("#login-password", CREDENTIALS.customer.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/account");
  await page.context().storageState({ path: AUTH_STATES.customerAngular });
});

setup("@smoke @p0 setup storageState — customer (next storefront)", async ({ page }) => {
  // Next dev en frío puede responder 404 mientras compila la ruta [locale]/(shop)/login.
  // Reintentar hasta que la página deje de ser 404 y el formulario sea accesible.
  let resp: Response | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    resp = await page.goto(`${BASE_URLS.next}/es/login`);
    if (resp && resp.status() < 400) {
      const is404 = (await page.getByRole("heading", { name: "404" }).count()) > 0;
      if (!is404) break;
    }
    if (attempt < 5) await page.waitForTimeout(5_000);
  }
  // Esperar el input con margen mayor que el actionTimeout por defecto.
  const email = page.getByLabel("Correo electrónico");
  await expect(email).toBeVisible({ timeout: 60_000 });
  await email.fill(CREDENTIALS.customer.email);
  await page.getByLabel("Contraseña").fill(CREDENTIALS.customer.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/es/account");
  await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: AUTH_STATES.customerNext });
});