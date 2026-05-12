import { describe, expect, it, vi } from 'vitest';
import {
  importAddressPoolToDb,
  type AddressPoolImportDb,
} from '../../src/address-pool/importAddressPoolToDb.js';

const NOW = new Date('2026-05-12T09:00:00.000Z');
const PUBLIC_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';

function createDb(count = 1): AddressPoolImportDb & {
  _tx: {
    depositAddress: {
      createMany: ReturnType<typeof vi.fn>;
    };
    auditLog: {
      create: ReturnType<typeof vi.fn>;
    };
  };
} {
  const tx = {
    depositAddress: {
      createMany: vi.fn().mockResolvedValue({ count }),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({
        id: 'audit-1',
        ...data,
      })),
    },
  };

  return {
    _tx: tx,
    depositAddress: tx.depositAddress,
    auditLog: tx.auditLog,
    $transaction: vi.fn(async (fn) => fn(tx)),
  } as AddressPoolImportDb & {
    _tx: typeof tx;
  };
}

describe('importAddressPoolToDb', () => {
  it('validates, persists and audits public deposit address imports', async () => {
    const db = createDb();

    await expect(
      importAddressPoolToDb({
        db,
        actorId: 'manager-1',
        now: NOW,
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: PUBLIC_ADDRESS,
          },
        ],
      }),
    ).resolves.toEqual({ count: 1 });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db._tx.depositAddress.createMany).toHaveBeenCalledWith({
      data: [
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: PUBLIC_ADDRESS,
          status: 'available',
        },
      ],
      skipDuplicates: false,
    });
    expect(db._tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'manager-1',
        action: 'address_pool_imported',
        entityType: 'DepositAddress',
        entityId: 'address-pool-import',
        orderId: null,
        metadata: {
          count: '1',
          firstDerivationIndex: '0',
          lastDerivationIndex: '0',
        },
        createdAt: NOW,
      },
    });
  });

  it('rejects empty imports before writing', async () => {
    const db = createDb(0);

    await expect(
      importAddressPoolToDb({
        db,
        actorId: 'manager-1',
        now: NOW,
        rows: [],
      }),
    ).rejects.toThrow('rows must contain at least one address');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db._tx.depositAddress.createMany).not.toHaveBeenCalled();
    expect(db._tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails before writing when imported rows are invalid', async () => {
    const db = createDb();

    await expect(
      importAddressPoolToDb({
        db,
        actorId: 'manager-1',
        now: NOW,
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: 'bad',
          },
        ],
      }),
    ).rejects.toThrow('address must be a valid TRON base58 address');

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db._tx.depositAddress.createMany).not.toHaveBeenCalled();
    expect(db._tx.auditLog.create).not.toHaveBeenCalled();
  });
});
