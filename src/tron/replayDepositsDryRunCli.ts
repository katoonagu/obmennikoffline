import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TronWeb } from 'tronweb';
import {
  runUsdtDepositReplayDryRun,
  type RunUsdtDepositReplayDryRunInput,
  type RunUsdtDepositReplayDryRunResult,
  type UsdtDepositReplayDryRunDb,
} from './replayUsdtDepositDryRun.js';
import {
  createTronWebReadClient,
  parseTronWatcherCliEnv,
  toJsonSafe,
  type TronWatcherCliEnv,
  type TronWebConstructorOptions,
} from './watchDepositsOnceCli.js';
import { createTronWebTronProvider, type TronWebReadClient } from './tronWebProvider.js';

export interface ReplayDepositsDryRunCliEnv extends TronWatcherCliEnv {
  TRON_REPLAY_FROM_BLOCK?: string;
  TRON_REPLAY_TO_BLOCK?: string;
}

export interface ReplayDepositsDryRunCliConfig {
  fullHost: string;
  eventServer?: string;
  apiKey?: string;
  fromBlock: bigint;
  toBlock: bigint;
  addressBatchSize?: number;
}

export type ReplayDepositsDryRunTronWebConstructor = new (
  options: TronWebConstructorOptions,
) => TronWebReadClient;

export interface RunReplayDepositsDryRunCliInput {
  env: ReplayDepositsDryRunCliEnv;
  db: UsdtDepositReplayDryRunDb;
  TronWebCtor?: ReplayDepositsDryRunTronWebConstructor;
  runReplay?: (
    input: RunUsdtDepositReplayDryRunInput,
  ) => Promise<RunUsdtDepositReplayDryRunResult>;
  writeOutput?: (message: string) => void;
}

export function parseReplayDepositsDryRunCliEnv(
  env: ReplayDepositsDryRunCliEnv,
): ReplayDepositsDryRunCliConfig {
  const providerConfig = parseTronWatcherCliEnv(env);
  const fromBlock = parseRequiredBlock(
    env.TRON_REPLAY_FROM_BLOCK,
    'TRON_REPLAY_FROM_BLOCK',
  );
  const toBlock = parseRequiredBlock(
    env.TRON_REPLAY_TO_BLOCK,
    'TRON_REPLAY_TO_BLOCK',
  );

  if (fromBlock > toBlock) {
    throw new Error(
      'TRON_REPLAY_FROM_BLOCK must be less than or equal to TRON_REPLAY_TO_BLOCK',
    );
  }

  return {
    fullHost: providerConfig.fullHost,
    ...(providerConfig.eventServer ? { eventServer: providerConfig.eventServer } : {}),
    ...(providerConfig.apiKey ? { apiKey: providerConfig.apiKey } : {}),
    fromBlock,
    toBlock,
    ...(providerConfig.addressBatchSize === undefined
      ? {}
      : { addressBatchSize: providerConfig.addressBatchSize }),
  };
}

export async function runReplayDepositsDryRunCli(
  input: RunReplayDepositsDryRunCliInput,
): Promise<number> {
  const config = parseReplayDepositsDryRunCliEnv(input.env);
  const client = createTronWebReadClient(
    config,
    input.TronWebCtor ?? (TronWeb as unknown as ReplayDepositsDryRunTronWebConstructor),
  );
  const provider = createTronWebTronProvider({ client });
  const runReplay = input.runReplay ?? runUsdtDepositReplayDryRun;

  const result = await runReplay({
    db: input.db,
    provider,
    fromBlock: config.fromBlock,
    toBlock: config.toBlock,
    ...(config.addressBatchSize === undefined
      ? {}
      : { batchSize: config.addressBatchSize }),
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify(toJsonSafe(result), null, 2));

  return result.failedTransfers.length > 0 ? 1 : 0;
}

function parseRequiredBlock(value: string | undefined, fieldName: string): bigint {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a non-negative integer block number`);
  }

  return BigInt(trimmed);
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
      const exitCode = await runReplayDepositsDryRunCli({
        env: process.env,
        db: prisma as unknown as UsdtDepositReplayDryRunDb,
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
