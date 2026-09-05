import type { BadgeTone } from '../components/Badge.js';
import type { OrderStatus, PaymentMethod } from '../types.js';

export interface OrderStatusPresentation {
  label: string;
  tone: BadgeTone;
  /** One line explaining what happens next, shown on the tracking screen. */
  description: string;
}

/**
 * Single source of truth for how an order status is worded in both apps —
 * so the badge on the list and the headline on the detail screen never drift.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, OrderStatusPresentation> = {
  pending_payment: {
    label: 'في انتظار الدفع',
    tone: 'warning',
    description: 'أكمل الدفع بالبطاقة لتأكيد الطلب.',
  },
  awaiting_approval: {
    label: 'في انتظار الموافقة',
    tone: 'warning',
    description: 'فريق المبيعات يراجع طلبك وسيتواصل معك قريباً.',
  },
  processing: {
    label: 'قيد المعالجة',
    tone: 'primary',
    description: 'تم استلام الدفع، ونحن نجهّز طلبك للشحن.',
  },
  shipped: {
    label: 'تم الشحن',
    tone: 'accent',
    description: 'طلبك في الطريق إليك.',
  },
  delivered: {
    label: 'تم التسليم',
    tone: 'success',
    description: 'تم تسليم الطلب. شكراً لثقتك.',
  },
  cancelled: {
    label: 'ملغى',
    tone: 'danger',
    description: 'تم إلغاء هذا الطلب.',
  },
  refunded: {
    label: 'مسترجع',
    tone: 'neutral',
    description: 'تم استرجاع المبلغ إلى بطاقتك.',
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'بطاقة بنكية (دفع مسبق)',
  bank_transfer: 'تحويل بنكي',
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status]?.label ?? status;
}

export function orderStatusTone(status: OrderStatus): BadgeTone {
  return ORDER_STATUS_LABELS[status]?.tone ?? 'neutral';
}
