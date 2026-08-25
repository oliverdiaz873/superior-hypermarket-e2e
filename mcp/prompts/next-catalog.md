# Prompt MCP - Exploración READ-ONLY Catálogo e i18n (Storefront Next.js App Router)

**Capacidades:** `core` únicamente (`mcp.config.json:2`) - `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot` - sin `network`/`storage`/`testing`/`vision`.

**Entorno:** `http://localhost:3001` (Next.js Storefront App Router, `config/env.ts:31` `PORTS.next`). Reutiliza entorno E2E `hypermarket_e2e` de forma **serializada** (no ejecutar `npm run e2e` concurrente). No requiere autenticación.

**Objetivo:** Explorar la navegación de catálogo, SSR, soporte multilingüe i18n (`/es` y `/en`) y resolución de rutas dinámicas de categorías y subcategorías en Next.js App Router (Fase 9D).

## Instrucciones para IA

### Reglas absolutas READ-ONLY

- No iniciar sesión (`/login` no).
- No modificar datos (no `POST /api/products`, no `POST /api/cart/items`, no `POST /api/orders`, no `DELETE`).
- No realizar compras ni modificar el carrito.
- No modificar cookies ni almacenamiento.
- Solo `core` capabilities.

### Ciclo Observe -> Reason -> Act -> Observe

1. **Navegar** a las rutas del catálogo Next.js.
2. **Snapshot** `browser_snapshot` - observar estructura renderizada por SSR, textos traducidos, breadcrumbs y productos.
3. **Reason** - interpretar presencia de componentes client-side y server-side.
4. **Act** - alternar entre rutas de idioma (`/es` / `/en`) o hacer clic en elementos de navegación.
5. **Snapshot nuevo** tras cada acción (no reusar refs antiguas).
6. **Screenshot** `browser_take_screenshot` como evidencia ante discrepancias de i18n o errores.

### Escenarios de Exploración

**Escenario 1 - Ruta Categoría Padre en Español (`/es/category/alimentos`)**
- `browser_navigate {url: "http://localhost:3001/es/category/alimentos"}`.
- `browser_snapshot` -> verificar respuesta HTTP 200, breadcrumb ("Inicio > Alimentos"), i18n en español y carruseles por subcategoría.

**Escenario 2 - Subcategoría Hoja Válida (`/es/category/alimentos/frutas-y-verduras`)**
- `browser_navigate {url: "http://localhost:3001/es/category/alimentos/frutas-y-verduras"}`.
- `browser_snapshot` -> confirmar respuesta HTTP 200 (NO 404), visualización del carrusel específico de "Frutas y Verduras" y productos asociados (ej. "Ajíes Morrones").

**Escenario 3 - Subcategoría Válida en Tecnología (`/es/category/tecnologia/tablets`)**
- `browser_navigate {url: "http://localhost:3001/es/category/tecnologia/tablets"}`.
- `browser_snapshot` -> confirmar respuesta HTTP 200 y presencia de productos (ej. "Tablet TCL").

**Escenario 4 - Subcategoría Inválida (`/es/category/alimentos/invalid-sub`)**
- `browser_navigate {url: "http://localhost:3001/es/category/alimentos/invalid-sub"}`.
- `browser_snapshot` -> verificar que el guard de validación active de forma correcta la página de error `not-found` ("Página no encontrada").

**Escenario 5 - Soporte Multilingüe i18n (`/en/category/alimentos`)**
- `browser_navigate {url: "http://localhost:3001/en/category/alimentos"}`.
- `browser_snapshot` -> verificar traducción de etiquetas (breadcrumbs, títulos de categoría e interfaz) en idioma inglés.

### Documentación de Hallazgos

Para cada escenario registrar:

- **Ruta evaluada:** ej. `/es/category/alimentos/frutas-y-verduras`.
- **Estado HTTP / Renderizado:** HTTP 200 OK / 404 Not Found / Página `not-found`.
- **Breadcrumb & i18n:** textos en el idioma correspondiente (`es` / `en`).
- **Productos detectados:** presencia de componentes `ProductCarouselSection` con productos.
- **Evidencia:** `snapshot` + `screenshot` path `.tmp/mcp-output/`.

### Limpieza

Cerrar el navegador con `browser_close` al concluir la sesión.

### Referencias

- `mcp.config.json:1` `core` capabilities
- `config/env.ts:31` `PORTS.next 3001`
- Corrección de guardas `notFound()` e i18n Fase 9D
