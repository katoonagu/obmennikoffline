# Reference Screenshots

This directory stores UI reference screenshots that are allowed to influence
product flow, information architecture, screen density, and visual tone.

## Current Reference Set

- `docs/reference-screenshots/exchar_bot/` - reference only screenshots from the
  exchar_bot Telegram Mini App flow.
- `docs/reference-screenshots/exchar-bot-flow.md` - human-readable mapping of
  the screenshots to the desired BUY_USDT and SELL_USDT user journeys.

## Storage Rules

When adding screenshots:

1. Put exchar_bot images in `docs/reference-screenshots/exchar_bot`.
2. Use stable numeric names, for example:
   - `01-home.png`
   - `02-about.png`
   - `03-buy-form-empty.png`
   - `15-buy-active-order-detail.png`
3. Do not commit secrets, private keys, real access tokens, seed phrases, or
   provider credentials.
4. Redact private data: redact faces, passports, chat handles, phone numbers, wallet balances that
   belong to real people, and any private office access details.
5. Treat screenshots as product research and reference only. They are not a
   license to clone a competitor UI or do not copy another brand verbatim.

## Design Use

Reference photos are source material for:

- expected screens and state transitions;
- hierarchy of amount, rate, status, order id, address, and QR information;
- Telegram Mini App navigation behavior;
- office-exchange tone and operational trust signals.

Reference photos are not source material for:

- copying a logo, trademark, or exact visual identity;
- publishing third-party private customer or manager data;
- bypassing our own product, security, AML/KYC, or wallet-custody rules.
