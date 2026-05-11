import { assertTronAddress } from '../domain/tronAddress.js';
import type { Asset, Network, OrderDirection, OrderStatus } from '../domain/types.js';

interface BaseOrderInput {
  publicId: string;
  userId: string;
  amountUsdt: string;
  amountRub: string;
  rateSnapshot: string;
  now: Date;
  rateTtlMinutes: number;
  orderTtlMinutes: number;
}

export interface CreatedOrder {
  publicId: string;
  userId: string;
  direction: OrderDirection;
  asset: Asset;
  network: Network;
  amountUsdt: string;
  amountRub: string;
  rateSnapshot: string;
  rateExpiresAt: Date;
  orderExpiresAt: Date;
  depositAddressId: string | null;
  clientPayoutAddress: string | null;
  status: OrderStatus;
}

export interface CreateSellUsdtOrderInput extends BaseOrderInput {
  depositAddressId: string;
}

export interface CreateBuyUsdtOrderInput extends BaseOrderInput {
  clientPayoutAddress: string;
}

export function createSellUsdtOrder(input: CreateSellUsdtOrderInput): CreatedOrder {
  assertBaseOrderInput(input);
  assertPositiveTtl(input.rateTtlMinutes, 'rateTtlMinutes', input.now);
  assertPositiveTtl(input.orderTtlMinutes, 'orderTtlMinutes', input.now);

  assertRequiredString(
    input.depositAddressId,
    'depositAddressId',
    'depositAddressId is required for SELL_USDT order',
  );

  return {
    publicId: input.publicId,
    userId: input.userId,
    direction: 'SELL_USDT',
    asset: 'USDT',
    network: 'TRON',
    amountUsdt: input.amountUsdt,
    amountRub: input.amountRub,
    rateSnapshot: input.rateSnapshot,
    rateExpiresAt: addMinutes(input.now, input.rateTtlMinutes),
    orderExpiresAt: addMinutes(input.now, input.orderTtlMinutes),
    depositAddressId: input.depositAddressId,
    clientPayoutAddress: null,
    status: 'awaiting_deposit',
  };
}

export function createBuyUsdtOrder(input: CreateBuyUsdtOrderInput): CreatedOrder {
  assertBaseOrderInput(input);
  assertPositiveTtl(input.rateTtlMinutes, 'rateTtlMinutes', input.now);
  assertPositiveTtl(input.orderTtlMinutes, 'orderTtlMinutes', input.now);
  assertTronAddress(input.clientPayoutAddress, 'clientPayoutAddress');

  return {
    publicId: input.publicId,
    userId: input.userId,
    direction: 'BUY_USDT',
    asset: 'USDT',
    network: 'TRON',
    amountUsdt: input.amountUsdt,
    amountRub: input.amountRub,
    rateSnapshot: input.rateSnapshot,
    rateExpiresAt: addMinutes(input.now, input.rateTtlMinutes),
    orderExpiresAt: addMinutes(input.now, input.orderTtlMinutes),
    depositAddressId: null,
    clientPayoutAddress: input.clientPayoutAddress,
    status: 'awaiting_office_visit',
  };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function assertBaseOrderInput(input: BaseOrderInput): void {
  assertRequiredString(input.publicId, 'publicId');
  assertRequiredString(input.userId, 'userId');
  assertPositiveDecimalString(input.amountUsdt, 'amountUsdt', 6);
  assertPositiveDecimalString(input.amountRub, 'amountRub', 2);
  assertPositiveDecimalString(input.rateSnapshot, 'rateSnapshot', 6);
  assertValidDate(input.now, 'now');
}

function assertRequiredString(value: unknown, fieldName: string, message = `${fieldName} is required`): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message);
  }
}

function assertPositiveDecimalString(value: unknown, fieldName: string, scale: number): void {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a positive decimal string`);
  }

  if (!/^\d+(?:\.\d+)?$/.test(value) || !/[1-9]/.test(value.replace('.', ''))) {
    throw new Error(`${fieldName} must be a positive decimal string`);
  }

  const [integerPart, fractionalPart = ''] = value.split('.');
  if (fractionalPart.length > scale || integerPart.length + fractionalPart.length > 36) {
    throw new Error(`${fieldName} must fit Decimal(36, ${scale})`);
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}

function assertPositiveTtl(value: number, fieldName: string, now: Date): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  const expiresAt = addMinutes(now, value);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error(`${fieldName} produces an invalid expiry date`);
  }
}
