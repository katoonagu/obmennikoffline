# Operations Scheduler Contract

This backend exposes watcher and expiration jobs as one-shot commands. The API
process must not run these loops internally.

## Commands

Build before scheduled jobs in production:

```powershell
pnpm build
```

Run one TRON deposit watcher pass:

```powershell
pnpm tron:watch-deposits-once
```

Run one order expiration pass:

```powershell
pnpm orders:expire-open
```

Run the staging smoke suite after build:

```powershell
pnpm staging:smoke
```

## Scheduler Rules

- Run each command with the same `DATABASE_URL` and environment as the API.
- Production API processes must set `NODE_ENV=production`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`, and
  `ADMIN_API_TOKEN` before traffic is exposed. Set `ADMIN_ACTOR_IDS` to the
  comma-separated manager actor ids accepted in audit headers.
  `TELEGRAM_BOT_TOKEN` must use `<numeric-bot-id>:<bot-token-secret>`, with
  the token secret at least 30 URL-safe characters.
  `ADMIN_API_TOKEN` must be at least 32 characters, must not contain
  whitespace, must not be a repeated placeholder, and must be distinct from `TELEGRAM_BOT_TOKEN`.
  No empty or duplicate actor ids are allowed in `ADMIN_ACTOR_IDS`.
- `pnpm staging:smoke` validates production config guard inputs and TRON
  provider connectivity with a read-only latest-block call. It performs no mainnet transaction. If `TELEGRAM_INIT_DATA` is present, it also validates the
  real Telegram Mini App initData signature; otherwise that check is reported as
  skipped. The report contains sanitized `productionConfig`, `tronProvider`, and
  `telegramInitData` checks and must not be treated as a wallet or payout test.
- Provision the first admin account before exposing admin operations:

```powershell
$env:ADMIN_USERNAME="manager-1"
$env:ADMIN_PASSWORD="<strong admin password>"
$env:ADMIN_ROLE="manager"
pnpm build
pnpm admin:create-user
```

  Admin passwords are stored only as scrypt hashes. The command output contains
  only safe admin fields and never prints the password or password hash.
- Disable an admin account to revoke subsequent admin session use:

```powershell
$env:ADMIN_USERNAME="manager-1"
pnpm build
pnpm admin:disable-user
```

  The disable command output contains only safe admin fields and preserves the
  first `disabledAt` timestamp if the account was already disabled.
- Keep a single active instance of each job. Use a scheduler lock, process
  manager singleton, or one replica for the job worker.
- TRON watcher env:
  - `TRON_FULL_HOST`: read-only TRON RPC/API base URL. Defaults to
    `https://api.trongrid.io` when unset.
  - `TRON_EVENT_SERVER`: optional TRON event server URL.
  - `TRON_API_KEY`: optional provider API key. Keep real keys outside the repo.
  - `TRON_WATCHER_CURSOR_ID`: optional cursor id. Defaults to
    `tron-usdt-deposits`.
  - `TRON_WATCHER_ADDRESS_BATCH_SIZE`: watched deposit address batch size.
    Defaults to `100` when unset.
- Treat `pnpm tron:watch-deposits-once` as a one-shot command. The external
  scheduler owns retries and intervals.
- recommended interval for `pnpm tron:watch-deposits-once`: every 1 minute for
  MVP operations, adjusted to provider limits.
- `ORDER_EXPIRATION_LIMIT` controls the max expired orders per one
  `pnpm orders:expire-open` pass. Defaults to `100` and is capped by the
  service at `500`.
- recommended interval for `pnpm orders:expire-open`: every 1 minute if the UI
  shows live countdowns, otherwise every 5 minutes is acceptable.
- Configure the watcher cursor before enabling the schedule:

```powershell
pnpm tron:configure-watcher-cursor -- --last-processed-block 12345678 --confirmation-depth 20 --max-block-range 100
```

`confirmation-depth` must be greater than zero in production so the watcher
does not finalize unconfirmed blocks.

## API Auth Contract

Client order and profile routes use signed Telegram Mini App initData when
`TELEGRAM_BOT_TOKEN` is configured:

```http
Authorization: tma <initData>
```

For local Mini App API smoke tests without Telegram WebApp `initData`, ops may
temporarily set `MINIAPP_DEV_AUTH_ENABLED=true` on the API process and use a
public `VITE_MINIAPP_DEV_USER_ID` in the browser. This fallback is for local
development only; production startup rejects it.

Admin routes use a bearer token and a manager actor header:

```http
POST /api/admin/session
```

The login body contains `username` and `password`. The response contains an
admin session token and a safe admin DTO. Use it on admin routes:

```http
Authorization: Bearer <admin session token>
```

For this MVP, `ADMIN_API_TOKEN` is also the server-side HMAC signing secret for
admin sessions.
Admin session tokens are revalidated against the active admin account before
admin routes run. Disabling an admin account invalidates subsequent admin session use.

Ops scripts may still use `ADMIN_API_TOKEN` with `x-admin-actor-id`:

```http
Authorization: Bearer <ADMIN_API_TOKEN>
x-admin-actor-id: manager-1
```

`actorId` must not be sent in admin request bodies.
`x-admin-actor-id` must be one of `ADMIN_ACTOR_IDS` in production.
Admin mutation comments are optional audit text; when sent, they are trimmed and capped at 500 characters.

## Deposit Policy

Clients are instructed to send one TRC20 USDT transaction per SELL order. If a
client sends a partial or repeated transfer, the watcher still keeps the address
eligible while the order is in `manager_review` or `late_payment`. The extra
transfers are recorded idempotently as blockchain transactions and the order
stays under manager control.

The watcher result includes `failedTransfers`. Any non-empty value should be
logged and alerted because it means at least one transfer could not be normalized
or ingested during that pass.

## Out Of Scope

- No automatic sweep is scheduled in MVP.
- No automatic crypto payout is scheduled in MVP.
- No mainnet live spike should be run from an unattended scheduler.
