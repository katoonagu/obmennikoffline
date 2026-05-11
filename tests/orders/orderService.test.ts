import { describe, expect, it } from 'vitest';
import { createBuyUsdtOrder, createSellUsdtOrder } from '../../src/orders/orderService.js';

describe('orderService', () => {
  it('creates SELL_USDT orders with awaiting_deposit status and a reserved address requirement', () => {
    const order = createSellUsdtOrder({
      publicId: 'E74737',
      userId: 'user-1',
      amountUsdt: '5000.000000',
      amountRub: '381250.00',
      rateSnapshot: '76.250000',
      now: new Date('2026-05-11T09:00:00.000Z'),
      rateTtlMinutes: 20,
      orderTtlMinutes: 60,
      depositAddressId: 'addr-1',
    });

    expect(order.publicId).toBe('E74737');
    expect(order.direction).toBe('SELL_USDT');
    expect(order.asset).toBe('USDT');
    expect(order.network).toBe('TRON');
    expect(order.status).toBe('awaiting_deposit');
    expect(order.depositAddressId).toBe('addr-1');
    expect(order.clientPayoutAddress).toBeNull();
    expect(order.rateExpiresAt).toEqual(new Date('2026-05-11T09:20:00.000Z'));
    expect(order.orderExpiresAt).toEqual(new Date('2026-05-11T10:00:00.000Z'));
  });

  it('creates BUY_USDT orders with client payout address and no deposit address', () => {
    const order = createBuyUsdtOrder({
      publicId: 'E97010',
      userId: 'user-1',
      amountUsdt: '2602.400000',
      amountRub: '200000.00',
      rateSnapshot: '76.850000',
      clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
      now: new Date('2026-05-11T09:00:00.000Z'),
      rateTtlMinutes: 20,
      orderTtlMinutes: 60,
    });

    expect(order.publicId).toBe('E97010');
    expect(order.direction).toBe('BUY_USDT');
    expect(order.asset).toBe('USDT');
    expect(order.network).toBe('TRON');
    expect(order.status).toBe('awaiting_office_visit');
    expect(order.depositAddressId).toBeNull();
    expect(order.clientPayoutAddress).toBe('TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7');
    expect(order.rateExpiresAt).toEqual(new Date('2026-05-11T09:20:00.000Z'));
    expect(order.orderExpiresAt).toEqual(new Date('2026-05-11T10:00:00.000Z'));
  });

  it('rejects BUY_USDT with invalid payout address', () => {
    expect(() =>
      createBuyUsdtOrder({
        publicId: 'E97010',
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: 'bad',
        now: new Date('2026-05-11T09:00:00.000Z'),
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
      }),
    ).toThrow('clientPayoutAddress must be a valid TRON base58 address');
  });

  it('rejects SELL_USDT without a deposit address id', () => {
    expect(() =>
      createSellUsdtOrder({
        publicId: 'E74737',
        userId: 'user-1',
        amountUsdt: '5000.000000',
        amountRub: '381250.00',
        rateSnapshot: '76.250000',
        now: new Date('2026-05-11T09:00:00.000Z'),
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
        depositAddressId: '',
      }),
    ).toThrow('depositAddressId is required for SELL_USDT order');
  });

  it.each([
    ['SELL_USDT', 'rateTtlMinutes', 0],
    ['SELL_USDT', 'orderTtlMinutes', 1.5],
    ['BUY_USDT', 'rateTtlMinutes', -1],
    ['BUY_USDT', 'orderTtlMinutes', Number.NaN],
  ])('rejects %s when %s is invalid', (direction, fieldName, ttlValue) => {
    const baseInput = {
      publicId: 'E97010',
      userId: 'user-1',
      amountUsdt: '2602.400000',
      amountRub: '200000.00',
      rateSnapshot: '76.850000',
      now: new Date('2026-05-11T09:00:00.000Z'),
      rateTtlMinutes: 20,
      orderTtlMinutes: 60,
    };

    const input = {
      ...baseInput,
      [fieldName]: ttlValue,
    };

    expect(() => {
      if (direction === 'SELL_USDT') {
        createSellUsdtOrder({ ...input, depositAddressId: 'addr-1' });
      } else {
        createBuyUsdtOrder({
          ...input,
          clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
        });
      }
    }).toThrow(`${fieldName} must be a positive integer`);
  });
});
