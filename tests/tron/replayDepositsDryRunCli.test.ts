import { describe, expect, it, vi } from 'vitest';
import {
  parseReplayDepositsDryRunCliEnv,
  runReplayDepositsDryRunCli,
  type ReplayDepositsDryRunTronWebConstructor,
} from '../../src/tron/replayDepositsDryRunCli.js';
import type { UsdtDepositReplayDryRunDb } from '../../src/tron/replayUsdtDepositDryRun.js';
import type { TronWebReadClient } from '../../src/tron/tronWebProvider.js';

class FakeTronWeb implements TronWebReadClient {
  static calls: unknown[] = [];

  trx = {
    getCurrentBlock: vi.fn(),
    getConfirmedCurrentBlock: vi.fn(),
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

describe('parseReplayDepositsDryRunCliEnv', () => {
  it('requires replay block range and parses provider settings', () => {
    expect(parseReplayDepositsDryRunCliEnv({
      TRON_REPLAY_FROM_BLOCK: '64200000',
      TRON_REPLAY_TO_BLOCK: '64200010',
      TRON_FULL_HOST: 'https://api.trongrid.io',
      TRON_API_KEY: ' secret-key ',
      TRON_WATCHER_ADDRESS_BATCH_SIZE: '25',
    })).toEqual({
      fullHost: 'https://api.trongrid.io',
      apiKey: 'secret-key',
      fromBlock: 64200000n,
      toBlock: 64200010n,
      addressBatchSize: 25,
    });

    expect(() => parseReplayDepositsDryRunCliEnv({
      TRON_REPLAY_TO_BLOCK: '64200010',
    })).toThrow('TRON_REPLAY_FROM_BLOCK is required');
    expect(() => parseReplayDepositsDryRunCliEnv({
      TRON_REPLAY_FROM_BLOCK: '64200011',
      TRON_REPLAY_TO_BLOCK: '64200010',
    })).toThrow('TRON_REPLAY_FROM_BLOCK must be less than or equal to TRON_REPLAY_TO_BLOCK');
  });
});

describe('runReplayDepositsDryRunCli', () => {
  it('wires env, read-only Tron provider, DB, and replay runner without printing secrets', async () => {
    FakeTronWeb.calls = [];
    const output: string[] = [];
    const db = {} as UsdtDepositReplayDryRunDb;
    const runReplay = vi.fn(async (input) => {
      expect(input.db).toBe(db);
      expect(input.fromBlock).toBe(64200000n);
      expect(input.toBlock).toBe(64200010n);
      expect(input.batchSize).toBe(25);

      return {
        watchedAddressCount: 1,
        fetchedTransferCount: 0,
        matches: [],
        failedTransfers: [],
      };
    });

    await expect(
      runReplayDepositsDryRunCli({
        env: {
          TRON_REPLAY_FROM_BLOCK: '64200000',
          TRON_REPLAY_TO_BLOCK: '64200010',
          TRON_FULL_HOST: 'https://api.trongrid.io',
          TRON_API_KEY: 'secret-key',
          TRON_WATCHER_ADDRESS_BATCH_SIZE: '25',
        },
        db,
        TronWebCtor: FakeTronWeb as ReplayDepositsDryRunTronWebConstructor,
        runReplay,
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(0);

    expect(FakeTronWeb.calls).toEqual([
      {
        fullHost: 'https://api.trongrid.io',
        headers: {
          'TRON-PRO-API-KEY': 'secret-key',
        },
        eventHeaders: {
          'TRON-PRO-API-KEY': 'secret-key',
        },
      },
    ]);
    expect(output).toEqual([
      JSON.stringify({
        watchedAddressCount: 1,
        fetchedTransferCount: 0,
        matches: [],
        failedTransfers: [],
      }, null, 2),
    ]);
    expect(output.join('\n')).not.toContain('secret-key');
  });
});
