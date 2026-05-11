import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  configureUsdtDepositWatcherCursorInDb,
  type ConfigureUsdtDepositWatcherCursorInput,
  type UsdtDepositWatcherCursorProvisioningDb,
  type WatcherCursorRecord,
} from './runUsdtDepositWatcherOnce.js';
import { toJsonSafe } from './watchDepositsOnceCli.js';

export interface ConfigureWatcherCursorCliEnv {
  TRON_WATCHER_CURSOR_ID?: string;
  TRON_WATCHER_LAST_PROCESSED_BLOCK?: string;
  TRON_WATCHER_CONFIRMATION_DEPTH?: string;
  TRON_WATCHER_MAX_BLOCK_RANGE?: string;
}

export interface ConfigureWatcherCursorCliConfig {
  cursorId?: string;
  lastProcessedBlock: bigint;
  confirmationDepth: number;
  maxBlockRange: number;
}

export interface RunConfigureWatcherCursorCliInput {
  env: ConfigureWatcherCursorCliEnv;
  db: UsdtDepositWatcherCursorProvisioningDb;
  configureCursor?: (
    input: ConfigureUsdtDepositWatcherCursorInput,
  ) => Promise<WatcherCursorRecord>;
  writeOutput?: (message: string) => void;
}

const DEFAULT_CONFIRMATION_DEPTH = 20;
const DEFAULT_MAX_BLOCK_RANGE = 100;

export function parseConfigureWatcherCursorCliEnv(
  env: ConfigureWatcherCursorCliEnv,
): ConfigureWatcherCursorCliConfig {
  const cursorId = trimOptional(env.TRON_WATCHER_CURSOR_ID);
  const lastProcessedBlock = parseRequiredNonNegativeBigInt(
    env.TRON_WATCHER_LAST_PROCESSED_BLOCK,
    'TRON_WATCHER_LAST_PROCESSED_BLOCK',
  );
  const confirmationDepth =
    parseOptionalNonNegativeInteger(
      env.TRON_WATCHER_CONFIRMATION_DEPTH,
      'TRON_WATCHER_CONFIRMATION_DEPTH',
    ) ?? DEFAULT_CONFIRMATION_DEPTH;
  const maxBlockRange =
    parseOptionalPositiveInteger(
      env.TRON_WATCHER_MAX_BLOCK_RANGE,
      'TRON_WATCHER_MAX_BLOCK_RANGE',
    ) ?? DEFAULT_MAX_BLOCK_RANGE;

  return {
    ...(cursorId ? { cursorId } : {}),
    lastProcessedBlock,
    confirmationDepth,
    maxBlockRange,
  };
}

export async function runConfigureWatcherCursorCli(
  input: RunConfigureWatcherCursorCliInput,
): Promise<number> {
  const config = parseConfigureWatcherCursorCliEnv(input.env);
  const configureCursor =
    input.configureCursor ?? configureUsdtDepositWatcherCursorInDb;
  const cursor = await configureCursor({
    db: input.db,
    ...(config.cursorId ? { cursorId: config.cursorId } : {}),
    lastProcessedBlock: config.lastProcessedBlock,
    confirmationDepth: config.confirmationDepth,
    maxBlockRange: config.maxBlockRange,
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify(toJsonSafe(cursor), null, 2));

  return 0;
}

function parseRequiredNonNegativeBigInt(
  value: string | undefined,
  fieldName: string,
): bigint {
  const trimmed = trimOptional(value);
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return BigInt(trimmed);
}

function parseOptionalNonNegativeInteger(
  value: string | undefined,
  fieldName: string,
): number | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  fieldName: string,
): number | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }

  return parsed;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isDirectRun(entrypoint: string | undefined, moduleUrl: string): boolean {
  if (!entrypoint) {
    return false;
  }

  return pathToFileURL(resolve(entrypoint)).href === moduleUrl;
}

if (isDirectRun(process.argv[1], import.meta.url)) {
  void (async () => {
    const { prisma } = await import('../db/prisma.js');

    try {
      const exitCode = await runConfigureWatcherCursorCli({
        env: process.env,
        db: prisma as unknown as UsdtDepositWatcherCursorProvisioningDb,
      });
      process.exitCode = exitCode;
    } catch (error: unknown) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
