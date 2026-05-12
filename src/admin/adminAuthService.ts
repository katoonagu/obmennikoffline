import {
  signAdminSession,
  type AdminRole,
} from './adminSession.js';
import { verifyAdminPassword } from './adminPassword.js';

export interface AdminUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: AdminRole;
  disabledAt: Date | null;
}

export interface AdminSessionAdminRecord {
  id: string;
  username: string;
  role: AdminRole;
  disabledAt: Date | null;
}

type AdminUserFindUniqueInput =
  | {
      where: {
        username: string;
      };
      select: typeof ADMIN_USER_AUTH_SELECT;
    }
  | {
      where: {
        id: string;
      };
      select: typeof ADMIN_SESSION_ADMIN_SELECT;
    };

type AdminUserFindUniqueResult =
  | AdminUserRecord
  | AdminSessionAdminRecord
  | null;

export interface AdminAuthDb {
  adminUser: {
    findUnique(input: AdminUserFindUniqueInput): Promise<AdminUserFindUniqueResult>;
  };
}

export interface AuthenticateAdminInput {
  db: AdminAuthDb;
  username: string;
  password: string;
  sessionSecret: string;
  now: Date;
  sessionTtlSeconds?: number;
}

export interface AuthenticatedAdmin {
  admin: {
    id: string;
    username: string;
    role: AdminRole;
  };
  token: string;
}

const ADMIN_USER_AUTH_SELECT = {
  id: true,
  username: true,
  passwordHash: true,
  role: true,
  disabledAt: true,
} as const;

const ADMIN_SESSION_ADMIN_SELECT = {
  id: true,
  username: true,
  role: true,
  disabledAt: true,
} as const;

export async function authenticateAdminInDb(
  input: AuthenticateAdminInput,
): Promise<AuthenticatedAdmin> {
  const username = assertRequiredString(input.username, 'username');
  const password = assertRequiredString(input.password, 'password');

  const adminUser = await input.db.adminUser.findUnique({
    where: {
      username,
    },
    select: ADMIN_USER_AUTH_SELECT,
  });

  if (
    !adminUser ||
    !('passwordHash' in adminUser) ||
    adminUser.disabledAt ||
    !verifyAdminPassword(password, adminUser.passwordHash)
  ) {
    throw new Error('admin credentials are invalid');
  }

  return {
    admin: {
      id: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
    },
    token: signAdminSession({
      adminId: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
      secret: input.sessionSecret,
      now: input.now,
      ttlSeconds: input.sessionTtlSeconds,
    }),
  };
}

export async function requireActiveAdminSessionInDb(input: {
  db: AdminAuthDb;
  adminId: string;
  username: string;
  role: AdminRole;
}): Promise<AdminSessionAdminRecord> {
  const adminUser = await input.db.adminUser.findUnique({
    where: {
      id: input.adminId,
    },
    select: ADMIN_SESSION_ADMIN_SELECT,
  });

  if (
    !adminUser ||
    'passwordHash' in adminUser ||
    adminUser.disabledAt ||
    adminUser.username !== input.username ||
    adminUser.role !== input.role
  ) {
    throw new Error('admin session is invalid');
  }

  return adminUser;
}

function assertRequiredString(value: string, fieldName: string): string {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}
