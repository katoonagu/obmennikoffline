import { createApiApp, type ApiDb } from './createApp.js';
import { prisma } from '../db/prisma.js';

const app = createApiApp({
  db: prisma as unknown as ApiDb<unknown>,
});

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '0.0.0.0';

if (!Number.isSafeInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

await app.listen({ port, host });
