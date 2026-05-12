import { z } from 'zod';
import { isTronAddress } from '../domain/tronAddress.js';

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DECIMAL_2_PATTERN = /^\d+\.\d{2}$/;
const DECIMAL_6_PATTERN = /^\d+\.\d{6}$/;
const TRON_TX_ID_PATTERN = /^[0-9a-fA-F]{64}$/;

const isoDateTimeSchema = z.string().regex(ISO_DATE_TIME_PATTERN);
const decimal2Schema = z.string().regex(DECIMAL_2_PATTERN);
const decimal6Schema = z.string().regex(DECIMAL_6_PATTERN);
const tronAddressSchema = z.string().refine(isTronAddress, {
  message: 'must be a valid TRON base58 address',
});
const tronTxIdSchema = z.string().regex(TRON_TX_ID_PATTERN);

export const addressPoolImportResponseSchema = z.strictObject({
  count: z.number().int().nonnegative(),
});

export const adminSessionResponseSchema = z.strictObject({
  token: z.string().regex(/^admin_session_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  admin: z.strictObject({
    id: z.string(),
    username: z.string(),
    role: z.enum(['manager', 'owner']),
  }),
});

export const telegramInitDataValidationResponseSchema = z.strictObject({
  authDate: isoDateTimeSchema,
  queryId: z.string().nullable(),
  user: z
    .strictObject({
      id: z.number().int(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      username: z.string().optional(),
      language_code: z.string().optional(),
      is_premium: z.boolean().optional(),
    })
    .nullable(),
});

export const ratesResponseSchema = z.strictObject({
  rates: z.strictObject({
    pair: z.literal('USDT_RUB'),
    buyRate: decimal6Schema,
    sellRate: decimal6Schema,
  }),
});

const orderDirectionSchema = z.enum(['BUY_USDT', 'SELL_USDT']);
const orderStatusSchema = z.enum([
  'draft',
  'awaiting_deposit',
  'awaiting_office_visit',
  'funds_detected',
  'pending_aml',
  'manager_review',
  'ready_for_cash_payout',
  'ready_for_crypto_payout',
  'completed',
  'cancelled',
  'expired',
  'late_payment',
  'rejected',
]);

export const orderDtoSchema = z.strictObject({
  publicId: z.string(),
  direction: orderDirectionSchema,
  asset: z.literal('USDT'),
  network: z.literal('TRON'),
  customer: z.strictObject({
    lastName: z.string(),
    firstName: z.string(),
    middleName: z.string(),
  }),
  amountUsdt: decimal6Schema.nullable(),
  amountRub: decimal2Schema.nullable(),
  rateSnapshot: decimal6Schema,
  rateExpiresAt: isoDateTimeSchema,
  orderExpiresAt: isoDateTimeSchema,
  status: orderStatusSchema,
  depositAddress: tronAddressSchema.nullable(),
  clientPayoutAddress: tronAddressSchema.nullable(),
  cryptoPayout: z
    .strictObject({
      txId: tronTxIdSchema,
      recordedAt: isoDateTimeSchema,
    })
    .nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const orderResponseSchema = z.strictObject({
  order: orderDtoSchema,
});

export const ordersResponseSchema = z.strictObject({
  orders: z.array(orderDtoSchema),
});

export const profileResponseSchema = z.strictObject({
  profile: z.strictObject({
    userId: z.string(),
    telegram: z
      .strictObject({
        telegramUserId: z.string(),
        username: z.string().nullable(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
      })
      .nullable(),
    stats: z.strictObject({
      totalOrders: z.number().int().nonnegative(),
      activeOrders: z.number().int().nonnegative(),
    }),
  }),
});

export function validateApiResponse<T>(
  schema: z.ZodType<T>,
  payload: unknown,
): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new Error('api response contract violation');
  }

  return result.data;
}
