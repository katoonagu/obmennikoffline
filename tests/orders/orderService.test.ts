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
        depositAddressId: '   ',
      }),
    ).toThrow('depositAddressId is required for SELL_USDT order');
  });

  it.each([
    ['SELL_USDT', 'publicId', 'publicId is required'],
    ['BUY_USDT', 'publicId', 'publicId is required'],
    ['SELL_USDT', 'userId', 'userId is required'],
    ['BUY_USDT', 'userId', 'userId is required'],
  ] as const)('rejects %s when %s is blank', (direction, fieldName, message) => {
    expect(() => createOrderForTest(direction, { [fieldName]: '   ' })).toThrow(message);
  });

  it.each(
    (['publicId', 'userId'] as const).flatMap((fieldName) =>
      [null, 123].flatMap((value) =>
        (['SELL_USDT', 'BUY_USDT'] as const).map((direction) => [direction, fieldName, value] as const),
      ),
    ),
  )('rejects %s when %s is a non-string runtime value', (direction, fieldName, value) => {
    expect(() => createOrderForTest(direction, { [fieldName]: value })).toThrow(
      `${fieldName} is required`,
    );
  });

  it.each(['SELL_USDT', 'BUY_USDT'] as const)('rejects %s when now is invalid', (direction) => {
    expect(() => createOrderForTest(direction, { now: new Date('invalid') })).toThrow(
      'now must be a valid Date',
    );
  });

  it.each(
    (['amountUsdt', 'amountRub', 'rateSnapshot'] as const).flatMap((fieldName) =>
      ['', '   ', 'abc', '-1', '0', 'Infinity', 'NaN'].flatMap((value) =>
        (['SELL_USDT', 'BUY_USDT'] as const).map((direction) => [direction, fieldName, value] as const),
      ),
    ),
  )('rejects %s when %s is an invalid decimal string: %s', (direction, fieldName, value) => {
    expect(() => createOrderForTest(direction, { [fieldName]: value })).toThrow(
      `${fieldName} must be a positive decimal string`,
    );
  });

  it.each(
    (['amountUsdt', 'amountRub', 'rateSnapshot'] as const).flatMap((fieldName) =>
      [123, null, {}].flatMap((value) =>
        (['SELL_USDT', 'BUY_USDT'] as const).map((direction) => [direction, fieldName, value] as const),
      ),
    ),
  )('rejects %s when %s is a non-string runtime value', (direction, fieldName, value) => {
    expect(() => createOrderForTest(direction, { [fieldName]: value })).toThrow(
      `${fieldName} must be a positive decimal string`,
    );
  });

  it.each(
    [
      ['amountUsdt', '1.1234567', 'amountUsdt must fit Decimal(36, 6)'],
      ['amountRub', '1.123', 'amountRub must fit Decimal(36, 2)'],
      ['rateSnapshot', '1.1234567', 'rateSnapshot must fit Decimal(36, 6)'],
      ['amountUsdt', '1234567890123456789012345678901234567', 'amountUsdt must fit Decimal(36, 6)'],
      ['amountRub', '1234567890123456789012345678901234567', 'amountRub must fit Decimal(36, 2)'],
      ['rateSnapshot', '1234567890123456789012345678901234567', 'rateSnapshot must fit Decimal(36, 6)'],
      ['amountUsdt', '1234567890123456789012345678901', 'amountUsdt must fit Decimal(36, 6)'],
      ['amountRub', '12345678901234567890123456789012345', 'amountRub must fit Decimal(36, 2)'],
      ['rateSnapshot', '1234567890123456789012345678901', 'rateSnapshot must fit Decimal(36, 6)'],
    ].flatMap(([fieldName, value, message]) =>
      (['SELL_USDT', 'BUY_USDT'] as const).map((direction) => [direction, fieldName, value, message] as const),
    ),
  )('rejects %s when %s exceeds decimal precision or scale', (direction, fieldName, value, message) => {
    expect(() => createOrderForTest(direction, { [fieldName]: value })).toThrow(message);
  });

  it.each([null, 123] as const)(
    'rejects SELL_USDT when depositAddressId is a non-string runtime value: %s',
    (value) => {
      expect(() => createOrderForTest('SELL_USDT', { depositAddressId: value })).toThrow(
        'depositAddressId is required for SELL_USDT order',
      );
    },
  );

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

  it.each(['rateTtlMinutes', 'orderTtlMinutes'] as const)(
    'rejects when %s produces an invalid expiry date',
    (fieldName) => {
      expect(() => createOrderForTest('BUY_USDT', { [fieldName]: Number.MAX_SAFE_INTEGER })).toThrow(
        `${fieldName} produces an invalid expiry date`,
      );
    },
  );
});

type TestOrderDirection = 'SELL_USDT' | 'BUY_USDT';

function createOrderForTest(direction: TestOrderDirection, overrides: Record<string, unknown>) {
  if (direction === 'SELL_USDT') {
    return createSellUsdtOrder({
      publicId: 'E74737',
      userId: 'user-1',
      amountUsdt: '5000.000000',
      amountRub: '381250.00',
      rateSnapshot: '76.250000',
      now: new Date('2026-05-11T09:00:00.000Z'),
      rateTtlMinutes: 20,
      orderTtlMinutes: 60,
      depositAddressId: 'addr-1',
      ...overrides,
    } as Parameters<typeof createSellUsdtOrder>[0]);
  }

  return createBuyUsdtOrder({
    publicId: 'E97010',
    userId: 'user-1',
    amountUsdt: '2602.400000',
    amountRub: '200000.00',
    rateSnapshot: '76.850000',
    clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
    now: new Date('2026-05-11T09:00:00.000Z'),
    rateTtlMinutes: 20,
    orderTtlMinutes: 60,
    ...overrides,
  } as Parameters<typeof createBuyUsdtOrder>[0]);
}
