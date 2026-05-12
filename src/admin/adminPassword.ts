import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface HashAdminPasswordOptions {
  salt?: Buffer;
}

const PASSWORD_HASH_VERSION = 'scrypt:v1';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

export function hashAdminPassword(
  password: string,
  options: HashAdminPasswordOptions = {},
): string {
  assertStrongAdminPassword(password);

  const salt = options.salt ?? randomBytes(SALT_LENGTH);
  const derived = derivePasswordKey(password, salt, {
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    PASSWORD_HASH_VERSION,
    `n=${SCRYPT_N}`,
    `r=${SCRYPT_R}`,
    `p=${SCRYPT_P}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(':');
}

export function verifyAdminPassword(password: string, storedHash: string): boolean {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) {
    return false;
  }

  const derived = derivePasswordKey(password, parsed.salt, parsed.params);

  return (
    derived.length === parsed.hash.length &&
    timingSafeEqual(derived, parsed.hash)
  );
}

function assertStrongAdminPassword(password: string): void {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error('admin password must be at least 12 characters');
  }
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  params: {
    n: number;
    r: number;
    p: number;
  },
): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: params.n,
    r: params.r,
    p: params.p,
    maxmem: 64 * 1024 * 1024,
  });
}

function parsePasswordHash(storedHash: string):
  | {
      params: {
        n: number;
        r: number;
        p: number;
      };
      salt: Buffer;
      hash: Buffer;
    }
  | null {
  const parts = storedHash.split(':');
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== PASSWORD_HASH_VERSION) {
    return null;
  }

  const n = parseTaggedInteger(parts[2], 'n');
  const r = parseTaggedInteger(parts[3], 'r');
  const p = parseTaggedInteger(parts[4], 'p');
  if (!n || !r || !p) {
    return null;
  }
  const params = { n, r, p };

  try {
    return {
      params,
      salt: Buffer.from(parts[5], 'base64url'),
      hash: Buffer.from(parts[6], 'base64url'),
    };
  } catch {
    return null;
  }
}

function parseTaggedInteger(value: string, tag: string): number | null {
  const prefix = `${tag}=`;
  if (!value.startsWith(prefix)) {
    return null;
  }

  const raw = value.slice(prefix.length);
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
