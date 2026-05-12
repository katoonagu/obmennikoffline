import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseAddressPoolCsv,
  renderAddressPoolCsv,
} from '../../src/wallet/addressPoolCsv.js';
import { runGenerateAddressPoolCli } from '../../src/wallet/generateAddressPoolCli.js';

const ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const MNEMONIC =
  'test test test test test test test test test test test junk';
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('address pool CSV', () => {
  it('renders only public TRON address pool columns', () => {
    const csv = renderAddressPoolCsv([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: ADDRESS,
      },
    ]);

    expect(csv).toBe(
      'network,asset,derivation_index,address\nTRON,USDT,0,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY\n',
    );
    expect(csv.toLowerCase()).not.toContain('private');
    expect(csv.toLowerCase()).not.toContain('mnemonic');
    expect(csv.toLowerCase()).not.toContain('seed');
  });

  it('parses a public TRON address pool row', () => {
    expect(
      parseAddressPoolCsv(
        'network,asset,derivation_index,address\nTRON,USDT,2,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY\n',
      ),
    ).toEqual([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 2,
        address: ADDRESS,
      },
    ]);
  });

  it('rejects invalid TRON addresses while parsing or rendering rows', () => {
    expect(() =>
      parseAddressPoolCsv(
        'network,asset,derivation_index,address\nTRON,USDT,2,not-a-tron-address\n',
      ),
    ).toThrow('address must be a valid TRON base58 address');

    expect(() =>
      renderAddressPoolCsv([
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 2,
          address: 'not-a-tron-address',
        },
      ]),
    ).toThrow('address must be a valid TRON base58 address');
  });

  it('rejects non-decimal derivation indexes while parsing rows', () => {
    expect(() =>
      parseAddressPoolCsv(
        'network,asset,derivation_index,address\nTRON,USDT,1e2,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY\n',
      ),
    ).toThrow('derivation_index must be a safe non-negative integer');
  });
});

describe('generate address pool CLI', () => {
  it('fails with a clear error when TRON_MNEMONIC is missing', async () => {
    const io = createTestIo();
    const exitCode = await runGenerateAddressPoolCli(
      ['--count', '1', '--start-index', '0', '--out', 'address-pool.csv'],
      {},
      io,
    );

    expect(exitCode).toBe(1);
    expect(io.stderr).toBe('TRON_MNEMONIC environment variable is required\n');
    expect(io.stdout).toBe('');
  });

  it('fails when required arguments are missing', async () => {
    const io = createTestIo();
    const exitCode = await runGenerateAddressPoolCli(
      ['--count', '1', '--start-index', '0'],
      { TRON_MNEMONIC: MNEMONIC },
      io,
    );

    expect(exitCode).toBe(1);
    expect(io.stderr).toBe('--out is required\n');
    expect(io.stdout).toBe('');
  });

  it('fails on non-decimal numeric arguments', async () => {
    const countIo = createTestIo();
    const countExitCode = await runGenerateAddressPoolCli(
      ['--count', '1e1', '--start-index', '0', '--out', 'address-pool.csv'],
      { TRON_MNEMONIC: MNEMONIC },
      countIo,
    );

    expect(countExitCode).toBe(1);
    expect(countIo.stderr).toBe('--count must be a safe non-negative integer\n');
    expect(countIo.stdout).toBe('');

    const startIndexIo = createTestIo();
    const startIndexExitCode = await runGenerateAddressPoolCli(
      ['--count', '1', '--start-index', '1e1', '--out', 'address-pool.csv'],
      { TRON_MNEMONIC: MNEMONIC },
      startIndexIo,
    );

    expect(startIndexExitCode).toBe(1);
    expect(startIndexIo.stderr).toBe(
      '--start-index must be a safe non-negative integer\n',
    );
    expect(startIndexIo.stdout).toBe('');
  });

  it('fails with a sanitized error when TRON_MNEMONIC is invalid', async () => {
    const invalidMnemonic = 'not a valid mnemonic secret words';
    const io = createTestIo();
    const exitCode = await runGenerateAddressPoolCli(
      ['--count', '1', '--start-index', '0', '--out', 'address-pool.csv'],
      { TRON_MNEMONIC: invalidMnemonic },
      io,
    );

    expect(exitCode).toBe(1);
    expect(io.stderr).toBe(
      'TRON_MNEMONIC must be a valid BIP39 mnemonic\n',
    );
    expect(io.stderr).not.toContain(invalidMnemonic);
    expect(io.stdout).toBe('');
  });

  it('writes once, refuses overwrite without force, and overwrites with force', async () => {
    const directory = await makeTempDir();
    const outputPath = path.join(directory, 'address-pool.csv');
    const firstIo = createTestIo();
    const secondIo = createTestIo();
    const forceIo = createTestIo();

    await expect(
      runGenerateAddressPoolCli(
        ['--count', '1', '--start-index', '0', '--out', outputPath],
        { TRON_MNEMONIC: MNEMONIC },
        firstIo,
      ),
    ).resolves.toBe(0);
    expect(firstIo.stdout).toBe(
      `Generated 1 public TRON addresses to ${outputPath}\n`,
    );

    await expect(
      runGenerateAddressPoolCli(
        ['--count', '1', '--start-index', '0', '--out', outputPath],
        { TRON_MNEMONIC: MNEMONIC },
        secondIo,
      ),
    ).resolves.toBe(1);
    expect(secondIo.stderr).toBe(
      `refusing to overwrite existing file: ${outputPath}\n`,
    );

    await expect(
      runGenerateAddressPoolCli(
        [
          '--count',
          '2',
          '--start-index',
          '0',
          '--out',
          outputPath,
          '--force',
        ],
        { TRON_MNEMONIC: MNEMONIC },
        forceIo,
      ),
    ).resolves.toBe(0);
    expect(forceIo.stdout).toBe(
      `Generated 2 public TRON addresses to ${outputPath}\n`,
    );

    const csv = await readFile(outputPath, 'utf8');
    expect(csv).toMatch(/^network,asset,derivation_index,address\n/);
    expect(csv.trim().split('\n')).toHaveLength(3);
    expect(csv.toLowerCase()).not.toContain('private');
    expect(csv.toLowerCase()).not.toContain('mnemonic');
    expect(csv.toLowerCase()).not.toContain('seed');
    expect(forceIo.stdout.toLowerCase()).not.toContain('private');
    expect(forceIo.stdout.toLowerCase()).not.toContain('mnemonic');
    expect(forceIo.stdout.toLowerCase()).not.toContain('seed');
  });
});

async function makeTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'address-pool-cli-'));
  tempDirs.push(directory);
  return directory;
}

interface TestIo {
  stdout: string;
  stderr: string;
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
}

function createTestIo(): TestIo {
  return {
    stdout: '',
    stderr: '',
    writeStdout(message: string) {
      this.stdout += message;
    },
    writeStderr(message: string) {
      this.stderr += message;
    },
  };
}
