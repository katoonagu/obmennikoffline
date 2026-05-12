import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvFileIfPresent } from '../api/envFile.js';
import {
  disableAdminUserInDb,
  type AdminDisableDb,
  type DisableAdminUserInput,
  type DisabledAdminUser,
} from './disableAdminUser.js';

export interface DisableAdminUserCliEnv {
  ADMIN_USERNAME?: string;
}

export interface DisableAdminUserCliConfig {
  username: string;
}

export interface RunDisableAdminUserCliInput {
  env: DisableAdminUserCliEnv;
  db: AdminDisableDb;
  disableAdminUser?: (input: DisableAdminUserInput) => Promise<DisabledAdminUser>;
  now?: () => Date;
  writeOutput?: (message: string) => void;
}

export function parseDisableAdminUserCliEnv(
  env: DisableAdminUserCliEnv,
): DisableAdminUserCliConfig {
  return {
    username: readRequiredEnv(env, 'ADMIN_USERNAME'),
  };
}

export async function runDisableAdminUserCli(
  input: RunDisableAdminUserCliInput,
): Promise<number> {
  const config = parseDisableAdminUserCliEnv(input.env);
  const disableAdminUser = input.disableAdminUser ?? disableAdminUserInDb;
  const now = input.now ?? (() => new Date());
  const admin = await disableAdminUser({
    db: input.db,
    username: config.username,
    disabledAt: now(),
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify({ admin }, null, 2));

  return 0;
}

function readRequiredEnv(
  env: DisableAdminUserCliEnv,
  name: 'ADMIN_USERNAME',
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isDirectRun(entrypoint: string | undefined, moduleUrl: string): boolean {
  if (!entrypoint) {
    return false;
  }

  return pathToFileURL(resolve(entrypoint)).href === moduleUrl;
}

if (isDirectRun(process.argv[1], import.meta.url)) {
  loadEnvFileIfPresent();

  void (async () => {
    const { prisma } = await import('../db/prisma.js');

    try {
      const exitCode = await runDisableAdminUserCli({
        env: process.env,
        db: prisma as unknown as AdminDisableDb,
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
