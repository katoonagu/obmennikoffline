import { reserveDepositAddress } from '../address-pool/reserveDepositAddress.js';
import {
  createBuyUsdtOrder,
  createSellUsdtOrder,
  type CreateBuyUsdtOrderInput,
  type CreateSellUsdtOrderInput,
  type CreatedOrder,
} from './orderService.js';

const DEFAULT_RESERVATION_ATTEMPTS = 3;
const VALIDATION_ONLY_DEPOSIT_ADDRESS_ID = 'validation-only-deposit-address-id';

export interface OrderCreateData extends CreatedOrder {}

export interface DepositAddressCandidate {
  id: string;
  derivationIndex: number;
  status: 'available';
}

export interface OrderCreateDelegate<TOrder> {
  create(input: { data: OrderCreateData }): Promise<TOrder>;
}

export interface UserCustomerProfileUpdateDelegate {
  upsert(input: {
    where: {
      id: string;
    };
    create: {
      id: string;
      customerLastName: string;
      customerFirstName: string;
      customerMiddleName: string;
    };
    update: {
      customerLastName: string;
      customerFirstName: string;
      customerMiddleName: string;
    };
  }): Promise<unknown>;
}

export interface DepositAddressReservationDelegate {
  findFirst(input: {
    where: {
      network: 'TRON';
      asset: 'USDT';
      status: 'available';
    };
    orderBy: {
      derivationIndex: 'asc';
    };
    select: {
      id: true;
      derivationIndex: true;
      status: true;
    };
  }): Promise<DepositAddressCandidate | null>;
  updateMany(input: {
    where: {
      id: string;
      status: 'available';
    };
    data: {
      status: 'reserved';
      reservedAt: Date;
      expiresAt: Date;
    };
  }): Promise<{ count: number }>;
}

export interface OrderApplicationTransaction<TOrder> {
  depositAddress: DepositAddressReservationDelegate;
  order: OrderCreateDelegate<TOrder>;
  user: UserCustomerProfileUpdateDelegate;
}

export interface OrderApplicationDb<TOrder> {
  order: OrderCreateDelegate<TOrder>;
  user: UserCustomerProfileUpdateDelegate;
  $transaction<T>(fn: (tx: OrderApplicationTransaction<TOrder>) => Promise<T>): Promise<T>;
}

export interface CreateSellUsdtOrderInDbInput
  extends Omit<CreateSellUsdtOrderInput, 'depositAddressId'> {
  maxReservationAttempts?: number;
}

export async function createBuyUsdtOrderInDb<TOrder>(
  db: OrderApplicationDb<TOrder>,
  input: CreateBuyUsdtOrderInput,
): Promise<TOrder> {
  const order = createBuyUsdtOrder(input);

  return db.$transaction(async (tx) => {
    await updateUserCustomerProfile(tx.user, input);
    return tx.order.create({ data: toOrderCreateData(order) });
  });
}

export async function createSellUsdtOrderInDb<TOrder>(
  db: OrderApplicationDb<TOrder>,
  input: CreateSellUsdtOrderInDbInput,
): Promise<TOrder> {
  const maxReservationAttempts =
    input.maxReservationAttempts ?? DEFAULT_RESERVATION_ATTEMPTS;

  if (
    !Number.isSafeInteger(maxReservationAttempts) ||
    maxReservationAttempts <= 0
  ) {
    throw new Error('maxReservationAttempts must be a positive integer');
  }

  createSellUsdtOrder({
    ...input,
    depositAddressId: VALIDATION_ONLY_DEPOSIT_ADDRESS_ID,
  });

  return db.$transaction(async (tx) => {
    for (let attempt = 0; attempt < maxReservationAttempts; attempt += 1) {
      const candidate = await tx.depositAddress.findFirst({
        where: {
          network: 'TRON',
          asset: 'USDT',
          status: 'available',
        },
        orderBy: {
          derivationIndex: 'asc',
        },
        select: {
          id: true,
          derivationIndex: true,
          status: true,
        },
      });

      if (!candidate) {
        throw new Error('no available TRON deposit addresses');
      }

      const reservation = reserveDepositAddress({
        addresses: [candidate],
        orderId: input.publicId,
        now: input.now,
        ttlMinutes: input.orderTtlMinutes,
      });

      const updated = await tx.depositAddress.updateMany({
        where: {
          id: reservation.addressId,
          status: 'available',
        },
        data: {
          status: 'reserved',
          reservedAt: reservation.reservedAt,
          expiresAt: reservation.expiresAt,
        },
      });

      if (updated.count === 0) {
        continue;
      }

      const order = createSellUsdtOrder({
        ...input,
        depositAddressId: reservation.addressId,
      });

      await updateUserCustomerProfile(tx.user, input);
      return tx.order.create({ data: toOrderCreateData(order) });
    }

    throw new Error(
      'failed to reserve TRON deposit address after concurrent attempts',
    );
  });
}

async function updateUserCustomerProfile(
  user: UserCustomerProfileUpdateDelegate,
  input: {
    userId: string;
    customerLastName: string;
    customerFirstName: string;
    customerMiddleName: string;
  },
): Promise<void> {
  const customerData = {
    customerLastName: input.customerLastName,
    customerFirstName: input.customerFirstName,
    customerMiddleName: input.customerMiddleName,
  };

  await user.upsert({
    where: {
      id: input.userId,
    },
    create: {
      id: input.userId,
      ...customerData,
    },
    update: customerData,
  });
}

function toOrderCreateData(order: CreatedOrder): OrderCreateData {
  return {
    publicId: order.publicId,
    userId: order.userId,
    direction: order.direction,
    asset: order.asset,
    network: order.network,
    customerLastName: order.customerLastName,
    customerFirstName: order.customerFirstName,
    customerMiddleName: order.customerMiddleName,
    amountUsdt: order.amountUsdt,
    amountRub: order.amountRub,
    rateSnapshot: order.rateSnapshot,
    rateExpiresAt: order.rateExpiresAt,
    orderExpiresAt: order.orderExpiresAt,
    depositAddressId: order.depositAddressId,
    clientPayoutAddress: order.clientPayoutAddress,
    status: order.status,
  };
}
