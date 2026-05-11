import type { DepositAddressStatus } from '../domain/types.js';

export interface ReservableAddress {
  id: string;
  derivationIndex: number;
  status: DepositAddressStatus;
}

export interface ReserveDepositAddressInput {
  addresses: ReservableAddress[];
  orderId: string;
  now: Date;
  ttlMinutes: number;
}

export interface ReservedDepositAddressPatch {
  addressId: string;
  orderId: string;
  status: 'reserved';
  reservedAt: Date;
  expiresAt: Date;
}

// Pure selector/patch builder. The persistence layer must reserve atomically with
// status=available, in a transaction or conditional update with retry.
export function reserveDepositAddress(input: ReserveDepositAddressInput): ReservedDepositAddressPatch {
  assertValidDate(input.now, 'now');

  if (!Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes <= 0) {
    throw new Error('ttlMinutes must be a positive integer');
  }

  const expiresAt = new Date(input.now.getTime() + input.ttlMinutes * 60_000);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error('ttlMinutes produces an invalid expiry date');
  }

  const availableAddresses = input.addresses.filter((candidate) => candidate.status === 'available');

  for (const address of availableAddresses) {
    if (!Number.isSafeInteger(address.derivationIndex) || address.derivationIndex < 0) {
      throw new Error('derivationIndex must be a safe non-negative integer');
    }
  }

  const address = availableAddresses.sort((a, b) => a.derivationIndex - b.derivationIndex)[0];

  if (!address) {
    throw new Error('no available TRON deposit addresses');
  }

  return {
    addressId: address.id,
    orderId: input.orderId,
    status: 'reserved',
    reservedAt: input.now,
    expiresAt,
  };
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
