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

function formatUsdtAmount(amountRaw: string): string {
  if (!/^\d+$/.test(amountRaw)) {
    throw new Error('amountRaw must be a non-negative integer string');
  }

  const raw = BigInt(amountRaw);
  const whole = raw / 1_000_000n;
  const fractional = raw % 1_000_000n;

  return `${whole}.${fractional.toString().padStart(USDT_TRC20_DECIMALS, '0')}`;
}
