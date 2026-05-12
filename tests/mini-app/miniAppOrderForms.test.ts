import { describe, expect, it } from 'vitest';
import {
  buildBuyOrderInput,
  buildSellOrderInput,
  createInitialBuyOrderForm,
  createInitialSellOrderForm,
  normalizeDecimalInput,
} from '../../src/mini-app/miniAppOrderForms.js';

const PAYOUT_ADDRESS = 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7';

describe('Mini App editable order forms', () => {
  it('normalizes decimal input for backend request DTOs', () => {
    expect(normalizeDecimalInput(' 200 000,5 ', 2)).toBe('200000.50');
    expect(normalizeDecimalInput('5000', 6)).toBe('5000.000000');
    expect(normalizeDecimalInput('5 000.1234', 6)).toBe('5000.123400');
  });

  it('builds BUY order input from editable user fields', () => {
    const form = {
      ...createInitialBuyOrderForm(),
      amountRub: '200 000',
      clientPayoutAddress: ` ${PAYOUT_ADDRESS} `,
      fullName: 'Иванов Иван Иванович',
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
  });

  it('builds SELL order input from editable user fields after terms acceptance', () => {
    const form = {
      ...createInitialSellOrderForm(),
      amountUsdt: '5 000',
      fullName: 'Иванов Иван Иванович',
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
  });

  it('returns client-facing validation errors before hitting the API', () => {
    expect(buildBuyOrderInput({
      ...createInitialBuyOrderForm(),
      amountRub: '',
      clientPayoutAddress: PAYOUT_ADDRESS,
      fullName: 'Иванов Иван Иванович',
    })).toEqual({
      ok: false,
      message: 'Введите сумму в рублях',
    });
    expect(buildBuyOrderInput({
      ...createInitialBuyOrderForm(),
      amountRub: '200000',
      clientPayoutAddress: '',
      fullName: 'Иванов Иван Иванович',
    })).toEqual({
      ok: false,
      message: 'Введите TRC-20 кошелек для получения USDT',
    });
    expect(buildSellOrderInput({
      ...createInitialSellOrderForm(),
      amountUsdt: '5000',
      fullName: 'Иван',
      acceptedTerms: true,
    })).toEqual({
      ok: false,
      message: 'Введите ФИО полностью: фамилия, имя и отчество',
    });
    expect(buildSellOrderInput({
      ...createInitialSellOrderForm(),
      amountUsdt: '5000',
      fullName: 'Иванов Иван Иванович',
      acceptedTerms: false,
    })).toEqual({
      ok: false,
      message: 'Примите правила и условия обмена',
    });
  });
});
