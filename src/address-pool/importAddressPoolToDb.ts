import { prepareAddressPoolImport } from './importAddressPool.js';
import type { AddressPoolCsvRow } from '../wallet/addressPoolCsv.js';

export interface DepositAddressCreateManyInput {
  network: 'TRON';
  asset: 'USDT';
  derivationIndex: number;
  address: string;
  status: 'available';
}

export interface AddressPoolImportDb {
  depositAddress: {
    createMany(input: {
      data: DepositAddressCreateManyInput[];
      skipDuplicates: false;
    }): Promise<{ count: number }>;
  };
}

export interface ImportAddressPoolToDbInput {
  db: AddressPoolImportDb;
  rows: AddressPoolCsvRow[];
}

export async function importAddressPoolToDb(
  input: ImportAddressPoolToDbInput,
): Promise<{ count: number }> {
  const prepared = prepareAddressPoolImport(input.rows);

  if (prepared.length === 0) {
    return { count: 0 };
  }

  return input.db.depositAddress.createMany({
    data: prepared.map((row) => ({
      network: row.network,
      asset: row.asset,
      derivationIndex: row.derivationIndex,
      address: row.address,
      status: 'available',
    })),
    skipDuplicates: false,
  });
}
