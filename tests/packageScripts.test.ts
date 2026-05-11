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
});
