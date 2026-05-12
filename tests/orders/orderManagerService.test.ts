import { describe, expect, it, vi } from 'vitest';
import {
  recordManualCryptoPayoutInDb,
  setManagerOrderStatusInDb,
  type ManagerOrderRecord,
  type OrderManagerDb,
  type OrderManagerTransaction,
} from '../../src/orders/orderManagerService.js';

const NOW = new Date('2026-05-11T10:00:00.000Z');
const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const TX_ID = 'A'.repeat(64);

interface UpdatedOrder extends ManagerOrderRecord {
  payoutTxId: string | null;
  payoutTxRecordedAt: Date | null;
  payoutTxRecordedBy: string | null;
  completedAt: Date | null;
}

function createOrder(overrides: Partial<ManagerOrderRecord> = {}): ManagerOrderRecord {
  return {
    id: 'order-db-1',
    publicId: 'E97010',
    direction: 'BUY_USDT',
    status: 'ready_for_crypto_payout',
    clientPayoutAddress: PAYOUT_ADDRESS,
    ...overrides,
  };
}

function createTx(order: ManagerOrderRecord | null): OrderManagerTransaction<UpdatedOrder> {
  return {
    order: {
      findUnique: vi.fn(async () => order),
      update: vi.fn(async ({ data }) => ({
        ...(order ?? createOrder()),
        payoutTxId: null,
        payoutTxRecordedAt: null,
        payoutTxRecordedBy: null,
        completedAt: null,
        ...data,
      })),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({
        id: 'audit-1',
        ...data,
      })),
    },
  };
}

function createDb(
  tx: OrderManagerTransaction<UpdatedOrder>,
): OrderManagerDb<UpdatedOrder> & {
  _tx: OrderManagerTransaction<UpdatedOrder>;
} {
  return {
    _tx: tx,
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

describe('orderManagerService', () => {
  it('records manual BUY_USDT crypto payout tx hash and completes the order', async () => {
    const tx = createTx(createOrder());
    const db = createDb(tx);

    await expect(
      recordManualCryptoPayoutInDb(db, {
        publicId: 'E97010',
        actorId: 'manager-1',
        txId: TX_ID,
        comment: 'sent from external wallet',
        now: NOW,
      }),
    ).resolves.toMatchObject({
      publicId: 'E97010',
      status: 'completed',
      payoutTxId: TX_ID.toLowerCase(),
      payoutTxRecordedAt: NOW,
      payoutTxRecordedBy: 'manager-1',
      completedAt: NOW,
    });

    expect(tx.order.findUnique).toHaveBeenCalledWith({
      where: {
        publicId: 'E97010',
      },
      select: {
        id: true,
        publicId: true,
        direction: true,
        status: true,
        clientPayoutAddress: true,
      },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: {
        publicId: 'E97010',
        payoutTxId: null,
        status: {
          in: ['awaiting_office_visit', 'manager_review', 'ready_for_crypto_payout'],
        },
      },
      data: {
        status: 'completed',
        completedAt: NOW,
        payoutTxId: TX_ID.toLowerCase(),
        payoutTxRecordedAt: NOW,
        payoutTxRecordedBy: 'manager-1',
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'manager-1',
        action: 'manual_crypto_payout_recorded',
        entityType: 'Order',
        entityId: 'order-db-1',
        orderId: 'order-db-1',
        metadata: {
          publicId: 'E97010',
          previousStatus: 'ready_for_crypto_payout',
          nextStatus: 'completed',
          txId: TX_ID.toLowerCase(),
          clientPayoutAddress: PAYOUT_ADDRESS,
          comment: 'sent from external wallet',
        },
        createdAt: NOW,
      },
    });
  });

  it('rejects concurrent manual payout recording when another manager already won', async () => {
    const tx = createTx(createOrder());
    const db = createDb(tx);
    vi.mocked(tx.order.update).mockRejectedValueOnce(
      Object.assign(new Error('Record not found'), { code: 'P2025' }),
    );

    await expect(
      recordManualCryptoPayoutInDb(db, {
        publicId: 'E97010',
        actorId: 'manager-1',
        txId: TX_ID,
        now: NOW,
      }),
    ).rejects.toThrow('order is no longer open for manual crypto payout');

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not record manual crypto payout for SELL_USDT orders', async () => {
    const tx = createTx(
      createOrder({
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    );
    const db = createDb(tx);

    await expect(
      recordManualCryptoPayoutInDb(db, {
        publicId: 'E74737',
        actorId: 'manager-1',
        txId: TX_ID,
        now: NOW,
      }),
    ).rejects.toThrow('manual crypto payout can only be recorded for BUY_USDT orders');

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects malformed payout tx ids before opening a transaction', async () => {
    const tx = createTx(createOrder());
    const db = createDb(tx);

    await expect(
      recordManualCryptoPayoutInDb(db, {
        publicId: 'E97010',
        actorId: 'manager-1',
        txId: 'bad',
        now: NOW,
      }),
    ).rejects.toThrow('txId must be a 64-character hex TRON transaction id');

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsafe audit comments before opening a transaction', async () => {
    const payoutTx = createTx(createOrder());
    const payoutDb = createDb(payoutTx);

    await expect(
      recordManualCryptoPayoutInDb(payoutDb, {
        publicId: 'E97010',
        actorId: 'manager-1',
        txId: TX_ID,
        comment: 'x'.repeat(501),
        now: NOW,
      }),
    ).rejects.toThrow('comment must be at most 500 characters');
    expect(payoutDb.$transaction).not.toHaveBeenCalled();

    const statusTx = createTx(createOrder());
    const statusDb = createDb(statusTx);

    await expect(
      setManagerOrderStatusInDb(statusDb, {
        publicId: 'E97010',
        actorId: 'manager-1',
        status: 'cancelled',
        comment: '   ',
        now: NOW,
      }),
    ).rejects.toThrow('comment is required');
    expect(statusDb.$transaction).not.toHaveBeenCalled();
  });

  it('sets manager-controlled order statuses and writes audit log records', async () => {
    const tx = createTx(
      createOrder({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        status: 'ready_for_cash_payout',
        clientPayoutAddress: null,
      }),
    );
    const db = createDb(tx);

    await expect(
      setManagerOrderStatusInDb(db, {
        publicId: 'E74737',
        actorId: 'manager-1',
        status: 'completed',
        comment: 'cash paid in office',
        now: NOW,
      }),
    ).resolves.toMatchObject({
      publicId: 'E74737',
      status: 'completed',
      completedAt: NOW,
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: {
        publicId: 'E74737',
      },
      data: {
        status: 'completed',
        completedAt: NOW,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'manager-1',
        action: 'manager_order_status_changed',
        entityType: 'Order',
        entityId: 'order-db-1',
        orderId: 'order-db-1',
        metadata: {
          publicId: 'E74737',
          previousStatus: 'ready_for_cash_payout',
          nextStatus: 'completed',
          comment: 'cash paid in office',
        },
        createdAt: NOW,
      },
    });
  });

  it('requires manual crypto payout tx hash to complete BUY_USDT orders', async () => {
    const tx = createTx(createOrder());
    const db = createDb(tx);

    await expect(
      setManagerOrderStatusInDb(db, {
        publicId: 'E97010',
        actorId: 'manager-1',
        status: 'completed',
        now: NOW,
      }),
    ).rejects.toThrow('BUY_USDT completion requires manual crypto payout tx id');

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns not found when manager changes an unknown order', async () => {
    const tx = createTx(null);
    const db = createDb(tx);

    await expect(
      setManagerOrderStatusInDb(db, {
        publicId: 'E40400',
        actorId: 'manager-1',
        status: 'cancelled',
        now: NOW,
      }),
    ).rejects.toThrow('order not found');
  });
});
