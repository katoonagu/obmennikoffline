import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  parseDisableAdminUserCliEnv,
  runDisableAdminUserCli,
} from '../../src/admin/disableAdminUserCli.js';
import type {
  AdminDisableDb,
  DisableAdminUserInput,
} from '../../src/admin/disableAdminUser.js';

const NOW = new Date('2026-05-12T11:00:00.000Z');
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>;
};

function createDb(): AdminDisableDb {
  return {
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('disableAdminUserCli', () => {
  it('parses admin disable env', () => {
    expect(
      parseDisableAdminUserCliEnv({
        ADMIN_USERNAME: ' manager-1 ',
      }),
    ).toEqual({
      username: 'manager-1',
    });
  });

  it('rejects missing usernames before touching the database', () => {
    expect(() => parseDisableAdminUserCliEnv({})).toThrow('ADMIN_USERNAME is required');
  });

  it('disables an admin account and writes only safe JSON output', async () => {
    const db = createDb();
    const writeOutput = vi.fn();
    const disableAdminUser = vi.fn(async (input: DisableAdminUserInput) => ({
      id: 'admin-1',
      username: input.username,
      role: 'manager' as const,
      disabledAt: input.disabledAt,
    }));

    const exitCode = await runDisableAdminUserCli({
      env: {
        ADMIN_USERNAME: 'manager-1',
      },
      db,
      disableAdminUser,
      now: () => NOW,
      writeOutput,
    });

    expect(exitCode).toBe(0);
    expect(disableAdminUser).toHaveBeenCalledWith({
      db,
      username: 'manager-1',
      disabledAt: NOW,
    });
    expect(writeOutput).toHaveBeenCalledTimes(1);
    const output = writeOutput.mock.calls[0]?.[0] ?? '';
    expect(JSON.parse(output)).toEqual({
      admin: {
        id: 'admin-1',
        username: 'manager-1',
        role: 'manager',
        disabledAt: NOW.toISOString(),
      },
    });
    expect(output).not.toContain('password');
    expect(output).not.toContain('passwordHash');
  });

  it('exposes a production build admin disable script', () => {
    expect(packageJson.scripts['admin:disable-user']).toBe(
      'node dist/src/admin/disableAdminUserCli.js',
    );
  });
});
