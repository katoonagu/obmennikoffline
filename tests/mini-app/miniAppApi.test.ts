import { describe, expect, it, vi } from 'vitest';
import {
  createMiniAppApiClient,
  createMockMiniAppApi,
  miniAppMockFixtures,
} from '../../src/mini-app/miniAppApi.js';

const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';

describe('Mini App API integration contract', () => {
  it('loads rates, active orders, and history through the public route contracts', async () => {
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

      if (url.endsWith('/api/orders/history?userId=telegram-user-1&limit=5')) {
        return jsonResponse({ orders: [miniAppMockFixtures.buyOrder] });
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
    await expect(api.listHistoryOrders({ limit: 5 })).resolves.toEqual([
      miniAppMockFixtures.buyOrder,
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
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://api.example.test/api/orders/history?userId=telegram-user-1&limit=5',
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

  it('surfaces known backend errors as useful Mini App messages', async () => {
    const api = createMiniAppApiClient({
      baseUrl: '',
      devUserId: 'telegram-user-1',
      fetch: vi.fn(async () => jsonResponse({
        error: 'address_pool_unavailable',
        message: 'no available TRON deposit addresses',
      }, 409)),
    });

    await expect(api.createSellOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountUsdt: '5000.000000',
    })).rejects.toThrow('Нет свободных TRC-20 адресов');
  });

  it('keeps mock mode empty until the user creates orders', async () => {
    const api = createMockMiniAppApi();

    await expect(api.loadRates()).resolves.toEqual({
      buyRate: '76.850000',
      sellRate: '76.250000',
    });
    await expect(api.listActiveOrders()).resolves.toEqual([]);
    await expect(api.listHistoryOrders()).resolves.toEqual([]);
    await expect(api.getOrder('E00001')).rejects.toThrow('order not found');
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
    const firstSellOrder = await api.createSellOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountUsdt: '5000.000000',
    });
    const secondSellOrder = await api.createSellOrder({
      customer: {
        lastName: 'Ivanov',
        firstName: 'Ivan',
        middleName: 'Ivanovich',
      },
      amountUsdt: '4567.000000',
    });

    expect(firstSellOrder).toMatchObject({
      direction: 'SELL_USDT',
      clientPayoutAddress: null,
      status: 'awaiting_deposit',
    });
    expect(secondSellOrder).toMatchObject({
      direction: 'SELL_USDT',
      clientPayoutAddress: null,
      status: 'awaiting_deposit',
    });
    expect(firstSellOrder.depositAddress).toMatch(/^T[A-Za-z0-9]{33}$/);
    expect(secondSellOrder.depositAddress).toMatch(/^T[A-Za-z0-9]{33}$/);
    expect(secondSellOrder.depositAddress).not.toBe(firstSellOrder.depositAddress);
    await expect(api.listActiveOrders()).resolves.toHaveLength(3);
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
