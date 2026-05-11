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
const TX_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeEvent(overrides: Partial<TronTransferEvent> = {}): TronTransferEvent {
  return {
    txId: TX_ID,
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

function asEventOverride(
  overrides: Record<string, unknown>,
): Partial<TronTransferEvent> {
  return overrides as Partial<TronTransferEvent>;
}

describe('normalizeUsdtTransfer', () => {
  it('normalizes a TRC20 USDT transfer event', () => {
    const event = makeEvent();

    const normalized = normalizeUsdtTransfer(event);

    expect(normalized).toEqual<NormalizedBlockchainTransaction>({
      network: 'TRON',
      asset: 'USDT',
      txId: TX_ID,
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

  it.each(['', 'abc123', `${TX_ID.slice(0, 63)}z`])('rejects invalid tx ids: %s', (txId) => {
    expect(() => normalizeUsdtTransfer(makeEvent({ txId }))).toThrow(
      'txId must be a 64-character hex string',
    );
  });

  it.each([-1, 1.5, Number.NaN])(
    'rejects invalid log indexes: %s',
    (logIndex) => {
      expect(() => normalizeUsdtTransfer(makeEvent({ logIndex }))).toThrow(
        'logIndex must be a safe non-negative integer',
      );
    },
  );

  it('rejects invalid block numbers', () => {
    expect(() => normalizeUsdtTransfer(makeEvent({ blockNumber: -1n }))).toThrow(
      'blockNumber must be a non-negative bigint',
    );
    expect(() =>
      normalizeUsdtTransfer(makeEvent(asEventOverride({ blockNumber: 1 }))),
    ).toThrow('blockNumber must be a non-negative bigint');
  });

  it('rejects invalid block timestamps', () => {
    expect(() =>
      normalizeUsdtTransfer(makeEvent({ blockTimestamp: new Date('invalid') })),
    ).toThrow('blockTimestamp must be a valid Date');
    expect(() =>
      normalizeUsdtTransfer(
        makeEvent(asEventOverride({ blockTimestamp: '2026-05-11T10:15:30.000Z' })),
      ),
    ).toThrow('blockTimestamp must be a valid Date');
  });

  it('formats small raw amounts with 6 decimals', () => {
    expect(normalizeUsdtTransfer(makeEvent({ amountRaw: '1' })).amount).toBe(
      '0.000001',
    );
  });

  it('formats one whole USDT with 6 decimals', () => {
    expect(normalizeUsdtTransfer(makeEvent({ amountRaw: '1000000' })).amount).toBe(
      '1.000000',
    );
  });

  it('formats very large raw amounts deterministically', () => {
    expect(
      normalizeUsdtTransfer(makeEvent({ amountRaw: '123456789012345678901234' }))
        .amount,
    ).toBe('123456789012345678.901234');
  });

  it('rejects raw amounts that exceed Decimal(36, 6)', () => {
    expect(() =>
      normalizeUsdtTransfer(makeEvent({ amountRaw: '1234567890123456789012345678901234567' })),
    ).toThrow('amountRaw must fit Decimal(36, 6)');
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
