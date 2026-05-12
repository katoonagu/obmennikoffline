import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  parseCreateAdminUserCliEnv,
  runCreateAdminUserCli,
} from '../../src/admin/createAdminUserCli.js';
import type {
  AdminProvisioningDb,
  ProvisionAdminUserInput,
} from '../../src/admin/provisionAdminUser.js';

const ADMIN_PASSWORD = 'correct horse battery staple';
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>;
};

function createDb(): AdminProvisioningDb {
  return {
    adminUser: {
      upsert: vi.fn(),
    },
  };
}

describe('createAdminUserCli', () => {
  it('parses admin provisioning env with a safe default role', () => {
    expect(
      parseCreateAdminUserCliEnv({
        ADMIN_USERNAME: ' manager-1 ',
        ADMIN_PASSWORD,
      }),
    ).toEqual({
      username: 'manager-1',
      password: ADMIN_PASSWORD,
      role: 'manager',
    });

    expect(
      parseCreateAdminUserCliEnv({
        ADMIN_USERNAME: 'owner-1',
        ADMIN_PASSWORD,
        ADMIN_ROLE: 'owner',
      }),
    ).toEqual({
      username: 'owner-1',
      password: ADMIN_PASSWORD,
      role: 'owner',
    });
  });

  it('rejects missing credentials and unknown roles before touching the database', () => {
    expect(() =>
      parseCreateAdminUserCliEnv({
        ADMIN_USERNAME: 'manager-1',
      }),
    ).toThrow('ADMIN_PASSWORD is required');

    expect(() =>
      parseCreateAdminUserCliEnv({
        ADMIN_USERNAME: 'manager-1',
        ADMIN_PASSWORD,
        ADMIN_ROLE: 'root',
      }),
    ).toThrow('ADMIN_ROLE must be manager or owner');
  });

  it('provisions an admin account and writes only safe JSON output', async () => {
    const db = createDb();
    const writeOutput = vi.fn();
    const provisionAdminUser = vi.fn(
      async (input: ProvisionAdminUserInput) => ({
        id: 'admin-1',
        username: input.username,
        role: input.role,
      }),
    );

    const exitCode = await runCreateAdminUserCli({
      env: {
        ADMIN_USERNAME: 'manager-1',
        ADMIN_PASSWORD,
      },
      db,
      provisionAdminUser,
      writeOutput,
    });

    expect(exitCode).toBe(0);
    expect(provisionAdminUser).toHaveBeenCalledWith({
      db,
      username: 'manager-1',
      password: ADMIN_PASSWORD,
      role: 'manager',
    });
    expect(writeOutput).toHaveBeenCalledTimes(1);
    const output = writeOutput.mock.calls[0]?.[0] ?? '';
    expect(JSON.parse(output)).toEqual({
      admin: {
        id: 'admin-1',
        username: 'manager-1',
        role: 'manager',
      },
    });
    expect(output).not.toContain(ADMIN_PASSWORD);
    expect(output).not.toContain('passwordHash');
  });

  it('exposes a production build admin provisioning script', () => {
    expect(packageJson.scripts['admin:create-user']).toBe(
      'node dist/src/admin/createAdminUserCli.js',
    );
  });
});
