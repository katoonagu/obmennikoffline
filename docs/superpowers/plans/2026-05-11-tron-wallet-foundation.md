# TRON Wallet Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP crypto foundation for USDT TRC20 orders: offline HD-derived public address pools, address import, address reservation, order direction logic, and watcher interfaces without storing private keys in the backend.

**Architecture:** Start with a TypeScript service package that separates domain logic from infrastructure. The MVP backend stores only public TRON addresses and derivation indexes; seed phrases and private keys never enter runtime config, database records, logs, or admin UI. TRON provider integration is behind an interface so TronGrid/Tatum/QuickNode/GetBlock can be selected after the inactive-address spike.

**Tech Stack:** Node.js 20+, TypeScript, pnpm, Vitest, Prisma, PostgreSQL, Redis later for workers, TronWeb/ethers/bip39 for offline address generation utilities.

---

## Scope Boundary

This plan implements the crypto foundation only. It does not implement Telegram Mini App UI, Telegram bot conversations, manager backoffice screens, reports, support chat, AML provider API, automatic sweep, or automatic payout. Those should become separate plans after this foundation is in place.

## File Structure

- Create: `package.json` - root scripts and dependencies.
- Create: `tsconfig.json` - strict TypeScript config.
- Create: `vitest.config.ts` - unit test config.
- Create: `prisma/schema.prisma` - data model for users, orders, addresses, txs, audit.
- Create: `src/domain/types.ts` - shared domain enums and value types.
- Create: `src/domain/tronAddress.ts` - TRON address validation.
- Create: `src/wallet/deriveTronAddress.ts` - HD wallet public address derivation from mnemonic and index.
- Create: `src/wallet/addressPoolCsv.ts` - CSV rendering/parsing helpers.
- Create: `src/wallet/generateAddressPoolCli.ts` - offline CLI for public pool generation.
- Create: `src/address-pool/importAddressPool.ts` - validate and prepare imported public addresses.
- Create: `src/address-pool/reserveDepositAddress.ts` - reserve one address for a SELL_USDT order.
- Create: `src/orders/orderService.ts` - create BUY_USDT and SELL_USDT orders.
- Create: `src/tron/tronProvider.ts` - watcher provider interface and event types.
- Create: `src/tron/normalizeUsdtTransfer.ts` - normalize provider events into internal tx records.
- Create: `tests/**/*.test.ts` - unit tests for each domain module.

## Task 1: Initialize TypeScript Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "obmennikoffline",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint:types": "tsc -p tsconfig.json --noEmit",
    "wallet:generate-address-pool": "tsx src/wallet/generateAddressPoolCli.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "bip39": "^3.1.0",
    "bs58check": "^4.0.0",
    "ethers": "^6.13.4",
    "tronweb": "^6.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "prisma": "^5.22.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 5: Verify empty project compiles**

Run: `pnpm lint:types`

Expected: TypeScript completes with no errors after source files are added in later tasks. If run before source files exist, no project errors should appear.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts pnpm-lock.yaml
git commit -m "chore: initialize TypeScript wallet foundation"
```

## Task 2: Add Domain Types And TRON Address Validation

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/tronAddress.ts`
- Test: `tests/domain/tronAddress.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/domain/tronAddress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertTronAddress, isTronAddress } from '../../src/domain/tronAddress.js';

describe('TRON address validation', () => {
  it('accepts valid base58 TRON addresses', () => {
    expect(isTronAddress('TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY')).toBe(true);
    expect(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isTronAddress('')).toBe(false);
    expect(isTronAddress('0x1234')).toBe(false);
    expect(isTronAddress('TXndknnAM2awhzH6p9AidYVKPtUzXmWmkZ')).toBe(false);
    expect(isTronAddress('EXndknnAM2awhzH6p9AidYVKPtUzXmWmkY')).toBe(false);
  });

  it('throws a field-specific error for invalid values', () => {
    expect(() => assertTronAddress('bad', 'client_payout_address')).toThrow(
      'client_payout_address must be a valid TRON base58 address',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/domain/tronAddress.test.ts`

Expected: FAIL because `src/domain/tronAddress.ts` does not exist.

- [ ] **Step 3: Create shared domain types**

Create `src/domain/types.ts`:

```ts
export type Network = 'TRON';
export type Asset = 'USDT';
export type OrderDirection = 'BUY_USDT' | 'SELL_USDT';

export type DepositAddressStatus =
  | 'available'
  | 'reserved'
  | 'funded'
  | 'expired'
  | 'late_funded'
  | 'disabled';

export type OrderStatus =
  | 'draft'
  | 'awaiting_deposit'
  | 'awaiting_office_visit'
  | 'funds_detected'
  | 'pending_aml'
  | 'manager_review'
  | 'ready_for_cash_payout'
  | 'ready_for_crypto_payout'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'late_payment'
  | 'rejected';

export type MoneyString = string;
```

- [ ] **Step 4: Implement TRON validation**

Create `src/domain/tronAddress.ts`:

```ts
import bs58check from 'bs58check';

const TRON_BASE58_LENGTH = 34;
const TRON_HEX_PREFIX = 0x41;

export function isTronAddress(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length !== TRON_BASE58_LENGTH) return false;
  if (!value.startsWith('T')) return false;

  try {
    const decoded = bs58check.decode(value);
    return decoded.length === 21 && decoded[0] === TRON_HEX_PREFIX;
  } catch {
    return false;
  }
}

export function assertTronAddress(value: string, fieldName: string): void {
  if (!isTronAddress(value)) {
    throw new Error(`${fieldName} must be a valid TRON base58 address`);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/domain/tronAddress.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/tronAddress.ts tests/domain/tronAddress.test.ts
git commit -m "feat: validate TRON addresses"
```

## Task 3: Implement Offline HD Address Derivation

**Files:**
- Create: `src/wallet/deriveTronAddress.ts`
- Test: `tests/wallet/deriveTronAddress.test.ts`

- [ ] **Step 1: Write failing derivation tests**

Create `tests/wallet/deriveTronAddress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveTronAddress } from '../../src/wallet/deriveTronAddress.js';
import { isTronAddress } from '../../src/domain/tronAddress.js';

const MNEMONIC =
  'test test test test test test test test test test test junk';

describe('deriveTronAddress', () => {
  it('derives deterministic valid TRON addresses by index', () => {
    const first = deriveTronAddress({ mnemonic: MNEMONIC, index: 0 });
    const firstAgain = deriveTronAddress({ mnemonic: MNEMONIC, index: 0 });
    const second = deriveTronAddress({ mnemonic: MNEMONIC, index: 1 });

    expect(first).toEqual(firstAgain);
    expect(first.address).not.toEqual(second.address);
    expect(first.derivationPath).toBe("m/44'/195'/0'/0/0");
    expect(second.derivationPath).toBe("m/44'/195'/0'/0/1");
    expect(isTronAddress(first.address)).toBe(true);
    expect(isTronAddress(second.address)).toBe(true);
  });

  it('rejects negative and unsafe indexes', () => {
    expect(() => deriveTronAddress({ mnemonic: MNEMONIC, index: -1 })).toThrow(
      'index must be a safe non-negative integer',
    );
    expect(() => deriveTronAddress({ mnemonic: MNEMONIC, index: 1.5 })).toThrow(
      'index must be a safe non-negative integer',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/wallet/deriveTronAddress.test.ts`

Expected: FAIL because `deriveTronAddress.ts` does not exist.

- [ ] **Step 3: Implement derivation**

Create `src/wallet/deriveTronAddress.ts`:

```ts
import { HDNodeWallet } from 'ethers';
import TronWeb from 'tronweb';

export interface DerivedTronAddress {
  index: number;
  derivationPath: string;
  address: string;
}

export interface DeriveTronAddressInput {
  mnemonic: string;
  index: number;
}

export function tronDerivationPath(index: number): string {
  assertSafeIndex(index);
  return `m/44'/195'/0'/0/${index}`;
}

export function deriveTronAddress(input: DeriveTronAddressInput): DerivedTronAddress {
  const derivationPath = tronDerivationPath(input.index);
  const wallet = HDNodeWallet.fromPhrase(input.mnemonic, undefined, derivationPath);
  const privateKey = wallet.privateKey.startsWith('0x')
    ? wallet.privateKey.slice(2)
    : wallet.privateKey;
  const address = TronWeb.address.fromPrivateKey(privateKey);

  if (!address) {
    throw new Error(`failed to derive TRON address at index ${input.index}`);
  }

  return {
    index: input.index,
    derivationPath,
    address,
  };
}

function assertSafeIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('index must be a safe non-negative integer');
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/wallet/deriveTronAddress.test.ts tests/domain/tronAddress.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wallet/deriveTronAddress.ts tests/wallet/deriveTronAddress.test.ts
git commit -m "feat: derive TRON addresses from HD wallet"
```

## Task 4: Generate Public Address Pool CSV Without Private Keys

**Files:**
- Create: `src/wallet/addressPoolCsv.ts`
- Create: `src/wallet/generateAddressPoolCli.ts`
- Test: `tests/wallet/addressPoolCsv.test.ts`

- [ ] **Step 1: Write failing CSV tests**

Create `tests/wallet/addressPoolCsv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAddressPoolCsv, renderAddressPoolCsv } from '../../src/wallet/addressPoolCsv.js';

describe('address pool CSV', () => {
  it('renders public address rows without private key material', () => {
    const csv = renderAddressPoolCsv([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      },
    ]);

    expect(csv).toBe(
      [
        'network,asset,derivation_index,address',
        'TRON,USDT,0,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        '',
      ].join('\n'),
    );
    expect(csv.toLowerCase()).not.toContain('private');
    expect(csv.toLowerCase()).not.toContain('mnemonic');
    expect(csv.toLowerCase()).not.toContain('seed');
  });

  it('parses public address rows', () => {
    const rows = parseAddressPoolCsv(
      [
        'network,asset,derivation_index,address',
        'TRON,USDT,2,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        '',
      ].join('\n'),
    );

    expect(rows).toEqual([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 2,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/wallet/addressPoolCsv.test.ts`

Expected: FAIL because CSV module does not exist.

- [ ] **Step 3: Implement CSV helper**

Create `src/wallet/addressPoolCsv.ts`:

```ts
import type { Asset, Network } from '../domain/types.js';

export interface AddressPoolCsvRow {
  network: Network;
  asset: Asset;
  derivationIndex: number;
  address: string;
}

const HEADER = 'network,asset,derivation_index,address';

export function renderAddressPoolCsv(rows: AddressPoolCsvRow[]): string {
  const lines = [
    HEADER,
    ...rows.map((row) =>
      [row.network, row.asset, String(row.derivationIndex), row.address].join(','),
    ),
    '',
  ];
  return lines.join('\n');
}

export function parseAddressPoolCsv(csv: string): AddressPoolCsvRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [header, ...dataLines] = lines;

  if (header !== HEADER) {
    throw new Error(`address pool CSV header must be: ${HEADER}`);
  }

  return dataLines.map((line, lineIndex) => {
    const [network, asset, derivationIndexRaw, address] = line.split(',');

    if (network !== 'TRON') {
      throw new Error(`line ${lineIndex + 2}: network must be TRON`);
    }
    if (asset !== 'USDT') {
      throw new Error(`line ${lineIndex + 2}: asset must be USDT`);
    }

    const derivationIndex = Number(derivationIndexRaw);
    if (!Number.isSafeInteger(derivationIndex) || derivationIndex < 0) {
      throw new Error(`line ${lineIndex + 2}: derivation_index must be a safe non-negative integer`);
    }
    if (!address) {
      throw new Error(`line ${lineIndex + 2}: address is required`);
    }

    return {
      network,
      asset,
      derivationIndex,
      address,
    };
  });
}
```

- [ ] **Step 4: Implement offline CLI**

Create `src/wallet/generateAddressPoolCli.ts`:

```ts
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveTronAddress } from './deriveTronAddress.js';
import { renderAddressPoolCsv, type AddressPoolCsvRow } from './addressPoolCsv.js';

interface CliArgs {
  count: number;
  startIndex: number;
  out: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--force') {
      args.set('force', true);
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${token}`);
    }
    args.set(token.slice(2), value);
    i += 1;
  }

  const count = Number(args.get('count') ?? '0');
  const startIndex = Number(args.get('start-index') ?? '0');
  const out = String(args.get('out') ?? '');
  const force = args.get('force') === true;

  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error('--count must be a positive integer');
  }
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
    throw new Error('--start-index must be a safe non-negative integer');
  }
  if (!out) {
    throw new Error('--out is required');
  }

  return { count, startIndex, out, force };
}

function main(): void {
  const mnemonic = process.env.TRON_MNEMONIC;
  if (!mnemonic) {
    throw new Error('TRON_MNEMONIC env var is required for offline generation');
  }

  const args = parseArgs(process.argv.slice(2));
  const outputPath = resolve(args.out);

  if (existsSync(outputPath) && !args.force) {
    throw new Error(`refusing to overwrite existing file: ${outputPath}`);
  }

  const rows: AddressPoolCsvRow[] = [];
  for (let offset = 0; offset < args.count; offset += 1) {
    const index = args.startIndex + offset;
    const derived = deriveTronAddress({ mnemonic, index });
    rows.push({
      network: 'TRON',
      asset: 'USDT',
      derivationIndex: index,
      address: derived.address,
    });
  }

  writeFileSync(outputPath, renderAddressPoolCsv(rows), { encoding: 'utf8', flag: 'w' });
  process.stdout.write(`Generated ${rows.length} public TRON addresses to ${outputPath}\n`);
}

main();
```

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/wallet/addressPoolCsv.test.ts tests/wallet/deriveTronAddress.test.ts`

Expected: PASS.

- [ ] **Step 6: Smoke test CLI with test mnemonic**

Run:

```bash
TRON_MNEMONIC="test test test test test test test test test test test junk" pnpm wallet:generate-address-pool -- --count 3 --start-index 0 --out ./address-pool.sample.csv --force
```

Expected: `address-pool.sample.csv` contains only `network,asset,derivation_index,address` columns and no private keys.

- [ ] **Step 7: Remove generated sample**

Run: `rm address-pool.sample.csv`

Expected: sample file removed.

- [ ] **Step 8: Commit**

```bash
git add src/wallet/addressPoolCsv.ts src/wallet/generateAddressPoolCli.ts tests/wallet/addressPoolCsv.test.ts
git commit -m "feat: generate public TRON address pool"
```

## Task 5: Add Prisma Data Model

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Create Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Network {
  TRON
}

enum Asset {
  USDT
}

enum OrderDirection {
  BUY_USDT
  SELL_USDT
}

enum DepositAddressStatus {
  available
  reserved
  funded
  expired
  late_funded
  disabled
}

enum OrderStatus {
  draft
  awaiting_deposit
  awaiting_office_visit
  funds_detected
  pending_aml
  manager_review
  ready_for_cash_payout
  ready_for_crypto_payout
  completed
  cancelled
  expired
  late_payment
  rejected
}

model User {
  id              String           @id @default(cuid())
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  telegramProfile TelegramProfile?
  orders          Order[]
}

model TelegramProfile {
  id             String   @id @default(cuid())
  userId         String   @unique
  telegramUserId BigInt   @unique
  username       String?
  firstName      String?
  lastName       String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  user           User     @relation(fields: [userId], references: [id])
}

model Order {
  id                  String          @id @default(cuid())
  publicId            String          @unique
  userId              String
  direction           OrderDirection
  asset               Asset           @default(USDT)
  network             Network         @default(TRON)
  amountUsdt          Decimal?        @db.Decimal(36, 6)
  amountRub           Decimal?        @db.Decimal(36, 2)
  rateSnapshot        Decimal         @db.Decimal(36, 6)
  rateExpiresAt       DateTime
  orderExpiresAt      DateTime
  depositAddressId    String?         @unique
  clientPayoutAddress String?
  status              OrderStatus
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  completedAt         DateTime?
  user                User            @relation(fields: [userId], references: [id])
  depositAddress      DepositAddress? @relation(fields: [depositAddressId], references: [id])
  transactions        BlockchainTransaction[]
  auditLogs           AuditLog[]
}

model DepositAddress {
  id              String               @id @default(cuid())
  network         Network              @default(TRON)
  asset           Asset                @default(USDT)
  address         String               @unique
  derivationIndex Int                  @unique
  status          DepositAddressStatus @default(available)
  reservedAt      DateTime?
  expiresAt       DateTime?
  fundedAt        DateTime?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  order           Order?
}

model BlockchainTransaction {
  id              String   @id @default(cuid())
  network         Network  @default(TRON)
  asset           Asset    @default(USDT)
  txId            String
  logIndex        Int      @default(0)
  fromAddress     String
  toAddress       String
  amount          Decimal  @db.Decimal(36, 6)
  blockNumber     BigInt
  blockTimestamp  DateTime
  orderId         String?
  createdAt       DateTime @default(now())
  order           Order?   @relation(fields: [orderId], references: [id])

  @@unique([network, txId, logIndex])
  @@index([toAddress])
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  action     String
  entityType String
  entityId   String
  orderId    String?
  metadata   Json
  createdAt  DateTime @default(now())
  order      Order?   @relation(fields: [orderId], references: [id])
}
```

- [ ] **Step 2: Format schema**

Run: `pnpm prisma format`

Expected: Prisma formats schema without errors.

- [ ] **Step 3: Validate schema**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/obmennikoffline" pnpm prisma validate`

Expected: Prisma schema validates. It does not need a live DB for validation.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: model wallet orders and deposit addresses"
```

## Task 6: Import Public Address Pool

**Files:**
- Create: `src/address-pool/importAddressPool.ts`
- Test: `tests/address-pool/importAddressPool.test.ts`

- [ ] **Step 1: Write failing import tests**

Create `tests/address-pool/importAddressPool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prepareAddressPoolImport } from '../../src/address-pool/importAddressPool.js';

describe('prepareAddressPoolImport', () => {
  it('accepts unique TRON USDT public addresses', () => {
    const result = prepareAddressPoolImport([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      },
    ]);

    expect(result).toEqual([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 0,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        status: 'available',
      },
    ]);
  });

  it('rejects duplicate addresses and duplicate derivation indexes', () => {
    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        },
      ]),
    ).toThrow('duplicate derivation_index in import: 0');

    expect(() =>
      prepareAddressPoolImport([
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 0,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
        {
          network: 'TRON',
          asset: 'USDT',
          derivationIndex: 1,
          address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        },
      ]),
    ).toThrow('duplicate address in import: TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/address-pool/importAddressPool.test.ts`

Expected: FAIL because import module does not exist.

- [ ] **Step 3: Implement import preparation**

Create `src/address-pool/importAddressPool.ts`:

```ts
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

export function prepareAddressPoolImport(rows: AddressPoolCsvRow[]): PreparedDepositAddress[] {
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
      throw new Error(`duplicate derivation_index in import: ${row.derivationIndex}`);
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
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/address-pool/importAddressPool.test.ts tests/domain/tronAddress.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/address-pool/importAddressPool.ts tests/address-pool/importAddressPool.test.ts
git commit -m "feat: prepare public address pool imports"
```

## Task 7: Reserve Deposit Address For SELL_USDT Order

**Files:**
- Create: `src/address-pool/reserveDepositAddress.ts`
- Test: `tests/address-pool/reserveDepositAddress.test.ts`

- [ ] **Step 1: Write failing reservation tests**

Create `tests/address-pool/reserveDepositAddress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reserveDepositAddress } from '../../src/address-pool/reserveDepositAddress.js';

describe('reserveDepositAddress', () => {
  it('reserves the lowest available derivation index', () => {
    const now = new Date('2026-05-11T09:00:00.000Z');
    const result = reserveDepositAddress({
      addresses: [
        { id: 'addr-2', derivationIndex: 2, status: 'available' },
        { id: 'addr-1', derivationIndex: 1, status: 'available' },
      ],
      orderId: 'order-1',
      now,
      ttlMinutes: 60,
    });

    expect(result).toEqual({
      addressId: 'addr-1',
      orderId: 'order-1',
      status: 'reserved',
      reservedAt: now,
      expiresAt: new Date('2026-05-11T10:00:00.000Z'),
    });
  });

  it('throws when no address is available', () => {
    expect(() =>
      reserveDepositAddress({
        addresses: [{ id: 'addr-1', derivationIndex: 1, status: 'reserved' }],
        orderId: 'order-1',
        now: new Date('2026-05-11T09:00:00.000Z'),
        ttlMinutes: 60,
      }),
    ).toThrow('no available TRON deposit addresses');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/address-pool/reserveDepositAddress.test.ts`

Expected: FAIL because reservation module does not exist.

- [ ] **Step 3: Implement reservation selection logic**

Create `src/address-pool/reserveDepositAddress.ts`:

```ts
import type { DepositAddressStatus } from '../domain/types.js';

export interface ReservableAddress {
  id: string;
  derivationIndex: number;
  status: DepositAddressStatus;
}

export interface ReserveDepositAddressInput {
  addresses: ReservableAddress[];
  orderId: string;
  now: Date;
  ttlMinutes: number;
}

export interface ReservedDepositAddressPatch {
  addressId: string;
  orderId: string;
  status: 'reserved';
  reservedAt: Date;
  expiresAt: Date;
}

export function reserveDepositAddress(input: ReserveDepositAddressInput): ReservedDepositAddressPatch {
  if (!Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes <= 0) {
    throw new Error('ttlMinutes must be a positive integer');
  }

  const address = input.addresses
    .filter((candidate) => candidate.status === 'available')
    .sort((a, b) => a.derivationIndex - b.derivationIndex)[0];

  if (!address) {
    throw new Error('no available TRON deposit addresses');
  }

  return {
    addressId: address.id,
    orderId: input.orderId,
    status: 'reserved',
    reservedAt: input.now,
    expiresAt: new Date(input.now.getTime() + input.ttlMinutes * 60_000),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/address-pool/reserveDepositAddress.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/address-pool/reserveDepositAddress.ts tests/address-pool/reserveDepositAddress.test.ts
git commit -m "feat: reserve deposit addresses for sell orders"
```

## Task 8: Add Order Creation Rules For BUY_USDT And SELL_USDT

**Files:**
- Create: `src/orders/orderService.ts`
- Test: `tests/orders/orderService.test.ts`

- [ ] **Step 1: Write failing order service tests**

Create `tests/orders/orderService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBuyUsdtOrder, createSellUsdtOrder } from '../../src/orders/orderService.js';

describe('orderService', () => {
  it('creates SELL_USDT orders with awaiting_deposit status and a reserved address requirement', () => {
    const order = createSellUsdtOrder({
      publicId: 'E74737',
      userId: 'user-1',
      amountUsdt: '5000.000000',
      amountRub: '381250.00',
      rateSnapshot: '76.250000',
      now: new Date('2026-05-11T09:00:00.000Z'),
      rateTtlMinutes: 20,
      orderTtlMinutes: 60,
      depositAddressId: 'addr-1',
    });

    expect(order.direction).toBe('SELL_USDT');
    expect(order.status).toBe('awaiting_deposit');
    expect(order.depositAddressId).toBe('addr-1');
    expect(order.clientPayoutAddress).toBeNull();
    expect(order.rateExpiresAt).toEqual(new Date('2026-05-11T09:20:00.000Z'));
    expect(order.orderExpiresAt).toEqual(new Date('2026-05-11T10:00:00.000Z'));
  });

  it('creates BUY_USDT orders with client payout address and no deposit address', () => {
    const order = createBuyUsdtOrder({
      publicId: 'E97010',
      userId: 'user-1',
      amountUsdt: '2602.400000',
      amountRub: '200000.00',
      rateSnapshot: '76.850000',
      clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
      now: new Date('2026-05-11T09:00:00.000Z'),
      rateTtlMinutes: 20,
      orderTtlMinutes: 60,
    });

    expect(order.direction).toBe('BUY_USDT');
    expect(order.status).toBe('awaiting_office_visit');
    expect(order.depositAddressId).toBeNull();
    expect(order.clientPayoutAddress).toBe('TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7');
  });

  it('rejects BUY_USDT with invalid payout address', () => {
    expect(() =>
      createBuyUsdtOrder({
        publicId: 'E97010',
        userId: 'user-1',
        amountUsdt: '2602.400000',
        amountRub: '200000.00',
        rateSnapshot: '76.850000',
        clientPayoutAddress: 'bad',
        now: new Date('2026-05-11T09:00:00.000Z'),
        rateTtlMinutes: 20,
        orderTtlMinutes: 60,
      }),
    ).toThrow('clientPayoutAddress must be a valid TRON base58 address');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/orders/orderService.test.ts`

Expected: FAIL because order service does not exist.

- [ ] **Step 3: Implement order creation rules**

Create `src/orders/orderService.ts`:

```ts
import { assertTronAddress } from '../domain/tronAddress.js';
import type { OrderDirection, OrderStatus } from '../domain/types.js';

interface BaseOrderInput {
  publicId: string;
  userId: string;
  amountUsdt: string;
  amountRub: string;
  rateSnapshot: string;
  now: Date;
  rateTtlMinutes: number;
  orderTtlMinutes: number;
}

export interface CreatedOrder {
  publicId: string;
  userId: string;
  direction: OrderDirection;
  asset: 'USDT';
  network: 'TRON';
  amountUsdt: string;
  amountRub: string;
  rateSnapshot: string;
  rateExpiresAt: Date;
  orderExpiresAt: Date;
  depositAddressId: string | null;
  clientPayoutAddress: string | null;
  status: OrderStatus;
}

export interface CreateSellUsdtOrderInput extends BaseOrderInput {
  depositAddressId: string;
}

export interface CreateBuyUsdtOrderInput extends BaseOrderInput {
  clientPayoutAddress: string;
}

export function createSellUsdtOrder(input: CreateSellUsdtOrderInput): CreatedOrder {
  assertPositiveTtl(input.rateTtlMinutes, 'rateTtlMinutes');
  assertPositiveTtl(input.orderTtlMinutes, 'orderTtlMinutes');

  if (!input.depositAddressId) {
    throw new Error('depositAddressId is required for SELL_USDT order');
  }

  return {
    publicId: input.publicId,
    userId: input.userId,
    direction: 'SELL_USDT',
    asset: 'USDT',
    network: 'TRON',
    amountUsdt: input.amountUsdt,
    amountRub: input.amountRub,
    rateSnapshot: input.rateSnapshot,
    rateExpiresAt: addMinutes(input.now, input.rateTtlMinutes),
    orderExpiresAt: addMinutes(input.now, input.orderTtlMinutes),
    depositAddressId: input.depositAddressId,
    clientPayoutAddress: null,
    status: 'awaiting_deposit',
  };
}

export function createBuyUsdtOrder(input: CreateBuyUsdtOrderInput): CreatedOrder {
  assertPositiveTtl(input.rateTtlMinutes, 'rateTtlMinutes');
  assertPositiveTtl(input.orderTtlMinutes, 'orderTtlMinutes');
  assertTronAddress(input.clientPayoutAddress, 'clientPayoutAddress');

  return {
    publicId: input.publicId,
    userId: input.userId,
    direction: 'BUY_USDT',
    asset: 'USDT',
    network: 'TRON',
    amountUsdt: input.amountUsdt,
    amountRub: input.amountRub,
    rateSnapshot: input.rateSnapshot,
    rateExpiresAt: addMinutes(input.now, input.rateTtlMinutes),
    orderExpiresAt: addMinutes(input.now, input.orderTtlMinutes),
    depositAddressId: null,
    clientPayoutAddress: input.clientPayoutAddress,
    status: 'awaiting_office_visit',
  };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function assertPositiveTtl(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/orders/orderService.test.ts tests/domain/tronAddress.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/orders/orderService.ts tests/orders/orderService.test.ts
git commit -m "feat: create buy and sell USDT orders"
```

## Task 9: Define TRON Watcher Provider Interface And USDT Event Normalization

**Files:**
- Create: `src/tron/tronProvider.ts`
- Create: `src/tron/normalizeUsdtTransfer.ts`
- Test: `tests/tron/normalizeUsdtTransfer.test.ts`

- [ ] **Step 1: Write failing watcher normalization tests**

Create `tests/tron/normalizeUsdtTransfer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeUsdtTransfer } from '../../src/tron/normalizeUsdtTransfer.js';

describe('normalizeUsdtTransfer', () => {
  it('normalizes a TRC20 USDT transfer event', () => {
    const tx = normalizeUsdtTransfer({
      txId: 'abc123',
      logIndex: 0,
      contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      fromAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
      toAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      amountRaw: '5000000000',
      decimals: 6,
      blockNumber: 72123456n,
      blockTimestamp: new Date('2026-05-11T09:05:00.000Z'),
    });

    expect(tx).toEqual({
      network: 'TRON',
      asset: 'USDT',
      txId: 'abc123',
      logIndex: 0,
      fromAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
      toAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      amount: '5000.000000',
      blockNumber: 72123456n,
      blockTimestamp: new Date('2026-05-11T09:05:00.000Z'),
    });
  });

  it('rejects non-USDT contract events', () => {
    expect(() =>
      normalizeUsdtTransfer({
        txId: 'abc123',
        logIndex: 0,
        contractAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        fromAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
        toAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        amountRaw: '1',
        decimals: 6,
        blockNumber: 72123456n,
        blockTimestamp: new Date('2026-05-11T09:05:00.000Z'),
      }),
    ).toThrow('event contract is not USDT TRC20');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/tron/normalizeUsdtTransfer.test.ts`

Expected: FAIL because TRON modules do not exist.

- [ ] **Step 3: Define provider interface**

Create `src/tron/tronProvider.ts`:

```ts
export const USDT_TRC20_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export interface TronTransferEvent {
  txId: string;
  logIndex: number;
  contractAddress: string;
  fromAddress: string;
  toAddress: string;
  amountRaw: string;
  decimals: number;
  blockNumber: bigint;
  blockTimestamp: Date;
}

export interface TronProvider {
  getUsdtTransfersToAddresses(input: {
    addresses: string[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<TronTransferEvent[]>;
}
```

- [ ] **Step 4: Implement normalization**

Create `src/tron/normalizeUsdtTransfer.ts`:

```ts
import { assertTronAddress } from '../domain/tronAddress.js';
import { USDT_TRC20_CONTRACT_ADDRESS, type TronTransferEvent } from './tronProvider.js';

export interface NormalizedBlockchainTransaction {
  network: 'TRON';
  asset: 'USDT';
  txId: string;
  logIndex: number;
  fromAddress: string;
  toAddress: string;
  amount: string;
  blockNumber: bigint;
  blockTimestamp: Date;
}

export function normalizeUsdtTransfer(event: TronTransferEvent): NormalizedBlockchainTransaction {
  if (event.contractAddress !== USDT_TRC20_CONTRACT_ADDRESS) {
    throw new Error('event contract is not USDT TRC20');
  }
  if (event.decimals !== 6) {
    throw new Error(`USDT TRC20 decimals must be 6, got ${event.decimals}`);
  }

  assertTronAddress(event.fromAddress, 'fromAddress');
  assertTronAddress(event.toAddress, 'toAddress');

  return {
    network: 'TRON',
    asset: 'USDT',
    txId: event.txId,
    logIndex: event.logIndex,
    fromAddress: event.fromAddress,
    toAddress: event.toAddress,
    amount: formatTokenAmount(event.amountRaw, event.decimals),
    blockNumber: event.blockNumber,
    blockTimestamp: event.blockTimestamp,
  };
}

function formatTokenAmount(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  return `${whole.toString()}.${fraction.toString().padStart(decimals, '0')}`;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/tron/normalizeUsdtTransfer.test.ts tests/domain/tronAddress.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tron/tronProvider.ts src/tron/normalizeUsdtTransfer.ts tests/tron/normalizeUsdtTransfer.test.ts
git commit -m "feat: normalize TRON USDT transfer events"
```

## Task 10: Document Spike Commands And Provider Decision Criteria

**Files:**
- Create: `docs/tron-provider-spike.md`

- [ ] **Step 1: Create provider spike doc**

Create `docs/tron-provider-spike.md`:

```md
# TRON Provider Spike

## Goal

Select the first TRON data provider for MVP watcher implementation.

## Required Behavior

The provider must reliably detect incoming USDT TRC20 transfers to a newly generated, not pre-activated TRON address.

## Providers To Test

- TronGrid
- Tatum
- QuickNode
- GetBlock

## Test Matrix

| Provider | Can query tx by tx id | Can query USDT transfers by destination address | Sees inactive-address deposit | Event delay seconds | Free/paid plan | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TronGrid | unknown | unknown | unknown | unknown | unknown | empty |
| Tatum | unknown | unknown | unknown | unknown | unknown | empty |
| QuickNode | unknown | unknown | unknown | unknown | unknown | empty |
| GetBlock | unknown | unknown | unknown | unknown | unknown | empty |

## Procedure

1. Generate one new TRON address from the offline HD wallet test seed.
2. Do not pre-activate it.
3. Send a small mainnet USDT TRC20 amount from a disposable wallet.
4. Record tx hash.
5. Query each provider by tx hash.
6. Query each provider by destination address.
7. Record delay until event appears.
8. Pick the provider that can detect destination-address transfers reliably with acceptable delay and cost.

## Decision Rule

Choose the cheapest provider that satisfies all required behavior. If multiple providers pass, prefer the one with clearer TRC20 transfer APIs and better rate limits. Keep one fallback provider in config for manual retry.
```

- [ ] **Step 2: Commit**

```bash
git add docs/tron-provider-spike.md
git commit -m "docs: define TRON provider spike"
```

## Self-Review Checklist

- [ ] Spec coverage: This plan covers HD wallet public pool generation, import validation, address reservation, BUY/SELL order logic, and watcher interfaces.
- [ ] Scope boundary: Telegram UI, backoffice UI, reports, AML API, auto sweep, and auto payout are intentionally outside this plan.
- [ ] Placeholder scan: There are no `TODO`, `TBD`, `FIXME`, or ellipsis placeholders in code snippets.
- [ ] Type consistency: `TRON`, `USDT`, `BUY_USDT`, `SELL_USDT`, and address/order statuses match the design spec.
- [ ] Security check: No task stores seed phrase, mnemonic, or private keys in backend code, database schema, `.env`, logs, or generated CSV.

