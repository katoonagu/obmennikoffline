import { describe, expect, it, vi } from 'vitest';
import {
  TRON_USDT_DEPOSIT_CURSOR_ID,
  configureUsdtDepositWatcherCursorInDb,
  runUsdtDepositWatcherOnce,
  type UsdtDepositWatcherCursorProvisioningDb,
  type UsdtDepositWatcherCursorDb,
  type WatcherCursorRecord,
} from '../../src/tron/runUsdtDepositWatcherOnce.js';
import {
  USDT_TRC20_CONTRACT_ADDRESS,
  type TronTransferEvent,
} from '../../src/tron/tronProvider.js';

const NOW = new Date('2026-05-11T12:00:00.000Z');
const TX_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const FROM_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const DEPOSIT_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';

function createCursor(
  overrides: Partial<WatcherCursorRecord> = {},
): WatcherCursorRecord {
  return {
    id: TRON_USDT_DEPOSIT_CURSOR_ID,
    network: 'TRON',
    asset: 'USDT',
    lastProcessedBlock: 100n,
    confirmationDepth: 20,
    maxBlockRange: 50,
    ...overrides,
  };
}

function createEvent(overrides: Partial<TronTransferEvent> = {}): TronTransferEvent {
  return {
    txId: TX_ID,
    logIndex: 0,
    contractAddress: USDT_TRC20_CONTRACT_ADDRESS,
    fromAddress: FROM_ADDRESS,
    toAddress: DEPOSIT_ADDRESS,
    amountRaw: '5000000000',
    decimals: 6,
    blockNumber: 110n,
    blockTimestamp: new Date('2026-05-11T11:59:00.000Z'),
    ...overrides,
  };
}

function createDb(input: {
  cursor?: WatcherCursorRecord | null;
  updateCount?: number;
  addresses?: Array<{ address: string; derivationIndex: number }>;
}): UsdtDepositWatcherCursorDb {
  return {
    watcherCursor: {
      findUnique: vi.fn(async () =>
        Object.hasOwn(input, 'cursor') ? input.cursor ?? null : createCursor(),
      ),
      updateMany: vi.fn(async () => ({ count: input.updateCount ?? 1 })),
    },
    depositAddress: {
      findMany: vi.fn(async () => input.addresses ?? []),
    },
    $transaction: vi.fn(async () => {
      throw new Error('transaction should not be used by this test setup');
    }),
  };
}

function createProvider(input: {
  latestBlock: bigint;
  events?: TronTransferEvent[];
}) {
  return {
    getLatestBlockNumber: vi.fn(async () => input.latestBlock),
    getUsdtTransfersToAddresses: vi.fn(async () => input.events ?? []),
  };
}

function createProvisioningDb(
  result: WatcherCursorRecord = createCursor({ lastProcessedBlock: 123n }),
): UsdtDepositWatcherCursorProvisioningDb {
  return {
    watcherCursor: {
      upsert: vi.fn(async () => result),
    },
  };
}

describe('runUsdtDepositWatcherOnce', () => {
  it('processes the next safe block window and advances the cursor after success', async () => {
    const db = createDb({
      addresses: [{ address: DEPOSIT_ADDRESS, derivationIndex: 7 }],
    });
    const provider = createProvider({ latestBlock: 175n });

    await expect(
      runUsdtDepositWatcherOnce({
        db,
        provider,
        now: () => NOW,
      }),
    ).resolves.toEqual({
      status: 'processed',
      cursorId: TRON_USDT_DEPOSIT_CURSOR_ID,
      fromBlock: 101n,
      toBlock: 150n,
      latestBlock: 175n,
      safeBlock: 155n,
      watcherResult: {
        watchedAddressCount: 1,
        fetchedTransferCount: 0,
        ingested: [],
        failedTransfers: [],
      },
    });

    expect(provider.getUsdtTransfersToAddresses).toHaveBeenCalledWith({
      addresses: [DEPOSIT_ADDRESS],
      fromBlock: 101n,
      toBlock: 150n,
    });
    expect(db.watcherCursor.updateMany).toHaveBeenCalledWith({
      where: {
        id: TRON_USDT_DEPOSIT_CURSOR_ID,
        lastProcessedBlock: 100n,
      },
      data: {
        lastProcessedBlock: 150n,
        lastRunAt: NOW,
      },
    });
  });

  it('does not touch deposit addresses or advance the cursor when no blocks are safe yet', async () => {
    const db = createDb({});
    const provider = createProvider({ latestBlock: 119n });

    await expect(
      runUsdtDepositWatcherOnce({
        db,
        provider,
        now: () => NOW,
      }),
    ).resolves.toEqual({
      status: 'noop',
      reason: 'no_safe_blocks',
      cursorId: TRON_USDT_DEPOSIT_CURSOR_ID,
      latestBlock: 119n,
      safeBlock: 99n,
      lastProcessedBlock: 100n,
    });

    expect(db.depositAddress.findMany).not.toHaveBeenCalled();
    expect(provider.getUsdtTransfersToAddresses).not.toHaveBeenCalled();
    expect(db.watcherCursor.updateMany).not.toHaveBeenCalled();
  });

  it('does not advance the cursor when the watcher reports failed transfers', async () => {
    const db = createDb({
      cursor: createCursor({ maxBlockRange: 100 }),
      addresses: [{ address: DEPOSIT_ADDRESS, derivationIndex: 7 }],
    });
    const provider = createProvider({
      latestBlock: 130n,
      events: [createEvent({ decimals: 18 })],
    });

    await expect(
      runUsdtDepositWatcherOnce({
        db,
        provider,
        now: () => NOW,
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      cursorId: TRON_USDT_DEPOSIT_CURSOR_ID,
      fromBlock: 101n,
      toBlock: 110n,
      latestBlock: 130n,
      safeBlock: 110n,
      watcherResult: {
        watchedAddressCount: 1,
        fetchedTransferCount: 1,
        ingested: [],
        failedTransfers: [
          {
            txId: TX_ID,
            logIndex: 0,
            toAddress: DEPOSIT_ADDRESS,
            error: 'USDT TRC20 decimals must be 6, got 18',
          },
        ],
      },
    });

    expect(db.watcherCursor.updateMany).not.toHaveBeenCalled();
  });

  it('throws when another worker advanced the cursor first', async () => {
    const db = createDb({ updateCount: 0 });
    const provider = createProvider({ latestBlock: 130n });

    await expect(
      runUsdtDepositWatcherOnce({
        db,
        provider,
        now: () => NOW,
      }),
    ).rejects.toThrow('watcher cursor changed concurrently');
  });

  it('throws when the cursor is not configured', async () => {
    const db = createDb({ cursor: null });
    const provider = createProvider({ latestBlock: 130n });

    await expect(
      runUsdtDepositWatcherOnce({
        db,
        provider,
        now: () => NOW,
      }),
    ).rejects.toThrow('watcher cursor tron-usdt-deposits is not configured');

    expect(provider.getLatestBlockNumber).not.toHaveBeenCalled();
  });

  it('rejects invalid cursor settings', async () => {
    const db = createDb({
      cursor: createCursor({ maxBlockRange: 0 }),
    });
    const provider = createProvider({ latestBlock: 130n });

    await expect(
      runUsdtDepositWatcherOnce({
        db,
        provider,
        now: () => NOW,
      }),
    ).rejects.toThrow('maxBlockRange must be a positive safe integer');
  });
});

describe('configureUsdtDepositWatcherCursorInDb', () => {
  it('upserts the TRON USDT cursor with operator-provided block settings', async () => {
    const db = createProvisioningDb();

    await expect(
      configureUsdtDepositWatcherCursorInDb({
        db,
        lastProcessedBlock: 123n,
        confirmationDepth: 20,
        maxBlockRange: 200,
      }),
    ).resolves.toEqual(createCursor({ lastProcessedBlock: 123n }));

    expect(db.watcherCursor.upsert).toHaveBeenCalledWith({
      where: {
        id: TRON_USDT_DEPOSIT_CURSOR_ID,
      },
      create: {
        id: TRON_USDT_DEPOSIT_CURSOR_ID,
        network: 'TRON',
        asset: 'USDT',
        lastProcessedBlock: 123n,
        confirmationDepth: 20,
        maxBlockRange: 200,
      },
      update: {
        lastProcessedBlock: 123n,
        confirmationDepth: 20,
        maxBlockRange: 200,
      },
      select: {
        id: true,
        network: true,
        asset: true,
        lastProcessedBlock: true,
        confirmationDepth: true,
        maxBlockRange: true,
      },
    });
  });

  it('rejects invalid provisioning settings before touching the database', async () => {
    const db = createProvisioningDb();

    await expect(
      configureUsdtDepositWatcherCursorInDb({
        db,
        lastProcessedBlock: -1n,
        confirmationDepth: 20,
        maxBlockRange: 200,
      }),
    ).rejects.toThrow('lastProcessedBlock must be a non-negative bigint');

    expect(db.watcherCursor.upsert).not.toHaveBeenCalled();
  });
});
