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

  it('ignores lower unavailable derivation indexes', () => {
    const now = new Date('2026-05-11T09:00:00.000Z');
    const result = reserveDepositAddress({
      addresses: [
        { id: 'addr-1', derivationIndex: 1, status: 'reserved' },
        { id: 'addr-2', derivationIndex: 2, status: 'disabled' },
        { id: 'addr-4', derivationIndex: 4, status: 'available' },
        { id: 'addr-3', derivationIndex: 3, status: 'available' },
      ],
      orderId: 'order-1',
      now,
      ttlMinutes: 60,
    });

    expect(result.addressId).toBe('addr-3');
  });

  it.each([0, -1, 1.5])('throws when ttlMinutes is %s', (ttlMinutes) => {
    expect(() =>
      reserveDepositAddress({
        addresses: [{ id: 'addr-1', derivationIndex: 1, status: 'available' }],
        orderId: 'order-1',
        now: new Date('2026-05-11T09:00:00.000Z'),
        ttlMinutes,
      }),
    ).toThrow('ttlMinutes must be a positive integer');
  });

  it.each([-1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'throws when an available derivationIndex is %s',
    (derivationIndex) => {
      expect(() =>
        reserveDepositAddress({
          addresses: [{ id: 'addr-1', derivationIndex, status: 'available' }],
          orderId: 'order-1',
          now: new Date('2026-05-11T09:00:00.000Z'),
          ttlMinutes: 60,
        }),
      ).toThrow('derivationIndex must be a safe non-negative integer');
    },
  );

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
