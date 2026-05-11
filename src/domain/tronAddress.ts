import bs58check from 'bs58check';

const TRON_BASE58_LENGTH = 34;
const TRON_HEX_PREFIX = 0x41;

export function isTronAddress(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length !== TRON_BASE58_LENGTH) return false;
  if (!value.startsWith('T')) return false;

  try {
    const decoded = bs58check.decode(value);
    return decoded.length === 21 && decoded[0] === TRON_HEX_PREFIX;
  } catch {
    return false;
  }
}

export function assertTronAddress(value: string, fieldName: string): void {
  if (!isTronAddress(value)) {
    throw new Error(`${fieldName} must be a valid TRON base58 address`);
  }
}
