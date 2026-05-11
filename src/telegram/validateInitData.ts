import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramInitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidatedTelegramInitData {
  authDate: Date;
  queryId: string | null;
  user: TelegramInitDataUser | null;
}

export interface ValidateTelegramInitDataInput {
  initData: string;
  botToken: string;
  now?: Date;
  maxAgeSeconds?: number;
}

const WEB_APP_DATA_KEY = 'WebAppData';
const DEFAULT_MAX_AGE_SECONDS = 86_400;
const FUTURE_CLOCK_SKEW_SECONDS = 60;

export function validateTelegramInitData(
  input: ValidateTelegramInitDataInput,
): ValidatedTelegramInitData {
  if (!input.botToken.trim()) {
    throw new Error('botToken is required');
  }

  const params = new URLSearchParams(input.initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) {
    throw new Error('initData hash is required');
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', WEB_APP_DATA_KEY)
    .update(input.botToken)
    .digest();
  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!safeEqualHex(receivedHash, expectedHash)) {
    throw new Error('initData signature is invalid');
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) {
    throw new Error('auth_date is required');
  }

  if (!/^\d+$/.test(authDateRaw)) {
    throw new Error('auth_date must be a Unix timestamp');
  }

  const authDateSeconds = Number(authDateRaw);
  if (!Number.isSafeInteger(authDateSeconds)) {
    throw new Error('auth_date must be a Unix timestamp');
  }

  const now = input.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('now must be a valid Date');
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (authDateSeconds > nowSeconds + FUTURE_CLOCK_SKEW_SECONDS) {
    throw new Error('auth_date is from the future');
  }

  const maxAgeSeconds = input.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error('maxAgeSeconds must be a positive integer');
  }

  if (nowSeconds - authDateSeconds > maxAgeSeconds) {
    throw new Error('initData is expired');
  }

  return {
    authDate: new Date(authDateSeconds * 1000),
    queryId: params.get('query_id'),
    user: parseTelegramUser(params.get('user')),
  };
}

function parseTelegramUser(userRaw: string | null): TelegramInitDataUser | null {
  if (!userRaw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new Error('user must be valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { id?: unknown }).id !== 'number' ||
    !Number.isSafeInteger((parsed as { id: number }).id)
  ) {
    throw new Error('user.id is required');
  }

  const user = parsed as TelegramInitDataUser;
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    is_premium: user.is_premium,
  };
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-fA-F]+$/.test(left) || left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
