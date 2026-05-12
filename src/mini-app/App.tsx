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
import { useMemo, useState } from 'react';
import {
  miniAppBrand,
  miniAppScreens,
  type MiniAppRow,
  type MiniAppScreen,
  type MiniAppScreenId,
} from './miniAppContent.js';

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
  const activeScreen = useMemo(() => getScreen(activeScreenId), [activeScreenId]);

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
          {activeScreen.id === 'home' && (
            <HomeScreen onNavigate={setActiveScreenId} />
          )}
          {activeScreen.id === 'buy' && (
            <FlowScreen screen={activeScreen} variant="buy" />
          )}
          {activeScreen.id === 'sell' && (
            <FlowScreen
              screen={activeScreen}
              variant="sell"
              onCreate={() => setActiveScreenId('order-detail')}
            />
          )}
          {activeScreen.id === 'order-detail' && (
            <OrderDetailScreen screen={activeScreen} onHome={() => setActiveScreenId('home')} />
          )}
          {activeScreen.id === 'profile' && <ProfileScreen screen={activeScreen} />}
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

function HomeScreen({ onNavigate }: { onNavigate: (screen: MiniAppScreenId) => void }) {
  const home = getScreen('home');
  const buyRate = home.rows.find((row) => row.label === 'Купить');
  const sellRate = home.rows.find((row) => row.label === 'Продать');

  return (
    <div className="screen-stack home-screen">
      <div className="hero-block">
        <p className="mini-kicker">{miniAppBrand.tagline}</p>
        <h2>{home.title}</h2>
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
        <RateCell row={buyRate} />
        <RateCell row={sellRate} />
      </div>

      <section className="section-block" aria-labelledby="active-orders-title">
        <h3 id="active-orders-title">Активные заявки</h3>
        <button className="order-card" type="button" onClick={() => onNavigate('order-detail')}>
          <span className="order-card-title">Продажа 5 000.00 USDT</span>
          <span className="status-badge">В ожидании</span>
          <span className="order-card-meta">ID: E00001</span>
          <span className="order-card-meta">11 мая 2026, 14:05</span>
        </button>
      </section>
    </div>
  );
}

function FlowScreen({
  screen,
  variant,
  onCreate,
}: {
  screen: MiniAppScreen;
  variant: 'buy' | 'sell';
  onCreate?: () => void;
}) {
  return (
    <div className="screen-stack">
      <p className="screen-eyebrow">{screen.eyebrow}</p>

      <div className="field-stack">
        {screen.rows.map((row) => (
          <DataPanel key={row.label} row={row} />
        ))}
      </div>

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

      <button className="primary-button" type="button" onClick={onCreate}>
        {screen.cta}
      </button>
    </div>
  );
}

function OrderDetailScreen({
  screen,
  onHome,
}: {
  screen: MiniAppScreen;
  onHome: () => void;
}) {
  return (
    <div className="screen-stack">
      <div className="detail-status-row">
        <span>Статус</span>
        <span className="status-badge">{screen.eyebrow?.replace('Статус: ', '')}</span>
      </div>

      <DataPanel row={screen.rows[0]!} />

      <div className="qr-panel">
        <span>Отправьте USDT на адрес ниже</span>
        <div className="fake-qr" aria-label="QR код адреса для перевода">
          {Array.from({ length: 64 }, (_, index) => (
            <span key={index} className={index % 3 === 0 || index % 7 === 0 ? 'qr-dot on' : 'qr-dot'} />
          ))}
        </div>
      </div>

      {screen.rows.slice(1).map((row) => (
        <DataPanel key={row.label} row={row} withCopy={row.tone === 'mono'} />
      ))}

      <button className="secondary-button" type="button" onClick={onHome}>
        {screen.cta}
      </button>
    </div>
  );
}

function ProfileScreen({ screen }: { screen: MiniAppScreen }) {
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
          <strong>Обменов: 24</strong>
        </div>
      </div>

      <div className="field-stack">
        {screen.rows.slice(1, 3).map((row) => (
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

function DataPanel({ row, withCopy = false }: { row: MiniAppRow; withCopy?: boolean }) {
  return (
    <div className="data-panel">
      <span>{row.label}</span>
      <strong className={`tone-${row.tone ?? 'default'}`}>{row.value}</strong>
      {withCopy && (
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
