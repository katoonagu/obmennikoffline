import { assertTronAddress } from '../domain/tronAddress.js';
import type { DepositAddressStatus } from '../domain/types.js';
import type { AddressPoolCsvRow } from '../wallet/addressPoolCsv.js';

export interface PreparedDepositAddress {
  network: 'TRON';
  asset: 'USDT';
  derivationIndex: number;
  address: string;
  status: DepositAddressStatus;
}

export function prepareAddressPoolImport(
  rows: AddressPoolCsvRow[],
): PreparedDepositAddress[] {
  const seenAddresses = new Set<string>();
  const seenIndexes = new Set<number>();

  return rows.map((row) => {
    if (row.network !== 'TRON') {
      throw new Error(`unsupported network in import: ${row.network}`);
    }
    if (row.asset !== 'USDT') {
      throw new Error(`unsupported asset in import: ${row.asset}`);
    }
    if (seenIndexes.has(row.derivationIndex)) {
      throw new Error(
        `duplicate derivation_index in import: ${row.derivationIndex}`,
      );
    }
    if (seenAddresses.has(row.address)) {
      throw new Error(`duplicate address in import: ${row.address}`);
    }

    assertTronAddress(row.address, 'address');
    seenIndexes.add(row.derivationIndex);
    seenAddresses.add(row.address);

    return {
      network: 'TRON',
      asset: 'USDT',
      derivationIndex: row.derivationIndex,
      address: row.address,
      status: 'available',
    };
  });
}
