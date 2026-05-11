import { writeFile } from 'node:fs/promises';
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

interface CliIo {
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
}

export async function generateAddressPoolCli(
  argv = process.argv.slice(2),
  env = process.env,
): Promise<void> {
  await generateAddressPool(argv, env, {
    writeStdout: (message) => process.stdout.write(message),
    writeStderr: (message) => process.stderr.write(message),
  });
}

export async function runGenerateAddressPoolCli(
  argv = process.argv.slice(2),
  env = process.env,
  io: CliIo = {
    writeStdout: (message) => process.stdout.write(message),
    writeStderr: (message) => process.stderr.write(message),
  },
): Promise<number> {
  try {
    await generateAddressPool(argv, env, io);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeStderr(`${message}\n`);
    return 1;
  }
}

async function generateAddressPool(
  argv: string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Promise<void> {
  const mnemonic = env.TRON_MNEMONIC;

  if (!mnemonic) {
    throw new Error('TRON_MNEMONIC environment variable is required');
  }

  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath);

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

  try {
    await writeFile(outputPath, renderAddressPoolCsv(rows), {
      encoding: 'utf8',
      flag: options.force ? 'w' : 'wx',
    });
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'EEXIST') {
      throw new Error(`refusing to overwrite existing file: ${outputPath}`);
    }

    throw error;
  }

  io.writeStdout(
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

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

const entryPointPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (import.meta.url === entryPointPath) {
  runGenerateAddressPoolCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
