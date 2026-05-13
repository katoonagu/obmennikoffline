import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminHtml = readFileSync(
  new URL('../../frontend/admin.html', import.meta.url),
  'utf8',
);
const viteConfig = readFileSync(
  new URL('../../frontend/vite.config.ts', import.meta.url),
  'utf8',
);
const appSource = readFileSync(
  new URL('../../src/admin-app/App.tsx', import.meta.url),
  'utf8',
);
const appCss = readFileSync(
  new URL('../../src/admin-app/App.css', import.meta.url),
  'utf8',
);

describe('Admin App UI contract', () => {
  it('ships as a separate Vite entrypoint from the Telegram Mini App', () => {
    expect(adminHtml).toContain('OBMEN Admin');
    expect(adminHtml).toContain('/src/admin-app/main.tsx');
    expect(viteConfig).toContain('./admin.html');
    expect(viteConfig).toContain('./index.html');
  });

  it('covers the first manager workflow screens and components', () => {
    for (const sourceText of [
      'Вход менеджера',
      'Очередь заявок',
      'Детали заявки',
      'Изменить статус',
      'Записать tx hash',
      'Импорт адресов',
      'Пустая очередь',
    ]) {
      expect(appSource).toContain(sourceText);
    }

    for (const selector of [
      '.admin-shell',
      '.admin-login-panel',
      '.admin-order-queue',
      '.admin-queue-controls',
      '.admin-segmented-control',
      '.admin-filter-row',
      '.admin-detail-panel',
      '.admin-status-form',
      '.admin-payout-form',
      '.admin-address-import',
      '.admin-empty-state',
      '.admin-error',
    ]) {
      expect(appCss).toContain(selector);
    }
  });

  it('uses a dense dashboard layout without nested-card UI', () => {
    expect(appCss).toContain('font-family: Manrope');
    expect(appCss).toMatch(/\.admin-dashboard\s*{[\s\S]*display:\s*grid;/);
    expect(appCss).toMatch(/\.admin-order-row\s*{[\s\S]*display:\s*grid;/);
    expect(appCss).not.toContain('box-shadow: 0 0 32px');
  });

  it('keeps order public ids stable instead of wrapping them by character', () => {
    expect(appSource).toContain('className="admin-order-identity"');
    expect(appSource).toContain('className="admin-order-amount"');
    expect(appCss).toMatch(
      /\.admin-order-identity strong\s*{[\s\S]*white-space:\s*nowrap;/,
    );
  });
});
