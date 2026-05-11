import type {
  DepositAddressStatus,
  OrderDirection,
  OrderStatus,
} from '../domain/types.js';

export interface ExpirableOrderRecord {
  id: string;
  publicId: string;
  direction: OrderDirection;
  status: Extract<OrderStatus, 'awaiting_deposit' | 'awaiting_office_visit'>;
  orderExpiresAt: Date;
  depositAddress: {
    id: string;
    status: DepositAddressStatus;
  } | null;
}

export interface OrderExpirationTransaction {
  order: {
    findMany(input: {
      where: {
        status: {
          in: Array<Extract<OrderStatus, 'awaiting_deposit' | 'awaiting_office_visit'>>;
        };
        orderExpiresAt: {
          lte: Date;
        };
      };
      orderBy: {
        orderExpiresAt: 'asc';
      };
      take: number;
      select: typeof EXPIRABLE_ORDER_SELECT;
    }): Promise<ExpirableOrderRecord[]>;
    updateMany(input: {
      where: {
        id: string;
        status: OrderStatus;
      };
      data: {
        status: 'expired';
      };
    }): Promise<{ count: number }>;
  };
  depositAddress: {
    updateMany(input: {
      where: {
        id: string;
        status: 'reserved';
      };
      data: {
        status: 'expired';
      };
    }): Promise<{ count: number }>;
  };
  auditLog: {
    create(input: {
      data: {
        actorId: null;
        action: 'order_expired';
        entityType: 'Order';
        entityId: string;
        orderId: string;
        metadata: Record<string, string>;
        createdAt: Date;
      };
    }): Promise<unknown>;
  };
}

export interface OrderExpirationDb {
  $transaction<T>(fn: (tx: OrderExpirationTransaction) => Promise<T>): Promise<T>;
}

export interface ExpireOpenOrdersInput {
  now: Date;
  limit?: number;
}

export interface ExpireOpenOrdersResult {
  expiredCount: number;
  skippedCount: number;
  expiredPublicIds: string[];
}

const DEFAULT_EXPIRATION_LIMIT = 100;
const MAX_EXPIRATION_LIMIT = 500;
const EXPIRABLE_ORDER_STATUSES = [
  'awaiting_deposit',
  'awaiting_office_visit',
] as const satisfies Array<Extract<OrderStatus, 'awaiting_deposit' | 'awaiting_office_visit'>>;

const EXPIRABLE_ORDER_SELECT = {
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
} as const;

export async function expireOpenOrdersInDb(
  db: OrderExpirationDb,
  input: ExpireOpenOrdersInput,
): Promise<ExpireOpenOrdersResult> {
  assertValidDate(input.now, 'now');
  const limit = normalizeLimit(input.limit);

  return db.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: {
        status: {
          in: [...EXPIRABLE_ORDER_STATUSES],
        },
        orderExpiresAt: {
          lte: input.now,
        },
      },
      orderBy: {
        orderExpiresAt: 'asc',
      },
      take: limit,
      select: EXPIRABLE_ORDER_SELECT,
    });

    let skippedCount = 0;
    const expiredPublicIds: string[] = [];

    for (const order of orders) {
      const orderUpdate = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
        },
        data: {
          status: 'expired',
        },
      });

      if (orderUpdate.count !== 1) {
        skippedCount += 1;
        continue;
      }

      let depositAddressStatus: 'expired' | undefined;
      if (order.depositAddress) {
        const depositAddressUpdate = await tx.depositAddress.updateMany({
          where: {
            id: order.depositAddress.id,
            status: 'reserved',
          },
          data: {
            status: 'expired',
          },
        });

        if (depositAddressUpdate.count !== 1) {
          throw new Error('deposit address is no longer reserved for expiration');
        }

        depositAddressStatus = 'expired';
      }

      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'order_expired',
          entityType: 'Order',
          entityId: order.id,
          orderId: order.id,
          metadata: {
            publicId: order.publicId,
            previousStatus: order.status,
            nextStatus: 'expired',
            direction: order.direction,
            ...(depositAddressStatus ? { depositAddressStatus } : {}),
          },
          createdAt: input.now,
        },
      });

      expiredPublicIds.push(order.publicId);
    }

    return {
      expiredCount: expiredPublicIds.length,
      skippedCount,
      expiredPublicIds,
    };
  });
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_EXPIRATION_LIMIT;
  }

  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_EXPIRATION_LIMIT) {
    throw new Error('limit must be a positive integer up to 500');
  }

  return value;
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
