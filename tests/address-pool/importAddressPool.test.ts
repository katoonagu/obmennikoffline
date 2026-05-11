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

  it('rejects unsupported networks', () => {
    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'ETH' as 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
      ]),
    ).toThrow('unsupported network in import: ETH');
  });

  it('rejects unsupported assets', () => {
    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'TRON',
          asset: 'TRX' as 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
      ]),
    ).toThrow('unsupported asset in import: TRX');
  });

  it('rejects invalid TRON addresses', () => {
    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'not-a-tron-address',
        },
      ]),
    ).toThrow('address must be a valid TRON base58 address');
  });

  it('rejects invalid derivation indexes from direct callers', () => {
    const invalidIndexes = [-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1];

    for (const derivationIndex of invalidIndexes) {
      expect(() =>
        prepareAddressPoolImport([
          {
            network: 'TRON',
            asset: 'USDT',
            derivationIndex,
            address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
          },
        ]),
      ).toThrow(`invalid derivation_index in import: ${derivationIndex}`);
    }
  });
});
