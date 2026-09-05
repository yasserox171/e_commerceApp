/**
 * Formatting helpers written without `Intl`.
 *
 * Hermes ships a trimmed ICU and its `ar-MA` currency and relative-time output
 * varies by platform and OS version. Prices and dates appear on every screen,
 * so they are formatted explicitly here and look identical on every device.
 */

const THIN_SPACE = ' ';
const CURRENCY_SUFFIX = 'د.م.';

/** `1234.5` → `1 234,50 د.م.` — Moroccan convention, Western digits. */
export function formatMAD(value: number, options: { compact?: boolean; withSuffix?: boolean } = {}): string {
  const { compact = false, withSuffix = true } = options;
  const safe = Number.isFinite(value) ? value : 0;

  if (compact && safe >= 1000) {
    const thousands = safe / 1000;
    const rendered = thousands >= 100 ? Math.round(thousands).toString() : thousands.toFixed(1).replace('.', ',');
    return withSuffix ? `${rendered}${THIN_SPACE}ألف ${CURRENCY_SUFFIX}` : `${rendered} ألف`;
  }

  const [whole = '0', fraction = '00'] = Math.abs(safe).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  const sign = safe < 0 ? '-' : '';
  const body = `${sign}${grouped},${fraction}`;

  return withSuffix ? `${body}${THIN_SPACE}${CURRENCY_SUFFIX}` : body;
}

/** Price per unit, e.g. `45,00 د.م. / قطعة`. */
export function formatUnitPrice(value: number, unit: string | null): string {
  const price = formatMAD(value);
  return unit ? `${price} / ${unit}` : price;
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو',
  'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر',
] as const;

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-03-14T…` → `14 مارس 2026`. Moroccan month names, not Levantine. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return `${date.getDate()} ${ARABIC_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `14 مارس 2026 · 14:05` */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} · ${hours}:${minutes}`;
}

/** `منذ 3 أيام` — Arabic dual and plural forms, which a naive `n + ' أيام'` gets wrong. */
export function formatRelative(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'الآن';

  const units: Array<{ limit: number; divisor: number; forms: [string, string, string, string] }> = [
    { limit: 3600, divisor: 60, forms: ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'] },
    { limit: 86_400, divisor: 3600, forms: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'] },
    { limit: 2_592_000, divisor: 86_400, forms: ['يوم', 'يومين', 'أيام', 'يوماً'] },
    { limit: 31_536_000, divisor: 2_592_000, forms: ['شهر', 'شهرين', 'أشهر', 'شهراً'] },
    { limit: Number.POSITIVE_INFINITY, divisor: 31_536_000, forms: ['سنة', 'سنتين', 'سنوات', 'سنة'] },
  ];

  for (const unit of units) {
    if (seconds >= unit.limit) continue;
    const amount = Math.floor(seconds / unit.divisor);
    return `منذ ${pluralAr(amount, unit.forms)}`;
  }
  return formatDate(date);
}

/**
 * Arabic has singular, dual, a plural for 3–10, and a different form for 11+.
 * `forms` is [singular, dual, few, many].
 */
export function pluralAr(count: number, forms: [string, string, string, string]): string {
  if (count === 1) return forms[0];
  if (count === 2) return forms[1];
  if (count >= 3 && count <= 10) return `${count} ${forms[2]}`;
  return `${count} ${forms[3]}`;
}

export function formatQuantity(count: number): string {
  return pluralAr(count, ['قطعة واحدة', 'قطعتان', 'قطع', 'قطعة']);
}

export function formatItemCount(count: number): string {
  return pluralAr(count, ['منتج واحد', 'منتجان', 'منتجات', 'منتجاً']);
}

/** Trims to a whole word and appends an ellipsis, never mid-letter. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
