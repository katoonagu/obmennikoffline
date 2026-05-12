import { describe, expect, it } from 'vitest';
import { deriveTronAddress } from '../../src/wallet/deriveTronAddress.js';
import { isTronAddress } from '../../src/domain/tronAddress.js';

const MNEMONIC =
  'test test test test test test test test test test test junk';

describe('deriveTronAddress', () => {
  it('derives deterministic valid TRON addresses by index', () => {
    const first = deriveTronAddress({ mnemonic: MNEMONIC, index: 0 });
    const firstAgain = deriveTronAddress({ mnemonic: MNEMONIC, index: 0 });
    const second = deriveTronAddress({ mnemonic: MNEMONIC, index: 1 });

    expect(first).toEqual(firstAgain);
    expect(first.address).not.toEqual(second.address);
    expect(first.derivationPath).toBe("m/44'/195'/0'/0/0");
    expect(second.derivationPath).toBe("m/44'/195'/0'/0/1");
    expect(isTronAddress(first.address)).toBe(true);
    expect(isTronAddress(second.address)).toBe(true);
  });

  it('rejects negative and unsafe indexes', () => {
    expect(() => deriveTronAddress({ mnemonic: MNEMONIC, index: -1 })).toThrow(
      'index must be a safe non-negative integer',
    );
    expect(() => deriveTronAddress({ mnemonic: MNEMONIC, index: 1.5 })).toThrow(
      'index must be a safe non-negative integer',
    );
    expect(() =>
      deriveTronAddress({ mnemonic: MNEMONIC, index: 0x80000000 }),
    ).toThrow('index must be a safe non-negative integer');
  });

  it('rejects invalid mnemonics with a sanitized error', () => {
    const invalidMnemonic = 'not a valid mnemonic secret words';

    expect(() =>
      deriveTronAddress({ mnemonic: invalidMnemonic, index: 0 }),
    ).toThrow('TRON_MNEMONIC must be a valid BIP39 mnemonic');
    expect(() =>
      deriveTronAddress({ mnemonic: invalidMnemonic, index: 0 }),
    ).not.toThrow(invalidMnemonic);
  });
});
