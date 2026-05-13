import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  miniAppBrand,
  miniAppScreens,
  selectedMiniAppDirection,
} from '../../src/mini-app/miniAppContent.js';

const designDoc = readFileSync(
  new URL('../../docs/design/DESIGN.md', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>;
};
const miniAppHtml = readFileSync(
  new URL('../../frontend/index.html', import.meta.url),
  'utf8',
);

describe('Telegram Mini App frontend contract', () => {
  it('locks the selected OBMEN design direction', () => {
    expect(selectedMiniAppDirection).toBe('Dark Trust Terminal');
    expect(miniAppBrand.name).toBe('OBMEN');
    expect(miniAppBrand.tagline).toContain('офлайн-обмена USDT/RUB');
    expect(miniAppBrand.palette.accent).toBe('#33BC65');
    expect(miniAppBrand.palette.cyan).toBe('#12DCEF');
    expect(designDoc).toContain('Selected Direction: Dark Trust Terminal');
    expect(designDoc).toContain('OBMEN');
    expect(designDoc).toContain('#33BC65');
    expect(designDoc).toContain('#12DCEF');
  });

  it('defines the reference-flow user screens with Russian UI labels', () => {
    expect(miniAppScreens.map((screen) => screen.id)).toEqual([
      'home',
      'about',
      'buy',
      'buy-confirm',
      'buy-created',
      'sell',
      'sell-confirm',
      'sell-created',
      'order-detail',
      'history',
      'profile',
    ]);

    expect(miniAppScreens.find((screen) => screen.id === 'home')?.title).toBe('Моментальный обмен USDT');
    expect(miniAppScreens.find((screen) => screen.id === 'about')?.title).toBe('О нас');
    expect(miniAppScreens.find((screen) => screen.id === 'buy')?.title).toBe('Купить USDT');
    expect(miniAppScreens.find((screen) => screen.id === 'sell')?.title).toBe('Продать USDT');
    expect(miniAppScreens.find((screen) => screen.id === 'history')?.title).toBe('История');
    expect(miniAppScreens.find((screen) => screen.id === 'profile')?.title).toBe('Профиль');
  });

  it('preserves the BUY and SELL wallet logic in frontend copy without masked BUY wallets', () => {
    const buyScreen = miniAppScreens.find((screen) => screen.id === 'buy')!;
    const buyConfirmScreen = miniAppScreens.find((screen) => screen.id === 'buy-confirm')!;
    const sellScreen = miniAppScreens.find((screen) => screen.id === 'sell')!;
    const sellCreatedScreen = miniAppScreens.find((screen) => screen.id === 'sell-created')!;

    expect(buyScreen.highlights).toContain('Введите свой TRC-20 кошелек полностью.');
    expect(buyConfirmScreen.highlights).toContain('USDT будет отправлен на указанный вами TRC-20 кошелек после оплаты в офисе.');
    expect(JSON.stringify(buyScreen)).not.toContain('TXxx...9Qm');
    expect(JSON.stringify(buyConfirmScreen)).not.toContain('TXxx...9Qm');
    expect(sellScreen.highlights).toContain('Адрес для перевода появится только после создания заявки.');
    expect(sellCreatedScreen.highlights).toContain('Переведите USDT одной транзакцией в сети Tron (TRC-20).');
  });

  it('adds isolated frontend scripts and Vite entry files', () => {
    expect(packageJson.scripts['dev:miniapp']).toBe(
      'vite --config frontend/vite.config.ts --host 127.0.0.1',
    );
    expect(packageJson.scripts['build:miniapp']).toBe(
      'vite build --config frontend/vite.config.ts',
    );
    expect(existsSync(new URL('../../frontend/index.html', import.meta.url))).toBe(
      true,
    );
    expect(
      existsSync(new URL('../../src/mini-app/App.tsx', import.meta.url)),
    ).toBe(true);
  });

  it('loads the official Telegram WebApp bridge before the Mini App bundle', () => {
    expect(miniAppHtml).toContain('https://telegram.org/js/telegram-web-app.js');
    expect(miniAppHtml.indexOf('telegram-web-app.js')).toBeLessThan(
      miniAppHtml.indexOf('/src/mini-app/main.tsx'),
    );
  });
});
