import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const referenceReadmeUrl = new URL(
  '../../docs/reference-screenshots/README.md',
  import.meta.url,
);
const excharBotFlowUrl = new URL(
  '../../docs/reference-screenshots/exchar-bot-flow.md',
  import.meta.url,
);
const uiSpecUrl = new URL(
  '../../docs/design/telegram-mini-app-ui-spec.md',
  import.meta.url,
);
const designSystemUrl = new URL(
  '../../docs/design/DESIGN.md',
  import.meta.url,
);

describe('reference screenshot and Mini App UI documentation contracts', () => {
  it('documents how exchar_bot reference screenshots should be stored and used', () => {
    expect(existsSync(referenceReadmeUrl)).toBe(true);
    const readme = readFileSync(referenceReadmeUrl, 'utf8');

    expect(readme).toContain('docs/reference-screenshots/exchar_bot');
    expect(readme).toContain('reference only');
    expect(readme).toContain('redact faces, passports, chat handles');
    expect(readme).toContain('do not copy another brand verbatim');
  });

  it('captures the exchar_bot BUY and SELL reference flow', () => {
    expect(existsSync(excharBotFlowUrl)).toBe(true);
    const flow = readFileSync(excharBotFlowUrl, 'utf8');

    expect(flow).toContain('Reference: exchar_bot');
    expect(flow).toContain('01-home.png');
    expect(flow).toContain('15-buy-active-order-detail.png');
    expect(flow).toContain('SELL_USDT');
    expect(flow).toContain('BUY_USDT');
    expect(flow).toContain('One SELL order = one reserved TRC20 deposit address');
    expect(flow).toContain('BUY order has no system deposit address');
    expect(flow).toContain('clientPayoutAddress');
    expect(flow).toContain('funds_detected');
    expect(flow).toContain('late_payment');
  });

  it('defines the Telegram Mini App screen contract before frontend work starts', () => {
    expect(existsSync(uiSpecUrl)).toBe(true);
    const uiSpec = readFileSync(uiSpecUrl, 'utf8');

    expect(uiSpec).toContain('Telegram Mini App UI Spec');
    expect(uiSpec).toContain('Home');
    expect(uiSpec).toContain('Sell form');
    expect(uiSpec).toContain('Sell confirmation');
    expect(uiSpec).toContain('Sell created');
    expect(uiSpec).toContain('Buy form');
    expect(uiSpec).toContain('Buy confirmation');
    expect(uiSpec).toContain('Buy created');
    expect(uiSpec).toContain('Profile');
    expect(uiSpec).toContain('/api/orders/sell');
    expect(uiSpec).toContain('/api/orders/buy');
    expect(uiSpec).toContain('/api/orders/active');
  });

  it('defines a design direction that fits an offline exchange Mini App', () => {
    expect(existsSync(designSystemUrl)).toBe(true);
    const designSystem = readFileSync(designSystemUrl, 'utf8');

    expect(designSystem).toContain('Offline Exchange Mini App Design System');
    expect(designSystem).toContain('mobile-first Telegram Mini App');
    expect(designSystem).toContain('not a landing page');
    expect(designSystem).toContain('trustworthy financial utility');
    expect(designSystem).toContain('reference photos are source material');
    expect(designSystem).toContain('avoid purple-blue AI gradients');
  });
});
