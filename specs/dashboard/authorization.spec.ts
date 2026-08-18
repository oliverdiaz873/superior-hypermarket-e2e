import { test, expect } from "@playwright/test";
import { BASE_URLS, API } from "../../config/env";
import { readCustomerJwt } from "../../helpers/admin-api";

/**
 * E9.3 — P0.5: autorización (RBAC). Un JWT de cliente NO puede acceder a
 * datos administrativos, ni desde la UI del dashboard ni desde la API.
 *
 * (a) UI dashboard: al inyectar un JWT de cliente en localStorage
 *     (`hs.auth-token`), la sesión se restaura (GET /auth/me 200) pero el
 *     roleGuard (roles: ['admin']) la rechaza devolviendo
 *     `createUrlTree(['/dashboard'])` — la misma ruta. Como
 *     `router.navigated` sigue en `false` durante la PRIMERA navegación, la
 *     comprobación de "misma URL" (`urlTransition = !router.navigated || …`)
 *     no se activa y el router entra en un BUCLE de redirección que satura el
 *     main thread del renderer: no se monta el DashboardPageComponent, no se
 *     dispara ninguna llamada a /api/admin/stats ni se renderiza contenido
 *     administrativo. DEFECTO documentado, no corregido (E9.3 P0.5). Como el
 *     renderer queda ocupado, la propiedad se verifica de forma determinista a
 *     nivel de URL y de red (sin tocar el DOM): la URL permanece en
 *     /dashboard y no hay ningún request a /api/admin/stats*.
 *
 * (b) API: con el mismo JWT como Bearer, todos los endpoints admin responden
 *     403 (authMiddleware + authorizeRole("admin")) y el endpoint público
 *     /orders responde 200 (control positivo).
 */

test("@p0 authorization: customer JWT in dashboard UI → denied (no admin data)", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: BASE_URLS.dashboard });
  const page = await context.newPage();

  const statsRequests: string[] = [];
  await page.route("**/api/admin/stats**", (route) => {
    statsRequests.push(route.request().url());
    route.continue();
  });

  await page.addInitScript((token) => {
    localStorage.setItem("hs.auth-token", JSON.stringify(token));
  }, readCustomerJwt());

  // Se registra ANTES del goto para no perder la respuesta (el app arranca y
  // dispara /auth/me al inicializar la sesión).
  const mePromise = page.waitForResponse((r) => r.url().endsWith("/api/auth/me"));

  await page.goto("/dashboard", { waitUntil: "commit" });

  // "Angular estable": la propia app Angular arrancó y restauró la sesión —
  // emite GET /api/auth/me (initializeSession). 200 ⇒ Angular corriendo + JWT
  // válido (la denegación posterior es por RBAC, no por auth). Es el control
  // determinista de que la app está viva, verificado a nivel de red (sin tocar
  // el DOM, ver nota del DEFECTO abajo). Se espera SOLO el commit del goto (no
  // el "load"): en cuanto /auth/me resuelve, el roleGuard entra en bucle y
  // satura el renderer, por lo que el evento "load" puede no llegar jamás.
  const me = await mePromise;
  expect(me.status()).toBe(200);

  // DEFECTO E9.3 P0.5: el roleGuard devuelve createUrlTree(['/dashboard']) —
  // la misma ruta — y como router.navigated es false durante la 1ª navegación,
  // la comprobación de "misma URL" no se activa → el router re-navega en bucle
  // saturando el main thread del renderer (verificado en trace: cualquier query
  // al DOM cuelga). Por eso la propiedad se verifica de forma determinista SIN
  // tocar el DOM, a nivel de URL y de red:
  //  1. La URL permanece en /dashboard (la denegación no re-direcciona).
  //  2. Cero requests a /api/admin/stats* (el Dashboard no se monta ni pide
  //     datos admin). Poll Node-side sin DOM: falla si el defecto se corrige
  //     y el Dashboard llegara a disparar stats.
  expect(page.url()).toContain("/dashboard");
  await expect.poll(() => statsRequests.length, { timeout: 5_000, intervals: [500] }).toBe(0);

  await context.close();
});

test("@p0 authorization: customer JWT on admin API → 403 (RBAC)", async ({ playwright }) => {
  const customerJwt = readCustomerJwt();
  const ctx = await playwright.request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${customerJwt}` },
  });
  try {
    const forbidden: Array<{ name: string; req: Promise<{ status(): number }> }> = [
      { name: "GET /admin/orders", req: ctx.get(`${API}/admin/orders`) },
      { name: "GET /inventory", req: ctx.get(`${API}/inventory`) },
      { name: "POST /products", req: ctx.post(`${API}/products`, { data: { name: "x" } }) },
      {
        name: "PATCH /admin/orders/:id/status",
        req: ctx.patch(`${API}/admin/orders/000000000000000000000000/status`, {
          data: { status: "confirmed" },
        }),
      },
      { name: "GET /admin/audit-logs", req: ctx.get(`${API}/admin/audit-logs`) },
    ];

    for (const { name, req } of forbidden) {
      const res = await req;
      expect(res.status(), `${name} should be 403`).toBe(403);
    }

    // Control positivo: /orders es público → 200 (los 403 son por RBAC, no red).
    const pub = await ctx.get(`${API}/orders`);
    expect(pub.status()).toBe(200);
  } finally {
    await ctx.dispose();
  }
});