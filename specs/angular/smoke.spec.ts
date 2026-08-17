import { test, expect } from "@playwright/test";

test("@smoke home del storefront Angular carga y renderiza la navegación", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('html[data-hydrated="true"]', { state: "attached" });
  await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Categorías" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ofertas" })).toBeVisible();
});