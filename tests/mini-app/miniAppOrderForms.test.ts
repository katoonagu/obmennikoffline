import { describe, expect, it } from 'vitest';
import {
  buildBuyOrderInput,
  buildSellOrderInput,
  createInitialBuyOrderForm,
  createInitialSellOrderForm,
  isBuyOrderFormReady,
  isSellOrderFormReady,
  normalizeDecimalInput,
} from '../../src/mini-app/miniAppOrderForms.js';

const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';

describe('Mini App editable order forms', () => {
  it('normalizes decimal input for backend request DTOs', () => {
    expect(normalizeDecimalInput(' 200 000,5 ', 2)).toBe('200000.50');
    expect(normalizeDecimalInput('5000', 6)).toBe('5000.000000');
    expect(normalizeDecimalInput('5 000.1234', 6)).toBe('5000.123400');
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
