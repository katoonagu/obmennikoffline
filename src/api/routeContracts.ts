import { z } from 'zod';
import { isTronAddress } from '../domain/tronAddress.js';
import {
  addressPoolImportResponseSchema,
  adminSessionResponseSchema,
  orderResponseSchema,
  ordersResponseSchema,
  profileResponseSchema,
  ratesResponseSchema,
  telegramInitDataValidationResponseSchema,
} from './responseSchemas.js';

export type ApiAuthMode =
  | 'none'
  | 'admin-bearer'
  | 'admin-bearer-and-actor-header'
  | 'admin-password-login'
  | 'admin-session-or-bearer-and-actor-header'
  | 'telegram-init-data-or-dev-user-id';

export interface ApiRouteContract {
  method: 'GET' | 'POST';
  path: string;
  auth: ApiAuthMode;
  bodySchema?: z.ZodType;
  querySchema?: z.ZodType;
  paramsSchema?: z.ZodType;
  responseSchema?: z.ZodType;
}

const requiredStringSchema = (fieldName: string) =>
  z.string().trim().min(1, `${fieldName} is required`);
const optionalRequiredStringSchema = (fieldName: string) =>
  requiredStringSchema(fieldName).optional();
const adminCommentSchema = requiredStringSchema('comment')
  .max(500, 'comment must be at most 500 characters')
  .optional();

const orderIdentityBodyShape = {
  userId: optionalRequiredStringSchema('userId'),
  customerLastName: requiredStringSchema('customerLastName'),
  customerFirstName: requiredStringSchema('customerFirstName'),
  customerMiddleName: requiredStringSchema('customerMiddleName'),
  rateTtlMinutes: z.number().int().positive().optional(),
  orderTtlMinutes: z.number().int().positive().optional(),
};

const TRON_TX_ID_PATTERN = /^[0-9a-fA-F]{64}$/;
const decimalInputSchema = (fieldName: string, scale: number) =>
  z
    .string()
    .regex(
      new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`),
      `${fieldName} must be a positive decimal string`,
    )
    .refine((value) => /[1-9]/.test(value.replace('.', '')), {
      message: `${fieldName} must be a positive decimal string`,
    })
    .refine((value) => fitsDecimal(value, scale), {
      message: `${fieldName} must fit Decimal(36, ${scale})`,
    });
const queryLimitSchema = z
  .string()
  .regex(/^\d+$/, 'limit must be a decimal integer string')
  .transform((value) => Number(value))
  .pipe(z.int().positive().max(100));
const tronAddressSchema = (fieldName: string) =>
  z.string().refine(isTronAddress, {
    message: `${fieldName} must be a valid TRON base58 address`,
  });

function fitsDecimal(value: string, scale: number): boolean {
  const [rawIntegerPart, fractionalPart = ''] = value.split('.');
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, '');
  const integerDigits = integerPart.length;

  return (
    fractionalPart.length <= scale &&
    integerDigits <= 36 - scale &&
    integerDigits + fractionalPart.length <= 36
  );
}

export const addressPoolRowSchema = z.strictObject({
  network: z.literal('TRON'),
  asset: z.literal('USDT'),
  derivationIndex: z.number().int().nonnegative(),
  address: tronAddressSchema('address'),
});

export const addressPoolImportBodySchema = z.strictObject({
  rows: z.array(addressPoolRowSchema).min(1, 'rows must contain at least one address'),
});

export const buyOrderBodySchema = z.strictObject({
  ...orderIdentityBodyShape,
  amountRub: decimalInputSchema('amountRub', 2),
  clientPayoutAddress: tronAddressSchema('clientPayoutAddress'),
});

export const sellOrderBodySchema = z.strictObject({
  ...orderIdentityBodyShape,
  amountUsdt: decimalInputSchema('amountUsdt', 6),
});

export const telegramInitDataBodySchema = z.strictObject({
  initData: z.string().min(1),
});

export const adminSessionBodySchema = z.strictObject({
  username: requiredStringSchema('username'),
  password: requiredStringSchema('password'),
});

export const emptyQuerySchema = z.strictObject({});

export const userQuerySchema = z.strictObject({
  userId: optionalRequiredStringSchema('userId'),
});

export const orderListQuerySchema = z.strictObject({
  userId: optionalRequiredStringSchema('userId'),
  limit: queryLimitSchema.optional(),
});

export const adminOrderListQuerySchema = z.strictObject({
  limit: queryLimitSchema.optional(),
});

export const orderParamsSchema = z.strictObject({
  publicId: requiredStringSchema('publicId'),
});

export const managerStatusBodySchema = z.strictObject({
  status: z.enum([
    'pending_aml',
    'manager_review',
    'ready_for_cash_payout',
    'ready_for_crypto_payout',
    'completed',
    'cancelled',
    'expired',
    'rejected',
  ]),
  comment: adminCommentSchema,
});

export const manualCryptoPayoutBodySchema = z.strictObject({
  txId: z
    .string()
    .regex(TRON_TX_ID_PATTERN, 'txId must be a 64-character hex TRON transaction id'),
  comment: adminCommentSchema,
});

export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
});

export const publicRouteContracts = [
  {
    method: 'GET',
    path: '/health',
    auth: 'none',
    querySchema: emptyQuerySchema,
    responseSchema: healthResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/rates/usdt-rub',
    auth: 'none',
    querySchema: emptyQuerySchema,
    responseSchema: ratesResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/telegram/validate-init-data',
    auth: 'none',
    querySchema: emptyQuerySchema,
    bodySchema: telegramInitDataBodySchema,
    responseSchema: telegramInitDataValidationResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/orders/active',
    auth: 'telegram-init-data-or-dev-user-id',
    querySchema: orderListQuerySchema,
    responseSchema: ordersResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/orders/history',
    auth: 'telegram-init-data-or-dev-user-id',
    querySchema: orderListQuerySchema,
    responseSchema: ordersResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/orders/:publicId',
    auth: 'telegram-init-data-or-dev-user-id',
    querySchema: userQuerySchema,
    paramsSchema: orderParamsSchema,
    responseSchema: orderResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/profile',
    auth: 'telegram-init-data-or-dev-user-id',
    querySchema: userQuerySchema,
    responseSchema: profileResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/orders/buy',
    auth: 'telegram-init-data-or-dev-user-id',
    querySchema: emptyQuerySchema,
    bodySchema: buyOrderBodySchema,
    responseSchema: orderResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/orders/sell',
    auth: 'telegram-init-data-or-dev-user-id',
    querySchema: emptyQuerySchema,
    bodySchema: sellOrderBodySchema,
    responseSchema: orderResponseSchema,
  },
] as const satisfies readonly ApiRouteContract[];

export const adminRouteContracts = [
  {
    method: 'POST',
    path: '/api/admin/session',
    auth: 'admin-password-login',
    querySchema: emptyQuerySchema,
    bodySchema: adminSessionBodySchema,
    responseSchema: adminSessionResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/address-pool/import',
    auth: 'admin-session-or-bearer-and-actor-header',
    querySchema: emptyQuerySchema,
    bodySchema: addressPoolImportBodySchema,
    responseSchema: addressPoolImportResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/admin/orders/active',
    auth: 'admin-session-or-bearer-and-actor-header',
    querySchema: adminOrderListQuerySchema,
    responseSchema: ordersResponseSchema,
  },
  {
    method: 'GET',
    path: '/api/admin/orders/:publicId',
    auth: 'admin-session-or-bearer-and-actor-header',
    paramsSchema: orderParamsSchema,
    querySchema: emptyQuerySchema,
    responseSchema: orderResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/admin/orders/:publicId/status',
    auth: 'admin-session-or-bearer-and-actor-header',
    paramsSchema: orderParamsSchema,
    querySchema: emptyQuerySchema,
    bodySchema: managerStatusBodySchema,
    responseSchema: orderResponseSchema,
  },
  {
    method: 'POST',
    path: '/api/admin/orders/:publicId/manual-crypto-payout',
    auth: 'admin-session-or-bearer-and-actor-header',
    paramsSchema: orderParamsSchema,
    querySchema: emptyQuerySchema,
    bodySchema: manualCryptoPayoutBodySchema,
    responseSchema: orderResponseSchema,
  },
] as const satisfies readonly ApiRouteContract[];
