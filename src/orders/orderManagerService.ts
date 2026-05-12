import type { OrderDirection, OrderStatus } from '../domain/types.js';

export interface ManagerOrderRecord {
  id: string;
  publicId: string;
  direction: OrderDirection;
  status: OrderStatus;
  clientPayoutAddress: string | null;
}

export interface OrderManagerTransaction<TOrder> {
  order: {
    findUnique(input: {
      where: {
        publicId: string;
      };
      select: typeof MANAGER_ORDER_SELECT;
    }): Promise<ManagerOrderRecord | null>;
    update(input: {
      where: {
        publicId: string;
        payoutTxId?: null;
        status?: {
          in: OrderStatus[];
        };
      };
      data: Record<string, unknown>;
    }): Promise<TOrder>;
  };
  auditLog: {
    create(input: {
      data: {
        actorId: string;
        action: string;
        entityType: 'Order';
        entityId: string;
        orderId: string;
        metadata: Record<string, string>;
        createdAt: Date;
      };
    }): Promise<unknown>;
  };
}

export interface OrderManagerDb<TOrder> {
  $transaction<T>(fn: (tx: OrderManagerTransaction<TOrder>) => Promise<T>): Promise<T>;
}

export interface RecordManualCryptoPayoutInput {
  publicId: string;
  actorId: string;
  txId: string;
  comment?: string;
  now: Date;
}

export interface SetManagerOrderStatusInput {
  publicId: string;
  actorId: string;
  status: OrderStatus;
  comment?: string;
  now: Date;
}

const MANAGER_SETTABLE_STATUSES = new Set<OrderStatus>([
  'pending_aml',
  'manager_review',
  'ready_for_cash_payout',
  'ready_for_crypto_payout',
  'completed',
  'cancelled',
  'expired',
  'rejected',
]);

const OPEN_FOR_MANUAL_CRYPTO_PAYOUT = new Set<OrderStatus>([
  'awaiting_office_visit',
  'manager_review',
  'ready_for_crypto_payout',
]);

const TRON_TX_ID_PATTERN = /^[0-9a-fA-F]{64}$/;
const MAX_AUDIT_COMMENT_LENGTH = 500;

const MANAGER_ORDER_SELECT = {
  id: true,
  publicId: true,
  direction: true,
  status: true,
  clientPayoutAddress: true,
} as const;

export async function recordManualCryptoPayoutInDb<TOrder>(
  db: OrderManagerDb<TOrder>,
  input: RecordManualCryptoPayoutInput,
): Promise<TOrder> {
  const publicId = assertRequiredString(input.publicId, 'publicId');
  const actorId = assertRequiredString(input.actorId, 'actorId');
  const txId = normalizeTronTxId(input.txId);
  const comment = normalizeOptionalComment(input.comment);
  assertValidDate(input.now, 'now');

  return db.$transaction(async (tx) => {
    const order = await findManagerOrder(tx, publicId);

    if (order.direction !== 'BUY_USDT') {
      throw new Error('manual crypto payout can only be recorded for BUY_USDT orders');
    }
    if (!OPEN_FOR_MANUAL_CRYPTO_PAYOUT.has(order.status)) {
      throw new Error('order is not open for manual crypto payout');
    }
    if (!order.clientPayoutAddress) {
      throw new Error('clientPayoutAddress is required for manual crypto payout');
    }

    const updated = await updateManualCryptoPayout(tx, {
      publicId,
      actorId,
      txId,
      now: input.now,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'manual_crypto_payout_recorded',
        entityType: 'Order',
        entityId: order.id,
        orderId: order.id,
        metadata: withOptionalComment(
          {
            publicId,
            previousStatus: order.status,
            nextStatus: 'completed',
            txId,
            clientPayoutAddress: order.clientPayoutAddress,
          },
          comment,
        ),
        createdAt: input.now,
      },
    });

    return updated;
  });
}

export async function setManagerOrderStatusInDb<TOrder>(
  db: OrderManagerDb<TOrder>,
  input: SetManagerOrderStatusInput,
): Promise<TOrder> {
  const publicId = assertRequiredString(input.publicId, 'publicId');
  const actorId = assertRequiredString(input.actorId, 'actorId');
  const comment = normalizeOptionalComment(input.comment);
  assertValidDate(input.now, 'now');

  if (!MANAGER_SETTABLE_STATUSES.has(input.status)) {
    throw new Error('target status is not manager-settable');
  }

  return db.$transaction(async (tx) => {
    const order = await findManagerOrder(tx, publicId);

    if (order.direction === 'BUY_USDT' && input.status === 'completed') {
      throw new Error('BUY_USDT completion requires manual crypto payout tx id');
    }

    const updated = await tx.order.update({
      where: {
        publicId,
      },
      data: {
        status: input.status,
        ...(input.status === 'completed' ? { completedAt: input.now } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'manager_order_status_changed',
        entityType: 'Order',
        entityId: order.id,
        orderId: order.id,
        metadata: withOptionalComment(
          {
            publicId,
            previousStatus: order.status,
            nextStatus: input.status,
          },
          comment,
        ),
        createdAt: input.now,
      },
    });

    return updated;
  });
}

async function updateManualCryptoPayout<TOrder>(
  tx: OrderManagerTransaction<TOrder>,
  input: {
    publicId: string;
    actorId: string;
    txId: string;
    now: Date;
  },
): Promise<TOrder> {
  try {
    return await tx.order.update({
      where: {
        publicId: input.publicId,
        payoutTxId: null,
        status: {
          in: [...OPEN_FOR_MANUAL_CRYPTO_PAYOUT],
        },
      },
      data: {
        status: 'completed',
        completedAt: input.now,
        payoutTxId: input.txId,
        payoutTxRecordedAt: input.now,
        payoutTxRecordedBy: input.actorId,
      },
    });
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) {
      throw new Error('order is no longer open for manual crypto payout');
    }

    throw error;
  }
}

async function findManagerOrder<TOrder>(
  tx: OrderManagerTransaction<TOrder>,
  publicId: string,
): Promise<ManagerOrderRecord> {
  const order = await tx.order.findUnique({
    where: {
      publicId,
    },
    select: MANAGER_ORDER_SELECT,
  });

  if (!order) {
    throw new Error('order not found');
  }

  return order;
}

function isPrismaRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  );
}

function normalizeTronTxId(value: unknown): string {
  if (typeof value !== 'string' || !TRON_TX_ID_PATTERN.test(value)) {
    throw new Error('txId must be a 64-character hex TRON transaction id');
  }

  return value.toLowerCase();
}

function withOptionalComment(
  metadata: Record<string, string>,
  comment: string | undefined,
): Record<string, string> {
  if (!comment) {
    return metadata;
  }

  return {
    ...metadata,
    comment,
  };
}

function normalizeOptionalComment(comment: unknown): string | undefined {
  if (comment === undefined) {
    return undefined;
  }

  const normalized = assertRequiredString(comment, 'comment');
  if (normalized.length > MAX_AUDIT_COMMENT_LENGTH) {
    throw new Error('comment must be at most 500 characters');
  }

  return normalized;
}

function assertRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
