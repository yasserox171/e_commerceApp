/**
 * Payment gateway abstraction.
 *
 * Every gateway this API supports is prepaid-card-only by construction: a
 * provider hands back an instruction that sends the shopper to a hosted card
 * page, and the order is only fulfilled once the gateway calls back to confirm
 * the money moved. There is no code path that marks an order payable on
 * delivery, and `commerce.payment_method` has no `cod` value to store one in.
 */

export interface CheckoutCustomer {
  email: string;
  fullName: string;
  phone: string | null;
}

export interface CheckoutAddress {
  line1: string;
  line2?: string | null;
  city: string;
  postalCode?: string | null;
  countryCode: string;
}

export interface CheckoutRequest {
  orderId: string;
  /** Merchant order id shown to the shopper and sent to the gateway. */
  reference: string;
  amount: number;
  currency: string;
  customer: CheckoutCustomer;
  shippingAddress: CheckoutAddress | null;
  locale: 'ar' | 'fr' | 'en';
}

/**
 * How the app should hand control to the gateway.
 *  - `redirect`  : open this URL in a WebView / browser.
 *  - `form_post` : render an auto-submitting form (CMI's 3D_PAY_HOSTING flow
 *                  requires a POST, which a plain redirect cannot express).
 */
export type CheckoutInstruction =
  | { kind: 'redirect'; url: string }
  | { kind: 'form_post'; url: string; fields: Record<string, string> };

export interface CheckoutSession {
  provider: string;
  providerRef: string | null;
  instruction: CheckoutInstruction;
}

export type SettlementStatus = 'paid' | 'authorized' | 'failed' | 'cancelled';

export interface CallbackResult {
  /** Merchant order reference the gateway echoed back. */
  reference: string;
  providerRef: string | null;
  status: SettlementStatus;
  /** Gateway's own status string, kept for support tickets. */
  rawStatus: string;
  amount: number | null;
  failureReason: string | null;
  raw: Record<string, unknown>;
}

export interface CallbackContext {
  body: Record<string, unknown>;
  rawBody?: Buffer | undefined;
  headers: Record<string, string | undefined>;
}

export interface PaymentProvider {
  readonly id: string;
  readonly displayName: string;
  /** False when the gateway's credentials are missing from the environment. */
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Validates the gateway's callback signature and normalises the outcome.
   * Must throw if the payload cannot be authenticated — a forged callback is
   * the one way an unpaid order could otherwise be marked paid.
   */
  verifyCallback(context: CallbackContext): Promise<CallbackResult>;
}
