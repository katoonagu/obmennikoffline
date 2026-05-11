const HEADER = 'network,asset,derivation_index,address';

export type AddressPoolNetwork = 'TRON';
export type AddressPoolAsset = 'USDT';

export interface AddressPoolCsvRow {
  network: AddressPoolNetwork;
  asset: AddressPoolAsset;
  derivationIndex: number;
  address: string;
}

interface RawAddressPoolCsvRow {
  network: unknown;
  asset: unknown;
  derivationIndex: unknown;
  address: unknown;
}

export function renderAddressPoolCsv(rows: AddressPoolCsvRow[]): string {
  return `${HEADER}\n${rows.map(renderRow).join('')}`;
}

export function parseAddressPoolCsv(csv: string): AddressPoolCsvRow[] {
  const lines = csv.replace(/\r\n/g, '\n').split('\n');
  const header = lines.shift();

  if (header !== HEADER) {
    throw new Error(`address pool CSV header must be exactly ${HEADER}`);
  }

  return lines
    .filter((line) => line.length > 0)
    .map((line, lineIndex) => parseRow(line, lineIndex + 2));
}

function renderRow(row: AddressPoolCsvRow): string {
  assertAddressPoolRow(row);
  return `${row.network},${row.asset},${row.derivationIndex},${row.address}\n`;
}

function parseRow(line: string, lineNumber: number): AddressPoolCsvRow {
  const columns = line.split(',');

  if (columns.length !== 4) {
    throw new Error(`address pool CSV row ${lineNumber} must have 4 columns`);
  }

  const [network, asset, derivationIndexValue, address] = columns;
  const derivationIndex = Number(derivationIndexValue);
  const row = {
    network,
    asset,
    derivationIndex,
    address,
  };

  assertAddressPoolRow(row);

  return row;
}

function assertAddressPoolRow(
  row: RawAddressPoolCsvRow,
): asserts row is AddressPoolCsvRow {
  if (row.network !== 'TRON') {
    throw new Error('network must be TRON');
  }

  if (row.asset !== 'USDT') {
    throw new Error('asset must be USDT');
  }

  if (
    typeof row.derivationIndex !== 'number' ||
    !Number.isSafeInteger(row.derivationIndex) ||
    row.derivationIndex < 0
  ) {
    throw new Error('derivation_index must be a safe non-negative integer');
  }

  if (typeof row.address !== 'string' || row.address.length === 0) {
    throw new Error('address is required');
  }
}
