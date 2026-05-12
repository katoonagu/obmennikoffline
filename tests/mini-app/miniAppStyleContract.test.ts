import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  new URL('../../src/mini-app/App.tsx', import.meta.url),
  'utf8',
);
const appCss = readFileSync(
  new URL('../../src/mini-app/App.css', import.meta.url),
  'utf8',
);

describe('Mini App Figma component style contract', () => {
  it('uses Manrope and shared OBMEN design tokens for the adapted UI layer', () => {
    expect(appCss).toMatch(/font-family:[\s\S]*Manrope/);
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
    expect(appSource).toContain('className="ui-copy-button"');
  });
});
