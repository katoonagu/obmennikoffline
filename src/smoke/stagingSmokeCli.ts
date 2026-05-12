import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { TronWeb } from 'tronweb';
import { loadEnvFileIfPresent } from '../api/envFile.js';
import { loadServerConfig } from '../api/serverConfig.js';
import {
  validateTelegramInitData,
  type ValidateTelegramInitDataInput,
  type ValidatedTelegramInitData,
} from '../telegram/validateInitData.js';
import { createTronWebTronProvider } from '../tron/tronWebProvider.js';
import {
  createTronWebReadClient,
  parseTronWatcherCliEnv,
  type TronWebConstructor,
} from '../tron/watchDepositsOnceCli.js';

export type StagingSmokeEnv = Record<string, string | undefined>;

export interface ProductionConfigSmokeDetails {
  adminRoutesEnabled: boolean;
  adminActorCount: number;
  telegramBotTokenConfigured: boolean;
  telegramInitDataMaxAgeSeconds: number | undefined;
  miniAppDevAuth: boolean;
  corsOriginsCount: number;
  host: string;
  port: number;
  ratesConfigured: boolean;
}

export interface TronProviderSmokeDetails {
  fullHostConfigured: boolean;
  eventServerConfigured: boolean;
  apiKeyConfigured: boolean;
  latestConfirmedBlock: string;
}

export interface TelegramInitDataSmokeDetails {
  authDate: string;
  queryIdPresent: boolean;
  userId: string | null;
}

export type StagingSmokeCheck<TDetails> =
  | {
      status: 'passed';
      details: TDetails;
    }
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'failed';
      error: string;
    };

export interface StagingSmokeReport {
  ok: boolean;
  checks: {
    productionConfig: StagingSmokeCheck<ProductionConfigSmokeDetails>;
    tronProvider: StagingSmokeCheck<TronProviderSmokeDetails>;
    telegramInitData: StagingSmokeCheck<TelegramInitDataSmokeDetails>;
  };
}

export interface RunStagingSmokeInput {
  env: StagingSmokeEnv;
  now?: Date;
  readLatestTronBlock?: (env: StagingSmokeEnv) => Promise<TronProviderSmokeDetails>;
  validateTelegramInitData?: (
    input: ValidateTelegramInitDataInput,
  ) => ValidatedTelegramInitData;
}

export interface RunStagingSmokeCliInput {
  env?: StagingSmokeEnv;
  loadEnvFile?: () => boolean;
  writeOutput?: (message: string) => void;
}

export async function runStagingSmoke(
  input: RunStagingSmokeInput,
): Promise<StagingSmokeReport> {
  const checks = {
    productionConfig: runCheck(() => checkProductionConfig(input.env)),
    tronProvider: await runAsyncCheck(() =>
      (input.readLatestTronBlock ?? readLatestTronBlock)(input.env),
    ),
    telegramInitData: runTelegramInitDataCheck(input),
  };

  return {
    ok: Object.values(checks).every((check) => check.status !== 'failed'),
    checks,
  };
}

export async function runStagingSmokeCli(
  input: RunStagingSmokeCliInput = {},
): Promise<number> {
  const loadEnvFile = input.loadEnvFile ?? loadEnvFileIfPresent;
  loadEnvFile();

  const report = await runStagingSmoke({
    env: input.env ?? process.env,
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify(report, null, 2));

  return report.ok ? 0 : 1;
}

export async function readLatestTronBlock(
  env: StagingSmokeEnv,
): Promise<TronProviderSmokeDetails> {
  const config = parseTronWatcherCliEnv(env);
  const client = createTronWebReadClient(
    config,
    TronWeb as unknown as TronWebConstructor,
  );
  const provider = createTronWebTronProvider({ client });
  const latestConfirmedBlock = await provider.getLatestBlockNumber();

  return {
    fullHostConfigured: Boolean(config.fullHost),
    eventServerConfigured: Boolean(config.eventServer),
    apiKeyConfigured: Boolean(config.apiKey),
    latestConfirmedBlock: latestConfirmedBlock.toString(),
  };
}

function checkProductionConfig(env: StagingSmokeEnv): ProductionConfigSmokeDetails {
  const config = loadServerConfig({
    ...env,
    NODE_ENV: 'production',
  });

  return {
    adminRoutesEnabled: config.enableAdminRoutes,
    adminActorCount: config.adminActorIds?.length ?? 0,
    telegramBotTokenConfigured: Boolean(config.telegramBotToken),
    telegramInitDataMaxAgeSeconds: config.telegramInitDataMaxAgeSeconds,
    miniAppDevAuth: config.allowMiniAppDevAuth,
    corsOriginsCount: config.miniAppCorsOrigins?.length ?? 0,
    host: config.host,
    port: config.port,
    ratesConfigured: Boolean(config.rates.buyRate && config.rates.sellRate),
  };
}

function runTelegramInitDataCheck(
  input: RunStagingSmokeInput,
): StagingSmokeCheck<TelegramInitDataSmokeDetails> {
  const initData = readOptional(input.env.TELEGRAM_INIT_DATA);
  if (!initData) {
    return {
      status: 'skipped',
      reason: 'TELEGRAM_INIT_DATA is not configured',
    };
  }

  return runCheck(() => {
    const botToken = readRequired(input.env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN');
    const maxAgeSeconds = readOptionalPositiveInteger(
      input.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
      'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS',
    );
    const validated = (input.validateTelegramInitData ?? validateTelegramInitData)({
      initData,
      botToken,
      ...(maxAgeSeconds === undefined ? {} : { maxAgeSeconds }),
      ...(input.now ? { now: input.now } : {}),
    });

    return {
      authDate: validated.authDate.toISOString(),
      queryIdPresent: Boolean(validated.queryId),
      userId: validated.user ? String(validated.user.id) : null,
    };
  });
}

function runCheck<TDetails>(
  check: () => TDetails,
): StagingSmokeCheck<TDetails> {
  try {
    return {
      status: 'passed',
      details: check(),
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runAsyncCheck<TDetails>(
  check: () => Promise<TDetails>,
): Promise<StagingSmokeCheck<TDetails>> {
  try {
    return {
      status: 'passed',
      details: await check(),
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readRequired(value: string | undefined, name: string): string {
  const trimmed = readOptional(value);
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }

  return trimmed;
}

function readOptionalPositiveInteger(
  value: string | undefined,
  name: string,
): number | undefined {
  const trimmed = readOptional(value);
  if (!trimmed) {
    return undefined;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function isDirectRun(entrypoint: string | undefined, moduleUrl: string): boolean {
  if (!entrypoint) {
    return false;
  }

  return pathToFileURL(resolve(entrypoint)).href === moduleUrl;
}

if (isDirectRun(process.argv[1], import.meta.url)) {
  void (async () => {
    process.exitCode = await runStagingSmokeCli();
  })();
}
