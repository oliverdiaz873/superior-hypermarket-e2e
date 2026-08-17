import { test, expect } from "../../fixtures/base";
import { getContacts } from "../../helpers/admin-api";

/**
 * E9.2 — Migración de `pre-advanced-websites-hypermarket-angular/e2e/contact.spec.ts`
 * (E4.5) al harness central. Verificación de integración vertical real:
 *   UI contact → POST /api/contact → Mongo → GET /api/admin/contact → inbox
 *   → transición admin pending → read → limpieza (DELETE 204).
 */

test("E4.5: contact form → POST /api/contact → Mongo → /api/admin/contact → inbox", async ({
  page,
  adminApi,
  uniqueEmail,
}) => {
  const name = "Cliente Integracion";
  const email = uniqueEmail;
  const phone = "8095551212";
  const message = "Mensaje E2E de verificación de integración de contacto.";
  const { ctx, token } = adminApi;

  // 1) Envío real por la UI
  await page.goto("/contact");
  await page.waitForSelector('html[data-hydrated="true"]', { state: "attached" });
  await page.fill("#nombre", name);
  await page.fill("#email", email);
  await page.fill("#telefono", phone);
  await page.fill("#mensaje", message);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator(".toast-message")).toContainText("¡Mensaje enviado con éxito!");

  // 2) Persistencia en MongoDB + 3) aparición en el inbox (GET /api/admin/contact)
  const found = await test.step("inbox contiene el mensaje", async () => {
    const contacts = await getContacts(ctx, token);
    return contacts.find((c) => c.email === email);
  });
  if (!found) throw new Error("contact message not found via /api/admin/contact");
  expect(found.name).toBe(name);
  expect(found.phone).toBe(phone);
  expect(found.message).toBe(message);
  expect(found.status).toBe("pending");

  // 4) Transición admin pending → read
  const patched = await ctx.patch(
    `http://localhost:3000/api/admin/contact/${found.id}`,
    { headers: { Authorization: `Bearer ${token}` }, data: { status: "read" } },
  );
  expect(patched.ok()).toBeTruthy();
  expect((await patched.json()).data.status).toBe("read");

  // Limpieza: borrado admin para que el test sea repetible
  const deleted = await ctx.delete(
    `http://localhost:3000/api/admin/contact/${found.id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(deleted.status()).toBe(204);
});