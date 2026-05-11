import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp, type ApiDb } from '../../src/api/createApp.js';
import type {
  DepositAddressCandidate,
  OrderApplicationTransaction,
  OrderCreateData,
} from '../../src/orders/orderApplicationService.js';
import type { ReadableOrderRecord } from '../../src/orders/orderReadService.js';

interface PersistedOrder extends OrderCreateData {
  id: string;
}

const NOW = new Date('2026-05-11T09:00:00.000Z');
const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const BOT_TOKEN = '123456:test_bot_token';

function createPersistedOrder(data: OrderCreateData): PersistedOrder {
  return {
    id: `db-${data.publicId}`,
    ...data,
  };
}

function createReadableOrder(
  overrides: Partial<ReadableOrderRecord> = {},
): ReadableOrderRecord {
  return {
    publicId: 'E74737',
    direction: 'SELL_USDT',
    asset: 'USDT',
    network: 'TRON',
    amountUsdt: { toString: () => '5000.000000' },
    amountRub: { toString: () => '381250.00' },
    rateSnapshot: { toString: () => '76.250000' },
    rateExpiresAt: new Date('2026-05-11T09:20:00.000Z'),
    orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
    status: 'awaiting_deposit',
    depositAddress: {
      address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
    },
    clientPayoutAddress: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function createTx(input?: {
  candidates?: Array<DepositAddressCandidate | null>;
  updateCounts?: number[];
}): OrderApplicationTransaction<PersistedOrder> {
  const candidates = input?.candidates ?? [
    { id: 'addr-1', derivationIndex: 1, status: 'available' },
  ];
  const updateCounts = input?.updateCounts ?? [1];

  return {
    depositAddress: {
      findFirst: vi.fn(async () => candidates.shift() ?? null),
      updateMany: vi.fn(async () => ({ count: updateCounts.shift() ?? 0 })),
    },
    order: {
      create: vi.fn(async ({ data }) => createPersistedOrder(data)),
    },
  };
}

interface CreateDbOptions {
  tx?: OrderApplicationTransaction<PersistedOrder>;
  readOrders?: ReadableOrderRecord[];
  readOrder?: ReadableOrderRecord | null;
  countByCall?: number[];
}

function createDb(
  input: OrderApplicationTransaction<PersistedOrder> | CreateDbOptions = {},
): ApiDb<PersistedOrder> & {
  _tx: OrderApplicationTransaction<PersistedOrder>;
} {
  const options = isOrderApplicationTransaction(input)
    ? { tx: input }
    : input;
  const tx = options.tx ?? createTx();
  const countByCall = options.countByCall ?? [0, 0];

  return {
    _tx: tx,
    depositAddress: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    order: {
      create: vi.fn(async ({ data }) => createPersistedOrder(data)),
      findMany: vi.fn(async () => options.readOrders ?? []),
      findFirst: vi.fn(async () => options.readOrder ?? null),
      count: vi.fn(async () => countByCall.shift() ?? 0),
    },
    telegramProfile: {
      upsert: vi.fn(async () => ({
        userId: 'telegram-user-1',
        telegramUserId: 462656683n,
      })),
      findUnique: vi.fn(async () => ({
        telegramUserId: 462656683n,
        username: 'pavel',
        firstName: 'Pavel',
        lastName: null,
      })),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

function isOrderApplicationTransaction(
  input: OrderApplicationTransaction<PersistedOrder> | CreateDbOptions,
): input is OrderApplicationTransaction<PersistedOrder> {
  return 'depositAddress' in input && 'order' in input;
}

function createTelegramInitData(fields: Record<string, string>): string {
  const dataCheckString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

function createTelegramAuthorizationHeader(): string {
  return `tma ${createTelegramInitData({
    auth_date: '1778490000',
    user: JSON.stringify({
      id: 462656683,
      first_name: 'Pavel',
      username: 'pavel',
    }),
  })}`;
}

describe('createApiApp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns health status', async () => {
    const app = createApiApp({
      db: createDb(),
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('imports public address pool rows', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      payload: {
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ count: 1 });
    expect(db.depositAddress.createMany).toHaveBeenCalledWith({
      data: [
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
          status: 'available',
        },
      ],
      skipDuplicates: false,
    });
    await app.close();
  });

  it('does not expose admin address pool imports by default', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      payload: {
        rows: [],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(db.depositAddress.createMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates BUY orders from API payloads', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      order: {
        id: 'db-E97010',
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'awaiting_office_visit',
        depositAddressId: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
        rateExpiresAt: '2026-05-11T09:20:00.000Z',
        orderExpiresAt: '2026-05-11T10:00:00.000Z',
      },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('lists active orders for the current development user', async () => {
    const db = createDb({
      readOrders: [createReadableOrder()],
    });
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/active?userId=user-1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      orders: [
        {
          publicId: 'E74737',
          direction: 'SELL_USDT',
          status: 'awaiting_deposit',
          depositAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
          amountUsdt: '5000.000000',
          createdAt: '2026-05-11T09:00:00.000Z',
        },
      ],
    });
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
        }),
      }),
    );
    await app.close();
  });

  it('uses Telegram identity for read APIs when bot token is configured', async () => {
    const db = createDb({
      readOrders: [createReadableOrder()],
    });
    const app = createApiApp({
      db,
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/active?userId=spoofed-user',
      headers: {
        authorization: createTelegramAuthorizationHeader(),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(db.telegramProfile.upsert).toHaveBeenCalled();
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'telegram-user-1',
        }),
      }),
    );
    await app.close();
  });

  it('returns order details only for the current user', async () => {
    const db = createDb({
      readOrder: createReadableOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'awaiting_office_visit',
        depositAddress: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/E97010?userId=user-1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      order: {
        publicId: 'E97010',
        direction: 'BUY_USDT',
        depositAddress: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });
    expect(db.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          publicId: 'E97010',
        },
      }),
    );
    await app.close();
  });

  it('returns not found for missing order details', async () => {
    const app = createApiApp({
      db: createDb({
        readOrder: null,
      }),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/E40400?userId=user-1',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'not_found',
      message: 'order not found',
    });
    await app.close();
  });

  it('returns profile data and order counters', async () => {
    const app = createApiApp({
      db: createDb({
        countByCall: [4, 1],
      }),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/profile?userId=user-1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: {
        userId: 'user-1',
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
    });
    await app.close();
  });

  it('creates BUY orders for Telegram-authenticated users without body userId', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97012',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      headers: {
        authorization: createTelegramAuthorizationHeader(),
      },
      payload: {
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(db.telegramProfile.upsert).toHaveBeenCalledWith({
      where: {
        telegramUserId: 462656683n,
      },
      update: {
        username: 'pavel',
        firstName: 'Pavel',
        lastName: undefined,
      },
      create: {
        telegramUserId: 462656683n,
        username: 'pavel',
        firstName: 'Pavel',
        lastName: undefined,
        user: {
          create: {},
        },
      },
      select: {
        userId: true,
        telegramUserId: true,
      },
    });
    expect(db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: 'E97012',
        userId: 'telegram-user-1',
      }),
    });
    await app.close();
  });

  it('ignores client-supplied public ids and generates them server-side', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E97011',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        publicId: 'CLIENT_CHOSEN',
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      order: {
        publicId: 'E97011',
      },
    });
    await app.close();
  });

  it('creates SELL orders by atomically reserving a deposit address', async () => {
    const tx = createTx();
    const db = createDb(tx);
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'user-1',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      order: {
        id: 'db-E74737',
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'awaiting_deposit',
        depositAddressId: 'addr-1',
        clientPayoutAddress: null,
      },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'addr-1',
        status: 'available',
      },
      data: {
        status: 'reserved',
        reservedAt: NOW,
        expiresAt: new Date('2026-05-11T10:00:00.000Z'),
      },
    });
    await app.close();
  });

  it('requires Telegram initData authorization for SELL orders when bot token is configured', async () => {
    const app = createApiApp({
      db: createDb(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'spoofed-user',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'telegram_auth_invalid',
      message: 'Telegram initData authorization is required',
    });
    await app.close();
  });

  it('rejects tampered Telegram initData on order endpoints', async () => {
    const app = createApiApp({
      db: createDb(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97012',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      headers: {
        authorization: createTelegramAuthorizationHeader().replace('462656683', '462656684'),
      },
      payload: {
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'telegram_auth_invalid',
      message: 'initData signature is invalid',
    });
    await app.close();
  });

  it('creates SELL orders for Telegram-authenticated users and ignores body userId', async () => {
    const tx = createTx();
    const db = createDb(tx);
    const app = createApiApp({
      db,
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      headers: {
        authorization: createTelegramAuthorizationHeader(),
      },
      payload: {
        userId: 'spoofed-user',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'telegram-user-1',
        depositAddressId: 'addr-1',
      }),
    });
    await app.close();
  });

  it('maps empty address pool errors to conflict responses', async () => {
    const db = createDb(createTx({ candidates: [null] }));
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'user-1',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'address_pool_unavailable',
      message: 'no available TRON deposit addresses',
    });
    await app.close();
  });

  it('maps concurrent reservation exhaustion to conflict responses', async () => {
    const db = createDb(
      createTx({
        candidates: [
          { id: 'addr-1', derivationIndex: 1, status: 'available' },
          { id: 'addr-2', derivationIndex: 2, status: 'available' },
          { id: 'addr-3', derivationIndex: 3, status: 'available' },
        ],
        updateCounts: [0, 0, 0],
      }),
    );
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'user-1',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'address_pool_unavailable',
      message: 'failed to reserve TRON deposit address after concurrent attempts',
    });
    await app.close();
  });

  it('maps schema errors to invalid request responses', async () => {
    const app = createApiApp({
      db: createDb(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        {
          path: 'clientPayoutAddress',
        },
      ],
    });
    await app.close();
  });

  it('maps domain validation errors to validation responses', async () => {
    const app = createApiApp({
      db: createDb(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: 'bad',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'validation_error',
      message: 'clientPayoutAddress must be a valid TRON base58 address',
    });
    await app.close();
  });

  it('does not expose Telegram initData validation without a bot token', async () => {
    const app = createApiApp({
      db: createDb(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/telegram/validate-init-data',
      payload: {
        initData: createTelegramInitData({
          auth_date: '1778490000',
          user: JSON.stringify({ id: 462656683 }),
        }),
      },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('validates Telegram Mini App initData when a bot token is configured', async () => {
    const app = createApiApp({
      db: createDb(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/telegram/validate-init-data',
      payload: {
        initData: createTelegramInitData({
          auth_date: '1778490000',
          query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
          user: JSON.stringify({
            id: 462656683,
            first_name: 'Pavel',
            username: 'pavel',
          }),
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      authDate: '2026-05-11T09:00:00.000Z',
      queryId: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: {
        id: 462656683,
        first_name: 'Pavel',
        username: 'pavel',
      },
    });
    await app.close();
  });

  it('maps invalid Telegram initData to unauthorized responses', async () => {
    const app = createApiApp({
      db: createDb(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/telegram/validate-init-data',
      payload: {
        initData: createTelegramInitData({
          auth_date: '1778490000',
          user: JSON.stringify({ id: 462656683 }),
        }).replace('462656683', '462656684'),
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'telegram_auth_invalid',
      message: 'initData signature is invalid',
    });
    await app.close();
  });

  it('does not leak unexpected internal error messages', async () => {
    const tx = createTx();
    const db = createDb(tx);
    vi.mocked(db.order.create).mockRejectedValueOnce(
      new Error('database password is required'),
    );
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'internal_error',
    });
    expect(response.body).not.toContain('database password is required');
    await app.close();
  });
});
