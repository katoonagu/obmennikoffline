import type { Asset, Network } from '../domain/types.js';
import {
  runUsdtDepositWatcher,
  type DepositWatcherDb,
  type RunUsdtDepositWatcherResult,
} from './runUsdtDepositWatcher.js';
import type { TronProvider } from './tronProvider.js';

export const TRON_USDT_DEPOSIT_CURSOR_ID = 'tron-usdt-deposits';

const WATCHER_CURSOR_SELECT = {
  id: true,
  network: true,
  asset: true,
  lastProcessedBlock: true,
  confirmationDepth: true,
  maxBlockRange: true,
} as const;

export interface WatcherCursorRecord {
  id: string;
  network: Network;
  asset: Asset;
  lastProcessedBlock: bigint;
  confirmationDepth: number;
  maxBlockRange: number;
}

export interface UsdtDepositWatcherCursorDb extends DepositWatcherDb {
  watcherCursor: {
    findUnique(input: {
      where: {
        id: string;
      };
      select: typeof WATCHER_CURSOR_SELECT;
    }): Promise<WatcherCursorRecord | null>;
    updateMany(input: {
      where: {
        id: string;
        lastProcessedBlock: bigint;
      };
      data: {
        lastProcessedBlock: bigint;
        lastRunAt: Date;
      };
    }): Promise<{ count: number }>;
  };
}

export interface UsdtDepositWatcherCursorProvisioningDb {
  watcherCursor: {
    upsert(input: {
      where: {
        id: string;
      };
      create: WatcherCursorRecord;
      update: {
        lastProcessedBlock: bigint;
        confirmationDepth: number;
        maxBlockRange: number;
      };
      select: typeof WATCHER_CURSOR_SELECT;
    }): Promise<WatcherCursorRecord>;
  };
}

export interface TronDepositWatcherCursorProvider extends TronProvider {
  getLatestBlockNumber(): Promise<bigint>;
}

export interface ConfigureUsdtDepositWatcherCursorInput {
  db: UsdtDepositWatcherCursorProvisioningDb;
  cursorId?: string;
  lastProcessedBlock: bigint;
  confirmationDepth: number;
  maxBlockRange: number;
}

export interface RunUsdtDepositWatcherOnceInput {
  db: UsdtDepositWatcherCursorDb;
  provider: TronDepositWatcherCursorProvider;
  cursorId?: string;
  addressBatchSize?: number;
  now?: () => Date;
}

export type RunUsdtDepositWatcherOnceResult =
  | {
      status: 'processed';
      cursorId: string;
      fromBlock: bigint;
      toBlock: bigint;
      latestBlock: bigint;
      safeBlock: bigint;
      watcherResult: RunUsdtDepositWatcherResult;
    }
  | {
      status: 'failed';
      cursorId: string;
      fromBlock: bigint;
      toBlock: bigint;
      latestBlock: bigint;
      safeBlock: bigint;
      watcherResult: RunUsdtDepositWatcherResult;
    }
  | {
      status: 'noop';
      reason: 'no_safe_blocks';
      cursorId: string;
      latestBlock: bigint;
      safeBlock: bigint;
      lastProcessedBlock: bigint;
    };

export async function configureUsdtDepositWatcherCursorInDb(
  input: ConfigureUsdtDepositWatcherCursorInput,
): Promise<WatcherCursorRecord> {
  const cursor: WatcherCursorRecord = {
    id: input.cursorId ?? TRON_USDT_DEPOSIT_CURSOR_ID,
    network: 'TRON',
    asset: 'USDT',
    lastProcessedBlock: input.lastProcessedBlock,
    confirmationDepth: input.confirmationDepth,
    maxBlockRange: input.maxBlockRange,
  };
  assertCursor(cursor);

  return input.db.watcherCursor.upsert({
    where: {
      id: cursor.id,
    },
    create: cursor,
    update: {
      lastProcessedBlock: cursor.lastProcessedBlock,
      confirmationDepth: cursor.confirmationDepth,
      maxBlockRange: cursor.maxBlockRange,
    },
    select: WATCHER_CURSOR_SELECT,
  });
}

export async function runUsdtDepositWatcherOnce(
  input: RunUsdtDepositWatcherOnceInput,
): Promise<RunUsdtDepositWatcherOnceResult> {
  const cursorId = input.cursorId ?? TRON_USDT_DEPOSIT_CURSOR_ID;
  const cursor = await input.db.watcherCursor.findUnique({
    where: {
      id: cursorId,
    },
    select: WATCHER_CURSOR_SELECT,
  });

  if (!cursor) {
    throw new Error(`watcher cursor ${cursorId} is not configured`);
  }

  assertCursor(cursor);

  const latestBlock = await input.provider.getLatestBlockNumber();
  assertLatestBlock(latestBlock);

  const safeBlock = latestBlock - BigInt(cursor.confirmationDepth);
  if (safeBlock <= cursor.lastProcessedBlock) {
    return {
      status: 'noop',
      reason: 'no_safe_blocks',
      cursorId: cursor.id,
      latestBlock,
      safeBlock,
      lastProcessedBlock: cursor.lastProcessedBlock,
    };
  }

  const fromBlock = cursor.lastProcessedBlock + 1n;
  const toBlock = minBigInt(
    cursor.lastProcessedBlock + BigInt(cursor.maxBlockRange),
    safeBlock,
  );
  const watcherResult = await runUsdtDepositWatcher({
    db: input.db,
    provider: input.provider,
    fromBlock,
    toBlock,
    batchSize: input.addressBatchSize,
  });

  if (watcherResult.failedTransfers.length > 0) {
    return {
      status: 'failed',
      cursorId: cursor.id,
      fromBlock,
      toBlock,
      latestBlock,
      safeBlock,
      watcherResult,
    };
  }

  const cursorUpdate = await input.db.watcherCursor.updateMany({
    where: {
      id: cursor.id,
      lastProcessedBlock: cursor.lastProcessedBlock,
    },
    data: {
      lastProcessedBlock: toBlock,
      lastRunAt: (input.now ?? (() => new Date()))(),
    },
  });

  if (cursorUpdate.count !== 1) {
    throw new Error('watcher cursor changed concurrently');
  }

  return {
    status: 'processed',
    cursorId: cursor.id,
    fromBlock,
    toBlock,
    latestBlock,
    safeBlock,
    watcherResult,
  };
}

function assertCursor(cursor: WatcherCursorRecord): void {
  if (cursor.network !== 'TRON' || cursor.asset !== 'USDT') {
    throw new Error('watcher cursor must be configured for TRON USDT');
  }
  if (typeof cursor.lastProcessedBlock !== 'bigint' || cursor.lastProcessedBlock < 0n) {
    throw new Error('lastProcessedBlock must be a non-negative bigint');
  }
  if (
    !Number.isSafeInteger(cursor.confirmationDepth) ||
    cursor.confirmationDepth < 0
  ) {
    throw new Error('confirmationDepth must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(cursor.maxBlockRange) || cursor.maxBlockRange <= 0) {
    throw new Error('maxBlockRange must be a positive safe integer');
  }
}

function assertLatestBlock(latestBlock: bigint): void {
  if (typeof latestBlock !== 'bigint' || latestBlock < 0n) {
    throw new Error('latestBlock must be a non-negative bigint');
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left <= right ? left : right;
}
