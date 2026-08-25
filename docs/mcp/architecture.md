# Arquitectura MCP - Modalidad A vs B

Repositorio: `C:\Users\dell\Desktop\superior-hypermarket-e2e`

## Modalidad A - Playwright Test (Regresión)

```
Playwright Test (specs/ 17 tests)
   |
Playwright (playwright.config.ts:16 defineConfig)
   |
Browser (Chromium devices["Desktop Chrome"]:41)
   |
Application (webServer[4] playwright.config.ts:56: backend 3000/health + Angular 4200 + Next 3001 + Dashboard 4201)
```

**Responsabilidad:** regresión determinista `workers:1` `playwright.config.ts:19` sobre `hypermarket_e2e` `config/env.ts:48`, assertions `expect` formalizadas (`specs/angular/checkout.spec.ts:80 toHaveText Pendiente`), CI `e2e.yml:191` `mongo:7` `npx tsc --noEmit + npm run e2e` `trace retain-on-failure`, Quality Gate `e2e/17-tests` required `docs/ci-cd/e2e-quality-gate.md:82`.

**Estado:** `global-setup.ts:20 gate hypermarket_e2e` + `clear:seed` idempotente 8cats/184prods, `fixtures/base.ts:22 adminApi worker` aislado `AUTH_STATES` `config/env.ts:74`, `helpers/admin-api.ts:219 assertAdminOrderState` verifica negocio.

## Modalidad B - Playwright MCP (Exploración)

```
AI Model (LLM)
   |
MCP Client (VS Code/Cursor/Claude Code)
   |
Playwright MCP Server (npx @playwright/mcp@latest STDIO, mcp.config.json:1)
   |
Playwright (browserName chromium)
   |
Chromium (headed por defecto, --headless opcional)
   |
Application (http://localhost:3000/4200/3001/4201 entorno E2E existente serializado)
```

**Responsabilidad:** exploración `mcp/prompts/search.md`, investigación `hydration html[data-hydrated]`, debugging `cold-start 404`, discovery `Search` no cubierto, verificación con evidencia screenshot/snapshot.

Ambas **complementarias**, no sustitutivas. `specs/` no contaminado por `mcp/`.

## Ciclo Observe -> Reason -> Act -> Observe

```
Navigate (browser_navigate {url: "http://localhost:4200"})
   |
Snapshot (browser_snapshot -> a11y tree [ref=e5 textbox "Buscar"])
   |
Reason (LLM interpreta: buscador ref e5)
   |
Act (browser_type {ref:"e5", text:"Tablet TCL"})
   |
Snapshot nuevo (updated state, ref temporal)
   |
Verificar (browser_snapshot, screenshot)
   |
Continuar / Documentar hallazgo
```

**Principios:**

1. **Accessibility Snapshot representa estado temporal** - `playwright.dev/mcp/snapshots` - cada `browser_snapshot` devuelve árbol accesibilidad con `ref=e12` en ese instante.
2. **Refs temporales** - `ref=e12` válido solo para snapshot actual; tras `navigate`/`click`/`type` el DOM cambia, refs antiguas inválidas. No reusar `ref` de snapshot previo después de mutación importante. Re-`snapshot` siempre antes de `act`.
3. **No persistir refs** como selectors permanentes `specs/*` - convertir a `getByRole` `getByLabel` mantenible `playwright.dev/mcp/capabilities#testing` `browser_generate_locator`.

## Aislamiento

Fase minimalista **serializada** sobre `hypermarket_e2e` `.tmp/e2e-storage` `config/env.ts:69`. No `hypermarket_mcp`, no `MCP_PORTS`, no `mcp-setup.ts`. Riesgo `global-setup clear:seed` solo si MCP y E2E concurrentes (evitar `npm run e2e` mientras MCP activo, respeta `e2e.yml:30 concurrency`).

## Configuración MCP real

`mcp.config.json:1` JSON `{ capabilities:["core"], browser:{browserName:"chromium"}, outputDir:".tmp/mcp-output" }` - schema `playwright.dev/mcp/configuration/options#schema` `capabilities` `browser` `server` `outputDir` `timeouts`. No `defineConfig`, no `projects`, no `globalSetup`.

## Seguridad

`auth/*.json` gitignoreado `.gitignore:5`, `mcp.config.json:4` no contiene `JWT`/`cookies`/`storageState`. Screenshots `.tmp/mcp-output` gitignoreado.

## Flujo MCP -> Playwright Test

```
MCP exploration (core)
   |
Hallazgo (Search no resultados)
   |
Evidencia (snapshot + screenshot)
   |
Análisis humano
   |
Decisión (¿merece test?)
   |
Playwright Test (specs/search/smoke.spec.ts getByRole)
   |
CI e2e/17-tests
```
