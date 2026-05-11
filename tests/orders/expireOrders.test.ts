import { describe, expect, it, vi } from 'vitest';
import {
  expireOpenOrdersInDb,
  type ExpirableOrderRecord,
  type OrderExpirationDb,
  type OrderExpirationTransaction,
} from '../../src/orders/expireOrders.js';

const NOW = new Date('2026-05-11T10:00:00.000Z');

function createExpirableOrder(
  overrides: Partial<ExpirableOrderRecord> = {},
): ExpirableOrderRecord {
  return {
    id: 'order-db-1',
    publicId: 'E74737',
    direction: 'SELL_USDT',
    status: 'awaiting_deposit',
    orderExpiresAt: new Date('2026-05-11T09:59:00.000Z'),
    depositAddress: {
      id: 'addr-1',
      status: 'reserved',
    },
    ...overrides,
  };
}

function createTx(orders: ExpirableOrderRecord[]): OrderExpirationTransaction {
  return {
    order: {
      findMany: vi.fn(async () => orders),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    depositAddress: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({
        id: 'audit-1',
        ...data,
      })),
    },
  };
}

function createDb(tx: OrderExpirationTransaction): OrderExpirationDb {
  return {
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

describe('expireOpenOrdersInDb', () => {
  it('expires due SELL and BUY orders, closes reserved deposit addresses, and writes audit logs', async () => {
    const sellOrder = createExpirableOrder();
    const buyOrder = createExpirableOrder({
      id: 'order-db-2',
      publicId: 'E97010',
      direction: 'BUY_USDT',
      status: 'awaiting_office_visit',
      depositAddress: null,
    });
    const tx = createTx([sellOrder, buyOrder]);
    const db = createDb(tx);

    await expect(expireOpenOrdersInDb(db, { now: NOW, limit: 50 })).resolves.toEqual({
      expiredCount: 2,
      skippedCount: 0,
      expiredPublicIds: ['E74737', 'E97010'],
    });

    expect(tx.order.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['awaiting_deposit', 'awaiting_office_visit'],
        },
        orderExpiresAt: {
          lte: NOW,
        },
      },
      orderBy: {
        orderExpiresAt: 'asc',
      },
      take: 50,
      select: {
        id: true,
        publicId: true,
        direction: true,
        status: true,
        orderExpiresAt: true,
        depositAddress: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'addr-1',
        status: 'reserved',
      },
      data: {
        status: 'expired',
      },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        status: 'awaiting_deposit',
      },
      data: {
        status: 'expired',
      },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-db-2',
        status: 'awaiting_office_visit',
      },
      data: {
        status: 'expired',
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'order_expired',
        entityType: 'Order',
        entityId: 'order-db-1',
        orderId: 'order-db-1',
        metadata: {
          publicId: 'E74737',
          previousStatus: 'awaiting_deposit',
          nextStatus: 'expired',
          direction: 'SELL_USDT',
          depositAddressStatus: 'expired',
        },
        createdAt: NOW,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'order_expired',
        entityType: 'Order',
        entityId: 'order-db-2',
        orderId: 'order-db-2',
        metadata: {
          publicId: 'E97010',
          previousStatus: 'awaiting_office_visit',
          nextStatus: 'expired',
          direction: 'BUY_USDT',
        },
        createdAt: NOW,
      },
    });
  });

  it('skips orders that changed concurrently without writing misleading audit logs', async () => {
    const tx = createTx([createExpirableOrder()]);
    vi.mocked(tx.order.updateMany).mockResolvedValueOnce({ count: 0 });
    const db = createDb(tx);

    await expect(expireOpenOrdersInDb(db, { now: NOW })).resolves.toEqual({
      expiredCount: 0,
      skippedCount: 1,
      expiredPublicIds: [],
    });

    expect(tx.depositAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
