import { describe, expect, it } from 'vitest';
import {
  normalizeUsdtTransfer,
  type NormalizedBlockchainTransaction,
} from '../../src/tron/normalizeUsdtTransfer.js';
import {
  USDT_TRC20_CONTRACT_ADDRESS,
  type TronTransferEvent,
} from '../../src/tron/tronProvider.js';

const FROM_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const TO_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

function makeEvent(overrides: Partial<TronTransferEvent> = {}): TronTransferEvent {
  return {
    txId: '6f2f8a8da2f8b8fbc36cc2b379f0226a6d487f2f4e7d7f61f4f2e8cc6a8a1234',
    logIndex: 7,
    contractAddress: USDT_TRC20_CONTRACT_ADDRESS,
    fromAddress: FROM_ADDRESS,
    toAddress: TO_ADDRESS,
    amountRaw: '5000000000',
    decimals: 6,
    blockNumber: 64200001n,
    blockTimestamp: new Date('2026-05-11T10:15:30.000Z'),
    ...overrides,
  };
}

describe('normalizeUsdtTransfer', () => {
  it('normalizes a TRC20 USDT transfer event', () => {
    const event = makeEvent();

    const normalized = normalizeUsdtTransfer(event);

    expect(normalized).toEqual<NormalizedBlockchainTransaction>({
      network: 'TRON',
      asset: 'USDT',
      txId: '6f2f8a8da2f8b8fbc36cc2b379f0226a6d487f2f4e7d7f61f4f2e8cc6a8a1234',
      logIndex: 7,
      fromAddress: FROM_ADDRESS,
      toAddress: TO_ADDRESS,
      amount: '5000.000000',
      blockNumber: 64200001n,
      blockTimestamp: new Date('2026-05-11T10:15:30.000Z'),
    });
  });

  it('rejects non-USDT contract events', () => {
    expect(() =>
      normalizeUsdtTransfer(makeEvent({ contractAddress: FROM_ADDRESS })),
    ).toThrow('event contract is not USDT TRC20');
  });

  it('rejects decimals other than 6', () => {
    expect(() => normalizeUsdtTransfer(makeEvent({ decimals: 18 }))).toThrow(
      'USDT TRC20 decimals must be 6, got 18',
    );
  });

  it('rejects malformed from addresses', () => {
    expect(() => normalizeUsdtTransfer(makeEvent({ fromAddress: 'bad' }))).toThrow(
      'fromAddress must be a valid TRON base58 address',
    );
  });

  it('rejects malformed to addresses', () => {
    expect(() => normalizeUsdtTransfer(makeEvent({ toAddress: 'bad' }))).toThrow(
      'toAddress must be a valid TRON base58 address',
    );
  });

  it('formats small raw amounts with 6 decimals', () => {
    expect(normalizeUsdtTransfer(makeEvent({ amountRaw: '1' })).amount).toBe(
      '0.000001',
    );
  });

  it('accepts zero raw amount', () => {
    expect(normalizeUsdtTransfer(makeEvent({ amountRaw: '0' })).amount).toBe(
      '0.000000',
    );
  });

  it('rejects negative raw amounts', () => {
    expect(() => normalizeUsdtTransfer(makeEvent({ amountRaw: '-1' }))).toThrow(
      'amountRaw must be a non-negative integer string',
    );
  });

  it('rejects malformed raw amounts', () => {
    expect(() =>
      normalizeUsdtTransfer(makeEvent({ amountRaw: '1.5' })),
    ).toThrow('amountRaw must be a non-negative integer string');
  });
});
