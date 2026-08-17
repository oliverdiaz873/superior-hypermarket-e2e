import { spawnSync } from "child_process";
import { REPOS, E2E_MONGODB_URI, E2E_DB_NAME, BACKEND_E2E_ENV } from "./config/env";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * E9.2 — Aislamiento de datos E2E (gate).
 *
 * 1. Verifica que la URI apunta a la BD E2E (aborta si no).
 * 2. Ejecuta el `clear:seed` REAL del backend contra esa BD, para que cada
 *    ejecución parta de un estado reproducible (seed: 8 categorías, 184
 *    productos, 7 ofertas, inventario stock 100, 3 usuarios).
 *
 * Solo necesita MongoDB en 127.0.0.1:27017; no depende del orden con los
 * webServers.
 */
export default async function globalSetup(): Promise<void> {
  console.log("\n[E9.2 global-setup] Iniciando aislamiento E2E");

  if (!E2E_MONGODB_URI.includes(E2E_DB_NAME)) {
    throw new Error(
      `[E9.2] MONGODB_URI debe apuntar a la BD E2E "${E2E_DB_NAME}". Recibido: ${E2E_MONGODB_URI}`,
    );
  }
  console.log(`[E9.2] BD E2E: ${E2E_MONGODB_URI}`);

  const res = spawnSync(npmCmd, ["run", "clear:seed"], {
    cwd: REPOS.backend,
    env: { ...process.env, ...BACKEND_E2E_ENV },
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });

  if (res.error) {
    throw new Error(`[E9.2] clear:seed spawn falló: ${res.error.message}`);
  }
  if (res.status !== 0) {
    if (res.stdout) console.error(res.stdout);
    if (res.stderr) console.error(res.stderr);
    throw new Error(
      `[E9.2] clear:seed falló con status ${res.status}. ` +
        "¿Está MongoDB corriendo en 127.0.0.1:27017? ¿Está el repo backend con dependencias instaladas?",
    );
  }

  console.log("[E9.2] clear:seed OK — BD E2E sembrada desde cero");
}