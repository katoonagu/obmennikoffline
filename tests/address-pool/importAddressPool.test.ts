import { describe, expect, it } from 'vitest';
import { prepareAddressPoolImport } from '../../src/address-pool/importAddressPool.js';

describe('prepareAddressPoolImport', () => {
  it('accepts unique TRON USDT public addresses', () => {
    const result = prepareAddressPoolImport([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      },
    ]);

    expect(result).toEqual([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        status: 'available',
      },
    ]);
  });

  it('rejects duplicate addresses and duplicate derivation indexes', () => {
    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        },
      ]),
    ).toThrow('duplicate derivation_index in import: 0');

    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 1,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
      ]),
    ).toThrow('duplicate address in import: TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY');
  });
});
