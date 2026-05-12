import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('README runbook', () => {
  it('documents required MVP env and operational commands', () => {
    expect(readme).toContain('USDT_RUB_BUY_RATE');
    expect(readme).toContain('USDT_RUB_SELL_RATE');
    expect(readme).toContain('positive decimal strings');
    expect(readme).toContain('USDT_RUB_BUY_RATE must be greater than USDT_RUB_SELL_RATE');
    expect(readme).toContain('DATABASE_URL');
    expect(readme).toContain('NODE_ENV=production');
    expect(readme).toContain('TELEGRAM_BOT_TOKEN');
    expect(readme).toContain('<numeric-bot-id>:<bot-token-secret>');
    expect(readme).toContain('at least 30 URL-safe characters');
    expect(readme).toContain('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS');
    expect(readme).toContain('no more than 86400');
    expect(readme).toContain('ADMIN_API_TOKEN');
    expect(readme).toContain('must not contain whitespace');
    expect(readme).toContain('must not be a repeated placeholder');
    expect(readme).toContain('must be distinct from `TELEGRAM_BOT_TOKEN`');
    expect(readme).toContain('ADMIN_ACTOR_IDS');
    expect(readme).toContain('No empty or duplicate actor ids');
    expect(readme).toContain('letters, digits, dot, underscore, colon, or hyphen');
    expect(readme).toContain('Authorization: tma <initData>');
    expect(readme).toContain('GET /api/rates/usdt-rub');
    expect(readme).toContain('USDT_RUB');
    expect(readme).toContain('Authorization: Bearer <ADMIN_API_TOKEN>');
    expect(readme).toContain('POST /api/admin/session');
    expect(readme).toContain('Authorization: Bearer <admin session token>');
    expect(readme).toContain('Ops scripts may still use `ADMIN_API_TOKEN` with `x-admin-actor-id`');
    expect(readme).toContain('Admin session tokens are revalidated against the active admin account');
    expect(readme).toContain('Disabling an admin account invalidates subsequent admin session use');
    expect(readme).toContain('pnpm admin:create-user');
    expect(readme).toContain('pnpm admin:disable-user');
    expect(readme).toContain('ADMIN_USERNAME');
    expect(readme).toContain('ADMIN_PASSWORD');
    expect(readme).toContain('Admin passwords are stored only as scrypt hashes');
    expect(readme).toContain('Disable an admin account to revoke subsequent admin session use');
    expect(readme).toContain('x-admin-actor-id');
    expect(readme).toContain('Admin mutation comments are optional audit text');
    expect(readme).toContain('trimmed and capped at 500 characters');
    expect(readme).toContain('pnpm exec prisma validate');
    expect(readme).toContain('pnpm dev:api');
    expect(readme).toContain('pnpm wallet:generate-address-pool');
    expect(readme).toContain('TRON_FULL_HOST');
    expect(readme).toContain('TRON_WATCHER_ADDRESS_BATCH_SIZE');
    expect(readme).toContain('ORDER_EXPIRATION_LIMIT');
    expect(readme).toContain('pnpm tron:configure-watcher-cursor');
    expect(readme).toContain('pnpm tron:watch-deposits-once');
    expect(readme).toContain('pnpm orders:expire-open');
    expect(readme).toContain('pnpm staging:smoke');
    expect(readme).toContain('TELEGRAM_INIT_DATA');
    expect(readme).toContain('productionConfig');
    expect(readme).toContain('tronProvider');
    expect(readme).toContain('telegramInitData');
    expect(readme).toContain('Local Docker Postgres');
  });

  it('does not publish mnemonic or private key material in examples', () => {
    expect(readme).toContain('$env:TRON_MNEMONIC="<offline BIP39 mnemonic>"');
    expect(readme).not.toContain(
      'test test test test test test test test test test test junk',
    );
    expect(readme).not.toContain('PRIVATE_KEY=');
  });
});
