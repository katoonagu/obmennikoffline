import { createApiApp, type ApiDb } from './createApp.js';
import { prisma } from '../db/prisma.js';

const adminApiToken = readOptionalEnv('ADMIN_API_TOKEN');

const app = createApiApp({
  db: prisma as unknown as ApiDb<unknown>,
  enableAdminRoutes: Boolean(adminApiToken),
  adminApiToken,
  telegramBotToken: readOptionalEnv('TELEGRAM_BOT_TOKEN'),
  telegramInitDataMaxAgeSeconds: readOptionalPositiveIntegerEnv(
    'TELEGRAM_INIT_DATA_MAX_AGE_SECONDS',
  ),
});

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '0.0.0.0';

if (!Number.isSafeInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

await app.listen({ port, host });

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readOptionalPositiveIntegerEnv(name: string): number | undefined {
  const value = readOptionalEnv(name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}
