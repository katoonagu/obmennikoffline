import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2 as CheckCircle,
  Clock3 as Timer,
  Copy,
  Home as House,
  Info,
  LockKeyhole as LockKey,
  LogOut as SignOut,
  TriangleAlert as Warning,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  miniAppBrand,
  miniAppScreens,
  type MiniAppRow,
  type MiniAppScreen,
  type MiniAppScreenId,
  type MiniAppTone,
} from './miniAppContent.js';
import {
  miniAppMockFixtures,
  type MiniAppApi,
} from './miniAppApi.js';
import {
  createMiniAppApiFromRuntimeConfig,
  loadBrowserMiniAppRuntimeConfig,
} from './miniAppRuntimeConfig.js';
import type { OrderDto, UserProfileDto } from '../orders/orderReadService.js';
import type { UsdtRubRates } from '../rates/rateQuoteService.js';
import {
  createMiniAppHomeViewModel,
  createMiniAppOrderDetailViewModel,
  createMiniAppProfileViewModel,
  type MiniAppDetailRowViewModel,
  type MiniAppHomeViewModel,
  type MiniAppOrderDetailViewModel,
  type MiniAppProfileViewModel,
} from './miniAppViewModel.js';
import {
  buildBuyOrderInput,
  buildSellOrderInput,
  createInitialBuyOrderForm,
  createInitialSellOrderForm,
  type BuyOrderFormState,
  type SellOrderFormState,
} from './miniAppOrderForms.js';

const screenById = new Map<MiniAppScreenId, MiniAppScreen>(
  miniAppScreens.map((screen) => [screen.id, screen]),
);

const navItems: Array<{ id: MiniAppScreenId; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Главная', icon: House },
  { id: 'order-detail', label: 'История', icon: Timer },
  { id: 'profile', label: 'Профиль', icon: User },
];

function getScreen(id: MiniAppScreenId): MiniAppScreen {
  const screen = screenById.get(id);

  if (!screen) {
    throw new Error(`Unknown Mini App screen: ${id}`);
  }

  return screen;
}

export function App() {
  const [activeScreenId, setActiveScreenId] = useState<MiniAppScreenId>('home');
  const [api] = useState<MiniAppApi>(() =>
    createMiniAppApiFromRuntimeConfig(loadBrowserMiniAppRuntimeConfig()),
  );
  const [rates, setRates] = useState<UsdtRubRates>(miniAppMockFixtures.rates);
  const [activeOrders, setActiveOrders] = useState<OrderDto[]>([
    miniAppMockFixtures.sellOrder,
  ]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(
    miniAppMockFixtures.sellOrder,
  );
  const [profile, setProfile] = useState<UserProfileDto>(miniAppMockFixtures.profile);
  const [loadingLabel, setLoadingLabel] = useState('Загрузка данных');
  const [buyForm, setBuyForm] = useState<BuyOrderFormState>(() =>
    createInitialBuyOrderForm(),
  );
  const [sellForm, setSellForm] = useState<SellOrderFormState>(() =>
    createInitialSellOrderForm(),
  );
  const [submissionError, setSubmissionError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeScreen = useMemo(() => getScreen(activeScreenId), [activeScreenId]);
  const homeModel = useMemo<MiniAppHomeViewModel>(
    () => createMiniAppHomeViewModel({ rates, activeOrders }),
    [activeOrders, rates],
  );
  const detailModel = useMemo<MiniAppOrderDetailViewModel | null>(
    () => selectedOrder ? createMiniAppOrderDetailViewModel(selectedOrder) : null,
    [selectedOrder],
  );
  const profileModel = useMemo<MiniAppProfileViewModel>(
    () => createMiniAppProfileViewModel(profile),
    [profile],
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.loadRates(),
      api.listActiveOrders({ limit: 5 }),
      api.getProfile(),
    ])
      .then(([loadedRates, loadedOrders, loadedProfile]) => {
        if (cancelled) return;
        setRates(loadedRates);
        setActiveOrders(loadedOrders);
        setSelectedOrder(loadedOrders[0] ?? null);
        setProfile(loadedProfile);
        setLoadingLabel('');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingLabel('Не удалось обновить данные');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  async function refreshActiveOrders(nextSelectedOrder?: OrderDto) {
    const loadedOrders = await api.listActiveOrders({ limit: 5 });
    setActiveOrders(loadedOrders);
    setSelectedOrder(nextSelectedOrder ?? loadedOrders[0] ?? null);
  }

  async function handleCreateBuyOrder() {
    const result = buildBuyOrderInput(buyForm);
    if (!result.ok) {
      setSubmissionError(result.message);
      return;
    }

    await submitOrder(async () => {
      const order = await api.createBuyOrder(result.input);
      await refreshActiveOrders(order);
      setActiveScreenId('order-detail');
    });
  }

  async function handleCreateSellOrder() {
    const result = buildSellOrderInput(sellForm);
    if (!result.ok) {
      setSubmissionError(result.message);
      return;
    }

    await submitOrder(async () => {
      const order = await api.createSellOrder(result.input);
      await refreshActiveOrders(order);
      setActiveScreenId('order-detail');
    });
  }

  async function submitOrder(createOrder: () => Promise<void>) {
    setSubmissionError(undefined);
    setIsSubmitting(true);
    try {
      await createOrder();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Не удалось создать заявку');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mini-app-shell">
      <section className="phone-frame" aria-label="OBMEN Telegram Mini App preview">
        <div className="phone-topbar" aria-hidden="true">
          <span>9:41</span>
          <span className="topbar-camera" />
          <span>▰▰</span>
        </div>

        <AppHeader
          activeScreen={activeScreen}
          onBack={() => setActiveScreenId('home')}
        />

        <section className="screen-scroll">
          {loadingLabel && <div className="sync-banner">{loadingLabel}</div>}
          {activeScreen.id === 'home' && (
            <HomeScreen
              model={homeModel}
              onNavigate={setActiveScreenId}
              onOpenOrder={(publicId) => {
                const order = activeOrders.find((candidate) => candidate.publicId === publicId);
                setSelectedOrder(order ?? null);
                setActiveScreenId('order-detail');
              }}
            />
          )}
          {activeScreen.id === 'buy' && (
            <FlowScreen
              screen={activeScreen}
              variant="buy"
              buyForm={buyForm}
              onBuyFormChange={setBuyForm}
              errorMessage={submissionError}
              isSubmitting={isSubmitting}
              onCreate={handleCreateBuyOrder}
            />
          )}
          {activeScreen.id === 'sell' && (
            <FlowScreen
              screen={activeScreen}
              variant="sell"
              sellForm={sellForm}
              onSellFormChange={setSellForm}
              errorMessage={submissionError}
              isSubmitting={isSubmitting}
              onCreate={handleCreateSellOrder}
            />
          )}
          {activeScreen.id === 'order-detail' && (
            <OrderDetailScreen
              model={detailModel}
              onHome={() => setActiveScreenId('home')}
            />
          )}
          {activeScreen.id === 'profile' && (
            <ProfileScreen screen={activeScreen} model={profileModel} />
          )}
        </section>

        <BottomNav activeScreenId={activeScreenId} onNavigate={setActiveScreenId} />
      </section>
    </main>
  );
}

function AppHeader({
  activeScreen,
  onBack,
}: {
  activeScreen: MiniAppScreen;
  onBack: () => void;
}) {
  const isHome = activeScreen.id === 'home';

  return (
    <header className="app-header">
      {isHome ? (
        <div className="brand-lockup">
          <BrandMark />
          <span>{miniAppBrand.name}</span>
        </div>
      ) : (
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          <ArrowLeft size={20} strokeWidth={2.4} />
        </button>
      )}

      <h1 className="header-title">{isHome ? '' : activeScreen.title}</h1>

      <button className="icon-button" type="button" aria-label="Безопасность">
        <LockKey size={19} />
      </button>
    </header>
  );
}

function HomeScreen({
  model,
  onNavigate,
  onOpenOrder,
}: {
  model: MiniAppHomeViewModel;
  onNavigate: (screen: MiniAppScreenId) => void;
  onOpenOrder: (publicId: string) => void;
}) {
  return (
    <div className="screen-stack home-screen">
      <div className="hero-block">
        <p className="mini-kicker">{miniAppBrand.tagline}</p>
        <h2>{getScreen('home').title}</h2>
        <p>{miniAppBrand.promise}</p>
      </div>

      <div className="action-grid" aria-label="Основные действия">
        <button className="action-card buy-action" type="button" onClick={() => onNavigate('buy')}>
          <ArrowUp size={28} strokeWidth={2.4} />
          <span>Купить USDT</span>
        </button>
        <button className="action-card sell-action" type="button" onClick={() => onNavigate('sell')}>
          <ArrowDown size={28} strokeWidth={2.4} />
          <span>Продать USDT</span>
        </button>
      </div>

      <div className="rate-strip">
        <RateCell row={{ label: 'Купить', value: model.rates.buy, tone: 'accent' }} />
        <RateCell row={{ label: 'Продать', value: model.rates.sell, tone: 'cyan' }} />
      </div>

      <section className="section-block" aria-labelledby="active-orders-title">
        <h3 id="active-orders-title">Активные заявки</h3>
        {model.activeOrders.map((order) => (
          <button
            className="order-card"
            type="button"
            key={order.publicId}
            onClick={() => onOpenOrder(order.publicId)}
          >
            <span className="order-card-title">{order.title}</span>
            <span className={`status-badge tone-${order.statusTone}`}>
              {order.statusLabel}
            </span>
            <span className="order-card-meta">ID: {order.publicId}</span>
            <span className="order-card-meta">{order.createdAtLabel}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

function FlowScreen({
  screen,
  variant,
  buyForm,
  sellForm,
  onBuyFormChange,
  onSellFormChange,
  errorMessage,
  isSubmitting,
  onCreate,
}: {
  screen: MiniAppScreen;
  variant: 'buy' | 'sell';
  buyForm?: BuyOrderFormState;
  sellForm?: SellOrderFormState;
  onBuyFormChange?: (form: BuyOrderFormState) => void;
  onSellFormChange?: (form: SellOrderFormState) => void;
  errorMessage?: string;
  isSubmitting: boolean;
  onCreate: () => Promise<void>;
}) {
  return (
    <form
      className="screen-stack order-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate();
      }}
    >
      <p className="screen-eyebrow">{screen.eyebrow}</p>

      {variant === 'buy' && buyForm && onBuyFormChange && (
        <>
          <FormField
            label="Сумма в рублях"
            value={buyForm.amountRub}
            inputMode="decimal"
            helper="Сколько рублей вы принесете в офис."
            onChange={(amountRub) => onBuyFormChange({ ...buyForm, amountRub })}
          />
          <FormField
            label="Кошелек для получения (TRC-20)"
            value={buyForm.clientPayoutAddress}
            inputMode="text"
            helper="USDT будет отправлен на этот адрес после оплаты."
            onChange={(clientPayoutAddress) =>
              onBuyFormChange({ ...buyForm, clientPayoutAddress })
            }
          />
          <FormField
            label="ФИО"
            value={buyForm.fullName}
            inputMode="text"
            helper="Фамилия, имя и отчество для пропуска."
            onChange={(fullName) => onBuyFormChange({ ...buyForm, fullName })}
          />
        </>
      )}

      {variant === 'sell' && sellForm && onSellFormChange && (
        <>
          <FormField
            label="Сумма в USDT"
            value={sellForm.amountUsdt}
            inputMode="decimal"
            helper="Сумма продажи в сети Tron TRC-20."
            onChange={(amountUsdt) => onSellFormChange({ ...sellForm, amountUsdt })}
          />
          <FormField
            label="ФИО"
            value={sellForm.fullName}
            inputMode="text"
            helper="Фамилия, имя и отчество для пропуска."
            onChange={(fullName) => onSellFormChange({ ...sellForm, fullName })}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={sellForm.acceptedTerms}
              onChange={(event) =>
                onSellFormChange({
                  ...sellForm,
                  acceptedTerms: event.currentTarget.checked,
                })
              }
            />
            <span>Принимаю правила и условия обмена</span>
          </label>
        </>
      )}

      <div className="warning-stack">
        {screen.highlights.map((highlight, index) => (
          <div className="inline-warning" key={highlight}>
            {variant === 'buy' ? (
              <Info size={18} />
            ) : index === 0 ? (
              <Timer size={18} />
            ) : (
              <Warning size={18} />
            )}
            <span>{highlight}</span>
          </div>
        ))}
      </div>

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Создаем заявку' : screen.cta}
      </button>
    </form>
  );
}

function FormField({
  label,
  value,
  inputMode,
  helper,
  onChange,
}: {
  label: string;
  value: string;
  inputMode: 'decimal' | 'text';
  helper: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        className="form-input"
        value={value}
        inputMode={inputMode}
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <small>{helper}</small>
    </label>
  );
}

function OrderDetailScreen({
  model,
  onHome,
}: {
  model: MiniAppOrderDetailViewModel | null;
  onHome: () => void;
}) {
  if (!model) {
    return (
      <div className="screen-stack">
        <p className="screen-eyebrow">Активная заявка не выбрана.</p>
        <button className="secondary-button" type="button" onClick={onHome}>
          На главный
        </button>
      </div>
    );
  }

  return (
    <div className="screen-stack">
      <div className="detail-status-row">
        <span>Статус</span>
        <span className={`status-badge tone-${model.statusTone}`}>
          {model.statusLabel}
        </span>
      </div>

      <DataPanel row={{
        label: model.directionLabel,
        value: model.primaryAmountLabel,
        tone: 'mono',
      }} />

      {model.qrValue ? (
        <div className="qr-panel">
          <span>Отправьте USDT на адрес ниже</span>
          <div className="fake-qr" aria-label="QR код адреса для перевода">
            {Array.from({ length: 64 }, (_, index) => (
              <span key={index} className={index % 3 === 0 || index % 7 === 0 ? 'qr-dot on' : 'qr-dot'} />
            ))}
          </div>
        </div>
      ) : (
        <div className="qr-panel text-panel">
          <Info size={22} />
          <span>USDT будет отправлен на кошелек клиента после оплаты в офисе.</span>
        </div>
      )}

      {model.rows.map((row) => (
        <DataPanel key={row.label} row={row} />
      ))}

      <button className="secondary-button" type="button" onClick={onHome}>
        На главный
      </button>
    </div>
  );
}

function ProfileScreen({
  screen,
  model,
}: {
  screen: MiniAppScreen;
  model: MiniAppProfileViewModel;
}) {
  return (
    <div className="screen-stack">
      <div className="profile-card">
        <div className="avatar">
          <User size={30} />
        </div>
        <div>
          <span className="verified-line">
            <CheckCircle size={16} />
            {screen.eyebrow}
          </span>
          <strong>Обменов: {model.totalOrdersLabel}</strong>
        </div>
      </div>

      <div className="field-stack">
        {[
          {
            label: 'Реферальный баланс',
            value: '0 USDT',
            tone: 'accent' as MiniAppTone,
          },
          {
            label: 'Telegram ID',
            value: model.telegramIdLabel,
            tone: 'mono' as MiniAppTone,
          },
          {
            label: 'Активные заявки',
            value: model.activeOrdersLabel,
            tone: 'mono' as MiniAppTone,
          },
          {
            label: 'Username',
            value: model.usernameLabel,
            tone: 'mono' as MiniAppTone,
          },
        ].map((row) => (
          <DataPanel key={row.label} row={row} withCopy />
        ))}
      </div>

      <div className="menu-list">
        {screen.rows.slice(3).map((row) => (
          <button className="menu-row" type="button" key={row.label}>
            <Wallet size={18} />
            <span>{row.label}</span>
            <span>{row.value}</span>
          </button>
        ))}
        <button className="menu-row danger" type="button">
          <SignOut size={18} />
          <span>Выйти из Mini App</span>
        </button>
      </div>
    </div>
  );
}

function BottomNav({
  activeScreenId,
  onNavigate,
}: {
  activeScreenId: MiniAppScreenId;
  onNavigate: (screen: MiniAppScreenId) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Нижняя навигация">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active =
          item.id === activeScreenId ||
          (item.id === 'order-detail' && activeScreenId === 'buy') ||
          (item.id === 'order-detail' && activeScreenId === 'sell');

        return (
          <button
            className={active ? 'nav-item active' : 'nav-item'}
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            <Icon size={22} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function RateCell({ row }: { row?: MiniAppRow }) {
  if (!row) {
    return null;
  }

  return (
    <div className="rate-cell">
      <span>{row.label}</span>
      <strong className={`tone-${row.tone ?? 'default'}`}>{row.value}</strong>
    </div>
  );
}

type DisplayRow = (MiniAppRow | MiniAppDetailRowViewModel) & {
  copyable?: boolean;
};

function DataPanel({ row, withCopy }: { row: DisplayRow; withCopy?: boolean }) {
  const shouldCopy = withCopy ?? row.copyable ?? false;

  return (
    <div className="data-panel">
      <span>{row.label}</span>
      <strong className={`tone-${row.tone ?? 'default'}`}>{row.value}</strong>
      {shouldCopy && (
        <button className="copy-button" type="button" aria-label={`Скопировать ${row.label}`}>
          <Copy size={18} />
        </button>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
