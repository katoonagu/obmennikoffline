import { describe, expect, it, vi } from 'vitest';
import {
  runUsdtDepositWatcher,
  type DepositWatcherDb,
} from '../../src/tron/runUsdtDepositWatcher.js';
import type {
  DepositIngestionTransaction,
  WatchedDepositAddressRecord,
} from '../../src/tron/ingestUsdtDeposit.js';
import {
  USDT_TRC20_CONTRACT_ADDRESS,
  type TronProvider,
  type TronTransferEvent,
} from '../../src/tron/tronProvider.js';

const TX_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SECOND_TX_ID =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const FROM_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const DEPOSIT_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const SECOND_DEPOSIT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const BLOCK_TIMESTAMP = new Date('2026-05-11T09:05:00.000Z');

interface WatchableAddressRecord {
  address: string;
  derivationIndex: number;
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
    blockNumber: 64200001n,
    blockTimestamp: BLOCK_TIMESTAMP,
    ...overrides,
  };
}

function createWatchedAddress(
  overrides: Partial<WatchedDepositAddressRecord> = {},
): WatchedDepositAddressRecord {
  return {
    id: 'addr-1',
    address: DEPOSIT_ADDRESS,
    status: 'reserved',
    order: {
      id: 'order-db-1',
      publicId: 'E74737',
      status: 'awaiting_deposit',
      amountUsdt: { toFixed: () => '5000.000000', toString: () => '5000' },
      orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
    },
    ...overrides,
  };
}

function createTx(address: WatchedDepositAddressRecord): DepositIngestionTransaction {
  return {
    depositAddress: {
      findUnique: vi.fn(async () => address),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    blockchainTransaction: {
      create: vi.fn(async ({ data }) => ({
        id: 'tx-db-1',
        ...data,
      })),
    },
    order: {
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

function createDb(input: {
  addresses?: WatchableAddressRecord[];
  tx?: DepositIngestionTransaction;
}): DepositWatcherDb {
  const tx = input.tx ?? createTx(createWatchedAddress());
  const addresses = input.addresses ?? [
    {
      address: DEPOSIT_ADDRESS,
      derivationIndex: 7,
    },
  ];

  return {
    depositAddress: {
      findMany: vi.fn(async (query) => {
        const minDerivationIndex = query.where.derivationIndex?.gt ?? -1;

        return addresses
          .filter((address) => address.derivationIndex > minDerivationIndex)
          .sort((left, right) => left.derivationIndex - right.derivationIndex)
          .slice(0, query.take)
          .map((address) => ({
            address: address.address,
            derivationIndex: address.derivationIndex,
          }));
      }),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

function createProvider(events: TronTransferEvent[]): TronProvider {
  return {
    getUsdtTransfersToAddresses: vi.fn(async () => events),
  };
}

describe('runUsdtDepositWatcher', () => {
  it('fetches reserved awaiting-deposit addresses and ingests matching USDT transfers', async () => {
    const db = createDb({});
    const provider = createProvider([createEvent()]);

    await expect(
      runUsdtDepositWatcher({
        db,
        provider,
        fromBlock: 64200000n,
        toBlock: 64200010n,
      }),
    ).resolves.toEqual({
      watchedAddressCount: 1,
      fetchedTransferCount: 1,
      ingested: [
        {
          status: 'processed',
          orderPublicId: 'E74737',
          nextOrderStatus: 'funds_detected',
          depositAddressStatus: 'funded',
        },
      ],
      failedTransfers: [],
    });

    expect(db.depositAddress.findMany).toHaveBeenCalledWith({
      where: {
        network: 'TRON',
        asset: 'USDT',
        status: 'reserved',
        order: {
          is: {
            status: 'awaiting_deposit',
          },
        },
      },
      orderBy: {
        derivationIndex: 'asc',
      },
      take: 100,
      select: {
        address: true,
        derivationIndex: true,
      },
    });
    expect(provider.getUsdtTransfersToAddresses).toHaveBeenCalledWith({
      addresses: [DEPOSIT_ADDRESS],
      fromBlock: 64200000n,
      toBlock: 64200010n,
    });
  });

  it('does not call the provider when there are no addresses to watch', async () => {
    const db = createDb({ addresses: [] });
    const provider = createProvider([createEvent()]);

    await expect(
      runUsdtDepositWatcher({
        db,
        provider,
        fromBlock: 64200000n,
        toBlock: 64200010n,
      }),
    ).resolves.toEqual({
      watchedAddressCount: 0,
      fetchedTransferCount: 0,
      ingested: [],
      failedTransfers: [],
    });

    expect(provider.getUsdtTransfersToAddresses).not.toHaveBeenCalled();
  });

  it('walks every eligible address page instead of reprocessing only the first batch', async () => {
    const db = createDb({
      addresses: [
        {
          address: DEPOSIT_ADDRESS,
          derivationIndex: 1,
        },
        {
          address: FROM_ADDRESS,
          derivationIndex: 2,
        },
        {
          address: SECOND_DEPOSIT_ADDRESS,
          derivationIndex: 3,
        },
      ],
    });
    const provider = createProvider([]);

    await expect(
      runUsdtDepositWatcher({
        db,
        provider,
        fromBlock: 64200000n,
        toBlock: 64200010n,
        batchSize: 2,
      }),
    ).resolves.toEqual({
      watchedAddressCount: 3,
      fetchedTransferCount: 0,
      ingested: [],
      failedTransfers: [],
    });

    expect(provider.getUsdtTransfersToAddresses).toHaveBeenNthCalledWith(1, {
      addresses: [DEPOSIT_ADDRESS, FROM_ADDRESS],
      fromBlock: 64200000n,
      toBlock: 64200010n,
    });
    expect(provider.getUsdtTransfersToAddresses).toHaveBeenNthCalledWith(2, {
      addresses: [SECOND_DEPOSIT_ADDRESS],
      fromBlock: 64200000n,
      toBlock: 64200010n,
    });
    expect(db.depositAddress.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          derivationIndex: {
            gt: 2,
          },
        }),
      }),
    );
  });

  it('continues processing after one transfer event fails normalization or ingestion', async () => {
    const tx = createTx(createWatchedAddress());
    const db = createDb({ tx });
    const provider = createProvider([
      createEvent({
        txId: SECOND_TX_ID,
        decimals: 18,
      }),
      createEvent(),
    ]);

    await expect(
      runUsdtDepositWatcher({
        db,
        provider,
        fromBlock: 64200000n,
        toBlock: 64200010n,
      }),
    ).resolves.toEqual({
      watchedAddressCount: 1,
      fetchedTransferCount: 2,
      ingested: [
        {
          status: 'processed',
          orderPublicId: 'E74737',
          nextOrderStatus: 'funds_detected',
          depositAddressStatus: 'funded',
        },
      ],
      failedTransfers: [
        {
          txId: SECOND_TX_ID,
          logIndex: 0,
          toAddress: DEPOSIT_ADDRESS,
          error: 'USDT TRC20 decimals must be 6, got 18',
        },
      ],
    });

    expect(tx.blockchainTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid block ranges before touching the database or provider', async () => {
    const db = createDb({});
    const provider = createProvider([createEvent()]);

    await expect(
      runUsdtDepositWatcher({
        db,
        provider,
        fromBlock: 64200010n,
        toBlock: 64200000n,
      }),
    ).rejects.toThrow('fromBlock must be less than or equal to toBlock');

    expect(db.depositAddress.findMany).not.toHaveBeenCalled();
    expect(provider.getUsdtTransfersToAddresses).not.toHaveBeenCalled();
  });

  it('uses the requested address batch size', async () => {
    const db = createDb({});
    const provider = createProvider([]);

    await runUsdtDepositWatcher({
      db,
      provider,
      fromBlock: 64200000n,
      toBlock: 64200010n,
      batchSize: 250,
    });

    expect(db.depositAddress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 250,
      }),
    );
  });
});
