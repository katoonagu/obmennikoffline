import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashAdminPassword } from '../../src/admin/adminPassword.js';
import {
  signAdminSession,
  verifyAdminSession,
} from '../../src/admin/adminSession.js';
import { createApiApp, type ApiDb } from '../../src/api/createApp.js';
import type { AddressPoolImportTransaction } from '../../src/address-pool/importAddressPoolToDb.js';
import type {
  DepositAddressCandidate,
  OrderApplicationTransaction,
  OrderCreateData,
} from '../../src/orders/orderApplicationService.js';
import type {
  ManagerOrderRecord,
  OrderManagerTransaction,
} from '../../src/orders/orderManagerService.js';
import type { ReadableOrderRecord } from '../../src/orders/orderReadService.js';

interface PersistedOrder extends OrderCreateData {
  id: string;
  completedAt?: Date | null;
  payoutTxId?: string | null;
  payoutTxRecordedAt?: Date | null;
  payoutTxRecordedBy?: string | null;
}

const NOW = new Date('2026-05-11T09:00:00.000Z');
const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const BOT_TOKEN = '123456:test_bot_token';
const ADMIN_TOKEN = 'test-admin-token';
const ADMIN_SESSION_SECRET = 'test-admin-session-secret-32-bytes';
const ADMIN_PASSWORD = 'correct horse battery staple';
const TX_ID = 'A'.repeat(64);
const CUSTOMER_PAYLOAD = {
  customerLastName: 'Alekseev',
  customerFirstName: 'Pavel',
  customerMiddleName: 'Astrakhanov',
};

function createStaticRateProvider(input = {
  buyRate: '76.850000',
  sellRate: '76.250000',
}) {
  return {
    getUsdtRubRates: vi.fn(async () => input),
  };
}

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
    ...CUSTOMER_PAYLOAD,
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
    payoutTxId: null,
    payoutTxRecordedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function createManagerOrder(
  overrides: Partial<ManagerOrderRecord> = {},
): ManagerOrderRecord {
  return {
    id: 'order-db-1',
    publicId: 'E97010',
    direction: 'BUY_USDT',
    status: 'ready_for_crypto_payout',
    clientPayoutAddress: PAYOUT_ADDRESS,
    ...overrides,
  };
}

type TestTransaction = AddressPoolImportTransaction &
  OrderApplicationTransaction<PersistedOrder> &
  OrderManagerTransaction<PersistedOrder>;

function createTx(input?: {
  candidates?: Array<DepositAddressCandidate | null>;
  updateCounts?: number[];
  managerOrder?: ManagerOrderRecord | null;
}): TestTransaction {
  const candidates = input?.candidates ?? [
    { id: 'addr-1', derivationIndex: 1, status: 'available' },
  ];
  const updateCounts = input?.updateCounts ?? [1];
  const managerOrder: ManagerOrderRecord | null =
    input && 'managerOrder' in input && input.managerOrder !== undefined
      ? input.managerOrder
      : createManagerOrder();

  return {
    depositAddress: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      findFirst: vi.fn(async () => candidates.shift() ?? null),
      updateMany: vi.fn(async () => ({ count: updateCounts.shift() ?? 0 })),
    },
    order: {
      create: vi.fn(async ({ data }) => createPersistedOrder(data)),
      findUnique: vi.fn(async () => managerOrder),
      update: vi.fn(async ({ data }) => ({
        ...(managerOrder ?? createManagerOrder()),
        ...data,
      }) as PersistedOrder),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({
        id: 'audit-1',
        ...data,
      })),
    },
  };
}

interface CreateDbOptions {
  tx?: TestTransaction;
  readOrders?: ReadableOrderRecord[];
  readOrder?: ReadableOrderRecord | null;
  countByCall?: number[];
  adminUser?: {
    id: string;
    username: string;
    passwordHash: string;
    role: 'manager' | 'owner';
    disabledAt: Date | null;
  } | null;
}

type TestAdminUserRecord = NonNullable<CreateDbOptions['adminUser']>;
type TestAdminSessionAdminRecord = Omit<TestAdminUserRecord, 'passwordHash'>;

function createDb(
  input: TestTransaction | CreateDbOptions = {},
): ApiDb<PersistedOrder> & {
  _tx: TestTransaction;
  adminUser: {
    findUnique(input: unknown): Promise<unknown>;
  };
} {
  const options = isOrderApplicationTransaction(input)
    ? { tx: input }
    : input;
  const tx = options.tx ?? createTx();
  const countByCall = options.countByCall ?? [0, 0];

  return {
    _tx: tx,
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
    adminUser: {
      findUnique: vi.fn(async (input) => selectAdminUser(options.adminUser ?? null, input)),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

function selectAdminUser(
  adminUser: CreateDbOptions['adminUser'] | null,
  input: unknown,
): TestAdminUserRecord | TestAdminSessionAdminRecord | null {
  if (!adminUser) {
    return null;
  }

  const select = (input as { select?: Record<string, boolean> }).select ?? {};
  if (select.passwordHash) {
    return {
      id: adminUser.id,
      username: adminUser.username,
      passwordHash: adminUser.passwordHash,
      role: adminUser.role,
      disabledAt: adminUser.disabledAt,
    };
  }

  return {
    id: adminUser.id,
    username: adminUser.username,
    role: adminUser.role,
    disabledAt: adminUser.disabledAt,
  };
}

function isOrderApplicationTransaction(
  input: TestTransaction | CreateDbOptions,
): input is TestTransaction {
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

  it('allows configured Mini App browser origins without wildcard CORS', async () => {
    const app = createApiApp({
      db: createDb(),
      corsAllowedOrigins: ['http://127.0.0.1:5173'],
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const allowedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'http://127.0.0.1:5173',
      },
    });
    const blockedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        origin: 'https://evil.example',
      },
    });

    expect(allowedResponse.statusCode).toBe(200);
    expect(allowedResponse.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5173',
    );
    expect(allowedResponse.headers.vary).toBe('Origin');
    expect(blockedResponse.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('answers Mini App CORS preflight for configured local origins', async () => {
    const app = createApiApp({
      db: createDb(),
      corsAllowedOrigins: ['http://127.0.0.1:5173'],
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/orders/buy',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5173',
    );
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,OPTIONS');
    expect(response.headers['access-control-allow-headers']).toBe(
      'authorization,content-type,x-admin-actor-id',
    );
    await app.close();
  });

  it('returns current public USDT/RUB rates', async () => {
    const rateProvider = createStaticRateProvider({
      buyRate: '76.85',
      sellRate: '76.25',
    });
    const app = createApiApp({
      db: createDb(),
      rateProvider,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/rates/usdt-rub',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rates: {
        pair: 'USDT_RUB',
        buyRate: '76.850000',
        sellRate: '76.250000',
      },
    });
    expect(rateProvider.getUsdtRubRates).toHaveBeenCalledWith({
      now: NOW,
    });
    await app.close();
  });

  it('rejects unexpected query fields on no-query public routes', async () => {
    const app = createApiApp({
      db: createDb(),
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/rates/usdt-rub?actorId=manager-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        {
          path: '',
        },
      ],
    });
    await app.close();
  });

  it('imports public address pool rows', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
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
    expect(db._tx.depositAddress.createMany).toHaveBeenCalledWith({
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
    expect(db._tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'manager-1',
        action: 'address_pool_imported',
        entityType: 'DepositAddress',
        entityId: 'address-pool-import',
        orderId: null,
        metadata: {
          count: '1',
          firstDerivationIndex: '0',
          lastDerivationIndex: '0',
        },
        createdAt: NOW,
      },
    });
    await app.close();
  });

  it('rejects malformed address pool import addresses at the request DTO layer', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: 'not-a-tron-address',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'rows.0.address',
          message: 'address must be a valid TRON base58 address',
        }),
      ],
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db._tx.depositAddress.createMany).not.toHaveBeenCalled();
    expect(db._tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects admin address pool imports without a valid admin token', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const missingTokenResponse = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      payload: {
        rows: [],
      },
    });

    expect(missingTokenResponse.statusCode).toBe(401);
    expect(missingTokenResponse.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin authorization is required',
    });

    const invalidTokenResponse = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      headers: {
        authorization: 'Bearer wrong-token',
      },
      payload: {
        rows: [],
      },
    });

    expect(invalidTokenResponse.statusCode).toBe(401);
    expect(invalidTokenResponse.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin authorization token is invalid',
    });
    expect(db._tx.depositAddress.createMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('authenticates admin accounts and returns an admin session DTO', async () => {
    const db = createDb({
      adminUser: {
        id: 'admin-1',
        username: 'manager-1',
        passwordHash: hashAdminPassword(ADMIN_PASSWORD, {
          salt: Buffer.alloc(16, 1),
        }),
        role: 'manager',
        disabledAt: null,
      },
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      adminSessionSecret: ADMIN_SESSION_SECRET,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/session',
      payload: {
        username: ' manager-1 ',
        password: ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      admin: {
        id: 'admin-1',
        username: 'manager-1',
        role: 'manager',
      },
      token: expect.stringMatching(/^admin_session_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    });
    expect(body.admin).not.toHaveProperty('passwordHash');
    expect(verifyAdminSession({
      token: body.token,
      secret: ADMIN_SESSION_SECRET,
      now: NOW,
    })).toMatchObject({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      issuedAt: NOW.toISOString(),
    });
    expect(db.adminUser.findUnique).toHaveBeenCalledWith({
      where: {
        username: 'manager-1',
      },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        disabledAt: true,
      },
    });
    await app.close();
  });

  it('rejects invalid admin account passwords without issuing a session', async () => {
    const db = createDb({
      adminUser: {
        id: 'admin-1',
        username: 'manager-1',
        passwordHash: hashAdminPassword(ADMIN_PASSWORD, {
          salt: Buffer.alloc(16, 2),
        }),
        role: 'manager',
        disabledAt: null,
      },
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      adminSessionSecret: ADMIN_SESSION_SECRET,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/session',
      payload: {
        username: 'manager-1',
        password: 'wrong password value',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin credentials are invalid',
    });
    expect(response.body).not.toContain('admin_session_v1');
    await app.close();
  });

  it('rate limits repeated invalid admin account login attempts', async () => {
    const db = createDb({
      adminUser: {
        id: 'admin-1',
        username: 'manager-1',
        passwordHash: hashAdminPassword(ADMIN_PASSWORD, {
          salt: Buffer.alloc(16, 3),
        }),
        role: 'manager',
        disabledAt: null,
      },
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      adminSessionSecret: ADMIN_SESSION_SECRET,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/session',
        payload: {
          username: 'manager-1',
          password: 'wrong password value',
        },
      });
      expect(response.statusCode).toBe(401);
    }

    const limitedResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/session',
      payload: {
        username: 'manager-1',
        password: ADMIN_PASSWORD,
      },
    });

    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.json()).toEqual({
      error: 'admin_login_rate_limited',
      message: 'admin login is rate limited',
    });
    expect(db.adminUser.findUnique).toHaveBeenCalledTimes(5);
    await app.close();
  });

  it('authorizes admin mutations with an admin session token and audits the session username', async () => {
    const db = createDb({
      adminUser: {
        id: 'admin-1',
        username: 'manager-1',
        passwordHash: hashAdminPassword(ADMIN_PASSWORD, {
          salt: Buffer.alloc(16, 4),
        }),
        role: 'manager',
        disabledAt: null,
      },
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      adminSessionSecret: ADMIN_SESSION_SECRET,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });
    const adminSessionToken = signAdminSession({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      secret: ADMIN_SESSION_SECRET,
      now: NOW,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
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
    expect(db._tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'manager-1',
        action: 'address_pool_imported',
      }),
    });
    await app.close();
  });

  it('rejects admin session tokens for disabled admin accounts', async () => {
    const db = createDb({
      adminUser: {
        id: 'admin-1',
        username: 'manager-1',
        passwordHash: hashAdminPassword(ADMIN_PASSWORD, {
          salt: Buffer.alloc(16, 5),
        }),
        role: 'manager',
        disabledAt: new Date('2026-05-11T09:01:00.000Z'),
      },
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      adminSessionSecret: ADMIN_SESSION_SECRET,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });
    const adminSessionToken = signAdminSession({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      secret: ADMIN_SESSION_SECRET,
      now: NOW,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/orders/active',
      headers: {
        authorization: `Bearer ${adminSessionToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin session is invalid',
    });
    expect(db.adminUser.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'admin-1',
      },
      select: {
        id: true,
        username: true,
        role: true,
        disabledAt: true,
      },
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires an admin actor header on address pool imports', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/address-pool/import',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      payload: {
        rows: [],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is required',
    });
    expect(db._tx.depositAddress.createMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires admin bearer authorization on every admin route', async () => {
    const app = createApiApp({
      db: createDb(),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const requests = [
      {
        method: 'POST' as const,
        url: '/api/address-pool/import',
        payload: { rows: [] },
      },
      {
        method: 'GET' as const,
        url: '/api/admin/orders/active',
      },
      {
        method: 'POST' as const,
        url: '/api/admin/orders/E74737/status',
        headers: { 'x-admin-actor-id': 'manager-1' },
        payload: { status: 'cancelled' },
      },
      {
        method: 'POST' as const,
        url: '/api/admin/orders/E97010/manual-crypto-payout',
        headers: { 'x-admin-actor-id': 'manager-1' },
        payload: { txId: TX_ID },
      },
    ];

    for (const request of requests) {
      const response = await app.inject(request);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'admin_auth_invalid',
        message: 'admin authorization is required',
      });
    }

    await app.close();
  });

  it('refuses to register admin routes without an admin token', () => {
    expect(() =>
      createApiApp({
        db: createDb(),
        enableAdminRoutes: true,
        now: () => NOW,
        publicIdFactory: () => 'E100001',
      }),
    ).toThrow('adminApiToken is required when admin routes are enabled');
  });

  it('refuses to register admin session login with a weak session secret', () => {
    expect(() =>
      createApiApp({
        db: createDb(),
        enableAdminRoutes: true,
        adminApiToken: ADMIN_TOKEN,
        adminSessionSecret: 'short',
      }),
    ).toThrow('adminSessionSecret must be at least 32 characters and contain no whitespace');
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
    expect(db._tx.depositAddress.createMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not expose any admin routes by default', async () => {
    const app = createApiApp({
      db: createDb(),
      now: () => NOW,
      publicIdFactory: () => 'E100001',
    });

    const requests = [
      {
        method: 'POST' as const,
        url: '/api/address-pool/import',
        payload: { rows: [] },
      },
      {
        method: 'GET' as const,
        url: '/api/admin/orders/active',
      },
      {
        method: 'POST' as const,
        url: '/api/admin/orders/E74737/status',
        payload: { status: 'cancelled' },
      },
      {
        method: 'POST' as const,
        url: '/api/admin/orders/E97010/manual-crypto-payout',
        payload: { txId: TX_ID },
      },
    ];

    for (const request of requests) {
      const response = await app.inject(request);

      expect(response.statusCode).toBe(404);
    }

    await app.close();
  });

  it('lists active orders for managers through an admin route', async () => {
    const db = createDb({
      readOrders: [createReadableOrder()],
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/orders/active?limit=10',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      orders: [
        {
          publicId: 'E74737',
          direction: 'SELL_USDT',
          status: 'awaiting_deposit',
        },
      ],
    });
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          userId: expect.any(String),
        }),
        take: 10,
      }),
    );
    await app.close();
  });

  it('requires an admin actor header on manager-wide active order lists', async () => {
    const db = createDb({
      readOrders: [createReadableOrder()],
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/orders/active?limit=10',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is required',
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects user filters on manager-wide active order lists', async () => {
    const db = createDb({
      readOrders: [createReadableOrder()],
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/orders/active?userId=user-1&limit=10',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('userId'),
        }),
      ],
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('records manual crypto payout tx hashes through an admin route', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'ready_for_crypto_payout',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const completedReadableOrder = {
      ...createReadableOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'completed',
        depositAddress: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
        completedAt: NOW,
      }),
      payoutTxId: TX_ID.toLowerCase(),
      payoutTxRecordedAt: NOW,
      payoutTxRecordedBy: 'manager-1',
    };
    const db = createDb({
      tx,
      readOrder: completedReadableOrder,
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E97010/manual-crypto-payout',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        txId: TX_ID,
        comment: 'sent from external wallet',
      },
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json();
    expect(responseBody).toMatchObject({
      order: {
        publicId: 'E97010',
        status: 'completed',
        customer: {
          lastName: 'Alekseev',
          firstName: 'Pavel',
          middleName: 'Astrakhanov',
        },
        cryptoPayout: {
          txId: TX_ID.toLowerCase(),
          recordedAt: '2026-05-11T09:00:00.000Z',
        },
      },
    });
    expect(responseBody.order).not.toHaveProperty('id');
    expect(responseBody.order).not.toHaveProperty('customerLastName');
    expect(responseBody.order).not.toHaveProperty('depositAddressId');
    expect(responseBody.order).not.toHaveProperty('payoutTxRecordedBy');
    expect(tx.order.update).toHaveBeenCalledWith({
      where: {
        publicId: 'E97010',
        payoutTxId: null,
        status: {
          in: ['awaiting_office_visit', 'manager_review', 'ready_for_crypto_payout'],
        },
      },
      data: {
        status: 'completed',
        completedAt: NOW,
        payoutTxId: TX_ID.toLowerCase(),
        payoutTxRecordedAt: NOW,
        payoutTxRecordedBy: 'manager-1',
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'manual_crypto_payout_recorded',
          actorId: 'manager-1',
        }),
      }),
    );
    await app.close();
  });

  it('rejects actor ids in manual crypto payout request bodies', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'ready_for_crypto_payout',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const app = createApiApp({
      db: createDb({ tx }),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E97010/manual-crypto-payout',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-from-header',
      },
      payload: {
        actorId: 'spoofed-body-manager',
        txId: TX_ID,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('actorId'),
        }),
      ],
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects malformed manual payout tx ids at the request DTO layer', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'ready_for_crypto_payout',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const app = createApiApp({
      db: createDb({ tx }),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E97010/manual-crypto-payout',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        txId: 'not-a-tron-tx',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'txId',
          message: 'txId must be a 64-character hex TRON transaction id',
        }),
      ],
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unsafe admin audit comments at the request DTO layer', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'ready_for_crypto_payout',
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const app = createApiApp({
      db: createDb({ tx }),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const oversizedCommentResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E97010/manual-crypto-payout',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        txId: TX_ID,
        comment: 'x'.repeat(501),
      },
    });

    expect(oversizedCommentResponse.statusCode).toBe(400);
    expect(oversizedCommentResponse.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'comment',
          message: 'comment must be at most 500 characters',
        }),
      ],
    });

    const blankCommentResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E97010/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        status: 'cancelled',
        comment: '   ',
      },
    });

    expect(blankCommentResponse.statusCode).toBe(400);
    expect(blankCommentResponse.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'comment',
          message: 'comment is required',
        }),
      ],
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects actor ids in admin status request bodies', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    });
    const db = createDb({
      tx,
      readOrder: createReadableOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'completed',
        completedAt: NOW,
      }),
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-from-header',
      },
      payload: {
        actorId: 'spoofed-body-manager',
        status: 'completed',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('actorId'),
        }),
      ],
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects admin mutations without an actor header', async () => {
    const app = createApiApp({
      db: createDb(),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      payload: {
        status: 'cancelled',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is required',
    });
    await app.close();
  });

  it('requires an admin actor header before validating mutation DTOs', async () => {
    const app = createApiApp({
      db: createDb(),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const statusResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      payload: {
        status: 'not-a-manager-status',
      },
    });

    expect(statusResponse.statusCode).toBe(401);
    expect(statusResponse.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is required',
    });

    const payoutResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/manual-crypto-payout',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      payload: {
        txId: 'not a tx id',
      },
    });

    expect(payoutResponse.statusCode).toBe(401);
    expect(payoutResponse.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is required',
    });
    await app.close();
  });

  it('rejects multiple admin actor header values as ambiguous', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    });
    const app = createApiApp({
      db: createDb({
        tx,
        readOrder: createReadableOrder({
          publicId: 'E74737',
          direction: 'SELL_USDT',
          status: 'completed',
          completedAt: NOW,
        }),
      }),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': ['manager-1', 'manager-2'],
      },
      payload: {
        status: 'completed',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is invalid',
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects malformed admin actor allowlists during app bootstrap', () => {
    const baseOptions = {
      db: createDb(),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    };

    expect(() =>
      createApiApp({
        ...baseOptions,
        adminActorIds: [],
      }),
    ).toThrow('ADMIN_ACTOR_IDS must contain at least one actor id');
    expect(() =>
      createApiApp({
        ...baseOptions,
        adminActorIds: ['manager-1', ''],
      }),
    ).toThrow('ADMIN_ACTOR_IDS must not contain empty entries');
    expect(() =>
      createApiApp({
        ...baseOptions,
        adminActorIds: ['manager-1', 'manager-1'],
      }),
    ).toThrow('ADMIN_ACTOR_IDS must not contain duplicate values');
    expect(() =>
      createApiApp({
        ...baseOptions,
        adminActorIds: ['manager 1'],
      }),
    ).toThrow('ADMIN_ACTOR_IDS contains an invalid actor id');
  });

  it('rejects malformed Telegram initData max age during app bootstrap', () => {
    const baseOptions = {
      db: createDb(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    };

    for (const telegramInitDataMaxAgeSeconds of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createApiApp({
          ...baseOptions,
          telegramInitDataMaxAgeSeconds,
        }),
      ).toThrow('telegramInitDataMaxAgeSeconds must be a positive safe integer');
    }
  });

  it('rejects malformed API auth secrets during app bootstrap', () => {
    const baseOptions = {
      db: createDb(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    };

    expect(() =>
      createApiApp({
        ...baseOptions,
        telegramBotToken: '',
      }),
    ).toThrow('telegramBotToken must be non-empty when provided');
    expect(() =>
      createApiApp({
        ...baseOptions,
        telegramBotToken: ` ${BOT_TOKEN} `,
      }),
    ).toThrow('telegramBotToken must not contain whitespace');
    expect(() =>
      createApiApp({
        ...baseOptions,
        enableAdminRoutes: true,
        adminApiToken: 'admin token with spaces',
      }),
    ).toThrow('adminApiToken must not contain whitespace');
  });

  it('rejects admin actor headers outside the configured allowlist', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    });
    const app = createApiApp({
      db: createDb({
        tx,
        readOrder: createReadableOrder({
          publicId: 'E74737',
          direction: 'SELL_USDT',
          status: 'completed',
          completedAt: NOW,
        }),
      }),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      adminActorIds: ['manager-1'],
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'spoofed-manager',
      },
      payload: {
        status: 'cancelled',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is not allowed',
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects unsafe admin actor header values', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    });
    const app = createApiApp({
      db: createDb({
        tx,
        readOrder: createReadableOrder({
          publicId: 'E74737',
          direction: 'SELL_USDT',
          status: 'completed',
          completedAt: NOW,
        }),
      }),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'bad actor',
      },
      payload: {
        status: 'cancelled',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'admin_auth_invalid',
      message: 'admin actor id is invalid',
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('sets manager-controlled order statuses through an admin route', async () => {
    const tx = createTx({
      managerOrder: createManagerOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    });
    const db = createDb({
      tx,
      readOrder: createReadableOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'completed',
        completedAt: NOW,
      }),
    });
    const app = createApiApp({
      db,
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E74737/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        status: 'completed',
        comment: 'cash paid in office',
      },
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json();
    expect(responseBody).toMatchObject({
      order: {
        publicId: 'E74737',
        status: 'completed',
        customer: {
          lastName: 'Alekseev',
          firstName: 'Pavel',
          middleName: 'Astrakhanov',
        },
        cryptoPayout: null,
        completedAt: '2026-05-11T09:00:00.000Z',
      },
    });
    expect(responseBody.order).not.toHaveProperty('id');
    expect(responseBody.order).not.toHaveProperty('customerLastName');
    expect(responseBody.order).not.toHaveProperty('depositAddressId');
    expect(tx.order.update).toHaveBeenCalledWith({
      where: {
        publicId: 'E74737',
      },
      data: {
        status: 'completed',
        completedAt: NOW,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'manager_order_status_changed',
          actorId: 'manager-1',
        }),
      }),
    );
    await app.close();
  });

  it('returns not found when manager updates an unknown order', async () => {
    const app = createApiApp({
      db: createDb(createTx({ managerOrder: null })),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E40400',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E40400/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        status: 'cancelled',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'not_found',
      message: 'order not found',
    });
    await app.close();
  });

  it('rejects completing BUY_USDT through generic manager status updates', async () => {
    const app = createApiApp({
      db: createDb(createTx({ managerOrder: createManagerOrder() })),
      enableAdminRoutes: true,
      adminApiToken: ADMIN_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/orders/E97010/status',
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        'x-admin-actor-id': 'manager-1',
      },
      payload: {
        status: 'completed',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'validation_error',
      message: 'BUY_USDT completion requires manual crypto payout tx id',
    });
    await app.close();
  });

  it('creates BUY orders from API payloads and returns a public order DTO', async () => {
    const db = createDb({
      readOrder: createReadableOrder({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'awaiting_office_visit',
        amountUsdt: { toString: () => '2602.472348' },
        amountRub: { toString: () => '200000.00' },
        rateSnapshot: { toString: () => '76.850000' },
        depositAddress: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const rateProvider = createStaticRateProvider();
    const app = createApiApp({
      db,
      rateProvider,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(201);
    const responseBody = response.json();
    expect(responseBody).toMatchObject({
      order: {
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'awaiting_office_visit',
        customer: {
          lastName: 'Alekseev',
          firstName: 'Pavel',
          middleName: 'Astrakhanov',
        },
        amountUsdt: '2602.472348',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        depositAddress: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
        rateExpiresAt: '2026-05-11T09:20:00.000Z',
        orderExpiresAt: '2026-05-11T10:00:00.000Z',
      },
    });
    expect(responseBody.order).not.toHaveProperty('id');
    expect(responseBody.order).not.toHaveProperty('customerLastName');
    expect(responseBody.order).not.toHaveProperty('depositAddressId');
    expect(rateProvider.getUsdtRubRates).toHaveBeenCalledWith({
      now: NOW,
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

  it('rejects unexpected public query fields', async () => {
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
      url: '/api/orders/active?userId=user-1&actorId=manager-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('actorId'),
        }),
      ],
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects non-decimal integer query limits before reading orders', async () => {
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
      url: '/api/orders/active?userId=user-1&limit=1e2',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'limit',
        }),
      ],
    });
    expect(db.order.findMany).not.toHaveBeenCalled();
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

  it('requires Telegram initData authorization on every user route when bot token is configured', async () => {
    const app = createApiApp({
      db: createDb(),
      rateProvider: createStaticRateProvider(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const requests = [
      {
        method: 'GET' as const,
        url: '/api/orders/active?userId=spoofed-user',
      },
      {
        method: 'GET' as const,
        url: '/api/orders/history?userId=spoofed-user',
      },
      {
        method: 'GET' as const,
        url: '/api/orders/E97010?userId=spoofed-user',
      },
      {
        method: 'GET' as const,
        url: '/api/profile?userId=spoofed-user',
      },
      {
        method: 'POST' as const,
        url: '/api/orders/buy',
        payload: {
          userId: 'spoofed-user',
          ...CUSTOMER_PAYLOAD,
          amountRub: '200000.00',
          clientPayoutAddress: PAYOUT_ADDRESS,
        },
      },
      {
        method: 'POST' as const,
        url: '/api/orders/sell',
        payload: {
          userId: 'spoofed-user',
          ...CUSTOMER_PAYLOAD,
          amountUsdt: '5000.000000',
        },
      },
    ];

    for (const request of requests) {
      const response = await app.inject(request);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'telegram_auth_invalid',
        message: 'Telegram initData authorization is required',
      });
    }

    await app.close();
  });

  it('checks Telegram authorization before validating user route DTOs', async () => {
    const app = createApiApp({
      db: createDb(),
      rateProvider: createStaticRateProvider(),
      telegramBotToken: BOT_TOKEN,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const missingAuthResponse = await app.inject({
      method: 'GET',
      url: '/api/orders/active?actorId=manager-1',
    });

    expect(missingAuthResponse.statusCode).toBe(401);
    expect(missingAuthResponse.json()).toEqual({
      error: 'telegram_auth_invalid',
      message: 'Telegram initData authorization is required',
    });

    const invalidAuthResponse = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      headers: {
        authorization: 'tma invalid-init-data',
      },
      payload: {
        actorId: 'manager-1',
      },
    });

    expect(invalidAuthResponse.statusCode).toBe(401);
    expect(invalidAuthResponse.json()).toEqual({
      error: 'telegram_auth_invalid',
      message: 'initData hash is required',
    });
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

  it('rejects blank order route params before reading orders', async () => {
    const db = createDb({
      readOrder: createReadableOrder(),
    });
    const app = createApiApp({
      db,
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/%20%20%20?userId=user-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'publicId',
          message: 'publicId is required',
        }),
      ],
    });
    expect(db.order.findFirst).not.toHaveBeenCalled();
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
    const db = createDb({
      readOrder: createReadableOrder({
        publicId: 'E97012',
        direction: 'BUY_USDT',
        status: 'awaiting_office_visit',
        amountUsdt: { toString: () => '2602.472348' },
        amountRub: { toString: () => '200000.00' },
        rateSnapshot: { toString: () => '76.850000' },
        depositAddress: null,
        clientPayoutAddress: PAYOUT_ADDRESS,
      }),
    });
    const app = createApiApp({
      db,
      rateProvider: createStaticRateProvider(),
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
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
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

  it('rejects client-supplied order ids and quote fields', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E97011',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        publicId: 'CLIENT_CHOSEN',
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('publicId'),
        }),
      ],
    });
    expect(db.order.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates SELL orders by atomically reserving a deposit address and returns a public order DTO', async () => {
    const tx = createTx();
    const db = createDb({
      tx,
      readOrder: createReadableOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'awaiting_deposit',
        amountUsdt: { toString: () => '5000.000000' },
        amountRub: { toString: () => '381250.00' },
        rateSnapshot: { toString: () => '76.250000' },
        depositAddress: {
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
        clientPayoutAddress: null,
      }),
    });
    const rateProvider = createStaticRateProvider();
    const app = createApiApp({
      db,
      rateProvider,
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
      },
    });

    expect(response.statusCode).toBe(201);
    const responseBody = response.json();
    expect(responseBody).toMatchObject({
      order: {
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'awaiting_deposit',
        customer: {
          lastName: 'Alekseev',
          firstName: 'Pavel',
          middleName: 'Astrakhanov',
        },
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        depositAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        clientPayoutAddress: null,
      },
    });
    expect(responseBody.order).not.toHaveProperty('id');
    expect(responseBody.order).not.toHaveProperty('customerLastName');
    expect(responseBody.order).not.toHaveProperty('depositAddressId');
    expect(rateProvider.getUsdtRubRates).toHaveBeenCalledWith({
      now: NOW,
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
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
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
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
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
    const db = createDb({
      tx,
      readOrder: createReadableOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'awaiting_deposit',
        amountUsdt: { toString: () => '5000.000000' },
        amountRub: { toString: () => '381250.00' },
        rateSnapshot: { toString: () => '76.250000' },
        depositAddress: {
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
        clientPayoutAddress: null,
      }),
    });
    const app = createApiApp({
      db,
      rateProvider: createStaticRateProvider(),
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
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
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
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
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
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E74737',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/sell',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountUsdt: '5000.000000',
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
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
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

  it('rejects malformed BUY payout addresses at the request DTO layer', async () => {
    const db = createDb();
    const app = createApiApp({
      db,
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        clientPayoutAddress: 'not-a-tron-address',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'invalid_request',
      issues: [
        expect.objectContaining({
          path: 'clientPayoutAddress',
          message: 'clientPayoutAddress must be a valid TRON base58 address',
        }),
      ],
    });
    expect(db._tx.order.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps domain validation errors to validation responses', async () => {
    const app = createApiApp({
      db: createDb(),
      rateProvider: createStaticRateProvider({
        buyRate: '0',
        sellRate: '76.250000',
      }),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
        clientPayoutAddress: PAYOUT_ADDRESS,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'validation_error',
      message: 'buyRate must be a positive decimal string',
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
      rateProvider: createStaticRateProvider(),
      now: () => NOW,
      publicIdFactory: () => 'E97010',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/buy',
      payload: {
        userId: 'user-1',
        ...CUSTOMER_PAYLOAD,
        amountRub: '200000.00',
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
