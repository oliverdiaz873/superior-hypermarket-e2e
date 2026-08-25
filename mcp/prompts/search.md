# Prompt MCP - Exploración READ-ONLY Search (Storefront Angular)

**Capacidades:** `core` únicamente (`mcp.config.json:2`) - `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot` - sin `network`/`storage`/`testing`/`vision`.

**Entorno:** `http://localhost:4200` (Angular Storefront, `config/env.ts:30` `PORTS.angular`, `playwright.config.ts:41` `baseURL angular`). Reutiliza entorno E2E `hypermarket_e2e` de forma **serializada** (no ejecutar `npm run e2e` concurrente). No autenticación.

**Objetivo:** Explorar funcionalidad búsqueda no cubierta por 17 tests actuales (`specs/angular/smoke.spec.ts:6` verifica navegación pero no search).

## Instrucciones para IA

### Reglas absolutas READ-ONLY

- No iniciar sesión (`/login` no).
- No modificar datos (no `POST /api/products`, no `POST /api/cart/items`, no `POST /api/orders`, no `DELETE`, no `cancel`, no `purchase`).
- No crear/eliminar productos/categorías.
- No realizar checkout.
- No modificar configuración.
- No usar `browser_storage_state` / `browser_cookie_*`.
- Solo `core` capabilities.

### Ciclo Observe -> Reason -> Act -> Observe

1. **Navegar** `browser_navigate {url: "http://localhost:4200"}`.
2. **Snapshot** `browser_snapshot` - observar árbol accesibilidad, identificar `searchbox`/`textbox` "Buscar" (refs temporales, no persistir).
3. **Reason** - interpretar roles semánticos.
4. **Act** - `browser_type`/`browser_click` con `ref` actual.
5. **Snapshot nuevo** tras cada acción (no reusar refs antiguas).
6. **Screenshot** `browser_take_screenshot` como evidencia si corresponde.

### Escenario exploración

**Paso 1 - Encontrar buscador**
- `browser_snapshot` home `http://localhost:4200`.
- Localizar elemento búsqueda: `searchbox`, `textbox` con placeholder `Buscar`, o `getByRole('searchbox')`.
- Documentar `role`, `name`, `ref`, `visible`.

**Paso 2 - Búsqueda con resultados esperados**
- `browser_type {ref: "<searchbox-ref>", text: "Tablet TCL", submit: true}` (producto seed `helpers/data.ts:8 productName Tablet TCL` existente en `hypermarket_e2e` 184 productos).
- `browser_snapshot` -> observar lista resultados: `heading`, `link` productos, `text` "Tablet TCL", paginación.
- Verificar `browser_network_requests` ya incluido en `core` si disponible.

**Paso 3 - Búsqueda sin resultados**
- `browser_type {ref: "<searchbox-ref>", text: "ZZZNoExiste999", submit: true}`.
- `browser_snapshot` -> observar estado vacío: `text "Sin resultados" / "No se encontraron productos"` o similar, `heading`, `status`.
- `browser_take_screenshot` evidencia estado vacío.

**Paso 4 - Estado interfaz**
- Observar mensajes, botones `Categorías` `specs/angular/smoke:7`, `link Inicio` `specs/angular/smoke:6`, placeholder, `button` limpiar búsqueda, accesibilidad `getByRole`.

### Documentación hallazgos

Para cada paso distinguir:

- **Observación:** `snapshot` muestra `textbox Buscar [ref=e5]` visible.
- **Hipótesis:** Si resultados no aparecen, posible debounce o `waitFor` necesario (no afirmar bug).
- **Evidencia:** `snapshot` + `screenshot` path `.tmp/mcp-output/`.
- **No afirmar bug** sin evidencia: "snapshot no muestra texto X" != "bug confirmado". Requerir reproducción + `browser_snapshot` + `screenshot`.

### Criterios no convertir automáticamente en test

Hallazgo interesante (ej. búsqueda vacía muestra mensaje inconsistente) -> documentar en `evidence.md` con objetivo/pasos/resultado esperado/real, luego humano decide `Playwright Test` `getByRole('searchbox')` `expect(page.getByText('Sin resultados')).toBeVisible()` (`specs/angular` patrón), no auto `ref=e12`.

### Limpieza

No requiere `clear:seed` (READ-ONLY). Cerrar `browser_close` al finalizar.

### Referencias

- `mcp.config.json:1` `core` only
- `playwright.dev/mcp/tools/navigation` `browser_navigate`
- `playwright.dev/mcp/snapshots` refs temporales
- `config/env.ts:30` `PORTS.angular 4200`
