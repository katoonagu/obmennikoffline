import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(
  new URL('../../src/api/server.ts', import.meta.url),
  'utf8',
);

describe('API server entrypoint', () => {
  it('loads .env before importing Prisma client', () => {
    expect(serverSource).toContain('loadEnvFileIfPresent();');
    expect(serverSource).toContain("await import('../db/prisma.js')");
    expect(serverSource).not.toContain("from '../db/prisma.js'");
    expect(serverSource.indexOf('loadEnvFileIfPresent();')).toBeLessThan(
      serverSource.indexOf("await import('../db/prisma.js')"),
    );
  });

  it('uses the guarded admin API token as the MVP admin session signing secret', () => {
    expect(serverSource).toContain('adminSessionSecret: config.adminApiToken');
  });

  it('registers the built Mini App frontend before listening', () => {
    expect(serverSource).toContain('registerMiniAppStaticFrontend');
    expect(serverSource.indexOf('registerMiniAppStaticFrontend')).toBeLessThan(
      serverSource.indexOf('await app.listen'),
    );
  });
});
