import { describe, expect, it } from 'vitest';
import {
  buildBuyOrderInput,
  buildSellOrderInput,
  createInitialBuyOrderForm,
  createInitialSellOrderForm,
  isBuyOrderFormReady,
  isSellOrderFormReady,
  mergeCustomerIntoBuyOrderForm,
  mergeCustomerIntoSellOrderForm,
  normalizeDecimalInput,
} from '../../src/mini-app/miniAppOrderForms.js';

const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';

describe('Mini App editable order forms', () => {
  it('normalizes decimal input for backend request DTOs', () => {
    expect(normalizeDecimalInput(' 200 000,5 ', 2)).toBe('200000.50');
    expect(normalizeDecimalInput('5000', 6)).toBe('5000.000000');
    expect(normalizeDecimalInput('5 000.1234', 6)).toBe('5000.123400');
  });

  it('rejects decimal values that cannot fit backend Decimal(36, scale)', () => {
    expect(() => normalizeDecimalInput('1'.repeat(35), 2)).toThrow('invalid decimal precision');
    expect(() => normalizeDecimalInput('1'.repeat(31), 6)).toThrow('invalid decimal precision');
    expect(isBuyOrderFormReady({
      ...createInitialBuyOrderForm(),
      amountRub: '1'.repeat(35),
      clientPayoutAddress: PAYOUT_ADDRESS,
      customerLastName: 'Ivanov',
      customerFirstName: 'Ivan',
      customerMiddleName: 'Ivanovich',
    })).toBe(false);
    expect(isSellOrderFormReady({
      ...createInitialSellOrderForm(),
      amountUsdt: '1'.repeat(31),
      customerLastName: 'Ivanov',
      customerFirstName: 'Ivan',
      customerMiddleName: 'Ivanovich',
      acceptedTerms: true,
    })).toBe(false);
  });

  it('starts new order forms empty so users must enter their own wallet and FIO', () => {
    expect(createInitialBuyOrderForm()).toEqual({
      amountRub: '',
      clientPayoutAddress: '',
      customerLastName: '',
      customerFirstName: '',
      customerMiddleName: '',
    });
    expect(createInitialSellOrderForm()).toEqual({
      amountUsdt: '',
      customerLastName: '',
      customerFirstName: '',
      customerMiddleName: '',
      acceptedTerms: false,
    });
  });

  it('prefills refreshed profile FIO only into untouched customer fields', () => {
    const customer = {
      lastName: 'Smoke',
      firstName: 'Api',
      middleName: 'User',
    };

    expect(mergeCustomerIntoBuyOrderForm(createInitialBuyOrderForm(), customer)).toEqual({
      amountRub: '',
      clientPayoutAddress: '',
      customerLastName: 'Smoke',
      customerFirstName: 'Api',
      customerMiddleName: 'User',
    });

    expect(mergeCustomerIntoSellOrderForm({
      ...createInitialSellOrderForm(),
      amountUsdt: '150',
      customerFirstName: 'Manual',
    }, customer)).toEqual({
      amountUsdt: '150',
      customerLastName: 'Smoke',
      customerFirstName: 'Manual',
      customerMiddleName: 'User',
      acceptedTerms: false,
    });
  });

  it('builds BUY order input from separate required FIO fields and a full TRC-20 wallet', () => {
    const form = {
      ...createInitialBuyOrderForm(),
      amountRub: '200 000',
      clientPayoutAddress: ` ${PAYOUT_ADDRESS} `,
      customerLastName: 'Иванов',
      customerFirstName: 'Иван',
      customerMiddleName: 'Иванович',
    };

    expect(buildBuyOrderInput(form)).toEqual({
      ok: true,
      input: {
        amountRub: '200000.00',
        clientPayoutAddress: PAYOUT_ADDRESS,
        customer: {
          lastName: 'Иванов',
          firstName: 'Иван',
          middleName: 'Иванович',
        },
      },
    });
    expect(isBuyOrderFormReady(form)).toBe(true);
  });

  it('builds SELL order input from separate required FIO fields after terms acceptance', () => {
    const form = {
      ...createInitialSellOrderForm(),
      amountUsdt: '5 000',
      customerLastName: 'Иванов',
      customerFirstName: 'Иван',
      customerMiddleName: 'Иванович',
      acceptedTerms: true,
    };

    expect(buildSellOrderInput(form)).toEqual({
      ok: true,
      input: {
        amountUsdt: '5000.000000',
        customer: {
          lastName: 'Иванов',
          firstName: 'Иван',
          middleName: 'Иванович',
        },
      },
    });
    expect(isSellOrderFormReady(form)).toBe(true);
  });

  it('returns client-facing validation errors before hitting the API', () => {
    expect(buildBuyOrderInput({
      ...createInitialBuyOrderForm(),
      amountRub: '',
      clientPayoutAddress: PAYOUT_ADDRESS,
      customerLastName: 'Иванов',
      customerFirstName: 'Иван',
      customerMiddleName: 'Иванович',
    })).toEqual({
      ok: false,
      message: 'Введите сумму в рублях',
    });
    expect(buildBuyOrderInput({
      ...createInitialBuyOrderForm(),
      amountRub: '200000',
      clientPayoutAddress: 'TXxx...9Qm',
      customerLastName: 'Иванов',
      customerFirstName: 'Иван',
      customerMiddleName: 'Иванович',
    })).toEqual({
      ok: false,
      message: 'Введите корректный TRC-20 кошелек для получения USDT',
    });
    expect(buildSellOrderInput({
      ...createInitialSellOrderForm(),
      amountUsdt: '5000',
      customerLastName: 'Иванов',
      customerFirstName: '',
      customerMiddleName: 'Иванович',
      acceptedTerms: true,
    })).toEqual({
      ok: false,
      message: 'Введите имя',
    });
    expect(buildSellOrderInput({
      ...createInitialSellOrderForm(),
      amountUsdt: '5000',
      customerLastName: 'Иванов',
      customerFirstName: 'Иван',
      customerMiddleName: 'Иванович',
      acceptedTerms: false,
    })).toEqual({
      ok: false,
      message: 'Примите правила и условия обмена',
    });
    expect(isBuyOrderFormReady({
      ...createInitialBuyOrderForm(),
      amountRub: '200000',
      clientPayoutAddress: 'TXxx...9Qm',
      customerLastName: 'Иванов',
      customerFirstName: 'Иван',
      customerMiddleName: 'Иванович',
    })).toBe(false);
  });
});
