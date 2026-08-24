import { test, expect } from "../../fixtures/base";
import {
  API,
  changeOrderStatus,
  getAuditLogs,
  adjustInventory,
  getInventoryMovements,
  customerLogin,
  findInventoryByProductId,
} from "../../helpers/admin-api";
import { SEED, uniqueSuffix } from "../../helpers/data";

/**
 * E9.2 — Migración de `pre-advanced-websites-hypermarket-angular/e2e/admin.spec.ts`
 * (E3-Admin) al harness central. Acciones administrativas verificadas contra
 * los endpoints admin que renderiza el dashboard:
 *   - Ajuste de inventario (increase → decrease, restaurando el estado).
 *   - Transición de estado de orden con nota (pending → confirmed → cancelled)
 *     con verificación del historial y de los audit logs.
 */

test("E3-Admin: inventory adjust (increase/decrease) + movements", async ({ adminApi }) => {
  const { ctx, token } = adminApi;

  const rec = await findInventoryByProductId(ctx, token, SEED.inventoryProductId);
  const before = rec.stock;

  // Aumentar +5
  const up = await adjustInventory(ctx, token, rec.id, "increase", 5, "inventory_count");
  expect(up.stock).toBe(before + 5);

  // Disminuir -5 (restaurar estado)
  const down = await adjustInventory(ctx, token, rec.id, "decrease", 5, "manual_correction");
  expect(down.stock).toBe(before);

  // Movimientos registrados (los más recientes primero)
  const moves = await getInventoryMovements(ctx, token, rec.id);
  const increase = moves.find((m) => m.type === "increase" && m.quantity === 5);
  const decrease = moves.find((m) => m.type === "decrease" && m.quantity === 5);
  if (!increase) throw new Error("increase movement missing");
  if (!decrease) throw new Error("decrease movement missing");
});

test("E3-Admin: order status transition + note persisted + audit", async ({
  adminApi,
  playwright,
}) => {
  const { ctx, token } = adminApi;

  // Crear una orden customer fresca (vía API) para el test de admin, sin depender
  // de datos acumulados.
  const custCtx = await playwright.request.newContext();
  try {
    await customerLogin(custCtx);
    await custCtx.delete(`${API}/cart`).catch(() => undefined);
    await custCtx.post(`${API}/cart/items`, {
      data: { productId: SEED.productId, quantity: 1 },
    });
    const addr = await custCtx.post(`${API}/addresses`, {
      data: {
        label: `E2E-Admin-${Date.now()}`,
        street: "Calle Admin 1",
        city: "Santo Domingo",
        state: "Distrito Nacional",
        zipCode: "10101",
        country: "DO",
      },
    });
    expect(addr.ok()).toBeTruthy();
    const addressId = (await addr.json()).data.id;
    const orderRes = await custCtx.post(`${API}/orders`, {
      data: { addressId, idempotencyKey: `e2e-admin-${uniqueSuffix()}` },
    });
    expect(orderRes.status()).toBe(201);
    const orderId = (await orderRes.json()).data.id;

    // Transición admin: pending → confirmed con nota
    const note = "E2E Admin confirm note";
    const confirmed = await changeOrderStatus(ctx, token, orderId, "confirmed", note);
    expect(confirmed.status).toBe("confirmed");
    const last = confirmed.statusHistory[confirmed.statusHistory.length - 1];
    if (!last) throw new Error("statusHistory empty");
    expect(last.status).toBe("confirmed");
    expect(last.note).toBe(note);

    // Transición admin: confirmed → cancelled
    const cancelled = await changeOrderStatus(ctx, token, orderId, "cancelled", "E2E Admin cancel");
    expect(cancelled.status).toBe("cancelled");

    // Audit logs: ambas transiciones registradas. El backend escribe los logs
    // de forma asíncrona (fire-and-forget), así que se espera la aparición de
    // CANCEL_ORDER en lugar de consultar una única vez (evita un race).
    const auditActions = async (): Promise<string[]> =>
      (await getAuditLogs(ctx, token, orderId)).map((l) => l.action);
    await expect
      .poll(auditActions, { timeout: 10_000 })
      .toEqual(expect.arrayContaining(["UPDATE_ORDER_STATUS", "CANCEL_ORDER"]));

    await custCtx.delete(`${API}/addresses/${addressId}`).catch(() => undefined);
  } finally {
    await custCtx.dispose();
  }
});