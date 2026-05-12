export interface AdminAppRuntimeEnv {
  PROD?: boolean;
  VITE_APP_ENV?: string;
  VITE_ADMIN_API_BASE_URL?: string;
}

export interface AdminAppRuntimeConfig {
  apiBaseUrl: string;
}

export function loadAdminAppRuntimeConfig(
  env: AdminAppRuntimeEnv,
): AdminAppRuntimeConfig {
  const configuredBaseUrl = trimTrailingSlash(readOptionalEnv(env.VITE_ADMIN_API_BASE_URL));

  if (isProtectedAdminEnvironment(env) && !configuredBaseUrl) {
    throw new Error('VITE_ADMIN_API_BASE_URL is required in production or staging Admin App config');
  }

  return {
    apiBaseUrl: configuredBaseUrl || 'http://127.0.0.1:3000',
  };
}

export function loadBrowserAdminAppRuntimeConfig(): AdminAppRuntimeConfig {
  return loadAdminAppRuntimeConfig(import.meta.env);
}

function isProtectedAdminEnvironment(env: AdminAppRuntimeEnv): boolean {
  const appEnv = readOptionalEnv(env.VITE_APP_ENV)?.toLowerCase();

  return appEnv === 'production' || appEnv === 'staging' || env.PROD === true;
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlash(value: string | undefined): string {
  return value?.replace(/\/+$/, '') ?? '';
}
