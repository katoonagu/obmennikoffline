export type MiniAppScreenId =
  | 'home'
  | 'about'
  | 'buy'
  | 'buy-confirm'
  | 'buy-created'
  | 'sell'
  | 'sell-confirm'
  | 'sell-created'
  | 'order-detail'
  | 'history'
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
    id: 'about',
    title: 'О нас',
    eyebrow: 'OBMEN работает с наличными расчетами в офисе.',
    rows: [
      { label: 'Контакты', value: 'Офис и график' },
      { label: 'Чат поддержки', value: 'Telegram' },
      { label: 'Реферальная система', value: 'Скоро' },
      { label: 'Политика конфиденциальности', value: 'Открыть' },
      { label: 'AML/KYC/KYT', value: 'Правила' },
    ],
    highlights: ['Поддержка менеджера после создания заявки'],
  },
  {
    id: 'buy',
    title: 'Купить USDT',
    eyebrow: 'Вы отдаете рубли, мы отправляем USDT на ваш TRC-20 кошелек.',
    rows: [],
    highlights: [
      'Введите свой TRC-20 кошелек полностью.',
      'USDT будет отправлен после оплаты в офисе.',
    ],
    cta: 'Продолжить',
  },
  {
    id: 'buy-confirm',
    title: 'Проверка покупки',
    eyebrow: 'Проверьте сумму, курс и кошелек перед созданием заявки.',
    rows: [],
    highlights: [
      'Курс фиксируется на 20 минут.',
      'USDT будет отправлен на указанный вами TRC-20 кошелек после оплаты в офисе.',
    ],
    cta: 'Создать заявку',
  },
  {
    id: 'buy-created',
    title: 'Заявка на покупку создана',
    eyebrow: 'Менеджер свяжется с вами и подготовит офисную часть сделки.',
    rows: [],
    highlights: [
      'Следуйте сообщениям бота и менеджера.',
      'Наличные принимаются после проверки в офисе.',
    ],
    cta: 'На главный',
  },
  {
    id: 'sell',
    title: 'Продать USDT',
    eyebrow: 'Вы отправляете USDT, мы выдаем рубли в офисе.',
    rows: [],
    highlights: [
      'Адрес для перевода появится только после создания заявки.',
      'Переводите USDT одной транзакцией в сети Tron (TRC-20).',
    ],
    cta: 'Продолжить',
  },
  {
    id: 'sell-confirm',
    title: 'Проверка продажи',
    eyebrow: 'Проверьте сумму и условия перед резервированием адреса.',
    rows: [],
    highlights: [
      'Курс фиксируется на 20 минут.',
      'Время реализации заявки 60 минут.',
      'Адрес будет закреплен за этой заявкой после создания.',
    ],
    cta: 'Создать заявку',
  },
  {
    id: 'sell-created',
    title: 'Заявка на продажу создана',
    eyebrow: 'Отправьте USDT на выданный TRC-20 адрес.',
    rows: [],
    highlights: [
      'Переведите USDT одной транзакцией в сети Tron (TRC-20).',
      'После входящего перевода менеджер продолжит офисную часть сделки.',
    ],
    cta: 'На главный',
  },
  {
    id: 'order-detail',
    title: 'Детали заявки',
    eyebrow: 'Текущий статус и платежные данные.',
    rows: [],
    highlights: ['Только сеть Tron (TRC-20)'],
    cta: 'На главный',
  },
  {
    id: 'history',
    title: 'История',
    eyebrow: 'Закрытые и завершенные заявки.',
    rows: [],
    highlights: ['История появится после завершения первых обменов'],
  },
  {
    id: 'profile',
    title: 'Профиль',
    eyebrow: 'Профиль привязан к Telegram-пользователю',
    rows: [
      { label: 'Контактная поддержка', value: 'Telegram' },
      { label: 'Правила и условия', value: 'Открыть' },
      { label: 'О приложении', value: 'OBMEN Mini App' },
    ],
    highlights: ['ФИО сохраняется после первой созданной заявки'],
  },
];
