import { expect, type Page, type BrowserContext } from "@playwright/test";
import { API } from "../config/env";
import { SEED } from "./data";
import { ensureServerCartQuantity } from "./admin-api";
import { clearLocalCartMirror } from "./ui";

/**
 * E9.3 — Helpers del storefront Angular (SSR). Flujos reales del consumidor:
 * login vía UI, carrito server, dirección y confirmación de pedido.
 *
 * Reutilizados por el spec de checkout (P0.1) y por el lifecycle cross-app
 * (P0.3, donde el cliente crea el pedido vía UI del storefront Angular).
 */

export const EMAIL = "maria@email.com";
export const PASSWORD = "123456";

export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('html[data-hydrated="true"]', { state: "attached" });
}

export async function loginCustomer(page: Page): Promise<void> {
  await gotoReady(page, "/login");
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/account");
}

export async function clearServerCart(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "hypermarket_auth");
  if (!session) return;
  try {
    await fetch(`${API}/cart`, {
      method: "DELETE",
      headers: { Cookie: `hypermarket_auth=${session.value}` },
    });
  } catch {
    // el limpiado es best-effort
  }
}

export async function addToCart(page: Page): Promise<void> {
  await gotoReady(page, `/product/${SEED.productId}`);
  await page.getByRole("button", { name: /Agregar.*Tablet TCL/ }).first().click();
  await expect(page.locator(".cart-counter-container").first()).toBeVisible();
  // E9.2: evitar el doble-add por merge del mirror local (race N2, igual que en
  // Next). Si el add cae antes del SYNC_OK, localStorage['carrito'] se persiste
  // y el merge del backend SUMA cantidades; el siguiente full load lo mergea →
  // 1+1=2. Confirmar el add en la UI y limpiar el mirror (de forma robusta)
  // para que los full loads posteriores sincronicen (no mergeen) y el server
  // quede qty=1.
  await clearLocalCartMirror(page);
}

export async function ensureAddress(page: Page, label: string): Promise<void> {
  await gotoReady(page, "/addresses");
  if ((await page.locator(".address-list__item", { hasText: label }).count()) > 0) {
    return;
  }
  await page.getByRole("button", { name: "Agregar dirección" }).first().click();
  await page.fill("#address-label", label);
  await page.fill("#address-street", "Calle E2E 123");
  await page.fill("#address-city", "Santo Domingo");
  await page.fill("#address-state", "Distrito Nacional");
  await page.fill("#address-zip", "10101");
  await page.fill("#address-country", "República Dominicana");
  await page.getByRole("button", { name: "Guardar dirección" }).click();
  await expect(page.locator(".address-list__item", { hasText: label })).toBeVisible();
}

export async function checkoutAndCreateOrder(
  page: Page,
  addressLabel: string,
): Promise<{ orderId: string; orderNumber: string }> {
  await gotoReady(page, "/checkout");
  await expect(page.getByRole("heading", { name: "Finalizar compra" })).toBeVisible();
  const ourCard = page.locator(".address-list__item", { hasText: addressLabel });
  if ((await ourCard.count()) > 0) {
    await ourCard.click();
  }
  const confirmBtn = page.getByRole("button", { name: "Confirmar pedido" });
  await expect(confirmBtn).toBeEnabled();
  // E9.2: la orden se crea desde el carrito SERVER. Si el merge N2 dejó un
  // qty=2 residual en el server tras los full loads, corregirlo a qty=1
  // (determinista, no depende del race del mirror local).
  await ensureServerCartQuantity(page.context(), SEED.productId, 1);
  await confirmBtn.click();
  await page.waitForURL("**/orders/**");
  const orderId = new URL(page.url()).pathname.split("/").pop() as string;
  const orderNumber = (await page.locator(".order-detail__heading").textContent())?.trim() ?? "";
  return { orderId, orderNumber };
}