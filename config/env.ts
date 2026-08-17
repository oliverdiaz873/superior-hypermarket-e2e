import path from "path";

/**
 * E9.2 — Infraestructura E2E central.
 *
 * Fuente única de verdad de puertos, repos, credenciales seed, URIs de
 * aislamiento y storageStates. Nada se hardcodea fuera de aquí.
 */

export const REPOS = {
  backend: "C:/Users/dell/Desktop/backend-advanced-websites-hypermarket-express-mongodb",
  angular: "C:/Users/dell/Desktop/pre-advanced-websites-hypermarket-angular",
  next: "C:/Users/dell/Desktop/pre-advanced-websites-hypermarket-next",
  dashboard: "C:/Users/dell/Desktop/dashboard-websites-hypermarket",
} as const;

export const PORTS = {
  backend: 3000,
  next: 3001,
  angular: 4200,
  dashboard: 4201,
} as const;

export const BASE_URLS = {
  angular: `http://localhost:${PORTS.angular}`,
  next: `http://localhost:${PORTS.next}`,
  dashboard: `http://localhost:${PORTS.dashboard}`,
} as const;

export const API = `http://localhost:${PORTS.backend}/api`;

export const CREDENTIALS = {
  admin: { email: "oliver@email.com", password: "123456" },
  customer: { email: "maria@email.com", password: "123456" },
  customerAlt: { email: "carlos@email.com", password: "123456" },
} as const;

export const E2E_DB_NAME = "hypermarket_e2e";
export const E2E_MONGODB_URI = `mongodb://127.0.0.1:27017/${E2E_DB_NAME}`;

/**
 * Override de entorno para el backend E2E. Se inyecta vía `env` del webServer
 * y del spawn de clear:seed. dotenv del backend NO sobrescribe process.env,
 * por lo que estos valores ganan sin tocar `.env` ni ningún archivo del repo.
 */
export const BACKEND_E2E_ENV: Record<string, string> = {
  NODE_ENV: "test",
  PORT: String(PORTS.backend),
  MONGODB_URI: E2E_MONGODB_URI,
  JWT_SECRET: "hypermarket_e2e_secret_2026",
  JWT_EXPIRES_IN: "1h",
  CORS_ORIGIN: [
    `http://localhost:${PORTS.angular}`,
    `http://localhost:${PORTS.next}`,
    `http://localhost:${PORTS.dashboard}`,
    `http://localhost:${PORTS.backend}`,
  ].join(","),
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_DIR: ".tmp/e2e-storage",
  STORAGE_PUBLIC_BASE_URL: `http://localhost:${PORTS.backend}`,
};

export const AUTH_STATES = {
  adminDashboard: path.resolve(__dirname, "../auth/admin.dashboard.json"),
  customerAngular: path.resolve(__dirname, "../auth/customer.angular.json"),
  customerNext: path.resolve(__dirname, "../auth/customer.next.json"),
} as const;