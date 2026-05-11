import type { DepositAddressStatus, OrderStatus } from '../domain/types.js';
import type { NormalizedBlockchainTransaction } from './normalizeUsdtTransfer.js';

export interface WatchedOrderRecord {
  id: string;
  publicId: string;
  status: OrderStatus;
  amountUsdt: unknown | null;
  orderExpiresAt: Date;
}

export interface WatchedDepositAddressRecord {
  id: string;
  address: string;
  status: DepositAddressStatus;
  order: WatchedOrderRecord | null;
}

export type DepositIngestionResult =
  | {
      status: 'processed';
      orderPublicId: string;
      nextOrderStatus: OrderStatus;
      depositAddressStatus: DepositAddressStatus;
    }
  | {
      status: 'duplicate';
      txId: string;
      logIndex: number;
    }
  | {
      status: 'ignored_unknown_address';
      toAddress: string;
    }
  | {
      status: 'ignored_unassigned_address';
      toAddress: string;
    }
  | {
      status: 'ignored_ineligible_address';
      toAddress: string;
      currentStatus: DepositAddressStatus;
    }
  | {
      status: 'ignored_ineligible_order';
      orderPublicId: string;
      currentStatus: OrderStatus;
    };

export interface DepositIngestionTransaction {
  depositAddress: {
    findUnique(input: {
      where: {
        address: string;
      };
      select: typeof WATCHED_DEPOSIT_ADDRESS_SELECT;
    }): Promise<WatchedDepositAddressRecord | null>;
    updateMany(input: {
      where: {
        id: string;
        status: DepositAddressStatus;
      };
      data: {
        status: DepositAddressStatus;
        fundedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
  blockchainTransaction: {
    create(input: {
      data: {
        network: 'TRON';
        asset: 'USDT';
        txId: string;
        logIndex: number;
        fromAddress: string;
        toAddress: string;
        amount: string;
        blockNumber: bigint;
        blockTimestamp: Date;
        orderId: string;
      };
    }): Promise<unknown>;
  };
  order: {
    updateMany(input: {
      where: {
        id: string;
        status: 'awaiting_deposit';
      };
      data: {
        status: OrderStatus;
      };
    }): Promise<{ count: number }>;
  };
  auditLog: {
    create(input: {
      data: {
        actorId: null;
        action: 'tron_deposit_detected';
        entityType: 'Order';
        entityId: string;
        orderId: string;
        metadata: Record<string, unknown>;
        createdAt: Date;
      };
    }): Promise<unknown>;
  };
}

export interface DepositIngestionDb {
  $transaction<T>(fn: (tx: DepositIngestionTransaction) => Promise<T>): Promise<T>;
}

const WATCHED_DEPOSIT_ADDRESS_SELECT = {
  id: true,
  address: true,
  status: true,
  order: {
    select: {
      id: true,
      publicId: true,
      status: true,
      amountUsdt: true,
      orderExpiresAt: true,
    },
  },
} as const;

export async function ingestUsdtDepositInDb(
  db: DepositIngestionDb,
  input: {
    transfer: NormalizedBlockchainTransaction;
  },
): Promise<DepositIngestionResult> {
  return db.$transaction(async (tx) => {
    const depositAddress = await tx.depositAddress.findUnique({
      where: {
        address: input.transfer.toAddress,
      },
      select: WATCHED_DEPOSIT_ADDRESS_SELECT,
    });

    if (!depositAddress) {
      return {
        status: 'ignored_unknown_address',
        toAddress: input.transfer.toAddress,
      };
    }

    if (!depositAddress.order) {
      return {
        status: 'ignored_unassigned_address',
        toAddress: input.transfer.toAddress,
      };
    }

    const order = depositAddress.order;
    if (depositAddress.status !== 'reserved') {
      return {
        status: 'ignored_ineligible_address',
        toAddress: input.transfer.toAddress,
        currentStatus: depositAddress.status,
      };
    }
    if (order.status !== 'awaiting_deposit') {
      return {
        status: 'ignored_ineligible_order',
        orderPublicId: order.publicId,
        currentStatus: order.status,
      };
    }

    try {
      await tx.blockchainTransaction.create({
        data: {
          network: input.transfer.network,
          asset: input.transfer.asset,
          txId: input.transfer.txId,
          logIndex: input.transfer.logIndex,
          fromAddress: input.transfer.fromAddress,
          toAddress: input.transfer.toAddress,
          amount: input.transfer.amount,
          blockNumber: input.transfer.blockNumber,
          blockTimestamp: input.transfer.blockTimestamp,
          orderId: order.id,
        },
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return {
          status: 'duplicate',
          txId: input.transfer.txId,
          logIndex: input.transfer.logIndex,
        };
      }

      throw error;
    }

    const expectedAmountUsdt = toNullableDecimalString(order.amountUsdt);
    const nextOrderStatus = decideNextOrderStatus({
      transfer: input.transfer,
      order,
      expectedAmountUsdt,
    });
    const nextDepositAddressStatus =
      nextOrderStatus === 'late_payment' ? 'late_funded' : 'funded';

    const orderUpdate = await tx.order.updateMany({
      where: {
        id: order.id,
        status: 'awaiting_deposit',
      },
      data: {
        status: nextOrderStatus,
      },
    });

    if (orderUpdate.count !== 1) {
      throw new Error('order is no longer awaiting deposit');
    }

    const depositAddressUpdate = await tx.depositAddress.updateMany({
      where: {
        id: depositAddress.id,
        status: 'reserved',
      },
      data: {
        status: nextDepositAddressStatus,
        fundedAt: input.transfer.blockTimestamp,
      },
    });

    if (depositAddressUpdate.count !== 1) {
      throw new Error('deposit address is no longer reserved');
    }

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: 'tron_deposit_detected',
        entityType: 'Order',
        entityId: order.id,
        orderId: order.id,
        metadata: {
          publicId: order.publicId,
          txId: input.transfer.txId,
          logIndex: input.transfer.logIndex,
          fromAddress: input.transfer.fromAddress,
          toAddress: input.transfer.toAddress,
          amount: input.transfer.amount,
          expectedAmountUsdt,
          previousStatus: order.status,
          nextStatus: nextOrderStatus,
          depositAddressStatus: nextDepositAddressStatus,
        },
        createdAt: input.transfer.blockTimestamp,
      },
    });

    return {
      status: 'processed',
      orderPublicId: order.publicId,
      nextOrderStatus,
      depositAddressStatus: nextDepositAddressStatus,
    };
  });
}

function decideNextOrderStatus(input: {
  transfer: NormalizedBlockchainTransaction;
  order: WatchedOrderRecord;
  expectedAmountUsdt: string | null;
}): OrderStatus {
  if (input.expectedAmountUsdt !== input.transfer.amount) {
    return 'manager_review';
  }

  if (input.transfer.blockTimestamp.getTime() > input.order.orderExpiresAt.getTime()) {
    return 'late_payment';
  }

  return 'funds_detected';
}

function toNullableDecimalString(value: unknown | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (hasToFixed(value)) {
    return value.toFixed(6);
  }

  return normalizeUsdtDecimalString(String(value));
}

function hasToFixed(value: unknown): value is { toFixed(scale: number): string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toFixed' in value &&
    typeof value.toFixed === 'function'
  );
}

function normalizeUsdtDecimalString(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error('amountUsdt must be a decimal string');
  }

  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.slice(0, 6).padEnd(6, '0')}`;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
