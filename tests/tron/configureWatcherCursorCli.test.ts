import { describe, expect, it, vi } from 'vitest';
import {
  parseConfigureWatcherCursorCliEnv,
  runConfigureWatcherCursorCli,
} from '../../src/tron/configureWatcherCursorCli.js';
import {
  TRON_USDT_DEPOSIT_CURSOR_ID,
  type UsdtDepositWatcherCursorProvisioningDb,
  type WatcherCursorRecord,
} from '../../src/tron/runUsdtDepositWatcherOnce.js';

function createCursor(
  overrides: Partial<WatcherCursorRecord> = {},
): WatcherCursorRecord {
  return {
    id: TRON_USDT_DEPOSIT_CURSOR_ID,
    network: 'TRON',
    asset: 'USDT',
    lastProcessedBlock: 123n,
    confirmationDepth: 20,
    maxBlockRange: 100,
    ...overrides,
  };
}

describe('parseConfigureWatcherCursorCliEnv', () => {
  it('parses required and optional watcher cursor settings from env', () => {
    expect(
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_CURSOR_ID: ' custom-cursor ',
        TRON_WATCHER_LAST_PROCESSED_BLOCK: ' 123456 ',
        TRON_WATCHER_CONFIRMATION_DEPTH: '12',
        TRON_WATCHER_MAX_BLOCK_RANGE: '250',
      }),
    ).toEqual({
      cursorId: 'custom-cursor',
      lastProcessedBlock: 123456n,
      confirmationDepth: 12,
      maxBlockRange: 250,
    });
  });

  it('uses conservative defaults for confirmation depth and block range', () => {
    expect(
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '0',
      }),
    ).toEqual({
      lastProcessedBlock: 0n,
      confirmationDepth: 20,
      maxBlockRange: 100,
    });
  });

  it('rejects zero confirmation depth only in production', () => {
    expect(
      parseConfigureWatcherCursorCliEnv({
        NODE_ENV: 'development',
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '100',
        TRON_WATCHER_CONFIRMATION_DEPTH: '0',
      }),
    ).toMatchObject({
      confirmationDepth: 0,
    });

    expect(() =>
      parseConfigureWatcherCursorCliEnv({
        NODE_ENV: 'production',
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '100',
        TRON_WATCHER_CONFIRMATION_DEPTH: '0',
      }),
    ).toThrow(
      'TRON_WATCHER_CONFIRMATION_DEPTH must be greater than zero in production',
    );
  });

  it('rejects missing or malformed block settings before touching the database', () => {
    expect(() => parseConfigureWatcherCursorCliEnv({})).toThrow(
      'TRON_WATCHER_LAST_PROCESSED_BLOCK is required',
    );

    expect(() =>
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '-1',
      }),
    ).toThrow('TRON_WATCHER_LAST_PROCESSED_BLOCK must be a non-negative integer');

    expect(() =>
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '100',
        TRON_WATCHER_CONFIRMATION_DEPTH: '-1',
      }),
    ).toThrow(
      'TRON_WATCHER_CONFIRMATION_DEPTH must be a non-negative safe integer',
    );

    expect(() =>
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '100',
        TRON_WATCHER_CONFIRMATION_DEPTH: '1e1',
      }),
    ).toThrow(
      'TRON_WATCHER_CONFIRMATION_DEPTH must be a non-negative safe integer',
    );

    expect(() =>
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '100',
        TRON_WATCHER_MAX_BLOCK_RANGE: '0',
      }),
    ).toThrow('TRON_WATCHER_MAX_BLOCK_RANGE must be a positive safe integer');

    expect(() =>
      parseConfigureWatcherCursorCliEnv({
        TRON_WATCHER_LAST_PROCESSED_BLOCK: '100',
        TRON_WATCHER_MAX_BLOCK_RANGE: '1e2',
      }),
    ).toThrow('TRON_WATCHER_MAX_BLOCK_RANGE must be a positive safe integer');
  });
});

describe('runConfigureWatcherCursorCli', () => {
  it('wires env, DB and cursor provisioning, then prints JSON-safe output', async () => {
    const db = {} as UsdtDepositWatcherCursorProvisioningDb;
    const output: string[] = [];
    const configuredCursor = createCursor({
      id: 'custom-cursor',
      lastProcessedBlock: 123456n,
      confirmationDepth: 12,
      maxBlockRange: 250,
    });
    const configureCursor = vi.fn(async () => configuredCursor);

    await expect(
      runConfigureWatcherCursorCli({
        env: {
          TRON_WATCHER_CURSOR_ID: 'custom-cursor',
          TRON_WATCHER_LAST_PROCESSED_BLOCK: '123456',
          TRON_WATCHER_CONFIRMATION_DEPTH: '12',
          TRON_WATCHER_MAX_BLOCK_RANGE: '250',
        },
        db,
        configureCursor,
        writeOutput: (message) => output.push(message),
      }),
    ).resolves.toBe(0);

    expect(configureCursor).toHaveBeenCalledWith({
      db,
      cursorId: 'custom-cursor',
      lastProcessedBlock: 123456n,
      confirmationDepth: 12,
      maxBlockRange: 250,
    });
    expect(output).toEqual([
      JSON.stringify(
        {
          id: 'custom-cursor',
          network: 'TRON',
          asset: 'USDT',
          lastProcessedBlock: '123456',
          confirmationDepth: 12,
          maxBlockRange: 250,
        },
        null,
        2,
      ),
    ]);
  });

  it('accepts documented CLI flags for cursor provisioning', async () => {
    const db = {} as UsdtDepositWatcherCursorProvisioningDb;
    const configuredCursor = createCursor({
      id: 'custom-cursor',
      lastProcessedBlock: 123456n,
      confirmationDepth: 12,
      maxBlockRange: 250,
    });
    const configureCursor = vi.fn(async () => configuredCursor);

    await expect(
      runConfigureWatcherCursorCli({
        env: {},
        argv: [
          '--cursor-id',
          'custom-cursor',
          '--last-processed-block',
          '123456',
          '--confirmation-depth',
          '12',
          '--max-block-range',
          '250',
        ],
        db,
        configureCursor,
        writeOutput: vi.fn(),
      }),
    ).resolves.toBe(0);

    expect(configureCursor).toHaveBeenCalledWith({
      db,
      cursorId: 'custom-cursor',
      lastProcessedBlock: 123456n,
      confirmationDepth: 12,
      maxBlockRange: 250,
    });
  });
});
