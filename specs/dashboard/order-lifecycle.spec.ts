import { test, expect } from "../../fixtures/base";
import { BASE_URLS, AUTH_STATES } from "../../config/env";
import { getAdminOrder, getAuditLogs } from "../../helpers/admin-api";
import {
  clearServerCart,
  addToCart,
  ensureAddress,
  checkoutAndCreateOrder,
  gotoReady,
} from "../../helpers/angular-storefront";
import { ORDER_NUMBER_RE, uniqueSuffix } from "../../helpers/data";

/**
 * E9.3 — P0.3: ciclo de vida de una orden a través de DOS aplicaciones reales.
 *
 *   cliente (storefront Angular, UI) crea el pedido (pending)
 *   → admin (dashboard, UI) lo busca y confirma (pending → confirmed) con nota
 *   → cliente (storefront Angular, UI) observa "Confirmado"
 *   → API admin verifica estado + historial + audit log.
 *
 * Sin logins nuevos: ambos contextos usan storageStates generados por `setup`
 * (el rate-limit de login del backend es 10/15min y la suite ya usa 8).
 */

test("@p0 order lifecycle: Angular customer creates → dashboard confirms → customer observes confirmed", async ({
  browser,
  adminApi,
}) => {
  const { ctx, token } = adminApi;
  const addressLabel = uniqueSuffix("E2E-P0.3");
  const note = "E2E P0.3 confirmación";

  const customer = await browser.newContext({
    storageState: AUTH_STATES.customerAngular,
    baseURL: BASE_URLS.angular,
  });
  const dashboard = await browser.newContext({
    storageState: AUTH_STATES.adminDashboard,
    baseURL: BASE_URLS.dashboard,
  });
  try {
    // ---- Cliente (storefront Angular): crear pedido pending vía UI ----
    const customerPage = await customer.newPage();
    await clearServerCart(customer);
    await addToCart(customerPage);
    await ensureAddress(customerPage, addressLabel);
    const { orderId, orderNumber } = await checkoutAndCreateOrder(customerPage, addressLabel);
    expect(orderNumber).toMatch(ORDER_NUMBER_RE);
    await expect(customerPage.locator(".order-detail__badge").first()).toHaveText("Pendiente");
    await expect(customerPage.locator(".order-detail__badge--payment")).toHaveText(
      "Pago pendiente",
    );

    // ---- Admin (dashboard): buscar por orderId y confirmar con nota ----
    const adminPage = await dashboard.newPage();
    await adminPage.goto("/orders");
    const search = adminPage.getByLabel("Buscar por cliente, email o ID de pedido…");
    await expect(search).toBeVisible();
    const searchResp = adminPage.waitForResponse(
      (r) => r.url().includes("/api/admin/orders") && r.url().includes(`q=${orderId}`),
      { timeout: 15_000 },
    );
    await search.fill(orderId);
    const resp = await searchResp;
    const body = (await resp.json()) as { data?: Array<{ id: string }> };
    expect(body.data?.some((o) => o.id === orderId)).toBeTruthy();

    const detailBtn = adminPage.getByRole("button", { name: "Ver detalle" });
    await expect(detailBtn.first()).toBeVisible();
    await detailBtn.first().click();
    await adminPage.waitForURL(`**/orders/${orderId}`);
    await expect(adminPage.getByText(`Pedido ${orderId}`)).toBeVisible();

    await adminPage.getByRole("button", { name: "Cambiar estado" }).click();
    await expect(
      adminPage.getByRole("heading", { name: "Cambiar estado del pedido" }),
    ).toBeVisible();
    await adminPage.getByLabel("Nuevo estado").click({ force: true });
    await adminPage.getByRole("option", { name: "Confirmado" }).click();
    await adminPage.getByLabel("Nota (opcional)").fill(note);
    await adminPage.getByRole("button", { name: "Guardar" }).click();
    await expect(adminPage.getByText(/Estado actualizado/)).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByText("Confirmado").first()).toBeVisible();

    // ---- Cliente (storefront Angular): observar "Confirmado" ----
    await gotoReady(customerPage, `/orders/${orderId}`);
    await expect(customerPage.locator(".order-detail__badge").first()).toHaveText("Confirmado");

    // ---- API admin: verificación determinista ----
    const order = await getAdminOrder(ctx, token, orderId);
    expect(order.status).toBe("confirmed");
    const last = order.statusHistory[order.statusHistory.length - 1];
    if (!last) throw new Error("statusHistory empty");
    expect(last.status).toBe("confirmed");
    expect(last.note).toBe(note);
    await expect
      .poll(async () => (await getAuditLogs(ctx, token, orderId)).map((l) => l.action), {
        timeout: 10_000,
      })
      .toEqual(expect.arrayContaining(["UPDATE_ORDER_STATUS"]));
  } finally {
    await customer.close();
    await dashboard.close();
  }
});