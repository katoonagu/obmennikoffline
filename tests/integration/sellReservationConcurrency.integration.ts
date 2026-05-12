import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvFileIfPresent } from '../../src/api/envFile.js';
import {
  createSellUsdtOrderInDb,
  type OrderApplicationDb,
} from '../../src/orders/orderApplicationService.js';

loadEnvFileIfPresent();

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
const orderDb = prisma as unknown as OrderApplicationDb<unknown>;

const createdUserIds: string[] = [];
const createdDepositAddressIds: string[] = [];
const temporarilyDisabledDepositAddressIds: string[] = [];

describe('SELL deposit address reservation concurrency', () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for PostgreSQL integration tests');
    }
  });

  afterEach(async () => {
    await prisma.order.deleteMany({
      where: {
        userId: {
          in: createdUserIds,
        },
      },
    });
    await prisma.depositAddress.deleteMany({
      where: {
        id: {
          in: createdDepositAddressIds,
        },
      },
    });
    await prisma.depositAddress.updateMany({
      where: {
        id: {
          in: temporarilyDisabledDepositAddressIds,
        },
        status: 'disabled',
      },
      data: {
        status: 'available',
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: createdUserIds,
        },
      },
    });
    createdUserIds.length = 0;
    createdDepositAddressIds.length = 0;
    temporarilyDisabledDepositAddressIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent SELL order to reserve one available address', async () => {
    const runId = randomUUID().replaceAll('-', '').slice(0, 12);
    const userId = `it-user-${runId}`;
    createdUserIds.push(userId);
    const existingAvailableAddresses = await prisma.depositAddress.findMany({
      where: {
        network: 'TRON',
        asset: 'USDT',
        status: 'available',
      },
      select: {
        id: true,
      },
    });
    temporarilyDisabledDepositAddressIds.push(
      ...existingAvailableAddresses.map((address) => address.id),
    );
    await prisma.depositAddress.updateMany({
      where: {
        id: {
          in: temporarilyDisabledDepositAddressIds,
        },
      },
      data: {
        status: 'disabled',
      },
    });

    const depositAddress = await prisma.depositAddress.create({
      data: {
        network: 'TRON',
        asset: 'USDT',
        address: createUniqueTronLikeAddress(runId),
        derivationIndex: randomInt(100_000_000, 2_000_000_000),
        status: 'available',
      },
      select: {
        id: true,
      },
    });
    createdDepositAddressIds.push(depositAddress.id);

    const now = new Date('2026-05-13T00:00:00.000Z');
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        createSellUsdtOrderInDb(orderDb, {
          publicId: `ITS${runId}${index.toString().padStart(2, '0')}`,
          userId,
          customerLastName: 'Иванов',
          customerFirstName: 'Иван',
          customerMiddleName: 'Иванович',
          amountUsdt: '1.000000',
          amountRub: '76.25',
          rateSnapshot: '76.250000',
          now,
          rateTtlMinutes: 20,
          orderTtlMinutes: 60,
          maxReservationAttempts: 3,
        }),
      ),
    );

    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<unknown> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expect(rejected.map((attempt) => getErrorMessage(attempt.reason))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /no available TRON deposit addresses|failed to reserve TRON deposit address after concurrent attempts/,
        ),
      ]),
    );

    const orders = await prisma.order.findMany({
      where: {
        userId,
      },
      select: {
        direction: true,
        depositAddressId: true,
        clientPayoutAddress: true,
      },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      direction: 'SELL_USDT',
      depositAddressId: depositAddress.id,
      clientPayoutAddress: null,
    });

    const reservedAddress = await prisma.depositAddress.findUniqueOrThrow({
      where: {
        id: depositAddress.id,
      },
      select: {
        status: true,
      },
    });
    expect(reservedAddress.status).toBe('reserved');

    await expect(
      prisma.order.count({
        where: {
          userId,
          direction: 'BUY_USDT',
          depositAddressId: {
            not: null,
          },
        },
      }),
    ).resolves.toBe(0);
  });
});

function createUniqueTronLikeAddress(runId: string): string {
  return `T${runId}${'A'.repeat(33 - runId.length)}`;
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
