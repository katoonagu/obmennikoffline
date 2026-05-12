import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvFileIfPresent } from '../api/envFile.js';
import {
  provisionAdminUserInDb,
  type AdminProvisioningDb,
  type ProvisionAdminUserInput,
  type ProvisionedAdminUser,
} from './provisionAdminUser.js';
import type { AdminRole } from './adminSession.js';

export interface CreateAdminUserCliEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_ROLE?: string;
}

export interface CreateAdminUserCliConfig {
  username: string;
  password: string;
  role: AdminRole;
}

export interface RunCreateAdminUserCliInput {
  env: CreateAdminUserCliEnv;
  db: AdminProvisioningDb;
  provisionAdminUser?: (
    input: ProvisionAdminUserInput,
  ) => Promise<ProvisionedAdminUser>;
  writeOutput?: (message: string) => void;
}

export function parseCreateAdminUserCliEnv(
  env: CreateAdminUserCliEnv,
): CreateAdminUserCliConfig {
  const username = readRequiredEnv(env, 'ADMIN_USERNAME');
  const password = readRequiredEnv(env, 'ADMIN_PASSWORD');
  const role = readAdminRole(env.ADMIN_ROLE);

  return {
    username,
    password,
    role,
  };
}

export async function runCreateAdminUserCli(
  input: RunCreateAdminUserCliInput,
): Promise<number> {
  const config = parseCreateAdminUserCliEnv(input.env);
  const provisionAdminUser = input.provisionAdminUser ?? provisionAdminUserInDb;
  const admin = await provisionAdminUser({
    db: input.db,
    ...config,
  });

  const writeOutput = input.writeOutput ?? console.log;
  writeOutput(JSON.stringify({ admin }, null, 2));

  return 0;
}

function readRequiredEnv(
  env: CreateAdminUserCliEnv,
  name: 'ADMIN_USERNAME' | 'ADMIN_PASSWORD',
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readAdminRole(value: string | undefined): AdminRole {
  const role = value?.trim() || 'manager';
  if (role !== 'manager' && role !== 'owner') {
    throw new Error('ADMIN_ROLE must be manager or owner');
  }

  return role;
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
      const exitCode = await runCreateAdminUserCli({
        env: process.env,
        db: prisma as unknown as AdminProvisioningDb,
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
