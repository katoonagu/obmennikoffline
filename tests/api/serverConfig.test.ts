import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../../src/api/serverConfig.js';

const STRONG_ADMIN_TOKEN = 'admin-token-2026-prod-safe-value-123456';
const STRONG_TELEGRAM_BOT_TOKEN = '123456789:abcdefghijklmnopqrstuvwxyzABCDEF123';

describe('loadServerConfig', () => {
  it('requires a database URL before the API can boot', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('DATABASE_URL is required');
  });

  it('requires Telegram and admin auth tokens in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('TELEGRAM_BOT_TOKEN is required in production');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_API_TOKEN is required in production');
  });

  it('requires an explicit Telegram initData replay window in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS is required in production');
  });

  it('requires explicit admin actor ids in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_ACTOR_IDS is required in production');
  });

  it('rejects malformed Telegram bot tokens in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: 'not-a-telegram-token',
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('TELEGRAM_BOT_TOKEN must look like a Telegram bot token');
  });

  it('rejects short placeholder-looking Telegram bot tokens in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: '123456:test_bot_token',
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('TELEGRAM_BOT_TOKEN must look like a Telegram bot token');
  });

  it('rejects overly long Telegram initData replay windows in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '86401',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow(
      'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be no more than 86400 in production',
    );
  });

  it('rejects non-decimal integer env values before boot', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '1e2',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS must be a positive integer');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
        PORT: '3e3',
      }),
    ).toThrow('PORT must be a positive integer');
  });

  it('rejects weak admin tokens in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: 'short',
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_API_TOKEN must be at least 32 characters in production');
  });

  it('rejects unsafe admin actor ids in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1,bad actor',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_ACTOR_IDS contains an invalid actor id');
  });

  it('rejects placeholder-looking admin tokens in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: 'a'.repeat(32),
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_API_TOKEN must not be a repeated placeholder in production');
  });

  it('rejects admin tokens with whitespace in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: 'strong admin token with spaces 1234567890',
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_API_TOKEN must not contain whitespace in production');
  });

  it('rejects reusing the Telegram bot token as the admin token in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_API_TOKEN must be distinct from TELEGRAM_BOT_TOKEN');
  });

  it('rejects ambiguous admin actor id lists before boot', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1,,manager-2',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_ACTOR_IDS must not contain empty entries');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
        ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: 'manager-1,manager-1',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('ADMIN_ACTOR_IDS must not contain duplicate values');
  });

  it('allows local development without Telegram or admin tokens', () => {
    expect(
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toMatchObject({
      adminApiToken: undefined,
      enableAdminRoutes: false,
      telegramBotToken: undefined,
      port: 3000,
      host: '0.0.0.0',
      rates: {
        buyRate: '76.850000',
        sellRate: '76.250000',
      },
      miniAppCorsOrigins: undefined,
    });
  });

  it('normalizes explicit Mini App CORS origins before boot', () => {
    expect(
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
        MINIAPP_CORS_ORIGINS: ' http://127.0.0.1:5173/,https://mini.example ',
      }).miniAppCorsOrigins,
    ).toEqual(['http://127.0.0.1:5173', 'https://mini.example']);
  });

  it('rejects unsafe Mini App CORS origins before boot', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
        MINIAPP_CORS_ORIGINS: '*',
      }),
    ).toThrow('MINIAPP_CORS_ORIGINS contains an invalid origin');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
        MINIAPP_CORS_ORIGINS: 'http://127.0.0.1:5173,http://127.0.0.1:5173/',
      }),
    ).toThrow('MINIAPP_CORS_ORIGINS must not contain duplicate origins');
  });

  it('normalizes production env values and enables admin routes', () => {
    expect(
      loadServerConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        ADMIN_API_TOKEN: ` ${STRONG_ADMIN_TOKEN} `,
        TELEGRAM_BOT_TOKEN: ` ${STRONG_TELEGRAM_BOT_TOKEN} `,
        TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
        ADMIN_ACTOR_IDS: ' manager-1,manager-2 ',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: '76.250000',
        PORT: '8080',
        HOST: '127.0.0.1',
      }),
    ).toEqual({
      adminApiToken: STRONG_ADMIN_TOKEN,
      enableAdminRoutes: true,
      telegramBotToken: STRONG_TELEGRAM_BOT_TOKEN,
      telegramInitDataMaxAgeSeconds: 120,
      adminActorIds: ['manager-1', 'manager-2'],
      miniAppCorsOrigins: undefined,
      rates: {
        buyRate: '76.850000',
        sellRate: '76.250000',
      },
      port: 8080,
      host: '127.0.0.1',
    });
  });

  it('requires static MVP rates', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('USDT_RUB_BUY_RATE is required');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
      }),
    ).toThrow('USDT_RUB_SELL_RATE is required');
  });

  it('validates static MVP rates before boot', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '0',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('buyRate must be a positive decimal string');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.850000',
        USDT_RUB_SELL_RATE: 'not-a-decimal',
      }),
    ).toThrow('sellRate must be a positive decimal string');
  });

  it('requires a positive USDT/RUB spread before boot', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.250000',
        USDT_RUB_SELL_RATE: '76.250000',
      }),
    ).toThrow('USDT_RUB_BUY_RATE must be greater than USDT_RUB_SELL_RATE');

    expect(() =>
      loadServerConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
        USDT_RUB_BUY_RATE: '76.250000',
        USDT_RUB_SELL_RATE: '76.850000',
      }),
    ).toThrow('USDT_RUB_BUY_RATE must be greater than USDT_RUB_SELL_RATE');
  });
});
