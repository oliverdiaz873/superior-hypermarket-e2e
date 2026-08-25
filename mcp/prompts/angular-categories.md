# Prompt MCP - Exploración READ-ONLY Categorías y Subcategorías (Storefront Angular)

**Capacidades:** `core` únicamente (`mcp.config.json:2`) - `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot` - sin `network`/`storage`/`testing`/`vision`.

**Entorno:** `http://localhost:4200` (Angular Storefront, `config/env.ts:30` `PORTS.angular`). Reutiliza entorno E2E `hypermarket_e2e` de forma **serializada** (no ejecutar `npm run e2e` concurrente). No requiere autenticación.

**Objetivo:** Explorar la navegación de categorías raíz y subcategorías hojas, verificando la renderización de carruseles de productos, breadcrumbs y estructura jerárquica corregida en la Fase 9D.

## Instrucciones para IA

### Reglas absolutas READ-ONLY

- No iniciar sesión (`/login` no).
- No modificar datos (no `POST /api/products`, no `POST /api/cart/items`, no `POST /api/orders`, no `DELETE`, no `cancel`, no `purchase`).
- No crear/eliminar productos/categorías.
- No realizar checkout ni agregar al carrito.
- No modificar configuración ni cookies/storage.
- Solo `core` capabilities.

### Ciclo Observe -> Reason -> Act -> Observe

1. **Navegar** a la URL de la categoría o subcategoría.
2. **Snapshot** `browser_snapshot` - observar árbol de accesibilidad, breadcrumbs, títulos de sección y carruseles de productos.
3. **Reason** - interpretar presencia de carruseles, productos visibles y links de navegación.
4. **Act** - hacer clic en links de subcategorías o breadcrumbs usando la `ref` actual.
5. **Snapshot nuevo** tras cada acción (no reusar refs antiguas).
6. **Screenshot** `browser_take_screenshot` como evidencia si se detecta alguna anomalía.

### Escenarios de Exploración (Fase 9D Validation)

**Escenario 1 - Categoría Padre Alimentos (`/category/alimentos`)**
- `browser_navigate {url: "http://localhost:4200/category/alimentos"}`.
- `browser_snapshot` -> observar breadcrumb ("Inicio > Alimentos"), secciones de subcategorías (ej. "Frutas y Verduras", "Despensa", "Bebidas", etc.) y presencia de productos en carruseles.
- Verificar que la página no muestre estado vacío o error cuando existen productos en las subcategorías.

**Escenario 2 - Subcategoría Hoja Frutas y Verduras (`/category/alimentos/frutas-y-verduras`)**
- `browser_navigate {url: "http://localhost:4200/category/alimentos/frutas-y-verduras"}`.
- `browser_snapshot` -> observar filtrado específico por la categoría hoja `"frutas-y-verduras"`.
- Confirmar que se muestren los productos pertenecientes a "Frutas y Verduras" (ej. "Ajíes Morrones").
- Verificar que la página cargue con éxito y sin errores.

**Escenario 3 - Categoría Padre Tecnología (`/category/tecnologia`)**
- `browser_navigate {url: "http://localhost:4200/category/tecnologia"}`.
- `browser_snapshot` -> observar secciones de tecnología ("Televisores", "Laptops", "Tablets", etc.) y carruseles asociados.

**Escenario 4 - Subcategoría Hoja Tablets (`/category/tecnologia/tablets`)**
- `browser_navigate {url: "http://localhost:4200/category/tecnologia/tablets"}`.
- `browser_snapshot` -> observar filtrado específico por la subcategoría hoja `"tablets"`.
- Confirmar la presencia de productos de la categoría (ej. "Tablet TCL").

### Documentación de Hallazgos

Para cada escenario registrar:

- **Ruta evaluada:** ej. `/category/alimentos/frutas-y-verduras`.
- **Breadcrumb detectado:** ej. `[link "Inicio", text "Alimentos"]`.
- **Productos visibles:** lista de títulos de productos presentes en los carruseles/grids.
- **Anomalías:** si algún carrusel se muestra vacío o sin productos pese a existir en la base de datos.
- **Evidencia:** `snapshot` + `screenshot` path `.tmp/mcp-output/`.

### Limpieza

Cerrar sesión/navegador con `browser_close` al finalizar la sesión exploratoria.

### Referencias

- `mcp.config.json:1` `core` capabilities
- `config/env.ts:30` `PORTS.angular 4200`
- Corrección de rutas de subcategoría Fase 9D
