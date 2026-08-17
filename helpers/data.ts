/**
 * E9.2 — Datos de prueba estables (seed del backend) y generadores únicos.
 */

export const ORDER_NUMBER_RE = /^HM-\d{8}-[A-F0-9]{6}$/;

export const SEED = {
  productId: "tablet_tcl",
  productName: "Tablet TCL",
  inventoryProductId: "tablet_rted",
} as const;

export function uniqueEmail(): string {
  return `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function uniqueSuffix(prefix = "E2E"): string {
  return `${prefix}-${Date.now()}`;
}