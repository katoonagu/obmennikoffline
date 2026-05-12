import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schedulerRunbookUrl = new URL('../../docs/operations-scheduler.md', import.meta.url);
const blockersUrl = new URL('../../BLOCKERS.md', import.meta.url);

describe('operations documentation contracts', () => {
  it('documents the watcher and expiration scheduler contract', () => {
    expect(existsSync(schedulerRunbookUrl)).toBe(true);
    const runbook = readFileSync(schedulerRunbookUrl, 'utf8');

    expect(runbook).toContain('pnpm tron:watch-deposits-once');
    expect(runbook).toContain('pnpm orders:expire-open');
    expect(runbook).toContain('one-shot');
    expect(runbook).toContain('single active instance');
    expect(runbook).toContain('recommended interval');
    expect(runbook).toContain('failedTransfers');
    expect(runbook).toContain('confirmation-depth');
    expect(runbook).toContain('TRON_FULL_HOST');
    expect(runbook).toContain('TRON_EVENT_SERVER');
    expect(runbook).toContain('TRON_API_KEY');
    expect(runbook).toContain('TRON_WATCHER_ADDRESS_BATCH_SIZE');
    expect(runbook).toContain('ORDER_EXPIRATION_LIMIT');
    expect(runbook).toContain('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS');
    expect(runbook).toContain('ADMIN_API_TOKEN');
    expect(runbook).toContain('POST /api/admin/session');
    expect(runbook).toContain('Authorization: Bearer <admin session token>');
    expect(runbook).toContain('Ops scripts may still use `ADMIN_API_TOKEN` with `x-admin-actor-id`');
    expect(runbook).toContain('Admin session tokens are revalidated against the active admin account');
    expect(runbook).toContain('Disabling an admin account invalidates subsequent admin session use');
    expect(runbook).toContain('pnpm admin:create-user');
    expect(runbook).toContain('pnpm admin:disable-user');
    expect(runbook).toContain('ADMIN_USERNAME');
    expect(runbook).toContain('ADMIN_PASSWORD');
    expect(runbook).toContain('Admin passwords are stored only as scrypt hashes');
    expect(runbook).toContain('Disable an admin account to revoke subsequent admin session use');
    expect(runbook).toContain('ADMIN_ACTOR_IDS');
    expect(runbook).toContain('must be distinct from `TELEGRAM_BOT_TOKEN`');
    expect(runbook).toContain('No empty or duplicate actor ids');
    expect(runbook).toContain('Admin mutation comments are optional audit text');
    expect(runbook).toContain('trimmed and capped at 500 characters');
    expect(runbook).toContain('Authorization: tma <initData>');
    expect(runbook).toContain('pnpm staging:smoke');
    expect(runbook).toContain('TELEGRAM_INIT_DATA');
    expect(runbook).toContain('no mainnet transaction');
  });

  it('keeps externally blocked work visible outside the README', () => {
    expect(existsSync(blockersUrl)).toBe(true);
    const blockers = readFileSync(blockersUrl, 'utf8');

    expect(blockers).toContain('TRON live spike');
    expect(blockers).toContain('Telegram bot token');
    expect(blockers).toContain('paid provider');
    expect(blockers).toContain('mainnet');
    expect(blockers).toContain('seed');
    expect(blockers).toContain('private key');
  });
});
