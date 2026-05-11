import { constants } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderAddressPoolCsv, type AddressPoolCsvRow } from './addressPoolCsv.js';
import { deriveTronAddress } from './deriveTronAddress.js';

interface CliOptions {
  count: number;
  startIndex: number;
  outputPath: string;
  force: boolean;
}

export async function generateAddressPoolCli(
  argv = process.argv.slice(2),
  env = process.env,
): Promise<void> {
  const mnemonic = env.TRON_MNEMONIC;

  if (!mnemonic) {
    throw new Error('TRON_MNEMONIC environment variable is required');
  }

  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath);

  if (!options.force && (await pathExists(outputPath))) {
    throw new Error(`${outputPath} already exists; pass --force to overwrite`);
  }

  const rows: AddressPoolCsvRow[] = Array.from(
    { length: options.count },
    (_, offset) => {
      const index = options.startIndex + offset;
      const derived = deriveTronAddress({ mnemonic, index });

      return {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: derived.index,
        address: derived.address,
      };
    },
  );

  await writeFile(outputPath, renderAddressPoolCsv(rows), { encoding: 'utf8' });
  process.stdout.write(
    `Generated ${rows.length} public TRON addresses to ${outputPath}\n`,
  );
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--count' || arg === '--start-index' || arg === '--out') {
      const value = argv[index + 1];

      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }

      values.set(arg, value);
      index += 1;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  const count = parseRequiredSafeInteger(values.get('--count'), '--count');
  const startIndex = parseRequiredSafeInteger(
    values.get('--start-index'),
    '--start-index',
  );
  const outputPath = values.get('--out');

  if (count <= 0) {
    throw new Error('--count must be greater than 0');
  }

  if (!outputPath) {
    throw new Error('--out is required');
  }

  if (!Number.isSafeInteger(startIndex + count - 1)) {
    throw new Error('derived address indexes must be safe integers');
  }

  return {
    count,
    startIndex,
    outputPath,
    force,
  };
}

function parseRequiredSafeInteger(
  value: string | undefined,
  flagName: string,
): number {
  if (value === undefined) {
    throw new Error(`${flagName} is required`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0 || value.trim() === '') {
    throw new Error(`${flagName} must be a safe non-negative integer`);
  }

  return parsed;
}

async function pathExists(outputPath: string): Promise<boolean> {
  try {
    await access(outputPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const entryPointPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (import.meta.url === entryPointPath) {
  generateAddressPoolCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
