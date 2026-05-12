export type MiniAppScreenId =
  | 'home'
  | 'buy'
  | 'sell'
  | 'order-detail'
  | 'profile';

export type MiniAppTone = 'default' | 'accent' | 'cyan' | 'warning' | 'mono';

export interface MiniAppRow {
  label: string;
  value: string;
  tone?: MiniAppTone;
}

export interface MiniAppScreen {
  id: MiniAppScreenId;
  title: string;
  eyebrow?: string;
  rows: MiniAppRow[];
  highlights: string[];
  cta?: string;
}

export const selectedMiniAppDirection = 'Dark Trust Terminal' as const;

export const miniAppBrand = {
  name: 'OBMEN',
  tagline: 'Telegram Mini App для офлайн-обмена USDT/RUB',
  promise: 'Быстро. Безопасно. Офис рядом.',
  palette: {
    background: '#080D0E',
    surface: '#121416',
    panel: '#1A1E20',
    accent: '#33BC65',
    cyan: '#12DCEF',
    mint: '#DFFFD9',
    warning: '#F5A623',
    text: '#F2F2F2',
  },
} as const;

export const miniAppScreens: MiniAppScreen[] = [
  {
    id: 'home',
    title: 'Моментальный обмен USDT',
    eyebrow: 'Главная',
    rows: [
      { label: 'Купить', value: '76.85 ₽', tone: 'accent' },
      { label: 'Продать', value: '76.25 ₽', tone: 'cyan' },
      { label: 'Активная заявка', value: 'Продажа 5 000.00 USDT' },
      { label: 'ID', value: 'E00001', tone: 'mono' },
      { label: 'Дата', value: '11 мая 2026, 14:05', tone: 'mono' },
    ],
    highlights: ['Офлайн обмен в офисе', 'Безопасные расчеты'],
  },
  {
    id: 'buy',
    title: 'Купить USDT',
    eyebrow: 'Вы отдаете рубли, мы отправляем USDT на ваш TRC-20 кошелек.',
    rows: [
      { label: 'Сумма в рублях', value: '200 000 ₽', tone: 'mono' },
      { label: 'Вы получите (USDT)', value: '2 602.40 USDT', tone: 'accent' },
      { label: 'Курс', value: '76.85 ₽', tone: 'mono' },
      { label: 'ФИО', value: 'Иван И.' },
      {
        label: 'Кошелек для получения (TRC-20)',
        value: 'TXxx...9Qm',
        tone: 'mono',
      },
    ],
    highlights: [
      'USDT будет отправлен на ваш TRC-20 кошелек после оплаты в офисе.',
    ],
    cta: 'Создать заявку',
  },
  {
    id: 'sell',
    title: 'Продать USDT',
    eyebrow: 'Вы отправляете USDT, мы выдаем рубли в офисе.',
    rows: [
      { label: 'Сумма в USDT', value: '5 000 USDT', tone: 'mono' },
      { label: 'Вы получите (рубли)', value: '381 250 ₽', tone: 'accent' },
      { label: 'Курс', value: '76.25 ₽', tone: 'mono' },
      { label: 'Сеть', value: 'Tron (TRC-20)' },
    ],
    highlights: [
      'Курс фиксируется на 20 минут',
      'Переведите USDT одной транзакцией',
    ],
    cta: 'Создать заявку',
  },
  {
    id: 'order-detail',
    title: 'Детали заявки',
    eyebrow: 'Статус: В ожидании',
    rows: [
      { label: 'ID заявки', value: 'E00001', tone: 'mono' },
      {
        label: 'Адрес для перевода (TRC-20)',
        value: 'TXxx...9Qm',
        tone: 'mono',
      },
      { label: 'Сеть', value: 'Tron (TRC-20)' },
      { label: 'Дата создания', value: '11 мая 2026, 14:05', tone: 'mono' },
    ],
    highlights: ['Отправьте USDT на адрес ниже', 'Только сеть Tron TRC-20'],
    cta: 'На главный',
  },
  {
    id: 'profile',
    title: 'Профиль',
    eyebrow: 'Верифицированный клиент',
    rows: [
      { label: 'Обменов', value: '24', tone: 'mono' },
      { label: 'Реферальный баланс', value: '0 USDT', tone: 'accent' },
      { label: 'Telegram ID', value: '••••••83', tone: 'mono' },
      { label: 'Контактная поддержка', value: 'Telegram' },
      { label: 'Правила и условия', value: 'Открыть' },
      { label: 'О приложении', value: 'OBMEN Mini App' },
    ],
    highlights: ['Профиль привязан к Telegram-пользователю'],
  },
];
