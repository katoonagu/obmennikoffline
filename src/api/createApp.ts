import { randomBytes, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import {
  authenticateAdminInDb,
  requireActiveAdminSessionInDb,
  type AdminAuthDb,
} from '../admin/adminAuthService.js';
import {
  isStrongAdminSessionSecret,
  verifyAdminSession,
} from '../admin/adminSession.js';
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
  recordManualCryptoPayoutInDb,
  setManagerOrderStatusInDb,
  type OrderManagerDb,
} from '../orders/orderManagerService.js';
import {
  getAnyOrderByPublicId,
  getOrderByPublicId,
  getUserProfile,
  listAllActiveOrders,
  listActiveOrders,
  listHistoryOrders,
  type OrderReadDb,
} from '../orders/orderReadService.js';
import {
  type ValidatedTelegramInitData,
  validateTelegramInitData,
} from '../telegram/validateInitData.js';
import {
  resolveTelegramUserInDb,
  type TelegramUserDb,
} from '../users/telegramUserService.js';
import {
  createUsdtRubOrderQuote,
  normalizeUsdtRubRates,
  type UsdtRubRateProvider,
} from '../rates/rateQuoteService.js';
import {
  isValidAdminActorId,
  readAdminActorIdHeader,
} from './adminActorId.js';
import {
  addressPoolImportResponseSchema,
  adminSessionResponseSchema,
  orderResponseSchema,
  ordersResponseSchema,
  profileResponseSchema,
  ratesResponseSchema,
  telegramInitDataValidationResponseSchema,
  validateApiResponse,
} from './responseSchemas.js';
import {
  addressPoolImportBodySchema,
  adminOrderListQuerySchema,
  adminSessionBodySchema,
  buyOrderBodySchema,
  emptyQuerySchema,
  healthResponseSchema,
  managerStatusBodySchema,
  manualCryptoPayoutBodySchema,
  orderListQuerySchema,
  orderParamsSchema,
  sellOrderBodySchema,
  telegramInitDataBodySchema,
  userQuerySchema,
} from './routeContracts.js';

export type ApiDb<TOrder> = AddressPoolImportDb &
  AdminAuthDb &
  OrderApplicationDb<TOrder> &
  OrderManagerDb<TOrder> &
  OrderReadDb &
  TelegramUserDb;

export interface CreateApiAppOptions<TOrder> {
  db: ApiDb<TOrder>;
  enableAdminRoutes?: boolean;
  adminApiToken?: string;
  adminActorIds?: readonly string[];
  adminSessionSecret?: string;
  telegramBotToken?: string;
  telegramInitDataMaxAgeSeconds?: number;
  rateProvider?: UsdtRubRateProvider;
  now?: () => Date;
  publicIdFactory?: () => string;
}

const DEFAULT_RATE_TTL_MINUTES = 20;
const DEFAULT_ORDER_TTL_MINUTES = 60;
const ADMIN_LOGIN_MAX_FAILED_ATTEMPTS = 5;
const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const DOMAIN_VALIDATION_PATTERNS = [
  /^(actorId|publicId|txId|userId) is required$/,
  /^limit must be a positive integer up to 100$/,
  /^rateProvider is required to create orders$/,
  /^depositAddressId is required for SELL_USDT order$/,
  /^clientPayoutAddress is required for manual crypto payout$/,
  /^(clientPayoutAddress|address) must be a valid TRON base58 address$/,
  /^txId must be a 64-character hex TRON transaction id$/,
  /^target status is not manager-settable$/,
  /^manual crypto payout can only be recorded for BUY_USDT orders$/,
  /^order is not open for manual crypto payout$/,
  /^order is no longer open for manual crypto payout$/,
  /^BUY_USDT completion requires manual crypto payout tx id$/,
  /^amountRub is required for BUY_USDT quote$/,
  /^amountUsdt is required for SELL_USDT quote$/,
  /^customer(LastName|FirstName|MiddleName) is required$/,
  /^comment (is required|must be at most 500 characters)$/,
  /^(amountUsdt|amountRub|rateSnapshot|buyRate|sellRate) must be a positive decimal string$/,
  /^(amountUsdt|amountRub|rateSnapshot|buyRate|sellRate) must fit Decimal\(36, (2|6)\)$/,
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

const ADMIN_AUTH_ERROR_MESSAGES = new Set([
  'admin authorization is required',
  'admin authorization must use Bearer scheme',
  'admin authorization token is invalid',
  'admin actor id is required',
  'admin actor id is invalid',
  'admin actor id is not allowed',
  'admin credentials are invalid',
  'admin session is invalid',
  'admin session actor id is invalid',
]);

export function createApiApp<TOrder>(
  options: CreateApiAppOptions<TOrder>,
): FastifyInstance {
  if (options.enableAdminRoutes === true && !options.adminApiToken) {
    throw new Error('adminApiToken is required when admin routes are enabled');
  }

  if (
    options.enableAdminRoutes === true &&
    options.adminApiToken !== undefined &&
    /\s/.test(options.adminApiToken)
  ) {
    throw new Error('adminApiToken must not contain whitespace');
  }

  if (
    options.enableAdminRoutes === true &&
    options.adminSessionSecret !== undefined &&
    !isStrongAdminSessionSecret(options.adminSessionSecret)
  ) {
    throw new Error('adminSessionSecret must be at least 32 characters and contain no whitespace');
  }

  if (options.telegramBotToken !== undefined) {
    if (!options.telegramBotToken.trim()) {
      throw new Error('telegramBotToken must be non-empty when provided');
    }

    if (/\s/.test(options.telegramBotToken)) {
      throw new Error('telegramBotToken must not contain whitespace');
    }
  }

  if (
    options.telegramInitDataMaxAgeSeconds !== undefined &&
    (
      !Number.isSafeInteger(options.telegramInitDataMaxAgeSeconds) ||
      options.telegramInitDataMaxAgeSeconds <= 0
    )
  ) {
    throw new Error('telegramInitDataMaxAgeSeconds must be a positive safe integer');
  }

  const app = Fastify({ logger: false });
  const now = options.now ?? (() => new Date());
  const publicIdFactory = options.publicIdFactory ?? createPublicId;
  const adminActorIds = createAdminActorIdAllowlist(options.adminActorIds);
  const adminLoginFailures = new Map<string, AdminLoginFailureState>();

  app.get('/health', async (request, reply) => {
    parseBody(emptyQuerySchema, request.query);

    return reply.send(validateApiResponse(healthResponseSchema, { status: 'ok' }));
  });

  app.get('/api/rates/usdt-rub', async (request, reply) => {
    parseBody(emptyQuerySchema, request.query);

    const rates = normalizeUsdtRubRates(
      await getUsdtRubRates({
        provider: options.rateProvider,
        now: now(),
      }),
    );

    return reply.send(validateApiResponse(ratesResponseSchema, {
      rates: {
        pair: 'USDT_RUB',
        ...rates,
      },
    }));
  });

  if (options.enableAdminRoutes === true) {
    if (options.adminSessionSecret) {
      app.post('/api/admin/session', async (request, reply) => {
        parseBody(emptyQuerySchema, request.query);
        const requestNow = now();
        const body = parseBody(adminSessionBodySchema, request.body);
        assertAdminLoginNotRateLimited(adminLoginFailures, body.username, requestNow);

        let result;
        try {
          result = await authenticateAdminInDb({
            db: options.db,
            username: body.username,
            password: body.password,
            sessionSecret: options.adminSessionSecret!,
            now: requestNow,
          });
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            error.message === 'admin credentials are invalid'
          ) {
            recordAdminLoginFailure(adminLoginFailures, body.username, requestNow);
          }
          throw error;
        }
        resetAdminLoginFailures(adminLoginFailures, body.username);

        return reply.send(validateApiResponse(adminSessionResponseSchema, result));
      });
    }

    app.post('/api/address-pool/import', async (request, reply) => {
      const requestNow = now();
      const adminAuthorization = await resolveAdminAuthorization({
        db: options.db,
        authorization: request.headers.authorization,
        apiToken: options.adminApiToken!,
        sessionSecret: options.adminSessionSecret,
        now: requestNow,
      });
      const actorId = resolveAdminActorId(
        adminAuthorization,
        request.headers['x-admin-actor-id'],
        adminActorIds,
      );
      parseBody(emptyQuerySchema, request.query);
      const body = parseBody(addressPoolImportBodySchema, request.body);
      const result = await importAddressPoolToDb({
        db: options.db,
        rows: body.rows,
        actorId,
        now: requestNow,
      });

      return reply
        .code(201)
        .send(validateApiResponse(addressPoolImportResponseSchema, result));
    });

    app.get('/api/admin/orders/active', async (request, reply) => {
      const adminAuthorization = await resolveAdminAuthorization({
        db: options.db,
        authorization: request.headers.authorization,
        apiToken: options.adminApiToken!,
        sessionSecret: options.adminSessionSecret,
        now: now(),
      });
      resolveAdminActorId(
        adminAuthorization,
        request.headers['x-admin-actor-id'],
        adminActorIds,
      );
      const query = parseBody(adminOrderListQuerySchema, request.query);
      const orders = await listAllActiveOrders(options.db, {
        limit: query.limit,
      });

      return reply.send(validateApiResponse(ordersResponseSchema, { orders }));
    });

    app.post('/api/admin/orders/:publicId/status', async (request, reply) => {
      const requestNow = now();
      const adminAuthorization = await resolveAdminAuthorization({
        db: options.db,
        authorization: request.headers.authorization,
        apiToken: options.adminApiToken!,
        sessionSecret: options.adminSessionSecret,
        now: requestNow,
      });
      const actorId = resolveAdminActorId(
        adminAuthorization,
        request.headers['x-admin-actor-id'],
        adminActorIds,
      );
      const params = parseBody(orderParamsSchema, request.params);
      parseBody(emptyQuerySchema, request.query);
      const body = parseBody(managerStatusBodySchema, request.body);
      await setManagerOrderStatusInDb(options.db, {
        publicId: params.publicId,
        actorId,
        status: body.status,
        comment: body.comment,
        now: requestNow,
      });
      const order = await readManagerOrderDto(options.db, {
        publicId: params.publicId,
      });

      return reply.send(validateApiResponse(orderResponseSchema, { order }));
    });

    app.post('/api/admin/orders/:publicId/manual-crypto-payout', async (request, reply) => {
      const requestNow = now();
      const adminAuthorization = await resolveAdminAuthorization({
        db: options.db,
        authorization: request.headers.authorization,
        apiToken: options.adminApiToken!,
        sessionSecret: options.adminSessionSecret,
        now: requestNow,
      });
      const actorId = resolveAdminActorId(
        adminAuthorization,
        request.headers['x-admin-actor-id'],
        adminActorIds,
      );
      const params = parseBody(orderParamsSchema, request.params);
      parseBody(emptyQuerySchema, request.query);
      const body = parseBody(manualCryptoPayoutBodySchema, request.body);
      await recordManualCryptoPayoutInDb(options.db, {
        publicId: params.publicId,
        actorId,
        txId: body.txId,
        comment: body.comment,
        now: requestNow,
      });
      const order = await readManagerOrderDto(options.db, {
        publicId: params.publicId,
      });

      return reply.send(validateApiResponse(orderResponseSchema, { order }));
    });
  }

  if (options.telegramBotToken) {
    app.post('/api/telegram/validate-init-data', async (request, reply) => {
      parseBody(emptyQuerySchema, request.query);
      const body = parseBody(telegramInitDataBodySchema, request.body);
      const validated = validateTelegramInitData({
        initData: body.initData,
        botToken: options.telegramBotToken!,
        now: now(),
        maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      });

      return reply.send(validateApiResponse(telegramInitDataValidationResponseSchema, {
        authDate: validated.authDate.toISOString(),
        queryId: validated.queryId,
        user: validated.user,
      }));
    });
  }

  app.get('/api/orders/active', async (request, reply) => {
    const requestNow = now();
    const telegramInitData = validateTelegramAuthorization({
      authorization: request.headers.authorization,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: requestNow,
    });
    const query = parseBody(orderListQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      fallbackUserId: query.userId,
      telegramInitData,
    });
    const orders = await listActiveOrders(options.db, {
      userId,
      limit: query.limit,
    });

    return reply.send(validateApiResponse(ordersResponseSchema, { orders }));
  });

  app.get('/api/orders/history', async (request, reply) => {
    const requestNow = now();
    const telegramInitData = validateTelegramAuthorization({
      authorization: request.headers.authorization,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: requestNow,
    });
    const query = parseBody(orderListQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      fallbackUserId: query.userId,
      telegramInitData,
    });
    const orders = await listHistoryOrders(options.db, {
      userId,
      limit: query.limit,
    });

    return reply.send(validateApiResponse(ordersResponseSchema, { orders }));
  });

  app.get('/api/orders/:publicId', async (request, reply) => {
    const requestNow = now();
    const telegramInitData = validateTelegramAuthorization({
      authorization: request.headers.authorization,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: requestNow,
    });
    const params = parseBody(orderParamsSchema, request.params);
    const query = parseBody(userQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      fallbackUserId: query.userId,
      telegramInitData,
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

    return reply.send(validateApiResponse(orderResponseSchema, { order }));
  });

  app.get('/api/profile', async (request, reply) => {
    const requestNow = now();
    const telegramInitData = validateTelegramAuthorization({
      authorization: request.headers.authorization,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: requestNow,
    });
    const query = parseBody(userQuerySchema, request.query);
    const userId = await resolveRequestUserId({
      db: options.db,
      fallbackUserId: query.userId,
      telegramInitData,
    });
    const profile = await getUserProfile(options.db, { userId });

    return reply.send(validateApiResponse(profileResponseSchema, { profile }));
  });

  app.post('/api/orders/buy', async (request, reply) => {
    const requestNow = now();
    const telegramInitData = validateTelegramAuthorization({
      authorization: request.headers.authorization,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: requestNow,
    });
    parseBody(emptyQuerySchema, request.query);
    const body = parseBody(buyOrderBodySchema, request.body);
    const userId = await resolveRequestUserId({
      db: options.db,
      fallbackUserId: body.userId,
      telegramInitData,
    });
    const quote = createUsdtRubOrderQuote({
      direction: 'BUY_USDT',
      amountRub: body.amountRub,
      rates: await getUsdtRubRates({
        provider: options.rateProvider,
        now: requestNow,
      }),
    });
    const publicId = publicIdFactory();
    await createBuyUsdtOrderInDb(options.db, {
      publicId,
      userId,
      customerLastName: body.customerLastName,
      customerFirstName: body.customerFirstName,
      customerMiddleName: body.customerMiddleName,
      amountUsdt: quote.amountUsdt,
      amountRub: quote.amountRub,
      rateSnapshot: quote.rateSnapshot,
      clientPayoutAddress: body.clientPayoutAddress,
      now: requestNow,
      rateTtlMinutes: body.rateTtlMinutes ?? DEFAULT_RATE_TTL_MINUTES,
      orderTtlMinutes: body.orderTtlMinutes ?? DEFAULT_ORDER_TTL_MINUTES,
    });
    const order = await readCreatedOrderDto(options.db, { userId, publicId });

    return reply.code(201).send(validateApiResponse(orderResponseSchema, { order }));
  });

  app.post('/api/orders/sell', async (request, reply) => {
    const requestNow = now();
    const telegramInitData = validateTelegramAuthorization({
      authorization: request.headers.authorization,
      botToken: options.telegramBotToken,
      maxAgeSeconds: options.telegramInitDataMaxAgeSeconds,
      now: requestNow,
    });
    parseBody(emptyQuerySchema, request.query);
    const body = parseBody(sellOrderBodySchema, request.body);
    const userId = await resolveRequestUserId({
      db: options.db,
      fallbackUserId: body.userId,
      telegramInitData,
    });
    const quote = createUsdtRubOrderQuote({
      direction: 'SELL_USDT',
      amountUsdt: body.amountUsdt,
      rates: await getUsdtRubRates({
        provider: options.rateProvider,
        now: requestNow,
      }),
    });
    const publicId = publicIdFactory();
    await createSellUsdtOrderInDb(options.db, {
      publicId,
      userId,
      customerLastName: body.customerLastName,
      customerFirstName: body.customerFirstName,
      customerMiddleName: body.customerMiddleName,
      amountUsdt: quote.amountUsdt,
      amountRub: quote.amountRub,
      rateSnapshot: quote.rateSnapshot,
      now: requestNow,
      rateTtlMinutes: body.rateTtlMinutes ?? DEFAULT_RATE_TTL_MINUTES,
      orderTtlMinutes: body.orderTtlMinutes ?? DEFAULT_ORDER_TTL_MINUTES,
    });
    const order = await readCreatedOrderDto(options.db, { userId, publicId });

    return reply.code(201).send(validateApiResponse(orderResponseSchema, { order }));
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

    if (isAdminAuthError(error)) {
      return reply.code(401).send({
        error: 'admin_auth_invalid',
        message: error.message,
      });
    }

    if (isAdminLoginRateLimitError(error)) {
      return reply.code(429).send({
        error: 'admin_login_rate_limited',
        message: error.message,
      });
    }

    if (isNotFoundError(error)) {
      return reply.code(404).send({
        error: 'not_found',
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

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

interface AdminLoginFailureState {
  count: number;
  firstFailedAtMs: number;
}

function assertAdminLoginNotRateLimited(
  failures: Map<string, AdminLoginFailureState>,
  username: string,
  now: Date,
): void {
  const key = normalizeAdminLoginRateLimitKey(username);
  const state = failures.get(key);
  if (!state) {
    return;
  }

  if (now.getTime() - state.firstFailedAtMs >= ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS) {
    failures.delete(key);
    return;
  }

  if (state.count >= ADMIN_LOGIN_MAX_FAILED_ATTEMPTS) {
    throw new Error('admin login is rate limited');
  }
}

function recordAdminLoginFailure(
  failures: Map<string, AdminLoginFailureState>,
  username: string,
  now: Date,
): void {
  const key = normalizeAdminLoginRateLimitKey(username);
  const state = failures.get(key);
  if (!state || now.getTime() - state.firstFailedAtMs >= ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS) {
    failures.set(key, {
      count: 1,
      firstFailedAtMs: now.getTime(),
    });
    return;
  }

  failures.set(key, {
    count: state.count + 1,
    firstFailedAtMs: state.firstFailedAtMs,
  });
}

function resetAdminLoginFailures(
  failures: Map<string, AdminLoginFailureState>,
  username: string,
): void {
  failures.delete(normalizeAdminLoginRateLimitKey(username));
}

function normalizeAdminLoginRateLimitKey(username: string): string {
  return username.trim().toLowerCase();
}

async function getUsdtRubRates(input: {
  provider: UsdtRubRateProvider | undefined;
  now: Date;
}) {
  if (!input.provider) {
    throw new Error('rateProvider is required to create orders');
  }

  return input.provider.getUsdtRubRates({ now: input.now });
}

async function readCreatedOrderDto(
  db: OrderReadDb,
  input: {
    userId: string;
    publicId: string;
  },
) {
  const order = await getOrderByPublicId(db, input);

  if (!order) {
    throw new Error('created order was not readable');
  }

  return order;
}

async function readManagerOrderDto(
  db: OrderReadDb,
  input: {
    publicId: string;
  },
) {
  const order = await getAnyOrderByPublicId(db, input);

  if (!order) {
    throw new Error('order not found');
  }

  return order;
}

interface ResolvedAdminAuthorization {
  actorId: string | undefined;
}

async function resolveAdminAuthorization(input: {
  db: AdminAuthDb;
  authorization: string | undefined;
  apiToken: string;
  sessionSecret: string | undefined;
  now: Date;
}): Promise<ResolvedAdminAuthorization> {
  if (!input.authorization) {
    throw new Error('admin authorization is required');
  }

  const [scheme, ...rest] = input.authorization.split(' ');
  if (scheme !== 'Bearer' || rest.length === 0) {
    throw new Error('admin authorization must use Bearer scheme');
  }

  const token = rest.join(' ');
  if (safeStringEqual(token, input.apiToken)) {
    return {
      actorId: undefined,
    };
  }

  if (input.sessionSecret) {
    const session = verifyAdminSession({
      token,
      secret: input.sessionSecret,
      now: input.now,
    });
    if (session) {
      const adminUser = await requireActiveAdminSessionInDb({
        db: input.db,
        adminId: session.adminId,
        username: session.username,
        role: session.role,
      });

      if (!isValidAdminActorId(adminUser.username)) {
        throw new Error('admin session actor id is invalid');
      }

      return {
        actorId: adminUser.username,
      };
    }
  }

  throw new Error('admin authorization token is invalid');
}

function resolveAdminActorId(
  authorization: ResolvedAdminAuthorization,
  headerValue: string | string[] | undefined,
  allowlist: ReadonlySet<string> | undefined,
): string {
  return authorization.actorId ?? readAdminActorIdHeader(headerValue, allowlist);
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createAdminActorIdAllowlist(
  actorIds: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (!actorIds) {
    return undefined;
  }

  if (actorIds.length === 0) {
    throw new Error('ADMIN_ACTOR_IDS must contain at least one actor id');
  }

  const normalized = actorIds.map((actorId) => actorId.trim());

  if (normalized.some((actorId) => !actorId)) {
    throw new Error('ADMIN_ACTOR_IDS must not contain empty entries');
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new Error('ADMIN_ACTOR_IDS must not contain duplicate values');
  }

  if (normalized.some((actorId) => !isValidAdminActorId(actorId))) {
    throw new Error('ADMIN_ACTOR_IDS contains an invalid actor id');
  }

  return new Set(normalized);
}

async function resolveRequestUserId(input: {
  db: TelegramUserDb;
  fallbackUserId: string | undefined;
  telegramInitData: ValidatedTelegramInitData | undefined;
}): Promise<string> {
  if (!input.telegramInitData) {
    if (!input.fallbackUserId) {
      throw new Error('userId is required');
    }
    return input.fallbackUserId;
  }

  const resolved = await resolveTelegramUserInDb({
    db: input.db,
    telegramUser: input.telegramInitData.user,
  });

  return resolved.userId;
}

function validateTelegramAuthorization(input: {
  authorization: string | undefined;
  botToken: string | undefined;
  maxAgeSeconds: number | undefined;
  now: Date;
}): ValidatedTelegramInitData | undefined {
  if (!input.botToken) {
    return undefined;
  }

  return validateTelegramInitData({
    initData: readTelegramInitDataAuthorization(input.authorization),
    botToken: input.botToken,
    now: input.now,
    maxAgeSeconds: input.maxAgeSeconds,
  });
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

function isAdminAuthError(error: unknown): error is Error {
  return error instanceof Error && ADMIN_AUTH_ERROR_MESSAGES.has(error.message);
}

function isAdminLoginRateLimitError(error: unknown): error is Error {
  return error instanceof Error && error.message === 'admin login is rate limited';
}

function isNotFoundError(error: unknown): error is Error {
  return error instanceof Error && error.message === 'order not found';
}

function createPublicId(): string {
  return `E${randomBytes(6).toString('hex').toUpperCase()}`;
}
