import type { OrderDirection } from '../domain/types.js';

const USDT_SCALE = 6;
const RUB_SCALE = 2;
const RATE_SCALE = 6;

export interface UsdtRubRates {
  buyRate: string;
  sellRate: string;
}

export interface UsdtRubRateProvider {
  getUsdtRubRates(input: { now: Date }): Promise<UsdtRubRates> | UsdtRubRates;
}

export interface OrderQuote {
  amountUsdt: string;
  amountRub: string;
  rateSnapshot: string;
}

export function createStaticUsdtRubRateProvider(
  rates: UsdtRubRates,
): UsdtRubRateProvider {
  const normalizedRates = normalizeUsdtRubRates(rates);

  return {
    getUsdtRubRates: () => normalizedRates,
  };
}

export function createUsdtRubOrderQuote(input: {
  direction: OrderDirection;
  amountRub?: string;
  amountUsdt?: string;
  rates: UsdtRubRates;
}): OrderQuote {
  const rates = normalizeUsdtRubRates(input.rates);

  if (input.direction === 'BUY_USDT') {
    return createBuyUsdtQuote({
      amountRub: input.amountRub,
      buyRate: rates.buyRate,
    });
  }

  return createSellUsdtQuote({
    amountUsdt: input.amountUsdt,
    sellRate: rates.sellRate,
  });
}

function createBuyUsdtQuote(input: {
  amountRub: string | undefined;
  buyRate: string;
}): OrderQuote {
  if (input.amountRub === undefined) {
    throw new Error('amountRub is required for BUY_USDT quote');
  }

  const rub = parseDecimalToAtomic(input.amountRub, 'amountRub', RUB_SCALE);
  const rate = parseDecimalToAtomic(input.buyRate, 'buyRate', RATE_SCALE);
  const amountUsdt = (rub.atomic * 10_000_000_000n) / rate.atomic;

  return {
    amountUsdt: formatAtomicDecimal(amountUsdt, USDT_SCALE, 'amountUsdt'),
    amountRub: rub.formatted,
    rateSnapshot: rate.formatted,
  };
}

function createSellUsdtQuote(input: {
  amountUsdt: string | undefined;
  sellRate: string;
}): OrderQuote {
  if (input.amountUsdt === undefined) {
    throw new Error('amountUsdt is required for SELL_USDT quote');
  }

  const usdt = parseDecimalToAtomic(input.amountUsdt, 'amountUsdt', USDT_SCALE);
  const rate = parseDecimalToAtomic(input.sellRate, 'sellRate', RATE_SCALE);
  const amountRub = (usdt.atomic * rate.atomic) / 10_000_000_000n;

  return {
    amountUsdt: usdt.formatted,
    amountRub: formatAtomicDecimal(amountRub, RUB_SCALE, 'amountRub'),
    rateSnapshot: rate.formatted,
  };
}

export function normalizeUsdtRubRates(rates: UsdtRubRates): UsdtRubRates {
  return {
    buyRate: parseDecimalToAtomic(rates.buyRate, 'buyRate', RATE_SCALE).formatted,
    sellRate: parseDecimalToAtomic(rates.sellRate, 'sellRate', RATE_SCALE).formatted,
  };
}

function parseDecimalToAtomic(
  value: unknown,
  fieldName: string,
  scale: number,
): {
  atomic: bigint;
  formatted: string;
} {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a positive decimal string`);
  }

  if (!/^\d+(?:\.\d+)?$/.test(value) || !/[1-9]/.test(value.replace('.', ''))) {
    throw new Error(`${fieldName} must be a positive decimal string`);
  }

  const [rawIntegerPart, fractionalPart = ''] = value.split('.');
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, '');
  const integerDigits = integerPart.length;

  if (
    fractionalPart.length > scale ||
    integerDigits > 36 - scale ||
    integerDigits + fractionalPart.length > 36
  ) {
    throw new Error(`${fieldName} must fit Decimal(36, ${scale})`);
  }

  const paddedFractionalPart = fractionalPart.padEnd(scale, '0');
  const atomic = BigInt(`${integerPart}${paddedFractionalPart}`);

  return {
    atomic,
    formatted: `${integerPart}.${paddedFractionalPart}`,
  };
}

function formatAtomicDecimal(
  atomic: bigint,
  scale: number,
  fieldName: string,
): string {
  const raw = atomic.toString().padStart(scale + 1, '0');
  const integerPart = raw.slice(0, -scale);
  const fractionalPart = raw.slice(-scale);
  const integerDigits = integerPart.replace(/^0+(?=\d)/, '').length;

  if (integerDigits > 36 - scale || integerDigits + fractionalPart.length > 36) {
    throw new Error(`${fieldName} must fit Decimal(36, ${scale})`);
  }

  return `${integerPart}.${fractionalPart}`;
}
