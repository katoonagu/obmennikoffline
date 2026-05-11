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
import {
  getOrderByPublicId,
  getUserProfile,
  listActiveOrders,
  listHistoryOrders,
  type OrderReadDb,
} from '../orders/orderReadService.js';
import {
  validateTelegramInitData,
} from '../telegram/validateInitData.js';
import {
  resolveTelegramUserInDb,
  type TelegramUserDb,
} from '../users/telegramUserService.js';

export type ApiDb<TOrder> = AddressPoolImportDb &
  OrderApplicationDb<TOrder> &
  OrderReadDb &
  TelegramUserDb;

export interface CreateApiAppOptions<TOrder> {
  db: ApiDb<TOrder>;
  enableAdminRoutes?: boolean;
  telegramBotToken?: string;
  telegramInitDataMaxAgeSeconds?: number;
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
  userId: z.string().optional(),
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

const telegramInitDataBodySchema = z.object({
  initData: z.string().min(1),
});

const userQuerySchema = z.object({
  userId: z.string().optional(),
});

const orderListQuerySchema = userQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const orderParamsSchema = z.object({
  publicId: z.string().min(1),
});

const DOMAIN_VALIDATION_PATTERNS = [
  /^(publicId|userId) is required$/,
  /^limit must be a positive integer up to 100$/,
  /^depositAddressId is required for SELL_USDT order$/,
  /^(clientPayoutAddress|address) must be a valid TRON base58 address$/,
  /^(amountUsdt|amountRub|rateSnapshot) must be a positive decimal string$/,
  /^(amountUsdt|amountRub|rateSnapshot) must fit Decimal\(36, (2|6)\)$/,
  /^(rateTtlMinutes|orderTtlMinutes|maxReservationAttempts|ttlMinutes) must be a positive integer$/,
  /^now must be a valid Date$/,
  /^(rateTtlMinutes|orderTtlMinutes|ttlMinutes) produces an invalid expiry date$/,
  /^unsupported network in import: .+$/,
  /^unsupported asset in import: .+$/,
  /^invalid derivation_index in import: .+$/,
  /^duplicate derivation_index in import: .+$/,
  /^duplicate address in import: .+$/,
];

const TELEGRAM_AUTH_ERROR_MESSAGES = new Set([
  'Telegram initData authorization is required',
  'Telegram initData authorization must use tma scheme',
  'initData hash is required',
  'initData signature is invalid',
  'auth_date is required',
  'auth_date must be a Unix timestamp',
  'auth_date is from the future',
  'initData is expired',
  'user must be valid JSON',
  'user.id is required',
  'telegram user is required',
]);

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

  if (options.telegramBotToken) {
    app.post('/api/telegram/validate-init-data', async (request, reply) => {
      const body = parseBody(telegramInitDataBodySchema, request.body);
      const validated = validateTelegramInitData({
        initData: body.initData,
        botToken: options.telegramBotToken!,
        now: now(),
        maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      });

      return reply.send({
        authDate: validated.authDate.toISOString(),
        queryId: validated.queryId,
        user: validated.user,
      });
    });
  }

  app.get('/api/orders/active', async (request, reply) => {
    const query = parseBody(orderListQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      authorization: request.headers.authorization,
      fallbackUserId: query.userId,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: now(),
    });
    const orders = await listActiveOrders(options.db, {
      userId,
      limit: query.limit,
    });

    return reply.send({ orders });
  });

  app.get('/api/orders/history', async (request, reply) => {
    const query = parseBody(orderListQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      authorization: request.headers.authorization,
      fallbackUserId: query.userId,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: now(),
    });
    const orders = await listHistoryOrders(options.db, {
      userId,
      limit: query.limit,
    });

    return reply.send({ orders });
  });

  app.get('/api/orders/:publicId', async (request, reply) => {
    const params = parseBody(orderParamsSchema, request.params);
    const query = parseBody(userQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      authorization: request.headers.authorization,
      fallbackUserId: query.userId,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: now(),
    });
    const order = await getOrderByPublicId(options.db, {
      userId,
      publicId: params.publicId,
    });

    if (!order) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'order not found',
      });
    }

    return reply.send({ order });
  });

  app.get('/api/profile', async (request, reply) => {
    const query = parseBody(userQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      authorization: request.headers.authorization,
      fallbackUserId: query.userId,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: now(),
    });
    const profile = await getUserProfile(options.db, { userId });

    return reply.send({ profile });
  });

  app.post('/api/orders/buy', async (request, reply) => {
    const body = parseBody(buyOrderBodySchema, request.body);
    const userId = await resolveRequestUserId({
      db: options.db,
      authorization: request.headers.authorization,
      fallbackUserId: body.userId,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: now(),
    });
    const order = await createBuyUsdtOrderInDb(options.db, {
      publicId: publicIdFactory(),
      userId,
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
    const userId = await resolveRequestUserId({
      db: options.db,
      authorization: request.headers.authorization,
      fallbackUserId: body.userId,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: now(),
    });
    const order = await createSellUsdtOrderInDb(options.db, {
      publicId: publicIdFactory(),
      userId,
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

    if (isTelegramAuthError(error)) {
      return reply.code(401).send({
        error: 'telegram_auth_invalid',
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

async function resolveRequestUserId(input: {
  db: TelegramUserDb;
  authorization: string | undefined;
  fallbackUserId: string | undefined;
  botToken: string | undefined;
  maxAgeSeconds: number | undefined;
  now: Date;
}): Promise<string> {
  if (!input.botToken) {
    if (!input.fallbackUserId) {
      throw new Error('userId is required');
    }
    return input.fallbackUserId;
  }

  const validated = validateTelegramInitData({
    initData: readTelegramInitDataAuthorization(input.authorization),
    botToken: input.botToken,
    now: input.now,
    maxAgeSeconds: input.maxAgeSeconds,
  });
  const resolved = await resolveTelegramUserInDb({
    db: input.db,
    telegramUser: validated.user,
  });

  return resolved.userId;
}

function readTelegramInitDataAuthorization(authorization: string | undefined): string {
  if (!authorization) {
    throw new Error('Telegram initData authorization is required');
  }

  const [scheme, ...rest] = authorization.split(' ');
  if (scheme !== 'tma' || rest.length === 0) {
    throw new Error('Telegram initData authorization must use tma scheme');
  }

  return rest.join(' ');
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

  return DOMAIN_VALIDATION_PATTERNS.some((pattern) => pattern.test(error.message));
}

function isTelegramAuthError(error: unknown): error is Error {
  return error instanceof Error && TELEGRAM_AUTH_ERROR_MESSAGES.has(error.message);
}

function createPublicId(): string {
  return `E${randomBytes(6).toString('hex').toUpperCase()}`;
}
