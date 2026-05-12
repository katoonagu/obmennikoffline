# Blockers

These items require external input, funding, credentials, or an explicit live
operations decision. They are intentionally not solved by the local MVP code.

## External Actions Required

- TRON live spike: verify real inactive TRON address behavior with controlled
  test funds before promising mainnet reliability.
- Telegram bot token: production Mini App auth cannot be enabled without the
  real `TELEGRAM_BOT_TOKEN` configured outside the repo.
- paid provider: choose and fund a TRON provider plan before production watcher
  load testing. Candidates remain outside this MVP implementation.
- Mainnet operations: no mainnet transfer, sweep, or payout should happen until
  an explicit funded runbook and approval flow exists.
- Seed and private key custody: real seed phrases and private keys must stay out
  of the repo and out of application logs. Production custody still needs a
  signed decision: offline generation only, Vault/KMS, HSM, Fireblocks, BitGo,
  or another approved wallet service.

## Not Blocked

- Local API development with fake/static rates.
- Public address pool import using public addresses only.
- One-shot watcher and expiration command testing without real mainnet
  transactions.
- Manual manager audit flows behind `ADMIN_API_TOKEN` and `x-admin-actor-id`.
