import { test, expect } from "../../fixtures/base";
import type { Page, BrowserContext } from "@playwright/test";
import {
  findInventory,
  getInventoryMovements,
  getAuditLogs,
  assertAdminOrderState,
  ensureServerCartQuantity,
  type OrderEvidence,
} from "../../helpers/admin-api";
import { SEED, ORDER_NUMBER_RE, uniqueSuffix } from "../../helpers/data";
import { clearLocalCartMirror } from "../../helpers/ui";

/**
 * E9.2 — Migración de `pre-advanced-websites-hypermarket-angular/e2e/checkout.spec.ts`
 * (E3-A) al harness central. Flujo completo del consumidor:
 *   login → catálogo → carrito → checkout (dirección + idempotencia)
 *   → confirmar pedido (pending) → pay (paid) → cancelar (cancelled/refunded)
 *   → historial → detalle. Incluye E3-Integration (verificación admin API).
 */

const EMAIL = "maria@email.com";
const PASSWORD = "123456";

async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('html[data-hydrated="true"]', { state: "attached" });
}

async function loginCustomer(page: Page): Promise<void> {
  await gotoReady(page, "/login");
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/account");
}

async function clearServerCart(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "hypermarket_auth");
  if (!session) return;
  try {
    await fetch("http://localhost:3000/api/cart", {
      method: "DELETE",
      headers: { Cookie: `hypermarket_auth=${session.value}` },
    });
  } catch {
    // el limpiado es best-effort
  }
}

async function addToCart(page: Page): Promise<void> {
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

async function ensureAddress(page: Page, label: string): Promise<void> {
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

async function checkoutAndCreateOrder(
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

function evidence(orderId: string, orderNumber: string): OrderEvidence {
  return { orderId, orderNumber, productId: SEED.productId, quantity: 1, customerEmail: EMAIL };
}

test("E3-A guard: /checkout is protected (anonymous → /login?returnUrl=/checkout)", async ({
  page,
}) => {
  await gotoReady(page, "/checkout");
  await page.waitForURL("**/login**");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("returnUrl")).toBe("/checkout");
});

test("E3-A: customer flow + E3-Integration (order, stock, movements, audit)", async ({
  page,
  context,
  adminApi,
}) => {
  const addressLabel = uniqueSuffix();
  const { ctx, token } = adminApi;

  // Inventory baseline ANTES de crear la orden (delta determinista).
  const baseline = await findInventory(ctx, token, SEED.productId);
  const baselineReserved = baseline.reservedStock;
  const baselineStock = baseline.stock;

  // 1) Login real vía UI
  await loginCustomer(page);
  await clearServerCart(context);

  // 2) Catálogo → añadir producto
  await addToCart(page);

  // 3) Carrito: item visible + checkout habilitado (authenticated && totalItems > 0)
  await gotoReady(page, "/cart");
  await expect(page.getByText(SEED.productName).first()).toBeVisible();
  const payBtn = page.locator(".cart-summary__pay-button");
  await expect(payBtn).toBeEnabled();
  await payBtn.click();
  await page.waitForURL("**/checkout");

  // 4) Dirección única por ejecución
  await ensureAddress(page, addressLabel);

  // 5) Checkout → confirmar pedido (pending)
  const { orderId, orderNumber } = await checkoutAndCreateOrder(page, addressLabel);
  expect(orderNumber).toMatch(ORDER_NUMBER_RE);
  await expect(page.locator(".order-detail__badge").first()).toHaveText("Pendiente");
  await expect(page.locator(".order-detail__badge--payment")).toHaveText("Pago pendiente");

  // E3-Integration: la orden aparece en el dashboard (admin) con pending + items + totales
  const ev = evidence(orderId, orderNumber);
  const created = await assertAdminOrderState(ctx, token, ev, {
    status: "pending",
    paymentStatus: "pending",
  });
  const item = created.items.find((i: any) => i.productId === SEED.productId);
  if (!item) throw new Error("order items missing product");
  if (item.quantity !== 1) throw new Error(`item quantity expected 1, got ${item.quantity}`);
  if (typeof created.subtotal !== "number" || created.subtotal <= 0) {
    throw new Error(`subtotal invalid: ${created.subtotal}`);
  }

  // E3-Integration: stock reservado (+qty), stock disponible intacto
  const afterCreate = await findInventory(ctx, token, SEED.productId);
  expect(afterCreate.reservedStock).toBe(baselineReserved + 1);
  expect(afterCreate.stock).toBe(baselineStock);

  // 6) Pay → paid
  await page.getByRole("button", { name: "Pagar ahora" }).click();
  await expect(page.locator(".order-detail__badge--payment")).toHaveText("Pagado");
  await assertAdminOrderState(ctx, token, ev, { status: "pending", paymentStatus: "paid" });

  // 7) Cancel → cancelled + refunded; stock restaurado
  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await expect(page.locator(".order-detail__badge").first()).toHaveText("Cancelado");
  await expect(page.locator(".order-detail__badge--payment")).toHaveText("Reembolsado");
  await assertAdminOrderState(ctx, token, ev, {
    status: "cancelled",
    paymentStatus: "refunded",
  });
  const afterCancel = await findInventory(ctx, token, SEED.productId);
  expect(afterCancel.reservedStock).toBe(baselineReserved);

  // Movimientos de inventario: reserve + release_reservation vinculados a la orden
  const movements = await getInventoryMovements(ctx, token, afterCancel.id);
  if (!movements.find((m) => m.type === "reserve" && m.orderId === orderId)) {
    throw new Error("reserve movement missing for order");
  }
  if (!movements.find((m) => m.type === "release_reservation" && m.orderId === orderId)) {
    throw new Error("release_reservation movement missing for order");
  }

  // Audit logs: las acciones del cliente quedaron registradas
  const logs = await getAuditLogs(ctx, token, orderId);
  const actions = logs.map((l) => l.action);
  for (const expected of ["CREATE_ORDER", "PAY_ORDER", "CANCEL_ORDER"]) {
    if (!actions.includes(expected)) throw new Error(`audit log missing ${expected}`);
  }

  // 8) Historial: la orden aparece una sola vez (sin duplicados)
  await gotoReady(page, "/orders");
  await expect(page.locator(".orders-page__number", { hasText: orderNumber })).toBeVisible();
  expect(await page.locator(".orders-page__number", { hasText: orderNumber }).count()).toBe(1);

  // 9) Detalle desde el historial: misma orden, mismos estados
  await page.getByRole("link", { name: orderNumber }).click();
  await page.waitForURL(`**/orders/${orderId}`);
  await expect(page.locator(".order-detail__heading")).toHaveText(orderNumber);
  await expect(page.locator(".order-detail__badge").first()).toHaveText("Cancelado");
  await expect(page.locator(".order-detail__badge--payment")).toHaveText("Reembolsado");
});

test("E3-A: idempotency — retry reuses the SAME idempotencyKey → single order", async ({
  page,
  context,
}) => {
  const addressLabel = uniqueSuffix("E2E-idem");
  await loginCustomer(page);
  await clearServerCart(context);
  await addToCart(page);
  await ensureAddress(page, addressLabel);

  // Interceptar el POST real del HttpClient: la 1ª llamada falla (500),
  // la 2ª es una llamada REAL con la MISMA idempotencyKey del componente.
  const postKeys: string[] = [];
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      postKeys.push(data?.idempotencyKey ?? "(none)");
      if (postKeys.length === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ success: false, message: "simulated failure", statusCode: 500 }),
        });
        return;
      }
    }
    await route.continue();
  });

  await gotoReady(page, "/checkout");
  const ourCard = page.locator(".address-list__item", { hasText: addressLabel });
  if ((await ourCard.count()) > 0) {
    await ourCard.click();
  }
  const confirmBtn = page.getByRole("button", { name: "Confirmar pedido" });
  await expect(confirmBtn).toBeEnabled();

  // E9.2: normalizar el carrito server a qty=1 antes de la idempotencia
  // (misma garantía determinista que en el flujo customer).
  await ensureServerCartQuantity(page.context(), SEED.productId, 1);

  // 1er intento → 500 simulado → error en pantalla, seguimos en /checkout
  await confirmBtn.click();
  await expect(page.locator(".checkout-page__error[role=alert]")).toBeVisible();
  await expect(confirmBtn).toBeEnabled();

  // 2º intento → POST real con la misma key → navega al detalle
  await confirmBtn.click();
  await page.waitForURL("**/orders/**");
  const orderId = new URL(page.url()).pathname.split("/").pop() as string;
  const orderNumber = (await page.locator(".order-detail__heading").textContent())?.trim() ?? "";

  // Prueba fuerte de idempotencia: dos POSTs con la MISMA idempotencyKey
  expect(postKeys.length).toBeGreaterThanOrEqual(2);
  expect(postKeys[0]).not.toBe("(none)");
  expect(postKeys[0]).toBe(postKeys[1]);

  // Historial: exactamente UNA orden con ese orderNumber
  await gotoReady(page, "/orders");
  await expect(page.locator(".orders-page__number", { hasText: orderNumber })).toBeVisible();
  expect(await page.locator(".orders-page__number", { hasText: orderNumber }).count()).toBe(1);
});