# Reference: exchar_bot Flow

Status: reference contract before frontend implementation
Source: user-provided screenshot descriptions, pending actual image files in
`docs/reference-screenshots/exchar_bot/`.

This document captures the usable product flow from the exchar_bot reference
set without adopting its brand identity verbatim. It is a flow and information
architecture reference for our Telegram Mini App.

## Screenshot Map

| File | Reference screen | Purpose |
| --- | --- | --- |
| `01-home.png` | Main Mini App screen | Brand signal, BUY/SELL CTAs, current USDT/RUB rates, active orders, bottom nav |
| `02-about.png` | About/info screen | Office slider, contacts, support chat, referral system, privacy policy, AML/KYC/KYT rules |
| `03-buy-form-empty.png` | BUY form | RUB amount, client TRC20 payout wallet, customer full name |
| `04-sell-form-empty.png` | SELL form | USDT amount, customer full name, rules acceptance |
| `05-sell-confirmation.png` | SELL preview | Amount, RUB calculation, full name, rate, 20 minute rate lock, 60 minute fulfillment, TRON TRC-20 |
| `06-sell-created.png` | SELL created | QR code, amount, public order id, assigned deposit address, created date, TRON TRC-20 |
| `07-home-with-sell-active.png` | Home with active SELL | Active order block for sale, status, public order id, wallet address, date |
| `08-sell-active-order-detail.png` | SELL detail | QR code, amount, status, public order id, deposit address, date, network, min/max |
| `09-manager-message.png` | Manager Telegram message | Human manager office flow: passport, contract, office address, pass, visit time |
| `10-bot-sell-message.png` | Bot SELL message | Automated SELL instructions: order id, rate, full name, address, document, 60 minute warning |
| `11-profile.png` | Profile | Referral balance, exchange count, referral link, verification status, full name, Telegram ID |
| `12-buy-confirmation.png` | BUY preview | RUB amount, USDT calculation, rate, full name, client TRC20 payout wallet |
| `13-buy-created.png` | BUY created | Created BUY order, RUB amount, USDT calculation, rate, full name, public order id, date, cash notes instruction |
| `14-home-with-buy-active.png` | Home with active BUY | Active order block for purchase, status, public order id, date |
| `15-buy-active-order-detail.png` | BUY detail | RUB amount, type, status, public order id, date; no deposit address |

## Core Wallet Logic

- One SELL order = one reserved TRC20 deposit address.
- BUY order has no system deposit address.
- BUY order requires `clientPayoutAddress`.
- SELL order does not ask for `clientPayoutAddress` in MVP.
- The backend stores only public deposit addresses and derivation indexes.
- Seed phrases and private keys never enter backend `.env`, database, logs, or
  admin UI.

## SELL_USDT User Flow

1. User opens the Mini App and selects SELL_USDT.
2. User enters USDT amount and full name for office identification.
3. User accepts rules/terms before the continue action is enabled.
4. App shows a confirmation screen:
   - USDT amount;
   - RUB calculation;
   - customer full name;
   - rate snapshot;
   - rate lock, expected as 20 minutes in the reference;
   - order fulfillment window, expected as 60 minutes in the reference;
   - network: TRON TRC-20.
5. User creates the order.
6. Backend creates a SELL order and reserves one available TRC20 deposit address.
7. App shows the created order screen with QR code and deposit address.
8. Order appears on Home under active orders.
9. User sends USDT to the assigned address.
10. Watcher detects the incoming TRC20 USDT transfer.
11. Watcher moves the order to `funds_detected`, `late_payment`, or
    `manager_review`, depending on amount, timing, and review conditions.
12. Manager contacts the user, prepares office access, checks documents, handles
    AML/KYC/KYT as required, and completes the cash RUB payout offline.

## BUY_USDT User Flow

1. User opens the Mini App and selects BUY_USDT.
2. User enters RUB amount, client TRC20 wallet, and full name.
3. App validates the client wallet as a TRON base58 address.
4. App shows a confirmation screen:
   - RUB amount;
   - calculated USDT amount;
   - rate snapshot;
   - customer full name;
   - client TRC20 payout wallet;
   - network: TRON TRC-20.
5. User creates the order.
6. Backend creates a BUY order without reserving any deposit address.
7. Order appears on Home under active orders.
8. Manager contacts the user and prepares office access.
9. User comes to the office with RUB cash.
10. After cash acceptance, manager manually sends USDT to
    `clientPayoutAddress`.
11. Manager records the outgoing TRON transaction hash and completes the order.

## Bot And Manager Messaging

The Mini App is not the whole customer experience. The Telegram bot and human
manager continue the flow after order creation.

System bot messages should include:

- order direction and public order id;
- rate snapshot;
- customer full name;
- deposit address for SELL_USDT;
- client payout wallet confirmation for BUY_USDT;
- document and office process reminders;
- expiration and rate-lock warnings.

Manager messages should cover:

- office address and visit timing;
- access pass requirements;
- document requirements;
- contract or cash handling instructions;
- escalation for late, mismatched, or suspicious transfers.

## Open Decisions For Our Product

- Final brand name and logo are not locked by these references.
- Exact Russian UI copy should be localized during frontend implementation.
- Referral balance and verification status can be present in Profile, but their
  backend semantics need a separate implementation task.
- The initial frontend can display referral/profile placeholders only when the
  data contract makes the state explicit.
