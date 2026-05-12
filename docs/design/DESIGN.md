# Offline Exchange Mini App Design System

Status: draft design direction
Scope: user-facing Telegram Mini App, not admin/backoffice

## Positioning

This is a mobile-first Telegram Mini App for offline USDT/RUB exchange. The
interface should feel like a trustworthy financial utility with a real office
behind it, not a landing page and not a crypto casino.

The primary user is a Telegram customer who wants to create a cash exchange
order quickly, understand the rate, avoid wallet mistakes, and know what will
happen next in the office.

## Reference Inputs

The reference photos are source material. In practical terms, reference photos
are source material for:

- office presence and trust cues;
- the order creation flow;
- density of amount/rate/status information;
- how QR and wallet addresses are presented;
- bot plus manager handoff expectations.

They are not a brand identity source. Do not copy another brand verbatim.

## Visual Tone

Target:

- restrained;
- confident;
- operational;
- high-contrast enough for mobile use;
- calm under financial pressure;
- readable in Telegram WebView.

Avoid:

- avoid purple-blue AI gradients;
- purple-blue AI gradients;
- decorative blobs and generic glass cards;
- marketing hero sections;
- crypto neon aesthetics;
- fake trading dashboards;
- excessive animation;
- UI cards nested inside other cards.

## Layout Principles

- App first screen starts with the working experience: rates, BUY/SELL actions,
  active orders.
- Use compact but comfortable mobile spacing.
- Use stable component heights for amount panels, order cards, bottom nav, QR
  blocks, and action buttons.
- Use visual hierarchy to make the next action obvious.
- Use cards only for repeated items or genuinely framed tools. Avoid page
  sections styled as floating cards.
- Keep the next section partially visible when a screen has a top summary.

## Color Direction

Base:

- near-white or very dark neutral depending on final direction;
- one strong accent only;
- semantic status colors reserved for status and warnings.

Recommended first direction:

- neutral charcoal text;
- warm white background;
- dark action buttons;
- single money/security accent in green or teal;
- amber only for warnings and expiry.

## Typography

- Use a modern sans-serif for all UI.
- Use tabular or mono numerals for amounts, rates, order ids, and wallet
  fragments.
- Do not use decorative serif typography inside forms, status cards, or order
  details.
- Keep mobile headings compact; reserve large type for the top home summary
  only.

## Components

Core components:

- rate strip;
- BUY/SELL action pair;
- order card;
- amount input;
- TRON address input;
- full name fields;
- confirmation summary;
- QR/address block;
- status badge;
- bottom navigation;
- profile stats row;
- legal/rules checkbox;
- inline error message;
- skeleton loader;
- retry banner.

Icon usage:

- use icons for copy, QR, support, profile, history, back, close, refresh, and
  external links;
- avoid text-only tool buttons when a familiar icon exists;
- every non-obvious icon needs a tooltip or accessible label.

## Motion

Motion should be subtle and functional:

- button press feedback;
- segmented navigation transition;
- skeleton shimmer if needed;
- status update highlight;
- no continuous decorative motion on financial forms.

## UX Safety

- Network must always say TRON TRC-20 near addresses and QR codes.
- Wallet address copy action must be explicit.
- SELL warning must say that only USDT on TRON TRC-20 is accepted.
- BUY flow must make clear that the customer receives USDT to
  `clientPayoutAddress`.
- Expiry/rate-lock text must be visible before order creation.
- Do not display unavailable referral or verification data as if it were real.

## Implementation Notes

- Telegram Mini App is a website running in Telegram WebView.
- The first frontend implementation should target mobile web dimensions first.
- Desktop can be a constrained preview shell, not a separate product surface.
- Use the API contracts in `src/api/routeContracts.ts` as the data source.
- Use `docs/reference-screenshots/exchar-bot-flow.md` as the flow reference.
- Use `docs/design/telegram-mini-app-ui-spec.md` as the screen contract.
