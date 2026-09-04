import { test as setup, expect } from "@playwright/test";
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
  // Next dev en frío sirve la ruta /es/login con HTTP 200 aunque la compile
  // on-demand; durante ese tiempo puede mostrar una página 404 interna.
  // Estrategia: intentar goto y esperar el input del email con un timeout corto;
  // si no aparece, volver a navegar. Presupuesto: 12 intentos × ~15 s ≈ 3 min.
  const loginUrl = `${BASE_URLS.next}/es/login`;
  let ready = false;
  for (let attempt = 1; attempt <= 12; attempt++) {
    await page.goto(loginUrl);
    try {
      await page.getByLabel("Correo electrónico").waitFor({ state: "visible", timeout: 15_000 });
      ready = true;
      break;
    } catch {
      // Página aún compilando o mostrando 404 — reintentar.
      if (attempt < 12) await page.waitForTimeout(10_000);
    }
  }
  if (!ready) {
    throw new Error(
      `[setup] Next storefront login no fue accesible en ${loginUrl} después de 12 intentos.`,
    );
  }
  const email = page.getByLabel("Correo electrónico");
  await email.fill(CREDENTIALS.customer.email);
  await page.getByLabel("Contraseña").fill(CREDENTIALS.customer.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/es/account");
  await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: AUTH_STATES.customerNext });
});
