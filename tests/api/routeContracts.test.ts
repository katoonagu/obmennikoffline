import { describe, expect, it } from 'vitest';
import {
  adminRouteContracts,
  type ApiRouteContract,
  publicRouteContracts,
} from '../../src/api/routeContracts.js';

const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const DEPOSIT_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const TX_ID = 'A'.repeat(64);
const CUSTOMER_PAYLOAD = {
  customerLastName: 'Alekseev',
  customerFirstName: 'Pavel',
  customerMiddleName: 'Astrakhanov',
};

describe('API route contracts', () => {
  it('fixes the public endpoint inventory and auth modes', () => {
    expect(toRouteInventory(publicRouteContracts)).toEqual([
      ['GET', '/health', 'none'],
      ['GET', '/api/rates/usdt-rub', 'none'],
      ['POST', '/api/telegram/validate-init-data', 'none'],
      ['GET', '/api/orders/active', 'telegram-init-data-or-dev-user-id'],
      ['GET', '/api/orders/history', 'telegram-init-data-or-dev-user-id'],
      ['GET', '/api/orders/:publicId', 'telegram-init-data-or-dev-user-id'],
      ['GET', '/api/profile', 'telegram-init-data-or-dev-user-id'],
      ['POST', '/api/orders/buy', 'telegram-init-data-or-dev-user-id'],
      ['POST', '/api/orders/sell', 'telegram-init-data-or-dev-user-id'],
    ]);
  });

  it('fixes the admin endpoint inventory and auth modes', () => {
    expect(toRouteInventory(adminRouteContracts)).toEqual([
      ['POST', '/api/admin/session', 'admin-password-login'],
      ['POST', '/api/address-pool/import', 'admin-session-or-bearer-and-actor-header'],
      ['GET', '/api/admin/orders/active', 'admin-session-or-bearer-and-actor-header'],
      ['GET', '/api/admin/orders/:publicId', 'admin-session-or-bearer-and-actor-header'],
      ['POST', '/api/admin/orders/:publicId/status', 'admin-session-or-bearer-and-actor-header'],
      [
        'POST',
        '/api/admin/orders/:publicId/manual-crypto-payout',
        'admin-session-or-bearer-and-actor-header',
      ],
    ]);
  });

  it('fixes response DTO schemas for every public and admin endpoint', () => {
    const contracts = [...publicRouteContracts, ...adminRouteContracts];

    expect(
      contracts.map((contract) => [contract.method, contract.path, Boolean(contract.responseSchema)]),
    ).toEqual(contracts.map((contract) => [contract.method, contract.path, true]));
  });

  it('fixes the profile response DTO with optional stored customer FIO', () => {
    const profileContract = findRoute(publicRouteContracts, '/api/profile');

    expect(profileContract.responseSchema?.safeParse({
      profile: {
        userId: 'user-1',
        customer: {
          lastName: 'Ivanov',
          firstName: 'Ivan',
          middleName: 'Ivanovich',
        },
        telegram: {
          telegramUserId: '462656683',
          username: 'pavel',
          firstName: 'Pavel',
          lastName: null,
        },
        stats: {
          totalOrders: 4,
          activeOrders: 1,
        },
      },
    }).success).toBe(true);
    expect(profileContract.responseSchema?.safeParse({
      profile: {
        userId: 'user-1',
        customer: null,
        telegram: null,
        stats: {
          totalOrders: 0,
          activeOrders: 0,
        },
      },
    }).success).toBe(true);
  });

  it('keeps spoofable and server-owned fields out of request bodies', () => {
    const statusContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/status',
    );
    const payoutContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/manual-crypto-payout',
    );
    const buyContract = findRoute(publicRouteContracts, '/api/orders/buy');
    const sellContract = findRoute(publicRouteContracts, '/api/orders/sell');

    expect(
      statusContract.bodySchema?.safeParse({
        actorId: 'spoofed-body-manager',
        status: 'completed',
      }).success,
    ).toBe(false);
    expect(
      payoutContract.bodySchema?.safeParse({
        actorId: 'spoofed-body-manager',
        txId: 'A'.repeat(64),
      }).success,
    ).toBe(false);
    expect(
      buyContract.bodySchema?.safeParse({
        publicId: 'CLIENT_CHOSEN',
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        amountUsdt: '2602.400000',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }).success,
    ).toBe(false);
    expect(
      sellContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
      }).success,
    ).toBe(false);
  });

  it('keeps user filters out of manager-wide admin list queries', () => {
    const adminActiveOrdersContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/active',
    );

    expect(
      adminActiveOrdersContract.querySchema?.safeParse({
        userId: 'user-1',
        limit: '10',
      }).success,
    ).toBe(false);
  });

  it('fixes admin login request and response DTOs', () => {
    const loginContract = findRoute(adminRouteContracts, '/api/admin/session');

    expect(
      loginContract.bodySchema?.safeParse({
        username: ' manager-1 ',
        password: 'correct horse battery staple',
      }).success,
    ).toBe(true);
    expect(
      loginContract.bodySchema?.safeParse({
        username: 'manager-1',
        password: 'correct horse battery staple',
        actorId: 'spoofed-manager',
      }).success,
    ).toBe(false);
    expect(
      loginContract.responseSchema?.safeParse({
        token: 'admin_session_v1.payload.signature',
        admin: {
          id: 'admin-1',
          username: 'manager-1',
          role: 'manager',
        },
      }).success,
    ).toBe(true);
    expect(
      loginContract.responseSchema?.safeParse({
        token: 'admin_session_v1.payload.signature',
        admin: {
          id: 'admin-1',
          username: 'manager-1',
          role: 'manager',
          passwordHash: 'secret',
        },
      }).success,
    ).toBe(false);
  });

  it('fixes manual payout tx id format at the request DTO layer', () => {
    const payoutContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/manual-crypto-payout',
    );

    expect(
      payoutContract.bodySchema?.safeParse({
        txId: 'A'.repeat(64),
      }).success,
    ).toBe(true);
    expect(
      payoutContract.bodySchema?.safeParse({
        txId: 'not-a-tron-tx',
      }).success,
    ).toBe(false);
  });

  it('caps manager audit comments at the request DTO layer', () => {
    const statusContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/status',
    );
    const payoutContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/manual-crypto-payout',
    );

    const statusResult = statusContract.bodySchema?.safeParse({
      status: 'completed',
      comment: '  cash paid in office  ',
    });
    expect(statusResult?.success).toBe(true);
    if (statusResult?.success) {
      expect(statusResult.data).toMatchObject({
        comment: 'cash paid in office',
      });
    }

    for (const contractPayload of [
      {
        contract: statusContract,
        payload: {
          status: 'completed',
          comment: '   ',
        },
      },
      {
        contract: payoutContract,
        payload: {
          txId: TX_ID,
          comment: 'x'.repeat(501),
        },
      },
    ]) {
      expect(
        contractPayload.contract.bodySchema?.safeParse(contractPayload.payload).success,
      ).toBe(false);
    }
  });

  it('fixes TRON address formats at the request DTO layer', () => {
    const addressPoolImportContract = findRoute(
      adminRouteContracts,
      '/api/address-pool/import',
    );
    const buyContract = findRoute(publicRouteContracts, '/api/orders/buy');

    expect(
      addressPoolImportContract.bodySchema?.safeParse({
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: PAYOUT_ADDRESS,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      addressPoolImportContract.bodySchema?.safeParse({
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: 'not-a-tron-address',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      addressPoolImportContract.bodySchema?.safeParse({
        rows: [],
      }).success,
    ).toBe(false);
    expect(
      buyContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        clientPayoutAddress: 'not-a-tron-address',
      }).success,
    ).toBe(false);
  });

  it('fixes public order amount formats at the request DTO layer', () => {
    const buyContract = findRoute(publicRouteContracts, '/api/orders/buy');
    const sellContract = findRoute(publicRouteContracts, '/api/orders/sell');

    expect(
      buyContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }).success,
    ).toBe(true);
    expect(
      buyContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '0',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }).success,
    ).toBe(false);
    expect(
      buyContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.123',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }).success,
    ).toBe(false);
    expect(
      buyContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: `${'1'.repeat(35)}.00`,
        clientPayoutAddress: PAYOUT_ADDRESS,
      }).success,
    ).toBe(false);

    expect(
      sellContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
      }).success,
    ).toBe(true);
    expect(
      sellContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '0.000000',
      }).success,
    ).toBe(false);
    expect(
      sellContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.0000001',
      }).success,
    ).toBe(false);
    expect(
      sellContract.bodySchema?.safeParse({
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: `${'1'.repeat(31)}.000000`,
      }).success,
    ).toBe(false);
  });

  it('requires non-empty customer identity fields at the request DTO layer', () => {
    const buyContract = findRoute(publicRouteContracts, '/api/orders/buy');
    const sellContract = findRoute(publicRouteContracts, '/api/orders/sell');

    for (const contract of [buyContract, sellContract]) {
      const amountPayload = contract.path.endsWith('/buy')
        ? {
            amountRub: '200000.00',
            clientPayoutAddress: PAYOUT_ADDRESS,
          }
        : {
            amountUsdt: '5000.000000',
          };

      for (const field of ['customerLastName', 'customerFirstName', 'customerMiddleName']) {
        expect(
          contract.bodySchema?.safeParse({
            userId: 'user-1',
            ...CUSTOMER_PAYLOAD,
            [field]: '   ',
            ...amountPayload,
          }).success,
        ).toBe(false);
      }
    }
  });

  it('rejects unsafe integer request DTO fields', () => {
    const addressPoolImportContract = findRoute(
      adminRouteContracts,
      '/api/address-pool/import',
    );
    const buyContract = findRoute(publicRouteContracts, '/api/orders/buy');
    const sellContract = findRoute(publicRouteContracts, '/api/orders/sell');

    expect(
      addressPoolImportContract.bodySchema?.safeParse({
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: Number.MAX_SAFE_INTEGER + 1,
            address: PAYOUT_ADDRESS,
          },
        ],
      }).success,
    ).toBe(false);

    for (const contract of [buyContract, sellContract]) {
      const amountPayload = contract.path.endsWith('/buy')
        ? {
            amountRub: '200000.00',
            clientPayoutAddress: PAYOUT_ADDRESS,
          }
        : {
            amountUsdt: '5000.000000',
          };

      expect(
        contract.bodySchema?.safeParse({
          userId: 'user-1',
          ...CUSTOMER_PAYLOAD,
          rateTtlMinutes: Number.MAX_SAFE_INTEGER + 1,
          ...amountPayload,
        }).success,
      ).toBe(false);
      expect(
        contract.bodySchema?.safeParse({
          userId: 'user-1',
          ...CUSTOMER_PAYLOAD,
          orderTtlMinutes: Number.MAX_SAFE_INTEGER + 1,
          ...amountPayload,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects empty userId values when the local-dev fallback is provided', () => {
    const publicActiveOrdersContract = findRoute(
      publicRouteContracts,
      '/api/orders/active',
    );
    const profileContract = findRoute(publicRouteContracts, '/api/profile');
    const buyContract = findRoute(publicRouteContracts, '/api/orders/buy');
    const sellContract = findRoute(publicRouteContracts, '/api/orders/sell');

    for (const contract of [publicActiveOrdersContract, profileContract]) {
      expect(
        contract.querySchema?.safeParse({
          userId: '   ',
        }).success,
      ).toBe(false);
    }

    expect(
      buyContract.bodySchema?.safeParse({
        userId: '   ',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }).success,
    ).toBe(false);
    expect(
      sellContract.bodySchema?.safeParse({
        userId: '   ',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
      }).success,
    ).toBe(false);
  });

  it('rejects non-decimal integer query limit strings', () => {
    const publicActiveOrdersContract = findRoute(
      publicRouteContracts,
      '/api/orders/active',
    );
    const adminActiveOrdersContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/active',
    );

    for (const contract of [publicActiveOrdersContract, adminActiveOrdersContract]) {
      expect(
        contract.querySchema?.safeParse({
          limit: '100',
        }).success,
      ).toBe(true);
      expect(
        contract.querySchema?.safeParse({
          limit: '1e2',
        }).success,
      ).toBe(false);
      expect(
        contract.querySchema?.safeParse({
          limit: '10.0',
        }).success,
      ).toBe(false);
    }
  });

  it('rejects unexpected public query fields instead of stripping them', () => {
    const publicActiveOrdersContract = findRoute(
      publicRouteContracts,
      '/api/orders/active',
    );
    const healthContract = findRoute(publicRouteContracts, '/health');
    const profileContract = findRoute(publicRouteContracts, '/api/profile');
    const ratesContract = findRoute(publicRouteContracts, '/api/rates/usdt-rub');

    expect(healthContract.querySchema?.safeParse({}).success).toBe(true);
    expect(
      healthContract.querySchema?.safeParse({
        actorId: 'manager-1',
      }).success,
    ).toBe(false);
    expect(
      publicActiveOrdersContract.querySchema?.safeParse({
        userId: 'user-1',
        actorId: 'manager-1',
      }).success,
    ).toBe(false);
    expect(
      profileContract.querySchema?.safeParse({
        userId: 'user-1',
        actorId: 'manager-1',
      }).success,
    ).toBe(false);
    expect(
      ratesContract.querySchema?.safeParse({
        actorId: 'manager-1',
      }).success,
    ).toBe(false);
  });

  it('rejects unexpected route params instead of stripping them', () => {
    const publicOrderContract = findRoute(publicRouteContracts, '/api/orders/:publicId');
    const adminOrderContract = findRoute(adminRouteContracts, '/api/admin/orders/:publicId');
    const statusContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/status',
    );
    const payoutContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/manual-crypto-payout',
    );

    for (const contract of [publicOrderContract, adminOrderContract, statusContract, payoutContract]) {
      const trimmedResult = contract.paramsSchema?.safeParse({
        publicId: '  E74737  ',
      });
      expect(trimmedResult?.success).toBe(true);
      if (trimmedResult?.success) {
        expect(trimmedResult.data).toEqual({
          publicId: 'E74737',
        });
      }

      expect(
        contract.paramsSchema?.safeParse({
          publicId: '   ',
        }).success,
      ).toBe(false);
      expect(
        contract.paramsSchema?.safeParse({
          publicId: 'E74737',
          actorId: 'manager-1',
        }).success,
      ).toBe(false);
    }
  });

  it('fixes response scalar formats for public and admin DTOs', () => {
    const ratesContract = findRoute(publicRouteContracts, '/api/rates/usdt-rub');
    const telegramContract = findRoute(
      publicRouteContracts,
      '/api/telegram/validate-init-data',
    );
    const publicOrderContract = findRoute(publicRouteContracts, '/api/orders/:publicId');
    const payoutContract = findRoute(
      adminRouteContracts,
      '/api/admin/orders/:publicId/manual-crypto-payout',
    );

    expect(
      ratesContract.responseSchema?.safeParse({
        rates: {
          pair: 'USDT_RUB',
          buyRate: '76.850000',
          sellRate: '76.250000',
        },
      }).success,
    ).toBe(true);
    expect(
      ratesContract.responseSchema?.safeParse({
        rates: {
          pair: 'USDT_RUB',
          buyRate: '76.85',
          sellRate: '76.250000',
        },
      }).success,
    ).toBe(false);

    expect(
      telegramContract.responseSchema?.safeParse({
        authDate: '2026-05-11T09:00:00.000Z',
        queryId: null,
        user: {
          id: Number.MAX_SAFE_INTEGER + 1,
        },
      }).success,
    ).toBe(false);
    expect(
      telegramContract.responseSchema?.safeParse({
        authDate: 'not-a-date',
        queryId: null,
        user: null,
      }).success,
    ).toBe(false);

    expect(publicOrderContract.responseSchema?.safeParse(makeOrderResponse()).success).toBe(true);
    expect(
      publicOrderContract.responseSchema?.safeParse(makeOrderResponse({
        rateExpiresAt: 'not-a-date',
      })).success,
    ).toBe(false);
    expect(
      publicOrderContract.responseSchema?.safeParse(makeOrderResponse({
        amountRub: '200000.123',
      })).success,
    ).toBe(false);
    expect(
      publicOrderContract.responseSchema?.safeParse(makeOrderResponse({
        depositAddress: 'not-a-tron-address',
      })).success,
    ).toBe(false);
    expect(
      payoutContract.responseSchema?.safeParse(makeOrderResponse({
        cryptoPayout: {
          txId: 'not-a-tron-tx',
          recordedAt: '2026-05-11T09:05:00.000Z',
        },
      })).success,
    ).toBe(false);
  });
});

function toRouteInventory(
  contracts: ReadonlyArray<{
    method: string;
    path: string;
    auth: string;
  }>,
): string[][] {
  return contracts.map((contract) => [
    contract.method,
    contract.path,
    contract.auth,
  ]);
}

function findRoute(
  contracts: readonly ApiRouteContract[],
  path: string,
): ApiRouteContract {
  const contract = contracts.find((candidate) => candidate.path === path);
  if (!contract) {
    throw new Error(`missing route contract: ${path}`);
  }

  return contract;
}

function makeOrderResponse(
  overrides: Partial<{
    amountRub: string | null;
    rateExpiresAt: string;
    depositAddress: string | null;
    cryptoPayout: {
      txId: string;
      recordedAt: string;
    } | null;
  }> = {},
) {
  return {
    order: {
      publicId: 'E97010',
      direction: 'SELL_USDT',
      asset: 'USDT',
      network: 'TRON',
      customer: {
        lastName: 'Alekseev',
        firstName: 'Pavel',
        middleName: 'Astrakhanov',
      },
      amountUsdt: '5000.000000',
      amountRub: '381250.00',
      rateSnapshot: '76.250000',
      rateExpiresAt: '2026-05-11T09:20:00.000Z',
      orderExpiresAt: '2026-05-11T10:00:00.000Z',
      status: 'completed',
      depositAddress: DEPOSIT_ADDRESS,
      clientPayoutAddress: PAYOUT_ADDRESS,
      cryptoPayout: {
        txId: TX_ID,
        recordedAt: '2026-05-11T09:05:00.000Z',
      },
      createdAt: '2026-05-11T09:00:00.000Z',
      updatedAt: '2026-05-11T09:05:00.000Z',
      completedAt: '2026-05-11T09:05:00.000Z',
      ...overrides,
    },
  };
}
