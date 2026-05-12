import { createHmac, timingSafeEqual } from 'node:crypto';

export type AdminRole = 'manager' | 'owner';

export interface AdminSessionPayload {
  adminId: string;
  username: string;
  role: AdminRole;
  issuedAt: string;
  expiresAt: string;
}

export interface SignAdminSessionInput {
  adminId: string;
  username: string;
  role: AdminRole;
  secret: string;
  now: Date;
  ttlSeconds?: number;
}

export interface VerifyAdminSessionInput {
  token: string;
  secret: string;
  now: Date;
}

const TOKEN_PREFIX = 'admin_session_v1';
const DEFAULT_SESSION_TTL_SECONDS = 15 * 60;
const MIN_ADMIN_SESSION_SECRET_LENGTH = 32;

export function signAdminSession(input: SignAdminSessionInput): string {
  assertAdminSessionSecret(input.secret);
  assertValidDate(input.now, 'now');

  const ttlSeconds = input.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('admin session ttl must be a positive integer');
  }

  const payload: AdminSessionPayload = {
    adminId: assertRequiredString(input.adminId, 'adminId'),
    username: assertRequiredString(input.username, 'username'),
    role: input.role,
    issuedAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + ttlSeconds * 1000).toISOString(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(`${TOKEN_PREFIX}.${encodedPayload}`, input.secret);

  return `${TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifyAdminSession(
  input: VerifyAdminSessionInput,
): AdminSessionPayload | null {
  if (!isStrongAdminSessionSecret(input.secret) || !isValidDate(input.now)) {
    return null;
  }

  const [prefix, encodedPayload, signature, ...extra] = input.token.split('.');
  if (prefix !== TOKEN_PREFIX || !encodedPayload || !signature || extra.length > 0) {
    return null;
  }

  const expectedSignature = sign(`${prefix}.${encodedPayload}`, input.secret);
  if (!safeStringEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) {
    return null;
  }

  if (new Date(payload.expiresAt).getTime() <= input.now.getTime()) {
    return null;
  }

  return payload;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function parsePayload(encodedPayload: string): AdminSessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as unknown;
    if (!isPayload(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isPayload(value: unknown): value is AdminSessionPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.adminId === 'string' &&
    payload.adminId.trim().length > 0 &&
    typeof payload.username === 'string' &&
    payload.username.trim().length > 0 &&
    (payload.role === 'manager' || payload.role === 'owner') &&
    typeof payload.issuedAt === 'string' &&
    isIsoDate(payload.issuedAt) &&
    typeof payload.expiresAt === 'string' &&
    isIsoDate(payload.expiresAt)
  );
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function assertAdminSessionSecret(secret: string): void {
  if (!isStrongAdminSessionSecret(secret)) {
    throw new Error('admin session secret must be at least 32 characters');
  }
}

export function isStrongAdminSessionSecret(secret: string): boolean {
  return secret.length >= MIN_ADMIN_SESSION_SECRET_LENGTH && !/\s/.test(secret);
}

function assertRequiredString(value: string, fieldName: string): string {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!isValidDate(value)) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}
