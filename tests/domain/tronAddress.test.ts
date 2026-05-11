import { describe, expect, it } from 'vitest';
import { assertTronAddress, isTronAddress } from '../../src/domain/tronAddress.js';

describe('TRON address validation', () => {
  it('accepts valid base58 TRON addresses', () => {
    expect(isTronAddress('TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY')).toBe(true);
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isTronAddress('')).toBe(false);
    expect(isTronAddress('0x1234')).toBe(false);
    expect(isTronAddress('TXndknnAM2awhzH6p9AidYVKPtUzXmWmkZ')).toBe(false);
    expect(isTronAddress('EXndknnAM2awhzH6p9AidYVKPtUzXmWmkY')).toBe(false);
  });

  it('throws a field-specific error for invalid values', () => {
    expect(() => assertTronAddress('bad', 'client_payout_address')).toThrow(
      'client_payout_address must be a valid TRON base58 address',
    );
  });
});
