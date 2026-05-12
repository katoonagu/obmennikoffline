import { describe, expect, it, vi } from 'vitest';
import {
  parseExpireOrdersCliEnv,
  runExpireOrdersCli,
} from '../../src/orders/expireOrdersCli.js';
import type {
  ExpireOpenOrdersResult,
  OrderExpirationDb,
} from '../../src/orders/expireOrders.js';

const NOW = new Date('2026-05-11T10:00:00.000Z');

describe('parseExpireOrdersCliEnv', () => {
  it('parses optional expiration limit from env', () => {
    expect(parseExpireOrdersCliEnv({})).toEqual({});
    expect(
      parseExpireOrdersCliEnv({
        ORDER_EXPIRATION_LIMIT: ' 50 ',
      }),
    ).toEqual({
      limit: 50,
    });
  });

  it('rejects malformed expiration limits', () => {
    expect(() =>
      parseExpireOrdersCliEnv({
        ORDER_EXPIRATION_LIMIT: '0',
      }),
    ).toThrow('ORDER_EXPIRATION_LIMIT must be a positive safe integer');

    expect(() =>
      parseExpireOrdersCliEnv({
        ORDER_EXPIRATION_LIMIT: '1e2',
      }),
    ).toThrow('ORDER_EXPIRATION_LIMIT must be a positive safe integer');
  });
});

describe('runExpireOrdersCli', () => {
  it('wires env, DB, current time and expiration service, then prints JSON output', async () => {
    const db = {} as OrderExpirationDb;
    const output: string[] = [];
    const result: ExpireOpenOrdersResult = {
      expiredCount: 2,
      skippedCount: 0,
      expiredPublicIds: ['E74737', 'E97010'],
    };
    const expireOrders = vi.fn(async () => result);

    await expect(
      runExpireOrdersCli({
        env: {
          ORDER_EXPIRATION_LIMIT: '50',
        },
        db,
        now: () => NOW,
        expireOrders,
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(0);

    expect(expireOrders).toHaveBeenCalledWith(db, {
      now: NOW,
      limit: 50,
    });
    expect(output).toEqual([JSON.stringify(result, null, 2)]);
  });
});
