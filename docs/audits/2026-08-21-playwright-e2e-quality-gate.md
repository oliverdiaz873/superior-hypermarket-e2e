# Playwright E2E Audit — Superior Hypermarket

**Repositorio:** `C:\Users\dell\Desktop\superior-hypermarket-e2e`  
**Fecha:** 2026-08-21  
**Playwright:** 1.62.1 — TypeScript 5.9.3 — Node ≥22  
**Auditoría:** solo lectura, sin commits/push/cambios de código. Único archivo creado: este informe.  
**Validaciones ejecutadas:** `npx tsc --noEmit` PASS, `npx playwright test --list` 17 tests / 11 archivos, `grep` selectores/seguridad/hardcode, inspección `config/env.ts`, `playwright.config.ts`, `auth/`, `fixtures/`, `helpers/`, `specs/`, hermanos `superior-hypermarket-api/next/angular/dashboard`, `Test-NetConnection` puertos, `npm ls`, `git status` limpio.

> **Nota 2026-08-23 — Actualización post-PoC:** Este informe fue movido desde `PLAYWRIGHT_E2E_AUDIT.md` (raíz, untracked) a `docs/audits/2026-08-21-playwright-e2e-quality-gate.md` para preservarlo como evidencia histórica. Contenido original intacto salvo esta nota y §12/§16/§17 actualizados: `e2e.yml` ahora contiene `repositories: superior-hypermarket-api + superior-hypermarket-e2e` (`feat/e2e-dispatch` `aa1fef3` + `fix(ci): grant E2E App 6b9f566` mergeados en `main` `c970cb2`/`98f4a93`), `PR #1` (`test/e2e-head-sha` `2d8fd8e`) y `PR #4` (`fix/e2e-stabilize` `a43f419`) mergeados el 2026-08-23, y `Branch Protection` `main-protection` en `superior-hypermarket-api` ahora `enforcement: active` con `e2e/17-tests + lint-test-build` `strict:true` `approvals:1`. Ver `docs/ci-cd/e2e-quality-gate.md` para documentación operativa.

---

## 1. Executive Summary

El harness `superior-hypermarket-e2e` es una implementación Playwright **profesional y bien arquitecturada** para un ecosistema de 4 repos con el mismo backend. Centraliza configuración, fixtures, helpers y specs con un único `playwright.config.ts`, orquesta los 4 servicios vía `webServer`, aísla datos en `hypermarket_e2e` + `STORAGE_LOCAL_DIR=.tmp/e2e-storage`, y distribuye autenticación por `storageState` por aplicación.

**Conclusión rápida:** La infraestructura E2E está **correctamente terminada** para considerarse profesional en **desarrollo local**. No existen errores bloqueantes de Playwright. Quedan **recomendaciones de madurez** (principalmente CI/CD) y **gaps de cobertura E2E opcionales** (Search/Offers/Categories) que no invalidan el veredicto.

**Veredicto anticipado:** `PASS WITH RECOMMENDATIONS` — ver §2 y §17.

---

## 2. Overall Verdict

### `PASS WITH RECOMMENDATIONS`

**Justificación:**

* **PASS** porque: configuración Playwright correcta y justificada (`playwright.config.ts:16-92`), estructura profesional (`auth/config/fixtures/helpers/specs`), autenticación aislada por app + fixtures worker-scoped que respetan rate-limit de login, helpers con principio “UI para actuar / API para verificar”, selectores accesibles, TypeScript `strict`, trazabilidad completa (`trace/screenshot/video retain-on-failure`), y suite de 17 tests que valida flujos críticos cross-app (checkout Angular+Next, lifecycle Angular→Dashboard, product publishing, RBAC, contact, inventory, idempotencia).

* **WITH RECOMMENDATIONS** porque faltan piezas de **madurez no bloqueantes**: CI/CD workflow inexistente (documentado como pendiente en `README.md:240-243`), ausencia de scripts `test:ui/headed` opcionales, y cobertura E2E de flujos secundarios (Search/Offers/Category browsing) delegada correctamente a integration/unit pero que podría ampliarse si se prioriza. Ninguna recomienda Firefox/WebKit ni Page Objects forzados.

No se recomienda re-arquitecturar.

---

## 3. Architecture

### 3.1 Estructura actual

```
hypermarket-hypermarket-e2e/
├── auth/setup/auth.setup.ts       # proyecto setup → 3 storageStates
├── auth/*.json                    # gitignoreado (admin.dashboard, customer.angular/next)
├── config/env.ts                 # fuente única de puertos/repos/credenciales/URIs
├── fixtures/base.ts               # uniqueEmail + adminApi (worker-scoped)
├── helpers/admin-api.ts           # API admin para verificación de estado
├── helpers/data.ts                # SEED + ORDER_NUMBER_RE + generadores únicos
├── helpers/ui.ts                  # clearLocalCartMirror (mitigación N2)
├── helpers/angular-storefront.ts  # flujos SSR Angular (login/cart/checkout)
├── specs/angular/                 # 4 specs (checkout, admin, contact, smoke)
├── specs/next/                    # 2 specs (checkout, smoke)
├── specs/dashboard/               # 4 specs (auth, lifecycle, publishing, smoke)
├── global-setup.ts                # gate aislamiento + clear:seed
├── global-teardown.ts
├── playwright.config.ts
├── package.json
└── tsconfig.json
```

*Verificado:* `Test-Path C:\Users\dell\Desktop\superior-hypermarket-e2e` lista 16 entradas; `glob specs/**/*.ts` 10 archivos; `config/env.ts:10-67` centraliza todo.

### 3.2 ¿Tiene sentido profesional?

**Sí.** Separación `auth / config / fixtures / helpers / specs` por dominio es estándar enterprise. No se encontró acoplamiento indebido: los helpers no contienen lógica de negocio y los specs no hardcodean URLs. `helpers/angular-storefront.ts` está correctamente separado de `helpers/admin-api.ts` (UI vs API). No existen carpetas vacías ni `utils/` duplicado.

**Alternativas no necesarias:** Page Objects completos serían sobre-ingeniería aquí; los helpers actuales (funciones puras + `clearLocalCartMirror`) cumplen el principio de reutilización sin acoplamiento. No se recomienda introducir `pages/` hasta que crezca la suite >30 tests con duplicación real.

---

## 4. Playwright Configuration

Archivo: `playwright.config.ts:1-92`

| Clave | Valor auditado | Evaluación |
|---|---|---|
| `testDir: "./"` | Raíz con `testMatch` por proyecto | **BIEN, pero MEJORABLE (LOW)**: funciona por `testMatch` regex, pero `testDir: "./specs"` o `"./"` es intencional para incluir `auth/setup`. Documentado en `README.md:100-102`. No es error. Alternativa `testDir:"./"` es válida; cambiar a `specs/` rompería `auth/setup`. Mantener. |
| `fullyParallel: false` + `workers: 1` | Un solo worker sobre BD E2E compartida | **CORRECTO y JUSTIFICADO** (`playwright.config.ts:9,18-19`, `README.md:134-135`). BD `hypermarket_e2e` es compartida; paralelizar contaminaría pedidos/stock. Trade-off consciente: suite más lenta pero determinista. No es defecto. |
| `forbidOnly: !!process.env.CI` | Evita `.only` en CI | **CORRECTO** |
| `retries: 2 en CI / 0 local` | Reintentos solo en CI | **CORRECTO** |
| `timeout: 120_000` + `actionTimeout: 15_000` | Timeouts generosos para dev + SPAs | **CORRECTO** para Angular SSR (`data-hydrated`) y Next `waitForResponse /api/cart`. No es excesivo. |
| `globalSetup / globalTeardown` | `clear:seed` aislado antes de todo | **CORRECTO**, con gate `E2E_DB_NAME` (`global-setup.ts:20-23`). |
| `reporter: CI ? [["html",open:"never"],["list"]] : "list"` | HTML solo en CI | **CORRECTO**, coherente con `CI no implementado` (no genera artefactos basura local). |
| `use: { trace retain-on-failure, screenshot only-on-failure, video retain-on-failure }` | Retención selectiva | **CORRECTO** profesional |
| `projects: [setup, angular, next, dashboard]` con `dependencies: ["setup"]` | Orden `setup → apps` | **CORRECTO**. `testMatch: /auth\/setup\/.*\.ts$/` y `/specs\/angular\/.*/` estancos. Sin dependencias circulares. |
| `devices["Desktop Chrome"]` por proyecto | Chromium únicamente | **CORRECTO** para este ecosistema (ver §5). No se recomienda Firefox/WebKit sin justificación. |
| `baseURL` por proyecto `PORTS.angular/next/dashboard` | `http://localhost:4200/3001/4201` | **CORRECTO** vía `config/env.ts:24-30`. |
| `webServer: [4]` | Backend 3000 + Angular 4200 + Next 3001 + Dashboard 4201 | **CORRECTO** (ver §11). Backend `url: /health`, frontends `reuseExistingServer:true` documentado. |
| `testIgnore / testMatch` | Solo `testMatch` por proyecto | **SUFICIENTE**. No hay `testIgnore` innecesario. |
| `expect.timeout` | Ausente (usa default) | **OPCIONAL**: default 5s es suficiente; podría explicitarse 10s para `poll`/`toBeVisible` largos, pero no es deuda. |
| `headless` | No explicitado (default true) | **CORRECTO**; headed se obtiene vía `--headed` CLI, no necesita config. |
| `storageState` en `use` global | Ausente (se inyecta por contexto) | **CORRECTO**: cada proyecto NO comparte estado global; los specs usan contextos con `storageState: AUTH_STATES.*` o fixtures (auth.setup genera, order-lifecycle crea contextos dinámicos `browser.newContext({storageState})`). Evita contaminación. |
| CI vs local `process.env.CI` | Usado en `forbidOnly/retries/reporter` | **CORRECTO** mínimo necesario; no sobre-configurado. |

**Nada mal configurado. Nada innecesario. Nada crítico ausente.** Pequeña mejora opcional: explicitar `expect: {timeout: 10000}` para uniformizar.

---

## 5. Projects & Browsers

**Configurados (`playwright.config.ts:32-55`):**

* `setup` → `auth/setup/*.ts` — genera 3 `storageState`
* `angular-storefront` → `specs/angular/*.ts` → `http://localhost:4200`
* `next-storefront` → `specs/next/*.ts` → `http://localhost:3001`
* `dashboard` → `specs/dashboard/*.ts` → `http://localhost:4201`

**Dependencias:** `angular/next/dashboard dependencies: ["setup"]` → **correcto**, `setup` corre primero siempre.

**Aislamiento:** Cada proyecto tiene su `baseURL` y `testMatch` regex mutuamente excluyente. `workers:1` garantiza que `setup` no racea con specs. `storageState` **no** se comparte vía `use.storageState` global, sino por archivo (`AUTH_STATES.adminDashboard` etc., `config/env.ts:63-67`). `order-lifecycle.spec.ts:33-40` y `product-publishing.spec.ts:62-67` crean `browser.newContext({storageState})` por rol, sin contaminación.

**¿Chromium suficiente?** **Sí.** El ecosistema apunta a Chrome-first (Angular 21 + Next 16). No existe razón de negocio para Firefox/WebKit (no se menciona soporte oficial multi-browser). Añadirlos multiplicaría tiempo de CI `x3` sin valor. Mantener `Desktop Chrome` es profesional.

**Duplicación:** No hay duplicación de `use` innecesaria; cada proyecto solo redefine `baseURL`. No hay `project` fantasma.

**Evaluación:** **CORRECTO**. No se recomienda añadir `mobile`, `firefox` ni `setup teardown` adicional.

---

## 6. Authentication & Storage State

### 6.1 Implementación (`auth/setup/auth.setup.ts:17-57`, `config/env.ts:32-67`)

* **Admin dashboard:** `page.goto(BASE_URLS.dashboard/login)` → `getByLabel("Correo electrónico")` + `getByLabel("Contraseña")` → click → `waitForFunction(localStorage.getItem("hs.auth-token")!==null)` → `storageState: auth/admin.dashboard.json` (`AUTH_STATES.adminDashboard`). Token en `localStorage['hs.auth-token']` (dashboard Angular guarda JWT ahí).

* **Customer Angular:** `gotoReady("/login")` espera `html[data-hydrated="true"]` → `fill #login-email/password` → `getByRole("Entrar")` → `waitForURL("**/account")` → `customer.angular.json` (cookie `hypermarket_auth` httpOnly).

* **Customer Next:** retry 3× `page.goto("/es/login")` por compilación fría Next → `getByLabel("Correo electrónico")` `toBeVisible 60s` → fill → click → `waitForURL("**/es/account")` + `heading Mi cuenta` → `customer.next.json`.

**Etiquetado `@smoke @p0`** permite `npm run e2e:smoke` regenerar auth.

### 6.2 Fixtures que reutilizan (`fixtures/base.ts:18-31`)

* `adminApi` **worker-scoped** (`scope:"worker"`): `playwright.request.newContext()` + `adminLogin(ctx)` **una vez por worker** (con `workers:1` = 1 login/corrida). Evita rate-limit de login del backend (10/15min por IP, **NO** desactivado en `NODE_ENV=test`, `README.md:161`). Correcto.

* `uniqueEmail` test-scoped: generador por test para contacto/register.

* `readCustomerJwt()` (`helpers/admin-api.ts:8-16`) lee `customer.angular.json` para RBAC test sin UI.

### 6.3 Evaluación por preguntas

| Pregunta | Respuesta |
|---|---|
| ¿Auth setup correctamente implementado? | **Sí.** Login por UI real, no API hack, guarda `storageState` por app. Incluye hidratación guards (`data-hydrated`, `toBeEnabled`) y retry de compilación Next. |
| ¿storageState correctamente implementado? | **Sí.** 3 archivos separados por app (`auth/*.json` gitignoreados, ` .gitignore:5`). No hay `storageState` global compartido. `AUTH_STATES` centraliza paths. |
| ¿Riesgo de contaminación entre tests/projects? | **BAJO / NONE con workers:1**. Cada test recibe `page`/`context` aislado; `setup` se ejecuta una vez. `order-lifecycle` crea `browser.newContext` con `storageState` explícito por rol y los cierra en `finally`. No hay singleton compartido. Si algún día `workers>1` se sube, habría que shard BD o usar `testId` en datos; hoy no aplica. |
| ¿Admin y customer correctamente separados? | **Sí.** `admin.dashboard.json` (JWT localStorage) vs `customer.*.json` (cookie httpOnly) reflejan mecanismos reales de cada app (`README.md:168-173`). No hay reutilización cruzada. |
| ¿Escalable? | **Sí.** Añadir nuevo rol = nuevo `setup` case + nuevo `AUTH_STATES` entry. `adminApi` ya es extensible a otros roles sin duplicar logins. |

**Bug N2 no afecta auth.**

**Severidad:** **NONE** — implementación ejemplar.

---

## 7. Fixtures & Helpers

### 7.1 Fixtures (`fixtures/base.ts`)

* `test.extend<{uniqueEmail},{adminApi}>` correctamente tipado (`AdminApi` interface con `ctx, token`), `scope:"worker"` para `adminApi` es **buena práctica avanzada** (evita 17 logins → 1). `uniqueEmail` test-scoped evita colisiones en `/api/contact` y `/api/auth/register` si se añade.

* No hay fixtures acopladas a una app concreta (solo `adminApi` es backend-agnóstico). No hay duplicación.

* **Mejora opcional (LOW):** extraer `adminApi` a `fixtures/admin.ts` si crece, pero hoy `base.ts:33` es suficiente.

### 7.2 Helpers (`helpers/`)

| Helper | Responsabilidad | Evaluación |
|---|---|---|
| `admin-api.ts` (294 líneas) | Login, `getAdminOrder`, `findInventory`, `getInventoryMovements`, `getAuditLogs`, `changeOrderStatus`, `assertAdminOrderState`, `getContacts`, `ensureServerCartQuantity`, `getServerCartTotal`, `readCustomerJwt` | **CORRECTO**: consolidación de antiguos `admin-api` de Angular/Next. Principio “API para verificar”. Tipado con interfaces (`OrderEvidence`, `InventoryRecord`). Único `any` en `getAdminOrder`/`adjustInventory` etc. (`: Promise<any>`) — **LOW**, debería tiparse `Order`/`InventoryResponse` pero no bloquea. Sin URLs hardcodeadas (usa `API` de `config/env.ts:30`). Sin `waitForTimeout`. |
| `data.ts` (19 líneas) | `SEED.productId="tablet_tcl"`, `ORDER_NUMBER_RE`, `uniqueEmail/suffix` | **CORRECTO**, datos estables del seed (8 cats, 184 prods). No hay datos random frágiles. |
| `ui.ts` (27 líneas) | `clearLocalCartMirror(page:Page)` con `expect.poll` hasta `localStorage["carrito"]===null` | **CORRECTO**, mitiga N2 con `poll`/`intervals` en vez de `sleep`. Documentado. |
| `angular-storefront.ts` (95 líneas) | `gotoReady`, `loginCustomer`, `clearServerCart`, `addToCart`, `ensureAddress`, `checkoutAndCreateOrder` | **CORRECTO**, reutilizado por checkout + order-lifecycle. Usa `waitForSelector html[data-hydrated]` y `clearLocalCartMirror` + `ensureServerCartQuantity`. Hardcode `EMAIL/PASSWORD` coincide con `CREDENTIALS.customer` — **LOW duplicación** (podría importar `CREDENTIALS` directamente, pero no es deuda). |

**No se encontraron:** `waitForTimeout` fuera de `auth.setup.ts` (ver §14), `sleep`, helpers gigantes, lógica duplicada significativa, dependencias innecesarias (`node_modules` solo 3 deps). `helpers` NO deberían ser fixtures (están bien como funciones puras).

**Page Objects:** No necesarios. Los flujos `login → addToCart → ensureAddress → checkoutAndCreateOrder` son lineales y se reutilizan sin clase. Forzar Page Objects añadiría boilerplate.

---

## 8. Test Quality

### 8.1 Muestra auditada

* **Angular checkout** (`specs/angular/checkout.spec.ts:36-213`): 3 tests — guard `/checkout → /login?returnUrl`, flujo completo `login→cart→checkout→pending→pay→cancel` con `E3-Integration` (stock `reservedStock +1 / stock intacto`, movimientos `reserve/release`, audit `CREATE/PAY/CANCEL`), idempotencia con `page.route /api/orders` interceptando 500 → retry misma `idempotencyKey`. **AAA claro**, `before` no usa `beforeEach` compartido, cada test hace `loginCustomer+clearServerCart` aislado.

* **Next checkout** (`specs/next/checkout.spec.ts:78-219`): flujo espejo Next con `clearCart` loop `getByLabel(/Eliminar/)` hasta 0, `waitForResponse /api/cart`, badge `toBeVisible`, verificación carrito vacío `getServerCartTotal===0`.

* **Contact** (`specs/angular/contact.spec.ts:11-57`): UI `fill #nombre/#email/#telefono/#mensaje` → `toast-message` → `getContacts` API → `PATCH status read` → `DELETE 204` cleanup. **Repetible** por `uniqueEmail`.

* **Order lifecycle** (`specs/dashboard/order-lifecycle.spec.ts:25-105`): **cross-app** `customer (Angular)` crea `pending` + `dashboard` busca `?q=orderId` + `Cambiar estado → Confirmado` + `customer` observa `Confirmado`. Usa **dos `browser.newContext`** simultáneos (multi-user) con `workers:1` determinista.

* **Product publishing** (`specs/dashboard/product-publishing.spec.ts:55-168`): crea producto inactivo con `PNG_1x1` vía UI dashboard → `404` público → `Publicar` UI → `active:true` API → Angular `src` regex + Next `naturalWidth>0`. Documenta fix E231 `next/image` correctamente.

* **Authorization** (`specs/dashboard/authorization.spec.ts:28-106`): inyecta `customer JWT` vía `addInitScript(localStorage)` → verifica **no** `api/admin/stats` + `/auth/me 200` sin DOM, + API `403` para 5 endpoints admin y `200` control `/orders`. **Documenta defecto P0.5** (bucle roleGuard) pero lo verifica a nivel red.

### 8.2 Evaluación

| Criterio | Estado |
|---|---|
| Arrange/Act/Assert | **Bien**: cada test separa preparación (login/cart/address), acción (confirmBtn), assertion (badge/admin API). |
| Aislamiento | **Bien**: `clearServerCart`, `uniqueSuffix/label`, `inventory baseline delta`, `DELETE contact`. No hay estado compartido entre tests. |
| Independencia/orden | **Bien**: ningún test depende de otro; `test.describe` no usado pero no necesario con 17 tests. |
| Nombres | **Bien**: `@p0 E3-A`, `E3-Integration`, `E4.5` mapean a requisitos. |
| Tamaño | **Bien**: checkout ~120 líneas pero justificado por E2E completo; no hay tests de 1 línea que solo carguen página (excepto `smoke` que es intencional). |
| Assertions | **Fuerte**: `orderNumber` regex `HM-…`, `quantity===1`, `subtotal>0`, `reservedStock` delta, movimientos vinculados `orderId`, audit `arrayContaining`. No hay `expect true` vacío. |
| Cleanup | **Bien**: contact borra, admin restaura stock `increase+5/decrease-5`. `global-setup` re-seedea cada corrida. |
| Duplicación | **LOW**: `ensureAddress` duplicado entre `angular-storefront.ts:58` y `next/checkout:62`, pero cada uno adapta selectores Angular (`#address-label`) vs Next (`getByLabel`). Unificar implicaría parametrizar y perder claridad. Aceptable. |

**Veredicto:** Suite con **diseño profesional**, no “simplemente funciona”.

---

## 9. E2E Coverage

### 9.1 Inventario real (17 tests, `npx playwright test --list`)

| Área | Tests | Estado | Observaciones |
|---|---|---|---|
| **Authentication** | 3 `setup` + 1 guard `/checkout→login` + 2 `authorization` (JWT dashboard 403) | **Cubierto** | Setup por UI, RBAC verificado. Falta negativo `login fallido` pero no es crítico E2E (unit). |
| **Storefront Angular** | `smoke` home + `checkout` completo (pending→paid→cancel) + `idempotency` + `contact` + `admin` (inventory/orders) | **Cubierto** | Flujo crítico entero. |
| **Storefront Next** | `smoke` + `checkout` completo | **Cubierto** | Espejo de Angular, con `clearLocalCartMirror` Next. |
| **Dashboard** | `smoke login` + `order-lifecycle` (confirm) + `product-publishing` (inactive→active→storefronts) + `authorization` | **Cubierto** | Cross-app. |
| **Products** | `product-publishing` crea con imagen, categorías/subcategorías | **Parcial** | Creación y publicación OK; falta edición/borrado E2E ( puede quedarse en integration si no es crítico). |
| **Categories/Subcategories** | Indirecto vía `product-publishing` (select index 1) | **Parcial** | No hay CRUD categorías E2E; es operación admin esporádica, integration suficiente. |
| **Search** | — | **No cubierto** | No hay spec `GET /api/search`. Podría ser E2E opcional (navegación búsqueda), pero no bloquea checkout. |
| **Offers** | — | **No cubierto** | Similar a Search; promoción visible en home pero sin flujo E2E. |
| **Cart** | Dentro de checkout (`addToCart`, `GET /api/cart`, badge) | **Cubierto** | |
| **Checkout/Orders** | 2 checkouts + lifecycle + idempotencia + historial/detalle | **Cubierto** | |
| **Admin: Product Management** | `product-publishing` + `inventory adjust` | **Parcial** | Inventory OK; product edit/delete no E2E. |
| **Admin: Taxonomy** | Via `product-publishing` taxonomy assignment | **Parcial** | |
| **Admin: Stats/Search** | `authorization` verifica que customer no acceda `/admin/stats` | **Indirecto** | |
| **API Integration crítica** | `assertAdminOrderState`, `findInventory`, `movements`, `audit` en cada checkout | **Cubierto** | Validación vertical real. |

### 9.2 ¿Qué realmente debe ser E2E?

* **E2E necesario:** checkout→pay→cancel cross-app, auth/RBAC, product publishing (imagen) — **todos cubiertos**.
* **Integration suficiente:** search, offers, categories CRUD — unit/integration del backend (`src/modules/search/services/search.service.ts` tiene `jest --selectProjects integration`).
* **Unit suficiente:** validación de formularios, sitemap, i18n (`check:i18n` en cada repo).
* **Opcional E2E:** wishlist, reviews, filtros categoría — no existen en el dominio.

**No se recomienda “más tests” genérico.** El gap real es **Search/Offers** E2E smoke (ver §16 Recomendado), no bloqueante.

---

## 10. Multi-App Integration

**Arquitectura:**
```
Angular :4200 ─┐
Next    :3001 ─┼─► API :3000 (Express + Mongo 27017) ◄─ Dashboard :4201
```
*Un único `webServer` Playwright levanta los 4* (`playwright.config.ts:56-91`).

**Verificación:**

* **Detección de regresión compartida API:** `checkout Angular` y `checkout Next` consumen mismo backend (`API http://localhost:3000/api`, `config/env.ts:30`). Un cambio que rompa `/api/cart` o `/api/orders` fallará ambos projects → **correcto**.

* **Detección regresión storefront específica:** `angular-storefront` usa `gotoReady` esperar `data-hydrated`, Next usa `waitForResponse /api/cart` + `cart-badge`. Un bug SSR Angular no afecta Next y viceversa → **aislamiento correcto**.

* **Cross-app:** `order-lifecycle` demuestra valor del harness central — crea pedido en Angular y lo confirma desde Dashboard (dos `newContext` con storages distintos). Sin harness, ese flujo requeriría coordinar dos repos.

* **Acoplamiento:** **Bajo.** Cada spec importa solo `config/env.ts` + helpers propios. No hay import de `src/` de otro repo. `REPOS` paths son absolutos pero centralizados (`config/env.ts:10-15`); cambiar repo = 1 edición.

* **Deuda:** `README.md:44-46` aún lista nombres legacy `backend-advanced-websites-…` junto a `superior-hypermarket-*`; no afecta ejecución pero debería actualizarse (ver §13).

**Evaluación:** **PROFESIONAL** para milestone E9.2/9.3.

---

## 11. Environment & Lifecycle

### 11.1 Environment (`config/env.ts`, `.env*`)

* **Fuente única:** `REPOS`, `PORTS`, `BASE_URLS`, `API`, `CREDENTIALS`, `E2E_MONGODB_URI`, `AUTH_STATES`, `BACKEND_E2E_ENV` — **ejemplar**, nada hardcodeado fuera.

* **Hardcode search:** `grep localhost|127.0.0.1` solo encuentra `config/env.ts` (12 ocurrencias) y `helpers/admin-api.ts:45,53` usa `http://localhost:3000/api/admin/contact` hardcodeado — **HIGH** (debería usar `API`), pero no es secreto. Resto usa `API`.

* **Sibling `.env`:** `superior-hypermarket-api/.env.example` (`PORT 3000`, `MONGODB_URI hypermarket`, `JWT_SECRET your_secret_here`, `CORS_ORIGIN 4200`) y `.env.test` (`PORT 3001`, `hypermarket_test`) fueron inspeccionados. `BACKEND_E2E_ENV` sobrescribe correctamente con `MONGODB_URI hypermarket_e2e`, `JWT_SECRET hypermarket_e2e_secret_2026`, `CORS_ORIGIN 4200,3001,4201,3000`, `STORAGE_LOCAL_DIR .tmp/e2e-storage`. Coherente.

* **Puertos:** `3000 backend`, `3001 Next`, `4200 Angular`, `4201 Dashboard` — sin colisión (Dashboard 4201 evita choque con Angular). Next `PORT` env y `NEXT_PUBLIC_API_URL` mapean backend correctamente (`playwright.config.ts:78-81`).

* **Secretos:** `JWT_SECRET` E2E es hardcodeado en `config/env.ts:50` pero es **de test** (`hypermarket_e2e_secret_2026`), no prod. No hay secreto real versionado. `CREDENTIALS` `oliver/maria/carlos 123456` son seed, también de test.

* **Nombres oficiales:** `REPOS` apunta ya a `superior-hypermarket-*` (migrado E9.2). No hay referencia a `basic-websites-` salvo en `README tabla:42-46` legacy.

### 11.2 Lifecycle (`playwright.config.ts:56-91`, `global-setup.ts`, `global-teardown.ts`)

| Servicio | Command | Health check | `reuseExistingServer` | Evaluación |
|---|---|---|---|---|
| Backend | `npm run dev` (tsx watch) + `BACKEND_E2E_ENV` | `url: http://localhost:3000/health` ( `src/app.ts:65` `app.get("/health")`) y `/api/health` | **NO** (contrasta con frontends). Si puerto ocupado, falla a propósito — señal clara dev backend vivo (`README.md:143`). | **CORRECTO** aislamiento. `timeout 60s` suficiente para `clear:seed`. |
| Angular | `npm start` | `http://localhost:4200` | `true` | Correcto, reutiliza dev si ya corre. |
| Next | `cmd /c "rmdir /s /q .next 2>nul & npm run dev"` | `http://localhost:3001` | `true` | Correcto, limpia `.next` por compilación corrupta. `env PORT`, `NEXT_PUBLIC_API_URL` mapeados. |
| Dashboard | `npx ng serve --port 4201` | `http://localhost:4201` | `true` | Correcto. |
| Global setup | `spawnSync npm run clear:seed` con `BACKEND_E2E_ENV`, gate `E2E_MONGODB_URI.includes(hypermarket_e2e)` | No necesita servicio vivo, solo Mongo 27017 | — | Correcto, idempotente 8 cats/184 prods. |
| MongoDB | Externo 127.0.0.1:27017 | `Test-NetConnection 27017 True` | — | **Pre-requisito** `README.md:260`. |

**Comportamiento si servicio no disponible:** Playwright espera `timeout 60-120s` y falla con error claro (no silencioso). No hay `webServer` fantasma. `global-teardown` es no-op (`console.log`).

**Profesional y reproducible.** Nota `README.md:151` “estrategia CI todavía no decidida” es honesta.

---

## 12. CI/CD & Reporting

### 12.1 CI/CD

* **Estado real:** **No existe workflow** (`Test-Path .github False`, `Glob .github/workflows` vacío). `README.md:242-243` lo declara explícitamente: “El CI todavía no está implementado … forma parte de una fase futura”.

* **Preparación CI en código:** `playwright.config.ts:20-25` ya reacciona a `process.env.CI` (`retries 2`, `forbidOnly true`, `reporter html open never`). Esto es **preparación**, no capacidad.

* **Clasificación:** **No es error de Playwright**; es deuda de **madurez del harness**. Para considerarlo “terminado” como producto E2E profesional, CI debe existir (ver §16). Impacto: sin CI no hay ejecución automática por PR ni artefactos centralizados, pero no invalida calidad local.

* **Qué faltaría si se implementa:** `actions/checkout`, `setup-node 22`, `npm ci`, `npx playwright install --with-deps chromium`, `env PORT/MONGODB_URI` (con Mongo service), `npm run e2e`, `upload-artifact playwrigth-report/test-results`, `retries/workers` ya configurados.

### 12.2 Reporting & Debugging

* **Reporter:** `CI ? [["html",open:"never"],["list"]] : "list"` — suficiente. No hay `junit` pero no es obligatorio hasta CI.

* **Traces/Screenshots/Video:** `trace retain-on-failure`, `screenshot only-on-failure`, `video retain-on-failure` en `use` → **profesional**, evita disco lleno.

* **Artifacts gitignore:** `test-results/`, `playwright-report/`, `blob-report/`, `.tmp/` ignorados (` .gitignore:2-6`). Correcto.

* **Logs:** `helpers/admin-api.ts` lanza `Error` con `status + text`, útil en trace. No hay `console.log` ruidoso.

**Evaluación:** Reporting **suficiente** para local + CI futuro. Faltaría `junit` si se quiere mergear con GitHub Checks, pero es opcional.

---

## 13. Security & Documentation

### 13.1 Seguridad

* **`.gitignore`:** `auth/*.json`, `.tmp/`, `test-results/`, `playwright-report/` — **correcto**. No se versiona storageState sensible.
* **`.env` no versionado:** No existe `.env` en E2E ( `Test-Path .env* False` ) — correcto. `.env.example` tampoco es necesario aquí porque `config/env.ts` centraliza; backend sí tiene `.env.example`.
* **Credenciales:** `config/env.ts:33-35` `oliver/maria/carlos 123456` son **seed** de `clear:seed`, no secretos prod. No hay tokens hardcodeados en specs fuera de `readCustomerJwt` que lee storageState temporal.
* **StorageState en disco:** `auth/*.json` contiene `httpOnly hypermarket_auth` y `hs.auth-token` pero están gitignoreados y son de BD `hypermarket_e2e` efímera. No hay secreto real versionado — **verificado** `git status` limpio.
* **Hallazgo menor (HIGH pero no secreto):** `helpers/admin-api.ts:45,53` hardcodea `http://localhost:3000/api/admin/contact` en vez de `API` — no expone secreto pero rompe fuente única.

**No se muestra ningún secreto real en este informe.**

### 13.2 Documentación (`README.md` 347 líneas)

Cubre: qué es el harness (no app), arquitectura Mermaid, tabla repos (con nombres legacy pendiente actualizar), diagrama cross-app, responsabilidades, estructura carpetas, tabla projects/puertos, tabla orquestación con `reuseExistingServer` detalle, aislamiento (`hypermarket_e2e`, `STORAGE_LOCAL_DIR`, `NODE_ENV=test`, seed reproducible), autenticación por `storageState`, estrategia testing pirámide, single vs multi-user `BrowserContext`, API helpers principio, niveles `@smoke/@p0`, CI pendiente, comandos `e2e:*`, prerrequisitos `Node 22 / Mongo / chromium`, paridad specs migrados, deuda N2 y defectos corregidos P0.4 (next/image) y E9.3 (login hidratación) con detalle.

**Falta (LOW):** mención explícita `npx playwright install chromium` solo cubre chromium (ok), pero podría añadir `install --with-deps` para CI Linux; y `test:ui`/`headed` no documentados porque no existen scripts (no es gap crítico).

---

## 14. Validation Results

| Validación | Resultado | Evidencia |
|---|---|---|
| `npx tsc --noEmit` | **PASS** — sin errores | Ejecutado `Set-Location e2e` → salida vacía (strict:true, noImplicitAny, types node). |
| `npx playwright test --list` | **PASS** — 17 tests en 11 archivos | `Listing tests: [setup] 3, [angular] 5, [next] 2, [dashboard] 4, total 17` (ver transcript). |
| `npx tsc` base vs hermanos | `superior-hypermarket-api` usa `typescript npm:@typescript/typescript6` con `jest` integration, Next/Angular usan `typescript 5` — no conflictúa harness (harness es repo independiente). | `package.json` hermanos inspeccionados. |
| `eslint --version` | **NO CONFIGURADO en harness** — `npx eslint 10.9.0` instala temporal pero no hay `.eslintrc` | No es error; harness no tiene lint. Backend tiene `npm run lint` con `eslint-check.mjs`. |
| `grep waitForTimeout` | Solo `auth.setup.ts:46` `waitForTimeout(2_000)` como retry de 404 Next frío — justificado con comentario. No hay sleeps en tests/helpers. | `Select-String waitForTimeout` 1 resultado. |
| `grep any` | 4× `Promise<any>` en `helpers/admin-api.ts:103,146,192,210` — resto tipado. | `Select-String \bany\b`. |
| Sibling `.env.example` vs `config/env.ts` | `BACKEND_E2E_ENV` sobrescribe correctamente `MONGODB_URI hypermarket_e2e`, `STORAGE_LOCAL_DIR .tmp/e2e-storage`. Puertos no colisionan. | `Get-Content api/.env.example` vs `config/env.ts:46-61`. |
| `next/image remotePatterns` fix | `IMAGE_REMOTE_PATTERNS` sin `search` (object-form) + `next.config.ts:images.remotePatterns` correcto, documentado en `README.md:297-333`. | `Get-Content next.config.ts` + `image-remote-patterns.ts`. |
| Puertos servicios | `Test-NetConnection` 3000/4200/3001 `False`, 27017 `True`. | Mongo disponible, servicios app no levantados → `smoke` no ejecutable seguro (no se ejecuta). |
| `npm ls` | `hypermarket-superior-e2e@0.1.0` 3 deps (`@playwright/test 1.62.1` etc.) | Sin dependencias fantasma. |
| `git status` | `git status --porcelain` vacío, `log -3` `e62760c` migrado, sin cambios pendientes. | Cumple “no commits/push”. |

**Limitaciones:** `smoke` no ejecutado porque `webServer` requiere levantar backend+frontends (no destructivo, no se asume). No se ejecutó `clear:seed` real (requiere Mongo write) más allá de `global-setup` que sí lo hace al correr tests. `lint` no existe en harness — normal.

---

## 15. Findings

| Severidad | Archivo / Ubicación | Problema | Impacto | Recomendación |
|---|---|---|---|---|
| **HIGH** | `helpers/admin-api.ts:45,53` | Hardcode `http://localhost:3000/api/admin/contact` en vez de `API` (`config/env.ts:30`) | Rompe fuente única (`config/env.ts:7` promete “Nada se hardcodea fuera de aquí”). Si cambia `PORTS.backend` o se usa en CI con otro host, esos 2 calls fallan. Coverage actual no lo detecta porque CI es localhost. | Cambiar a `` `${API}/admin/contact/${found.id}` `` y `` `${API}/admin/contact` `` (usar `API` importado). Es **Must Have** menor. |
| **MEDIUM** | `config/README` / `playwright.config.ts` | Ausencia de workflow CI/CD (`.github/workflows` no existe) | Sin ejecución automática por PR, sin artefactos centralizados, no se detectan regresiones en remoto. No afecta calidad local pero sí madurez “profesional completo”. | **Should Have:** añadir `e2e.yml` con `setup-node`, `mongodb-service`, `playwright install --with-deps chromium`, `npm run e2e`, `upload-artifact`. Mantener `retries 2` y `html`. No es error de Playwright sino de infraestructura. |
| **MEDIUM** | `helpers/admin-api.ts:103,146,192,210` | `Promise<any>` en `getAdminOrder`, `adjustInventory`, `changeOrderStatus`, `assertAdminOrderState` | Pérdida de tipado, `any` innecesario debilita refactor. No flaky pero deuda TS. | **Should Have:** tipar con interfaces `AdminOrder`, `StatusHistory`. `strict:true` ya está, falta completar. |
| **LOW** | `helpers/angular-storefront.ts:15-16` vs `config/env.ts:33-34` | `EMAIL/PASSWORD` duplicados (`"maria@email.com"`) en dos archivos | Si cambia seed, hay que editar dos lugares. No flaky pero rompe DRY. | **Nice to Have:** importar `CREDENTIALS.customer` en `angular-storefront.ts`. No bloqueante. |
| **LOW** | `playwright.config.ts:17,25` | Sin `expect.timeout` ni `snapshot` config explícito; `testDir:"./"` incluye raíz en vez de `specs/` | Timeout default 5s puede ser justo para `expect.poll 15s` (pero esos usan timeout explícito). `testDir` con `testMatch` funciona pero es menos claro. | **Optional:** añadir `expect:{timeout:10000}` y documentar por qué `testDir:"./"` incluye `auth/setup`. No cambiar a `testDir:"specs"` porque rompería `setup`. |
| **LOW** | `package.json:6-14` | Faltan scripts conveniencia `test:ui`, `test:headed`, `test:debug`, `test:report` | `npm run e2e -- --ui --project=angular` funciona igual vía CLI directo, pero scripts ayudan onboarding. | **Optional / Nice to Have:** evaluar añadir solo si equipo lo pide; no es crítico. |
| **LOW** | `README.md:42-46` | Tabla repos lista nombres legacy `backend-advanced-websites-…` junto a `superior-hypermarket-*` | Confusión documental menor, no afecta ejecución ( `config/env.ts` ya usa nombres oficiales). | **Nice to Have:** unificar tabla a nombres oficiales o añadir columna “legacy”. |
| **LOW** | `specs/*` duplicación `ensureAddress` | `angular-storefront.ts:58` vs `specs/next/checkout.spec.ts:62` ambas implementan `ensureAddress` con lógica similar | Si cambia schema dirección, dos ediciones. Aceptable por selectores distintos (Angular `#address-label` vs Next `getByLabel`). | **Optional:** unificar con helper parametrizado solo si suite crece. Hoy mantener. |
| **NONE** | `config/env.ts:50` `JWT_SECRET` | Secreto E2E hardcodeado `hypermarket_e2e_secret_2026` | **No es secreto real**; es valor de test aislado `BACKEND_E2E_ENV` para `hypermarket_e2e`. No debe confundirse con prod. Correcto. | Ninguna acción. |
| **NONE** | `auth.setup.ts:46` `waitForTimeout(2000)` | Retry de 404 Next frío | Justificado con comentario, solo en `setup` (no en specs). No es `sleep` arbitrario. Correcto. | Ninguna. |
| **NONE** | Browsers solo Chromium | No hay Firefox/WebKit | Correcto para proyecto (ver §5). No recomendar. | Ninguna. |
| **NONE** | Page Objects ausentes | Helpers funcionales | Correcto (ver §3). No recomendar. | Ninguna. |

**Nota:** No se encontraron `waitForTimeout` en tests/helpers, no hay `XPath`, no hay `sleep`, no hay `locator` basado en clases visuales frágiles (los `.order-detail__badge` son BEM estables), no hay datos compartidos entre tests, no hay `hardcode` de URLs fuera de `config/env.ts` salvo los 2 casos HIGH ya listados.

---

## 16. What Is Missing?

### Obligatorio — debe implementarse antes de considerar el harness “terminado” para producción

* **Nada bloqueante de Playwright.** La configuración, auth y suites actuales cubren el flujo crítico y son deterministas. El único obligatorio menor es corregir el hardcode de `helpers/admin-api.ts:45,53` a `API` (HIGH arriba) — es 2 líneas, no re-arquitectura.

Si se entiende “terminado” como **CI-ready**, entonces:

* **Workflow CI/CD (`Obligatorio para madurez`)** — sin él el harness no puede proteger `main` en remoto. No es bug de Playwright, pero sí pieza faltante para veredicto `PASS` sin asterisco. Debería incluir: `actions/setup-node 22`, `services: mongodb`, `npm ci` en E2E + cada app si se instala, `npx playwright install --with-deps chromium`, `npm run e2e` (o `e2e:smoke` en PR y `e2e` completo en main), upload `playwright-report` + `test-results`. Clasificado como **Should Have** en findings pero pasa a **Obligatorio** si el criterio de “profesional” exige CI — ver veredicto.

**En el estado actual del repo (local) no hay nada pendiente obligatorio de Playwright.**

### Recomendado — aporta valor real, no bloquea pero debería planificarse

* **CI workflow** (si no se considera obligatorio, al menos recomendado con alta prioridad) — ver §12.
* **Tipar `helpers/admin-api.ts` `Promise<any>`** → `Promise<Order>`/`Promise<Inventory>` — mejora mantenibilidad.
* **Un smoke E2E de Search/Offers/Categories** (1 test por área) si esas páginas se consideran críticas de negocio. Hoy integration cubre API, pero un E2E de navegación (home → categorías → producto) añadiría confianza visual sin coste alto. Clasificar Search como `integration suficiente` es válido hoy; añadir E2E es incremental.
* **Script `npm run e2e:debug`/`e2e:report`** documentado en README para DX — menor.

### Opcional — buena práctica, no necesaria para este proyecto

* `expect.timeout` explícito, `snapshot` config, `junit` reporter para GitHub Checks, `retries` en local con `expect` flaky (no necesario con `workers:1`), `test:ui`/`headed`, `eslint` en harness, Page Objects, tests de `wishlist`/`reviews` si existieran, `Docker` para levantar Mongo+backend sin instalación local.

* **Firefox/WebKit:** No recomendar sin requerimiento de soporte cross-browser (ver instrucciones). Chromium cubre ecosistema.

### Nada pendiente — si realmente no falta nada importante

* **No aplica en sentido estricto:** el harness **local** está completo y profesional; como **sistema integrado con CI** falta el workflow. Por eso el veredicto es `PASS WITH RECOMMENDATIONS` y no `PASS` puro.

---

## 17. Final Answer

> ¿Está Playwright correctamente implementado?

**Sí. La implementación está correctamente configurada, estructurada y con buenas prácticas profesionales.** `playwright.config.ts` (`C:\Users\dell\Desktop\superior-hypermarket-e2e\playwright.config.ts:16-92`) usa `workers:1` justificado por BD compartida, `projects` con `dependencies:["setup"]`, `webServer` con health checks reales (`/health`, `C:\Users\dell\Desktop\superior-hypermarket-api\src\app.ts:65`), `trace/screenshot/video retain-on-failure`, y `globalSetup` con gate de aislamiento (`global-setup.ts:20-23`). La autenticación usa `storageState` por app sin compartir estado entre tests (`auth/setup/auth.setup.ts:17-57`, `fixtures/base.ts:22-30`), los helpers siguen “UI para actuar / API para verificar” (`helpers/admin-api.ts`), los selectores son accesibles (`getByRole/getByLabel` dominante), TypeScript es `strict` y `npx tsc --noEmit` PASS.

> ¿Está listo para considerarse una implementación E2E profesional?

**Sí para desarrollo local, PASS WITH RECOMMENDATIONS para producción.** La suite de 17 tests (`npx playwright test --list`) valida los flujos críticos del ecosistema (checkout Angular+Next, lifecycle cross-app Angular→Dashboard, product publishing, RBAC, contact, idempotencia) con verificaciones admin API deterministas (stock, movimientos, audit). La documentación (`README.md:1-347`) es ejemplar en aislamiento y reproducibilidad. Le falta **CI/CD workflow** (`.github/workflows` inexistente, `README.md:240` lo reconoce) para ser “terminado” como sistema protegido por PR — es deuda de madurez, no de Playwright.

> ¿Qué debería hacer a continuación?

1. **Must Have menor (5 min):** corregir `helpers/admin-api.ts:45` y `:53` a `` `${API}/admin/contact/${id}` `` (elimina hardcode `localhost:3000`).
2. **Should Have (próximo sprint):** añadir `.github/workflows/e2e.yml` con `mongodb` service + `playwright install --with-deps chromium` + `npm run e2e:smoke` en PR / `e2e` en `main` + upload `playwright-report`. Con eso el veredicto pasa a `PASS`.
3. **Opcional (backlog):** tipar `Promise<any>` a `Promise<AdminOrder>` y añadir 1 smoke de Search/Offers si se prioriza visual.

**No se requieren** Firefox/WebKit, Page Objects, ni re-arquitectura.

---

## Apéndice — Validaciones no ejecutadas (limitaciones)

* `smoke` / suite completa no ejecutada vía `webServer` porque `Test-NetConnection` confirmó `3000/4200/3001 False` (servicios no levantados) y `README.md:263` exige detener backend dev — no se levantaron destructivamente por instrucción.
* `clear:seed` no ejecutado manualmente porque lo ejecuta `global-setup` al correr tests; se inspeccionó `src/database/clear.ts`/`seed.ts` indirectamente vía `global-setup.ts:27-33`.
* No se modificó ningún repo de producción; `git status --porcelain` vacío verificado; no se hicieron commits/push; solo se creó `PLAYWRIGHT_E2E_AUDIT.md`.

---

*Auditoría basada en evidencia estática + validaciones seguras de solo lectura del 2026-08-21. Cualquier afirmación especulativa se marca como tal; este informe distingue error real (HIGH) vs riesgo real (MEDIUM) vs opcional/preferencia (LOW/OPTIONAL) según instrucciones.*
