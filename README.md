# Obmennik Offline

Telegram Mini App and backend foundation for an offline USDT/RUB exchange MVP.
The system lets a client open the bot, see the current rate, create a BUY or
SELL order, and complete the final exchange with a manager in the office.

This is not only a Telegram form. It is an operator system for an offline
exchange: client Mini App, backend API, PostgreSQL database, public TRON address
pool, TRON USDT deposit watcher, manager actions, audit log, and operational
scripts.

The first version follows a strict security boundary: the backend does not store
seed phrases, private keys, API keys, real bot tokens, or customer documents.
Wallet seed material stays offline. The server stores orders, statuses, public
TRON addresses, tx ids, audit events, and reconciliation data only.

## Product Logic

The product has two directions.

| Direction | Client action | System action | Manager action |
| --- | --- | --- | --- |
| `SELL_USDT` | Enters USDT amount and FIO | Calculates RUB, creates an office order, reserves one public TRON deposit address | Verifies incoming USDT, AML, office payout, and closes the order |
| `BUY_USDT` | Enters RUB amount, FIO, and their TRC20 payout address | Calculates USDT and creates an office order without reserving a backend deposit address | Accepts RUB in the office, manually sends USDT from an external wallet, records payout tx id, and closes the order |

Phase 1 never sends cryptocurrency automatically. Automatic sweep and automatic
payout are outside MVP scope because they require a separate custody decision.
This keeps private keys out of the backend and keeps money movement under a
manager decision.

## Current MVP Scope

| Block | What exists |
| --- | --- |
| Backend API | Fastify API for rates, orders, profile, manager actions, and admin operations |
| Orders lifecycle | BUY/SELL orders, amounts, rate snapshots, TTLs, and statuses |
| Telegram auth | Telegram Mini App `initData` validation when `TELEGRAM_BOT_TOKEN` is configured |
| Address pool | Public TRON address import and reservation for SELL orders |
| TRON watcher | One-shot USDT TRC20 deposit detection through a provider abstraction |
| Admin API | Admin session, active order queue, status changes, manual payout tx id recording |
| Audit log | Manager/system action history for imports, mutations, and operational changes |
| CLI scripts | Address generation, watcher pass, expiration job, admin provisioning |
| Mini App | React/Vite shell, API client, order forms, view models, runtime config |
| Tests | Vitest coverage for API, orders, TRON, wallet, telegram, admin, docs, and Mini App contracts |

## Technical Stack

| Layer | Stack |
| --- | --- |
| Backend | Fastify |
| Database | PostgreSQL + Prisma |
| Validation | Zod |
| Crypto/TRON | TronWeb, ethers, bip39 |
| Frontend Mini App | React + Vite |
| UI icons | lucide-react |
| Tests | Vitest |
| Package manager | pnpm |

The stack is intentionally simple for MVP: strict TypeScript types, validated
request/response contracts, separate backend/Mini App/watcher surfaces, and
small operational scripts.

## Architecture

| Block | Responsibility |
| --- | --- |
| Telegram Mini App | Shows rates, creates BUY/SELL orders, shows active orders and profile |
| Public API | Accepts client requests, verifies Telegram identity, creates orders |
| Admin API | Gives managers order queue, status mutations, comments, and payout tx id recording |
| Orders service | Calculates amounts, snapshots rates, creates orders, manages TTL/status |
| Address pool | Stores public TRON addresses and reserves one address per SELL order |
| TRON watcher | Finds incoming USDT TRC20 transfers and links tx ids to orders |
| Audit log | Records who changed status, imported addresses, or recorded payouts |

## Database Model

| Entity | Purpose |
| --- | --- |
| `User` | Local system user |
| `TelegramProfile` | Telegram id, username, first name, last name |
| `AdminUser` | Manager or owner account |
| `Order` | BUY or SELL USDT office order |
| `DepositAddress` | Public TRON address from the address pool |
| `BlockchainTransaction` | Incoming USDT transfer: tx id, amount, block, addresses |
| `WatcherCursor` | TRON watcher block position |
| `AuditLog` | Manager/system action history |

Important order statuses:

| Status | Meaning |
| --- | --- |
| `awaiting_deposit` | Waiting for client USDT transfer |
| `awaiting_office_visit` | Waiting for the client in the office |
| `funds_detected` | Watcher detected incoming USDT |
| `pending_aml` | AML review is in progress |
| `manager_review` | Manual manager review is required |
| `ready_for_cash_payout` | RUB cash payout can be prepared |
| `ready_for_crypto_payout` | USDT payout can be prepared |
| `completed` | Order is closed successfully |
| `cancelled` / `expired` / `rejected` | Order did not complete |
| `late_payment` | Transfer arrived late or needs dispute handling |

## API Surface

Public API:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/rates/usdt-rub` | Read current static MVP USDT/RUB rates |
| `POST` | `/api/orders/buy` | Create a BUY USDT office order |
| `POST` | `/api/orders/sell` | Create a SELL USDT office order |
| `GET` | `/api/orders/active` | Read active client orders |
| `GET` | `/api/orders/history` | Read client order history |
| `GET` | `/api/orders/:publicId` | Read one order detail |
| `GET` | `/api/profile` | Read the current client profile |

Admin API:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/session` | Create an admin session |
| `POST` | `/api/address-pool/import` | Import public TRON addresses |
| `GET` | `/api/admin/orders/active` | Read active order queue |
| `POST` | `/api/admin/orders/:publicId/status` | Change order status |
| `POST` | `/api/admin/orders/:publicId/manual-crypto-payout` | Record manual crypto payout tx id |

Route contracts and request/response schemas live in the backend code and tests.
For Telegram-authenticated public requests, the backend resolves the user from
signed Mini App `initData`; body/query `userId` is only a local fallback when no
bot token is configured.

## Mini App Flow

The Mini App gives the client a focused flow:

- Home: rates, BUY/SELL actions, active orders.
- BUY form: RUB amount, FIO fields, and the client's full TRC20 payout address.
- BUY confirmation: quote, rate lock, FIO, and payout wallet before creation.
- BUY created/detail: office instructions and payout wallet.
- SELL form: USDT amount, FIO fields, terms acceptance.
- SELL confirmation: quote, rate lock, network, and order TTL before address reservation.
- SELL created/detail: reserved TRON deposit address and QR code.
- Profile: Telegram identity, stored FIO, and order stats.

The Mini App supports two runtime modes: `mock` for UI/design work without a
backend and `api` for local Fastify integration.

## Address Pool And Watcher

The owner creates seed material outside the backend, ideally on an offline or
air-gapped machine. The backend imports only a public CSV:

```csv
network,asset,derivation_index,address
```

Imported addresses start as `available`. A SELL order atomically reserves one
address, marks it `reserved`, and attaches it to the order. If no address is
available, the manager must import a new public address pool.

The TRON watcher is intentionally one-shot and external to the API process. Run
it through cron, systemd timer, Docker scheduled job, or another scheduler. It
loads reserved addresses, asks the TRON provider for USDT TRC20 transfers,
normalizes events, records `BlockchainTransaction`, links transfers to orders,
and advances `WatcherCursor`.

Partial, repeated, or late transfers are recorded for manager review; final
handling remains a manager decision.

## Manager Workflow

Managers do not work with seed phrases or private keys in this system. They work
with orders, checks, statuses, comments, and tx ids.

Typical flow:

1. Manager signs in to the admin surface.
2. Manager opens the active order queue.
3. For SELL, manager verifies detected USDT, AML state, and office RUB payout.
4. For BUY, manager accepts RUB in the office, manually sends USDT externally,
   records payout tx id, and closes the order.
5. Disputed orders move through `manager_review`, `pending_aml`,
   `late_payment`, `rejected`, or `cancelled`.
6. Every important operation writes an audit log event.

Admin mutation audit identity must come from admin session state or validated
`x-admin-actor-id`; request body `actorId` is not trusted.

## Phase 1 Security Boundary

What Phase 1 does:

- Stores only public TRON addresses, never private keys.
- Verifies Telegram Mini App `initData` on public client routes in production.
- Protects admin APIs with admin sessions and server-side secrets.
- Stores admin passwords only as hashes.
- Writes manager/system actions to audit log.
- Keeps real API keys, bot tokens, provider keys, and seed material in the
  deployment environment or offline custody process, not in the repository.

What Phase 1 does not do:

- No automatic payouts.
- No sweep jobs.
- No private key custody in backend.
- No multi-network USDT support.
- No bank integration.
- No online KYC provider integration.
- No automatic AML/KYT provider integration.
- No external security audit claim.

If the server is compromised, the attacker may attack orders and operational
data, but should not be able to extract seed material or sign crypto payouts
from backend storage.

## Commercial MVP Gaps

| Gap | Expected result |
| --- | --- |
| Mini App polish | Finished screens, validation errors, empty states, loading states, final copy |
| Admin dashboard | Queue, order detail, filters, statuses, comments, payout tx id entry |
| Rate management | Clear owner/manager rate update process and rate-lock behavior |
| Reports MVP | Turnover, profit, order counts, and Excel export |
| Support flow | Client-manager communication path and visibility for staff |
| TRON provider spike | Confirm provider sees incoming USDT on new inactive TRON addresses |
| Deployment | Staging, production env, process manager, scheduled jobs |
| Monitoring | Watcher errors, stuck orders, low address pool, provider failures |
| QA | BUY/SELL, late payment, partial payment, expired order, manual payout |

Phase 2 should decide the custody model before adding sweep or automatic payout:
offline-only, Vault/KMS, HSM, MPC, Fireblocks, BitGo, or another wallet service.

## Local Setup

Install dependencies:

```powershell
pnpm install
```

Create local env from the example:

```powershell
Copy-Item .env.example .env
```

### Local Docker Postgres

For local self-hosted Postgres, run a local container and point
`DATABASE_URL` at it:

```powershell
docker run --name obmennikoffline-postgres -e POSTGRES_DB=obmennikoffline -e POSTGRES_USER=obmennikoffline_app -e POSTGRES_PASSWORD="<local password>" -p 5432:5432 -v obmennikoffline_postgres_data:/var/lib/postgresql/data -d postgres:16-alpine
pnpm exec prisma migrate deploy
```

The FIO migration is intended for the current MVP data model. If a database
already contains pre-FIO orders, backfill them before production cutover; until
backfilled, API/UI responses show an explicit legacy placeholder instead of
silent blank FIO fields.

Required MVP rate env. Rates must be positive decimal strings.
`USDT_RUB_BUY_RATE must be greater than USDT_RUB_SELL_RATE`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/obmennikoffline"
NODE_ENV="development"
USDT_RUB_BUY_RATE="76.850000"
USDT_RUB_SELL_RATE="76.250000"
```

Optional in local development:

```env
TELEGRAM_BOT_TOKEN=""
TELEGRAM_INIT_DATA=""
ADMIN_API_TOKEN=""
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS="86400"
ADMIN_USERNAME="manager-1"
ADMIN_PASSWORD=""
```

`TELEGRAM_INIT_DATA` is an optional one-shot staging smoke input. Paste a fresh
Telegram WebApp initData string only into local/private env when validating real
Mini App auth. Do not commit it. Without it, `pnpm staging:smoke` reports the
`telegramInitData` check as `skipped` rather than failed.

Optional one-shot job env:

```env
TRON_FULL_HOST="https://api.trongrid.io"
TRON_EVENT_SERVER=""
TRON_API_KEY=""
TRON_WATCHER_CURSOR_ID="tron-usdt-deposits"
TRON_WATCHER_ADDRESS_BATCH_SIZE="100"
ORDER_EXPIRATION_LIMIT="100"
```

Keep real `TRON_API_KEY` values in the deployment environment, not in the repo.

In `NODE_ENV=production`, both `TELEGRAM_BOT_TOKEN` and `ADMIN_API_TOKEN` are
required. `ADMIN_API_TOKEN` must be at least 32 characters, must not contain whitespace,
must not be a repeated placeholder, and must be distinct from `TELEGRAM_BOT_TOKEN`.
`TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` and `ADMIN_ACTOR_IDS` must be set explicitly.
No empty or duplicate actor ids are allowed in `ADMIN_ACTOR_IDS`.
`TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` must be no more than 86400 in production.
The server will refuse to start without these guard inputs. `TELEGRAM_BOT_TOKEN`
must have the Telegram bot token shape `<numeric-bot-id>:<bot-token-secret>`;
the token secret must be at least 30 URL-safe characters.

## Run API

Development API:

```powershell
pnpm dev:api
```

Development Mini App:

```powershell
pnpm dev:miniapp
```

The Mini App defaults to mock fixture mode for design and offline UI work:

```env
VITE_APP_ENV="local"
VITE_MINIAPP_API_MODE="mock"
```

To point it at the local Fastify API, start `pnpm dev:api`, then restart the
Vite dev server with public browser config:

```env
MINIAPP_CORS_ORIGINS="http://127.0.0.1:5173"
MINIAPP_DEV_AUTH_ENABLED="true"
VITE_APP_ENV="local"
VITE_MINIAPP_API_MODE="api"
VITE_MINIAPP_API_BASE_URL="http://127.0.0.1:3000"
VITE_MINIAPP_DEV_USER_ID="dev-user-1"
```

`MINIAPP_CORS_ORIGINS` is read by the Fastify API process and must contain exact
browser origins only, for example `http://127.0.0.1:5173` for local Vite.

`VITE_` values are public browser config, not secrets. Do not put bot tokens,
admin tokens, TRON API keys, seed phrases, or private keys in Vite env vars.
When Telegram WebApp `initData` is present, the Mini App sends
`Authorization: tma <initData>`. `VITE_MINIAPP_DEV_USER_ID` is only a local
fallback. If the local API has `TELEGRAM_BOT_TOKEN` configured, set
`MINIAPP_DEV_AUTH_ENABLED="true"` for local smoke tests without Telegram
WebApp `initData`. Production startup rejects that flag, so production
order/profile routes require signed Telegram initData.

For staging or production Mini App builds, set `VITE_APP_ENV="staging"` or
`VITE_APP_ENV="production"`. The frontend guard rejects `mock` mode, missing
`VITE_MINIAPP_API_BASE_URL`, `VITE_MINIAPP_DEV_USER_ID`, and browser runtime
without Telegram WebApp `initData`.

Build:

```powershell
pnpm build
```

Production API runs from built JavaScript through your process manager after
`pnpm build`. Set `NODE_ENV=production`, `DATABASE_URL`, rates,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`, and
`ADMIN_API_TOKEN` in the process environment. Set `ADMIN_ACTOR_IDS` to the
comma-separated manager actor ids accepted in `x-admin-actor-id`. No empty or
duplicate actor ids are allowed.

Run the staging smoke suite after `pnpm build` to validate production guard
settings and read-only provider connectivity without making a mainnet
transaction:

```powershell
pnpm build
pnpm staging:smoke
```

The JSON report contains sanitized `productionConfig`, `tronProvider`, and
`telegramInitData` checks. It reports whether secrets are configured, but never
prints `ADMIN_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TRON_API_KEY`, or raw
`TELEGRAM_INIT_DATA`.

## Admin Account Provisioning

Admin passwords are stored only as scrypt hashes. To create or rotate an admin
account password, set one-shot provisioning env and run the built CLI:

```powershell
$env:ADMIN_USERNAME="manager-1"
$env:ADMIN_PASSWORD="<strong admin password>"
$env:ADMIN_ROLE="manager"
pnpm build
pnpm admin:create-user
```

`ADMIN_ROLE` may be `manager` or `owner`; it defaults to `manager`. The command
prints only `id`, `username`, and `role`. It does not print the password or the
stored hash.

Disable an admin account to revoke subsequent admin session use:

```powershell
$env:ADMIN_USERNAME="manager-1"
pnpm build
pnpm admin:disable-user
```

The disable command prints only safe admin fields and preserves the first
`disabledAt` timestamp if the account was already disabled.

## Public API Auth

When `TELEGRAM_BOT_TOKEN` is configured, client order and profile routes must
send signed Telegram Mini App initData:

```http
Authorization: tma <initData>
```

The API resolves the local user from Telegram identity in that mode. Body or
query `userId` values are ignored for authenticated Telegram requests and are
only a local-development fallback when no bot token is configured.

The Mini App can read the current public static MVP rates without auth:

```http
GET /api/rates/usdt-rub
```

The response contains the `USDT_RUB` pair with normalized `buyRate` and
`sellRate` decimal strings.

## Public TRON Address Pool

Generate a public-only CSV from an offline mnemonic:

```powershell
$env:TRON_MNEMONIC="<offline BIP39 mnemonic>"
pnpm wallet:generate-address-pool -- --count 100 --start-index 0 --out .\address-pool.csv
```

The generated CSV contains public addresses and derivation indexes only. Do not
commit CSV files or seed phrases. Import the public rows through the admin API.

## Admin API Rules

Admin routes are enabled only when `ADMIN_API_TOKEN` is set. Requests must use:

```http
POST /api/admin/session
```

with JSON body:

```json
{
  "username": "manager-1",
  "password": "<admin password>"
}
```

The response contains `token` and a safe `admin` DTO. Use that token on admin
routes:

```http
Authorization: Bearer <admin session token>
```

For this MVP, `ADMIN_API_TOKEN` is also the server-side HMAC signing secret for
admin session tokens, so keep it random and private.
Admin session tokens are revalidated against the active admin account before
admin routes run. Disabling an admin account invalidates subsequent admin session use.

Ops scripts may still use `ADMIN_API_TOKEN` with `x-admin-actor-id`:

```http
Authorization: Bearer <ADMIN_API_TOKEN>
x-admin-actor-id: manager-1
```

For session-authenticated manager mutations, the session username is written to
audit logs. For ops-token mutations, `x-admin-actor-id` is required and must be
one of `ADMIN_ACTOR_IDS` in production. Do not send
or trust `actorId` in request bodies. Actor ids may contain only letters, digits, dot, underscore, colon, or hyphen, up to 64 characters.
Allowed actor id characters: letters, digits, dot, underscore, colon, or hyphen.
Admin mutation comments are optional audit text; when sent, they are trimmed and capped at 500 characters.

## TRON Watcher

Detailed scheduler rules live in `docs/operations-scheduler.md`.

Configure the watcher cursor after choosing a starting TRON block:

```powershell
pnpm build
pnpm tron:configure-watcher-cursor -- --last-processed-block 12345678 --confirmation-depth 20 --max-block-range 100
```

Run one watcher pass:

```powershell
pnpm tron:watch-deposits-once
```

The watcher uses `TRON_FULL_HOST`, optional `TRON_EVENT_SERVER`, optional
`TRON_API_KEY`, `TRON_WATCHER_CURSOR_ID`, and
`TRON_WATCHER_ADDRESS_BATCH_SIZE` from the process environment.
The watcher is intentionally one-shot. Run it from cron, systemd timer, Docker
scheduled job, or another scheduler. Do not run live mainnet tests from this
repo without an explicit funded test plan.

Clients are instructed to transfer SELL order USDT in one transaction. If a
client sends a partial or repeated transfer, the watcher continues recording
follow-up transfers while the order is in `manager_review` or `late_payment`;
the manager remains responsible for the final decision.

## Expiration Job

Expire stale `awaiting_deposit` and `awaiting_office_visit` orders:

```powershell
pnpm build
pnpm orders:expire-open
```

Use `ORDER_EXPIRATION_LIMIT` to cap each one-shot expiration pass when needed.
Schedule this separately from the API process.

## Verification

Run the backend verification gate:

```powershell
pnpm lint:types
pnpm test
pnpm build
$env:DATABASE_URL="postgresql://user:password@localhost:5432/obmennikoffline"; pnpm exec prisma validate
```

## Known Non-MVP / Blocked Items

See `BLOCKERS.md` for the current external blockers list.

- Real TRON live spike for inactive addresses is not done here.
- No paid provider is configured.
- No mainnet transactions are performed by this codebase.
- Automatic sweep and automatic payout are intentionally out of MVP scope.
- Full RBAC and refreshable admin sessions are not implemented yet.
