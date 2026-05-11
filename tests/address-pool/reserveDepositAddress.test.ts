import { describe, expect, it } from 'vitest';
import { reserveDepositAddress } from '../../src/address-pool/reserveDepositAddress.js';

describe('reserveDepositAddress', () => {
  it('reserves the lowest available derivation index', () => {
    const now = new Date('2026-05-11T09:00:00.000Z');
    const result = reserveDepositAddress({
      addresses: [
        { id: 'addr-2', derivationIndex: 2, status: 'available' },
        { id: 'addr-1', derivationIndex: 1, status: 'available' },
      ],
      orderId: 'order-1',
      now,
      ttlMinutes: 60,
    });

    expect(result).toEqual({
      addressId: 'addr-1',
      orderId: 'order-1',
      status: 'reserved',
      reservedAt: now,
      expiresAt: new Date('2026-05-11T10:00:00.000Z'),
    });
  });

  it('throws when no address is available', () => {
    expect(() =>
      reserveDepositAddress({
        addresses: [{ id: 'addr-1', derivationIndex: 1, status: 'reserved' }],
        orderId: 'order-1',
        now: new Date('2026-05-11T09:00:00.000Z'),
        ttlMinutes: 60,
      }),
    ).toThrow('no available TRON deposit addresses');
  });
});
