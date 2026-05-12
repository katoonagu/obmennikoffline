import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  Home as House,
  Info,
  LockKeyhole,
  LogOut,
  MessageCircle,
  ShieldCheck,
  TriangleAlert,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OrderDto, UserProfileDto } from '../orders/orderReadService.js';
import {
  createUsdtRubOrderQuote,
  type UsdtRubRates,
} from '../rates/rateQuoteService.js';
import {
  miniAppBrand,
  miniAppScreens,
  type MiniAppRow,
  type MiniAppScreen,
  type MiniAppScreenId,
} from './miniAppContent.js';
import {
  miniAppMockFixtures,
  type MiniAppApi,
  type MiniAppCustomerInput,
} from './miniAppApi.js';
import {
  buildBuyOrderInput,
  buildSellOrderInput,
  createInitialBuyOrderForm,
  createInitialSellOrderForm,
  isBuyOrderFormReady,
  isSellOrderFormReady,
  mergeCustomerIntoBuyOrderForm,
  mergeCustomerIntoSellOrderForm,
  type BuyOrderFormState,
  type SellOrderFormState,
} from './miniAppOrderForms.js';
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
  createMiniAppApiFromRuntimeConfig,
  loadBrowserMiniAppRuntimeConfig,
} from './miniAppRuntimeConfig.js';
import { createQrCodeDataUrl } from './qrCodeDataUrl.js';

const screenById = new Map<MiniAppScreenId, MiniAppScreen>(
  miniAppScreens.map((screen) => [screen.id, screen]),
);

const navItems: Array<{ id: MiniAppScreenId; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Главная', icon: House },
  { id: 'history', label: 'История', icon: History },
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
  const screenScrollRef = useRef<HTMLElement | null>(null);
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
        setBuyForm((form) => mergeCustomerIntoBuyOrderForm(form, loadedProfile.customer));
        setSellForm((form) => mergeCustomerIntoSellOrderForm(form, loadedProfile.customer));
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

  useEffect(() => {
    screenScrollRef.current?.scrollTo({ top: 0 });
  }, [activeScreenId]);

  function handleBack() {
    setSubmissionError(undefined);
    if (activeScreenId === 'buy-confirm') {
      setActiveScreenId('buy');
      return;
    }
    if (activeScreenId === 'sell-confirm') {
      setActiveScreenId('sell');
      return;
    }
    setActiveScreenId('home');
  }

  function handleHome() {
    setSubmissionError(undefined);
    setActiveScreenId('home');
  }

  function handleContinueBuyOrder() {
    const result = buildBuyOrderInput(buyForm);
    if (!result.ok) {
      setSubmissionError(result.message);
      return;
    }

    setSubmissionError(undefined);
    setActiveScreenId('buy-confirm');
  }

  function handleContinueSellOrder() {
    const result = buildSellOrderInput(sellForm);
    if (!result.ok) {
      setSubmissionError(result.message);
      return;
    }

    setSubmissionError(undefined);
    setActiveScreenId('sell-confirm');
  }

  async function handleCreateBuyOrder() {
    const result = buildBuyOrderInput(buyForm);
    if (!result.ok) {
      setSubmissionError(result.message);
      setActiveScreenId('buy');
      return;
    }

    await submitOrder(async () => {
      const order = await api.createBuyOrder(result.input);
      await refreshAfterCreatedOrder(order);
      setActiveScreenId('buy-created');
    });
  }

  async function handleCreateSellOrder() {
    const result = buildSellOrderInput(sellForm);
    if (!result.ok) {
      setSubmissionError(result.message);
      setActiveScreenId('sell');
      return;
    }

    await submitOrder(async () => {
      const order = await api.createSellOrder(result.input);
      await refreshAfterCreatedOrder(order);
      setActiveScreenId('sell-created');
    });
  }

  async function refreshAfterCreatedOrder(order: OrderDto) {
    const [loadedOrders, loadedProfile] = await Promise.all([
      api.listActiveOrders({ limit: 5 }),
      api.getProfile(),
    ]);
    setActiveOrders(loadedOrders);
    setSelectedOrder(order);
    setProfile(loadedProfile);
    setBuyForm((form) => mergeCustomerIntoBuyOrderForm(form, loadedProfile.customer));
    setSellForm((form) => mergeCustomerIntoSellOrderForm(form, loadedProfile.customer));
  }

  async function submitOrder(createOrder: () => Promise<void>) {
    setSubmissionError(undefined);
    setIsSubmitting(true);
    try {
      await createOrder();
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : 'Не удалось создать заявку',
      );
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
          onBack={handleBack}
          onAbout={() => setActiveScreenId('about')}
        />

        <section className="screen-scroll" ref={screenScrollRef}>
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
          {activeScreen.id === 'about' && <AboutScreen screen={activeScreen} />}
          {activeScreen.id === 'buy' && (
            <BuyFormScreen
              screen={activeScreen}
              form={buyForm}
              errorMessage={submissionError}
              isSubmitting={isSubmitting}
              onChange={setBuyForm}
              onContinue={handleContinueBuyOrder}
            />
          )}
          {activeScreen.id === 'buy-confirm' && (
            <BuyConfirmScreen
              screen={activeScreen}
              form={buyForm}
              rates={rates}
              errorMessage={submissionError}
              isSubmitting={isSubmitting}
              onBack={() => setActiveScreenId('buy')}
              onCreate={handleCreateBuyOrder}
            />
          )}
          {activeScreen.id === 'buy-created' && (
            <CreatedOrderScreen
              screen={activeScreen}
              order={selectedOrder}
              mode="buy"
              onHome={handleHome}
              onDetail={() => setActiveScreenId('order-detail')}
            />
          )}
          {activeScreen.id === 'sell' && (
            <SellFormScreen
              screen={activeScreen}
              form={sellForm}
              errorMessage={submissionError}
              isSubmitting={isSubmitting}
              onChange={setSellForm}
              onContinue={handleContinueSellOrder}
            />
          )}
          {activeScreen.id === 'sell-confirm' && (
            <SellConfirmScreen
              screen={activeScreen}
              form={sellForm}
              rates={rates}
              errorMessage={submissionError}
              isSubmitting={isSubmitting}
              onBack={() => setActiveScreenId('sell')}
              onCreate={handleCreateSellOrder}
            />
          )}
          {activeScreen.id === 'sell-created' && (
            <CreatedOrderScreen
              screen={activeScreen}
              order={selectedOrder}
              mode="sell"
              onHome={handleHome}
              onDetail={() => setActiveScreenId('order-detail')}
            />
          )}
          {activeScreen.id === 'order-detail' && (
            <OrderDetailScreen
              model={detailModel}
              onHome={handleHome}
            />
          )}
          {activeScreen.id === 'history' && (
            <HistoryScreen activeOrders={activeOrders} onOpenOrder={(publicId) => {
              const order = activeOrders.find((candidate) => candidate.publicId === publicId);
              setSelectedOrder(order ?? null);
              setActiveScreenId('order-detail');
            }} />
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
  onAbout,
}: {
  activeScreen: MiniAppScreen;
  onBack: () => void;
  onAbout: () => void;
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

      {!isHome && <h1 className="header-title">{activeScreen.title}</h1>}

      <button
        className="icon-button"
        type="button"
        onClick={isHome ? onAbout : undefined}
        aria-label={isHome ? 'О нас' : 'Защищенный обмен'}
      >
        {isHome ? <Info size={19} /> : <LockKeyhole size={19} />}
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
        <div className="section-heading-row">
          <h3 id="active-orders-title">Активные заявки</h3>
          <Button variant="tertiary" type="button" onClick={() => onNavigate('history')}>
            История
          </Button>
        </div>
        {model.activeOrders.length > 0 ? (
          model.activeOrders.map((order) => (
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
              <ChevronRight className="order-card-chevron" size={18} />
            </button>
          ))
        ) : (
          <div className="empty-panel">Активных заявок нет</div>
        )}
      </section>
    </div>
  );
}

function AboutScreen({ screen }: { screen: MiniAppScreen }) {
  const icons = [Building2, MessageCircle, BadgeCheck, FileText, ShieldCheck];

  return (
    <div className="screen-stack">
      <p className="screen-eyebrow">{screen.eyebrow}</p>
      <div className="about-media" aria-hidden="true">
        <div>
          <strong>OBMEN</strong>
          <span>USDT/RUB</span>
        </div>
      </div>
      <div className="menu-list">
        {screen.rows.map((row, index) => {
          const Icon = icons[index] ?? Info;
          return (
            <button className="menu-row" type="button" key={row.label}>
              <Icon size={18} />
              <span>{row.label}</span>
              <span>{row.value}</span>
            </button>
          );
        })}
      </div>
      <HelpSection highlights={screen.highlights} tone="accent" />
    </div>
  );
}

function BuyFormScreen({
  screen,
  form,
  errorMessage,
  isSubmitting,
  onChange,
  onContinue,
}: {
  screen: MiniAppScreen;
  form: BuyOrderFormState;
  errorMessage?: string;
  isSubmitting: boolean;
  onChange: (form: BuyOrderFormState) => void;
  onContinue: () => void;
}) {
  return (
    <form
      className="screen-stack order-form"
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <p className="screen-eyebrow">{screen.eyebrow}</p>
      <FormField
        label="Сумма в рублях"
        value={form.amountRub}
        inputMode="decimal"
        placeholder="200 000"
        onChange={(amountRub) => onChange({ ...form, amountRub })}
      />
      <NameFields form={form} onChange={onChange} />
      <FormField
        label="Кошелек для получения (TRC-20)"
        value={form.clientPayoutAddress}
        inputMode="text"
        placeholder="T..."
        onChange={(clientPayoutAddress) =>
          onChange({ ...form, clientPayoutAddress })
        }
      />
      <HelpSection highlights={screen.highlights} tone="accent" />
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <Button
        variant="primary"
        type="submit"
        disabled={isSubmitting || !isBuyOrderFormReady(form)}
      >
        {screen.cta}
      </Button>
    </form>
  );
}

function SellFormScreen({
  screen,
  form,
  errorMessage,
  isSubmitting,
  onChange,
  onContinue,
}: {
  screen: MiniAppScreen;
  form: SellOrderFormState;
  errorMessage?: string;
  isSubmitting: boolean;
  onChange: (form: SellOrderFormState) => void;
  onContinue: () => void;
}) {
  return (
    <form
      className="screen-stack order-form"
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <p className="screen-eyebrow">{screen.eyebrow}</p>
      <FormField
        label="Сумма в USDT"
        value={form.amountUsdt}
        inputMode="decimal"
        placeholder="5 000"
        onChange={(amountUsdt) => onChange({ ...form, amountUsdt })}
      />
      <NameFields form={form} onChange={onChange} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.acceptedTerms}
          onChange={(event) =>
            onChange({
              ...form,
              acceptedTerms: event.currentTarget.checked,
            })
          }
        />
        <span>Принимаю правила и условия обмена</span>
      </label>
      <HelpSection highlights={screen.highlights} tone="warning" />
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <Button
        variant="primary"
        type="submit"
        disabled={isSubmitting || !isSellOrderFormReady(form)}
      >
        {screen.cta}
      </Button>
    </form>
  );
}

function BuyConfirmScreen({
  screen,
  form,
  rates,
  errorMessage,
  isSubmitting,
  onBack,
  onCreate,
}: {
  screen: MiniAppScreen;
  form: BuyOrderFormState;
  rates: UsdtRubRates;
  errorMessage?: string;
  isSubmitting: boolean;
  onBack: () => void;
  onCreate: () => Promise<void>;
}) {
  const result = buildBuyOrderInput(form);

  if (!result.ok) {
    return <InvalidConfirmState message={result.message} onBack={onBack} />;
  }

  const quote = createUsdtRubOrderQuote({
    direction: 'BUY_USDT',
    amountRub: result.input.amountRub,
    rates,
  });
  const rows: DisplayRow[] = [
    { label: 'Сумма в рублях', value: `${formatRub(quote.amountRub)} ₽`, tone: 'mono' },
    { label: 'Вы получите', value: `${formatDecimal(quote.amountUsdt, 2)} USDT`, tone: 'accent' },
    { label: 'Курс', value: `${formatDecimal(quote.rateSnapshot, 2)} ₽`, tone: 'mono' },
    { label: 'ФИО', value: formatCustomer(result.input.customer) },
    {
      label: 'Кошелек для получения (TRC-20)',
      value: result.input.clientPayoutAddress,
      tone: 'mono',
      copyable: true,
    },
    { label: 'Сеть', value: 'Tron (TRC-20)' },
  ];

  return (
    <ConfirmScreen
      screen={screen}
      rows={rows}
      highlights={screen.highlights}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      onBack={onBack}
      onCreate={onCreate}
    />
  );
}

function SellConfirmScreen({
  screen,
  form,
  rates,
  errorMessage,
  isSubmitting,
  onBack,
  onCreate,
}: {
  screen: MiniAppScreen;
  form: SellOrderFormState;
  rates: UsdtRubRates;
  errorMessage?: string;
  isSubmitting: boolean;
  onBack: () => void;
  onCreate: () => Promise<void>;
}) {
  const result = buildSellOrderInput(form);

  if (!result.ok) {
    return <InvalidConfirmState message={result.message} onBack={onBack} />;
  }

  const quote = createUsdtRubOrderQuote({
    direction: 'SELL_USDT',
    amountUsdt: result.input.amountUsdt,
    rates,
  });
  const rows: DisplayRow[] = [
    { label: 'Сумма в USDT', value: `${formatDecimal(quote.amountUsdt, 2)} USDT`, tone: 'mono' },
    { label: 'Вы получите', value: `${formatRub(quote.amountRub)} ₽`, tone: 'accent' },
    { label: 'Курс', value: `${formatDecimal(quote.rateSnapshot, 2)} ₽`, tone: 'mono' },
    { label: 'ФИО', value: formatCustomer(result.input.customer) },
    { label: 'Сеть', value: 'Tron (TRC-20)' },
  ];

  return (
    <ConfirmScreen
      screen={screen}
      rows={rows}
      highlights={screen.highlights}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      onBack={onBack}
      onCreate={onCreate}
    />
  );
}

function ConfirmScreen({
  screen,
  rows,
  highlights,
  errorMessage,
  isSubmitting,
  onBack,
  onCreate,
}: {
  screen: MiniAppScreen;
  rows: DisplayRow[];
  highlights: string[];
  errorMessage?: string;
  isSubmitting: boolean;
  onBack: () => void;
  onCreate: () => Promise<void>;
}) {
  return (
    <form
      className="screen-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate();
      }}
    >
      <p className="screen-eyebrow">{screen.eyebrow}</p>
      <div className="field-stack">
        {rows.map((row) => (
          <DataPanel key={row.label} row={row} />
        ))}
      </div>
      <TimerSection minutes={20} />
      <HelpSection highlights={highlights.slice(1)} tone="warning" />
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      <div className="button-row">
        <Button variant="secondary" type="button" onClick={onBack}>
          Изменить
        </Button>
        <Button variant="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Создаем заявку' : screen.cta}
        </Button>
      </div>
    </form>
  );
}

function InvalidConfirmState({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="screen-stack">
      <p className="form-error">{message}</p>
      <Button variant="secondary" type="button" onClick={onBack}>
        Вернуться к форме
      </Button>
    </div>
  );
}

function CreatedOrderScreen({
  screen,
  order,
  mode,
  onHome,
  onDetail,
}: {
  screen: MiniAppScreen;
  order: OrderDto | null;
  mode: 'buy' | 'sell';
  onHome: () => void;
  onDetail: () => void;
}) {
  if (!order) {
    return (
      <div className="screen-stack">
        <p className="screen-eyebrow">Заявка не выбрана.</p>
        <Button variant="secondary" type="button" onClick={onHome}>
          На главный
        </Button>
      </div>
    );
  }

  const model = createMiniAppOrderDetailViewModel(order);

  return (
    <div className="screen-stack">
      <p className="screen-eyebrow">{screen.eyebrow}</p>
      <div className="success-panel">
        <CheckCircle2 size={22} />
        <strong>{screen.title}</strong>
      </div>
      <PaymentIdSection publicId={order.publicId} />
      {mode === 'sell' && order.depositAddress ? (
        <QrCodePanel address={order.depositAddress} />
      ) : (
        <div className="qr-panel text-panel">
          <Building2 size={22} />
          <span>Приходите в офис с RUB. USDT отправляется на ваш кошелек после оплаты.</span>
        </div>
      )}
      <div className="field-stack">
        <DataPanel row={{ label: model.directionLabel, value: model.primaryAmountLabel, tone: 'mono' }} />
        {model.rows.filter((row) => !isPromotedDetailRow(row, model)).map((row) => (
          <DataPanel key={row.label} row={row} />
        ))}
      </div>
      <HelpSection highlights={screen.highlights} tone={mode === 'sell' ? 'warning' : 'accent'} />
      <div className="button-row">
        <Button variant="secondary" type="button" onClick={onDetail}>
          Детали
        </Button>
        <Button variant="primary" type="button" onClick={onHome}>
          {screen.cta}
        </Button>
      </div>
    </div>
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
        <Button variant="secondary" type="button" onClick={onHome}>
          На главный
        </Button>
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

      <PaymentIdSection publicId={model.publicId} />

      <DataPanel row={{
        label: model.directionLabel,
        value: model.primaryAmountLabel,
        tone: 'mono',
      }} />

      {model.qrValue ? (
        <QrCodePanel address={model.qrValue} />
      ) : (
        <div className="qr-panel text-panel">
          <Info size={22} />
          <span>USDT будет отправлен на кошелек клиента после оплаты в офисе.</span>
        </div>
      )}

      {model.rows.filter((row) => !isPromotedDetailRow(row, model)).map((row) => (
        <DataPanel key={row.label} row={row} />
      ))}

      <Button variant="secondary" type="button" onClick={onHome}>
        На главный
      </Button>
    </div>
  );
}

function HistoryScreen({
  activeOrders,
  onOpenOrder,
}: {
  activeOrders: OrderDto[];
  onOpenOrder: (publicId: string) => void;
}) {
  return (
    <div className="screen-stack">
      <p className="screen-eyebrow">Закрытые заявки появятся после завершения обменов.</p>
      <section className="section-block">
        <h3>Текущие заявки</h3>
        {activeOrders.length > 0 ? (
          activeOrders.map((order) => {
            const card = createMiniAppHomeViewModel({
              rates: miniAppMockFixtures.rates,
              activeOrders: [order],
            }).activeOrders[0];
            return (
              <button
                className="order-card"
                type="button"
                key={card.publicId}
                onClick={() => onOpenOrder(card.publicId)}
              >
                <span className="order-card-title">{card.title}</span>
                <span className={`status-badge tone-${card.statusTone}`}>{card.statusLabel}</span>
                <span className="order-card-meta">ID: {card.publicId}</span>
                <span className="order-card-meta">{card.createdAtLabel}</span>
                <ChevronRight className="order-card-chevron" size={18} />
              </button>
            );
          })
        ) : (
          <div className="empty-panel">Заявок пока нет</div>
        )}
      </section>
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
  const profileRows: DisplayRow[] = [
    { label: 'ФИО', value: model.customerNameLabel },
    { label: 'Telegram ID', value: model.telegramIdLabel, tone: 'mono', copyable: true },
    { label: 'Username', value: model.usernameLabel, tone: 'mono' },
    { label: 'Всего обменов', value: model.totalOrdersLabel, tone: 'mono' },
    { label: 'Активные заявки', value: model.activeOrdersLabel, tone: 'mono' },
  ];

  return (
    <div className="screen-stack">
      <div className="profile-card">
        <div className="avatar">
          <User size={30} />
        </div>
        <div>
          <span className="verified-line">
            <ShieldCheck size={16} />
            Telegram-профиль
          </span>
          <strong>{model.customerNameLabel}</strong>
        </div>
      </div>

      <div className="field-stack">
        {profileRows.map((row) => (
          <DataPanel key={row.label} row={row} />
        ))}
      </div>

      <div className="menu-list">
        {screen.rows.map((row) => (
          <button className="menu-row" type="button" key={row.label}>
            <Wallet size={18} />
            <span>{row.label}</span>
            <span>{row.value}</span>
          </button>
        ))}
        <button className="menu-row danger" type="button">
          <LogOut size={18} />
          <span>Выйти из Mini App</span>
        </button>
      </div>
    </div>
  );
}

function NameFields<T extends BuyOrderFormState | SellOrderFormState>({
  form,
  onChange,
}: {
  form: T;
  onChange: (form: T) => void;
}) {
  return (
    <div className="name-grid" aria-label="ФИО">
      <FormField
        label="Фамилия"
        value={form.customerLastName}
        inputMode="text"
        autoComplete="family-name"
        onChange={(customerLastName) => onChange({ ...form, customerLastName })}
      />
      <FormField
        label="Имя"
        value={form.customerFirstName}
        inputMode="text"
        autoComplete="given-name"
        onChange={(customerFirstName) => onChange({ ...form, customerFirstName })}
      />
      <FormField
        label="Отчество"
        value={form.customerMiddleName}
        inputMode="text"
        autoComplete="additional-name"
        onChange={(customerMiddleName) => onChange({ ...form, customerMiddleName })}
      />
    </div>
  );
}

function FormField({
  label,
  value,
  inputMode,
  placeholder,
  autoComplete,
  onChange,
}: {
  label: string;
  value: string;
  inputMode: 'decimal' | 'text';
  placeholder?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <input
        className="ui-input"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete ?? 'off'}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function Button({
  variant,
  type,
  disabled,
  onClick,
  children,
}: {
  variant: 'primary' | 'secondary' | 'tertiary';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (variant === 'primary') {
    return (
      <button className="ui-button primary" type={type ?? 'button'} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <button className="ui-button secondary" type={type ?? 'button'} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    );
  }

  return (
    <button className="ui-button tertiary" type={type ?? 'button'} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function TimerSection({ minutes }: { minutes: number }) {
  return (
    <section className="timer-section" aria-label="Фиксация курса">
      <Clock3 size={18} />
      <div>
        <span>Курс фиксируется</span>
        <strong>{minutes} минут</strong>
      </div>
    </section>
  );
}

function PaymentIdSection({ publicId }: { publicId: string }) {
  return (
    <section className="payment-id-section" aria-label="ID заявки">
      <div>
        <span>ID заявки</span>
        <strong>{publicId}</strong>
      </div>
      <CopyButton value={publicId} label="ID заявки" />
    </section>
  );
}

function HelpSection({
  highlights,
  tone,
}: {
  highlights: readonly string[];
  tone: 'accent' | 'warning';
}) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <div className="help-section">
      {highlights.map((highlight, index) => (
        <div className={`help-section-item ${tone}`} key={highlight}>
          {tone === 'accent' ? (
            <Info size={18} />
          ) : index === 0 ? (
            <Clock3 size={18} />
          ) : (
            <TriangleAlert size={18} />
          )}
          <span>{highlight}</span>
        </div>
      ))}
    </div>
  );
}

function QrCodePanel({ address }: { address: string }) {
  return (
    <div className="qr-panel">
      <span>Отправьте USDT на адрес ниже</span>
      <QrCodeImage value={address} />
      <AddressLine label="Адрес для перевода (TRC-20)" value={address} />
    </div>
  );
}

function QrCodeImage({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);

    createQrCodeDataUrl(value)
      .then((nextDataUrl) => {
        if (!cancelled) {
          setDataUrl(nextDataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (failed) {
    return <div className="qr-fallback">QR недоступен</div>;
  }

  if (!dataUrl) {
    return <div className="qr-fallback">QR</div>;
  }

  return <img className="qr-image" src={dataUrl} alt="QR код адреса для перевода USDT" />;
}

function AddressLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="address-line">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <CopyButton value={value} label={label} />
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
        const active = isNavItemActive(item.id, activeScreenId);

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

function isNavItemActive(itemId: MiniAppScreenId, activeScreenId: MiniAppScreenId): boolean {
  if (itemId === activeScreenId) {
    return true;
  }

  if (
    itemId === 'home' &&
    [
      'about',
      'buy',
      'buy-confirm',
      'buy-created',
      'sell',
      'sell-confirm',
      'sell-created',
    ].includes(activeScreenId)
  ) {
    return true;
  }

  return itemId === 'history' && activeScreenId === 'order-detail';
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

function DataPanel({ row }: { row: DisplayRow }) {
  const shouldCopy = row.copyable ?? false;

  return (
    <div className="data-panel">
      <span>{row.label}</span>
      <strong className={`tone-${row.tone ?? 'default'}`}>{row.value}</strong>
      {shouldCopy && <CopyButton value={row.value} label={row.label} />}
    </div>
  );
}

function isPromotedDetailRow(
  row: DisplayRow,
  model: MiniAppOrderDetailViewModel,
): boolean {
  return row.value === model.publicId || row.value === model.primaryAmountLabel;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const resetCopiedRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (resetCopiedRef.current !== undefined) {
        window.clearTimeout(resetCopiedRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      setCopied(false);
      return;
    }

    setCopied(true);

    if (resetCopiedRef.current !== undefined) {
      window.clearTimeout(resetCopiedRef.current);
    }

    resetCopiedRef.current = window.setTimeout(() => {
      setCopied(false);
      resetCopiedRef.current = undefined;
    }, 1400);
  }

  return (
    <button
      className={copied ? 'ui-copy-button copied' : 'ui-copy-button'}
      type="button"
      aria-label={copied ? `${label} скопирован` : `Скопировать ${label}`}
      onClick={() => {
        void handleCopy();
      }}
    >
      {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
      <span className="copy-feedback" aria-live="polite">
        {copied ? 'Скопировано' : ''}
      </span>
    </button>
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

function formatCustomer(customer: MiniAppCustomerInput): string {
  return `${customer.lastName} ${customer.firstName} ${customer.middleName}`;
}

function formatDecimal(value: string, fractionDigits: number): string {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const formattedInteger = formatInteger(integerPart);
  const normalizedFraction = fractionalPart.padEnd(fractionDigits, '0').slice(0, fractionDigits);

  return fractionDigits > 0
    ? `${formattedInteger}.${normalizedFraction}`
    : formattedInteger;
}

function formatRub(value: string): string {
  const [integerPart] = value.split('.');
  return formatInteger(integerPart);
}

function formatInteger(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
