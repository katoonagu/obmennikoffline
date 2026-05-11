import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import {
  importAddressPoolToDb,
  type AddressPoolImportDb,
} from '../address-pool/importAddressPoolToDb.js';
import {
  createBuyUsdtOrderInDb,
  createSellUsdtOrderInDb,
  type OrderApplicationDb,
} from '../orders/orderApplicationService.js';

export type ApiDb<TOrder> = AddressPoolImportDb & OrderApplicationDb<TOrder>;

export interface CreateApiAppOptions<TOrder> {
  db: ApiDb<TOrder>;
  enableAdminRoutes?: boolean;
  now?: () => Date;
  publicIdFactory?: () => string;
}

const DEFAULT_RATE_TTL_MINUTES = 20;
const DEFAULT_ORDER_TTL_MINUTES = 60;

const addressPoolRowSchema = z.object({
  network: z.literal('TRON'),
  asset: z.literal('USDT'),
  derivationIndex: z.number().int().nonnegative(),
  address: z.string(),
});

const addressPoolImportBodySchema = z.object({
  rows: z.array(addressPoolRowSchema),
});

const baseOrderBodySchema = z.object({
  userId: z.string(),
  amountUsdt: z.string(),
  amountRub: z.string(),
  rateSnapshot: z.string(),
  rateTtlMinutes: z.number().int().positive().optional(),
  orderTtlMinutes: z.number().int().positive().optional(),
});

const buyOrderBodySchema = baseOrderBodySchema.extend({
  clientPayoutAddress: z.string(),
});

const sellOrderBodySchema = baseOrderBodySchema;

export function createApiApp<TOrder>(
  options: CreateApiAppOptions<TOrder>,
): FastifyInstance {
  const app = Fastify({ logger: false });
  const now = options.now ?? (() => new Date());
  const publicIdFactory = options.publicIdFactory ?? createPublicId;

  app.get('/health', async () => ({
    status: 'ok',
  }));

  if (options.enableAdminRoutes === true) {
    app.post('/api/address-pool/import', async (request, reply) => {
      const body = parseBody(addressPoolImportBodySchema, request.body);
      const result = await importAddressPoolToDb({
        db: options.db,
        rows: body.rows,
      });

      return reply.code(201).send(result);
    });
  }

  app.post('/api/orders/buy', async (request, reply) => {
    const body = parseBody(buyOrderBodySchema, request.body);
    const order = await createBuyUsdtOrderInDb(options.db, {
      publicId: publicIdFactory(),
      userId: body.userId,
      amountUsdt: body.amountUsdt,
      amountRub: body.amountRub,
      rateSnapshot: body.rateSnapshot,
      clientPayoutAddress: body.clientPayoutAddress,
      now: now(),
      rateTtlMinutes: body.rateTtlMinutes ?? DEFAULT_RATE_TTL_MINUTES,
      orderTtlMinutes: body.orderTtlMinutes ?? DEFAULT_ORDER_TTL_MINUTES,
    });

    return reply.code(201).send({ order });
  });

  app.post('/api/orders/sell', async (request, reply) => {
    const body = parseBody(sellOrderBodySchema, request.body);
    const order = await createSellUsdtOrderInDb(options.db, {
      publicId: publicIdFactory(),
      userId: body.userId,
      amountUsdt: body.amountUsdt,
      amountRub: body.amountRub,
      rateSnapshot: body.rateSnapshot,
      now: now(),
      rateTtlMinutes: body.rateTtlMinutes ?? DEFAULT_RATE_TTL_MINUTES,
      orderTtlMinutes: body.orderTtlMinutes ?? DEFAULT_ORDER_TTL_MINUTES,
    });

    return reply.code(201).send({ order });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'invalid_request',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    if (isAddressPoolUnavailable(error)) {
      return reply.code(409).send({
        error: 'address_pool_unavailable',
        message: error.message,
      });
    }

    if (isDomainValidationError(error)) {
      return reply.code(400).send({
        error: 'validation_error',
        message: error.message,
      });
    }

    request.log.error({ error }, 'Unhandled API error');
    return reply.code(500).send({
      error: 'internal_error',
    });
  });

  return app;
}

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

function isAddressPoolUnavailable(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message === 'no available TRON deposit addresses' ||
      error.message ===
        'failed to reserve TRON deposit address after concurrent attempts')
  );
}

function isDomainValidationError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.endsWith('is required') ||
    error.message.includes('must be a valid TRON base58 address') ||
    error.message.includes('must be a positive decimal string') ||
    error.message.includes('must fit Decimal') ||
    error.message.includes('must be a positive integer') ||
    error.message.includes('must be a valid Date') ||
    error.message.includes('produces an invalid expiry date')
  );
}

function createPublicId(): string {
  return `E${randomBytes(6).toString('hex').toUpperCase()}`;
}
