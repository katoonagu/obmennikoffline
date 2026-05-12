import { describe, expect, it } from 'vitest';
import { miniAppMockFixtures } from '../../src/mini-app/miniAppApi.js';
import {
  createMiniAppHomeViewModel,
  createMiniAppOrderDetailViewModel,
  createMiniAppProfileViewModel,
} from '../../src/mini-app/miniAppViewModel.js';

describe('Mini App view models', () => {
  it('maps rates and active orders into the Home screen model', () => {
    const home = createMiniAppHomeViewModel({
      rates: miniAppMockFixtures.rates,
      activeOrders: [miniAppMockFixtures.sellOrder],
    });

    expect(home.rates).toEqual({
      buy: '76.85 ₽',
      sell: '76.25 ₽',
    });
    expect(home.activeOrders).toEqual([
      {
        publicId: 'E00001',
        directionLabel: 'Продажа USDT',
        amountLabel: '5 000.00 USDT',
        title: 'Продажа 5 000.00 USDT',
        addressLabel: 'Адрес (TRC-20)',
        addressValue: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
        statusLabel: 'В ожидании',
        statusTone: 'warning',
        createdAtLabel: '11 мая 2026, 14:05',
      },
    ]);
  });

  it('keeps full BUY payout wallets visible in Home cards when present', () => {
    const home = createMiniAppHomeViewModel({
      rates: miniAppMockFixtures.rates,
      activeOrders: [miniAppMockFixtures.buyOrder],
    });

    expect(home.activeOrders[0]).toMatchObject({
      publicId: 'E97010',
      directionLabel: 'Покупка USDT',
      amountLabel: '200 000 ₽',
      addressLabel: 'Кошелек (TRC-20)',
      addressValue: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
    });
    expect(home.activeOrders[0]?.addressValue).not.toContain('...');
  });

  it('maps SELL order detail to deposit-address QR instructions', () => {
    const detail = createMiniAppOrderDetailViewModel(miniAppMockFixtures.sellOrder);

    expect(detail.title).toBe('Детали заявки');
    expect(detail.statusLabel).toBe('В ожидании');
    expect(detail.qrValue).toBe('TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY');
    expect(detail.rows).toContainEqual({
      label: 'Адрес для перевода (TRC-20)',
      value: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      tone: 'mono',
      copyable: true,
    });
    expect(detail.rows).toContainEqual({
      label: 'Сеть',
      value: 'Tron (TRC-20)',
    });
  });

  it('maps BUY order detail to client payout address without deposit QR', () => {
    const detail = createMiniAppOrderDetailViewModel(miniAppMockFixtures.buyOrder);

    expect(detail.qrValue).toBeNull();
    expect(detail.rows).toContainEqual({
      label: 'Кошелек для получения (TRC-20)',
      value: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
      tone: 'mono',
      copyable: true,
    });
    expect(detail.rows).not.toContainEqual(expect.objectContaining({
      label: 'Адрес для перевода (TRC-20)',
    }));
  });

  it('ignores a corrupted BUY deposit address instead of rendering a server-owned QR', () => {
    const detail = createMiniAppOrderDetailViewModel({
      ...miniAppMockFixtures.buyOrder,
      depositAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
    });

    expect(detail.qrValue).toBeNull();
    expect(detail.rows).not.toContainEqual(expect.objectContaining({
      label: 'РђРґСЂРµСЃ РґР»СЏ РїРµСЂРµРІРѕРґР° (TRC-20)',
    }));
  });

  it('maps profile stats and stored customer FIO from the backend profile DTO', () => {
    const profile = createMiniAppProfileViewModel(miniAppMockFixtures.profile);

    expect(profile.telegramIdLabel).toBe('••••••83');
    expect(profile.totalOrdersLabel).toBe('24');
    expect(profile.activeOrdersLabel).toBe('1');
    expect(profile.usernameLabel).toBe('@pavel');
    expect(profile.customerNameLabel).toBe('Ivanov Ivan Ivanovich');
  });
});
