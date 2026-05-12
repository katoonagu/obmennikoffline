import {
  orderResponseSchema,
  ordersResponseSchema,
  profileResponseSchema,
  ratesResponseSchema,
  validateApiResponse,
} from '../api/responseSchemas.js';
import {
  buyOrderBodySchema,
  publicRouteContracts,
  sellOrderBodySchema,
} from '../api/routeContracts.js';
import type { OrderDto, UserProfileDto } from '../orders/orderReadService.js';
import {
  createUsdtRubOrderQuote,
  type UsdtRubRates,
} from '../rates/rateQuoteService.js';

export interface MiniAppCustomerInput {
  lastName: string;
  firstName: string;
  middleName: string;
}

export interface MiniAppBuyOrderInput {
  customer: MiniAppCustomerInput;
  amountRub: string;
  clientPayoutAddress: string;
  rateTtlMinutes?: number;
  orderTtlMinutes?: number;
}

export interface MiniAppSellOrderInput {
  customer: MiniAppCustomerInput;
  amountUsdt: string;
  rateTtlMinutes?: number;
  orderTtlMinutes?: number;
}

export interface MiniAppApi {
  loadRates(): Promise<UsdtRubRates>;
  listActiveOrders(input?: { limit?: number }): Promise<OrderDto[]>;
  listHistoryOrders(input?: { limit?: number }): Promise<OrderDto[]>;
  getOrder(publicId: string): Promise<OrderDto>;
  getProfile(): Promise<UserProfileDto>;
  createBuyOrder(input: MiniAppBuyOrderInput): Promise<OrderDto>;
  createSellOrder(input: MiniAppSellOrderInput): Promise<OrderDto>;
}

export interface MiniAppApiClientOptions {
  baseUrl?: string;
  devUserId?: string;
  telegramInitData?: string;
  fetch?: MiniAppFetch;
}

export type MiniAppFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class MiniAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

const routes = {
  rates: findPublicPath('GET', '/api/rates/usdt-rub'),
  activeOrders: findPublicPath('GET', '/api/orders/active'),
  historyOrders: findPublicPath('GET', '/api/orders/history'),
  orderDetail: findPublicPath('GET', '/api/orders/:publicId'),
  profile: findPublicPath('GET', '/api/profile'),
  buyOrder: findPublicPath('POST', '/api/orders/buy'),
  sellOrder: findPublicPath('POST', '/api/orders/sell'),
} as const;

const MOCK_NOW = new Date('2026-05-11T11:05:00.000Z');
const MOCK_DEPOSIT_ADDRESS = 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY';
const MOCK_PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';
const MOCK_DEPOSIT_ADDRESS_POOL = [
  'TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6',
  'TPjjvMwjPoDC32V2dGDYTkLH4E5LAtBZ6C',
  'TB7mhtkvfhsRBRhe5FuRa4tFXSEyGDe4eA',
  'TEb822rMZ5QkYReuqdqK61zkheaan97PZZ',
  'TYc2iBENTQ7kwx5jbjW3JDqugR7kogQZn3',
  'TNWtoufpsNepTJdNzbcimHrPEUSHLDCJE1',
] as const;
const MOCK_CUSTOMER = {
  lastName: 'Ivanov',
  firstName: 'Ivan',
  middleName: 'Ivanovich',
};

export const miniAppMockFixtures = {
  rates: {
    buyRate: '76.850000',
    sellRate: '76.250000',
  },
  sellOrder: createMockOrder({
    publicId: 'E00001',
    direction: 'SELL_USDT',
    customer: MOCK_CUSTOMER,
    amountUsdt: '5000.000000',
    amountRub: '381250.00',
    rateSnapshot: '76.250000',
    status: 'awaiting_deposit',
    depositAddress: MOCK_DEPOSIT_ADDRESS,
    clientPayoutAddress: null,
    createdAt: MOCK_NOW,
  }),
  buyOrder: createMockOrder({
    publicId: 'E97010',
    direction: 'BUY_USDT',
    customer: MOCK_CUSTOMER,
    amountUsdt: '2602.472348',
    amountRub: '200000.00',
    rateSnapshot: '76.850000',
    status: 'awaiting_office_visit',
    depositAddress: null,
    clientPayoutAddress: MOCK_PAYOUT_ADDRESS,
    createdAt: MOCK_NOW,
  }),
  profile: {
    userId: 'telegram-user-1',
    customer: MOCK_CUSTOMER,
    telegram: {
      telegramUserId: '462656683',
      username: 'pavel',
      firstName: 'Pavel',
      lastName: null,
    },
    stats: {
      totalOrders: 24,
      activeOrders: 1,
    },
  } satisfies UserProfileDto,
} as const;

export function createMiniAppApiClient(
  options: MiniAppApiClientOptions = {},
): MiniAppApi {
  const request = options.fetch ?? globalThis.fetch;

  if (!request) {
    throw new Error('fetch is required to create Mini App API client');
  }

  return {
    async loadRates() {
      const response = await request(buildUrl(options, routes.rates), {
        method: 'GET',
        headers: buildHeaders(options),
      });
      return parseJsonResponse(response, ratesResponseSchema).then((payload) => ({
        buyRate: payload.rates.buyRate,
        sellRate: payload.rates.sellRate,
      }));
    },

    async listActiveOrders(input = {}) {
      const response = await request(buildUrl(options, routes.activeOrders, {
        userId: options.telegramInitData ? undefined : options.devUserId,
        limit: input.limit?.toString(),
      }), {
        method: 'GET',
        headers: buildHeaders(options),
      });
      return parseJsonResponse(response, ordersResponseSchema).then((payload) => payload.orders);
    },

    async listHistoryOrders(input = {}) {
      const response = await request(buildUrl(options, routes.historyOrders, {
        userId: options.telegramInitData ? undefined : options.devUserId,
        limit: input.limit?.toString(),
      }), {
        method: 'GET',
        headers: buildHeaders(options),
      });
      return parseJsonResponse(response, ordersResponseSchema).then((payload) => payload.orders);
    },

    async getOrder(publicId) {
      const response = await request(buildUrl(
        options,
        routes.orderDetail.replace(':publicId', encodeURIComponent(publicId)),
        {
          userId: options.telegramInitData ? undefined : options.devUserId,
        },
      ), {
        method: 'GET',
        headers: buildHeaders(options),
      });
      return parseJsonResponse(response, orderResponseSchema).then((payload) => payload.order);
    },

    async getProfile() {
      const response = await request(buildUrl(options, routes.profile, {
        userId: options.telegramInitData ? undefined : options.devUserId,
      }), {
        method: 'GET',
        headers: buildHeaders(options),
      });
      return parseJsonResponse(response, profileResponseSchema).then((payload) => payload.profile);
    },

    async createBuyOrder(input) {
      const body = buyOrderBodySchema.parse({
        ...toCustomerPayload(input.customer),
        amountRub: input.amountRub,
        clientPayoutAddress: input.clientPayoutAddress,
        rateTtlMinutes: input.rateTtlMinutes,
        orderTtlMinutes: input.orderTtlMinutes,
        userId: options.telegramInitData ? undefined : options.devUserId,
      });
      const response = await request(buildUrl(options, routes.buyOrder), {
        method: 'POST',
        headers: {
          ...buildHeaders(options),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return parseJsonResponse(response, orderResponseSchema).then((payload) => payload.order);
    },

    async createSellOrder(input) {
      const body = sellOrderBodySchema.parse({
        ...toCustomerPayload(input.customer),
        amountUsdt: input.amountUsdt,
        rateTtlMinutes: input.rateTtlMinutes,
        orderTtlMinutes: input.orderTtlMinutes,
        userId: options.telegramInitData ? undefined : options.devUserId,
      });
      const response = await request(buildUrl(options, routes.sellOrder), {
        method: 'POST',
        headers: {
          ...buildHeaders(options),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return parseJsonResponse(response, orderResponseSchema).then((payload) => payload.order);
    },
  };
}

export function createMockMiniAppApi(): MiniAppApi {
  const orders: OrderDto[] = [];
  const historyOrders: OrderDto[] = [];
  let nextSellOrderNumber = 1;
  let nextBuyOrderNumber = 97010;
  let nextDepositAddressIndex = 0;
  let profileCustomer: UserProfileDto['customer'] = null;

  return {
    async loadRates() {
      const payload = validateApiResponse(ratesResponseSchema, {
        rates: {
          pair: 'USDT_RUB',
          ...miniAppMockFixtures.rates,
        },
      });

      return {
        buyRate: payload.rates.buyRate,
        sellRate: payload.rates.sellRate,
      };
    },

    async listActiveOrders() {
      return validateApiResponse(ordersResponseSchema, { orders }).orders;
    },

    async listHistoryOrders() {
      return validateApiResponse(ordersResponseSchema, { orders: historyOrders }).orders;
    },

    async getOrder(publicId) {
      const order = [...orders, ...historyOrders].find((candidate) => candidate.publicId === publicId);
      if (!order) {
        throw new MiniAppApiError('order not found', 404, {
          error: 'not_found',
          message: 'order not found',
        });
      }
      return validateApiResponse(orderResponseSchema, { order }).order;
    },

    async getProfile() {
      return validateApiResponse(profileResponseSchema, {
        profile: {
          ...miniAppMockFixtures.profile,
          customer: profileCustomer,
          stats: {
            ...miniAppMockFixtures.profile.stats,
            totalOrders: orders.length,
            activeOrders: orders.length,
          },
        },
      }).profile;
    },

    async createBuyOrder(input) {
      const body = buyOrderBodySchema.parse({
        ...toCustomerPayload(input.customer),
        amountRub: input.amountRub,
        clientPayoutAddress: input.clientPayoutAddress,
        rateTtlMinutes: input.rateTtlMinutes,
        orderTtlMinutes: input.orderTtlMinutes,
        userId: 'mock-user-1',
      });
      const quote = createUsdtRubOrderQuote({
        direction: 'BUY_USDT',
        amountRub: body.amountRub,
        rates: miniAppMockFixtures.rates,
      });
      const order = createMockOrder({
        publicId: formatMockOrderId(nextBuyOrderNumber++),
        direction: 'BUY_USDT',
        customer: input.customer,
        amountUsdt: quote.amountUsdt,
        amountRub: quote.amountRub,
        rateSnapshot: quote.rateSnapshot,
        status: 'awaiting_office_visit',
        depositAddress: null,
        clientPayoutAddress: body.clientPayoutAddress,
        createdAt: MOCK_NOW,
      });
      profileCustomer = input.customer;
      orders.unshift(order);
      return validateApiResponse(orderResponseSchema, { order }).order;
    },

    async createSellOrder(input) {
      const body = sellOrderBodySchema.parse({
        ...toCustomerPayload(input.customer),
        amountUsdt: input.amountUsdt,
        rateTtlMinutes: input.rateTtlMinutes,
        orderTtlMinutes: input.orderTtlMinutes,
        userId: 'mock-user-1',
      });
      const quote = createUsdtRubOrderQuote({
        direction: 'SELL_USDT',
        amountUsdt: body.amountUsdt,
        rates: miniAppMockFixtures.rates,
      });
      const order = createMockOrder({
        publicId: formatMockOrderId(nextSellOrderNumber++),
        direction: 'SELL_USDT',
        customer: input.customer,
        amountUsdt: quote.amountUsdt,
        amountRub: quote.amountRub,
        rateSnapshot: quote.rateSnapshot,
        status: 'awaiting_deposit',
        depositAddress: getNextMockDepositAddress(nextDepositAddressIndex++),
        clientPayoutAddress: null,
        createdAt: MOCK_NOW,
      });
      profileCustomer = input.customer;
      orders.unshift(order);
      return validateApiResponse(orderResponseSchema, { order }).order;
    },
  };
}

function getNextMockDepositAddress(index: number): string {
  return MOCK_DEPOSIT_ADDRESS_POOL[index % MOCK_DEPOSIT_ADDRESS_POOL.length];
}

function formatMockOrderId(value: number): string {
  return `E${value.toString().padStart(5, '0')}`;
}

function findPublicPath(method: 'GET' | 'POST', path: string): string {
  const contract = publicRouteContracts.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );

  if (!contract) {
    throw new Error(`missing public route contract: ${method} ${path}`);
  }

  return contract.path;
}

function buildHeaders(options: MiniAppApiClientOptions): Record<string, string> {
  return options.telegramInitData
    ? {
        authorization: `tma ${options.telegramInitData}`,
      }
    : {};
}

function buildUrl(
  options: MiniAppApiClientOptions,
  path: string,
  query: Record<string, string | undefined> = {},
): string {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }

  return `${baseUrl}${path}${search.size ? `?${search.toString()}` : ''}`;
}

function toCustomerPayload(customer: MiniAppCustomerInput) {
  return {
    customerLastName: customer.lastName,
    customerFirstName: customer.firstName,
    customerMiddleName: customer.middleName,
  };
}

async function parseJsonResponse<T>(
  response: Response,
  schema: Parameters<typeof validateApiResponse<T>>[0],
): Promise<T> {
  const payload = await response.json();

  if (!response.ok) {
    throw new MiniAppApiError(
      getMiniAppApiErrorMessage(payload),
      response.status,
      payload,
    );
  }

  return validateApiResponse(schema, payload);
}

function getMiniAppApiErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return 'Mini App API request failed';
  }

  if (payload.error === 'address_pool_unavailable') {
    return 'Нет свободных TRC-20 адресов. Попробуйте позже или напишите в поддержку.';
  }

  if (
    payload.error === 'telegram_auth_invalid' ||
    payload.error === 'telegram_init_data_invalid'
  ) {
    return 'Авторизация Telegram устарела. Откройте приложение заново из Telegram.';
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  if (Array.isArray(payload.issues)) {
    const firstIssue = payload.issues.find(isRecord);
    if (firstIssue && typeof firstIssue.message === 'string' && firstIssue.message.trim()) {
      return firstIssue.message.trim();
    }
  }

  return 'Mini App API request failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createMockOrder(input: {
  publicId: string;
  direction: OrderDto['direction'];
  customer: MiniAppCustomerInput;
  amountUsdt: string | null;
  amountRub: string | null;
  rateSnapshot: string;
  status: OrderDto['status'];
  depositAddress: string | null;
  clientPayoutAddress: string | null;
  createdAt: Date;
}): OrderDto {
  const rateExpiresAt = new Date(input.createdAt);
  rateExpiresAt.setMinutes(rateExpiresAt.getMinutes() + 20);
  const orderExpiresAt = new Date(input.createdAt);
  orderExpiresAt.setMinutes(orderExpiresAt.getMinutes() + 60);

  const order: OrderDto = {
    publicId: input.publicId,
    direction: input.direction,
    asset: 'USDT',
    network: 'TRON',
    customer: input.customer,
    amountUsdt: input.amountUsdt,
    amountRub: input.amountRub,
    rateSnapshot: input.rateSnapshot,
    rateExpiresAt: rateExpiresAt.toISOString(),
    orderExpiresAt: orderExpiresAt.toISOString(),
    status: input.status,
    depositAddress: input.depositAddress,
    clientPayoutAddress: input.clientPayoutAddress,
    cryptoPayout: null,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.createdAt.toISOString(),
    completedAt: null,
  };

  return validateApiResponse(orderResponseSchema, { order }).order;
}
