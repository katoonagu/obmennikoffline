import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_ORDER_STATUSES,
  HISTORY_ORDER_STATUSES,
  getOrderByPublicId,
  getUserProfile,
  listAllActiveOrders,
  listActiveOrders,
  listHistoryOrders,
  type OrderReadDb,
  type ReadableOrderRecord,
} from '../../src/orders/orderReadService.js';

const CREATED_AT = new Date('2026-05-11T09:00:00.000Z');
const UPDATED_AT = new Date('2026-05-11T09:05:00.000Z');
const RATE_EXPIRES_AT = new Date('2026-05-11T09:20:00.000Z');
const ORDER_EXPIRES_AT = new Date('2026-05-11T10:00:00.000Z');

function createOrderRecord(
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
    rateExpiresAt: RATE_EXPIRES_AT,
    orderExpiresAt: ORDER_EXPIRES_AT,
    status: 'awaiting_deposit',
    depositAddress: {
      address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
    },
    clientPayoutAddress: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    completedAt: null,
    ...overrides,
  };
}

function createDb(input?: {
  orders?: ReadableOrderRecord[];
  order?: ReadableOrderRecord | null;
  countByCall?: number[];
}): OrderReadDb {
  const countByCall = input?.countByCall ?? [2, 1];

  return {
    order: {
      findMany: vi.fn(async () => input?.orders ?? []),
      findFirst: vi.fn(async () => input?.order ?? null),
      count: vi.fn(async () => countByCall.shift() ?? 0),
    },
    telegramProfile: {
      findUnique: vi.fn(async () => ({
        telegramUserId: 462656683n,
        username: 'pavel',
        firstName: 'Pavel',
        lastName: 'Alekseev',
      })),
    },
  };
}

describe('orderReadService', () => {
  it('lists active orders for one user and serializes database decimals and dates', async () => {
    const db = createDb({
      orders: [createOrderRecord()],
    });

    await expect(listActiveOrders(db, { userId: 'user-1' })).resolves.toEqual([
      {
        publicId: 'E74737',
        direction: 'SELL_USDT',
        asset: 'USDT',
        network: 'TRON',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        rateExpiresAt: '2026-05-11T09:20:00.000Z',
        orderExpiresAt: '2026-05-11T10:00:00.000Z',
        status: 'awaiting_deposit',
        depositAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        clientPayoutAddress: null,
        createdAt: '2026-05-11T09:00:00.000Z',
        updatedAt: '2026-05-11T09:05:00.000Z',
        completedAt: null,
      },
    ]);

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: {
            in: ACTIVE_ORDER_STATUSES,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      }),
    );
  });

  it('lists all active orders for manager queues without a user filter', async () => {
    const db = createDb({
      orders: [createOrderRecord()],
    });

    await expect(listAllActiveOrders(db, { limit: 10 })).resolves.toMatchObject([
      {
        publicId: 'E74737',
        status: 'awaiting_deposit',
      },
    ]);

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: ACTIVE_ORDER_STATUSES,
          },
        },
        take: 10,
      }),
    );
  });

  it('lists history orders separately from active operational states', async () => {
    const db = createDb({
      orders: [
        createOrderRecord({
          status: 'completed',
          completedAt: new Date('2026-05-11T10:30:00.000Z'),
        }),
      ],
    });

    await expect(
      listHistoryOrders(db, { userId: 'user-1', limit: 5 }),
    ).resolves.toMatchObject([
      {
        publicId: 'E74737',
        status: 'completed',
        completedAt: '2026-05-11T10:30:00.000Z',
      },
    ]);

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: {
            in: HISTORY_ORDER_STATUSES,
          },
        },
        take: 5,
      }),
    );
  });

  it('serializes nullable order amount fields as null values', async () => {
    const db = createDb({
      orders: [
        createOrderRecord({
          amountUsdt: null,
          amountRub: null,
        }),
      ],
    });

    await expect(listActiveOrders(db, { userId: 'user-1' })).resolves.toMatchObject([
      {
        amountUsdt: null,
        amountRub: null,
        rateSnapshot: '76.250000',
      },
    ]);
  });

  it('loads order details only when public id belongs to the requested user', async () => {
    const db = createDb({
      order: createOrderRecord({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        status: 'awaiting_office_visit',
        depositAddress: null,
        clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
      }),
    });

    await expect(
      getOrderByPublicId(db, {
        userId: 'user-1',
        publicId: 'E97010',
      }),
    ).resolves.toMatchObject({
      publicId: 'E97010',
      direction: 'BUY_USDT',
      depositAddress: null,
      clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
    });

    expect(db.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          publicId: 'E97010',
        },
      }),
    );
  });

  it('returns null for missing order details', async () => {
    const db = createDb({
      order: null,
    });

    await expect(
      getOrderByPublicId(db, {
        userId: 'user-1',
        publicId: 'E40400',
      }),
    ).resolves.toBeNull();
  });

  it('loads profile details and user order counters', async () => {
    const db = createDb({
      countByCall: [7, 2],
    });

    await expect(getUserProfile(db, { userId: 'user-1' })).resolves.toEqual({
      userId: 'user-1',
      telegram: {
        telegramUserId: '462656683',
        username: 'pavel',
        firstName: 'Pavel',
        lastName: 'Alekseev',
      },
      stats: {
        totalOrders: 7,
        activeOrders: 2,
      },
    });

    expect(db.telegramProfile.findUnique).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
      select: {
        telegramUserId: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });
    expect(db.order.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
    });
    expect(db.order.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: {
          in: ACTIVE_ORDER_STATUSES,
        },
      },
    });
  });
});
