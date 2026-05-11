import { assertTronAddress } from '../domain/tronAddress.js';
import type { Asset, Network } from '../domain/types.js';
import {
  USDT_TRC20_CONTRACT_ADDRESS,
  type TronTransferEvent,
} from './tronProvider.js';

const USDT_TRC20_DECIMALS = 6;

export interface NormalizedBlockchainTransaction {
  network: Network;
  asset: Asset;
  txId: string;
  logIndex: number;
  fromAddress: string;
  toAddress: string;
  amount: string;
  blockNumber: bigint;
  blockTimestamp: Date;
}

export function normalizeUsdtTransfer(
  event: TronTransferEvent,
): NormalizedBlockchainTransaction {
  if (event.contractAddress !== USDT_TRC20_CONTRACT_ADDRESS) {
    throw new Error('event contract is not USDT TRC20');
  }

  if (event.decimals !== USDT_TRC20_DECIMALS) {
    throw new Error(`USDT TRC20 decimals must be 6, got ${event.decimals}`);
  }

  assertTronAddress(event.fromAddress, 'fromAddress');
  assertTronAddress(event.toAddress, 'toAddress');
  assertTxId(event.txId);
  assertLogIndex(event.logIndex);
  assertBlockNumber(event.blockNumber);
  assertBlockTimestamp(event.blockTimestamp);

  return {
    network: 'TRON',
    asset: 'USDT',
    txId: event.txId,
    logIndex: event.logIndex,
    fromAddress: event.fromAddress,
    toAddress: event.toAddress,
    amount: formatUsdtAmount(event.amountRaw),
    blockNumber: event.blockNumber,
    blockTimestamp: event.blockTimestamp,
  };
}

function assertTxId(txId: unknown): asserts txId is string {
  if (typeof txId !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txId)) {
    throw new Error('txId must be a 64-character hex string');
  }
}

function assertLogIndex(logIndex: unknown): asserts logIndex is number {
  if (
    typeof logIndex !== 'number' ||
    !Number.isSafeInteger(logIndex) ||
    logIndex < 0
  ) {
    throw new Error('logIndex must be a safe non-negative integer');
  }
}

function assertBlockNumber(blockNumber: unknown): asserts blockNumber is bigint {
  if (typeof blockNumber !== 'bigint' || blockNumber < 0n) {
    throw new Error('blockNumber must be a non-negative bigint');
  }
}

function assertBlockTimestamp(blockTimestamp: unknown): asserts blockTimestamp is Date {
  if (!(blockTimestamp instanceof Date) || Number.isNaN(blockTimestamp.getTime())) {
    throw new Error('blockTimestamp must be a valid Date');
  }
}

function formatUsdtAmount(amountRaw: string): string {
  if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
    throw new Error('amountRaw must be a non-negative integer string');
  }

  const raw = BigInt(amountRaw);
  const whole = raw / 1_000_000n;
  const fractional = raw % 1_000_000n;
  const wholePart = whole.toString();

  if (wholePart.length + USDT_TRC20_DECIMALS > 36) {
    throw new Error('amountRaw must fit Decimal(36, 6)');
  }

  return `${wholePart}.${fractional.toString().padStart(USDT_TRC20_DECIMALS, '0')}`;
}
