import {
  normalizeUsdtRubRates,
  type UsdtRubRates,
} from '../rates/rateQuoteService.js';
import { isValidAdminActorId } from './adminActorId.js';

export interface ServerConfig {
  adminApiToken: string | undefined;
  adminActorIds: string[] | undefined;
  enableAdminRoutes: boolean;
  telegramBotToken: string | undefined;
  telegramInitDataMaxAgeSeconds: number | undefined;
  allowMiniAppDevAuth: boolean;
  miniAppCorsOrigins: string[] | undefined;
  rates: UsdtRubRates;
  port: number;
  host: string;
}

type Env = Record<string, string | undefined>;

const TELEGRAM_BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{30,}$/;
const MAX_PRODUCTION_TELEGRAM_INIT_DATA_AGE_SECONDS = 86_400;
const MIN_PRODUCTION_ADMIN_TOKEN_UNIQUE_CHARS = 8;

export function loadServerConfig(env: Env): ServerConfig {
  readRequiredEnv(env, 'DATABASE_URL');

  const adminApiToken = readOptionalEnv(env, 'ADMIN_API_TOKEN');
  const adminActorIds = readOptionalCsvEnv(env, 'ADMIN_ACTOR_IDS');
  const telegramBotToken = readOptionalEnv(env, 'TELEGRAM_BOT_TOKEN');
  const telegramInitDataMaxAgeSeconds = readOptionalPositiveIntegerEnv(
    env,
    'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS',
  );
  const allowMiniAppDevAuth =
    readOptionalBooleanEnv(env, 'MINIAPP_DEV_AUTH_ENABLED') ?? false;
  const miniAppCorsOrigins = readOptionalCorsOriginsEnv(env, 'MINIAPP_CORS_ORIGINS');

  if (readOptionalEnv(env, 'NODE_ENV') === 'production') {
    if (allowMiniAppDevAuth) {
      throw new Error('MINIAPP_DEV_AUTH_ENABLED must not be enabled in production');
    }

    if (!telegramBotToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required in production');
    }

    if (!TELEGRAM_BOT_TOKEN_PATTERN.test(telegramBotToken)) {
      throw new Error('TELEGRAM_BOT_TOKEN must look like a Telegram bot token');
    }

    if (!adminApiToken) {
      throw new Error('ADMIN_API_TOKEN is required in production');
    }

    if (!telegramInitDataMaxAgeSeconds) {
      throw new Error('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS is required in production');
    }

    if (
      telegramInitDataMaxAgeSeconds >
      MAX_PRODUCTION_TELEGRAM_INIT_DATA_AGE_SECONDS
    ) {
      throw new Error(
        'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be no more than 86400 in production',
      );
    }

    if (adminApiToken.length < 32) {
      throw new Error('ADMIN_API_TOKEN must be at least 32 characters in production');
    }

    if (adminApiToken === telegramBotToken) {
      throw new Error('ADMIN_API_TOKEN must be distinct from TELEGRAM_BOT_TOKEN');
    }

    if (/\s/.test(adminApiToken)) {
      throw new Error('ADMIN_API_TOKEN must not contain whitespace in production');
    }

    if (countUniqueCharacters(adminApiToken) < MIN_PRODUCTION_ADMIN_TOKEN_UNIQUE_CHARS) {
      throw new Error('ADMIN_API_TOKEN must not be a repeated placeholder in production');
    }

    if (!adminActorIds) {
      throw new Error('ADMIN_ACTOR_IDS is required in production');
    }
  }

  if (adminActorIds?.some((actorId) => !isValidAdminActorId(actorId))) {
    throw new Error('ADMIN_ACTOR_IDS contains an invalid actor id');
  }

  const rates = normalizeUsdtRubRates({
    buyRate: readRequiredEnv(env, 'USDT_RUB_BUY_RATE'),
    sellRate: readRequiredEnv(env, 'USDT_RUB_SELL_RATE'),
  });
  assertPositiveUsdtRubSpread(rates);

  return {
    adminApiToken,
    adminActorIds,
    enableAdminRoutes: Boolean(adminApiToken),
    telegramBotToken,
    telegramInitDataMaxAgeSeconds,
    allowMiniAppDevAuth,
    miniAppCorsOrigins,
    rates,
    port: readOptionalPositiveIntegerEnv(env, 'PORT') ?? 3000,
    host: readOptionalEnv(env, 'HOST') ?? '0.0.0.0',
  };
}

function readOptionalEnv(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readRequiredEnv(env: Env, name: string): string {
  const value = readOptionalEnv(env, name);
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readOptionalBooleanEnv(env: Env, name: string): boolean | undefined {
  const value = readOptionalEnv(env, name);
  if (!value) {
    return undefined;
  }

  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false`);
  }

  return value === 'true';
}

function readOptionalPositiveIntegerEnv(
  env: Env,
  name: string,
): number | undefined {
  const value = readOptionalEnv(env, name);
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function readOptionalCsvEnv(env: Env, name: string): string[] | undefined {
  const value = readOptionalEnv(env, name);
  if (!value) {
    return undefined;
  }

  const values = value.split(',').map((entry) => entry.trim());

  if (values.some((entry) => !entry)) {
    throw new Error(`${name} must not contain empty entries`);
  }

  if (new Set(values).size !== values.length) {
    throw new Error(`${name} must not contain duplicate values`);
  }

  return values.length > 0 ? values : undefined;
}

function readOptionalCorsOriginsEnv(env: Env, name: string): string[] | undefined {
  const values = readOptionalCsvEnv(env, name);
  if (!values) {
    return undefined;
  }

  const origins = values.map((value) => normalizeCorsOrigin(name, value));
  if (new Set(origins).size !== origins.length) {
    throw new Error(`${name} must not contain duplicate origins`);
  }

  return origins;
}

function normalizeCorsOrigin(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} contains an invalid origin`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} contains an invalid origin`);
  }

  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} contains an invalid origin`);
  }

  return url.origin;
}

function countUniqueCharacters(value: string): number {
  return new Set([...value]).size;
}

function assertPositiveUsdtRubSpread(rates: UsdtRubRates): void {
  if (parseNormalizedRate(rates.buyRate) <= parseNormalizedRate(rates.sellRate)) {
    throw new Error('USDT_RUB_BUY_RATE must be greater than USDT_RUB_SELL_RATE');
  }
}

function parseNormalizedRate(value: string): bigint {
  return BigInt(value.replace('.', ''));
}
