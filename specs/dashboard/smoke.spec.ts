import { test, expect } from "@playwright/test";

test("@smoke página de login del Dashboard carga", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Correo electrónico", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
});