import { describe, expect, it, vi } from 'vitest';
import {
  disableAdminUserInDb,
  type AdminDisableDb,
} from '../../src/admin/disableAdminUser.js';

const NOW = new Date('2026-05-12T11:00:00.000Z');
const DISABLED_AT = new Date('2026-05-11T09:00:00.000Z');

function createDb(adminUser: {
  id: string;
  username: string;
  role: 'manager' | 'owner';
  disabledAt: Date | null;
} | null): AdminDisableDb {
  return {
    adminUser: {
      findUnique: vi.fn(async () => adminUser),
      update: vi.fn(async () => ({
        id: adminUser?.id ?? 'admin-1',
        username: adminUser?.username ?? 'manager-1',
        role: adminUser?.role ?? 'manager',
        disabledAt: NOW,
      })),
    },
  };
}

describe('disableAdminUserInDb', () => {
  it('disables an active admin user and returns only safe fields', async () => {
    const db = createDb({
      id: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      disabledAt: null,
    });

    const result = await disableAdminUserInDb({
      db,
      username: ' manager-1 ',
      disabledAt: NOW,
    });

    expect(result).toEqual({
      id: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      disabledAt: NOW,
    });
    expect(db.adminUser.findUnique).toHaveBeenCalledWith({
      where: {
        username: 'manager-1',
      },
      select: {
        id: true,
        username: true,
        role: true,
        disabledAt: true,
      },
    });
    expect(db.adminUser.update).toHaveBeenCalledWith({
      where: {
        username: 'manager-1',
      },
      data: {
        disabledAt: NOW,
      },
      select: {
        id: true,
        username: true,
        role: true,
        disabledAt: true,
      },
    });
  });

  it('keeps an already disabled admin user disabled without rewriting the timestamp', async () => {
    const db = createDb({
      id: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      disabledAt: DISABLED_AT,
    });

    const result = await disableAdminUserInDb({
      db,
      username: 'manager-1',
      disabledAt: NOW,
    });

    expect(result).toEqual({
      id: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      disabledAt: DISABLED_AT,
    });
    expect(db.adminUser.update).not.toHaveBeenCalled();
  });

  it('rejects unknown or unsafe usernames before unsafe writes', async () => {
    const db = createDb(null);

    await expect(
      disableAdminUserInDb({
        db,
        username: 'manager 1',
        disabledAt: NOW,
      }),
    ).rejects.toThrow('ADMIN_USERNAME contains invalid characters');
    expect(db.adminUser.findUnique).not.toHaveBeenCalled();
    expect(db.adminUser.update).not.toHaveBeenCalled();

    await expect(
      disableAdminUserInDb({
        db,
        username: 'manager-1',
        disabledAt: NOW,
      }),
    ).rejects.toThrow('admin user not found');
    expect(db.adminUser.update).not.toHaveBeenCalled();
  });
});
