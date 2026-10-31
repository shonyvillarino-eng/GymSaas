import type { SupportedLanguage } from '../i18n';

/**
 * Resolves the locale used for Intl formatting.
 *
 * Priority: the gym/user locale when it is a valid BCP-47 tag, otherwise the
 * language default. This keeps dates and numbers consistent with the selected
 * interface language without ever converting stored amounts.
 */
export function resolveLocale(
  language: SupportedLanguage | string | null | undefined,
  locale?: string | null,
): string {
  if (locale && /^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) return locale;
  switch ((language ?? 'es').slice(0, 2)) {
    case 'en':
      return 'en-US';
    case 'pt':
      return 'pt-BR';
    default:
      return 'es-ES';
  }
}

/** Parses a date-only value as a calendar date, not as UTC midnight. */
function asDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!value) return '—';
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : String(value);
}

export function formatDateTime(value: string | Date | null | undefined, locale: string): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatNumber(value: number | string | null | undefined, locale: string): string {
  if (value === null || value === undefined || value === '') return '0';
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) ? new Intl.NumberFormat(locale).format(number) : String(value);
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency: string,
  locale: string,
): string {
  const number = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(number)) return String(value ?? '');
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(number);
  } catch {
    return `${number.toFixed(2)} ${currency}`;
  }
}

/** Locale-aware "5 minutes ago" using Intl.RelativeTimeFormat. */
export function formatRelativeTime(value: string, locale: string, now = Date.now()): string {
  const date = asDate(value);
  if (!date) return '';
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = date.getTime() - now;
  const absMinutes = Math.abs(diffMs) / 60_000;
  if (absMinutes < 1) return formatter.format(0, 'minute');
  if (absMinutes < 60) return formatter.format(Math.round(diffMs / 60_000), 'minute');
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(diffMs / 86_400_000);
  if (Math.abs(days) < 7) return formatter.format(days, 'day');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
