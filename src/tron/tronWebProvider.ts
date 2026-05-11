import { assertTronAddress } from '../domain/tronAddress.js';
import {
  USDT_TRC20_CONTRACT_ADDRESS,
  type TronProvider,
  type TronTransferEvent,
} from './tronProvider.js';
import type { TronDepositWatcherCursorProvider } from './runUsdtDepositWatcherOnce.js';

export interface TronWebBlockResponse {
  block_header?: {
    raw_data?: {
      number?: unknown;
    };
  };
}

export interface TronWebEventResponse {
  success?: boolean;
  error?: string;
  data?: unknown[];
  meta?: {
    fingerprint?: string;
    page_size?: number;
  };
}

export interface TronWebReadClient {
  trx: {
    getCurrentBlock(): Promise<TronWebBlockResponse>;
    getConfirmedCurrentBlock(): Promise<TronWebBlockResponse>;
  };
  event: {
    getEventsByBlockNumber(
      blockNumber: number,
      options?: {
        only_confirmed?: boolean;
        limit?: number;
        fingerprint?: string;
      },
    ): Promise<TronWebEventResponse>;
  };
  address: {
    fromHex(address: string): string;
  };
}

export interface CreateTronWebTronProviderInput {
  client: TronWebReadClient;
}

const TRON_EVENT_PAGE_LIMIT = 200;
const USDT_TRC20_DECIMALS = 6;

export function createTronWebTronProvider(
  input: CreateTronWebTronProviderInput,
): TronProvider & TronDepositWatcherCursorProvider {
  const blockEventCache = new Map<number, Promise<unknown[]>>();

  return {
    async getLatestBlockNumber(): Promise<bigint> {
      const block = await input.client.trx.getConfirmedCurrentBlock();
      const blockNumber = block.block_header?.raw_data?.number;

      if (
        typeof blockNumber !== 'number' ||
        !Number.isSafeInteger(blockNumber) ||
        blockNumber < 0
      ) {
        throw new Error('latest block number must be a safe non-negative integer');
      }

      return BigInt(blockNumber);
    },

    async getUsdtTransfersToAddresses(request): Promise<TronTransferEvent[]> {
      const watchedAddresses = new Set(request.addresses);
      const transfers: TronTransferEvent[] = [];

      if (watchedAddresses.size === 0) {
        return [];
      }

      for (const address of watchedAddresses) {
        assertTronAddress(address, 'address');
      }

      for (
        let blockNumber = toSafeBlockNumber(request.fromBlock);
        blockNumber <= toSafeBlockNumber(request.toBlock);
        blockNumber += 1
      ) {
        const blockEvents = await getCachedEventsByBlockNumber(
          input.client,
          blockEventCache,
          blockNumber,
        );

        for (const event of blockEvents) {
          const transfer = toUsdtTransferEvent(input.client, event);
          if (!transfer || !watchedAddresses.has(transfer.toAddress)) {
            continue;
          }

          transfers.push(transfer);
        }
      }

      return transfers;
    },
  };
}

function getCachedEventsByBlockNumber(
  client: TronWebReadClient,
  cache: Map<number, Promise<unknown[]>>,
  blockNumber: number,
): Promise<unknown[]> {
  const cached = cache.get(blockNumber);
  if (cached) {
    return cached;
  }

  const events = getAllEventsByBlockNumber(client, blockNumber).catch((error) => {
    cache.delete(blockNumber);
    throw error;
  });
  cache.set(blockNumber, events);
  return events;
}

async function getAllEventsByBlockNumber(
  client: TronWebReadClient,
  blockNumber: number,
): Promise<unknown[]> {
  const events: unknown[] = [];
  let fingerprint: string | undefined;

  while (true) {
    const response = await client.event.getEventsByBlockNumber(blockNumber, {
      only_confirmed: true,
      limit: TRON_EVENT_PAGE_LIMIT,
      ...(fingerprint ? { fingerprint } : {}),
    });

    if (response.success === false) {
      throw new Error(response.error ?? 'failed to fetch TRON block events');
    }

    events.push(...(Array.isArray(response.data) ? response.data : []));

    if (!response.meta?.fingerprint) {
      return events;
    }

    fingerprint = response.meta.fingerprint;
  }
}

function toUsdtTransferEvent(
  client: TronWebReadClient,
  rawEvent: unknown,
): TronTransferEvent | null {
  if (!isRecord(rawEvent)) {
    return null;
  }
  if (rawEvent.event_name !== 'Transfer') {
    return null;
  }

  const contractAddress = toBase58Address(client, rawEvent.contract_address);
  if (contractAddress !== USDT_TRC20_CONTRACT_ADDRESS) {
    return null;
  }

  if (!isRecord(rawEvent.result)) {
    return null;
  }

  return {
    txId: requireString(rawEvent.transaction_id, 'transaction_id'),
    logIndex: requireSafeInteger(rawEvent.event_index, 'event_index'),
    contractAddress,
    fromAddress: toBase58Address(client, rawEvent.result.from),
    toAddress: toBase58Address(client, rawEvent.result.to),
    amountRaw: requireString(rawEvent.result.value, 'result.value'),
    decimals: USDT_TRC20_DECIMALS,
    blockNumber: BigInt(requireSafeInteger(rawEvent.block_number, 'block_number')),
    blockTimestamp: new Date(
      requireSafeInteger(rawEvent.block_timestamp, 'block_timestamp'),
    ),
  };
}

function toBase58Address(client: TronWebReadClient, value: unknown): string {
  const address = requireString(value, 'address');
  if (address.startsWith('T')) {
    return address;
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return client.address.fromHex(`41${address.slice(2)}`);
  }
  if (/^41[0-9a-fA-F]{40}$/.test(address)) {
    return client.address.fromHex(address);
  }

  return client.address.fromHex(address);
}

function toSafeBlockNumber(blockNumber: bigint): number {
  if (blockNumber < 0n || blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('blockNumber must fit a JavaScript safe integer');
  }

  return Number(blockNumber);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function requireSafeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a safe non-negative integer`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
