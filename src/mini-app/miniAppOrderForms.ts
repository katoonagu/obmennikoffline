import type {
  MiniAppBuyOrderInput,
  MiniAppCustomerInput,
  MiniAppSellOrderInput,
} from './miniAppApi.js';

export interface BuyOrderFormState {
  amountRub: string;
  clientPayoutAddress: string;
  fullName: string;
}

export interface SellOrderFormState {
  amountUsdt: string;
  fullName: string;
  acceptedTerms: boolean;
}

export type FormBuildResult<T> =
  | {
      ok: true;
      input: T;
    }
  | {
      ok: false;
      message: string;
    };

export function createInitialBuyOrderForm(): BuyOrderFormState {
  return {
    amountRub: '200 000',
    clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
    fullName: 'Иванов Иван Иванович',
  };
}

export function createInitialSellOrderForm(): SellOrderFormState {
  return {
    amountUsdt: '5 000',
    fullName: 'Иванов Иван Иванович',
    acceptedTerms: true,
  };
}

export function buildBuyOrderInput(
  form: BuyOrderFormState,
): FormBuildResult<MiniAppBuyOrderInput> {
  if (!form.amountRub.trim()) {
    return fail('Введите сумму в рублях');
  }

  const clientPayoutAddress = form.clientPayoutAddress.trim();
  if (!clientPayoutAddress) {
    return fail('Введите TRC-20 кошелек для получения USDT');
  }

  const customer = parseFullName(form.fullName);
  if (!customer) {
    return fail('Введите ФИО полностью: фамилия, имя и отчество');
  }

  try {
    return {
      ok: true,
      input: {
        amountRub: normalizeDecimalInput(form.amountRub, 2),
        clientPayoutAddress,
        customer,
      },
    };
  } catch {
    return fail('Введите корректную сумму в рублях');
  }
}

export function buildSellOrderInput(
  form: SellOrderFormState,
): FormBuildResult<MiniAppSellOrderInput> {
  if (!form.amountUsdt.trim()) {
    return fail('Введите сумму в USDT');
  }

  const customer = parseFullName(form.fullName);
  if (!customer) {
    return fail('Введите ФИО полностью: фамилия, имя и отчество');
  }

  if (!form.acceptedTerms) {
    return fail('Примите правила и условия обмена');
  }

  try {
    return {
      ok: true,
      input: {
        amountUsdt: normalizeDecimalInput(form.amountUsdt, 6),
        customer,
      },
    };
  } catch {
    return fail('Введите корректную сумму в USDT');
  }
}

export function normalizeDecimalInput(value: string, scale: number): string {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !/[1-9]/.test(normalized.replace('.', ''))) {
    throw new Error('invalid decimal input');
  }

  const [integerPart, fractionalPart = ''] = normalized.split('.');
  if (fractionalPart.length > scale) {
    throw new Error('invalid decimal scale');
  }

  return `${integerPart}.${fractionalPart.padEnd(scale, '0')}`;
}

function parseFullName(value: string): MiniAppCustomerInput | null {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const [lastName, firstName, ...middleNameParts] = parts;

  return {
    lastName,
    firstName,
    middleName: middleNameParts.join(' '),
  };
}

function fail(message: string): FormBuildResult<never> {
  return {
    ok: false,
    message,
  };
}
