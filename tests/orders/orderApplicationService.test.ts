import { describe, expect, it, vi } from 'vitest';
import {
  createBuyUsdtOrderInDb,
  createSellUsdtOrderInDb,
  type DepositAddressCandidate,
  type OrderApplicationDb,
  type OrderApplicationTransaction,
  type OrderCreateData,
} from '../../src/orders/orderApplicationService.js';

interface PersistedOrder extends OrderCreateData {
  id: string;
}

const NOW = new Date('2026-05-11T09:00:00.000Z');
const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';

function createPersistedOrder(data: OrderCreateData): PersistedOrder {
  return {
    id: `db-${data.publicId}`,
    ...data,
  };
}

function createDb(
  tx: OrderApplicationTransaction<PersistedOrder>,
): OrderApplicationDb<PersistedOrder> {
  return {
    order: {
      create: vi.fn(async ({ data }) => createPersistedOrder(data)),
    },
    user: {
      update: vi.fn(async ({ data }) => ({
        id: 'user-1',
        ...data,
      })),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

function createTx(input?: {
  candidates?: Array<DepositAddressCandidate | null>;
  updateCounts?: number[];
}): OrderApplicationTransaction<PersistedOrder> {
  const candidates = input?.candidates ?? [
    { id: 'addr-1', derivationIndex: 1, status: 'available' },
  ];
  const updateCounts = input?.updateCounts ?? [1];

  return {
    depositAddress: {
      findFirst: vi.fn(async () => candidates.shift() ?? null),
      updateMany: vi.fn(async () => ({ count: updateCounts.shift() ?? 0 })),
    },
    user: {
      update: vi.fn(async ({ data }) => ({
        id: 'user-1',
        ...data,
      })),
    },
    order: {
      create: vi.fn(async ({ data }) => createPersistedOrder(data)),
    },
  };
}

describe('orderApplicationService', () => {
  it('atomically persists BUY_USDT orders and updates the user customer profile', async () => {
    const tx = createTx();
    const db = createDb(tx);

    await expect(
      createBuyUsdtOrderInDb(db, {
        publicId: 'E97010',
        userId: 'user-1',
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: PAYOUT_ADDRESS,
        now: NOW,
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
      }),
    ).resolves.toMatchObject({
      publicId: 'E97010',
      direction: 'BUY_USDT',
      status: 'awaiting_office_visit',
      depositAddressId: null,
      clientPayoutAddress: PAYOUT_ADDRESS,
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      data: {
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
      },
    });
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: 'E97010',
        direction: 'BUY_USDT',
        depositAddressId: null,
      }),
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('atomically reserves a deposit address and persists SELL_USDT orders', async () => {
    const tx = createTx();
    const db = createDb(tx);

    await expect(
      createSellUsdtOrderInDb(db, {
        publicId: 'E74737',
        userId: 'user-1',
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        now: NOW,
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
      }),
    ).resolves.toMatchObject({
      publicId: 'E74737',
      direction: 'SELL_USDT',
      status: 'awaiting_deposit',
      depositAddressId: 'addr-1',
      clientPayoutAddress: null,
    });

    expect(tx.depositAddress.findFirst).toHaveBeenCalledWith({
      where: {
        network: 'TRON',
        asset: 'USDT',
        status: 'available',
      },
      orderBy: {
        derivationIndex: 'asc',
      },
      select: {
        id: true,
        derivationIndex: true,
        status: true,
      },
    });
    expect(tx.depositAddress.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'addr-1',
        status: 'available',
      },
      data: {
        status: 'reserved',
        reservedAt: NOW,
        expiresAt: new Date('2026-05-11T10:00:00.000Z'),
      },
    });
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: 'E74737',
        direction: 'SELL_USDT',
        depositAddressId: 'addr-1',
        status: 'awaiting_deposit',
      }),
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      data: {
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
      },
    });
  });

  it('retries when a concurrent reservation wins the first address', async () => {
    const tx = createTx({
      candidates: [
        { id: 'addr-1', derivationIndex: 1, status: 'available' },
        { id: 'addr-2', derivationIndex: 2, status: 'available' },
      ],
      updateCounts: [0, 1],
    });
    const db = createDb(tx);

    await expect(
      createSellUsdtOrderInDb(db, {
        publicId: 'E74738',
        userId: 'user-1',
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        now: NOW,
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
        maxReservationAttempts: 2,
      }),
    ).resolves.toMatchObject({
      depositAddressId: 'addr-2',
    });

    expect(tx.depositAddress.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.depositAddress.updateMany).toHaveBeenCalledTimes(2);
  });

  it('throws when no SELL deposit address is available', async () => {
    const tx = createTx({ candidates: [null] });
    const db = createDb(tx);

    await expect(
      createSellUsdtOrderInDb(db, {
        publicId: 'E74739',
        userId: 'user-1',
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        now: NOW,
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
      }),
    ).rejects.toThrow('no available TRON deposit addresses');

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('validates SELL order input before opening a transaction', async () => {
    const tx = createTx();
    const db = createDb(tx);

    await expect(
      createSellUsdtOrderInDb(db, {
        publicId: 'E74740',
        userId: 'user-1',
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
        amountUsdt: '1.1234567',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        now: NOW,
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
      }),
    ).rejects.toThrow('amountUsdt must fit Decimal(36, 6)');

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid reservation retry limits before opening a transaction', async () => {
    const tx = createTx();
    const db = createDb(tx);

    await expect(
      createSellUsdtOrderInDb(db, {
        publicId: 'E74741',
        userId: 'user-1',
        customerLastName: 'Alekseev',
        customerFirstName: 'Pavel',
        customerMiddleName: 'Astrakhanov',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        now: NOW,
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
        maxReservationAttempts: 0,
      }),
    ).rejects.toThrow('maxReservationAttempts must be a positive integer');

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
