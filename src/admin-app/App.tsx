import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  Database,
  LogOut,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  createAdminAppApiClient,
  type AdminAppApi,
  type AdminSessionDto,
} from './adminAppApi.js';
import {
  canRecordManualCryptoPayout,
  formatAdminCustomer,
  formatAdminOrderAmount,
  formatAdminOrderDirection,
  formatAdminOrderStatus,
  MANAGER_STATUS_OPTIONS,
  parseAddressPoolCsvForAdmin,
} from './adminAppViewModel.js';
import {
  loadBrowserAdminAppRuntimeConfig,
  type AdminAppRuntimeConfig,
} from './adminRuntimeConfig.js';
import type { AddressPoolCsvRow } from '../wallet/addressPoolCsv.js';
import type { OrderDto } from '../orders/orderReadService.js';

const SESSION_STORAGE_KEY = 'obmen.admin.session.v1';
const DEFAULT_STATUS = 'manager_review' satisfies OrderDto['status'];

type RuntimeState =
  | {
      config: AdminAppRuntimeConfig;
      errorMessage?: undefined;
    }
  | {
      config: null;
      errorMessage: string;
    };

export function App() {
  const runtimeState = useMemo(createRuntimeState, []);
  const api = useMemo(
    () => runtimeState.config
      ? createAdminAppApiClient({ baseUrl: runtimeState.config.apiBaseUrl })
      : null,
    [runtimeState],
  );
  const [session, setSession] = useState<AdminSessionDto | null>(() => readStoredSession());
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [statusDraft, setStatusDraft] = useState<OrderDto['status']>(DEFAULT_STATUS);
  const [commentDraft, setCommentDraft] = useState('');
  const [txIdDraft, setTxIdDraft] = useState('');
  const [payoutCommentDraft, setPayoutCommentDraft] = useState('');
  const [addressCsvDraft, setAddressCsvDraft] = useState('');
  const [addressPreview, setAddressPreview] = useState<AddressPoolCsvRow[]>([]);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const refreshOrders = useCallback(async (token: string) => {
    if (!api) return;

    setLoadingLabel('Загружаем очередь');
    setErrorMessage('');
    try {
      const nextOrders = await api.listActiveOrders({ token, limit: 50 });
      setOrders(nextOrders);
      setSelectedOrder((current) => {
        const refreshed = current
          ? nextOrders.find((order) => order.publicId === current.publicId)
          : undefined;

        return refreshed ?? nextOrders[0] ?? null;
      });
    } catch (error) {
      setErrorMessage(toMessage(error));
      setOrders([]);
      setSelectedOrder(null);
    } finally {
      setLoadingLabel('');
    }
  }, [api]);

  useEffect(() => {
    if (session) {
      void refreshOrders(session.token);
    }
  }, [refreshOrders, session]);

  useEffect(() => {
    if (!selectedOrder) return;
    setStatusDraft(
      MANAGER_STATUS_OPTIONS.includes(selectedOrder.status as typeof MANAGER_STATUS_OPTIONS[number])
        ? selectedOrder.status
        : DEFAULT_STATUS,
    );
    setCommentDraft('');
    setTxIdDraft('');
    setPayoutCommentDraft('');
  }, [selectedOrder]);

  if (!api || runtimeState.errorMessage) {
    return (
      <main className="admin-shell">
        <section className="admin-error admin-runtime-error">
          <AlertTriangle size={22} />
          <div>
            <h1>Admin App недоступен</h1>
            <p>{runtimeState.errorMessage}</p>
          </div>
        </section>
      </main>
    );
  }

  function handleSession(sessionDto: AdminSessionDto | null) {
    setSession(sessionDto);
    if (sessionDto) {
      storeSession(sessionDto);
    } else {
      clearStoredSession();
      setOrders([]);
      setSelectedOrder(null);
    }
  }

  async function openOrder(publicId: string) {
    if (!session || !api) return;
    setLoadingLabel('Открываем заявку');
    setErrorMessage('');
    try {
      const order = await api.getOrder({ token: session.token, publicId });
      setSelectedOrder(order);
      setOrders((current) => current.map((item) => (
        item.publicId === order.publicId ? order : item
      )));
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setLoadingLabel('');
    }
  }

  async function submitStatus(event: FormEvent) {
    event.preventDefault();
    if (!session || !selectedOrder || !api) return;
    setLoadingLabel('Обновляем статус');
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const order = await api.updateOrderStatus({
        token: session.token,
        publicId: selectedOrder.publicId,
        status: statusDraft,
        comment: commentDraft,
      });
      setSelectedOrder(order);
      setSuccessMessage('Статус обновлен');
      await refreshOrders(session.token);
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setLoadingLabel('');
    }
  }

  async function submitPayout(event: FormEvent) {
    event.preventDefault();
    if (!session || !selectedOrder || !api) return;
    setLoadingLabel('Записываем tx hash');
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const order = await api.recordManualCryptoPayout({
        token: session.token,
        publicId: selectedOrder.publicId,
        txId: txIdDraft,
        comment: payoutCommentDraft,
      });
      setSelectedOrder(order);
      setSuccessMessage('Tx hash записан');
      await refreshOrders(session.token);
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setLoadingLabel('');
    }
  }

  async function submitAddressImport(event: FormEvent) {
    event.preventDefault();
    if (!session || !api) return;
    setLoadingLabel('Импортируем адреса');
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const rows = parseAddressPoolCsvForAdmin(addressCsvDraft);
      const result = await api.importAddressPool({
        token: session.token,
        rows,
      });
      setAddressCsvDraft('');
      setAddressPreview([]);
      setSuccessMessage(`Импортировано адресов: ${result.count}`);
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setLoadingLabel('');
    }
  }

  function previewAddressCsv(value: string) {
    setAddressCsvDraft(value);
    setSuccessMessage('');
    if (!value.trim()) {
      setAddressPreview([]);
      return;
    }

    try {
      setAddressPreview(parseAddressPoolCsvForAdmin(value));
      setErrorMessage('');
    } catch (error) {
      setAddressPreview([]);
      setErrorMessage(toMessage(error));
    }
  }

  if (!session) {
    return (
      <main className="admin-shell">
        <LoginScreen api={api} onSession={handleSession} />
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <span className="admin-brand-mark">OBMEN</span>
          <h1>Панель менеджера</h1>
        </div>
        <div className="admin-topbar-actions">
          <span className="admin-session-pill">
            <ShieldCheck size={16} />
            {session.admin.username}
          </span>
          <button
            className="admin-icon-button"
            type="button"
            onClick={() => void refreshOrders(session.token)}
            aria-label="Обновить очередь"
          >
            <RefreshCcw size={17} />
          </button>
          <button
            className="admin-ghost-button"
            type="button"
            onClick={() => handleSession(null)}
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </header>

      {(loadingLabel || errorMessage || successMessage) ? (
        <StatusBanner
          loadingLabel={loadingLabel}
          errorMessage={errorMessage}
          successMessage={successMessage}
        />
      ) : null}

      <section className="admin-dashboard">
        <OrderQueue
          orders={orders}
          selectedPublicId={selectedOrder?.publicId}
          onOpenOrder={(publicId) => void openOrder(publicId)}
        />

        <section className="admin-detail-panel">
          {selectedOrder ? (
            <>
              <OrderDetail order={selectedOrder} />

              <form className="admin-status-form" onSubmit={(event) => void submitStatus(event)}>
                <div className="admin-section-title">
                  <CheckCircle2 size={18} />
                  <h2>Изменить статус</h2>
                </div>
                <label className="admin-field">
                  <span>Новый статус</span>
                  <select
                    value={statusDraft}
                    onChange={(event) => setStatusDraft(event.target.value as OrderDto['status'])}
                  >
                    {MANAGER_STATUS_OPTIONS.map((status) => (
                      <option value={status} key={status}>
                        {formatAdminOrderStatus(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Комментарий для audit log</span>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Например: клиент прошел AML, готовим выплату"
                  />
                </label>
                <button className="admin-primary-button" type="submit">
                  Сохранить статус
                </button>
              </form>

              <form className="admin-payout-form" onSubmit={(event) => void submitPayout(event)}>
                <div className="admin-section-title">
                  <Archive size={18} />
                  <h2>Записать tx hash</h2>
                </div>
                <p>
                  Используется только для BUY-заявок после ручной отправки USDT с внешнего custody wallet.
                </p>
                <label className="admin-field">
                  <span>TRON tx hash</span>
                  <input
                    value={txIdDraft}
                    onChange={(event) => setTxIdDraft(event.target.value)}
                    placeholder="64 hex characters"
                  />
                </label>
                <label className="admin-field">
                  <span>Комментарий</span>
                  <textarea
                    value={payoutCommentDraft}
                    onChange={(event) => setPayoutCommentDraft(event.target.value)}
                    placeholder="Отправлено после приема RUB в офисе"
                  />
                </label>
                <button
                  className="admin-secondary-button"
                  type="submit"
                  disabled={!canRecordManualCryptoPayout(selectedOrder)}
                >
                  Записать выплату
                </button>
              </form>
            </>
          ) : (
            <div className="admin-empty-state">
              <ClipboardList size={34} />
              <h2>Пустая очередь</h2>
              <p>Активные заявки появятся здесь после создания BUY/SELL в Mini App.</p>
            </div>
          )}
        </section>

        <form className="admin-address-import" onSubmit={(event) => void submitAddressImport(event)}>
          <div className="admin-section-title">
            <Database size={18} />
            <h2>Импорт адресов</h2>
          </div>
          <p>
            Вставьте CSV только с публичными TRON-адресами. Seed/private keys не должны попадать в backend.
          </p>
          <label className="admin-field">
            <span>CSV address pool</span>
            <textarea
              value={addressCsvDraft}
              onChange={(event) => previewAddressCsv(event.target.value)}
              placeholder="network,asset,derivation_index,address"
            />
          </label>
          <div className="admin-import-meta">
            Готово к импорту: {addressPreview.length}
          </div>
          <button
            className="admin-secondary-button"
            type="submit"
            disabled={addressPreview.length === 0}
          >
            Импортировать адреса
          </button>
        </form>
      </section>
    </main>
  );
}

function LoginScreen({
  api,
  onSession,
}: {
  api: AdminAppApi;
  onSession: (session: AdminSessionDto) => void;
}) {
  const [username, setUsername] = useState('manager-1');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      onSession(await api.login({ username, password }));
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-login-panel">
      <div className="admin-brand-block">
        <span className="admin-brand-mark">OBMEN</span>
        <h1>Вход менеджера</h1>
        <p>Войдите через admin session. Bearer token хранится только в локальном браузере.</p>
      </div>
      <form onSubmit={(event) => void submitLogin(event)}>
        <label className="admin-field">
          <span>Логин</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>Пароль</span>
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {errorMessage ? <p className="admin-error">{errorMessage}</p> : null}
        <button className="admin-primary-button" type="submit" disabled={loading}>
          {loading ? 'Проверяем' : 'Войти'}
        </button>
      </form>
    </section>
  );
}

function OrderQueue({
  orders,
  selectedPublicId,
  onOpenOrder,
}: {
  orders: OrderDto[];
  selectedPublicId: string | undefined;
  onOpenOrder: (publicId: string) => void;
}) {
  return (
    <section className="admin-order-queue">
      <div className="admin-section-title">
        <ClipboardList size={18} />
        <h2>Очередь заявок</h2>
      </div>
      {orders.length === 0 ? (
        <div className="admin-empty-state compact">
          <p>Пустая очередь</p>
        </div>
      ) : (
        <div className="admin-order-list">
          {orders.map((order) => (
            <button
              className={order.publicId === selectedPublicId
                ? 'admin-order-row selected'
                : 'admin-order-row'}
              key={order.publicId}
              type="button"
              onClick={() => onOpenOrder(order.publicId)}
            >
              <span className="admin-order-identity">
                <strong>{order.publicId}</strong>
                <small>{formatAdminOrderDirection(order)}</small>
              </span>
              <span className="admin-order-amount">{formatAdminOrderAmount(order)}</span>
              <span className={`admin-status status-${order.status}`}>
                {formatAdminOrderStatus(order.status)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function OrderDetail({ order }: { order: OrderDto }) {
  return (
    <section>
      <div className="admin-section-title">
        <ShieldCheck size={18} />
        <h2>Детали заявки</h2>
      </div>
      <div className="admin-detail-grid">
        <DetailLine label="ID" value={order.publicId} emphasis />
        <DetailLine label="Тип" value={formatAdminOrderDirection(order)} />
        <DetailLine label="Статус" value={formatAdminOrderStatus(order.status)} />
        <DetailLine label="Сумма" value={formatAdminOrderAmount(order)} />
        <DetailLine label="ФИО" value={formatAdminCustomer(order)} />
        <DetailLine label="Курс" value={`${order.rateSnapshot} ₽`} />
        <DetailLine label="Создана" value={formatDate(order.createdAt)} />
        <DetailLine label="Истекает" value={formatDate(order.orderExpiresAt)} />
        {order.depositAddress ? (
          <DetailLine label="Deposit address" value={order.depositAddress} mono />
        ) : null}
        {order.clientPayoutAddress ? (
          <DetailLine label="Client payout wallet" value={order.clientPayoutAddress} mono />
        ) : null}
        {order.cryptoPayout ? (
          <DetailLine label="Crypto payout tx" value={order.cryptoPayout.txId} mono />
        ) : null}
      </div>
    </section>
  );
}

function DetailLine({
  label,
  value,
  emphasis = false,
  mono = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={emphasis ? 'admin-detail-line emphasis' : 'admin-detail-line'}>
      <span>{label}</span>
      <strong className={mono ? 'mono' : undefined}>{value}</strong>
    </div>
  );
}

function StatusBanner({
  loadingLabel,
  errorMessage,
  successMessage,
}: {
  loadingLabel: string;
  errorMessage: string;
  successMessage: string;
}) {
  if (errorMessage) {
    return (
      <section className="admin-error">
        <AlertTriangle size={18} />
        {errorMessage}
      </section>
    );
  }

  if (successMessage) {
    return (
      <section className="admin-success">
        <CheckCircle2 size={18} />
        {successMessage}
      </section>
    );
  }

  return (
    <section className="admin-loading">
      {loadingLabel}
    </section>
  );
}

function createRuntimeState(): RuntimeState {
  try {
    return {
      config: loadBrowserAdminAppRuntimeConfig(),
    };
  } catch (error) {
    return {
      config: null,
      errorMessage: toMessage(error),
    };
  }
}

function readStoredSession(): AdminSessionDto | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return rawValue ? JSON.parse(rawValue) as AdminSessionDto : null;
  } catch {
    return null;
  }
}

function storeSession(session: AdminSessionDto): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
