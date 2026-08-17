import { test, expect } from "@playwright/test";

test("@smoke home del storefront Next carga y renderiza la navegación", async ({ page }) => {
  await page.goto("/es");
  await expect(page.getByRole("link", { name: "Inicio" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Categorías" })).toBeVisible();
});