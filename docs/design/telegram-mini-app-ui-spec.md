# Telegram Mini App UI Spec

Status: draft contract for frontend implementation
Product: offline USDT/RUB exchange Telegram Mini App

This spec turns the reference screenshot flow into screens and API-facing states
for our product. It must be updated when route contracts change.

## Product Shape

The Mini App is a mobile-first Telegram Mini App, which means it is implemented
as a web app rendered inside Telegram WebView. It should behave like an app, not
like a marketing website.

Primary jobs:

- create BUY_USDT orders;
- create SELL_USDT orders;
- show active orders;
- show order details;
- show profile and trust/verification state;
- hand off the offline part of the deal to bot and manager messages.

## Navigation

Bottom navigation:

- Home
- History
- Profile

Secondary entry points from Home:

- About/info
- Support chat
- AML/KYC/KYT rules
- Privacy policy

## Screens

### Home

Purpose:

- show the brand signal;
- show current USDT/RUB buy and sell rates from `/api/rates/usdt-rub`;
- expose primary actions: BUY_USDT and SELL_USDT;
- show active orders from `/api/orders/active`.

Required states:

- loading rates and orders;
- no active orders;
- active SELL order card;
- active BUY order card;
- API error with retry.

### About

Purpose:

- explain office exchange context;
- show office/support/referral/legal entry points;
- link to privacy and AML/KYC/KYT rules.

This screen is informational and must not block order creation unless legal
acceptance is required on the relevant order form.

### Sell form

Purpose:

- collect `amountUsdt`;
- collect customer full name;
- collect rules/terms acceptance.

Validation:

- `amountUsdt` must be a positive decimal string with up to 6 decimal places;
- full name fields map to `customerLastName`, `customerFirstName`,
  `customerMiddleName`;
- continue action is disabled until required inputs are valid.

No system deposit address is shown here. It appears only after the order is
created.

### Sell confirmation

Purpose:

- confirm the user intends to sell USDT;
- show `amountUsdt`, calculated RUB amount, rate snapshot, customer full name,
  rate lock, order expiry, and network.

Primary action:

- POST `/api/orders/sell`

Body:

```json
{
  "amountUsdt": "5000.000000",
  "customerLastName": "Ivanov",
  "customerFirstName": "Ivan",
  "customerMiddleName": "Ivanovich"
}
```

### Sell created

Purpose:

- show created SELL order;
- show QR code for the reserved deposit address;
- show public order id;
- show `depositAddress`;
- show amount, rate, date, and TRON TRC-20 network.

Important:

- One SELL order = one reserved TRC20 deposit address.
- The address should have copy affordance and a QR code.
- The screen must warn about sending the exact asset/network only.

### Sell active order detail

Purpose:

- let the user return to the deposit address and order state.

Data:

- GET `/api/orders/:publicId`

Required states:

- `awaiting_deposit`;
- `funds_detected`;
- `late_payment`;
- `manager_review`;
- completed/cancelled/expired terminal states.

### Buy form

Purpose:

- collect `amountRub`;
- collect `clientPayoutAddress`;
- collect customer full name.

Validation:

- `amountRub` must be a positive decimal string with up to 2 decimal places;
- `clientPayoutAddress` must be a valid TRON base58 address;
- full name fields map to `customerLastName`, `customerFirstName`,
  `customerMiddleName`.

### Buy confirmation

Purpose:

- confirm the user intends to buy USDT with RUB;
- show RUB amount, calculated USDT amount, rate snapshot, customer full name,
  client TRC20 payout wallet, and network.

Primary action:

- POST `/api/orders/buy`

Body:

```json
{
  "amountRub": "200000.00",
  "clientPayoutAddress": "TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY",
  "customerLastName": "Ivanov",
  "customerFirstName": "Ivan",
  "customerMiddleName": "Ivanovich"
}
```

### Buy created

Purpose:

- show created BUY order;
- show RUB amount, calculated USDT amount, rate, full name, public order id,
  date, and office instructions.

Important:

- BUY order has no system deposit address.
- User brings RUB to the office.
- Manager later sends USDT manually to `clientPayoutAddress` and records tx id.

### History

Purpose:

- show non-active orders from `/api/orders/history`;
- preserve direction, amount, rate, status, date, and public order id.

### Profile

Purpose:

- show Telegram-linked profile from `/api/profile`;
- show verification state if available;
- show exchange count;
- show referral link/balance only when implemented by backend.

Current backend profile contract exposes Telegram identity and order stats. Any
extra referral or verification UI must be either hidden or explicitly marked as
placeholder until backend support exists.

## Authentication

Production Mini App requests use Telegram init data:

- `Authorization: tma <initData>`

Local development may use the configured dev user fallback only outside
production.

## API Map

Public:

- GET `/api/rates/usdt-rub`
- GET `/api/orders/active`
- GET `/api/orders/history`
- GET `/api/orders/:publicId`
- GET `/api/profile`
- POST `/api/orders/buy`
- POST `/api/orders/sell`
- POST `/api/telegram/validate-init-data`

Admin/backoffice remains separate from the user Mini App:

- POST `/api/admin/session`
- GET `/api/admin/orders/active`
- POST `/api/admin/orders/:publicId/status`
- POST `/api/admin/orders/:publicId/manual-crypto-payout`
- POST `/api/address-pool/import`

## Frontend Acceptance Criteria

- Mobile viewport works first.
- Amount, rate, order id, status, and wallet address never overlap.
- BUY and SELL flows can be completed against local API fixtures or local API.
- SELL created state shows deposit address and QR.
- BUY created state does not show deposit address.
- Active order cards link to detail screens.
- Error and empty states are implemented, not left as blank screens.
- Telegram safe area and bottom navigation are respected.
