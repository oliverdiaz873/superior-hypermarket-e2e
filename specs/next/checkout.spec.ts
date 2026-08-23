import { test, expect } from "../../fixtures/base";
import type { Page } from "@playwright/test";
import {
  findInventory,
  getInventoryMovements,
  getAuditLogs,
  assertAdminOrderState,
  ensureServerCartQuantity,
  getServerCartTotal,
  type OrderEvidence,
} from "../../helpers/admin-api";
import { SEED, ORDER_NUMBER_RE, uniqueSuffix } from "../../helpers/data";
import { clearLocalCartMirror } from "../../helpers/ui";

/**
 * E9.2 — Migración de `pre-advanced-websites-hypermarket-next/e2e/checkout.spec.ts`
 * (E3-N) al harness central. Flujo completo del consumidor Next.js:
 *   login → limpiar carrito → agregar producto (server cart)
 *   → checkout (dirección única) → confirmar pedido (pending)
 *   → pay (paid) → cancelar (cancelled + refunded)
 *   → historial (una sola orden) → detalle. Incluye E3-Integration.
 *
 * Sin waitForTimeout: la espera tras cargar /cart se hace sobre el estado
 * observable (heading "Tu Carrito") en lugar de un sleep.
 */

const EMAIL = "maria@email.com";
const PASSWORD = "123456";

async function clearCart(page: Page): Promise<void> {
  const cartLoaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/cart") && r.request().method() === "GET",
    { timeout: 15_000 },
  );
  await page.goto("/es/cart");
  await cartLoaded;
  await expect(page.getByRole("heading", { name: /Tu Carrito/ })).toBeVisible({ timeout: 15_000 });
  const remove = page.getByLabel(/Eliminar/);
  for (let i = 0; i < 20; i++) {
    const n = await remove.count();
    if (n === 0) break;
    await remove.first().click();
    await expect.poll(() => remove.count(), { timeout: 10_000 }).toBe(n - 1);
  }
}

async function loginCustomer(page: Page): Promise<void> {
  await page.goto("/es/login");
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  // Esperar a que el botón esté HABILITADO: LoginForm lo deshabilita hasta
  // completar la hidratación de React. Un click pre-hidratación haría un
  // submit nativo y el login se perdería en silencio.
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  // Verificar sesión realmente iniciada: el header autenticado expone
  // "Cerrar sesión" en el banner. Scoping a banner evita strict violation
  // con el segundo botón "Cerrar sesión" del contenido principal (main).
  await expect(page.getByRole("banner").getByRole("button", { name: "Cerrar sesión" })).toBeVisible({
    timeout: 15_000,
  });
}

async function ensureAddress(page: Page, label: string): Promise<void> {
  await page.goto("/es/addresses");
  if ((await page.getByText(label).count()) > 0) return;
  const addAddressBtn = page.getByRole("button", { name: "Agregar dirección" });
  if (!(await addAddressBtn.isVisible().catch(() => false))) return;
  await addAddressBtn.click();
  await page.getByLabel("Etiqueta").fill(label);
  await page.getByLabel("Calle").fill("Calle Principal 123");
  await page.getByLabel("Ciudad").fill("Santo Domingo");
  await page.getByLabel("Provincia / Estado").fill("Distrito Nacional");
  await page.getByLabel("Código postal").fill("10101");
  await page.getByLabel("País").fill("República Dominicana");
  await page.getByRole("button", { name: "Guardar dirección" }).click();
  await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 });
}

test("@p0 checkout → pay → cancel → historial → detalle (E3-N) + E3-Integration", async ({
  page,
  adminApi,
}) => {
  const addressLabel = uniqueSuffix();
  const { ctx, token } = adminApi;

  // Sesión admin para la verificación E3-Integration
  const baseline = await findInventory(ctx, token, SEED.productId);

  // 1) Login real vía UI
  await loginCustomer(page);

  // Limpiar carrito vía UI para arrancar determinista (qty exacto = 1)
  await clearCart(page);

  // 2) Catálogo → agregar producto real del backend al carrito.
  //    Esperar a que el carrito esté sincronizado con el server antes de
  //    agregar: si se hace clic antes del SYNC_OK, el item optimista se
  //    persiste en localStorage y luego se MERGEa (1+1=2) al entrar en /cart.
  const cartSynced = page.waitForResponse(
    (r) => r.url().endsWith("/api/cart") && r.request().method() === "GET",
    { timeout: 15_000 },
  );
  await page.goto("/es/product/tablet_tcl");
  await cartSynced;
  await page.getByRole("button", { name: /Agregar.*Tablet TCL/ }).click();

  // E9.2: evitar el doble-add por merge del mirror local (race N2 de la app).
  // Si el add cae antes del SYNC_OK, el mirror localStorage['carrito'] se
  // persiste y el merge del backend SUMA cantidades ($inc); en el siguiente
  // page.goto (full load) el mirror se mergea → 1+1=2. Confirmar el add en la
  // UI (badge) y limpiar el mirror para que los full loads posteriores hagan
  // sync (no merge) y el carrito server quede exactamente qty=1.
  await expect(page.locator(".cart-badge").first()).toHaveText("1", { timeout: 15_000 });
  await clearLocalCartMirror(page);

  // 3) Carrito → checkout
  await page.goto("/es/cart");
  await expect(page.getByText(SEED.productName).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Pagar Ahora" })).toBeVisible();
  await page.getByRole("link", { name: "Pagar Ahora" }).click();
  await page.waitForURL("**/es/checkout");

  // 4) Dirección única por ejecución
  await ensureAddress(page, addressLabel);

  // 5) Checkout: seleccionar dirección y confirmar pedido (pending)
  await page.goto("/es/checkout");
  await expect(page.getByText("Confirmar pedido")).toBeVisible();
  const confirmBtn = page.getByRole("button", { name: "Confirmar pedido" });
  await expect(confirmBtn).toBeEnabled();
  // E9.2: la orden se crea desde el carrito SERVER. Si el merge N2 dejó un
  // qty=2 residual en el server tras los full loads, corregirlo aquí a qty=1
  // (determinista, no depende del race del mirror).
  await ensureServerCartQuantity(page.context(), SEED.productId, 1);
  await confirmBtn.click();

  await page.waitForURL("**/es/orders/**");
  const orderId = new URL(page.url()).pathname.split("/").pop() as string;
  const orderNumber =
    (await page.getByText(/^HM-\d{8}-[A-F0-9]{6}$/).first().textContent())?.trim() ?? "";

  expect(orderNumber).toMatch(ORDER_NUMBER_RE);
  await expect(page.getByText("Pendiente").first()).toBeVisible();
  await expect(page.getByText("Pago pendiente").first()).toBeVisible();

  // E9.3 P0.2: confirmar el pedido vacía el carrito server (totalItems = 0)
  expect(await getServerCartTotal(page.context())).toBe(0);

  // E3-Integration: orden en admin con pending + items + totales
  const ev: OrderEvidence = {
    orderId,
    orderNumber,
    productId: SEED.productId,
    quantity: 1,
    customerEmail: EMAIL,
  };
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

  // E3-Integration: stock reservado (+1), stock disponible intacto
  const afterCreate = await findInventory(ctx, token, SEED.productId);
  expect(afterCreate.reservedStock).toBe(baseline.reservedStock + 1);
  expect(afterCreate.stock).toBe(baseline.stock);

  // 6) Pay → paid
  const payBtn = page.getByRole("button", { name: "Pagar ahora" });
  await expect(payBtn).toBeVisible();
  await payBtn.click();
  await expect(page.getByText("Pagado")).toBeVisible({ timeout: 15_000 });
  await assertAdminOrderState(ctx, token, ev, { status: "pending", paymentStatus: "paid" });

  // 7) Cancel → cancelled + refunded; stock liberado
  const cancelBtn = page.getByRole("button", { name: "Cancelar pedido" });
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();
  await expect(page.getByText("Cancelado").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Reembolsado").first()).toBeVisible({ timeout: 15_000 });
  await assertAdminOrderState(ctx, token, ev, {
    status: "cancelled",
    paymentStatus: "refunded",
  });
  const afterCancel = await findInventory(ctx, token, SEED.productId);
  expect(afterCancel.reservedStock).toBe(baseline.reservedStock);

  // E3-Integration: movimientos reserve + release_reservation vinculados a la orden
  const movements = await getInventoryMovements(ctx, token, afterCancel.id);
  if (!movements.find((m) => m.type === "reserve" && m.orderId === orderId)) {
    throw new Error("reserve movement missing for order");
  }
  if (!movements.find((m) => m.type === "release_reservation" && m.orderId === orderId)) {
    throw new Error("release_reservation movement missing for order");
  }

  // E3-Integration: audit logs registrados
  const logs = await getAuditLogs(ctx, token, orderId);
  const actions = logs.map((l) => l.action);
  for (const expected of ["CREATE_ORDER", "PAY_ORDER", "CANCEL_ORDER"]) {
    if (!actions.includes(expected)) throw new Error(`audit log missing ${expected}`);
  }

  // 8) Historial refleja la orden cancelada, UNA sola vez (sin duplicados)
  await page.goto("/es/orders");
  await expect(page.getByText(orderNumber).first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator("a", { hasText: orderNumber }).count()).toBe(1);

  // 9) Abrir el detalle desde el historial: misma orden, mismos estados
  await page.getByRole("link", { name: orderNumber }).click();
  await page.waitForURL(`**/es/orders/${orderId}`);
  await expect(page.getByText(orderNumber).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Cancelado").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Reembolsado").first()).toBeVisible({ timeout: 15_000 });
});