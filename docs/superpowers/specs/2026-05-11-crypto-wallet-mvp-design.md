# Crypto Wallet MVP Design

Дата: 2026-05-11
Статус: Draft, согласованная MVP-логика до реализации
Проект: Telegram Mini App для офлайн-обменника USDT/RUB

## 1. Цель

Спроектировать первую версию крипто-логики для Telegram Mini App офлайн-обменника:

- пользователь создает заявку на покупку или продажу USDT;
- основная сделка завершается в офисе;
- система помогает менеджеру видеть заявки, статусы и крипто-поступления;
- backend не хранит seed phrase, private keys и не выполняет автоматические выводы;
- архитектура оставляет путь к будущей Phase 2 с wallet-service, sweep и payout automation.

## 2. Утвержденные Решения MVP

1. Первая сеть: `TRON / TRC20`.
2. Актив: `USDT`.
3. Направления:
   - `SELL_USDT`: клиент продает USDT и получает RUB в офисе.
   - `BUY_USDT`: клиент покупает USDT за RUB в офисе.
4. Для `SELL_USDT` система выдает уникальный TRC20 deposit address на заявку.
5. Для `BUY_USDT` клиент указывает свой TRC20 payout address.
6. Deposit addresses генерируются заранее из одного master HD wallet.
7. В backend загружается только public address pool: адреса и derivation indexes.
8. Seed phrase/private keys не хранятся в основном backend, базе данных, `.env` или админке.
9. Pre-activation TRON-адресов в MVP не делается.
10. Автоматический sweep и автоматическая отправка USDT в MVP не входят.
11. Менеджер вручную выполняет payout/sweep во внешнем кошельке или отдельном операционном процессе и фиксирует `tx_hash`.
12. Phase 2 будет отдельной: wallet-service, Fireblocks/BitGo или другой custody-контур.

## 3. Почему Не Один Общий Адрес

Один общий адрес для всех заявок не подходит для MVP:

- сложно надежно сопоставлять входящую транзакцию с конкретной заявкой;
- два клиента могут отправить одинаковую сумму;
- клиент может отправить после истечения времени заявки;
- менеджеры начнут вручную сверять время, сумму и сообщения;
- AML/KYT и аудит становятся слабее.

Вместо этого используется уникальный address per order. Если USDT пришел на адрес `TX...`, система знает, к какой заявке относится депозит.

## 4. Master HD Wallet

Master HD wallet - это один seed, из которого детерминированно выводится много адресов.

Пример:

```text
seed phrase
  -> index 0 -> TRON address 0 + private key 0
  -> index 1 -> TRON address 1 + private key 1
  -> index 2 -> TRON address 2 + private key 2
```

На уровне интерфейса это может выглядеть как один кошелек с множеством аккаунтов. На уровне TRON каждый адрес имеет отдельный баланс и требует своего private key для отправки средств.

Для MVP:

- offline/ops-скрипт создает seed;
- из seed генерируются 500-1000 TRC20-адресов;
- в backend импортируется CSV только с публичными адресами и indexes;
- seed/private keys хранятся отдельно у владельца бизнеса;
- восстановить private key для address index можно только вне основного приложения.

## 5. Адресный Пул

Таблица `deposit_addresses` хранит:

- `id`
- `network`: `TRON`
- `asset`: `USDT`
- `address`
- `derivation_index`
- `status`: `available`, `reserved`, `funded`, `expired`, `late_funded`, `disabled`
- `assigned_order_id`
- `reserved_at`
- `expires_at`
- `funded_at`
- `created_at`

Жизненный цикл:

```text
available
  -> reserved, когда создана заявка SELL_USDT
  -> funded, когда watcher увидел подходящий USDT deposit
  -> expired, если время заявки истекло без депозита
  -> late_funded, если депозит пришел после истечения срока
```

Адрес после использования не возвращается в `available`, чтобы не смешивать разные сделки и не ухудшать аудит.

## 6. Flow: Продать USDT

Клиент хочет продать USDT и получить RUB в офисе.

1. Клиент открывает Telegram Mini App.
2. Backend валидирует Telegram `initData`.
3. Клиент выбирает `Продать USDT`.
4. Клиент вводит сумму USDT и ФИО/данные для пропуска, если нужны.
5. Backend создает `order` с направлением `SELL_USDT`.
6. Backend резервирует свободный TRC20 address из address pool.
7. Mini App показывает:
   - номер заявки;
   - QR;
   - TRC20 address;
   - сумму;
   - курс;
   - время жизни заявки;
   - предупреждение отправить одной транзакцией.
8. TRON watcher ищет incoming USDT transfer на адрес заявки.
9. Если найден корректный депозит:
   - создается запись `blockchain_transactions`;
   - заявка получает статус `funds_detected` или `pending_aml`;
   - менеджер получает уведомление.
10. Менеджер проверяет AML/KYT и офлайн-условия.
11. Сделка завершается в офисе, RUB выдаются вручную.
12. Менеджер закрывает заявку в backoffice.

Late payment:

- если депозит пришел после истечения срока, заявка не закрывается автоматически;
- статус: `late_payment`;
- менеджер вручную решает: принять по текущему курсу, пересчитать, вернуть, эскалировать.

## 7. Flow: Купить USDT

Клиент хочет купить USDT за RUB.

1. Клиент открывает Mini App.
2. Клиент выбирает `Купить USDT`.
3. Клиент вводит:
   - сумму в RUB;
   - свой TRC20 payout address;
   - ФИО/данные для пропуска, если нужны.
4. Backend создает `order` с направлением `BUY_USDT`.
5. Заявка попадает менеджеру.
6. Клиент приходит в офис и передает RUB.
7. Менеджер вручную отправляет USDT на payout address клиента из внешнего кошелька.
8. Менеджер вносит `tx_hash` в backoffice.
9. Система сохраняет исходящую транзакцию и закрывает заявку после ручного подтверждения.

В MVP кнопки автоматической отправки USDT нет.

## 8. Основные Статусы Заявок

Базовый набор:

- `draft`
- `awaiting_deposit` - для `SELL_USDT`
- `awaiting_office_visit`
- `funds_detected`
- `pending_aml`
- `manager_review`
- `ready_for_cash_payout`
- `ready_for_crypto_payout`
- `completed`
- `cancelled`
- `expired`
- `late_payment`
- `rejected`

Статусы меняются только через явные события. Все ручные изменения пишутся в audit log.

## 9. TRON Watcher

Watcher - отдельный worker/process внутри backend-проекта.

Задачи:

- читать новые TRC20 USDT transfers;
- фильтровать события по адресам из `deposit_addresses`;
- проверять `to_address`, `amount`, `tx_id`, block number, timestamp;
- сохранять транзакцию идемпотентно по `tx_id + log_index`;
- обновлять заявку;
- уведомлять менеджера;
- не подписывать транзакции и не иметь доступа к private keys.

Источники данных для research/spike:

- TronGrid;
- Tatum;
- QuickNode;
- GetBlock;
- direct java-tron node позже, если понадобится.

Для MVP нужен fallback polling: если webhook/event stream пропустил событие, scheduled job перепроверяет активные адреса.

## 10. TRON Account Activation

В MVP pre-activation не делается.

Решение:

- адреса могут быть неактивными до первого incoming transfer;
- система не тратит TRX на предварительную активацию;
- watcher должен быть протестирован на сценарии `unactivated address -> incoming USDT`;
- если provider не видит такие адреса до активации, это блокер provider choice, а не задача pre-activation.

Technical spike перед реализацией:

1. Сгенерировать новый TRON address на testnet/mainnet small amount.
2. Проверить, видят ли TronGrid/Tatum/QuickNode/GetBlock incoming TRC20 transfer на неактивный адрес.
3. Проверить, как быстро событие появляется в API.
4. Проверить, можно ли reliable искать transfer по `to_address`.
5. Зафиксировать выбранного provider и fallback strategy.

## 11. AML/KYT В MVP

Автоматическая AML-интеграция не обязательна для MVP, но модель данных нужна сразу.

Система должна хранить:

- checked address;
- checked tx hash;
- source: `manual`, `provider_name`;
- risk level: `unknown`, `low`, `medium`, `high`, `blocked`;
- labels/tags;
- manager decision;
- reviewer user id;
- reviewed at;
- comment.

В MVP допустимо:

- менеджер вручную проверяет адрес/tx во внешнем AML-инструменте;
- результат заносится в backoffice.

## 12. Сервисы И Credentials

MVP credentials:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `MINI_APP_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `TRON_PROVIDER_API_KEY`
- `TRON_PROVIDER_BASE_URL`
- `USDT_TRC20_CONTRACT_ADDRESS`
- `ADMIN_JWT_SECRET` или другой secret для admin auth
- Sentry/logging DSN, если используется

Не хранить:

- seed phrase;
- private keys;
- mnemonic;
- wallet passphrase;
- raw exported private key CSV.

## 13. Phase 2 Не Входит В MVP

Phase 2 остается отдельной задачей после MVP и production feedback.

Возможности Phase 2:

- self-hosted wallet-service;
- Fireblocks;
- BitGo;
- automatic sweep deposit addresses to treasury;
- payout by button from backoffice;
- two-person approval;
- withdrawal limits;
- address whitelist;
- policy engine;
- key storage through KMS/HSM/Vault/MPC;
- separate security review.

Основной backend даже в Phase 2 не должен напрямую хранить private keys.

## 14. Оценка Сервисов Для Phase 2

Текущие публичные ориентиры на 2026-05-11:

- Fireblocks Essentials: около `699 USD/month` на стартовом плане до 6 месяцев; custom от `18,000 USD/year`.
- BitGo: институциональный pricing через договор; публичные документы BitGo Europe указывают onboarding от `2,500 EUR`, custody fee по assets under custody и outgoing transaction fee по договору.
- Tatum/QuickNode/GetBlock подходят скорее как blockchain API/RPC слой, а не как полноценная custody-замена.
- Self-hosted wallet-service дешевле по подпискам, но дороже по ответственности, разработке и security review.

Вывод: Phase 2 нельзя продавать как маленькую доработку. Это отдельный security-critical блок.

## 15. Data Model MVP

Минимальные сущности:

- `users`
- `telegram_profiles`
- `orders`
- `deposit_addresses`
- `blockchain_transactions`
- `aml_reviews`
- `rates`
- `manager_actions`
- `audit_logs`
- `support_threads`
- `reports_exports`

Ключевые поля `orders`:

- `id`
- `public_id`
- `telegram_user_id`
- `direction`
- `asset`
- `network`
- `amount_usdt`
- `amount_rub`
- `rate_snapshot`
- `rate_expires_at`
- `order_expires_at`
- `deposit_address_id`
- `client_payout_address`
- `status`
- `created_at`
- `updated_at`
- `completed_at`

## 16. Error Handling

Критичные сценарии:

- нет свободных deposit addresses;
- provider недоступен;
- duplicate webhook/polling event;
- сумма меньше/больше заявки;
- депозит пришел после expiry;
- депозит пришел несколькими транзакциями;
- клиент отправил не USDT TRC20;
- клиент ввел некорректный payout address;
- менеджер ошибся при вводе tx hash;
- AML high risk.

Правило MVP: система не должна автоматически выпускать средства или закрывать спорные заявки. Все спорные кейсы уходят в `manager_review`.

## 17. Testing Strategy

Перед production:

- unit tests для rate snapshot, order expiry, address reservation;
- integration tests для Telegram initData validation;
- integration tests для watcher idempotency;
- tests для duplicate tx events;
- tests для invalid TRC20 address validation;
- manual test на TRON testnet;
- production small-amount smoke test на mainnet;
- backoffice audit log tests.

## 18. Research Plan

До implementation plan нужно провести spike:

1. TRON inactive address deposit behavior.
2. Provider comparison: TronGrid vs Tatum vs QuickNode vs GetBlock.
3. Address generation method: Tatum/TronWeb/offline script.
4. Watcher reliability and polling interval.
5. Cost model for RPC/API providers.
6. Sweep feasibility for Phase 2, без включения в MVP.

## 19. GSD Workflow

Рекомендуемый процесс:

1. `gsd-new-project` - создать структуру нового проекта.
2. `gsd-spec-phase` - зафиксировать MVP требования по order/wallet/backoffice.
3. `gsd-spike` - проверить TRON inactive address и provider choice.
4. `gsd-plan-phase` - сделать реализационный план.
5. `gsd-execute-phase` - реализация MVP.
6. `gsd-secure-phase` - только перед Phase 2 или любыми ключами/автовыводами.
7. `gstack` - позже для browser QA Mini App и backoffice UI.

## 20. Open Questions

Для MVP еще нужно решить:

1. Сколько адресов генерировать на старт: 500 или 1000.
2. Срок жизни заявки: 30 или 60 минут.
3. Сколько confirmations/finality ждать для TRON deposit.
4. Нужно ли принимать partial deposits или только exact/single transaction.
5. Какие поля ФИО/пропуска обязательны.
6. Кто вручную делает sweep и где хранится seed.
7. Какие роли менеджеров нужны в первой админке.

## 21. Sources

- TRON Accounts: https://developers.tron.network/docs/account
- TRON Resource Model: https://developers.tron.network/docs/resource-model
- Tatum TRON HD wallet docs: https://docs.tatum.io/docs/tron-getting-started-api
- Fireblocks pricing: https://www.fireblocks.com/pricing
- Fireblocks deposits at scale: https://developers.fireblocks.com/docs/manage-deposits-at-scale
- BitGo create addresses docs: https://developers.bitgo.com/docs/wallets-create-addresses
- BitGo Europe general price terms: https://landing.bitgo.com/rs/552-OGK-141/images/General%20Price%20and%20Service%20Terms.pdf
- QuickNode pricing: https://www.quicknode.com/pricing
- Tatum plans and limits: https://docs.tatum.io/docs/plans-limits
