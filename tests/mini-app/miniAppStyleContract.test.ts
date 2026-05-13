import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  new URL('../../src/mini-app/App.tsx', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../../src/mini-app/main.tsx', import.meta.url),
  'utf8',
);
const appCss = readFileSync(
  new URL('../../src/mini-app/App.css', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  dependencies?: Record<string, string>;
};

describe('Mini App Figma component style contract', () => {
  it('uses Manrope and shared OBMEN design tokens for the adapted UI layer', () => {
    expect(appCss).toMatch(/font-family:[\s\S]*Manrope/);
    expect(packageJson.dependencies).toHaveProperty('@fontsource/manrope');
    for (const weight of ['400', '500', '600', '700', '800']) {
      expect(mainSource).toContain(`@fontsource/manrope/cyrillic-${weight}.css`);
      expect(mainSource).toContain(`@fontsource/manrope/latin-${weight}.css`);
    }
    expect(appCss).toContain('--mini-bg:');
    expect(appCss).toContain('--mini-surface:');
    expect(appCss).toContain('--mini-border:');
    expect(appCss).toContain('--mini-accent:');
    expect(appCss).toContain('--mini-warning:');
  });

  it('defines reusable Figma-inspired primitives for fields, buttons, copy, timer, payment id, and help', () => {
    for (const selector of [
      '.ui-field',
      '.ui-input',
      '.ui-field-helper',
      '.ui-button.primary',
      '.ui-button.secondary',
      '.ui-button.tertiary',
      '.ui-copy-button',
      '.timer-section',
      '.payment-id-section',
      '.help-section',
    ]) {
      expect(appCss).toContain(selector);
    }
  });

  it('renders the Mini App through the adapted local primitives instead of legacy raw classes', () => {
    for (const primitive of [
      'Button',
      'FormField',
      'CopyButton',
      'TimerSection',
      'PaymentIdSection',
      'HelpSection',
    ]) {
      expect(appSource).toContain(`function ${primitive}`);
    }

    expect(appSource).toContain('className="ui-field"');
    expect(appSource).toContain('className="ui-button primary"');
    expect(appSource).toContain('ui-copy-button');
    expect(appSource).toContain('helperText');
    expect(appSource).toContain('aria-describedby');
  });

  it('gives copy buttons an accessible copied state after clipboard writes', () => {
    expect(appSource).toContain('const [copied, setCopied] = useState(false)');
    expect(appSource).toContain("className={copied ? 'ui-copy-button copied' : 'ui-copy-button'}");
    expect(appSource).toContain("aria-live=\"polite\"");
    expect(appSource).toContain('Скопировано');
    expect(appCss).toContain('.ui-copy-button.copied');
    expect(appCss).toContain('.copy-feedback');
  });

  it('exposes a local Telegram initData copy panel for desktop smoke only', () => {
    expect(appSource).toContain('function InitDataDebugPanel');
    expect(appSource).toContain('showInitDataDebug');
    expect(appSource).toContain('Telegram initData debug');
    expect(appSource).toContain('CopyButton value={initData}');
    expect(appCss).toContain('.init-data-debug-panel');
  });

  it('keeps the exchar-style flow structure in OBMEN dark components', () => {
    for (const selector of [
      '.home-rate-header',
      '.exchange-rate-table',
      '.order-card-kicker',
      '.order-card-address',
      '.created-order-hero',
      '.created-order-summary',
      '.sell-transfer-panel',
      '.buy-instructions-panel',
      '.profile-identity-panel',
    ]) {
      expect(appCss).toContain(selector);
    }

    expect(appSource).toContain('className="exchange-rate-table"');
    expect(appSource).toContain('className="created-order-hero"');
    expect(appSource).toContain('className="sell-transfer-panel"');
    expect(appSource).toContain('className="buy-instructions-panel"');
    expect(appSource).toContain('className="profile-identity-panel"');
  });

  it('does not pre-render fixed mock orders before runtime data loads', () => {
    expect(appSource).toContain('useState<OrderDto[]>([])');
    expect(appSource).toContain('useState<OrderDto | null>(null)');
    expect(appSource).not.toContain('useState<OrderDto[]>([\n    miniAppMockFixtures.sellOrder');
    expect(appSource).not.toContain('useState<OrderDto | null>(\n    miniAppMockFixtures.sellOrder');
  });

  it('keeps History separate from current active orders', () => {
    expect(appSource).toContain('const [historyOrders, setHistoryOrders] = useState<OrderDto[]>([])');
    expect(appSource).toContain('api.listHistoryOrders({ limit: 10 })');
    expect(appSource).toContain('<HistoryScreen orders={historyOrders}');
    expect(appSource).not.toContain('<HistoryScreen activeOrders={activeOrders}');
  });

  it('renders a blocking bootstrap error instead of stale payment surfaces after API startup failure', () => {
    expect(appSource).toContain('function BlockingErrorScreen');
    expect(appSource).toContain('const [bootstrapError, setBootstrapError]');
    expect(appSource).toContain('setActiveOrders([])');
    expect(appSource).toContain('setHistoryOrders([])');
    expect(appSource).toContain('setSelectedOrder(null)');
    expect(appSource).toContain('setProfile(initialProfile)');
    expect(appSource).toContain('<BlockingErrorScreen message={bootstrapError}');
  });

  it('explains local API dev-auth setup when local API mode cannot bootstrap', () => {
    expect(appSource).toContain('createMiniAppBootstrapFailureMessage');
    expect(appSource).toContain('Не удалось подключиться к локальному API');
    expect(appSource).toContain('MINIAPP_DEV_AUTH_ENABLED=true');
    expect(appSource).toContain('MINIAPP_CORS_ORIGINS=http://127.0.0.1:5173');
  });

  it('centers action cards as compact tap targets instead of floating icons high', () => {
    expect(appCss).toMatch(
      /\.action-card\s*{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/,
    );
    expect(appCss).toMatch(
      /\.action-card svg\s*{[\s\S]*transform:\s*translateY\(2px\);/,
    );
  });

  it('keeps the SELL QR panel focused on the QR code because the address is rendered below', () => {
    const qrPanelStart = appSource.indexOf('function QrCodePanel');
    const qrPanelEnd = appSource.indexOf('function QrCodeImage');
    const qrPanelSource = appSource.slice(qrPanelStart, qrPanelEnd);

    expect(qrPanelSource).toContain('<QrCodeImage value={address} />');
    expect(qrPanelSource).not.toContain('<AddressLine');
    expect(qrPanelSource).not.toContain('address-line');
  });
});
