import { describe, expect, it, vi } from 'vitest';
import {
  createTronWebReadClient,
  parseTronWatcherCliEnv,
  runTronDepositWatcherCli,
  toJsonSafe,
  type TronWebConstructor,
} from '../../src/tron/watchDepositsOnceCli.js';
import type { TronWebReadClient } from '../../src/tron/tronWebProvider.js';
import type {
  RunUsdtDepositWatcherOnceResult,
  UsdtDepositWatcherCursorDb,
} from '../../src/tron/runUsdtDepositWatcherOnce.js';

class FakeTronWeb implements TronWebReadClient {
  static calls: unknown[] = [];

  trx = {
    getCurrentBlock: vi.fn(async () => ({
      block_header: {
        raw_data: {
          number: 101,
        },
      },
    })),
    getConfirmedCurrentBlock: vi.fn(async () => ({
      block_header: {
        raw_data: {
          number: 100,
        },
      },
    })),
  };

  event = {
    getEventsByBlockNumber: vi.fn(async () => ({
      success: true,
      data: [],
      meta: {
        page_size: 0,
      },
    })),
  };

  address = {
    fromHex: vi.fn((address: string) => address),
  };

  constructor(options: unknown) {
    FakeTronWeb.calls.push(options);
  }
}

function createProcessedResult(
  overrides: Partial<
    Extract<RunUsdtDepositWatcherOnceResult, { status: 'processed' }>
  > = {},
): Extract<RunUsdtDepositWatcherOnceResult, { status: 'processed' }> {
  return {
    status: 'processed',
    cursorId: 'tron-usdt-deposits',
    fromBlock: 101n,
    toBlock: 110n,
    latestBlock: 130n,
    safeBlock: 110n,
    watcherResult: {
      watchedAddressCount: 1,
      fetchedTransferCount: 0,
      ingested: [],
      failedTransfers: [],
    },
    ...overrides,
  };
}

describe('parseTronWatcherCliEnv', () => {
  it('parses defaults and optional TRON settings from env', () => {
    expect(
      parseTronWatcherCliEnv({
        TRON_FULL_HOST: ' https://api.trongrid.io ',
        TRON_EVENT_SERVER: ' https://api.trongrid.io ',
        TRON_API_KEY: ' secret-key ',
        TRON_WATCHER_CURSOR_ID: ' custom-cursor ',
        TRON_WATCHER_ADDRESS_BATCH_SIZE: '250',
      }),
    ).toEqual({
      fullHost: 'https://api.trongrid.io',
      eventServer: 'https://api.trongrid.io',
      apiKey: 'secret-key',
      cursorId: 'custom-cursor',
      addressBatchSize: 250,
    });

    expect(parseTronWatcherCliEnv({})).toEqual({
      fullHost: 'https://api.trongrid.io',
    });
  });

  it('rejects malformed URLs and batch sizes', () => {
    expect(() =>
      parseTronWatcherCliEnv({
        TRON_FULL_HOST: 'ftp://api.trongrid.io',
      }),
    ).toThrow('TRON_FULL_HOST must be an http(s) URL');

    expect(() =>
      parseTronWatcherCliEnv({
        TRON_WATCHER_ADDRESS_BATCH_SIZE: '0',
      }),
    ).toThrow('TRON_WATCHER_ADDRESS_BATCH_SIZE must be a positive safe integer');

    expect(() =>
      parseTronWatcherCliEnv({
        TRON_WATCHER_ADDRESS_BATCH_SIZE: '1e2',
      }),
    ).toThrow('TRON_WATCHER_ADDRESS_BATCH_SIZE must be a positive safe integer');
  });
});

describe('createTronWebReadClient', () => {
  it('constructs TronWeb with read-only host and optional API key headers', () => {
    FakeTronWeb.calls = [];

    const client = createTronWebReadClient(
      {
        fullHost: 'https://api.trongrid.io',
        eventServer: 'https://event.trongrid.io',
        apiKey: 'secret-key',
      },
      FakeTronWeb as TronWebConstructor,
    );

    expect(client).toBeInstanceOf(FakeTronWeb);
    expect(FakeTronWeb.calls).toEqual([
      {
        fullHost: 'https://api.trongrid.io',
        eventServer: 'https://event.trongrid.io',
        headers: {
          'TRON-PRO-API-KEY': 'secret-key',
        },
        eventHeaders: {
          'TRON-PRO-API-KEY': 'secret-key',
        },
      },
    ]);
  });
});

describe('toJsonSafe', () => {
  it('serializes bigints and dates without mutating plain data', () => {
    expect(
      toJsonSafe({
        block: 123n,
        at: new Date('2026-05-11T12:00:00.000Z'),
        nested: [1n, 'ok'],
      }),
    ).toEqual({
      block: '123',
      at: '2026-05-11T12:00:00.000Z',
      nested: ['1', 'ok'],
    });
  });
});

describe('runTronDepositWatcherCli', () => {
  it('wires env, TronWeb provider, DB and watcher runner, then prints JSON-safe result', async () => {
    FakeTronWeb.calls = [];
    const output: string[] = [];
    const db = {} as UsdtDepositWatcherCursorDb;
    const runOnce = vi.fn(async (input) => {
      await expect(input.provider.getLatestBlockNumber()).resolves.toBe(100n);
      expect(input.db).toBe(db);
      expect(input.cursorId).toBe('custom-cursor');
      expect(input.addressBatchSize).toBe(250);

      return createProcessedResult();
    });

    await expect(
      runTronDepositWatcherCli({
        env: {
          TRON_FULL_HOST: 'https://api.trongrid.io',
          TRON_API_KEY: 'secret-key',
          TRON_WATCHER_CURSOR_ID: 'custom-cursor',
          TRON_WATCHER_ADDRESS_BATCH_SIZE: '250',
        },
        db,
        TronWebCtor: FakeTronWeb as TronWebConstructor,
        runOnce,
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(0);

    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(output).toEqual([
      JSON.stringify(toJsonSafe(createProcessedResult()), null, 2),
    ]);
    expect(output.join('\n')).not.toContain('secret-key');
  });

  it('returns non-zero for failed watcher runs', async () => {
    const output: string[] = [];
    const failedResult: RunUsdtDepositWatcherOnceResult = {
      status: 'failed',
      cursorId: 'tron-usdt-deposits',
      fromBlock: 101n,
      toBlock: 110n,
      latestBlock: 130n,
      safeBlock: 110n,
      watcherResult: {
        watchedAddressCount: 1,
        fetchedTransferCount: 1,
        ingested: [],
        failedTransfers: [
          {
            txId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            logIndex: 0,
            toAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
            error: 'bad transfer',
          },
        ],
      },
    };

    await expect(
      runTronDepositWatcherCli({
        env: {},
        db: {} as UsdtDepositWatcherCursorDb,
        TronWebCtor: FakeTronWeb as TronWebConstructor,
        runOnce: vi.fn(async () => failedResult),
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(1);

    expect(output).toEqual([JSON.stringify(toJsonSafe(failedResult), null, 2)]);
  });
});
