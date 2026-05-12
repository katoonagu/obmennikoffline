import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');

describe('.env.example contract', () => {
  it('documents the production guard inputs', () => {
    expect(envExample).toContain('DATABASE_URL');
    expect(envExample).toContain('NODE_ENV="development"');
    expect(envExample).toContain('NODE_ENV="production"');
    expect(envExample).toContain('positive decimal strings');
    expect(envExample).toContain('USDT_RUB_BUY_RATE must be greater than USDT_RUB_SELL_RATE');
    expect(envExample).toContain('TELEGRAM_BOT_TOKEN');
    expect(envExample).toContain('<numeric-bot-id>:<bot-token-secret>');
    expect(envExample).toContain('at least 30 URL-safe characters');
    expect(envExample).toContain('TELEGRAM_INIT_DATA=""');
    expect(envExample).toContain('Optional one-shot staging smoke input');
    expect(envExample).toContain('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS');
    expect(envExample).toContain('ADMIN_API_TOKEN');
    expect(envExample).toContain('ADMIN_USERNAME');
    expect(envExample).toContain('ADMIN_PASSWORD');
    expect(envExample).toContain('pnpm admin:create-user');
    expect(envExample).toContain('pnpm admin:disable-user');
    expect(envExample).toContain('ADMIN_ACTOR_IDS');
    expect(envExample).toContain('letters, digits, dot, underscore, colon, or hyphen');
    expect(envExample).toContain('at least 32 characters');
    expect(envExample).toContain('must not contain whitespace');
    expect(envExample).toContain('must not be a repeated placeholder');
    expect(envExample).toContain('must be distinct from TELEGRAM_BOT_TOKEN');
    expect(envExample).toContain('No empty or duplicate actor ids');
  });

  it('documents one-shot job environment without secret material', () => {
    expect(envExample).toContain('TRON_FULL_HOST');
    expect(envExample).toContain('TRON_EVENT_SERVER');
    expect(envExample).toContain('TRON_API_KEY');
    expect(envExample).toContain('TRON_WATCHER_CURSOR_ID');
    expect(envExample).toContain('TRON_WATCHER_ADDRESS_BATCH_SIZE');
    expect(envExample).toContain('ORDER_EXPIRATION_LIMIT');
    expect(envExample).not.toContain('TRON_MNEMONIC=');
    expect(envExample).not.toContain('PRIVATE_KEY=');
    expect(envExample).not.toContain('SEED_PHRASE=');
  });

  it('documents public Mini App Vite environment without secrets', () => {
    expect(envExample).toContain('VITE_MINIAPP_API_MODE');
    expect(envExample).toContain('mock');
    expect(envExample).toContain('api');
    expect(envExample).toContain('VITE_MINIAPP_API_BASE_URL');
    expect(envExample).toContain('http://127.0.0.1:3000');
    expect(envExample).toContain('VITE_MINIAPP_DEV_USER_ID');
    expect(envExample).toContain('MINIAPP_CORS_ORIGINS');
    expect(envExample).toContain('http://127.0.0.1:5173');
    expect(envExample).toContain('MINIAPP_DEV_AUTH_ENABLED');
    expect(envExample).toContain('Production startup rejects');
    expect(envExample).toContain('Telegram WebApp initData');
    expect(envExample).toContain('These VITE_ values are public');
    expect(envExample).toContain('browser config, not secrets');
  });
});
