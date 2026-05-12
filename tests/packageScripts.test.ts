import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>;
};

describe('package scripts', () => {
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
