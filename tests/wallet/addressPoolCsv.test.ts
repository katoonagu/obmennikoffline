import { describe, expect, it } from 'vitest';
import {
  parseAddressPoolCsv,
  renderAddressPoolCsv,
} from '../../src/wallet/addressPoolCsv.js';

const ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';

describe('address pool CSV', () => {
  it('renders only public TRON address pool columns', () => {
    const csv = renderAddressPoolCsv([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: ADDRESS,
      },
    ]);

    expect(csv).toBe(
      'network,asset,derivation_index,address\nTRON,USDT,0,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY\n',
    );
    expect(csv.toLowerCase()).not.toContain('private');
    expect(csv.toLowerCase()).not.toContain('mnemonic');
    expect(csv.toLowerCase()).not.toContain('seed');
  });

  it('parses a public TRON address pool row', () => {
    expect(
      parseAddressPoolCsv(
        'network,asset,derivation_index,address\nTRON,USDT,2,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY\n',
      ),
    ).toEqual([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 2,
        address: ADDRESS,
      },
    ]);
  });
});
