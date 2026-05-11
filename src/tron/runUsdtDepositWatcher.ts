import type { DepositAddressStatus } from '../domain/types.js';
import {
  ingestUsdtDepositInDb,
  type DepositIngestionDb,
  type DepositIngestionResult,
} from './ingestUsdtDeposit.js';
import { normalizeUsdtTransfer } from './normalizeUsdtTransfer.js';
import type { TronProvider, TronTransferEvent } from './tronProvider.js';

export interface DepositWatcherDb extends DepositIngestionDb {
  depositAddress: {
    findMany(input: {
      where: {
        network: 'TRON';
        asset: 'USDT';
        status: {
          in: Array<Extract<DepositAddressStatus, 'reserved' | 'expired'>>;
        };
        derivationIndex?: {
          gt: number;
        };
        order: {
          is: {
            status: {
              in: Array<'awaiting_deposit' | 'expired'>;
            };
          };
        };
      };
      orderBy: {
        derivationIndex: 'asc';
      };
      take: number;
      select: {
        address: true;
        derivationIndex: true;
      };
    }): Promise<Array<{ address: string; derivationIndex: number }>>;
  };
}

export interface FailedTransfer {
  txId: string | null;
  logIndex: number | null;
  toAddress: string | null;
  error: string;
}

export interface RunUsdtDepositWatcherInput {
  db: DepositWatcherDb;
  provider: TronProvider;
  fromBlock: bigint;
  toBlock: bigint;
  batchSize?: number;
}

export interface RunUsdtDepositWatcherResult {
  watchedAddressCount: number;
  fetchedTransferCount: number;
  ingested: DepositIngestionResult[];
  failedTransfers: FailedTransfer[];
}

const DEFAULT_BATCH_SIZE = 100;

export async function runUsdtDepositWatcher(
  input: RunUsdtDepositWatcherInput,
): Promise<RunUsdtDepositWatcherResult> {
  assertBlockRange(input.fromBlock, input.toBlock);
  const batchSize = normalizeBatchSize(input.batchSize);

  const ingested: DepositIngestionResult[] = [];
  const failedTransfers: FailedTransfer[] = [];
  let watchedAddressCount = 0;
  let fetchedTransferCount = 0;
  let lastDerivationIndex: number | undefined;

  while (true) {
    const watchedAddresses = await input.db.depositAddress.findMany({
      where: {
        network: 'TRON',
        asset: 'USDT',
        status: {
          in: ['reserved', 'expired'],
        },
        ...(lastDerivationIndex === undefined
          ? {}
          : {
              derivationIndex: {
                gt: lastDerivationIndex,
              },
            }),
        order: {
          is: {
            status: {
              in: ['awaiting_deposit', 'expired'],
            },
          },
        },
      },
      orderBy: {
        derivationIndex: 'asc',
      },
      take: batchSize,
      select: {
        address: true,
        derivationIndex: true,
      },
    });

    if (watchedAddresses.length === 0) {
      break;
    }

    watchedAddressCount += watchedAddresses.length;
    lastDerivationIndex =
      watchedAddresses[watchedAddresses.length - 1]?.derivationIndex;

    const transferEvents = await input.provider.getUsdtTransfersToAddresses({
      addresses: watchedAddresses.map((address) => address.address),
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
    });

    fetchedTransferCount += transferEvents.length;

    for (const event of transferEvents) {
      try {
        const transfer = normalizeUsdtTransfer(event);
        ingested.push(await ingestUsdtDepositInDb(input.db, { transfer }));
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
    ingested,
    failedTransfers,
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

function toFailedTransfer(
  event: TronTransferEvent,
  error: unknown,
): FailedTransfer {
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
