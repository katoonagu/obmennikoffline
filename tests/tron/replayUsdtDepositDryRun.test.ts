import { describe, expect, it, vi } from 'vitest';
import {
  runUsdtDepositReplayDryRun,
  type UsdtDepositReplayDryRunDb,
} from '../../src/tron/replayUsdtDepositDryRun.js';
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
const RESERVED_AT = new Date('2026-05-11T09:00:00.000Z');
const BLOCK_TIMESTAMP = new Date('2026-05-11T09:05:00.000Z');

function createEvent(overrides: Partial<TronTransferEvent> = {}): TronTransferEvent {
  return {
    txId: TX_ID,
    logIndex: 0,
    contractAddress: USDT_TRC20_CONTRACT_ADDRESS,
    fromAddress: FROM_ADDRESS,
    toAddress: DEPOSIT_ADDRESS,
    amountRaw: '1000000000',
    decimals: 6,
    blockNumber: 64200001n,
    blockTimestamp: BLOCK_TIMESTAMP,
    ...overrides,
  };
}

function createDb(
  addresses = [
    {
      address: DEPOSIT_ADDRESS,
      derivationIndex: 1,
      status: 'reserved' as const,
      reservedAt: RESERVED_AT,
      order: {
        publicId: 'E74737',
        status: 'awaiting_deposit' as const,
        amountUsdt: { toFixed: () => '1000.000000', toString: () => '1000' },
        orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
      },
    },
  ],
): UsdtDepositReplayDryRunDb {
  return {
    depositAddress: {
      findMany: vi.fn(async (query) => {
        const minDerivationIndex = query.where.derivationIndex?.gt ?? -1;

        return addresses
          .filter((address) => address.derivationIndex > minDerivationIndex)
          .slice(0, query.take);
      }),
    },
  };
}

function createProvider(events: TronTransferEvent[]): TronProvider {
  return {
    getUsdtTransfersToAddresses: vi.fn(async () => events),
  };
}

describe('runUsdtDepositReplayDryRun', () => {
  it('classifies historical transfers without mutating database state', async () => {
    const db = createDb();
    const provider = createProvider([
      createEvent({
        blockTimestamp: new Date('2026-05-11T08:59:59.000Z'),
      }),
      createEvent({
        txId: SECOND_TX_ID,
        logIndex: 1,
        amountRaw: '999000000',
      }),
    ]);

    await expect(
      runUsdtDepositReplayDryRun({
        db,
        provider,
        fromBlock: 64200000n,
        toBlock: 64200010n,
      }),
    ).resolves.toEqual({
      watchedAddressCount: 1,
      fetchedTransferCount: 2,
      matches: [
        {
          txId: TX_ID,
          logIndex: 0,
          toAddress: DEPOSIT_ADDRESS,
          orderPublicId: 'E74737',
          amount: '1000.000000',
          expectedAmountUsdt: '1000.000000',
          blockTimestamp: new Date('2026-05-11T08:59:59.000Z'),
          reservedAt: RESERVED_AT,
          wouldIngest: false,
          nextOrderStatus: null,
          reason: 'before_reservation',
        },
        {
          txId: SECOND_TX_ID,
          logIndex: 1,
          toAddress: DEPOSIT_ADDRESS,
          orderPublicId: 'E74737',
          amount: '999.000000',
          expectedAmountUsdt: '1000.000000',
          blockTimestamp: BLOCK_TIMESTAMP,
          reservedAt: RESERVED_AT,
          wouldIngest: true,
          nextOrderStatus: 'manager_review',
          reason: 'amount_mismatch',
        },
      ],
      failedTransfers: [],
    });

    expect(db.depositAddress.findMany).toHaveBeenCalledWith({
      where: {
        network: 'TRON',
        asset: 'USDT',
        status: {
          in: ['reserved', 'expired', 'funded', 'late_funded'],
        },
      },
      orderBy: {
        derivationIndex: 'asc',
      },
      take: 100,
      select: {
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
      },
    });
    expect(provider.getUsdtTransfersToAddresses).toHaveBeenCalledWith({
      addresses: [DEPOSIT_ADDRESS],
      fromBlock: 64200000n,
      toBlock: 64200010n,
    });
  });

  it('captures malformed transfer events as dry-run failures and continues', async () => {
    const db = createDb();
    const provider = createProvider([
      createEvent({ decimals: 18 }),
      createEvent(),
    ]);

    await expect(
      runUsdtDepositReplayDryRun({
        db,
        provider,
        fromBlock: 64200000n,
        toBlock: 64200010n,
      }),
    ).resolves.toMatchObject({
      watchedAddressCount: 1,
      fetchedTransferCount: 2,
      matches: [
        {
          txId: TX_ID,
          wouldIngest: true,
          nextOrderStatus: 'funds_detected',
          reason: 'exact_payment',
        },
      ],
      failedTransfers: [
        {
          txId: TX_ID,
          logIndex: 0,
          toAddress: DEPOSIT_ADDRESS,
          error: 'USDT TRC20 decimals must be 6, got 18',
        },
      ],
    });
  });
});
