import type { AddressPoolCsvRow } from '../wallet/addressPoolCsv.js';
import type { OrderDto } from '../orders/orderReadService.js';
import {
  addressPoolImportResponseSchema,
  adminSessionResponseSchema,
  orderResponseSchema,
  ordersResponseSchema,
  validateApiResponse,
} from '../api/responseSchemas.js';

export type AdminAppFetch = typeof fetch;

export interface AdminSessionDto {
  token: string;
  admin: {
    id: string;
    username: string;
    role: 'manager' | 'owner';
  };
}

export interface AdminAppApi {
  login(input: {
    username: string;
    password: string;
  }): Promise<AdminSessionDto>;
  listActiveOrders(input: {
    token: string;
    limit?: number;
  }): Promise<OrderDto[]>;
  listHistoryOrders(input: {
    token: string;
    limit?: number;
  }): Promise<OrderDto[]>;
  getOrder(input: {
    token: string;
    publicId: string;
  }): Promise<OrderDto>;
  updateOrderStatus(input: {
    token: string;
    publicId: string;
    status: OrderDto['status'];
    comment?: string;
  }): Promise<OrderDto>;
  recordManualCryptoPayout(input: {
    token: string;
    publicId: string;
    txId: string;
    comment?: string;
  }): Promise<OrderDto>;
  importAddressPool(input: {
    token: string;
    rows: AddressPoolCsvRow[];
  }): Promise<{ count: number }>;
}

export function createAdminAppApiClient(input: {
  baseUrl: string;
  fetch?: AdminAppFetch;
}): AdminAppApi {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async login(credentials) {
      const response = await fetchImpl(`${baseUrl}/api/admin/session`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(credentials),
      });

      return parseJsonResponse(response, adminSessionResponseSchema);
    },

    async listActiveOrders({ token, limit = 20 }) {
      const search = new URLSearchParams({ limit: String(limit) });
      const response = await fetchImpl(
        `${baseUrl}/api/admin/orders/active?${search.toString()}`,
        {
          method: 'GET',
          headers: adminHeaders(token),
        },
      );
      const payload = await parseJsonResponse(response, ordersResponseSchema);

      return payload.orders;
    },

    async listHistoryOrders({ token, limit = 20 }) {
      const search = new URLSearchParams({ limit: String(limit) });
      const response = await fetchImpl(
        `${baseUrl}/api/admin/orders/history?${search.toString()}`,
        {
          method: 'GET',
          headers: adminHeaders(token),
        },
      );
      const payload = await parseJsonResponse(response, ordersResponseSchema);

      return payload.orders;
    },

    async getOrder({ token, publicId }) {
      const response = await fetchImpl(
        `${baseUrl}/api/admin/orders/${encodeURIComponent(publicId)}`,
        {
          method: 'GET',
          headers: adminHeaders(token),
        },
      );
      const payload = await parseJsonResponse(response, orderResponseSchema);

      return payload.order;
    },

    async updateOrderStatus({ token, publicId, status, comment }) {
      const response = await fetchImpl(
        `${baseUrl}/api/admin/orders/${encodeURIComponent(publicId)}/status`,
        {
          method: 'POST',
          headers: adminHeaders(token),
          body: JSON.stringify({
            status,
            ...(comment?.trim() ? { comment: comment.trim() } : {}),
          }),
        },
      );
      const payload = await parseJsonResponse(response, orderResponseSchema);

      return payload.order;
    },

    async recordManualCryptoPayout({ token, publicId, txId, comment }) {
      const response = await fetchImpl(
        `${baseUrl}/api/admin/orders/${encodeURIComponent(publicId)}/manual-crypto-payout`,
        {
          method: 'POST',
          headers: adminHeaders(token),
          body: JSON.stringify({
            txId: txId.trim(),
            ...(comment?.trim() ? { comment: comment.trim() } : {}),
          }),
        },
      );
      const payload = await parseJsonResponse(response, orderResponseSchema);

      return payload.order;
    },

    async importAddressPool({ token, rows }) {
      const response = await fetchImpl(`${baseUrl}/api/address-pool/import`, {
        method: 'POST',
        headers: adminHeaders(token),
        body: JSON.stringify({ rows }),
      });

      return parseJsonResponse(response, addressPoolImportResponseSchema);
    },
  };
}

export function parseAdminApiErrorMessage(payload: unknown): string {
  const error = typeof payload === 'object' && payload !== null
    ? (payload as { error?: unknown; message?: unknown; issues?: Array<{ message?: unknown }> })
    : {};
  const code = typeof error.error === 'string' ? error.error : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const firstIssue = Array.isArray(error.issues)
    ? error.issues.find((issue) => typeof issue.message === 'string')?.message
    : undefined;

  if (code === 'admin_auth_invalid' || code === 'admin_login_rate_limited') {
    return code === 'admin_login_rate_limited'
      ? 'Слишком много попыток входа. Подождите и попробуйте снова.'
      : 'Сессия администратора недействительна. Войдите заново.';
  }

  if (code === 'not_found') {
    return 'Заявка не найдена.';
  }

  if (message === 'manual crypto payout can only be recorded for BUY_USDT orders') {
    return 'Tx hash можно записать только для BUY-заявки.';
  }

  if (message === 'BUY_USDT completion requires manual crypto payout tx id') {
    return 'Перед закрытием BUY-заявки запишите tx hash исходящей выплаты.';
  }

  if (message === 'BUY_USDT orders cannot move to cash payout status') {
    return 'BUY-заявка не может перейти в выплату RUB. Для BUY менеджер отправляет USDT на кошелек клиента.';
  }

  if (message === 'SELL_USDT orders cannot move to crypto payout status') {
    return 'SELL-заявка не может перейти в выплату USDT. Для SELL менеджер выплачивает RUB в офисе.';
  }

  if (message === 'terminal orders cannot be changed by manager status update') {
    return 'Закрытую заявку из истории нельзя изменить через смену статуса.';
  }

  if (message === 'order is not open for manual crypto payout') {
    return 'Заявка сейчас не готова к записи исходящей выплаты.';
  }

  if (firstIssue) {
    return String(firstIssue);
  }

  return message || 'Не удалось выполнить действие.';
}

async function parseJsonResponse<T>(
  response: Response,
  schema: Parameters<typeof validateApiResponse<T>>[0],
): Promise<T> {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(parseAdminApiErrorMessage(payload));
  }

  return validateApiResponse(schema, payload);
}

function adminHeaders(token: string): HeadersInit {
  return {
    ...jsonHeaders(),
    authorization: `Bearer ${token}`,
  };
}

function jsonHeaders(): HeadersInit {
  return {
    'content-type': 'application/json',
  };
}
