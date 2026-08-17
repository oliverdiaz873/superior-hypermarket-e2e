import { expect, type Page } from "@playwright/test";

/**
 * E9.2 — Limpia el mirror local del carrito (localStorage['carrito']) de forma
 * determinista.
 *
 * Race N2 de los storefronts (Next y Angular): si el add cae antes del SYNC_OK,
 * el mirror local se persiste y el merge del backend SUMA cantidades ($inc); en
 * el siguiente page.goto (full load) el mirror se mergea → 1+1=2.
 *
 * Para que el carrito server quede exactamente qty=1, hay que vaciar el mirror
 * DESPUÉS del último write del efecto de persistencia. Como ese efecto corre en
 * el mismo commit que el render (ventana mínima tras confirmar el add en la UI),
 * se re-limpia en bucle hasta que el valor se estabiliza en null (una vez que el
 * provider llega a `serverSynced` ya no escribe el mirror).
 */
export async function clearLocalCartMirror(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.evaluate(() => localStorage.removeItem("carrito"));
        return (await page.evaluate(() => localStorage.getItem("carrito"))) === null;
      },
      { timeout: 5_000, intervals: [50, 100, 200, 400, 800] },
    )
    .toBe(true);
}