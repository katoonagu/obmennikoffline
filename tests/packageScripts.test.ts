import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe('package scripts', () => {
  it('builds compiled API code and the Mini App bundle for Railway', () => {
    expect(packageJson.scripts.build).toBe(
      'pnpm prisma:generate && tsc -p tsconfig.json && pnpm build:miniapp',
    );
  });

  it('starts production by applying migrations and running the compiled API server', () => {
    expect(packageJson.scripts.start).toBe(
      'pnpm exec prisma migrate deploy && node dist/src/api/server.js',
    );
  });

  it('keeps Prisma CLI available to the production start command', () => {
    expect(packageJson.dependencies).toHaveProperty('prisma');
    expect(packageJson.devDependencies).not.toHaveProperty('prisma');
  });

  it('runs the TRON deposit watcher from built JavaScript in production', () => {
    expect(packageJson.scripts['tron:watch-deposits-once']).toBe(
      'node dist/src/tron/watchDepositsOnceCli.js',
    );
  });

  it('configures the TRON watcher cursor from built JavaScript in production', () => {
    expect(packageJson.scripts['tron:configure-watcher-cursor']).toBe(
      'node dist/src/tron/configureWatcherCursorCli.js',
    );
  });

  it('replays TRON deposit history in dry-run mode from built JavaScript', () => {
    expect(packageJson.scripts['tron:replay-deposits-dry-run']).toBe(
      'node dist/src/tron/replayDepositsDryRunCli.js',
    );
  });

  it('expires open orders from built JavaScript in production', () => {
    expect(packageJson.scripts['orders:expire-open']).toBe(
      'node dist/src/orders/expireOrdersCli.js',
    );
  });

  it('runs the staging smoke suite from built JavaScript', () => {
    expect(packageJson.scripts['staging:smoke']).toBe(
      'node dist/src/smoke/stagingSmokeCli.js',
    );
  });

  it('keeps PostgreSQL integration tests in an explicit script', () => {
    expect(packageJson.scripts['test:integration']).toBe(
      'vitest run --config vitest.integration.config.ts',
    );
  });
});
