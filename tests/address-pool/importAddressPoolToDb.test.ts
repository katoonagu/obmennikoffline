import { describe, expect, it, vi } from 'vitest';
import {
  importAddressPoolToDb,
  type AddressPoolImportDb,
} from '../../src/address-pool/importAddressPoolToDb.js';

describe('importAddressPoolToDb', () => {
  it('validates and persists public deposit addresses', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const db: AddressPoolImportDb = {
      depositAddress: { createMany },
    };

    await expect(
      importAddressPoolToDb({
        db,
        rows: [
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex: 0,
            address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
          },
        ],
      }),
    ).resolves.toEqual({ count: 1 });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
          status: 'available',
        },
      ],
      skipDuplicates: false,
    });
  });

  it('does not call the database for an empty import', async () => {
    const createMany = vi.fn();
    const db: AddressPoolImportDb = {
      depositAddress: { createMany },
    };

    await expect(importAddressPoolToDb({ db, rows: [] })).resolves.toEqual({
      count: 0,
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('fails before writing when imported rows are invalid', async () => {
    const createMany = vi.fn();
    const db: AddressPoolImportDb = {
      depositAddress: { createMany },
    };

    await expect(
      importAddressPoolToDb({
        db,
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

    expect(createMany).not.toHaveBeenCalled();
  });
});
