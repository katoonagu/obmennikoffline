import type { DepositAddressStatus, OrderStatus } from '../domain/types.js';
import { normalizeUsdtTransfer } from './normalizeUsdtTransfer.js';
import type { TronProvider, TronTransferEvent } from './tronProvider.js';

export interface ReplayWatchedOrderRecord {
  publicId: string;
  status: OrderStatus;
  amountUsdt: unknown | null;
  orderExpiresAt: Date;
}

export interface ReplayWatchedDepositAddressRecord {
  address: string;
  derivationIndex: number;
  status: DepositAddressStatus;
  reservedAt: Date | null;
  order: ReplayWatchedOrderRecord | null;
}

export interface UsdtDepositReplayDryRunDb {
  depositAddress: {
    findMany(input: {
      where: {
        network: 'TRON';
        asset: 'USDT';
        status: {
          in: DepositAddressStatus[];
        };
        derivationIndex?: {
          gt: number;
        };
      };
      orderBy: {
        derivationIndex: 'asc';
      };
      take: number;
      select: typeof REPLAY_DEPOSIT_ADDRESS_SELECT;
    }): Promise<ReplayWatchedDepositAddressRecord[]>;
  };
}

export interface FailedReplayTransfer {
  txId: string | null;
  logIndex: number | null;
  toAddress: string | null;
  error: string;
}

export type ReplayMatchReason =
  | 'before_reservation'
  | 'amount_mismatch'
  | 'late_payment'
  | 'exact_payment'
  | 'follow_up_review'
  | 'already_late'
  | 'address_not_open'
  | 'order_not_open'
  | 'unassigned_address';

export interface ReplayDepositMatch {
  txId: string;
  logIndex: number;
  toAddress: string;
  orderPublicId: string | null;
  amount: string;
  expectedAmountUsdt: string | null;
  blockTimestamp: Date;
  reservedAt: Date | null;
  wouldIngest: boolean;
  nextOrderStatus: OrderStatus | null;
  reason: ReplayMatchReason;
}

export interface RunUsdtDepositReplayDryRunInput {
  db: UsdtDepositReplayDryRunDb;
  provider: TronProvider;
  fromBlock: bigint;
  toBlock: bigint;
  batchSize?: number;
}

export interface RunUsdtDepositReplayDryRunResult {
  watchedAddressCount: number;
  fetchedTransferCount: number;
  matches: ReplayDepositMatch[];
  failedTransfers: FailedReplayTransfer[];
}

const DEFAULT_BATCH_SIZE = 100;
const WATCHED_DEPOSIT_ADDRESS_STATUSES = [
  'reserved',
  'expired',
  'funded',
  'late_funded',
] as const satisfies readonly DepositAddressStatus[];

const OPEN_FOR_REPLAY_INGESTION = new Set<OrderStatus>([
  'awaiting_deposit',
  'expired',
  'manager_review',
  'late_payment',
]);

const REPLAY_DEPOSIT_ADDRESS_SELECT = {
  address: true,
  derivationIndex: true,
  status: true,
  reservedAt: true,
  order: {
    select: {
      publicId: true,
      status: true,
      amountUsdt: true,
      orderExpiresAt: true,
    },
  },
} as const;

export async function runUsdtDepositReplayDryRun(
  input: RunUsdtDepositReplayDryRunInput,
): Promise<RunUsdtDepositReplayDryRunResult> {
  assertBlockRange(input.fromBlock, input.toBlock);
  const batchSize = normalizeBatchSize(input.batchSize);
  const matches: ReplayDepositMatch[] = [];
  const failedTransfers: FailedReplayTransfer[] = [];
  let watchedAddressCount = 0;
  let fetchedTransferCount = 0;
  let lastDerivationIndex: number | undefined;

  while (true) {
    const watchedAddresses = await input.db.depositAddress.findMany({
      where: {
        network: 'TRON',
        asset: 'USDT',
        status: {
          in: [...WATCHED_DEPOSIT_ADDRESS_STATUSES],
        },
        ...(lastDerivationIndex === undefined
          ? {}
          : {
              derivationIndex: {
                gt: lastDerivationIndex,
              },
            }),
      },
      orderBy: {
        derivationIndex: 'asc',
      },
      take: batchSize,
      select: REPLAY_DEPOSIT_ADDRESS_SELECT,
    });

    if (watchedAddresses.length === 0) {
      break;
    }

    watchedAddressCount += watchedAddresses.length;
    lastDerivationIndex =
      watchedAddresses[watchedAddresses.length - 1]?.derivationIndex;
    const watchedByAddress = new Map(
      watchedAddresses.map((address) => [address.address, address]),
    );
    const transferEvents = await input.provider.getUsdtTransfersToAddresses({
      addresses: watchedAddresses.map((address) => address.address),
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
    });

    fetchedTransferCount += transferEvents.length;

    for (const event of transferEvents) {
      try {
        const transfer = normalizeUsdtTransfer(event);
        const watchedAddress = watchedByAddress.get(transfer.toAddress);
        if (!watchedAddress) {
          continue;
        }
        matches.push(classifyReplayTransfer(watchedAddress, transfer));
      } catch (error) {
        failedTransfers.push(toFailedTransfer(event, error));
      }
    }

    if (watchedAddresses.length < batchSize) {
      break;
    }
  }

  return {
    watchedAddressCount,
    fetchedTransferCount,
    matches,
    failedTransfers,
  };
}

function classifyReplayTransfer(
  address: ReplayWatchedDepositAddressRecord,
  transfer: ReturnType<typeof normalizeUsdtTransfer>,
): ReplayDepositMatch {
  const expectedAmountUsdt = address.order
    ? toNullableDecimalString(address.order.amountUsdt)
    : null;
  const base = {
    txId: transfer.txId,
    logIndex: transfer.logIndex,
    toAddress: transfer.toAddress,
    orderPublicId: address.order?.publicId ?? null,
    amount: transfer.amount,
    expectedAmountUsdt,
    blockTimestamp: transfer.blockTimestamp,
    reservedAt: address.reservedAt,
  };

  if (!address.order) {
    return {
      ...base,
      wouldIngest: false,
      nextOrderStatus: null,
      reason: 'unassigned_address',
    };
  }

  if (
    address.reservedAt &&
    transfer.blockTimestamp.getTime() < address.reservedAt.getTime()
  ) {
    return {
      ...base,
      wouldIngest: false,
      nextOrderStatus: null,
      reason: 'before_reservation',
    };
  }

  if (!WATCHED_DEPOSIT_ADDRESS_STATUSES.includes(address.status as never)) {
    return {
      ...base,
      wouldIngest: false,
      nextOrderStatus: null,
      reason: 'address_not_open',
    };
  }

  if (!OPEN_FOR_REPLAY_INGESTION.has(address.order.status)) {
    return {
      ...base,
      wouldIngest: false,
      nextOrderStatus: null,
      reason: 'order_not_open',
    };
  }

  if (address.order.status === 'manager_review') {
    return {
      ...base,
      wouldIngest: true,
      nextOrderStatus: 'manager_review',
      reason: 'follow_up_review',
    };
  }

  if (address.order.status === 'late_payment') {
    return {
      ...base,
      wouldIngest: true,
      nextOrderStatus: 'late_payment',
      reason: 'already_late',
    };
  }

  if (expectedAmountUsdt !== transfer.amount) {
    return {
      ...base,
      wouldIngest: true,
      nextOrderStatus: 'manager_review',
      reason: 'amount_mismatch',
    };
  }

  if (transfer.blockTimestamp.getTime() > address.order.orderExpiresAt.getTime()) {
    return {
      ...base,
      wouldIngest: true,
      nextOrderStatus: 'late_payment',
      reason: 'late_payment',
    };
  }

  return {
    ...base,
    wouldIngest: true,
    nextOrderStatus: 'funds_detected',
    reason: 'exact_payment',
  };
}

function assertBlockRange(fromBlock: bigint, toBlock: bigint): void {
  if (fromBlock < 0n) {
    throw new Error('fromBlock must be a non-negative bigint');
  }
  if (toBlock < 0n) {
    throw new Error('toBlock must be a non-negative bigint');
  }
  if (fromBlock > toBlock) {
    throw new Error('fromBlock must be less than or equal to toBlock');
  }
}

function normalizeBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined) {
    return DEFAULT_BATCH_SIZE;
  }
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive safe integer');
  }

  return batchSize;
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

function toFailedTransfer(
  event: TronTransferEvent,
  error: unknown,
): FailedReplayTransfer {
  return {
    txId: typeof event.txId === 'string' ? event.txId : null,
    logIndex: typeof event.logIndex === 'number' ? event.logIndex : null,
    toAddress: typeof event.toAddress === 'string' ? event.toAddress : null,
    error: getErrorMessage(error),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
