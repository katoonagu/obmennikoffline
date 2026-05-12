import { describe, expect, it, vi } from 'vitest';
import {
  runStagingSmoke,
  runStagingSmokeCli,
  type StagingSmokeEnv,
} from '../../src/smoke/stagingSmokeCli.js';

const STRONG_ADMIN_TOKEN = 'admin-token-with-enough-entropy-1234567890';
const STRONG_TELEGRAM_BOT_TOKEN = '123456789:abcdefghijklmnopqrstuvwxyzABCDEF123';

const VALID_ENV: StagingSmokeEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/obmennikoffline',
  ADMIN_API_TOKEN: STRONG_ADMIN_TOKEN,
  ADMIN_ACTOR_IDS: 'manager-1',
  TELEGRAM_BOT_TOKEN: STRONG_TELEGRAM_BOT_TOKEN,
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '120',
  MINIAPP_CORS_ORIGINS: 'https://example.com',
  USDT_RUB_BUY_RATE: '76.850000',
  USDT_RUB_SELL_RATE: '76.250000',
  TRON_FULL_HOST: 'https://api.trongrid.io',
  TRON_API_KEY: 'secret-provider-key',
};

describe('runStagingSmoke', () => {
  it('checks production config and TRON connectivity with sanitized output', async () => {
    const report = await runStagingSmoke({
      env: VALID_ENV,
      readLatestTronBlock: vi.fn(async () => ({
        fullHostConfigured: true,
        eventServerConfigured: false,
        apiKeyConfigured: true,
        latestConfirmedBlock: '82649072',
      })),
    });

    expect(report.ok).toBe(true);
    expect(report.checks.productionConfig).toEqual({
      status: 'passed',
      details: {
        adminRoutesEnabled: true,
        adminActorCount: 1,
        telegramBotTokenConfigured: true,
        telegramInitDataMaxAgeSeconds: 120,
        miniAppDevAuth: false,
        corsOriginsCount: 1,
        host: '0.0.0.0',
        port: 3000,
        ratesConfigured: true,
      },
    });
    expect(report.checks.tronProvider).toEqual({
      status: 'passed',
      details: {
        fullHostConfigured: true,
        eventServerConfigured: false,
        apiKeyConfigured: true,
        latestConfirmedBlock: '82649072',
      },
    });
    expect(report.checks.telegramInitData).toEqual({
      status: 'skipped',
      reason: 'TELEGRAM_INIT_DATA is not configured',
    });
    expect(JSON.stringify(report)).not.toContain(STRONG_ADMIN_TOKEN);
    expect(JSON.stringify(report)).not.toContain(STRONG_TELEGRAM_BOT_TOKEN);
    expect(JSON.stringify(report)).not.toContain('secret-provider-key');
  });

  it('validates Telegram initData when it is supplied', async () => {
    const validateTelegramInitData = vi.fn(() => ({
      authDate: new Date('2026-05-11T09:00:00.000Z'),
      queryId: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: {
        id: 462656683,
        username: 'pavel',
      },
    }));

    const report = await runStagingSmoke({
      env: {
        ...VALID_ENV,
        TELEGRAM_INIT_DATA: 'signed-init-data',
      },
      readLatestTronBlock: vi.fn(async () => ({
        fullHostConfigured: true,
        eventServerConfigured: false,
        apiKeyConfigured: true,
        latestConfirmedBlock: '82649072',
      })),
      validateTelegramInitData,
      now: new Date('2026-05-11T09:01:00.000Z'),
    });

    expect(validateTelegramInitData).toHaveBeenCalledWith({
      initData: 'signed-init-data',
      botToken: STRONG_TELEGRAM_BOT_TOKEN,
      maxAgeSeconds: 120,
      now: new Date('2026-05-11T09:01:00.000Z'),
    });
    expect(report.checks.telegramInitData).toEqual({
      status: 'passed',
      details: {
        authDate: '2026-05-11T09:00:00.000Z',
        queryIdPresent: true,
        userId: '462656683',
      },
    });
    expect(JSON.stringify(report)).not.toContain('signed-init-data');
  });

  it('marks the smoke failed when production guard rejects the env', async () => {
    const report = await runStagingSmoke({
      env: {
        ...VALID_ENV,
        ADMIN_API_TOKEN: '',
      },
      readLatestTronBlock: vi.fn(async () => ({
        fullHostConfigured: true,
        eventServerConfigured: false,
        apiKeyConfigured: false,
        latestConfirmedBlock: '82649072',
      })),
    });

    expect(report.ok).toBe(false);
    expect(report.checks.productionConfig).toEqual({
      status: 'failed',
      error: 'ADMIN_API_TOKEN is required in production',
    });
  });
});

describe('runStagingSmokeCli', () => {
  it('loads .env, prints JSON, and returns a non-zero exit code for failed checks', async () => {
    const output: string[] = [];
    const loadEnvFile = vi.fn(() => true);

    const exitCode = await runStagingSmokeCli({
      env: {
        ...VALID_ENV,
        TRON_FULL_HOST: 'ftp://bad-host',
      },
      loadEnvFile,
      writeOutput: (message) => output.push(message),
    });

    expect(loadEnvFile).toHaveBeenCalledWith();
    expect(exitCode).toBe(1);
    expect(JSON.parse(output[0] ?? '{}')).toMatchObject({
      ok: false,
      checks: {
        tronProvider: {
          status: 'failed',
        },
      },
    });
  });
});
