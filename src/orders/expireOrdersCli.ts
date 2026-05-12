import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  expireOpenOrdersInDb,
  type ExpireOpenOrdersInput,
  type ExpireOpenOrdersResult,
  type OrderExpirationDb,
} from './expireOrders.js';

export interface ExpireOrdersCliEnv {
  ORDER_EXPIRATION_LIMIT?: string;
}

export interface ExpireOrdersCliConfig {
  limit?: number;
}

export interface RunExpireOrdersCliInput {
  env: ExpireOrdersCliEnv;
  db: OrderExpirationDb;
  now?: () => Date;
  expireOrders?: (
    db: OrderExpirationDb,
    input: ExpireOpenOrdersInput,
  ) => Promise<ExpireOpenOrdersResult>;
  writeOutput?: (message: string) => void;
}

export function parseExpireOrdersCliEnv(
  env: ExpireOrdersCliEnv,
): ExpireOrdersCliConfig {
  const limit = parseOptionalPositiveInteger(
    env.ORDER_EXPIRATION_LIMIT,
    'ORDER_EXPIRATION_LIMIT',
  );

  return {
    ...(limit === undefined ? {} : { limit }),
  };
}

export async function runExpireOrdersCli(
  input: RunExpireOrdersCliInput,
): Promise<number> {
  const config = parseExpireOrdersCliEnv(input.env);
  const expireOrders = input.expireOrders ?? expireOpenOrdersInDb;
  const result = await expireOrders(input.db, {
    now: (input.now ?? (() => new Date()))(),
    ...(config.limit === undefined ? {} : { limit: config.limit }),
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify(result, null, 2));

  return 0;
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  fieldName: string,
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }

  return parsed;
}

function isDirectRun(entrypoint: string | undefined, moduleUrl: string): boolean {
  if (!entrypoint) {
    return false;
  }

  return pathToFileURL(resolve(entrypoint)).href === moduleUrl;
}

if (isDirectRun(process.argv[1], import.meta.url)) {
  void (async () => {
    const { prisma } = await import('../db/prisma.js');

    try {
      const exitCode = await runExpireOrdersCli({
        env: process.env,
        db: prisma as unknown as OrderExpirationDb,
      });
      process.exitCode = exitCode;
    } catch (error: unknown) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
