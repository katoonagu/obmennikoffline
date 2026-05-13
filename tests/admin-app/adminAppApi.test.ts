import { describe, expect, it, vi } from 'vitest';
import {
  createAdminAppApiClient,
  parseAdminApiErrorMessage,
} from '../../src/admin-app/adminAppApi.js';
import { sampleAdminOrder } from './adminAppFixtures.js';

const TOKEN = 'admin_session_v1.payload.signature';
const TX_ID = 'A'.repeat(64);

describe('Admin App API client', () => {
  it('logs in and calls manager endpoints with the admin session token', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (url === 'https://api.example.test/api/admin/session') {
        expect(init).toMatchObject({ method: 'POST' });
        expect(body).toEqual({
          username: 'manager-1',
          password: 'strong-password',
        });
        return jsonResponse({
          token: TOKEN,
          admin: {
            id: 'admin-1',
            username: 'manager-1',
            role: 'manager',
          },
        });
      }

      expect(init?.headers).toMatchObject({
        authorization: `Bearer ${TOKEN}`,
      });

      if (url === 'https://api.example.test/api/admin/orders/active?limit=25') {
        return jsonResponse({ orders: [sampleAdminOrder] });
      }

      if (url === 'https://api.example.test/api/admin/orders/history?limit=10') {
        return jsonResponse({
          orders: [
            {
              ...sampleAdminOrder,
              status: 'completed',
              completedAt: '2026-05-11T10:30:00.000Z',
            },
          ],
        });
      }

      if (url === 'https://api.example.test/api/admin/orders/E74737') {
        return jsonResponse({ order: sampleAdminOrder });
      }

      if (url === 'https://api.example.test/api/admin/orders/E74737/status') {
        expect(body).toEqual({
          status: 'manager_review',
          comment: 'needs AML review',
        });
        return jsonResponse({ order: sampleAdminOrder });
      }

      if (url === 'https://api.example.test/api/admin/orders/E74737/manual-crypto-payout') {
        expect(body).toEqual({
          txId: TX_ID,
          comment: 'sent from custody wallet',
        });
        return jsonResponse({ order: sampleAdminOrder });
      }

      if (url === 'https://api.example.test/api/address-pool/import') {
        expect(body).toEqual({
          rows: [
            {
              network: 'TRON',
              asset: 'USDT',
              derivationIndex: 42,
              address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
            },
          ],
        });
        return jsonResponse({ count: 1 }, 201);
      }

      throw new Error(`unexpected url: ${url}`);
    });
    const api = createAdminAppApiClient({
      baseUrl: 'https://api.example.test/',
      fetch,
    });

    await expect(api.login({
      username: 'manager-1',
      password: 'strong-password',
    })).resolves.toMatchObject({
      token: TOKEN,
      admin: {
        username: 'manager-1',
      },
    });
    await expect(api.listActiveOrders({ token: TOKEN, limit: 25 })).resolves.toEqual([
      sampleAdminOrder,
    ]);
    await expect(api.listHistoryOrders({ token: TOKEN, limit: 10 })).resolves.toEqual([
      {
        ...sampleAdminOrder,
        status: 'completed',
        completedAt: '2026-05-11T10:30:00.000Z',
      },
    ]);
    await expect(api.getOrder({ token: TOKEN, publicId: 'E74737' })).resolves.toEqual(
      sampleAdminOrder,
    );
    await expect(api.updateOrderStatus({
      token: TOKEN,
      publicId: 'E74737',
      status: 'manager_review',
      comment: 'needs AML review',
    })).resolves.toEqual(sampleAdminOrder);
    await expect(api.recordManualCryptoPayout({
      token: TOKEN,
      publicId: 'E74737',
      txId: TX_ID,
      comment: 'sent from custody wallet',
    })).resolves.toEqual(sampleAdminOrder);
    await expect(api.importAddressPool({
      token: TOKEN,
      rows: [
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 42,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
      ],
    })).resolves.toEqual({ count: 1 });
  });

  it('maps known backend errors to manager-facing Russian copy', () => {
    expect(parseAdminApiErrorMessage({
      error: 'admin_auth_invalid',
      message: 'admin authorization token is invalid',
    })).toBe('Сессия администратора недействительна. Войдите заново.');
    expect(parseAdminApiErrorMessage({
      error: 'validation_error',
      message: 'manual crypto payout can only be recorded for BUY_USDT orders',
    })).toBe('Tx hash можно записать только для BUY-заявки.');
    expect(parseAdminApiErrorMessage({
      error: 'not_found',
      message: 'order not found',
    })).toBe('Заявка не найдена.');
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
