import { describe, expect, it, vi } from 'vitest';
import {
  authenticateAdminInDb,
  type AdminAuthDb,
  type AdminUserRecord,
} from '../../src/admin/adminAuthService.js';
import { hashAdminPassword } from '../../src/admin/adminPassword.js';
import { verifyAdminSession } from '../../src/admin/adminSession.js';

const NOW = new Date('2026-05-12T09:00:00.000Z');
const SECRET = 'admin-session-secret-with-at-least-32-characters';
const PASSWORD = 'correct horse battery staple';

function createDb(adminUser: AdminUserRecord | null): AdminAuthDb {
  return {
    adminUser: {
      findUnique: vi.fn(async () => adminUser),
    },
  };
}

describe('authenticateAdminInDb', () => {
  it('authenticates an active admin user and issues a signed session', async () => {
    const passwordHash = hashAdminPassword(PASSWORD, {
      salt: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    });
    const db = createDb({
      id: 'admin-1',
      username: 'manager-1',
      passwordHash,
      role: 'manager',
      disabledAt: null,
    });

    const result = await authenticateAdminInDb({
      db,
      username: ' manager-1 ',
      password: PASSWORD,
      sessionSecret: SECRET,
      now: NOW,
      sessionTtlSeconds: 900,
    });

    expect(result.admin).toEqual({
      id: 'admin-1',
      username: 'manager-1',
      role: 'manager',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(
      verifyAdminSession({
        token: result.token,
        secret: SECRET,
        now: NOW,
      }),
    ).toMatchObject({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
    });
    expect(db.adminUser.findUnique).toHaveBeenCalledWith({
      where: {
        username: 'manager-1',
      },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        disabledAt: true,
      },
    });
  });

  it('rejects unknown, disabled, and wrong-password admins', async () => {
    await expect(
      authenticateAdminInDb({
        db: createDb(null),
        username: 'manager-1',
        password: PASSWORD,
        sessionSecret: SECRET,
        now: NOW,
      }),
    ).rejects.toThrow('admin credentials are invalid');

    await expect(
      authenticateAdminInDb({
        db: createDb({
          id: 'admin-1',
          username: 'manager-1',
          passwordHash: hashAdminPassword(PASSWORD),
          role: 'manager',
          disabledAt: new Date('2026-05-12T08:00:00.000Z'),
        }),
        username: 'manager-1',
        password: PASSWORD,
        sessionSecret: SECRET,
        now: NOW,
      }),
    ).rejects.toThrow('admin credentials are invalid');

    await expect(
      authenticateAdminInDb({
        db: createDb({
          id: 'admin-1',
          username: 'manager-1',
          passwordHash: hashAdminPassword(PASSWORD),
          role: 'manager',
          disabledAt: null,
        }),
        username: 'manager-1',
        password: 'wrong horse battery staple',
        sessionSecret: SECRET,
        now: NOW,
      }),
    ).rejects.toThrow('admin credentials are invalid');
  });
});
