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

describe('AdminUser Prisma schema', () => {
  it('stores admin accounts with roles and password hashes', () => {
    expect(schemaSource).toMatch(/enum AdminRole\s*{[^}]*manager[^}]*owner[^}]*}/s);
    expect(schemaSource).toMatch(/model AdminUser\s*{[^}]*username\s+String\s+@unique/s);
    expect(schemaSource).toMatch(/model AdminUser\s*{[^}]*passwordHash\s+String/s);
    expect(schemaSource).toMatch(/model AdminUser\s*{[^}]*role\s+AdminRole\s+@default\(manager\)/s);
    expect(schemaSource).toMatch(/model AdminUser\s*{[^}]*disabledAt\s+DateTime\?/s);
    expect(schemaSource).not.toMatch(/model AdminUser\s*{[^}]*password\s+String/s);
  });

  it('ships a migration for the admin user table and username uniqueness', () => {
    const migrationSql = readdirSync(migrationsDir)
      .map((name) => join(PROJECT_ROOT, 'prisma', 'migrations', name, 'migration.sql'))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(migrationSql).toContain('CREATE TYPE "AdminRole" AS ENUM');
    expect(migrationSql).toContain('CREATE TABLE "AdminUser"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "AdminUser_username_key"');
  });
});
