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
});
