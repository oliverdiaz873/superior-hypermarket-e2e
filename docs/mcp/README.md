# Playwright MCP - Modalidad B Exploratoria

Repositorio: `C:\Users\dell\Desktop\superior-hypermarket-e2e` | E2E harness central `hypermarket-superior-e2e`

> **Modalidad B complementaria**, no reemplazo de **Modalidad A** (`specs/` 17 tests deterministas `playwright.config.ts:16`).

## 1. Qué es Playwright MCP

Servidor MCP (`Model Context Protocol`) especializado en navegador: `@playwright/mcp` expone herramientas `browser_navigate`, `browser_snapshot` (a11y tree), `browser_click`, `browser_type`, `browser_take_screenshot` para que una IA interactúe con páginas reales. Ver `https://playwright.dev/mcp/installation`.

## 2. Diferencia Playwright Test vs Playwright MCP

| Aspecto | Playwright Test (Modalidad A) | Playwright MCP (Modalidad B) |
|---|---|---|
| Fichero | `playwright.config.ts:16` `defineConfig` `projects` `webServer[4]` `globalSetup:./global-setup` | `mcp.config.json:1` JSON `{capabilities, browser}` |
| Motor | `playwright test` runner | `npx @playwright/mcp@latest` MCP Server STDIO |
| Cliente | CLI / CI `e2e.yml:191` | MCP Client (VS Code, Cursor, Claude Code) |
| Objetivo | Regresión determinista `workers:1` `hypermarket_e2e` | Exploración/investigación/debugging |
| CI | Sí `e2e/17-tests` required `main-protection` | No |
| Assertions | `expect` formalizadas | Snapshot exploratorio |

## 3. Arquitectura MCP

```
MCP Client (VS Code/Cursor/Claude)
   |
npx @playwright/mcp@latest (MCP Server)
   |
Playwright
   |
Chromium (headed por defecto, --headless opcional)
   |
Aplicación (http://localhost:3000/4200/3001/4201)
```

## 4. Playwright MCP NO utiliza `playwright.config.ts`

`@playwright/mcp` **no lee** `playwright.config.ts:16`. Su configuración es **JSON** vía `--config` (`mcp.config.json:1`). No usa `defineConfig`, `projects`, `webServer`, `workers`, `globalSetup`.

## 5. Configuración JSON

`mcp.config.json:1` minimalista actual:

```json
{
  "capabilities": ["core"],
  "browser": {
    "browserName": "chromium"
  },
  "outputDir": ".tmp/mcp-output"
}
```

`capabilities: ["core"]` incluye navegación, snapshot, click, type, screenshot (`playwright.dev/mcp/capabilities#core`). `browserName: chromium` (default). `outputDir: .tmp/mcp-output` ya gitignoreado `.gitignore:6` `.tmp/`.

Config avanzada opcional vía `playwright.dev/mcp/configuration/options`: `browser.isolated`, `userDataDir`, `storageState`, `server.port`, `capabilities: ["storage","network"]` solo si necesario, no por defecto.

## 6. Registro en MCP Client

Estándar `mcpServers` JSON (ver `playwright.dev/mcp/installation`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

### VS Code
`code --add-mcp '{"name":"playwright","command":"npx","args":["@playwright/mcp@latest"]}'` o `settings.json` `mcpServers`.

### Cursor
`Cursor Settings -> MCP -> Add new MCP Server` `command: npx @playwright/mcp@latest`.

### Claude Code
`claude mcp add playwright npx @playwright/mcp@latest`.

### Con config del proyecto
Si el cliente requiere config del proyecto:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--config", "mcp.config.json"]
    }
  }
}
```

Equivalente env `PLAYWRIGHT_MCP_CONFIG=mcp.config.json`.

## 7. Capacidades actuales

Actual `capabilities: ["core"]` **únicamente**. No `network`, `storage`, `testing`, `vision`, `pdf`, `devtools` por mínimo privilegio (`/mcp/capabilities#why-capabilities-exist`). Habilitar solo si caso lo exige (ej. `storage` para auth futura).

## 8. Exploración inicial READ-ONLY

Casos `mcp/prompts/search.md` navegan `http://localhost:4200` storefront Angular sin auth, sin mutaciones (no `DELETE/CANCEL/PURCHASE`). No modifican `hypermarket_e2e` `global-setup.ts:27 clear:seed`.

## 9. Entorno E2E compartido serializado

MCP reutiliza **mismo entorno** `config/env.ts:48 hypermarket_e2e` `PORTS 3000/4200/3001/4201` `Mongo 27017` de forma **serializada** (`workers:1` `playwright.config.ts:19`), no `MCP_PORTS`/`hypermarket_mcp` separados en fase minimalista. No concurrente con CI `e2e.yml:30 concurrency`.

## 10. Quality Gate

MCP **no forma parte** `e2e/17-tests` `lint-test-build` `main-protection` `docs/ci-cd/e2e-quality-gate.md:82` required checks. No publica Commit Status. Futuro `mcp.yml` manual `workflow_dispatch` no `pull_request`.

## 11. No reemplaza 17 tests

Suite `specs/` 17 tests (`npx playwright test --list` `angular 8 + next 2 + dashboard 7` incl. `setup 3`) permanece regresión CI. MCP descubre escenarios que **luego** pueden convertirse en `Playwright Test` determinista (`MCP -> Hallazgo -> Playwright Test -> CI`).

## Referencias

- `playwright.dev/mcp/installation`
- `playwright.dev/mcp/capabilities`
- `playwright.dev/mcp/configuration/options`
- `github.com/microsoft/playwright-mcp`
