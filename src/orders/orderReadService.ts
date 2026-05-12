import type { Asset, Network, OrderDirection, OrderStatus } from '../domain/types.js';

export const ACTIVE_ORDER_STATUSES = [
  'awaiting_deposit',
  'awaiting_office_visit',
  'funds_detected',
  'pending_aml',
  'manager_review',
  'ready_for_cash_payout',
  'ready_for_crypto_payout',
  'late_payment',
] as const satisfies readonly OrderStatus[];

export const HISTORY_ORDER_STATUSES = [
  'completed',
  'cancelled',
  'expired',
  'rejected',
] as const satisfies readonly OrderStatus[];

export interface ReadableOrderRecord {
  publicId: string;
  direction: OrderDirection;
  asset: Asset;
  network: Network;
  customerLastName: string;
  customerFirstName: string;
  customerMiddleName: string;
  amountUsdt: unknown | null;
  amountRub: unknown | null;
  rateSnapshot: unknown;
  rateExpiresAt: Date;
  orderExpiresAt: Date;
  status: OrderStatus;
  depositAddress: {
    address: string;
  } | null;
  clientPayoutAddress: string | null;
  payoutTxId: string | null;
  payoutTxRecordedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface OrderDto {
  publicId: string;
  direction: OrderDirection;
  asset: Asset;
  network: Network;
  customer: {
    lastName: string;
    firstName: string;
    middleName: string;
  };
  amountUsdt: string | null;
  amountRub: string | null;
  rateSnapshot: string;
  rateExpiresAt: string;
  orderExpiresAt: string;
  status: OrderStatus;
  depositAddress: string | null;
  clientPayoutAddress: string | null;
  cryptoPayout: {
    txId: string;
    recordedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TelegramProfileRecord {
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface UserProfileDto {
  userId: string;
  telegram: {
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  stats: {
    totalOrders: number;
    activeOrders: number;
  };
}

export interface OrderReadDb {
  order: {
    findMany(input: OrderFindManyInput): Promise<ReadableOrderRecord[]>;
    findFirst(input: OrderFindFirstInput): Promise<ReadableOrderRecord | null>;
    count(input: OrderCountInput): Promise<number>;
  };
  telegramProfile: {
    findUnique(input: TelegramProfileFindUniqueInput): Promise<TelegramProfileRecord | null>;
  };
}

interface OrderReadWhere {
  userId?: string;
  publicId?: string;
  status?: {
    in: readonly OrderStatus[];
  };
}

interface OrderFindManyInput {
  where: OrderReadWhere;
  orderBy: {
    createdAt: 'desc';
  };
  take: number;
  select: typeof ORDER_READ_SELECT;
}

interface OrderFindFirstInput {
  where: OrderReadWhere;
  select: typeof ORDER_READ_SELECT;
}

interface OrderCountInput {
  where: OrderReadWhere;
}

interface TelegramProfileFindUniqueInput {
  where: {
    userId: string;
  };
  select: {
    telegramUserId: true;
    username: true;
    firstName: true;
    lastName: true;
  };
}

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const ORDER_READ_SELECT = {
  publicId: true,
  direction: true,
  asset: true,
  network: true,
  customerLastName: true,
  customerFirstName: true,
  customerMiddleName: true,
  amountUsdt: true,
  amountRub: true,
  rateSnapshot: true,
  rateExpiresAt: true,
  orderExpiresAt: true,
  status: true,
  depositAddress: {
    select: {
      address: true,
    },
  },
  clientPayoutAddress: true,
  payoutTxId: true,
  payoutTxRecordedAt: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
} as const;

export async function listActiveOrders(
  db: OrderReadDb,
  input: {
    userId: string;
    limit?: number;
  },
): Promise<OrderDto[]> {
  const userId = assertRequiredString(input.userId, 'userId');
  const orders = await db.order.findMany({
    where: {
      userId,
      status: {
        in: ACTIVE_ORDER_STATUSES,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: normalizeLimit(input.limit),
    select: ORDER_READ_SELECT,
  });

  return orders.map(toOrderDto);
}

export async function listAllActiveOrders(
  db: OrderReadDb,
  input: {
    limit?: number;
  },
): Promise<OrderDto[]> {
  const orders = await db.order.findMany({
    where: {
      status: {
        in: ACTIVE_ORDER_STATUSES,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: normalizeLimit(input.limit),
    select: ORDER_READ_SELECT,
  });

  return orders.map(toOrderDto);
}

export async function listHistoryOrders(
  db: OrderReadDb,
  input: {
    userId: string;
    limit?: number;
  },
): Promise<OrderDto[]> {
  const userId = assertRequiredString(input.userId, 'userId');
  const orders = await db.order.findMany({
    where: {
      userId,
      status: {
        in: HISTORY_ORDER_STATUSES,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: normalizeLimit(input.limit),
    select: ORDER_READ_SELECT,
  });

  return orders.map(toOrderDto);
}

export async function getOrderByPublicId(
  db: OrderReadDb,
  input: {
    userId: string;
    publicId: string;
  },
): Promise<OrderDto | null> {
  const userId = assertRequiredString(input.userId, 'userId');
  const publicId = assertRequiredString(input.publicId, 'publicId');
  const order = await db.order.findFirst({
    where: {
      userId,
      publicId,
    },
    select: ORDER_READ_SELECT,
  });

  return order ? toOrderDto(order) : null;
}

export async function getAnyOrderByPublicId(
  db: OrderReadDb,
  input: {
    publicId: string;
  },
): Promise<OrderDto | null> {
  const publicId = assertRequiredString(input.publicId, 'publicId');
  const order = await db.order.findFirst({
    where: {
      publicId,
    },
    select: ORDER_READ_SELECT,
  });

  return order ? toOrderDto(order) : null;
}

export async function getUserProfile(
  db: OrderReadDb,
  input: {
    userId: string;
  },
): Promise<UserProfileDto> {
  const userId = assertRequiredString(input.userId, 'userId');
  const [telegram, totalOrders, activeOrders] = await Promise.all([
    db.telegramProfile.findUnique({
      where: {
        userId,
      },
      select: {
        telegramUserId: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    }),
    db.order.count({
      where: {
        userId,
      },
    }),
    db.order.count({
      where: {
        userId,
        status: {
          in: ACTIVE_ORDER_STATUSES,
        },
      },
    }),
  ]);

  return {
    userId,
    telegram: telegram
      ? {
          telegramUserId: telegram.telegramUserId.toString(),
          username: telegram.username,
          firstName: telegram.firstName,
          lastName: telegram.lastName,
        }
      : null,
    stats: {
      totalOrders,
      activeOrders,
    },
  };
}

function toOrderDto(order: ReadableOrderRecord): OrderDto {
  return {
    publicId: order.publicId,
    direction: order.direction,
    asset: order.asset,
    network: order.network,
    customer: {
      lastName: order.customerLastName,
      firstName: order.customerFirstName,
      middleName: order.customerMiddleName,
    },
    amountUsdt: toNullableDecimalString(order.amountUsdt),
    amountRub: toNullableDecimalString(order.amountRub),
    rateSnapshot: toRequiredDecimalString(order.rateSnapshot, 'rateSnapshot'),
    rateExpiresAt: order.rateExpiresAt.toISOString(),
    orderExpiresAt: order.orderExpiresAt.toISOString(),
    status: order.status,
    depositAddress: order.depositAddress?.address ?? null,
    clientPayoutAddress: order.clientPayoutAddress,
    cryptoPayout: toCryptoPayoutDto(order),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
  };
}

function toCryptoPayoutDto(
  order: ReadableOrderRecord,
): OrderDto['cryptoPayout'] {
  if (!order.payoutTxId && !order.payoutTxRecordedAt) {
    return null;
  }

  if (!order.payoutTxId || !order.payoutTxRecordedAt) {
    throw new Error('crypto payout record is incomplete');
  }

  return {
    txId: order.payoutTxId,
    recordedAt: order.payoutTxRecordedAt.toISOString(),
  };
}

function toNullableDecimalString(value: unknown | null): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toRequiredDecimalString(value: unknown, fieldName: string): string {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }

  return String(value);
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_LIST_LIMIT) {
    throw new Error('limit must be a positive integer up to 100');
  }

  return value;
}

function assertRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value;
}
