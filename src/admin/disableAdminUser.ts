import type { AdminRole } from './adminSession.js';

export interface DisabledAdminUser {
  id: string;
  username: string;
  role: AdminRole;
  disabledAt: Date;
}

export interface AdminDisableDb {
  adminUser: {
    findUnique(input: {
      where: {
        username: string;
      };
      select: typeof ADMIN_USER_DISABLE_SELECT;
    }): Promise<DisabledAdminUserRecord | null>;
    update(input: {
      where: {
        username: string;
      };
      data: {
        disabledAt: Date;
      };
      select: typeof ADMIN_USER_DISABLE_SELECT;
    }): Promise<DisabledAdminUser>;
  };
}

export interface DisableAdminUserInput {
  db: AdminDisableDb;
  username: string;
  disabledAt: Date;
}

interface DisabledAdminUserRecord {
  id: string;
  username: string;
  role: AdminRole;
  disabledAt: Date | null;
}

const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const ADMIN_USER_DISABLE_SELECT = {
  id: true,
  username: true,
  role: true,
  disabledAt: true,
} as const;

export async function disableAdminUserInDb(
  input: DisableAdminUserInput,
): Promise<DisabledAdminUser> {
  const username = normalizeAdminUsername(input.username);
  const adminUser = await input.db.adminUser.findUnique({
    where: {
      username,
    },
    select: ADMIN_USER_DISABLE_SELECT,
  });

  if (!adminUser) {
    throw new Error('admin user not found');
  }

  if (adminUser.disabledAt) {
    return {
      ...adminUser,
      disabledAt: adminUser.disabledAt,
    };
  }

  return input.db.adminUser.update({
    where: {
      username,
    },
    data: {
      disabledAt: input.disabledAt,
    },
    select: ADMIN_USER_DISABLE_SELECT,
  });
}

function normalizeAdminUsername(username: string): string {
  const normalized = username.trim();
  if (!normalized) {
    throw new Error('ADMIN_USERNAME is required');
  }

  if (!ADMIN_USERNAME_PATTERN.test(normalized)) {
    throw new Error('ADMIN_USERNAME contains invalid characters');
  }

  return normalized;
}
