import { isTronAddress } from '../domain/tronAddress.js';
import type {
  MiniAppBuyOrderInput,
  MiniAppCustomerInput,
  MiniAppSellOrderInput,
} from './miniAppApi.js';

export interface BuyOrderFormState {
  amountRub: string;
  clientPayoutAddress: string;
  customerLastName: string;
  customerFirstName: string;
  customerMiddleName: string;
}

export interface SellOrderFormState {
  amountUsdt: string;
  customerLastName: string;
  customerFirstName: string;
  customerMiddleName: string;
  acceptedTerms: boolean;
}

export interface CustomerProfileFormFields {
  customerLastName: string;
  customerFirstName: string;
  customerMiddleName: string;
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

export function createInitialBuyOrderForm(
  customer: Partial<CustomerProfileFormFields> = {},
): BuyOrderFormState {
  return {
    amountRub: '',
    clientPayoutAddress: '',
    customerLastName: customer.customerLastName ?? '',
    customerFirstName: customer.customerFirstName ?? '',
    customerMiddleName: customer.customerMiddleName ?? '',
  };
}

export function createInitialSellOrderForm(
  customer: Partial<CustomerProfileFormFields> = {},
): SellOrderFormState {
  return {
    amountUsdt: '',
    customerLastName: customer.customerLastName ?? '',
    customerFirstName: customer.customerFirstName ?? '',
    customerMiddleName: customer.customerMiddleName ?? '',
    acceptedTerms: false,
  };
}

export function isBuyOrderFormReady(form: BuyOrderFormState): boolean {
  return buildBuyOrderInput(form).ok;
}

export function isSellOrderFormReady(form: SellOrderFormState): boolean {
  return buildSellOrderInput(form).ok;
}

export function buildBuyOrderInput(
  form: BuyOrderFormState,
): FormBuildResult<MiniAppBuyOrderInput> {
  if (!form.amountRub.trim()) {
    return fail('Введите сумму в рублях');
  }

  const clientPayoutAddress = form.clientPayoutAddress.trim();
  if (!clientPayoutAddress || !isTronAddress(clientPayoutAddress)) {
    return fail('Введите корректный TRC-20 кошелек для получения USDT');
  }

  const customer = buildCustomerInput(form);
  if (!customer.ok) {
    return customer;
  }

  try {
    return {
      ok: true,
      input: {
        amountRub: normalizeDecimalInput(form.amountRub, 2),
        clientPayoutAddress,
        customer: customer.input,
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

  const customer = buildCustomerInput(form);
  if (!customer.ok) {
    return customer;
  }

  if (!form.acceptedTerms) {
    return fail('Примите правила и условия обмена');
  }

  try {
    return {
      ok: true,
      input: {
        amountUsdt: normalizeDecimalInput(form.amountUsdt, 6),
        customer: customer.input,
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

function buildCustomerInput(
  form: CustomerProfileFormFields,
): FormBuildResult<MiniAppCustomerInput> {
  const lastName = form.customerLastName.trim();
  const firstName = form.customerFirstName.trim();
  const middleName = form.customerMiddleName.trim();

  if (!lastName) {
    return fail('Введите фамилию');
  }

  if (!firstName) {
    return fail('Введите имя');
  }

  if (!middleName) {
    return fail('Введите отчество');
  }

  return {
    ok: true,
    input: {
      lastName,
      firstName,
      middleName,
    },
  };
}

function fail(message: string): FormBuildResult<never> {
  return {
    ok: false,
    message,
  };
}
