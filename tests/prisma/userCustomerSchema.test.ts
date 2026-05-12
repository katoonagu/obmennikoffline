import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const schemaSource = readFileSync(
  new URL('../../prisma/schema.prisma', import.meta.url),
  'utf8',
);
const migrationsDir = new URL('../../prisma/migrations', import.meta.url);

describe('User customer FIO Prisma schema', () => {
  it('stores optional customer FIO on the user profile for Mini App prefill', () => {
    expect(schemaSource).toMatch(/model User\s*{[^}]*customerLastName\s+String\?/s);
    expect(schemaSource).toMatch(/model User\s*{[^}]*customerFirstName\s+String\?/s);
    expect(schemaSource).toMatch(/model User\s*{[^}]*customerMiddleName\s+String\?/s);
  });

  it('ships a migration for adding customer FIO fields to User', () => {
    const migrationSql = readdirSync(migrationsDir)
      .map((name) => join(PROJECT_ROOT, 'prisma', 'migrations', name, 'migration.sql'))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(migrationSql).toContain('ADD COLUMN "customerLastName" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "customerFirstName" TEXT');
    expect(migrationSql).toContain('ADD COLUMN "customerMiddleName" TEXT');
  });
});
