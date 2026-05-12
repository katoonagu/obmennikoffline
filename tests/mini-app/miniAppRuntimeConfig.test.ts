import { describe, expect, it, vi } from 'vitest';
import {
  createMiniAppApiFromRuntimeConfig,
  loadMiniAppRuntimeConfig,
  readTelegramInitData,
} from '../../src/mini-app/miniAppRuntimeConfig.js';

describe('Mini App runtime config and auth bridge', () => {
  it('keeps mock mode as the safe default for design and tests', async () => {
    const config = loadMiniAppRuntimeConfig({});
    const api = createMiniAppApiFromRuntimeConfig(config);

    expect(config).toEqual({
      mode: 'mock',
      apiBaseUrl: '',
      devUserId: undefined,
      telegramInitData: undefined,
    });
    await expect(api.listActiveOrders()).resolves.toHaveLength(1);
  });

  it('uses VITE_MINIAPP_API_BASE_URL to select local API mode with dev user fallback', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({});
      expect(url).toBe('http://127.0.0.1:3000/api/orders/active?userId=dev-user-1');
      return jsonResponse({ orders: [] });
    });
    const config = loadMiniAppRuntimeConfig({
      VITE_MINIAPP_API_BASE_URL: ' http://127.0.0.1:3000/ ',
      VITE_MINIAPP_DEV_USER_ID: ' dev-user-1 ',
    });
    const api = createMiniAppApiFromRuntimeConfig(config, { fetch });

    expect(config).toEqual({
      mode: 'api',
      apiBaseUrl: 'http://127.0.0.1:3000',
      devUserId: 'dev-user-1',
      telegramInitData: undefined,
    });
    await api.listActiveOrders();
  });

  it('lets explicit mock mode override a configured API base URL', () => {
    const config = loadMiniAppRuntimeConfig({
      VITE_MINIAPP_API_MODE: 'mock',
      VITE_MINIAPP_API_BASE_URL: 'http://127.0.0.1:3000',
      VITE_MINIAPP_DEV_USER_ID: 'dev-user-1',
    });

    expect(config.mode).toBe('mock');
    expect(createMiniAppApiFromRuntimeConfig(config)).toBeTruthy();
  });

  it('uses Telegram WebApp initData authorization instead of dev user fallback', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:3000/api/orders/active');
      expect(init?.headers).toMatchObject({
        authorization: 'tma signed-init-data',
      });
      return jsonResponse({ orders: [] });
    });
    const config = loadMiniAppRuntimeConfig(
      {
        VITE_MINIAPP_API_BASE_URL: 'http://127.0.0.1:3000',
        VITE_MINIAPP_DEV_USER_ID: 'dev-user-1',
      },
      {
        Telegram: {
          WebApp: {
            initData: ' signed-init-data ',
          },
        },
      },
    );
    const api = createMiniAppApiFromRuntimeConfig(config, { fetch });

    expect(config.devUserId).toBeUndefined();
    expect(config.telegramInitData).toBe('signed-init-data');
    await api.listActiveOrders();
  });

  it('rejects unsafe API mode configuration', () => {
    expect(() => loadMiniAppRuntimeConfig({
      VITE_MINIAPP_API_MODE: 'api',
    })).toThrow('VITE_MINIAPP_API_BASE_URL is required when Mini App API mode is api');
    expect(() => loadMiniAppRuntimeConfig({
      VITE_MINIAPP_API_MODE: 'live',
    })).toThrow('VITE_MINIAPP_API_MODE must be either mock or api');
  });

  it('reads Telegram initData only from the Telegram WebApp bridge', () => {
    expect(readTelegramInitData({})).toBeUndefined();
    expect(readTelegramInitData({
      Telegram: {
        WebApp: {
          initData: '  ',
        },
      },
    })).toBeUndefined();
    expect(readTelegramInitData({
      Telegram: {
        WebApp: {
          initData: 'query_id=abc&hash=def',
        },
      },
    })).toBe('query_id=abc&hash=def');
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
