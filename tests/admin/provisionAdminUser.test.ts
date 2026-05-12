import { describe, expect, it, vi } from 'vitest';
import {
  provisionAdminUserInDb,
  type AdminProvisioningDb,
} from '../../src/admin/provisionAdminUser.js';
import { verifyAdminPassword } from '../../src/admin/adminPassword.js';

const ADMIN_PASSWORD = 'correct horse battery staple';

function createDb(): AdminProvisioningDb {
  return {
    adminUser: {
      upsert: vi.fn(async ({ where, create }) => ({
        id: 'admin-1',
        username: where.username,
        role: create.role,
      })),
    },
  };
}

describe('provisionAdminUserInDb', () => {
  it('upserts an admin account with a password hash and returns only safe fields', async () => {
    const db = createDb();

    const result = await provisionAdminUserInDb({
      db,
      username: ' manager-1 ',
      password: ADMIN_PASSWORD,
      role: 'manager',
    });

    expect(result).toEqual({
      id: 'admin-1',
      username: 'manager-1',
      role: 'manager',
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');

    const upsertInput = vi.mocked(db.adminUser.upsert).mock.calls[0]?.[0];
    expect(upsertInput).toMatchObject({
      where: {
        username: 'manager-1',
      },
      update: {
        role: 'manager',
        disabledAt: null,
      },
      create: {
        username: 'manager-1',
        role: 'manager',
      },
      select: {
        id: true,
        username: true,
        role: true,
      },
    });
    expect(upsertInput?.create.passwordHash).not.toBe(ADMIN_PASSWORD);
    expect(verifyAdminPassword(ADMIN_PASSWORD, upsertInput!.create.passwordHash)).toBe(true);
    expect(upsertInput?.update.passwordHash).toBe(upsertInput?.create.passwordHash);
  });

  it('rejects unsafe admin usernames before writing', async () => {
    const db = createDb();

    await expect(
      provisionAdminUserInDb({
        db,
        username: 'bad admin',
        password: ADMIN_PASSWORD,
        role: 'manager',
      }),
    ).rejects.toThrow('ADMIN_USERNAME contains invalid characters');
    expect(db.adminUser.upsert).not.toHaveBeenCalled();
  });
});
