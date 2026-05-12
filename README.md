# Obmennik Offline Backend MVP

Backend foundation for an offline USDT exchange MVP. The current scope is API,
order lifecycle, public TRON address pool handling, TRON USDT deposit watching,
manual manager operations, and operational scripts.

This repository must not store seed phrases, private keys, API keys, real bot
tokens, or customer documents. Keep wallet seed material offline.

## What The MVP Does

- Creates `BUY_USDT` office orders from a client RUB amount and payout TRC20
  address.
- Creates `SELL_USDT` office orders from a client USDT amount and reserves one
  deposit TRON address from the public address pool.
- Calculates order amounts on the server from static MVP buy/sell rates.
- Verifies Telegram Mini App initData when `TELEGRAM_BOT_TOKEN` is configured.
- Protects admin APIs with `ADMIN_API_TOKEN` and local admin accounts.
- Requires `x-admin-actor-id` on admin mutations so audit logs are not taken
  from a spoofable request body.
- Watches TRON USDT deposits through the provider abstraction and records
  matching transfers idempotently.
- Expires stale open orders through a separate CLI.

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
ADMIN_API_TOKEN=""
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS="86400"
ADMIN_USERNAME="manager-1"
ADMIN_PASSWORD=""
```

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
