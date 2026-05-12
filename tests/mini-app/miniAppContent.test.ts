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

  it('defines all first-slice user screens with Russian UI labels', () => {
    expect(miniAppScreens.map((screen) => screen.id)).toEqual([
      'home',
      'buy',
      'sell',
      'order-detail',
      'profile',
    ]);

    expect(miniAppScreens[0]!.title).toBe('Моментальный обмен USDT');
    expect(miniAppScreens[1]!.title).toBe('Купить USDT');
    expect(miniAppScreens[2]!.title).toBe('Продать USDT');
    expect(miniAppScreens[3]!.title).toBe('Детали заявки');
    expect(miniAppScreens[4]!.title).toBe('Профиль');
  });

  it('preserves the BUY and SELL wallet logic in frontend copy', () => {
    const buyScreen = miniAppScreens.find((screen) => screen.id === 'buy')!;
    const sellScreen = miniAppScreens.find((screen) => screen.id === 'sell')!;
    const detailScreen = miniAppScreens.find((screen) => screen.id === 'order-detail')!;

    expect(buyScreen.highlights).toContain('USDT будет отправлен на ваш TRC-20 кошелек после оплаты в офисе.');
    expect(buyScreen.rows).toContainEqual({
      label: 'Кошелек для получения (TRC-20)',
      value: 'TXxx...9Qm',
      tone: 'mono',
    });
    expect(sellScreen.highlights).toContain('Курс фиксируется на 20 минут');
    expect(sellScreen.highlights).toContain('Переведите USDT одной транзакцией');
    expect(detailScreen.rows).toContainEqual({
      label: 'Адрес для перевода (TRC-20)',
      value: 'TXxx...9Qm',
      tone: 'mono',
    });
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
});
