import { describe, expect, it, vi } from 'vitest';
import {
  createMiniAppApiClient,
  createMockMiniAppApi,
  miniAppMockFixtures,
} from '../../src/mini-app/miniAppApi.js';

const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';

describe('Mini App API integration contract', () => {
  it('loads rates and active orders through the public route contracts', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/api/rates/usdt-rub')) {
        return jsonResponse({
          rates: {
            pair: 'USDT_RUB',
            buyRate: '76.850000',
            sellRate: '76.250000',
          },
        });
      }

      if (url.endsWith('/api/orders/active?userId=telegram-user-1&limit=5')) {
        return jsonResponse({ orders: [miniAppMockFixtures.sellOrder] });
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const api = createMiniAppApiClient({
      baseUrl: 'https://api.example.test',
      devUserId: 'telegram-user-1',
      fetch,
    });

    await expect(api.loadRates()).resolves.toEqual({
      buyRate: '76.850000',
      sellRate: '76.250000',
    });
    await expect(api.listActiveOrders({ limit: 5 })).resolves.toEqual([
      miniAppMockFixtures.sellOrder,
    ]);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/api/rates/usdt-rub',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/api/orders/active?userId=telegram-user-1&limit=5',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates BUY and SELL requests without server-owned quote or wallet fields', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));

      if (url.endsWith('/api/orders/buy')) {
        expect(body).toEqual({
          userId: 'telegram-user-1',
          customerLastName: 'Ivanov',
          customerFirstName: 'Ivan',
          customerMiddleName: 'Ivanovich',
          amountRub: '200000.00',
          clientPayoutAddress: PAYOUT_ADDRESS,
        });
        expect(body).not.toHaveProperty('amountUsdt');
        expect(body).not.toHaveProperty('rateSnapshot');
        expect(body).not.toHaveProperty('depositAddress');
        return jsonResponse({ order: miniAppMockFixtures.buyOrder }, 201);
      }

      if (url.endsWith('/api/orders/sell')) {
        expect(body).toEqual({
          userId: 'telegram-user-1',
          customerLastName: 'Ivanov',
          customerFirstName: 'Ivan',
          customerMiddleName: 'Ivanovich',
          amountUsdt: '5000.000000',
        });
        expect(body).not.toHaveProperty('amountRub');
        expect(body).not.toHaveProperty('rateSnapshot');
        expect(body).not.toHaveProperty('depositAddress');
        return jsonResponse({ order: miniAppMockFixtures.sellOrder }, 201);
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const api = createMiniAppApiClient({
      baseUrl: '',
      devUserId: 'telegram-user-1',
      fetch,
    });

    await expect(api.createBuyOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountRub: '200000.00',
      clientPayoutAddress: PAYOUT_ADDRESS,
    })).resolves.toEqual(miniAppMockFixtures.buyOrder);
    await expect(api.createSellOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountUsdt: '5000.000000',
    })).resolves.toEqual(miniAppMockFixtures.sellOrder);
  });

  it('uses Telegram initData authorization instead of the local dev user fallback', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'tma signed-init-data',
      });
      return jsonResponse({ orders: [] });
    });
    const api = createMiniAppApiClient({
      baseUrl: '',
      devUserId: 'local-user-1',
      telegramInitData: 'signed-init-data',
      fetch,
    });

    await api.listActiveOrders();

    expect(fetch).toHaveBeenCalledWith(
      '/api/orders/active',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects responses that drift from backend DTO schemas', async () => {
    const api = createMiniAppApiClient({
      baseUrl: '',
      fetch: vi.fn(async () => jsonResponse({
        rates: {
          pair: 'USDT_RUB',
          buyRate: '76.85',
          sellRate: '76.250000',
        },
      })),
    });

    await expect(api.loadRates()).rejects.toThrow(
      'api response contract violation',
    );
  });

  it('provides contract-valid mock fixtures for offline frontend development', async () => {
    const api = createMockMiniAppApi();

    await expect(api.loadRates()).resolves.toEqual({
      buyRate: '76.850000',
      sellRate: '76.250000',
    });
    await expect(api.listActiveOrders()).resolves.toEqual([
      miniAppMockFixtures.sellOrder,
    ]);
    await expect(api.getOrder('E00001')).resolves.toEqual(
      miniAppMockFixtures.sellOrder,
    );
    await expect(api.createBuyOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountRub: '200000.00',
      clientPayoutAddress: PAYOUT_ADDRESS,
    })).resolves.toMatchObject({
      direction: 'BUY_USDT',
      depositAddress: null,
      clientPayoutAddress: PAYOUT_ADDRESS,
      status: 'awaiting_office_visit',
    });
    await expect(api.createSellOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountUsdt: '5000.000000',
    })).resolves.toMatchObject({
      direction: 'SELL_USDT',
      depositAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      clientPayoutAddress: null,
        status: 'awaiting_deposit',
      });
  });

  it('loads profile customer FIO used to prefill new order forms', async () => {
    const api = createMiniAppApiClient({
      baseUrl: '',
      devUserId: 'telegram-user-1',
      fetch: vi.fn(async () => jsonResponse({
        profile: {
          ...miniAppMockFixtures.profile,
          customer: {
            lastName: 'Ivanov',
            firstName: 'Ivan',
            middleName: 'Ivanovich',
          },
        },
      })),
    });

    await expect(api.getProfile()).resolves.toMatchObject({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
    });
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
