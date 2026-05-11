import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TronWeb } from 'tronweb';
import {
  runUsdtDepositWatcherOnce,
  type RunUsdtDepositWatcherOnceInput,
  type RunUsdtDepositWatcherOnceResult,
  type UsdtDepositWatcherCursorDb,
} from './runUsdtDepositWatcherOnce.js';
import {
  createTronWebTronProvider,
  type TronWebReadClient,
} from './tronWebProvider.js';

export interface TronWatcherCliEnv {
  TRON_FULL_HOST?: string;
  TRON_EVENT_SERVER?: string;
  TRON_API_KEY?: string;
  TRON_WATCHER_CURSOR_ID?: string;
  TRON_WATCHER_ADDRESS_BATCH_SIZE?: string;
}

export interface TronWatcherCliConfig {
  fullHost: string;
  eventServer?: string;
  apiKey?: string;
  cursorId?: string;
  addressBatchSize?: number;
}

export interface TronWebConstructorOptions {
  fullHost: string;
  eventServer?: string;
  headers?: Record<string, string>;
  eventHeaders?: Record<string, string>;
}

export type TronWebConstructor = new (
  options: TronWebConstructorOptions,
) => TronWebReadClient;

export interface RunTronDepositWatcherCliInput {
  env: TronWatcherCliEnv;
  db: UsdtDepositWatcherCursorDb;
  TronWebCtor?: TronWebConstructor;
  runOnce?: (
    input: RunUsdtDepositWatcherOnceInput,
  ) => Promise<RunUsdtDepositWatcherOnceResult>;
  writeOutput?: (message: string) => void;
}

const DEFAULT_TRON_FULL_HOST = 'https://api.trongrid.io';
const TRON_GRID_API_KEY_HEADER = 'TRON-PRO-API-KEY';

export function parseTronWatcherCliEnv(
  env: TronWatcherCliEnv,
): TronWatcherCliConfig {
  const fullHost = parseOptionalHttpUrl(
    env.TRON_FULL_HOST,
    'TRON_FULL_HOST',
  ) ?? DEFAULT_TRON_FULL_HOST;
  const eventServer = parseOptionalHttpUrl(
    env.TRON_EVENT_SERVER,
    'TRON_EVENT_SERVER',
  );
  const apiKey = trimOptional(env.TRON_API_KEY);
  const cursorId = trimOptional(env.TRON_WATCHER_CURSOR_ID);
  const addressBatchSize = parseOptionalPositiveInteger(
    env.TRON_WATCHER_ADDRESS_BATCH_SIZE,
    'TRON_WATCHER_ADDRESS_BATCH_SIZE',
  );

  return {
    fullHost,
    ...(eventServer ? { eventServer } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(cursorId ? { cursorId } : {}),
    ...(addressBatchSize === undefined ? {} : { addressBatchSize }),
  };
}

export function createTronWebReadClient(
  config: TronWatcherCliConfig,
  TronWebCtor: TronWebConstructor,
): TronWebReadClient {
  const headers = config.apiKey
    ? { [TRON_GRID_API_KEY_HEADER]: config.apiKey }
    : undefined;

  return new TronWebCtor({
    fullHost: config.fullHost,
    ...(config.eventServer ? { eventServer: config.eventServer } : {}),
    ...(headers ? { headers, eventHeaders: headers } : {}),
  });
}

export async function runTronDepositWatcherCli(
  input: RunTronDepositWatcherCliInput,
): Promise<number> {
  const config = parseTronWatcherCliEnv(input.env);
  const client = createTronWebReadClient(
    config,
    input.TronWebCtor ?? (TronWeb as unknown as TronWebConstructor),
  );
  const provider = createTronWebTronProvider({ client });
  const runOnce = input.runOnce ?? runUsdtDepositWatcherOnce;

  const result = await runOnce({
    db: input.db,
    provider,
    ...(config.cursorId ? { cursorId: config.cursorId } : {}),
    ...(config.addressBatchSize === undefined
      ? {}
      : { addressBatchSize: config.addressBatchSize }),
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify(toJsonSafe(result), null, 2));

  return result.status === 'failed' ? 1 : 0;
}

export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonSafe(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
    );
  }

  return value;
}

function parseOptionalHttpUrl(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${fieldName} must be an http(s) URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must be an http(s) URL`);
  }

  return parsed.toString().replace(/\/$/, '');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
      const exitCode = await runTronDepositWatcherCli({
        env: process.env,
        db: prisma as unknown as UsdtDepositWatcherCursorDb,
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
