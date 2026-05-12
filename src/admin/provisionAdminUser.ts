import { hashAdminPassword } from './adminPassword.js';
import type { AdminRole } from './adminSession.js';

export interface AdminProvisioningDb {
  adminUser: {
    upsert(input: {
      where: {
        username: string;
      };
      update: {
        passwordHash: string;
        role: AdminRole;
        disabledAt: null;
      };
      create: {
        username: string;
        passwordHash: string;
        role: AdminRole;
      };
      select: typeof ADMIN_USER_PROVISIONING_SELECT;
    }): Promise<ProvisionedAdminUser>;
  };
}

export interface ProvisionAdminUserInput {
  db: AdminProvisioningDb;
  username: string;
  password: string;
  role: AdminRole;
}

export interface ProvisionedAdminUser {
  id: string;
  username: string;
  role: AdminRole;
}

const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const ADMIN_USER_PROVISIONING_SELECT = {
  id: true,
  username: true,
  role: true,
} as const;

export async function provisionAdminUserInDb(
  input: ProvisionAdminUserInput,
): Promise<ProvisionedAdminUser> {
  const username = normalizeAdminUsername(input.username);
  const passwordHash = hashAdminPassword(input.password);

  return input.db.adminUser.upsert({
    where: {
      username,
    },
    update: {
      passwordHash,
      role: input.role,
      disabledAt: null,
    },
    create: {
      username,
      passwordHash,
      role: input.role,
    },
    select: ADMIN_USER_PROVISIONING_SELECT,
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
