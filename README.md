# hypermarket-superior-e2e — Harness E2E central del Hipermercado Superior

Suite Playwright que orquesta los **4 repositorios** del ecosistema con un único
`playwright.config.ts`:

| Repo | Tecnología | Puerto E2E |
|---|---|---|
| backend-advanced-websites-hypermarket-express-mongodb | Express + MongoDB | 3000 |
| pre-advanced-websites-hypermarket-next | Next.js | 3001 |
| pre-advanced-websites-hypermarket-angular | Angular + SSR | 4200 |
| dashboard-websites-hypermarket | Angular | **4201** |

> Decisión de infraestructura: el Dashboard corre en **4201** durante E2E para no
> chocar con el storefront Angular (4200). El backend E2E se arranca siempre por
> Playwright con entorno aislado (`hypermarket_e2e` + `.tmp/e2e-storage`).

## Prerrequisitos

- Node.js ≥ 22
- MongoDB corriendo en `127.0.0.1:27017` (la BD de dev `hypermarket` NO se toca)
- Chromium: `npx playwright install chromium`
- **Detener cualquier backend de dev escuchando en :3000** antes de ejecutar la
  suite (Playwright fallará a propósito si el puerto está ocupado, para
  garantizar aislamiento).

## Comandos

```bash
npm install                       # instala @playwright/test
npx playwright install chromium   # descarga el navegador
npm run e2e:smoke                 # infraestructura: setup de auth + smoke por app
npm run e2e:angular               # solo specs del storefront Angular
npm run e2e:next                  # solo specs del storefront Next
npm run e2e:dashboard             # solo specs del dashboard
npm run e2e                       # suite completa
```

## Aislamiento de datos

- El `global-setup` ejecuta el **`clear:seed` real del backend** contra la BD
  `hypermarket_e2e` (nunca la BD de dev). Gate: aborta si la URI no contiene
  `hypermarket_e2e`.
- Storage de imágenes E2E: `STORAGE_LOCAL_DIR=.tmp/e2e-storage` (dentro del repo
  backend, ignorado por git). El `storage/` de dev no se toca.
- `NODE_ENV=test` desactiva los rate-limits del backend durante E2E.
- No se modifica ningún archivo de los 4 repos.

## Estructura

```
playwright.config.ts   # 3 proyectos + setup + webServer array
config/env.ts          # puertos, repos, credenciales, URIs de aislamiento
global-setup.ts        # clear:seed E2E (gate de aislamiento)
auth/setup/            # genera storageStates (admin dashboard, customer angular/next)
helpers/admin-api.ts   # verificación del estado de negocio vía admin API
helpers/data.ts        # datos estables del seed + generadores únicos
fixtures/base.ts       # uniqueEmail, adminApi
specs/<app>/           # specs por aplicación (checkout, contact, admin, smoke)
```

## Verificación de paridad

Los specs migrados de los storefronts (`checkout`, `contact`, `admin`) conservan
las mismas assertions. Los E2E originales de cada storefront se eliminarán en
E9.6 tras confirmar cobertura equivalente.

## Deuda técnica conocida (bug N2 de carrito en los storefronts)

**Bug real de los storefronts (Next y Angular), no del harness.** La migración N2
escribe un espejo del carrito en `localStorage['carrito']` mientras el carrito
server no está sincronizado. Si un "Agregar" cae en esa ventana (race pre-`SYNC_OK`),
el item optimista se persiste al espejo mientras el server ya tiene ese item; el
siguiente `POST /api/cart/merge` **acumula cantidades** (`$inc` en el backend) →
`1+1=2`. La ventana es real pero estrecha (humano casi no la cruza; un clic
automatizado sí).

Pendiente en los repos (fuera del alcance del harness):
- `pre-advanced-websites-hypermarket-next/src/features/cart/CartContext.tsx`
- `pre-advanced-websites-hypermarket-angular/src/app/features/cart/services/cart.service.ts`
- `backend-.../src/modules/cart/services/cart.service.ts` (`mergeCart` suma) y
  `repositories/cart.repository.ts` (`applyAtomicInc` con `$inc`)

Fix propuesto: esperar `SYNC_OK` antes de permitir el add autenticado, o hacer
`mergeCart`/`addItem` con upsert absoluto (server-wins) en lugar de acumular.

**Mitigación E2E en el harness** (no oculta el defecto, documentado aquí):
`helpers/ui.ts` `clearLocalCartMirror` + `helpers/admin-api.ts`
`ensureServerCartQuantity` normalizan el carrito server a la cantidad exacta del
escenario justo antes de confirmar el pedido, para que la suite sea determinista.