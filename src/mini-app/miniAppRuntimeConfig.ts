import {
  createMiniAppApiClient,
  createMockMiniAppApi,
  type MiniAppApi,
  type MiniAppFetch,
} from './miniAppApi.js';

export type MiniAppApiMode = 'mock' | 'api';

export interface MiniAppRuntimeEnv {
  VITE_MINIAPP_API_MODE?: string;
  VITE_MINIAPP_API_BASE_URL?: string;
  VITE_MINIAPP_DEV_USER_ID?: string;
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
}

export function loadMiniAppRuntimeConfig(
  env: MiniAppRuntimeEnv,
  telegramSource: MiniAppTelegramSource = {},
): MiniAppRuntimeConfig {
  const apiBaseUrl = trimTrailingSlash(readOptionalEnv(env.VITE_MINIAPP_API_BASE_URL));
  const explicitMode = readOptionalEnv(env.VITE_MINIAPP_API_MODE);
  const mode = resolveApiMode(explicitMode, apiBaseUrl);
  const telegramInitData = readTelegramInitData(telegramSource);
  const devUserId = telegramInitData
    ? undefined
    : readOptionalEnv(env.VITE_MINIAPP_DEV_USER_ID);

  if (mode === 'api' && !apiBaseUrl) {
    throw new Error('VITE_MINIAPP_API_BASE_URL is required when Mini App API mode is api');
  }

  return {
    mode,
    apiBaseUrl: mode === 'api' ? apiBaseUrl : '',
    devUserId,
    telegramInitData,
  };
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

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlash(value: string | undefined): string {
  return value?.replace(/\/+$/, '') ?? '';
}
