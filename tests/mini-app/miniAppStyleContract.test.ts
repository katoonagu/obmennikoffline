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
});
