import fs from "fs";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import { API, CREDENTIALS, AUTH_STATES } from "../config/env";

export { API };

/** Lee el JWT del storageState del cliente (cookie httpOnly `hypermarket_auth`). */
export function readCustomerJwt(): string {
  const raw = fs.readFileSync(AUTH_STATES.customerAngular, "utf-8");
  const state = JSON.parse(raw) as { cookies?: Array<{ name: string; value: string }> };
  const cookie = state.cookies?.find((c) => c.name === "hypermarket_auth");
  if (!cookie) {
    throw new Error("customer JWT not found in customer.angular.json storageState");
  }
  return cookie.value;
}

/**
 * Devuelve el total de ítems del carrito SERVER del cliente (fuente de verdad
 * del pedido). Se usa para verificar que confirmar un pedido vacía el carrito.
 */
export async function getServerCartTotal(context: BrowserContext): Promise<number> {
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "hypermarket_auth");
  if (!session) throw new Error("customer cookie (hypermarket_auth) not found");
  const res = await fetch(`${API}/cart`, { headers: { Cookie: `hypermarket_auth=${session.value}` } });
  if (!res.ok) throw new Error(`GET /api/cart failed: ${res.status}`);
  const body = (await res.json()) as { data?: { totalItems?: number } };
  return body?.data?.totalItems ?? 0;
}

/**
 * E9.2 — Helpers API centralizados (consolidación de los antiguos
 * `e2e/helpers/admin-api.ts` de Angular y Next).
 *
 * Verifican contra los endpoints admin que renderiza el dashboard el estado
 * real del negocio: orden, reserva/liberación de stock, movimientos, audit
 * logs y contactos. La UI actúa; la API confirma el estado final.
 */

export interface OrderEvidence {
  orderId: string;
  orderNumber: string;
  productId: string;
  quantity: number;
  customerEmail: string;
}

export interface InventoryRecord {
  id: string;
  productId: string;
  stock: number;
  reservedStock: number;
  minStock: number;
}

export interface InventoryMovement {
  type: string;
  quantity: number;
  orderId?: string;
  reason: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  status: string;
}

async function login(
  request: APIRequestContext,
  email: string,
  password: string,
  label: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`${label} login failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const token = body?.data?.token as string | undefined;
  if (!token) {
    throw new Error(`${label} login response missing token: ${await res.text()}`);
  }
  return token;
}

export async function adminLogin(request: APIRequestContext): Promise<string> {
  return login(request, CREDENTIALS.admin.email, CREDENTIALS.admin.password, "admin");
}

export async function customerLogin(request: APIRequestContext): Promise<string> {
  return login(request, CREDENTIALS.customer.email, CREDENTIALS.customer.password, "customer");
}

export async function getAdminOrder(
  request: APIRequestContext,
  token: string,
  orderId: string,
): Promise<any> {
  const res = await request.get(`${API}/admin/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`admin order get ${orderId} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data;
}

export async function getInventoryList(
  request: APIRequestContext,
  token: string,
): Promise<InventoryRecord[]> {
  const res = await request.get(`${API}/inventory?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`inventory list failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data as InventoryRecord[];
}

export async function findInventory(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<InventoryRecord> {
  const records = await getInventoryList(request, token);
  const record = records.find((i) => i.productId === productId);
  if (!record) {
    throw new Error(`inventory record not found for ${productId}`);
  }
  return record;
}

export async function findInventoryByProductId(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<InventoryRecord> {
  const res = await request.get(`${API}/inventory/product/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`inventory product ${productId} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data as InventoryRecord;
}

export async function adjustInventory(
  request: APIRequestContext,
  token: string,
  inventoryId: string,
  operation: "increase" | "decrease" | "set",
  quantity: number,
  reason: string,
): Promise<any> {
  const res = await request.post(`${API}/inventory/${inventoryId}/adjust`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { operation, quantity, reason },
  });
  if (!res.ok()) {
    throw new Error(`inventory adjust failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data;
}

export async function getInventoryMovements(
  request: APIRequestContext,
  token: string,
  inventoryId: string,
): Promise<InventoryMovement[]> {
  const res = await request.get(`${API}/inventory/${inventoryId}/movements?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`inventory movements failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data as InventoryMovement[];
}

export async function getAuditLogs(
  request: APIRequestContext,
  token: string,
  entityId: string,
): Promise<Array<{ action: string }>> {
  const res = await request.get(
    `${API}/admin/audit-logs?entityId=${encodeURIComponent(entityId)}&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok()) {
    throw new Error(`audit logs failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).data as Array<{ action: string }>;
}

export async function changeOrderStatus(
  request: APIRequestContext,
  token: string,
  orderId: string,
  status: string,
  note?: string,
): Promise<any> {
  const res = await request.patch(`${API}/admin/orders/${orderId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: note === undefined ? { status } : { status, note },
  });
  if (!res.ok()) {
    throw new Error(
      `admin order status change to ${status} failed: ${res.status()} ${await res.text()}`,
    );
  }
  return (await res.json()).data;
}

export async function assertAdminOrderState(
  request: APIRequestContext,
  token: string,
  ev: OrderEvidence,
  expected: { status: string; paymentStatus: string },
): Promise<any> {
  const order = await getAdminOrder(request, token, ev.orderId);
  if (order.status !== expected.status) {
    throw new Error(`admin order status expected ${expected.status}, got ${order.status}`);
  }
  if (order.paymentStatus !== expected.paymentStatus) {
    throw new Error(
      `admin order paymentStatus expected ${expected.paymentStatus}, got ${order.paymentStatus}`,
    );
  }
  if (order.orderNumber !== ev.orderNumber) {
    throw new Error(`admin order orderNumber mismatch: ${order.orderNumber} vs ${ev.orderNumber}`);
  }
  if (order.customer?.email !== ev.customerEmail) {
    throw new Error(
      `admin order customer expected ${ev.customerEmail}, got ${order.customer?.email}`,
    );
  }
  return order;
}

export async function getContacts(
  request: APIRequestContext,
  token: string,
): Promise<ContactMessage[]> {
  const res = await request.get(`${API}/admin/contact`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`admin contact list failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: ContactMessage[] };
  return body.data ?? [];
}

/**
 * E9.2 — Garantiza que el carrito SERVER del cliente tenga exactamente `quantity`
 * del producto indicado (fuente de verdad del pedido).
 *
 * Race N2 de los storefronts (Next y Angular): si un add cae antes del SYNC_OK,
 * el mirror local (localStorage['carrito']) se mergea con SUMA de cantidades en
 * el siguiente full load → 1+1=2. El `clearLocalCartMirror` reduce la frecuencia,
 * pero no es una garantía (el efecto de persistencia de React puede escribir
 * después del último clear). Esta verificación/corrección vía API es determinista:
 * la orden se crea a partir del carrito server, por lo que normalizarlo a la
 * cantidad exacta justo antes de confirmar asegura el resultado.
 */
export async function ensureServerCartQuantity(
  context: BrowserContext,
  productId: string,
  quantity: number,
): Promise<void> {
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "hypermarket_auth");
  if (!session) throw new Error("customer cookie (hypermarket_auth) not found");
  const headers = { Cookie: `hypermarket_auth=${session.value}` };

  const res = await fetch(`${API}/cart`, { headers });
  if (!res.ok) throw new Error(`GET /api/cart failed: ${res.status}`);
  const body = (await res.json()) as {
    data?: { items?: Array<{ productId?: string; quantity?: number }> };
  };
  const item = body?.data?.items?.find((i) => i.productId === productId);

  if (!item) {
    const added = await fetch(`${API}/cart/items`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity }),
    });
    if (!added.ok) throw new Error(`POST /api/cart/items failed: ${added.status}`);
    return;
  }

  if (item.quantity === quantity) return;

  const patched = await fetch(`${API}/cart/items/${productId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
  });
  if (!patched.ok) {
    throw new Error(`PATCH /api/cart/items/${productId} failed: ${patched.status}`);
  }
}