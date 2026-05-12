import { prepareAddressPoolImport } from './importAddressPool.js';
import type { AddressPoolCsvRow } from '../wallet/addressPoolCsv.js';

export interface DepositAddressCreateManyInput {
  network: 'TRON';
  asset: 'USDT';
  derivationIndex: number;
  address: string;
  status: 'available';
}

export interface AddressPoolImportTransaction {
  depositAddress: {
    createMany(input: {
      data: DepositAddressCreateManyInput[];
      skipDuplicates: false;
    }): Promise<{ count: number }>;
  };
  auditLog: {
    create(input: {
      data: {
        actorId: string;
        action: 'address_pool_imported';
        entityType: 'DepositAddress';
        entityId: 'address-pool-import';
        orderId: null;
        metadata: Record<string, string>;
        createdAt: Date;
      };
    }): Promise<unknown>;
  };
}

export interface AddressPoolImportDb {
  $transaction<T>(fn: (tx: AddressPoolImportTransaction) => Promise<T>): Promise<T>;
}

export interface ImportAddressPoolToDbInput {
  db: AddressPoolImportDb;
  rows: AddressPoolCsvRow[];
  actorId: string;
  now: Date;
}

export async function importAddressPoolToDb(
  input: ImportAddressPoolToDbInput,
): Promise<{ count: number }> {
  if (input.rows.length === 0) {
    throw new Error('rows must contain at least one address');
  }

  assertRequiredString(input.actorId, 'actorId');
  assertValidDate(input.now, 'now');
  const prepared = prepareAddressPoolImport(input.rows);

  return input.db.$transaction(async (tx) => {
    const result = await tx.depositAddress.createMany({
      data: prepared.map((row) => ({
        network: row.network,
        asset: row.asset,
        derivationIndex: row.derivationIndex,
        address: row.address,
        status: 'available',
      })),
      skipDuplicates: false,
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'address_pool_imported',
        entityType: 'DepositAddress',
        entityId: 'address-pool-import',
        orderId: null,
        metadata: {
          count: String(result.count),
          firstDerivationIndex: String(prepared[0]!.derivationIndex),
          lastDerivationIndex: String(prepared[prepared.length - 1]!.derivationIndex),
        },
        createdAt: input.now,
      },
    });

    return result;
  });
}

function assertRequiredString(value: unknown, fieldName: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
