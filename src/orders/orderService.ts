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
  assertPositiveTtl(input.rateTtlMinutes, 'rateTtlMinutes');
  assertPositiveTtl(input.orderTtlMinutes, 'orderTtlMinutes');

  if (!input.depositAddressId) {
    throw new Error('depositAddressId is required for SELL_USDT order');
  }

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
  assertPositiveTtl(input.rateTtlMinutes, 'rateTtlMinutes');
  assertPositiveTtl(input.orderTtlMinutes, 'orderTtlMinutes');
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

function assertPositiveTtl(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}
