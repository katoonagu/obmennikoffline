import { describe, expect, it, vi } from 'vitest';
import {
  ingestUsdtDepositInDb,
  type DepositIngestionDb,
  type DepositIngestionTransaction,
  type WatchedDepositAddressRecord,
} from '../../src/tron/ingestUsdtDeposit.js';
import type { NormalizedBlockchainTransaction } from '../../src/tron/normalizeUsdtTransfer.js';

const TX_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SECOND_TX_ID =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const FROM_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const DEPOSIT_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const BLOCK_TIMESTAMP = new Date('2026-05-11T09:05:00.000Z');
const RESERVED_AT = new Date('2026-05-11T09:00:00.000Z');

function createTransfer(
  overrides: Partial<NormalizedBlockchainTransaction> = {},
): NormalizedBlockchainTransaction {
  return {
    network: 'TRON',
    asset: 'USDT',
    txId: TX_ID,
    logIndex: 0,
    fromAddress: FROM_ADDRESS,
    toAddress: DEPOSIT_ADDRESS,
    amount: '5000.000000',
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
    reservedAt: RESERVED_AT,
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

function createTx(
  address: WatchedDepositAddressRecord | null,
): DepositIngestionTransaction {
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

function createDb(tx: DepositIngestionTransaction): DepositIngestionDb {
  return {
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

describe('ingestUsdtDepositInDb', () => {
  it('records an exact on-time SELL_USDT deposit and marks funds detected', async () => {
    const tx = createTx(createWatchedAddress());
    const db = createDb(tx);
    const transfer = createTransfer();

    await expect(ingestUsdtDepositInDb(db, { transfer })).resolves.toEqual({
      status: 'processed',
      orderPublicId: 'E74737',
      nextOrderStatus: 'funds_detected',
      depositAddressStatus: 'funded',
    });

    expect(tx.blockchainTransaction.create).toHaveBeenCalledWith({
      data: {
        network: 'TRON',
        asset: 'USDT',
        txId: TX_ID,
        logIndex: 0,
        fromAddress: FROM_ADDRESS,
        toAddress: DEPOSIT_ADDRESS,
        amount: '5000.000000',
        blockNumber: 64200001n,
        blockTimestamp: BLOCK_TIMESTAMP,
        orderId: 'order-db-1',
      },
    });
    expect(tx.depositAddress.findUnique).toHaveBeenCalledWith({
      where: {
        address: DEPOSIT_ADDRESS,
      },
      select: expect.objectContaining({
        reservedAt: true,
      }),
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        status: 'awaiting_deposit',
      },
      data: {
        status: 'funds_detected',
      },
    });
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'addr-1',
        status: 'reserved',
      },
      data: {
        status: 'funded',
        fundedAt: BLOCK_TIMESTAMP,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'tron_deposit_detected',
        entityType: 'Order',
        entityId: 'order-db-1',
        orderId: 'order-db-1',
        metadata: {
          publicId: 'E74737',
          txId: TX_ID,
          logIndex: 0,
          fromAddress: FROM_ADDRESS,
          toAddress: DEPOSIT_ADDRESS,
          amount: '5000.000000',
          expectedAmountUsdt: '5000.000000',
          previousStatus: 'awaiting_deposit',
          nextStatus: 'funds_detected',
          depositAddressStatus: 'funded',
        },
        createdAt: BLOCK_TIMESTAMP,
      },
    });
  });

  it('ignores historical transfers that happened before the address reservation', async () => {
    const tx = createTx(createWatchedAddress());
    const db = createDb(tx);
    const historicalTimestamp = new Date('2026-05-11T08:59:59.000Z');

    await expect(
      ingestUsdtDepositInDb(db, {
        transfer: createTransfer({
          blockTimestamp: historicalTimestamp,
        }),
      }),
    ).resolves.toEqual({
      status: 'ignored_before_reservation',
      orderPublicId: 'E74737',
      toAddress: DEPOSIT_ADDRESS,
      blockTimestamp: historicalTimestamp,
      reservedAt: RESERVED_AT,
    });

    expect(tx.blockchainTransaction.create).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.depositAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('marks deposits after order expiry as late payments', async () => {
    const tx = createTx(
      createWatchedAddress({
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'awaiting_deposit',
          amountUsdt: { toString: () => '5000.000000' },
          orderExpiresAt: new Date('2026-05-11T09:00:00.000Z'),
        },
      }),
    );
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).resolves.toMatchObject({
      status: 'processed',
      nextOrderStatus: 'late_payment',
      depositAddressStatus: 'late_funded',
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'late_payment',
        },
      }),
    );
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'late_funded',
          fundedAt: BLOCK_TIMESTAMP,
        },
      }),
    );
  });

  it('records late deposits for SELL orders already expired by the expiration sweeper', async () => {
    const tx = createTx(
      createWatchedAddress({
        status: 'expired',
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'expired',
          amountUsdt: { toString: () => '5000.000000' },
          orderExpiresAt: new Date('2026-05-11T09:00:00.000Z'),
        },
      }),
    );
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).resolves.toEqual({
      status: 'processed',
      orderPublicId: 'E74737',
      nextOrderStatus: 'late_payment',
      depositAddressStatus: 'late_funded',
    });

    expect(tx.blockchainTransaction.create).toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        status: 'expired',
      },
      data: {
        status: 'late_payment',
      },
    });
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'addr-1',
        status: 'expired',
      },
      data: {
        status: 'late_funded',
        fundedAt: BLOCK_TIMESTAMP,
      },
    });
  });

  it('sends amount mismatches to manager review', async () => {
    const tx = createTx(createWatchedAddress());
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, {
        transfer: createTransfer({ amount: '4999.000000' }),
      }),
    ).resolves.toMatchObject({
      status: 'processed',
      nextOrderStatus: 'manager_review',
      depositAddressStatus: 'funded',
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'manager_review',
        },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            amount: '4999.000000',
            expectedAmountUsdt: '5000.000000',
            nextStatus: 'manager_review',
          }),
        }),
      }),
    );
  });

  it('sends a 999 USDT transfer for a 1000 USDT order to manager review', async () => {
    const tx = createTx(
      createWatchedAddress({
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'awaiting_deposit',
          amountUsdt: { toFixed: () => '1000.000000', toString: () => '1000' },
          orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
        },
      }),
    );
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, {
        transfer: createTransfer({ amount: '999.000000' }),
      }),
    ).resolves.toMatchObject({
      status: 'processed',
      nextOrderStatus: 'manager_review',
      depositAddressStatus: 'funded',
    });

    expect(tx.blockchainTransaction.create).toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'manager_review',
        },
      }),
    );
  });

  it('records two half payments and keeps the order in manager review', async () => {
    const recordedTransactions: unknown[] = [];
    const firstTx = createTx(
      createWatchedAddress({
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'awaiting_deposit',
          amountUsdt: { toFixed: () => '1000.000000', toString: () => '1000' },
          orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
        },
      }),
    );
    const secondTx = createTx(
      createWatchedAddress({
        status: 'funded',
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'manager_review',
          amountUsdt: { toFixed: () => '1000.000000', toString: () => '1000' },
          orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
        },
      }),
    );
    vi.mocked(firstTx.blockchainTransaction.create).mockImplementation(async ({ data }) => {
      recordedTransactions.push(data);
      return { id: 'tx-db-1', ...data };
    });
    vi.mocked(secondTx.blockchainTransaction.create).mockImplementation(async ({ data }) => {
      recordedTransactions.push(data);
      return { id: 'tx-db-2', ...data };
    });

    await expect(
      ingestUsdtDepositInDb(createDb(firstTx), {
        transfer: createTransfer({
          amount: '500.000000',
        }),
      }),
    ).resolves.toMatchObject({
      status: 'processed',
      nextOrderStatus: 'manager_review',
    });
    await expect(
      ingestUsdtDepositInDb(createDb(secondTx), {
        transfer: createTransfer({
          txId: SECOND_TX_ID,
          logIndex: 1,
          amount: '500.000000',
        }),
      }),
    ).resolves.toMatchObject({
      status: 'processed',
      nextOrderStatus: 'manager_review',
    });

    expect(recordedTransactions).toHaveLength(2);
    expect(firstTx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'manager_review',
        },
      }),
    );
    expect(secondTx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'manager_review',
        },
      }),
    );
  });

  it('ignores extra transfers after an exact payment already detected funds', async () => {
    const firstTx = createTx(createWatchedAddress());
    const secondTx = createTx(
      createWatchedAddress({
        status: 'funded',
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'funds_detected',
          amountUsdt: { toFixed: () => '5000.000000', toString: () => '5000' },
          orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
        },
      }),
    );

    await expect(
      ingestUsdtDepositInDb(createDb(firstTx), { transfer: createTransfer() }),
    ).resolves.toMatchObject({
      status: 'processed',
      nextOrderStatus: 'funds_detected',
    });
    await expect(
      ingestUsdtDepositInDb(createDb(secondTx), {
        transfer: createTransfer({
          txId: SECOND_TX_ID,
          logIndex: 1,
          amount: '1.000000',
        }),
      }),
    ).resolves.toEqual({
      status: 'ignored_ineligible_order',
      orderPublicId: 'E74737',
      currentStatus: 'funds_detected',
    });

    expect(firstTx.blockchainTransaction.create).toHaveBeenCalledTimes(1);
    expect(secondTx.blockchainTransaction.create).not.toHaveBeenCalled();
    expect(secondTx.order.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent when the transaction event was already recorded', async () => {
    const tx = createTx(createWatchedAddress());
    vi.mocked(tx.blockchainTransaction.create).mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).resolves.toEqual({
      status: 'duplicate',
      txId: TX_ID,
      logIndex: 0,
    });

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.depositAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('records follow-up transfers for SELL orders already in manager review', async () => {
    const tx = createTx(
      createWatchedAddress({
        status: 'funded',
        order: {
          id: 'order-db-1',
          publicId: 'E74737',
          status: 'manager_review',
          amountUsdt: { toFixed: () => '5000.000000', toString: () => '5000' },
          orderExpiresAt: new Date('2026-05-11T10:00:00.000Z'),
        },
      }),
    );
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, {
        transfer: createTransfer({
          txId: SECOND_TX_ID,
          logIndex: 1,
          amount: '1.000000',
        }),
      }),
    ).resolves.toMatchObject({
      status: 'processed',
      orderPublicId: 'E74737',
      nextOrderStatus: 'manager_review',
      depositAddressStatus: 'funded',
    });

    expect(tx.blockchainTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        txId: SECOND_TX_ID,
        logIndex: 1,
        amount: '1.000000',
        orderId: 'order-db-1',
      }),
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-db-1',
        status: 'manager_review',
      },
      data: {
        status: 'manager_review',
      },
    });
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'addr-1',
        status: 'funded',
      },
      data: {
        status: 'funded',
        fundedAt: BLOCK_TIMESTAMP,
      },
    });
  });

  it('rejects non-reserved addresses before recording the transaction', async () => {
    const tx = createTx(
      createWatchedAddress({
        status: 'available',
      }),
    );
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).resolves.toEqual({
      status: 'ignored_ineligible_address',
      toAddress: DEPOSIT_ADDRESS,
      currentStatus: 'available',
    });

    expect(tx.blockchainTransaction.create).not.toHaveBeenCalled();
    expect(tx.depositAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rolls back when the order is no longer awaiting deposit after tx insert', async () => {
    const tx = createTx(createWatchedAddress());
    vi.mocked(tx.order.updateMany).mockResolvedValueOnce({ count: 0 });
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).rejects.toThrow('order is no longer awaiting deposit');

    expect(tx.depositAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rolls back when the deposit address is no longer reserved after order update', async () => {
    const tx = createTx(createWatchedAddress());
    vi.mocked(tx.depositAddress.updateMany).mockResolvedValueOnce({ count: 0 });
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).rejects.toThrow('deposit address is no longer reserved');

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('ignores transfers to unknown deposit addresses', async () => {
    const tx = createTx(null);
    const db = createDb(tx);

    await expect(
      ingestUsdtDepositInDb(db, { transfer: createTransfer() }),
    ).resolves.toEqual({
      status: 'ignored_unknown_address',
      toAddress: DEPOSIT_ADDRESS,
    });

    expect(tx.blockchainTransaction.create).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
