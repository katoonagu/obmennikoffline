import {
  createMiniAppApiClient,
  createMockMiniAppApi,
  type MiniAppApi,
  type MiniAppFetch,
} from './miniAppApi.js';

export type MiniAppApiMode = 'mock' | 'api';

export interface MiniAppRuntimeEnv {
  PROD?: boolean;
  VITE_APP_ENV?: string;
  VITE_MINIAPP_API_MODE?: string;
  VITE_MINIAPP_API_BASE_URL?: string;
  VITE_MINIAPP_DEV_USER_ID?: string;
  VITE_MINIAPP_INIT_DATA_DEBUG_ENABLED?: string;
}

export interface MiniAppTelegramSource {
  Telegram?: {
    WebApp?: {
      initData?: string;
    };
  };
}

export interface MiniAppRuntimeConfig {
  mode: MiniAppApiMode;
  apiBaseUrl: string;
  devUserId: string | undefined;
  telegramInitData: string | undefined;
  showInitDataDebug: boolean;
}

export function loadMiniAppRuntimeConfig(
  env: MiniAppRuntimeEnv,
  telegramSource: MiniAppTelegramSource = {},
): MiniAppRuntimeConfig {
  const apiBaseUrl = trimTrailingSlash(readOptionalEnv(env.VITE_MINIAPP_API_BASE_URL));
  const explicitMode = readOptionalEnv(env.VITE_MINIAPP_API_MODE);
  const mode = resolveApiMode(explicitMode, apiBaseUrl);
  const telegramInitData = readTelegramInitData(telegramSource);
  const requestedDevUserId = readOptionalEnv(env.VITE_MINIAPP_DEV_USER_ID);
  const showProtectedInitDataDebug =
    readOptionalEnv(env.VITE_MINIAPP_INIT_DATA_DEBUG_ENABLED) === 'true';
  const devUserId = telegramInitData
    ? undefined
    : requestedDevUserId;
  const isProtectedEnvironment = isProtectedMiniAppEnvironment(env);

  if (mode === 'api' && !apiBaseUrl) {
    throw new Error('VITE_MINIAPP_API_BASE_URL is required when Mini App API mode is api');
  }

  validateProtectedMiniAppRuntime({
    env,
    mode,
    apiBaseUrl,
    requestedDevUserId,
    telegramInitData,
    requireTelegramInitData: true,
  });

  return {
    mode,
    apiBaseUrl: mode === 'api' ? apiBaseUrl : '',
    devUserId,
    telegramInitData,
    showInitDataDebug: Boolean(telegramInitData) && (
      !isProtectedEnvironment || showProtectedInitDataDebug
    ),
  };
}

export function validateMiniAppPublicBuildEnv(env: MiniAppRuntimeEnv): void {
  const apiBaseUrl = trimTrailingSlash(readOptionalEnv(env.VITE_MINIAPP_API_BASE_URL));
  const explicitMode = readOptionalEnv(env.VITE_MINIAPP_API_MODE);
  const mode = resolveApiMode(explicitMode, apiBaseUrl);

  validateProtectedMiniAppRuntime({
    env,
    mode,
    apiBaseUrl,
    requestedDevUserId: readOptionalEnv(env.VITE_MINIAPP_DEV_USER_ID),
    telegramInitData: undefined,
    requireTelegramInitData: false,
  });
}

export function readTelegramInitData(
  telegramSource: MiniAppTelegramSource,
): string | undefined {
  return readOptionalEnv(telegramSource.Telegram?.WebApp?.initData);
}

export function createMiniAppApiFromRuntimeConfig(
  config: MiniAppRuntimeConfig,
  options: {
    fetch?: MiniAppFetch;
  } = {},
): MiniAppApi {
  if (config.mode === 'mock') {
    return createMockMiniAppApi();
  }

  return createMiniAppApiClient({
    baseUrl: config.apiBaseUrl,
    devUserId: config.devUserId,
    telegramInitData: config.telegramInitData,
    fetch: options.fetch,
  });
}

export function loadBrowserMiniAppRuntimeConfig(): MiniAppRuntimeConfig {
  return loadMiniAppRuntimeConfig(
    import.meta.env,
    typeof window === 'undefined' ? {} : window as MiniAppTelegramSource,
  );
}

function resolveApiMode(
  explicitMode: string | undefined,
  apiBaseUrl: string,
): MiniAppApiMode {
  if (!explicitMode) {
    return apiBaseUrl ? 'api' : 'mock';
  }

  if (explicitMode !== 'mock' && explicitMode !== 'api') {
    throw new Error('VITE_MINIAPP_API_MODE must be either mock or api');
  }

  return explicitMode;
}

function validateProtectedMiniAppRuntime(input: {
  env: MiniAppRuntimeEnv;
  mode: MiniAppApiMode;
  apiBaseUrl: string;
  requestedDevUserId: string | undefined;
  telegramInitData: string | undefined;
  requireTelegramInitData: boolean;
}): void {
  if (!isProtectedMiniAppEnvironment(input.env)) {
    return;
  }

  if (input.mode !== 'api') {
    throw new Error('Production Mini App must use api mode');
  }

  if (!input.apiBaseUrl) {
    throw new Error('VITE_MINIAPP_API_BASE_URL is required when Mini App API mode is api');
  }

  if (input.requestedDevUserId) {
    throw new Error('VITE_MINIAPP_DEV_USER_ID is not allowed in production or staging Mini App config');
  }

  if (input.requireTelegramInitData && !input.telegramInitData) {
    throw new Error('Telegram WebApp initData is required in production or staging Mini App config');
  }
}

function isProtectedMiniAppEnvironment(env: MiniAppRuntimeEnv): boolean {
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
