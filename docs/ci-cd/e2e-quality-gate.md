# E2E Quality Gate

## Objetivo

Garantizar que ningún cambio en `superior-hypermarket-api` (y progresivamente en `storefront-angular`, `storefront-next`, `dashboard`) se integre en `main` sin validar los 17 tests E2E de integración contra el código exacto propuesto en el Pull Request, no contra `main`.

Resuelve la limitación inicial: el workflow `e2e.yml` en `superior-hypermarket-e2e` solo se disparaba con cambios en ese repo, por lo que un `PR` en `api` podía mergearse sin E2E.

## Arquitectura

```
PR api (head_sha) → trigger-e2e.yml (api) → GitHub App → workflow_dispatch → E2E checkout api@head_sha → MongoDB 7 → 4 webServers → 17 E2E → Commit Status e2e/17-tests → Branch Protection
```

* `superior-hypermarket-api/.github/workflows/trigger-e2e.yml` — job delgado `pull_request` que dispara el E2E central.
* `superior-hypermarket-e2e/.github/workflows/e2e.yml` — `workflow_dispatch` con `consumer_repo/head_sha`, checkout, validación, E2E y publicación de status.
* `superior-hypermarket-e2e` permanece repositorio central de los 17 tests (no se duplican).
* `E2E_REPOS_ROOT: ${{ github.workspace }}/repos` + `path: repos/...` mantiene todos los `checkout` dentro de `GITHUB_WORKSPACE`.

## Head SHA

Se utiliza `github.event.pull_request.head.sha` en `trigger-e2e.yml`:

```yaml
-f inputs[head_sha]=${{ github.event.pull_request.head.sha }}
```

No se utiliza `github.sha` porque en `pull_request` ese SHA es el merge commit `refs/pull/123/merge` generado por GitHub, no el commit del PR. El E2E debe probar el `head` exacto.

## Checkout

`e2e.yml` hace:

```yaml
repository: ${{ inputs.consumer_repo }}
ref: ${{ inputs.head_sha }}
path: repos/superior-hypermarket-api
```

y valida inmediatamente:

```bash
ACTUAL=$(git -C repos/superior-hypermarket-api rev-parse HEAD)
[ "$ACTUAL" = "${{ inputs.head_sha }}" ] || exit 1
```

Si el SHA no coincide, el job falla. `push`/`pull_request` normales sin `head_sha` usan `repository: oliverdiaz873/superior-hypermarket-api` sin `ref` (main).

## Commit Status

El E2E publica sobre el `head_sha` del PR consumidor:

```
POST /repos/{consumer_repo}/statuses/{head_sha}
context: e2e/17-tests
state: pending → success (17/17) / failure
target_url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
description: E2E 17 tests running (PR #n)
```

`pending` al iniciar con `GitHub App` token, `success`/`failure` con `if: always() && inputs.head_sha != ''` al finalizar. El `target_url` apunta al run de `superior-hypermarket-e2e`.

## GitHub App

`superior-hypermarket-e2e-dispatch` — permisos mínimos:

* `Metadata: Read`
* `Contents: Read`
* `Actions: Write` (para `workflow_dispatch`)
* `Commit statuses: Read & Write`

Instalada solo en `superior-hypermarket-api` y `superior-hypermarket-e2e` (PoC). Credenciales:

* `E2E_APP_ID` → variable `vars`
* `E2E_APP_PRIVATE_KEY` → secret `secrets`

Token efímero vía `actions/create-github-app-token@v1`, nunca hardcodeado ni impreso. No usa PAT. Evita `pull_request_target`.

## Required Checks

`superior-hypermarket-api` `Ruleset main-protection` `enforcement: active`:

* `Require a pull request before merging: ON` `1 approval`
* `Require status checks: e2e/17-tests` (App, `integration_id: 4686140`) + `lint-test-build` (GitHub Actions, `15368`)
* `Require branches to be up to date: ON` `strict: true`
* `Block force pushes: ON`

Sin `success` en `e2e/17-tests`, el PR no puede mergearse.

## Ejecución local

```bash
npm ci
npx playwright install chromium
npm run e2e              # 17 tests, workers:1
npm run e2e:smoke        # setup + smoke
npx playwright test specs/next/checkout.spec.ts --project=next-storefront
```

`playwright.config.ts` `workers:1`, `retries: 2 en CI`, `webServer` levanta `api:3000/health`, `angular:4200`, `next:3001`, `dashboard:4201` con `E2E_DISABLE_AUTH_RATE_LIMIT=true` solo en E2E.

## Troubleshooting

* **429 Too Many Requests** — `POST /api/auth/login` limitado `10/15m` en prod. En E2E se usa `E2E_DISABLE_AUTH_RATE_LIMIT=true` en `BACKEND_E2E_ENV` (`e2e/config/env.ts`), que hace bypass solo en `authRateLimit` (`api/src/modules/auth/routes/auth.routes.ts`). Prod permanece con límite.
* **Next 404 durante cold start** — `auth/setup` reintenta `5×5s` `page.goto /es/login` hasta `status <400` y `heading 404` desaparezca, luego `getByLabel('Correo electrónico')`.
* **selector strict violation** — `specs/next/checkout.spec.ts` usa `getByRole('banner').getByRole('button', {name: 'Cerrar sesión'})` scoped, no `nth()`.
* **webServer timeout** — frontends `timeout: 180_000` (Next/Angular), backend `60_000`.
* **head_sha mismatch** — `Validate SHA` compara `git rev-parse HEAD` vs `inputs.head_sha`, falla si no coincide.
* **e2e/17-tests failure** — revisar `target_url` del status → run E2E → `test-results`/`playwright-report` artifacts.

## Seguridad

* Secrets en `GitHub Secrets`, `E2E_APP_PRIVATE_KEY` nunca en Git, `E2E_DISABLE_AUTH_RATE_LIMIT` solo en `BACKEND_E2E_ENV` E2E, prod sin bypass.
* No almacenar `ghp_/github_pat_` en código, no usar `force push`, `auth/*.json` gitignoreado.
