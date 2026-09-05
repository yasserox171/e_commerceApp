import type {
  AuthResponse,
  AuthUser,
  CartView,
  Channel,
  CheckoutSession,
  OrderDetail,
  OrderSummary,
  Paginated,
  PaymentMethodsInfo,
  ProductDetail,
  ProductFacets,
  ProductQueryParams,
  ProductSummary,
  ShippingAddress,
} from '../types';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  channel: Channel;
  /** Returns the current bearer token, or null when signed out. */
  getToken: () => string | null;
  /** Called when the server rejects the token, so the app can sign out. */
  onUnauthorized?: () => void;
  timeoutMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Skip the Authorization header even when a token exists. */
  anonymous?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiClient {
  readonly channel: Channel;
  #baseUrl: string;
  #getToken: () => string | null;
  #onUnauthorized: (() => void) | undefined;
  #timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.channel = options.channel;
    this.#getToken = options.getToken;
    this.#onUnauthorized = options.onUnauthorized;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.#baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const token = options.anonymous ? null : this.#getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    // React Native's fetch has no built-in timeout; without this a request on a
    // dead connection hangs until the OS gives up, and the spinner never stops.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError';
      throw new ApiRequestError(
        0,
        aborted ? 'timeout' : 'network_error',
        aborted
          ? 'انتهت مهلة الاتصال بالخادم'
          : 'تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const envelope = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
      if (response.status === 401) this.#onUnauthorized?.();
      throw new ApiRequestError(
        response.status,
        envelope?.code ?? 'http_error',
        envelope?.message ?? `Request failed with status ${response.status}`,
        envelope?.details,
      );
    }

    return payload as T;
  }

  // --- catalogue ------------------------------------------------------------

  listProducts(params: Omit<ProductQueryParams, 'channel'> = {}, signal?: AbortSignal) {
    return this.request<Paginated<ProductSummary>>('/products', {
      query: { ...params, channel: this.channel },
      anonymous: true,
      ...(signal ? { signal } : {}),
    });
  }

  getProduct(id: string, quantity?: number, signal?: AbortSignal) {
    return this.request<ProductDetail>(`/products/${encodeURIComponent(id)}`, {
      query: { channel: this.channel, quantity },
      anonymous: true,
      ...(signal ? { signal } : {}),
    });
  }

  getFacets(search?: string, signal?: AbortSignal) {
    return this.request<ProductFacets>('/products/facets', {
      query: { channel: this.channel, q: search },
      anonymous: true,
      ...(signal ? { signal } : {}),
    });
  }

  // --- auth -----------------------------------------------------------------

  register(input: {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    businessName?: string;
    iceNumber?: string;
  }) {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { ...input, accountType: this.channel },
      anonymous: true,
    });
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password, accountType: this.channel },
      anonymous: true,
    });
  }

  me() {
    return this.request<{ user: AuthUser }>('/auth/me');
  }

  updateProfile(input: { fullName?: string; phone?: string; businessName?: string; iceNumber?: string }) {
    return this.request<{ user: AuthUser }>('/auth/me', { method: 'PATCH', body: input });
  }

  // --- cart -----------------------------------------------------------------

  getCart() {
    return this.request<CartView>('/cart');
  }

  addToCart(productId: string, quantity: number) {
    return this.request<CartView>('/cart/items', { method: 'POST', body: { productId, quantity } });
  }

  updateCartItem(itemId: string, quantity: number) {
    return this.request<CartView>(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } });
  }

  removeCartItem(itemId: string) {
    return this.request<CartView>(`/cart/items/${itemId}`, { method: 'DELETE' });
  }

  clearCart() {
    return this.request<CartView>('/cart', { method: 'DELETE' });
  }

  // --- orders ---------------------------------------------------------------

  createOrder(input: {
    shippingAddress: ShippingAddress;
    customerNote?: string;
    paymentMethod?: 'card' | 'bank_transfer';
  }) {
    return this.request<OrderDetail>('/orders', { method: 'POST', body: input });
  }

  listOrders(page = 1, pageSize = 20) {
    return this.request<Paginated<OrderSummary>>('/orders', { query: { page, pageSize } });
  }

  getOrder(id: string) {
    return this.request<OrderDetail>(`/orders/${id}`);
  }

  cancelOrder(id: string) {
    return this.request<OrderDetail>(`/orders/${id}/cancel`, { method: 'POST' });
  }

  // --- payments -------------------------------------------------------------

  getPaymentMethods() {
    return this.request<PaymentMethodsInfo>('/payments/methods', { anonymous: true });
  }

  startCheckout(orderId: string) {
    return this.request<CheckoutSession>('/payments/checkout', { method: 'POST', body: { orderId } });
  }

  health() {
    return this.request<{ status: string; database: { ok: boolean } }>('/health', { anonymous: true });
  }
}
