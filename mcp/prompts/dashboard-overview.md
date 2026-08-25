# Prompt MCP - Exploración READ-ONLY Dashboard de Administración

**Capacidades:** `core` únicamente (`mcp.config.json:2`) - `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot` - sin `network`/`storage`/`testing`/`vision`.

**Entorno:** `http://localhost:4201` (Dashboard Admin Angular, `config/env.ts:32` `PORTS.dashboard`). Reutiliza entorno E2E `hypermarket_e2e` de forma **serializada** (no ejecutar `npm run e2e` concurrente).

**Objetivo:** Explorar la interfaz del panel de administración, estructura de navegación, tablas de productos, filtros de inventario y listas de órdenes en modo estrictamente de lectura.

## Instrucciones para IA

### Reglas absolutas READ-ONLY

- No ejecutar mutaciones administrativas (no crear/editar/eliminar productos, no cambiar estados de órdenes, no ajustar stock).
- No realizar `POST`, `PUT`, `PATCH` ni `DELETE` sobre la API de administración.
- No modificar roles de usuarios ni permisos RBAC.
- No alterar la configuración del sistema.
- Solo `core` capabilities.

### Ciclo Observe -> Reason -> Act -> Observe

1. **Navegar** `browser_navigate {url: "http://localhost:4201"}`.
2. **Snapshot** `browser_snapshot` - observar menú lateral, botones de navegación, tablas y contadores.
3. **Reason** - interpretar vistas administrativas accesibles y estados de carga.
4. **Act** - hacer clic en pestañas de menú o selectores de filtro usando la `ref` actual.
5. **Snapshot nuevo** tras cada navegación (no reusar refs antiguas).
6. **Screenshot** `browser_take_screenshot` como evidencia de errores de renderizado o tablas vacías.

### Escenarios de Exploración

**Escenario 1 - Carga e Inicio del Dashboard (`http://localhost:4201`)**
- `browser_navigate {url: "http://localhost:4201"}`.
- `browser_snapshot` -> observar login o panel principal, barra de navegación superior/lateral y métricas generales.

**Escenario 2 - Catálogo y Listado de Productos**
- Navegar a la sección de productos del panel de administración.
- `browser_snapshot` -> observar tabla de productos, columnas (ID, SKU, Nombre, Categoría, Precio, Estado, Stock), paginación y buscador.
- Probar filtros de búsqueda en la tabla de productos (ej. "Morrones" o "TCL") sin guardar ni modificar registros.

**Escenario 3 - Gestión e Inspección de Inventario**
- Navegar a la vista de inventario/movimientos.
- `browser_snapshot` -> verificar visualización de existencias, productos con bajo stock y log de movimientos en modo lectura.

**Escenario 4 - Listado de Órdenes y Pedidos**
- Navegar a la sección de pedidos/órdenes.
- `browser_snapshot` -> inspeccionar la tabla de órdenes recibidas (ID de orden, Cliente, Total, Estado) sin ejecutar cambios de estado (no aprobar, no cancelar).

### Documentación de Hallazgos

Para cada vista explorada registrar:

- **Sección explorada:** ej. Productos / Inventario / Pedidos.
- **Elementos visibles:** tablas, columnas, botones de acción y estado de carga.
- **Inconsistencias UI:** fallos en formateo de monedas, textos superpuestos o tablas que no rendericen datos.
- **Evidencia:** `snapshot` + `screenshot` path `.tmp/mcp-output/`.

### Limpieza

Cerrar el navegador con `browser_close` al finalizar la exploración.

### Referencias

- `mcp.config.json:1` `core` capabilities
- `config/env.ts:32` `PORTS.dashboard 4201`
- Reglas RBAC y consultas READ-ONLY de administración
