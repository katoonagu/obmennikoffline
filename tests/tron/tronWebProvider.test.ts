import { describe, expect, it, vi } from 'vitest';
import {
  createTronWebTronProvider,
  type TronWebReadClient,
} from '../../src/tron/tronWebProvider.js';
import { USDT_TRC20_CONTRACT_ADDRESS } from '../../src/tron/tronProvider.js';

const FROM_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const DEPOSIT_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const OTHER_ADDRESS = 'TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9';
const TX_ID = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SECOND_TX_ID =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const FROM_HEX_20 = '1111111111111111111111111111111111111111';
const DEPOSIT_HEX_20 = '2222222222222222222222222222222222222222';
const OTHER_HEX_20 = '3333333333333333333333333333333333333333';

function createClient(input: {
  latestBlock?: unknown;
  blockEvents?: Record<string, unknown[]>;
  fingerprints?: Record<string, string | undefined>;
} = {}): TronWebReadClient {
  return {
    trx: {
      getCurrentBlock: vi.fn(async () =>
        ({
          block_header: {
            raw_data: {
              number: 99999999,
            },
          },
        }),
      ),
      getConfirmedCurrentBlock: vi.fn(async () =>
        input.latestBlock ?? {
          block_header: {
            raw_data: {
              number: 64200010,
            },
          },
        },
      ),
    },
    event: {
      getEventsByBlockNumber: vi.fn(async (blockNumber, options) => {
        const pageKey = `${String(blockNumber)}:${options?.fingerprint ?? ''}`;

        return {
          success: true,
          data: input.blockEvents?.[pageKey] ?? [],
          meta: {
            page_size: input.blockEvents?.[pageKey]?.length ?? 0,
            fingerprint: input.fingerprints?.[pageKey],
          },
        };
      }),
    },
    address: {
      fromHex: vi.fn((address) => {
        if (address === `41${FROM_HEX_20}`) return FROM_ADDRESS;
        if (address === `41${DEPOSIT_HEX_20}`) return DEPOSIT_ADDRESS;
        if (address === `41${OTHER_HEX_20}`) return OTHER_ADDRESS;
        if (address === USDT_TRC20_CONTRACT_ADDRESS) return USDT_TRC20_CONTRACT_ADDRESS;
        return address;
      }),
    },
  };
}

function createTransferEvent(overrides: Record<string, unknown> = {}) {
  return {
    block_number: 64200001,
    block_timestamp: 1778490000000,
    contract_address: USDT_TRC20_CONTRACT_ADDRESS,
    event_index: 3,
    event_name: 'Transfer',
    transaction_id: TX_ID,
    result: {
      from: `0x${FROM_HEX_20}`,
      to: `0x${DEPOSIT_HEX_20}`,
      value: '5000000000',
    },
    ...overrides,
  };
}

describe('createTronWebTronProvider', () => {
  it('returns the current TRON block number from TronWeb', async () => {
    const client = createClient();
    const provider = createTronWebTronProvider({ client });

    await expect(provider.getLatestBlockNumber()).resolves.toBe(64200010n);
    expect(client.trx.getConfirmedCurrentBlock).toHaveBeenCalledWith();
    expect(client.trx.getCurrentBlock).not.toHaveBeenCalled();
  });

  it('scans block events exactly, paginates, filters watched USDT transfers, and normalizes addresses', async () => {
    const client = createClient({
      blockEvents: {
        '64200001:': [
          createTransferEvent(),
          createTransferEvent({
            transaction_id: SECOND_TX_ID,
            result: {
              from: `0x${FROM_HEX_20}`,
              to: `0x${OTHER_HEX_20}`,
              value: '1000000',
            },
          }),
        ],
        '64200001:page-2': [
          createTransferEvent({
            event_index: 4,
            transaction_id: SECOND_TX_ID,
            result: {
              from: `0x${FROM_HEX_20}`,
              to: `0x${DEPOSIT_HEX_20}`,
              value: '2500000',
            },
          }),
        ],
        '64200002:': [
          createTransferEvent({
            block_number: 64200002,
            contract_address: OTHER_ADDRESS,
            result: {
              from: `0x${FROM_HEX_20}`,
              to: `0x${DEPOSIT_HEX_20}`,
              value: '999999',
            },
          }),
          createTransferEvent({
            event_name: 'Approval',
          }),
        ],
      },
      fingerprints: {
        '64200001:': 'page-2',
      },
    });
    const provider = createTronWebTronProvider({ client });

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [DEPOSIT_ADDRESS],
        fromBlock: 64200001n,
        toBlock: 64200002n,
      }),
    ).resolves.toEqual([
      {
        txId: TX_ID,
        logIndex: 3,
        contractAddress: USDT_TRC20_CONTRACT_ADDRESS,
        fromAddress: FROM_ADDRESS,
        toAddress: DEPOSIT_ADDRESS,
        amountRaw: '5000000000',
        decimals: 6,
        blockNumber: 64200001n,
        blockTimestamp: new Date(1778490000000),
      },
      {
        txId: SECOND_TX_ID,
        logIndex: 4,
        contractAddress: USDT_TRC20_CONTRACT_ADDRESS,
        fromAddress: FROM_ADDRESS,
        toAddress: DEPOSIT_ADDRESS,
        amountRaw: '2500000',
        decimals: 6,
        blockNumber: 64200001n,
        blockTimestamp: new Date(1778490000000),
      },
    ]);

    expect(client.event.getEventsByBlockNumber).toHaveBeenNthCalledWith(1, 64200001, {
      only_confirmed: true,
      limit: 200,
    });
    expect(client.event.getEventsByBlockNumber).toHaveBeenNthCalledWith(2, 64200001, {
      only_confirmed: true,
      limit: 200,
      fingerprint: 'page-2',
    });
    expect(client.event.getEventsByBlockNumber).toHaveBeenNthCalledWith(3, 64200002, {
      only_confirmed: true,
      limit: 200,
    });
  });

  it('stops TRON event pagination when the provider repeats a fingerprint', async () => {
    const client = createClient({
      blockEvents: {
        '64200001:': [createTransferEvent()],
        '64200001:page-2': [],
      },
      fingerprints: {
        '64200001:': 'page-2',
        '64200001:page-2': 'page-2',
      },
    });
    const provider = createTronWebTronProvider({ client });

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [DEPOSIT_ADDRESS],
        fromBlock: 64200001n,
        toBlock: 64200001n,
      }),
    ).rejects.toThrow('TRON event pagination did not advance');

    expect(client.event.getEventsByBlockNumber).toHaveBeenCalledTimes(2);
  });

  it('rejects block ranges that cannot be called through TronWeb block-number APIs', async () => {
    const client = createClient();
    const provider = createTronWebTronProvider({ client });

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [DEPOSIT_ADDRESS],
        fromBlock: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        toBlock: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      }),
    ).rejects.toThrow('blockNumber must fit a JavaScript safe integer');

    expect(client.event.getEventsByBlockNumber).not.toHaveBeenCalled();
  });

  it('does not scan TRON blocks when there are no watched addresses', async () => {
    const client = createClient();
    const provider = createTronWebTronProvider({ client });

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [],
        fromBlock: 64200001n,
        toBlock: 64200002n,
      }),
    ).resolves.toEqual([]);

    expect(client.event.getEventsByBlockNumber).not.toHaveBeenCalled();
  });

  it('reuses block event pages across repeated calls for different watched address batches', async () => {
    const client = createClient({
      blockEvents: {
        '64200001:': [createTransferEvent()],
      },
    });
    const provider = createTronWebTronProvider({ client });

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [DEPOSIT_ADDRESS],
        fromBlock: 64200001n,
        toBlock: 64200001n,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [OTHER_ADDRESS],
        fromBlock: 64200001n,
        toBlock: 64200001n,
      }),
    ).resolves.toEqual([]);

    expect(client.event.getEventsByBlockNumber).toHaveBeenCalledTimes(1);
  });

  it('evicts failed block event cache entries so later retries can refetch', async () => {
    const client = createClient({
      blockEvents: {
        '64200001:': [createTransferEvent()],
      },
    });
    vi.mocked(client.event.getEventsByBlockNumber)
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockResolvedValueOnce({
        success: true,
        data: [createTransferEvent()],
        meta: {
          page_size: 1,
        },
      });
    const provider = createTronWebTronProvider({ client });

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [DEPOSIT_ADDRESS],
        fromBlock: 64200001n,
        toBlock: 64200001n,
      }),
    ).rejects.toThrow('temporary provider failure');

    await expect(
      provider.getUsdtTransfersToAddresses({
        addresses: [DEPOSIT_ADDRESS],
        fromBlock: 64200001n,
        toBlock: 64200001n,
      }),
    ).resolves.toHaveLength(1);

    expect(client.event.getEventsByBlockNumber).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed TronWeb block responses', async () => {
    const client = createClient({
      latestBlock: {
        block_header: {
          raw_data: {
            number: Number.NaN,
          },
        },
      },
    });
    const provider = createTronWebTronProvider({ client });

    await expect(provider.getLatestBlockNumber()).rejects.toThrow(
      'latest block number must be a safe non-negative integer',
    );
  });
});
